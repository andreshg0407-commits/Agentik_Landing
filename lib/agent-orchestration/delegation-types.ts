/**
 * lib/agent-orchestration/delegation-types.ts
 *
 * Agentik Agent Orchestration — Delegation Type System
 *
 * Defines the core contracts for controlled, traceable, approvable
 * agent-to-agent delegations. Agents never call each other directly.
 * Delegations are proposals recorded by the runtime and approved by humans.
 *
 * Sprint: AGENTIK-AGENT-DELEGATION-ORCHESTRATION-01
 */

// ── Delegation status ─────────────────────────────────────────────────────────

export type DelegationStatus =
  | "proposed"          // Engine created the delegation proposal
  | "pending_approval"  // Waiting for human to approve before target agent receives it
  | "approved"          // Human approved — target agent may accept
  | "accepted"          // Target agent acknowledged it is handling this
  | "in_progress"       // Target agent is actively working on it
  | "completed"         // Target agent finished, resolution attached
  | "rejected"          // Human or source agent rejected the delegation
  | "failed"            // Target agent encountered an error
  | "canceled"          // Canceled before completion
  | "expired"           // Timed out without resolution
  | "blocked";          // Blocked by an unresolved dependency

// ── Delegation reason ──────────────────────────────────────────────────────────

export type DelegationReason =
  | "financial_impact_review"    // Action has financial implications Diego should evaluate
  | "inventory_risk_review"      // Stock levels at risk — David or supply chain must review
  | "campaign_pause_review"      // Active campaigns may need to pause — Luca must evaluate
  | "collection_risk_review"     // Cartera / collections create liquidity risk
  | "production_dependency"      // Production action depends on another agent's resolution
  | "data_quality_review"        // Data quality issue requiring agent-level verification
  | "cross_module_dependency"    // Action in module A depends on module B resolving first
  | "executive_escalation";      // High-severity signal requiring escalation

// ── Priority ──────────────────────────────────────────────────────────────────

export type DelegationPriority = "critical" | "high" | "medium" | "low";

// ── Core delegation ───────────────────────────────────────────────────────────

export interface AgentDelegation {
  // ── Identity ─────────────────────────────────────────────────────────────
  /** Unique — "del_{seq}_{timestamp}" */
  id:               string;
  orgId:            string;

  // ── Agents ───────────────────────────────────────────────────────────────
  sourceAgentId:    string;
  targetAgentId:    string;
  sourceModuleId:   string;
  targetModuleId:   string;

  // ── Action linkage ────────────────────────────────────────────────────────
  /** The action that triggered this delegation */
  parentActionId:   string | null;
  /** The child action created by the target agent in response (V2) */
  childActionId:    string | null;

  // ── Semantics ─────────────────────────────────────────────────────────────
  reason:           DelegationReason;
  /** One-paragraph operational context passed to the target agent */
  contextSummary:   string;
  /** Structured payload for the target agent */
  payload:          Record<string, unknown>;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  status:           DelegationStatus;
  priority:         DelegationPriority;
  requiresApproval: boolean;

  // ── Timestamps (ISO) ──────────────────────────────────────────────────────
  createdAt:        string;
  acceptedAt:       string | null;
  completedAt:      string | null;
  rejectedAt:       string | null;
  failedAt:         string | null;

  // ── Traceability ──────────────────────────────────────────────────────────
  /** Groups this delegation with related events in the same operational chain */
  correlationId:    string;
  /** The action or delegation that caused this delegation to be created */
  causationId:      string | null;

  // ── Resolution (set on completion or rejection) ───────────────────────────
  resolutionSummary: string | null;
}

// ── Delegation filter ─────────────────────────────────────────────────────────

export interface DelegationFilter {
  orgId?:          string;
  sourceAgentId?:  string;
  targetAgentId?:  string;
  status?:         DelegationStatus | DelegationStatus[];
  parentActionId?: string;
  reason?:         DelegationReason;
  since?:          string;
  limit?:          number;
}

// ── Delegation summary ────────────────────────────────────────────────────────

export interface DelegationSummary {
  total:               number;
  pending:             number;
  blocked:             number;
  completed:           number;
  failed:              number;
  inProgress:          number;
  byStatus:            Record<DelegationStatus, number>;
  bySourceAgent:       Record<string, number>;
  byTargetAgent:       Record<string, number>;
  longestChainLength:  number;
}

// ── Delegation report (for API) ───────────────────────────────────────────────

export interface DelegationReport {
  delegations:  AgentDelegation[];
  pending:      AgentDelegation[];
  blocked:      AgentDelegation[];
  completed:    AgentDelegation[];
  byAgent:      Record<string, { source: AgentDelegation[]; target: AgentDelegation[] }>;
  byStatus:     Record<string, AgentDelegation[]>;
  summary:      DelegationSummary;
}

// ── Terminal states ────────────────────────────────────────────────────────────

export const DELEGATION_TERMINAL_STATES: DelegationStatus[] = [
  "completed", "rejected", "failed", "canceled", "expired",
];

export function isDelegationTerminal(status: DelegationStatus): boolean {
  return DELEGATION_TERMINAL_STATES.includes(status);
}

// ── ID generator ─────────────────────────────────────────────────────────────

let _delSeq = 0;
export function delegationId(): string {
  return `del_${++_delSeq}_${Date.now()}`;
}
export function delegationCorrelationId(sourceAgentId: string): string {
  return `dcorr_${sourceAgentId}_${Date.now()}`;
}
