/**
 * lib/agents/runtime/agent-types.ts
 *
 * Agentik — Universal Agent Runtime — Core Domain Types
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * CRITICAL DESIGN RULE:
 *   AgentDefinition.id is NEVER the display name.
 *   id = "finance_agent" — immutable, never changes, drives all logic.
 *   displayName = "Diego" — tenant-overridable, purely cosmetic.
 *
 * If a tenant renames Diego → Carlos, runtime never changes.
 *
 * Pure TypeScript. No Prisma. No React. No server-only. No LLM.
 */

// ── Identifiers ───────────────────────────────────────────────────────────────

export type AgentId = string;

// ── Capability types ──────────────────────────────────────────────────────────

/**
 * Explicit capability strings each agent must declare.
 * Runtime validates these before every action dispatch.
 */
export type AgentCapabilityType =
  | "CREATE_TASK"
  | "CREATE_APPROVAL"
  | "CREATE_ALERT"
  | "START_WORKFLOW"
  | "READ_FINANCE"
  | "READ_MARKETING"
  | "READ_COMMERCIAL"
  | "READ_COLLECTIONS"
  | "EXECUTE_ACTION";

// ── Agent role ────────────────────────────────────────────────────────────────

export type AgentRole =
  | "finance"
  | "marketing"
  | "commercial"
  | "collections"
  | "system"
  | "custom";

// ── Agent definition ──────────────────────────────────────────────────────────

/**
 * Immutable definition of one agent.
 * id drives all runtime logic. displayName is cosmetic.
 */
export interface AgentDefinition {
  /** Immutable semantic ID. Never the display name. e.g. "finance_agent". */
  id:              AgentId;
  /** Human-readable name. Tenant-overridable. e.g. "Diego", "Carlos". */
  displayName:     string;
  role:            AgentRole;
  description:     string;
  isSystemAgent:   boolean;
  enabled:         boolean;
  /** Explicit list of capabilities this agent is authorized to use. */
  capabilities:    AgentCapabilityType[];
  /** Tool identifiers this agent may invoke. */
  tools:           string[];
  /** Base instruction for future AI integration. Not used for logic. */
  systemPrompt:    string;
  metadata?:       Record<string, unknown>;
}

// ── Goal ─────────────────────────────────────────────────────────────────────

export type GoalType =
  | "finance"
  | "marketing"
  | "commercial"
  | "collections"
  | "generic";

export type GoalPriority = "low" | "medium" | "high" | "critical";

export interface AgentGoal {
  type:               GoalType;
  description:        string;
  priority:           GoalPriority;
  targetEntityId?:    string;
  targetEntityType?:  string;
  metadata:           Record<string, unknown>;
}

// ── Plan ─────────────────────────────────────────────────────────────────────

export interface AgentPlanStep {
  id:           string;
  label:        string;
  /** Capability action this step exercises. */
  action:       AgentCapabilityType;
  params:       Record<string, unknown>;
  /** Step IDs this step depends on. */
  dependsOn?:   string[];
  optional:     boolean;
}

export interface AgentPlan {
  id:              string;
  agentId:         AgentId;
  goal:            AgentGoal;
  steps:           AgentPlanStep[];
  estimatedSteps:  number;
  createdAt:       string;
  metadata:        Record<string, unknown>;
}

// ── Decision ─────────────────────────────────────────────────────────────────

export type AgentDecisionType = "execute" | "defer" | "escalate" | "block";

export interface AgentDecision {
  planId:     string;
  agentId:    AgentId;
  decision:   AgentDecisionType;
  reason:     string;
  metadata:   Record<string, unknown>;
  decidedAt:  string;
}

// ── Execution context ─────────────────────────────────────────────────────────

export interface AgentActor {
  type:   "user" | "system" | "agent";
  id?:    string;
  label?: string;
}

export interface AgentExecutionContext {
  orgSlug:   string;
  actor:     AgentActor;
  goal:      AgentGoal;
  metadata:  Record<string, unknown>;
  /** Opaque memory blob — typed in agent-memory.ts */
  memory?:   Record<string, unknown>;
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface AgentAuditEntry {
  id:         string;
  agentId:    AgentId;
  event:      string;
  stepId?:    string;
  message:    string;
  metadata:   Record<string, unknown>;
  occurredAt: string;
}

// ── Result ────────────────────────────────────────────────────────────────────

export type AgentResultStatus =
  | "completed"
  | "partial"
  | "failed"
  | "blocked"
  | "deferred";

export interface AgentResult {
  agentId:        AgentId;
  goal:           AgentGoal;
  plan:           AgentPlan | null;
  status:         AgentResultStatus;
  executedSteps:  number;
  failedSteps:    number;
  skippedSteps:   number;
  output:         Record<string, unknown>;
  errors:         string[];
  auditTrail:     AgentAuditEntry[];
  startedAt:      string;
  completedAt:    string;
  metadata:       Record<string, unknown>;
}
