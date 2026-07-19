/**
 * lib/comercial/pedidos/order-assistant-types.ts
 *
 * Domain types for the Order Assistant.
 * Pure types — no runtime logic, no Prisma, no imports from server modules.
 *
 * The OrderAssistant is a read-only aggregate that prepares the seller
 * with all relevant context before creating a new order.
 * It never modifies data, never confirms orders, never writes to SAG.
 *
 * Sprint: ORDER-ASSISTANT-01
 */

import type {
  CustomerBranchInfo,
  CustomerBranchResult,
  CustomerCreditResult,
  OrderReadinessResult,
  OrderPolicyEvidenceItem,
} from "./order-decision-types";

// ── Customer snapshot (what the assistant knows about the customer) ──────────

export interface OrderAssistantCustomer {
  customerId: string;
  customerName: string;
  customerCode: string;
  nit: string | null;
  city: string | null;
  status: string;
  segment: string | null;
  sagCode: string | null;
  sellerName: string | null;
  sellerConfidence: number;
}

// ── Credit snapshot ─────────────────────────────────────────────────────────

export interface OrderAssistantCredit {
  totalReceivable: number;
  overdueReceivable: number;
  maxDaysPastDue: number;
  creditStatus: "approved" | "warning" | "blocked";
  alerts: Array<{
    message: string;
    severity: "warning" | "high" | "critical";
    daysPastDue: number;
  }>;
}

// ── Branch snapshot ─────────────────────────────────────────────────────────

export interface OrderAssistantBranches {
  availableBranches: CustomerBranchInfo[];
  selectedBranch: CustomerBranchInfo | null;
  selectionMode: "auto_single" | "requires_selection" | "no_branches";
}

// ── Recent orders snapshot ──────────────────────────────────────────────────

export interface OrderAssistantRecentOrder {
  id: string;
  consecutivo: number;
  totalReferences: number;
  totalUnits: number;
  totalValue: number;
  status: string;
  origin: string;
  createdAt: string;
  daysSinceOrder: number;
}

// ── Auto surtido availability ───────────────────────────────────────────────

export interface OrderAssistantAutoSurtido {
  available: boolean;
  reason: string;
}

// ── Alert ───────────────────────────────────────────────────────────────────

export type OrderAssistantAlertSeverity = "info" | "warning" | "critical";

export interface OrderAssistantAlert {
  id: string;
  dimension: string;
  message: string;
  severity: OrderAssistantAlertSeverity;
}

// ── Warning ─────────────────────────────────────────────────────────────────

export interface OrderAssistantWarning {
  dimension: string;
  message: string;
}

// ── Recommended action ──────────────────────────────────────────────────────

export interface OrderAssistantAction {
  action: string;
  rationale: string;
  priority: number;
}

// ── Full assistant result ───────────────────────────────────────────────────

export type OrderAssistantStatus = "recommended" | "caution" | "blocked";

export interface OrderAssistantResult {
  tenantId: string;
  evaluatedAt: string;

  /** Customer identity and status */
  customer: OrderAssistantCustomer;

  /** Branch selection state */
  branches: OrderAssistantBranches;

  /** Credit / cartera evaluation */
  credit: OrderAssistantCredit;

  /** Order readiness gate */
  readiness: {
    status: "READY" | "WARNING" | "BLOCKED";
    canSubmit: boolean;
    checks: Array<{ dimension: string; status: "ok" | "warning" | "blocked"; message: string }>;
  };

  /** Recent orders for this customer */
  recentOrders: OrderAssistantRecentOrder[];

  /** Auto surtido capability */
  autoSurtido: OrderAssistantAutoSurtido;

  /** Aggregated alerts */
  alerts: OrderAssistantAlert[];

  /** Aggregated warnings */
  warnings: OrderAssistantWarning[];

  /** Recommended actions (sorted by priority) */
  recommendedActions: OrderAssistantAction[];

  /** Overall confidence (0-1) */
  confidence: number;

  /** Overall status */
  status: OrderAssistantStatus;

  /** Full evidence trail */
  evidence: OrderPolicyEvidenceItem[];

  /** Raw policy results (for downstream consumption) */
  policyResults: {
    branch: CustomerBranchResult;
    credit: CustomerCreditResult;
    readiness: OrderReadinessResult;
  };
}

// ── Input for the assistant (what callers provide) ──────────────────────────

export interface OrderAssistantInput {
  tenantId: string;
  orgSlug: string;
  customerId: string;
}
