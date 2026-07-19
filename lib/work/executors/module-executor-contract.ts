/**
 * lib/work/executors/module-executor-contract.ts
 *
 * Agentik — Module Executor Universal Contract
 * Sprint: AGENTIK-MULTI-MODULE-EXECUTORS-01
 *
 * Interface all specialized module executors must implement.
 * Pure TypeScript — no React, no Prisma, no server-only.
 */

// ── Action types by module ─────────────────────────────────────────────────────

export type FinanceActionType     = "RECONCILIATION" | "TREASURY_TRANSFER" | "PAYMENT_APPROVAL";
export type CollectionsActionType = "PAYMENT_PLAN"   | "FOLLOW_UP"         | "COLLECTION_CAMPAIGN";
export type CommercialActionType  = "PORTFOLIO_TRANSFER" | "ORDER_RELEASE" | "PRICE_UPDATE";
export type MarketingActionType   = "PUBLISH_CONTENT" | "GENERATE_ASSETS" | "SCHEDULE_POST";

export type ModuleActionType =
  | FinanceActionType
  | CollectionsActionType
  | CommercialActionType
  | MarketingActionType;

// ── Human-readable labels ─────────────────────────────────────────────────────

export const MODULE_ACTION_LABELS: Record<string, string> = {
  // Finance
  RECONCILIATION:     "Conciliación bancaria",
  TREASURY_TRANSFER:  "Transferencia de tesorería",
  PAYMENT_APPROVAL:   "Aprobación de pago",
  // Collections
  PAYMENT_PLAN:       "Plan de pago",
  FOLLOW_UP:          "Seguimiento de cartera",
  COLLECTION_CAMPAIGN:"Campaña de cobranza",
  // Commercial
  PORTFOLIO_TRANSFER: "Transferencia de cartera",
  ORDER_RELEASE:      "Liberación de pedido",
  PRICE_UPDATE:       "Actualización de precio",
  // Marketing
  PUBLISH_CONTENT:    "Publicar contenido",
  GENERATE_ASSETS:    "Generar materiales",
  SCHEDULE_POST:      "Programar publicación",
};

// ── Context passed to each executor ──────────────────────────────────────────

export interface ModuleExecutorContext {
  /** Unique job identifier for this execution. */
  jobId:         string;
  /** Domain module: "finanzas" | "cobranza" | "comercial" | "marketing" */
  module:        string;
  /** Specific action within the module. */
  actionType:    string;
  /** ID of the triggering approval. */
  approvalId:    string;
  /** Human title of the triggering approval. */
  approvalTitle: string;
  /** Tenant slug. */
  orgSlug:       string;
  /** Optional entity context. */
  entityType?:   string;
  entityId?:     string;
  /** Impact context from the approval. */
  impactSummary?: string;
  /** Free-form metadata bag. */
  metadata:      Record<string, unknown>;
}

// ── Result returned by each executor ─────────────────────────────────────────

export interface ModuleExecutorResult {
  success:    boolean;
  actionType: string;
  module:     string;
  message:    string;
  output:     Record<string, unknown>;
  errors:     string[];
  warnings:   string[];
  executedAt: string;
  /** True when this is a stub (real logic not yet implemented). */
  isStub:     boolean;
}

// ── Health status ─────────────────────────────────────────────────────────────

export interface ModuleExecutorHealth {
  module:    string;
  healthy:   boolean;
  message:   string;
  checkedAt: string;
}

// ── Universal contract ────────────────────────────────────────────────────────

/**
 * All specialized module executors must satisfy this interface.
 *
 *   canHandle()    — returns true if this executor handles the actionType
 *   execute()      — run the action and return a result (never throws)
 *   validate()     — pre-flight validation without side effects
 *   healthCheck()  — confirm the executor is operational
 */
export interface ModuleExecutor {
  /** Domain module this executor owns. */
  readonly module:           string;
  /** All actionType values this executor handles. */
  readonly supportedActions: string[];
  /** Whether this executor supports retry after failure. */
  readonly supportsRetry:    boolean;

  canHandle(actionType: string): boolean;

  execute(context: ModuleExecutorContext): Promise<ModuleExecutorResult>;

  validate(context: ModuleExecutorContext): { valid: boolean; errors: string[] };

  healthCheck(): Promise<ModuleExecutorHealth>;
}
