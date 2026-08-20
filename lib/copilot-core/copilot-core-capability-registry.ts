/**
 * lib/copilot-core/copilot-core-capability-registry.ts
 *
 * Copilot Core Foundation — Capability Registry
 * Sprint: COPILOT-CORE-FOUNDATION-01A-R1
 *
 * Declarative, typed, fail-closed capability catalog.
 * Phase 01A: only READ capabilities are enabled.
 *
 * ROLE ALIGNMENT: uses Prisma enum Role values only.
 * SCOPE RULES: seller-scoped actors cannot receive org-level summaries.
 *
 * Pure data. No Prisma, no fetch, no side effects.
 */

import type { CopilotCapability } from "./copilot-core-types";

// ── Commercial READ Capabilities ─────────────────────────────────────────────
//
// Per-capability scope documentation:
//
// commercial.customers.summary.read
//   Roles:      ORG_ADMIN, MANAGER, OPERATOR
//   Scopes:     organization, seller
//   sellerId:   Required when actorScope=seller (confines to seller's portfolio)
//   ownership:  false
//   org scope:  Only for ORG_ADMIN/MANAGER — delivers org-wide aggregates
//   seller scope: Delivers only the seller's assigned customers
//
// commercial.orders.summary.read
//   Roles:      ORG_ADMIN, MANAGER, OPERATOR
//   Scopes:     organization, seller
//   sellerId:   Required when actorScope=seller
//   ownership:  false
//   org scope:  Delivers org-wide order summary
//   seller scope: Delivers only the seller's orders
//
// commercial.sales.performance.read
//   Roles:      ORG_ADMIN, MANAGER, OPERATOR
//   Scopes:     organization, seller
//   sellerId:   Required when actorScope=seller
//   ownership:  false
//   org scope:  Delivers org-wide performance KPIs
//   seller scope: Delivers only the seller's performance
//
// commercial.seller.portfolio.read
//   Roles:      ORG_ADMIN, MANAGER, OPERATOR
//   Scopes:     organization, seller
//   sellerId:   Required when actorScope=seller
//   ownership:  true (seller must prove identity to view their portfolio)
//   org scope:  Delivers cross-seller portfolio overview
//   seller scope: Delivers only the requesting seller's portfolio

const COMMERCIAL_CAPABILITIES: readonly CopilotCapability[] = [
  {
    capabilityId:              "commercial.customers.summary.read",
    moduleKey:                 "comercial",
    description:               "Read aggregated customer summary for the organization or seller portfolio",
    riskClass:                 "READ",
    requiredEntitlement:       "copilot:commercial:read",
    allowedRoles:              ["ORG_ADMIN", "MANAGER", "OPERATOR"],
    allowedActorScopes:        ["organization", "seller"],
    requiresResourceOwnership: false,
    enabled:                   true,
    truthRequirements: [
      { source: "crm_customers", required: true,  label: "CRM customer profiles" },
      { source: "sag_cartera",   required: false, label: "SAG receivables (enrichment)" },
    ],
  },
  {
    capabilityId:              "commercial.orders.summary.read",
    moduleKey:                 "comercial",
    description:               "Read order summary and recent order activity",
    riskClass:                 "READ",
    requiredEntitlement:       "copilot:commercial:read",
    allowedRoles:              ["ORG_ADMIN", "MANAGER", "OPERATOR"],
    allowedActorScopes:        ["organization", "seller"],
    requiresResourceOwnership: false,
    enabled:                   true,
    truthRequirements: [
      { source: "crm_quotes",  required: true,  label: "CRM quotes/orders" },
      { source: "sag_pedidos", required: false, label: "SAG order sync status" },
    ],
  },
  {
    capabilityId:              "commercial.sales.performance.read",
    moduleKey:                 "comercial",
    description:               "Read sales performance metrics and KPIs",
    riskClass:                 "READ",
    requiredEntitlement:       "copilot:commercial:read",
    allowedRoles:              ["ORG_ADMIN", "MANAGER", "OPERATOR"],
    allowedActorScopes:        ["organization", "seller"],
    requiresResourceOwnership: false,
    enabled:                   true,
    truthRequirements: [
      { source: "crm_quotes",  required: true,  label: "CRM quotes for performance calc" },
      { source: "sag_cartera", required: false, label: "SAG receivables for collection rate" },
    ],
  },
  {
    capabilityId:              "commercial.seller.portfolio.read",
    moduleKey:                 "comercial",
    description:               "Read seller-specific portfolio: assigned customers, territory, commission tier",
    riskClass:                 "READ",
    requiredEntitlement:       "copilot:commercial:read",
    allowedRoles:              ["ORG_ADMIN", "MANAGER", "OPERATOR"],
    allowedActorScopes:        ["organization", "seller"],
    requiresResourceOwnership: true,
    enabled:                   true,
    truthRequirements: [
      { source: "crm_customers",  required: true,  label: "CRM customer assignments" },
      { source: "seller_profile", required: true,  label: "Seller profile and territory" },
    ],
  },
] as const;

// ── Registry ─────────────────────────────────────────────────────────────────

const CAPABILITY_MAP = new Map<string, CopilotCapability>();

for (const cap of COMMERCIAL_CAPABILITIES) {
  CAPABILITY_MAP.set(cap.capabilityId, cap);
}

/**
 * Look up a capability by ID.
 * Returns undefined for unknown capabilities (fail-closed upstream).
 */
export function getCapability(capabilityId: string): CopilotCapability | undefined {
  return CAPABILITY_MAP.get(capabilityId);
}

/**
 * Returns all registered capabilities (immutable snapshot).
 */
export function listCapabilities(): readonly CopilotCapability[] {
  return [...CAPABILITY_MAP.values()];
}

/**
 * Returns all enabled capabilities for a given module key.
 */
export function listCapabilitiesByModule(moduleKey: string): readonly CopilotCapability[] {
  return [...CAPABILITY_MAP.values()].filter(
    (c) => c.moduleKey === moduleKey && c.enabled,
  );
}
