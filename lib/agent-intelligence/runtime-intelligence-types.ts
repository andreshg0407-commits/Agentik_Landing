/**
 * lib/agent-intelligence/runtime-intelligence-types.ts
 *
 * Agentik Agent Runtime Intelligence — Core Types
 *
 * Fully deterministic. No LLM. No Mastra. No embeddings.
 * Pure typed contracts for the intelligence layer.
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-INTELLIGENCE-01
 */

// ── Insight type ──────────────────────────────────────────────────────────────

export type InsightType =
  | "approval_bottleneck"           // Actions waiting too long for approval
  | "agent_overload"                // One agent generating disproportionate pressure
  | "repeated_rejection"            // Same action type rejected multiple times
  | "unresolved_critical_action"    // Critical action stuck with no resolution
  | "cross_module_dependency"       // Action in module A affects module B
  | "stale_pending_action"          // Pending action with no activity past threshold
  | "failed_execution_cluster"      // Multiple failures in same module/agent
  | "emerging_operational_pattern"  // Recurring pattern detected across time window
  | "coordination_needed";          // Explicit agent-to-agent coordination required

// ── Severity ─────────────────────────────────────────────────────────────────

export type InsightSeverity = "critical" | "high" | "medium" | "low" | "info";

// ── Blocker type ──────────────────────────────────────────────────────────────

export type BlockerType =
  | "approval_delayed"          // Waiting for human approval past threshold
  | "approved_not_executed"     // Approved but execution not started
  | "failed_no_retry"           // Execution failed, no retry scheduled
  | "dependency_unresolved"     // Action depends on another pending/failed action
  | "module_overloaded"         // Module has too many unresolved actions
  | "agent_signals_unactioned"; // Agent issued observations/signals with no resulting action

// ── Core insight ──────────────────────────────────────────────────────────────

export interface RuntimeInsight {
  /** Unique — "ri_{type}_{timestamp}_{seq}" */
  id:                   string;
  orgId:                string;
  type:                 InsightType;
  severity:             InsightSeverity;
  title:                string;
  summary:              string;
  /** Engine that produced this insight */
  source:               "priority_engine" | "blocker_engine" | "coordination_engine" | "memory_interpreter";
  relatedAgentIds:      string[];
  relatedModuleIds:     string[];
  relatedActionIds:     string[];
  recommendedNextStep:  string;
  /** 0.0–1.0 deterministic confidence based on signal count */
  confidence:           number;
  createdAt:            string;
}

// ── Blocker ───────────────────────────────────────────────────────────────────

export interface RuntimeBlocker {
  /** Unique — "rb_{type}_{timestamp}_{seq}" */
  id:                  string;
  blockerType:         BlockerType;
  severity:            InsightSeverity;
  actionId:            string | null;
  moduleId:            string | null;
  agentId:             string | null;
  reason:              string;
  suggestedResolution: string;
  detectedAt:          string;
}

// ── Coordination recommendation ───────────────────────────────────────────────

export interface CoordinationRecommendation {
  /** Unique — "cr_{source}_{target}_{seq}" */
  id:                    string;
  sourceAgentId:         string;
  targetAgentId:         string;
  reason:                string;
  sourceActionId:        string | null;
  /** Human-readable recommended action for targetAgent */
  recommendedAction:     string;
  priority:              "critical" | "high" | "medium" | "low";
  requiresHumanApproval: boolean;
}

// ── Detected pattern ──────────────────────────────────────────────────────────

export interface DetectedPattern {
  patternKey:    string;   // "repeated:create_production_request:david_commercial"
  actionType:    string;
  agentId:       string;
  moduleId:      string;
  occurrences:   number;
  firstSeen:     string;
  lastSeen:      string;
  outcomes:      { approved: number; rejected: number; failed: number; pending: number };
}

// ── Orphan decision ───────────────────────────────────────────────────────────

export interface OrphanDecision {
  nodeId:    string;
  agentId:   string;
  moduleId:  string;
  summary:   string;
  timestamp: string;
  reason:    "no_connected_action" | "decision_after_terminal" | "isolated_observation";
}

// ── Intelligence report ───────────────────────────────────────────────────────

export interface RuntimeIntelligenceReport {
  orgId:                      string;
  insights:                   RuntimeInsight[];
  blockers:                   RuntimeBlocker[];
  coordinationRecommendations: CoordinationRecommendation[];
  detectedPatterns:           DetectedPattern[];
  orphanDecisions:            OrphanDecision[];
  summary: {
    insightCount:            number;
    blockerCount:            number;
    coordinationCount:       number;
    criticalInsightCount:    number;
    mostPressuredModule:     string | null;
    mostActiveAgent:         string | null;
    staleActionCount:        number;
    patternsDetected:        number;
    orphanChains:            number;
  };
  generatedAt: string;
}

// ── Copilot rail ready types ──────────────────────────────────────────────────
// Prepared for future rail consumption. Not integrated in rail yet.

export interface ExecutiveRuntimeInsight {
  /** Top single insight for the copilot rail strip */
  topInsight:       RuntimeInsight | null;
  /** Next deterministic action the system recommends a human takes */
  nextBestAction:   string | null;
  /** One-liner hint for agent coordination */
  coordinationHint: string | null;
  /** Critical blocker count — triggers urgency visual in rail */
  criticalBlockers: number;
}

// ── ID helpers ────────────────────────────────────────────────────────────────

let _insightSeq = 0;
let _blockerSeq = 0;
let _coordSeq   = 0;

export function insightId(type: InsightType): string {
  return `ri_${type}_${Date.now()}_${++_insightSeq}`;
}
export function blockerId(type: BlockerType): string {
  return `rb_${type}_${Date.now()}_${++_blockerSeq}`;
}
export function coordId(source: string, target: string): string {
  return `cr_${source}_${target}_${++_coordSeq}`;
}
