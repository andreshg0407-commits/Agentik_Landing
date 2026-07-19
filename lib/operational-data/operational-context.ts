/**
 * lib/operational-data/operational-context.ts
 *
 * CommercialOperationalContext — the unified commercial intelligence context.
 *
 * ─── WHAT THIS IS ────────────────────────────────────────────────────────────
 * This is the single object that Agentik's agents, UI modules, and intelligence
 * engines consume. It represents the full state of commercial operations for an
 * org at a point in time — regardless of where the data came from.
 *
 * Agents (David, Diego, Finanzas, Copilot) receive this context.
 * They do NOT receive SAG objects, CRM objects, or Shopify objects.
 * They receive: customers, orders, inventory, demand signals, events.
 *
 * ─── RELATIONSHIP TO MaletasOperationalContext ────────────────────────────────
 * MaletasOperationalContext is the SAG-specific legacy context used by the
 * existing maletas module. This context is the new multi-source replacement.
 *
 * Migration is INCREMENTAL:
 *   Phase 1: Both exist in parallel. New code uses CommercialOperationalContext.
 *   Phase 2: Engines are updated to consume CommercialOperationalContext.
 *   Phase 3: MaletasOperationalContext becomes an adapter for the legacy view.
 *
 * Sprint: AGENTIK-OPERATIONAL-DATA-LAYER-01
 */

import type {
  OperationalCustomer,
  OperationalOrder,
  OperationalSalesRep,
  OperationalOpportunity,
  OperationalSalesActivity,
  OperationalTask,
  OperationalDemandSignal,
  OperationalCommercialEvent,
} from "./operational-entities";
import type { OperationalInventoryItem } from "@/lib/operational-inventory/operational-inventory-types";
import type { OperationalReservation }   from "@/lib/operational-inventory/operational-reservation-types";
import type { OperationalSource }        from "./operational-source";

// ─── Context ──────────────────────────────────────────────────────────────────

/**
 * The full commercial operational context for one org.
 *
 * All fields are optional at the top level — sources provide what they have.
 * Engines and agents MUST handle missing data gracefully (partial context).
 *
 * Freshness: each section has its own syncedAt. The oldest syncedAt
 * determines overall context freshness.
 */
export interface CommercialOperationalContext {
  organizationId:    string;
  /** ISO timestamp when this context was assembled */
  assembledAt:       string;
  /** Which sources contributed data to this context */
  sources:           OperationalSource[];

  // ── Entities ───────────────────────────────────────────────────────────────

  inventory:         OperationalInventoryItem[];
  orders:            OperationalOrder[];
  customers:         OperationalCustomer[];
  salesReps:         OperationalSalesRep[];
  opportunities:     OperationalOpportunity[];
  activities:        OperationalSalesActivity[];
  tasks:             OperationalTask[];
  reservations:      OperationalReservation[];

  // ── Intelligence outputs ───────────────────────────────────────────────────

  /** Demand signals computed from all sources */
  demandSignals:     OperationalDemandSignal[];
  /** Recent commercial events from all sources */
  recentEvents:      OperationalCommercialEvent[];

  // ── Coverage state (from Sales Portfolio engine) ──────────────────────────

  coverage: {
    /** Total refs in active portfolios */
    totalRefs:         number;
    /** Refs below minimum qty */
    refsUnderPressure: number;
    /** Refs fully depleted */
    refsDepleted:      number;
    /** 0–100 aggregate coverage health */
    healthScore:       number;
  };

  // ── Freshness metadata ────────────────────────────────────────────────────

  freshness: {
    inventorySyncedAt?:    string;
    ordersSyncedAt?:       string;
    customersSyncedAt?:    string;
    opportunitiesSyncedAt?: string;
  };

  /** Non-critical warnings about data quality or missing sources */
  warnings:          string[];
}

// ─── Context builder ──────────────────────────────────────────────────────────

export interface CommercialContextBuilderInput {
  organizationId:    string;
  inventory?:        OperationalInventoryItem[];
  orders?:           OperationalOrder[];
  customers?:        OperationalCustomer[];
  salesReps?:        OperationalSalesRep[];
  opportunities?:    OperationalOpportunity[];
  activities?:       OperationalSalesActivity[];
  tasks?:            OperationalTask[];
  reservations?:     OperationalReservation[];
  demandSignals?:    OperationalDemandSignal[];
  recentEvents?:     OperationalCommercialEvent[];
  warnings?:         string[];
  /** Which sources provided data */
  sources?:          OperationalSource[];
}

/**
 * Assembles a CommercialOperationalContext from available inputs.
 * Missing sections default to empty arrays. Coverage is computed inline.
 */
export function buildCommercialOperationalContext(
  input: CommercialContextBuilderInput,
): CommercialOperationalContext {
  const inventory  = input.inventory  ?? [];
  const reservations = input.reservations ?? [];
  const warnings   = input.warnings   ?? [];

  // Compute coverage summary from inventory
  const refsUnderPressure = inventory.filter(i => i.portfoliosUnderPressure > 0).length;
  const refsDepleted      = inventory.filter(i => i.operationalAvailableQty === 0 && i.physicalQty > 0).length;
  const healthScore       = inventory.length > 0
    ? Math.round(((inventory.length - refsDepleted) / inventory.length) * 100)
    : 100;

  // Warn if reservations exist but inventory doesn't include reservation deductions
  if (reservations.filter(r => r.status === "active").length > 0 && inventory.length === 0) {
    warnings.push("Reservas activas presentes pero inventario no cargado — disponibilidad operacional puede no reflejar reservas");
  }

  return {
    organizationId: input.organizationId,
    assembledAt:    new Date().toISOString(),
    sources:        input.sources ?? ["agentik"],

    inventory,
    orders:         input.orders         ?? [],
    customers:      input.customers      ?? [],
    salesReps:      input.salesReps      ?? [],
    opportunities:  input.opportunities  ?? [],
    activities:     input.activities     ?? [],
    tasks:          input.tasks          ?? [],
    reservations,

    demandSignals:  input.demandSignals  ?? [],
    recentEvents:   input.recentEvents   ?? [],

    coverage: {
      totalRefs:         inventory.length,
      refsUnderPressure,
      refsDepleted,
      healthScore,
    },

    freshness: {},
    warnings,
  };
}

// ─── Empty context (for loading states) ──────────────────────────────────────

export function emptyCommercialContext(organizationId: string): CommercialOperationalContext {
  return buildCommercialOperationalContext({ organizationId, warnings: ["Contexto operacional no disponible"] });
}
