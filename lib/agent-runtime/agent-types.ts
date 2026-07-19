/**
 * lib/agent-runtime/agent-types.ts
 *
 * Agentik Agent Runtime — Core type contracts.
 *
 * Framework-agnostic base contracts for the agent runtime layer.
 * These types are independent of Prisma, Mastra, and any specific implementation.
 * When Mastra is adopted, it implements these interfaces — it does not replace them.
 *
 * NOT: Prisma imports, LLM calls, React, UI, SAG adapters.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-ARCHITECTURE-01
 */

// ── Agent identity ────────────────────────────────────────────────────────────

/**
 * Canonical runtime agent IDs.
 * Each ID encodes both the agent name and its primary domain for clarity.
 *
 * Maps to the existing AgentId in types/copilot/copilot-types.ts:
 *   diego_finance    → diego
 *   luca_marketing   → luca
 *   david_commercial → david
 *   mila_collections → mila
 *   agentik_copilot  → (executive copilot — no specific domain agent)
 */
export type AgentRuntimeId =
  | "diego_finance"
  | "luca_marketing"
  | "david_commercial"
  | "mila_collections"
  | "agentik_copilot";

// ── Agent domain ──────────────────────────────────────────────────────────────

export type AgentDomain =
  | "finance"
  | "marketing"
  | "commercial"
  | "collections"
  | "operations"
  | "executive";

// ── Source health ─────────────────────────────────────────────────────────────

export type SourceHealthStatus =
  | "ok"          // source is live and fresh
  | "stale"       // source data is old but available
  | "degraded"    // partial data available
  | "unavailable" // source unreachable
  | "empty";      // source reachable but returns no data

export interface SourceHealth {
  sourceId:       string;
  status:         SourceHealthStatus;
  lastSyncAt:     string | null;  // ISO timestamp
  staleSinceMs:   number | null;
  errorMessage?:  string;
}

// ── Agent signal ──────────────────────────────────────────────────────────────

export type SignalSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info";

export interface AgentSignal {
  id:        string;
  domain:    AgentDomain;
  moduleKey: string;       // e.g. "comercial.maletas"
  severity:  SignalSeverity;
  message:   string;
  detectedAt: string;      // ISO timestamp
  resolvedAt: string | null;
  payload?:  Record<string, unknown>;
}

// ── Agent context — ephemeral snapshot built per invocation ───────────────────

export interface AgentContext {
  /** Target organization */
  organizationId:   string;
  orgSlug:          string;
  /** Invoking user */
  userId:           string;
  /** Module being processed. e.g. "comercial.maletas", "finanzas.conciliacion" */
  moduleKey:        string;
  /** User role in the org */
  role:             string;
  /** Permission keys active for this user */
  permissions:      string[];
  /** Health of data sources relevant to this module */
  sourceHealth:     SourceHealth[];
  /** Live snapshot of the module's operational state (opaque per module) */
  runtimeSnapshot:  Record<string, unknown>;
  /** Active signals detected in this cycle */
  activeSignals:    AgentSignal[];
  /** Memory entry IDs relevant to this invocation */
  memoryRefs:       string[];
}

// ── Tool contracts ────────────────────────────────────────────────────────────

export type ToolPermission =
  | "read"    // reads data, no side effects
  | "write"   // creates or modifies data — requires approval by default
  | "admin";  // privileged operations — SUPER_ADMIN only

export type ToolExecutionMode =
  | "instant"     // executes immediately, returns result synchronously
  | "queued"      // enqueued for async execution
  | "supervised"; // requires human approval before execution

export interface AgentTool {
  /** Unique identifier. Namespaced by domain. e.g. "commercial.getCoverageSnapshot" */
  id:              string;
  /** Human-readable name */
  name:            string;
  /** Domain this tool belongs to */
  domain:          AgentDomain;
  /** Description for the agent — what it does, when to use it */
  description:     string;
  /** JSON schema of the expected input (can be null for zero-arg tools) */
  inputSchema:     Record<string, unknown> | null;
  /** JSON schema of the expected output */
  outputSchema:    Record<string, unknown> | null;
  /** Access level required to call this tool */
  permission:      ToolPermission;
  /** How this tool runs */
  executionMode:   ToolExecutionMode;
  /** Whether calling this tool creates an AgentAction requiring user approval */
  requiresApproval: boolean;
  /**
   * Reference to the implementation module.
   * e.g. "lib/comercial/maletas/maletas-runtime#buildMaletasRuntime"
   * Used for documentation and future Mastra binding — NOT dynamically called here.
   */
  handlerRef:      string;
}

// ── Action contracts ──────────────────────────────────────────────────────────

export type ActionSeverity = "low" | "medium" | "high" | "critical";

/**
 * Lifecycle of an agent action.
 *
 *   suggested → pending_approval → approved → executing → executed
 *                                                       ↘ failed
 *             pending_approval → rejected
 *             suggested        → dismissed
 *             any              → expired  (TTL exceeded before resolution)
 */
export type ActionStatus =
  | "suggested"         // agent generated the action, not yet shown or acknowledged
  | "pending_approval"  // shown to user, awaiting decision
  | "approved"          // user approved — ready to execute
  | "executing"         // execution in progress
  | "executed"          // completed successfully
  | "failed"            // execution failed — see auditTrail for reason
  | "dismissed"         // user dismissed without explicit reject (from suggested/pending_approval)
  | "rejected"          // user explicitly rejected — will not execute
  | "expired";          // TTL exceeded before user acted

// ── Audit trail entry ─────────────────────────────────────────────────────────

export interface AuditEntry {
  timestamp:   string;   // ISO
  event:       string;   // e.g. "action.approved", "tool.executed", "status.changed"
  actorId:     string;   // userId or agentId
  actorType:   "user" | "agent" | "system";
  detail?:     string;
  errorMsg?:   string;
}

// ── Agent action ──────────────────────────────────────────────────────────────

export interface AgentAction {
  /** Unique action ID */
  id:               string;
  /**
   * Action type key — matches a handler in action-registry.ts.
   * e.g. "create_production_request", "create_collection_followup"
   */
  type:             string;
  /** Short human-readable title shown in Copilot rail */
  title:            string;
  /** Full description / justification from the agent */
  description?:     string;
  domain:           AgentDomain;
  severity:         ActionSeverity;
  status:           ActionStatus;
  /** Which agent generated this action */
  sourceAgentId:    AgentRuntimeId;
  /** Module where this action originates */
  moduleKey:        string;
  /** Action-specific data (typed by action type) */
  payload:          Record<string, unknown>;
  /** Whether this action needs explicit user approval before executing */
  requiresApproval: boolean;
  /** Full lifecycle audit trail */
  auditTrail:       AuditEntry[];
  /** ISO timestamp of creation */
  createdAt:        string;
  /** ISO timestamp of last status change */
  updatedAt:        string;
}
