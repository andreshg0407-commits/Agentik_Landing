/**
 * lib/work/executors/module-action-mapper.ts
 *
 * Agentik — Module Action Mapper
 * Sprint: AGENTIK-MULTI-MODULE-EXECUTORS-01
 *
 * PURE — no server-only, no Prisma, no React.
 *
 * Given an ApprovalApprovedEvent, derives which (module, actionType) pair
 * should be used for specialized module execution.
 *
 * Strategy:
 *   1. If event.actionType is explicitly set → use it directly.
 *   2. Otherwise, fall back to category-based derivation using approvalCategory.
 *   3. If neither produces a match → return null (caller uses generic executor).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ModuleActionMapping {
  module:     string;
  actionType: string;
}

// ── Minimal event shape we need (avoids circular dependency) ──────────────────

interface ApprovalEventShape {
  module?:          string;
  actionType?:      string;
  approvalCategory: string;
}

// ── Category → (module, actionType) defaults ──────────────────────────────────

/**
 * Best-effort mapping from approvalCategory strings to module action pairs.
 * These are the "default" actions per category when actionType is not explicit.
 */
const CATEGORY_DEFAULTS: Record<string, ModuleActionMapping> = {
  // Finance
  RECONCILIATION:    { module: "finanzas",   actionType: "RECONCILIATION"    },
  TREASURY_TRANSFER: { module: "tesoreria",  actionType: "TREASURY_TRANSFER" },
  PAYMENT_APPROVAL:  { module: "finanzas",   actionType: "PAYMENT_APPROVAL"  },
  TREASURY:          { module: "tesoreria",  actionType: "TREASURY_TRANSFER" },
  FINANCE:           { module: "finanzas",   actionType: "PAYMENT_APPROVAL"  },

  // Collections
  PAYMENT_PLAN:        { module: "cobranza", actionType: "PAYMENT_PLAN"        },
  FOLLOW_UP:           { module: "cobranza", actionType: "FOLLOW_UP"           },
  COLLECTION_CAMPAIGN: { module: "cobranza", actionType: "COLLECTION_CAMPAIGN" },
  COLLECTIONS:         { module: "cobranza", actionType: "FOLLOW_UP"           },

  // Commercial
  PORTFOLIO_TRANSFER: { module: "comercial", actionType: "PORTFOLIO_TRANSFER" },
  ORDER_RELEASE:      { module: "comercial", actionType: "ORDER_RELEASE"      },
  PRICE_UPDATE:       { module: "comercial", actionType: "PRICE_UPDATE"       },
  COMMERCIAL:         { module: "comercial", actionType: "ORDER_RELEASE"      },

  // Marketing
  PUBLISH_CONTENT: { module: "marketing", actionType: "PUBLISH_CONTENT" },
  GENERATE_ASSETS: { module: "marketing", actionType: "GENERATE_ASSETS" },
  SCHEDULE_POST:   { module: "marketing", actionType: "SCHEDULE_POST"   },
  CAMPAIGN_LAUNCH: { module: "marketing", actionType: "PUBLISH_CONTENT" },
  MARKETING:       { module: "marketing", actionType: "PUBLISH_CONTENT" },
};

// ── Module → default actionType (when module is set but actionType is not) ────

const MODULE_DEFAULT_ACTION: Record<string, string> = {
  finanzas:     "PAYMENT_APPROVAL",
  tesoreria:    "TREASURY_TRANSFER",
  conciliacion: "RECONCILIATION",
  cierre:       "RECONCILIATION",
  planeacion:   "RECONCILIATION",
  cobranza:     "FOLLOW_UP",
  collections:  "FOLLOW_UP",
  comercial:    "ORDER_RELEASE",
  commercial:   "ORDER_RELEASE",
  marketing:    "PUBLISH_CONTENT",
};

// ── Mapper ────────────────────────────────────────────────────────────────────

/**
 * Map an approval event to a module + actionType pair for specialized execution.
 * Returns null when no mapping is found — caller falls back to generic executor.
 */
export function mapApprovalToModuleAction(
  event: ApprovalEventShape,
): ModuleActionMapping | null {
  // Strategy 1: both module + actionType are explicit
  if (event.module && event.actionType) {
    return { module: event.module, actionType: event.actionType };
  }

  // Strategy 2: module set, actionType missing — derive from module defaults
  if (event.module) {
    const key            = event.module.toLowerCase().trim();
    const defaultAction  = MODULE_DEFAULT_ACTION[key];
    if (defaultAction) return { module: key, actionType: defaultAction };
  }

  // Strategy 3: category-based fallback
  if (event.approvalCategory) {
    const key     = event.approvalCategory.toUpperCase().trim();
    const mapping = CATEGORY_DEFAULTS[key];
    if (mapping) return mapping;
  }

  return null;
}
