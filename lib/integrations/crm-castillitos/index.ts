/**
 * lib/integrations/crm-castillitos/index.ts
 *
 * CRM Castillitos — integration facade for the Agentik operational layer.
 *
 * ─── ARCHITECTURAL POSITION ───────────────────────────────────────────────────
 * This module is the single import point for anything CRM-related in Castillitos.
 *
 * TWO layers exist:
 *
 *   LAYER 1 — Transport (connector):
 *     lib/connectors/adapters/castillitos-crm/
 *       client.ts    — SuiteCRM V8 OAuth2 REST client
 *       mappers.ts   — V8 raw → UnifiedCustomer / UnifiedQuote / UnifiedOpportunity
 *       index.ts     — CastillitosCrmAdapter (pulls, paginates, advances cursor)
 *       storage.ts   — Prisma upsert handlers (writes CRMQuote, CRMOpportunity, etc.)
 *
 *   LAYER 2 — Operational (intelligence):
 *     lib/operational-data/providers/crm-commercial-provider.ts
 *       CrmCommercialProvider — reads Prisma CRM tables → OperationalOrder, etc.
 *
 * ─── MODULES CONSUMED FROM CRM ────────────────────────────────────────────────
 *
 *   ✅ AOS_Quotes          → CRMQuote (Prisma) → OperationalOrder
 *   ✅ AOS_Opportunities   → CRMOpportunity (Prisma) → OperationalOpportunity
 *   ✅ Accounts            → CustomerProfile (Prisma) → OperationalCustomer
 *   ✅ Calls               → CRMActivity (Prisma) → OperationalSalesActivity
 *   ❌ AOS_Products_Quotes → NOT YET — Phase 2 (quote lines)
 *   ❌ ADM_SaldosBodega    → NOT NEEDED — SAG is canonical inventory source
 *
 * ─── QUOTE → ORDER MAPPING ────────────────────────────────────────────────────
 * In Castillitos' operational model, a CRM AOS_Quote IS the pre-ERP order.
 * It represents the sales rep's commitment before SAG PD is issued.
 *
 *   CRMQuote.status (Prisma enum) → OperationalOrder.status:
 *     DRAFT    → "draft"
 *     SENT     → "reserved"     (units should be soft-held)
 *     ACCEPTED → "confirmed"    (ready to send to SAG/ERP)
 *     REJECTED → "cancelled"
 *     EXPIRED  → "cancelled"
 *
 * ─── LINE ITEMS STATUS ────────────────────────────────────────────────────────
 * AOS_Products_Quotes (related module) is NOT yet fetched by the adapter.
 * OperationalOrder.lines will be [] until Phase 2 adds:
 *   - pullQuoteLines() to CastillitosCrmAdapter
 *   - CRMQuoteLine model to Prisma schema
 *
 * For now: rawCrmJson on CRMQuote may contain partial line data from V8 embeds.
 *
 * ─── DO NOT READ CRM DIRECTLY ─────────────────────────────────────────────────
 * Modules that need CRM data MUST use CrmCommercialProvider, not Prisma directly.
 * The only exceptions are:
 *   - lib/customer360/    (legacy, migration planned)
 *   - lib/sales/crm-alert-engine.ts (legacy, migration planned)
 *
 * Sprint: AGENTIK-CRM-INTEGRATION-AUDIT-AND-OPERATIONAL-UPGRADE-01
 */

// ─── Re-export transport types ─────────────────────────────────────────────────
// These are for the connector layer only. Business modules must not use them.
export type { CrmClientConfig, V8Record, V8Page } from "@/lib/connectors/adapters/castillitos-crm/client";
export { toV8DateFilter, flattenV8Record }         from "@/lib/connectors/adapters/castillitos-crm/client";
export { CastillitosCrmAdapter }                   from "@/lib/connectors/adapters/castillitos-crm/index";

// ─── CRM module names ─────────────────────────────────────────────────────────
// Canonical module name constants for castillitos. Use these instead of magic strings.

export const CRM_MODULE = {
  QUOTES:         "AOS_Quotes",
  OPPORTUNITIES:  "AOS_Opportunities",
  ACCOUNTS:       "Accounts",
  ACTIVITIES:     "Calls",
  // Phase 2:
  QUOTE_LINES:    "AOS_Products_Quotes",   // NOT YET CONSUMED
} as const;

// ─── CRM status vocabulary ────────────────────────────────────────────────────
// Maps Castillitos CRM quote stages to Agentik operational order states.
// Confirmed with JR Consultores CRM field values (AOS_Quotes.stage).

export const CRM_QUOTE_STAGE_MAP = {
  Draft:              "draft",
  Negotiation:        "draft",
  Delivered:          "reserved",
  Confirmed:          "confirmed",
  "Closed Accepted":  "confirmed",
  Invoiced:           "sent_to_erp",   // invoice generated in ERP
  "Closed Lost":      "cancelled",
  "Closed Dead":      "cancelled",
} as const satisfies Record<string, "draft" | "reserved" | "confirmed" | "sent_to_erp" | "cancelled">;

// ─── Integration health ───────────────────────────────────────────────────────

export interface CrmIntegrationStatus {
  connected:              boolean;
  lastSyncAt:             string | null;
  quotesSynced:           number;
  opportunitiesSynced:    number;
  activitiesSynced:       number;
  customersSynced:        number;
  /** Modules not yet consuming data from this integration */
  pendingModules:         string[];
}

/** Build a simple status summary from Prisma counts. Callers fetch counts. */
export function buildCrmIntegrationStatus(opts: {
  lastSyncAt:         string | null;
  quotesSynced:       number;
  opportunitiesSynced: number;
  activitiesSynced:   number;
  customersSynced:    number;
}): CrmIntegrationStatus {
  return {
    connected:             true,   // assumed if data is present
    lastSyncAt:            opts.lastSyncAt,
    quotesSynced:          opts.quotesSynced,
    opportunitiesSynced:   opts.opportunitiesSynced,
    activitiesSynced:      opts.activitiesSynced,
    customersSynced:       opts.customersSynced,
    pendingModules:        ["AOS_Products_Quotes"],
  };
}
