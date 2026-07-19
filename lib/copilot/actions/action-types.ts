/**
 * lib/copilot/actions/action-types.ts
 *
 * Agentik Copilot — Action System Type Definitions
 * Sprint: AGENTIK-COPILOT-ACTION-SYSTEM-01
 *
 * Foundation types for the Copilot action layer.
 * No React. No router. No Prisma. Pure types.
 */

// ── Identifiers ────────────────────────────────────────────────────────────────

export type CopilotActionId = string;

// ── Action kind ───────────────────────────────────────────────────────────────

/**
 * Semantic kind of action. SCREAMING_SNAKE_CASE — decouples from labels and UI.
 *
 * OPEN_MODULE      → navigate to a module (handled by navigation layer, not executor)
 * CREATE_TASK      → create a follow-up task
 * SCHEDULE_FOLLOWUP → schedule a calendar follow-up
 * GENERATE_REPORT  → prepare an executive report
 * CREATE_ALERT     → create an operational alert
 * REQUEST_APPROVAL → send for human authorization
 * PREPARE_DOCUMENT → prepare a support document
 * RUN_WORKFLOW     → trigger an operational workflow
 * SEND_MESSAGE     → send a message to a user or team
 */
export type CopilotActionKind =
  | "OPEN_MODULE"
  | "CREATE_TASK"
  | "SCHEDULE_FOLLOWUP"
  | "GENERATE_REPORT"
  | "CREATE_ALERT"
  | "REQUEST_APPROVAL"
  | "PREPARE_DOCUMENT"
  | "RUN_WORKFLOW"
  | "SEND_MESSAGE";

// ── Risk level ────────────────────────────────────────────────────────────────

/**
 * Risk level of executing this action.
 * low    → no significant side effects
 * medium → produces output or records — reversible
 * high   → triggers workflows, sends external data — irreversible
 */
export type CopilotActionRisk = "low" | "medium" | "high";

// ── Status ────────────────────────────────────────────────────────────────────

/**
 * Current availability status of an action.
 * available             → can be triggered
 * requires_confirmation → needs explicit user confirmation before executing
 * disabled              → not available in current context or config
 * coming_soon           → planned but not yet implemented
 */
export type CopilotActionStatus =
  | "available"
  | "requires_confirmation"
  | "disabled"
  | "coming_soon";

// ── Execution mode ────────────────────────────────────────────────────────────

/**
 * Execution mode of this action.
 * stub    → simulated execution — no real side effects (current sprint)
 * preview → dry-run with preview output — no persistence (future)
 * live    → real execution with full side effects (future)
 */
export type CopilotActionMode = "stub" | "preview" | "live";

// ── Context ───────────────────────────────────────────────────────────────────

/**
 * Runtime context passed to every action execution.
 */
export interface CopilotActionContext {
  /** Current org slug (e.g. "castillitos"). */
  orgSlug:          string;
  /** Agent executing the action (e.g. "diego"). */
  agentId:          string;
  /** Module or path where the action was triggered. */
  moduleSlug:       string;
  /** Drawer category that surfaced the action, if any. */
  drawerCategory?:  string;
}

// ── Definition ────────────────────────────────────────────────────────────────

/**
 * Static definition of a Copilot action — stored in the registry.
 */
export interface CopilotActionDefinition {
  id:                   CopilotActionId;
  kind:                 CopilotActionKind;
  /** Short imperative label: "Crear tarea" */
  label:                string;
  /** One-sentence explanation. */
  description:          string;
  risk:                 CopilotActionRisk;
  status:               CopilotActionStatus;
  /** If true, executor will reject unless request.confirmed === true. */
  requiresConfirmation: boolean;
  availableModes:       CopilotActionMode[];
  defaultMode:          CopilotActionMode;
}

// ── Payload ───────────────────────────────────────────────────────────────────

/**
 * Runtime payload for a specific action execution.
 */
export interface CopilotActionPayload {
  kind:    CopilotActionKind;
  params:  Record<string, unknown>;
  context: CopilotActionContext;
}

// ── Result ────────────────────────────────────────────────────────────────────

/**
 * Result returned after executing an action.
 */
export interface CopilotActionResult {
  success:             boolean;
  status:              "simulated" | "requires_confirmation" | "disabled" | "coming_soon" | "error";
  message:             string;
  /** Type of entity created (stub only). */
  createdEntityType?:  string;
  /** Stub ID of entity created. */
  createdEntityId?:    string;
  /** Arbitrary structured output. */
  data?:               Record<string, unknown>;
  /** Structured metadata — e.g. taskDraft for CREATE_TASK. */
  metadata?:           Record<string, unknown>;
}

// ── Execution request / response ──────────────────────────────────────────────

/**
 * Input to executeCopilotAction().
 */
export interface CopilotActionExecutionRequest {
  kind:       CopilotActionKind;
  context:    CopilotActionContext;
  params?:    Record<string, unknown>;
  /** Must be true for actions with requiresConfirmation. */
  confirmed?: boolean;
  /** Defaults to definition.defaultMode when omitted. */
  mode?:      CopilotActionMode;
}

/**
 * Full response from executeCopilotAction().
 */
export interface CopilotActionExecutionResponse {
  result:     CopilotActionResult;
  definition: CopilotActionDefinition;
  executedAt: string;
}
// ── Approval creation result ───────────────────────────────────────────────────

/**
 * Flat, JSON-safe result for Copilot approval creation Server Actions.
 * Compatible with Server Action boundaries — no Date objects, no Prisma types.
 * Mirrors CopilotApprovalCreationResult in lib/copilot/actions/server/create-approval-from-action.ts
 * but lives here so client-safe code can import the type without `server-only`.
 */
export interface CopilotApprovalCreationResult {
  success:           boolean;
  message:           string;
  approvalId?:       string;
  approvalTitle?:    string;
  approvalStatus?:   string;
  navigationTarget?: string;
  createdAt?:        string;
  errors?:           string[];
  warnings?:         string[];
}
