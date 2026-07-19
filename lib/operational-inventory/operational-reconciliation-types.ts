/**
 * lib/operational-inventory/operational-reconciliation-types.ts
 *
 * Operational Inventory Reconciliation — full type contract.
 *
 * ─── PURPOSE ──────────────────────────────────────────────────────────────────
 * Agentik moves inventory operationally (reservations, assignments, pressure).
 * Reconciliation audits whether the operational state is internally consistent
 * and consistent with the underlying sources (SAG snapshot, CRM orders).
 *
 * ─── WHAT THIS DOES ───────────────────────────────────────────────────────────
 *   Detects: orphan reservations, formula mismatches, over-reserves,
 *            stale data, missing references, cancelled-but-still-reserved orders
 *
 * ─── WHAT THIS DOES NOT DO ────────────────────────────────────────────────────
 *   Does NOT fix anything automatically (V1).
 *   Does NOT touch SAG.
 *   Does NOT create fiscal documents.
 *   Does NOT send orders to ERP.
 *
 * Sprint: AGENTIK-OPERATIONAL-INVENTORY-RECONCILIATION-01
 */

// ─── Severity ─────────────────────────────────────────────────────────────────

/**
 * How serious an issue is.
 *
 *   critical — operational intelligence is unreliable; action required now
 *   warning  — potential inconsistency; should be reviewed soon
 *   info     — informational flag; no immediate action needed
 */
export type OperationalReconciliationSeverity = "critical" | "warning" | "info";

// ─── Issue types ──────────────────────────────────────────────────────────────

/**
 * All issue types the reconciliation engine can detect.
 */
export type OperationalReconciliationIssueType =
  /** Reservation exists but its sourceId does not map to any known order */
  | "orphan_reservation"
  /** More than one active reservation for the same sourceType+sourceId+reference */
  | "duplicate_reservation"
  /** Active reservation whose expiresAt < now */
  | "stale_reservation"
  /** CRM order is cancelled but still has an active reservation */
  | "cancelled_order_still_reserved"
  /** CRM order is reserved/confirmed but has no active reservation */
  | "confirmed_order_without_reservation"
  /** Sum of active reservations for ref ≠ sum of order lines qty for that ref */
  | "order_line_qty_mismatch"
  /** operationalAvailableQty < 0 */
  | "negative_operational_available"
  /** reservedQty > physicalQty − salesAssignedQty */
  | "over_reserved_reference"
  /** physicalQty − reservedQty − salesAssignedQty − pendingTransfersQty ≠ operationalAvailableQty */
  | "inventory_formula_mismatch"
  /** A reservation references a product ref not found in the inventory snapshot */
  | "missing_inventory_reference"
  /** salesAssignedQty > physicalQty for a reference */
  | "sales_assignment_exceeds_inventory"
  /** Inventory snapshot is older than the configured stale threshold */
  | "stale_inventory_snapshot";

// ─── Fix types ────────────────────────────────────────────────────────────────

/**
 * Proposed fix action types.
 * All are planning-only in V1 — no auto-application.
 */
export type OperationalReconciliationFixType =
  | "release_reservation"
  | "create_missing_reservation"
  | "update_reservation_qty"
  | "expire_reservation"
  | "review_inventory_source"
  | "review_sales_assignment"
  | "no_auto_fix";

// ─── Fix suggestion ───────────────────────────────────────────────────────────

/**
 * A proposed fix for a reconciliation issue.
 *
 * V1 rule: critical issues are NEVER auto-applied.
 * Only warning/info issues with safeToAutoApply=true may eventually be automated.
 */
export interface OperationalReconciliationFixSuggestion {
  fixType:          OperationalReconciliationFixType;
  /** True if this fix is safe to apply without human review (V1: always false for critical) */
  safeToAutoApply:  boolean;
  /** True if a human coordinator must approve before this fix runs */
  requiresApproval: boolean;
  reason:           string;
  /** Entity type to target: "reservation" | "order" | "inventory_snapshot" | "sales_portfolio" */
  targetType?:      string;
  /** ID of the entity to act on */
  targetId?:        string;
  /** Payload describing what the fix would do */
  proposedPayload?: Record<string, unknown>;
}

// ─── Issue ────────────────────────────────────────────────────────────────────

/**
 * A single reconciliation issue detected by the engine.
 */
export interface OperationalReconciliationIssue {
  id:             string;
  organizationId: string;
  type:           OperationalReconciliationIssueType;
  severity:       OperationalReconciliationSeverity;
  /** Product reference code (UPPERCASE), if the issue is reference-scoped */
  reference?:     string;
  /** Source type of the triggering entity (e.g. "order") */
  sourceType?:    string;
  /** Source ID of the triggering entity */
  sourceId?:      string;
  /** Reservation ID, if the issue is reservation-scoped */
  reservationId?: string;
  /** Operational Order ID, if the issue is order-scoped */
  orderId?:       string;
  /** Expected value (quantity, status, or description) */
  expected?:      number | string;
  /** Actual value found */
  actual?:        number | string;
  /** Numeric delta (actual − expected); negative = shortfall, positive = excess */
  delta?:         number;
  /** Human-readable description */
  message:        string;
  /** Proposed remediation */
  suggestedFix:   OperationalReconciliationFixSuggestion;
  createdAt:      string;
}

// ─── Summary ──────────────────────────────────────────────────────────────────

/**
 * Aggregate summary of a reconciliation run.
 */
export interface OperationalReconciliationSummary {
  totalIssues:  number;
  critical:     number;
  warnings:     number;
  info:         number;
  /** Count of issues by type */
  byType:       Partial<Record<OperationalReconciliationIssueType, number>>;
  /** True if there are zero critical issues */
  isHealthy:    boolean;
  /**
   * 0–100 operational confidence score.
   * 100 = no issues. Decreases by severity weight per issue.
   */
  healthScore:  number;
}

// ─── Report ───────────────────────────────────────────────────────────────────

/**
 * Full reconciliation report returned by the engine.
 */
export interface OperationalReconciliationReport {
  id:             string;
  organizationId: string;
  generatedAt:    string;
  summary:        OperationalReconciliationSummary;
  issues:         OperationalReconciliationIssue[];
  /** Metadata about the inputs used */
  inputSummary: {
    inventoryItems:    number;
    reservations:      number;
    activeOrders:      number;
    portfolioItems:    number;
    /** Age of SAG inventory snapshot in seconds at report time */
    snapshotAgeSeconds?: number;
  };
}

// ─── Repair plan ──────────────────────────────────────────────────────────────

/**
 * A planned repair action derived from one or more reconciliation issues.
 * Planning-only in V1 — execution requires human approval.
 */
export interface OperationalReconciliationRepairAction {
  id:              string;
  issueId:         string;
  organizationId:  string;
  fixType:         OperationalReconciliationFixType;
  safeToAutoApply: boolean;
  requiresApproval: boolean;
  targetType:      string;
  targetId:        string;
  proposedPayload: Record<string, unknown>;
  reason:          string;
  /** Derived from the linked issue */
  severity:        OperationalReconciliationSeverity;
  plannedAt:       string;
}

/**
 * Full repair plan — list of proposed actions for a reconciliation report.
 */
export interface OperationalReconciliationRepairPlan {
  reportId:         string;
  organizationId:   string;
  totalActions:     number;
  autoApplicable:   number;
  requiresApproval: number;
  noAutoFix:        number;
  actions:          OperationalReconciliationRepairAction[];
  plannedAt:        string;
}
