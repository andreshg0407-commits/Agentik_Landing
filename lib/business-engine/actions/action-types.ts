/**
 * action-types.ts
 *
 * AGENTIK-ARCHITECTURE-BUSINESS-ENGINE-01
 * Action Engine — executes actions triggered by business rules.
 *
 * Actions NEVER live inside modules.
 * The Action Engine is the sole executor.
 * New actions can be added without breaking existing ones.
 */

// ── Action Types ──────────────────────────────────────────────────────────────

/** All supported action types. Extensible — new types are added here. */
export type ActionType =
  // Alerting
  | "create_alert"
  | "send_notification"
  | "send_email"
  | "send_whatsapp"
  // Dashboard / Intelligence
  | "update_dashboard"
  | "update_david"
  | "update_timeline"
  | "update_kpi"
  // Operations
  | "request_production"
  | "request_transfer"
  | "request_purchase"
  | "block_order"
  | "unblock_order"
  // Approvals
  | "request_approval"
  | "auto_approve"
  // Automation
  | "trigger_workflow"
  | "trigger_automation"
  // Analytics
  | "update_indicators"
  | "log_event";

// ── Action Request ────────────────────────────────────────────────────────────

/** A request to execute an action. Created by the Rule Engine. */
export interface ActionRequest {
  /** Unique action request ID. */
  id: string;
  /** Tenant organization ID. */
  organizationId: string;
  /** The type of action to execute. */
  type: ActionType;
  /** Configuration and parameters for the action. */
  config: Record<string, unknown>;
  /** The business event that triggered this action. */
  sourceEventId: string;
  /** The rule that triggered this action. */
  sourceRuleId: string;
  /** Priority (lower = higher priority). */
  priority: number;
  /** ISO timestamp when the request was created. */
  createdAt: string;
}

// ── Action Result ─────────────────────────────────────────────────────────────

/** Result of executing an action. */
export interface ActionResult {
  actionRequestId: string;
  type: ActionType;
  status: "success" | "failed" | "skipped";
  message: string | null;
  executedAt: string;
  durationMs: number;
  error: string | null;
}

// ── Action Handler ────────────────────────────────────────────────────────────

/** Interface for individual action handlers. */
export interface IActionHandler {
  /** The action type this handler supports. */
  type: ActionType;
  /** Execute the action. */
  execute(request: ActionRequest): Promise<ActionResult>;
  /** Validate action config before execution. */
  validate(config: Record<string, unknown>): boolean;
}

// ── Action Engine Interface ───────────────────────────────────────────────────

/** Contract for the Action Engine. */
export interface IActionEngine {
  /** Execute a single action. */
  execute(request: ActionRequest): Promise<ActionResult>;
  /** Execute a batch of actions (respects priority ordering). */
  executeBatch(requests: ActionRequest[]): Promise<ActionResult[]>;
  /** Register a new action handler. */
  registerHandler(handler: IActionHandler): void;
  /** List all registered action types. */
  listRegisteredTypes(): ActionType[];
}
