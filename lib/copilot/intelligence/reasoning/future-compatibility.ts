/**
 * lib/copilot/intelligence/reasoning/future-compatibility.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Future Compatibility Contracts
 *
 * Interface stubs and roadmap contracts for future capabilities:
 *   - Memory Graph      — graph-based reasoning over memory entities
 *   - Causal Analysis   — structural causal model integration
 *   - Predictive Reasoning — forward-looking hypothesis generation
 *   - Autonomous Planning  — reasoning-to-plan execution bridge
 *
 * No server-only. Pure domain documentation + interface stubs.
 * All READINESS_STATUS values are PLANNED until implemented.
 */

// ── Memory Graph ───────────────────────────────────────────────────────────────

/**
 * MemoryGraphNode — stub for a future graph-based memory node.
 * Each node represents a business entity (client, product, agent, KPI).
 */
export interface MemoryGraphNode {
  id:         string;
  orgSlug:    string;
  type:       "ENTITY" | "EVENT" | "METRIC" | "RELATION";
  label:      string;
  properties: Record<string, unknown>;
  createdAt:  string;
}

/**
 * MemoryGraphEdge — stub for a relationship between memory graph nodes.
 */
export interface MemoryGraphEdge {
  id:         string;
  orgSlug:    string;
  sourceId:   string;
  targetId:   string;
  relation:   string;    // e.g. "CAUSED_BY", "CORRELATED_WITH", "PRECEDES"
  strength:   number;    // 0.0–1.0
  createdAt:  string;
}

export interface MemoryGraphIntegrationPlan {
  id:              string;
  name:            string;
  description:     string;
  readinessStatus: "PLANNED" | "IN_PROGRESS" | "READY";
  targetSprint:    string;
  blockers:        string[];
}

export const MEMORY_GRAPH_PLAN: MemoryGraphIntegrationPlan = {
  id:              "MEMORY_GRAPH_01",
  name:            "Memory Graph Integration",
  description:     "Extend reasoning engine to traverse a graph of memory entities. Enables multi-hop reasoning: 'client X purchased product Y, which is affected by supplier Z's delay.' Graph traversal produces richer evidence chains that can generate causal hypotheses not possible with flat signal matching.",
  readinessStatus: "PLANNED",
  targetSprint:    "AGENTIK-COPILOT-INTELLIGENCE-03",
  blockers:        [
    "Memory Graph persistence layer not yet built",
    "Graph traversal algorithm not yet designed",
    "Entity resolution pipeline missing",
  ],
};

// ── Causal Analysis ────────────────────────────────────────────────────────────

export interface CausalModel {
  id:          string;
  orgSlug:     string;
  name:        string;
  variables:   string[];
  edges:       Array<{
    cause:      string;
    effect:     string;
    strength:   number;
    confidence: number;
  }>;
  validatedAt: string;
}

export interface CausalAnalysisPlan {
  id:              string;
  name:            string;
  description:     string;
  readinessStatus: "PLANNED" | "IN_PROGRESS" | "READY";
  targetSprint:    string;
}

export const CAUSAL_ANALYSIS_PLAN: CausalAnalysisPlan = {
  id:              "CAUSAL_ANALYSIS_01",
  name:            "Structural Causal Analysis",
  description:     "Extend hypothesis engine with structural causal models (SCM). Instead of pattern matching, build interventional causal graphs per tenant. Enables: 'if campaign spend decreases by 20%, what is the expected impact on sales?' Requires historical data density and domain-specific causal DAGs.",
  readinessStatus: "PLANNED",
  targetSprint:    "AGENTIK-COPILOT-INTELLIGENCE-04",
};

// ── Predictive Reasoning ───────────────────────────────────────────────────────

export interface PredictiveReasoningModel {
  id:           string;
  orgSlug:      string;
  domain:       string;
  metric:       string;
  horizon:      "1_DAY" | "7_DAYS" | "30_DAYS" | "90_DAYS";
  confidence:   number;
  prediction:   unknown;
  generatedAt:  string;
  expiresAt:    string;
}

export interface PredictiveReasoningPlan {
  id:              string;
  name:            string;
  description:     string;
  readinessStatus: "PLANNED" | "IN_PROGRESS" | "READY";
  targetSprint:    string;
  requiredData:    string[];
}

export const PREDICTIVE_REASONING_PLAN: PredictiveReasoningPlan = {
  id:              "PREDICTIVE_REASONING_01",
  name:            "Predictive Reasoning Engine",
  description:     "Extend insight engine with forward-looking predictions. Current engine only analyzes what is happening now. Predictive layer uses trend data + causal models to generate 'what will happen if no action is taken' insights. Requires 90+ days of historical signals per domain.",
  readinessStatus: "PLANNED",
  targetSprint:    "AGENTIK-COPILOT-INTELLIGENCE-05",
  requiredData:    [
    "90-day historical signal archive per domain",
    "Seasonal adjustment models per tenant vertical",
    "Domain-specific trend baselines",
  ],
};

// ── Autonomous Planning ────────────────────────────────────────────────────────

export interface AutonomousPlanningBridge {
  id:              string;
  name:            string;
  description:     string;
  readinessStatus: "PLANNED" | "IN_PROGRESS" | "READY";
  targetSprint:    string;
  requiresApproval: boolean;
  safetyConstraints: string[];
}

export const AUTONOMOUS_PLANNING_PLAN: AutonomousPlanningBridge = {
  id:              "AUTONOMOUS_PLANNING_01",
  name:            "Reasoning-to-Plan Bridge",
  description:     "Bridge reasoning conclusions to the Agent Runtime's plan execution layer. HIGH/CRITICAL insights with actionable=true can auto-generate task drafts or approval requests. Humans always approve before execution. This sprint NEVER executes autonomously — it only prepares plan proposals.",
  readinessStatus: "PLANNED",
  targetSprint:    "AGENTIK-COPILOT-INTELLIGENCE-06",
  requiresApproval: true,
  safetyConstraints: [
    "All plans require human approval before execution",
    "No financial transactions without explicit C-level approval",
    "Plan proposals are drafts only — never auto-executed",
    "Full audit trail from reasoning conclusion to plan execution",
  ],
};

// ── Future Integration Plans registry ─────────────────────────────────────────

export const REASONING_FUTURE_PLANS = [
  MEMORY_GRAPH_PLAN,
  CAUSAL_ANALYSIS_PLAN,
  PREDICTIVE_REASONING_PLAN,
  AUTONOMOUS_PLANNING_PLAN,
] as const;

// ── Serialization helper ───────────────────────────────────────────────────────

export function getFutureRoadmapSummary(): Array<{
  id:     string;
  name:   string;
  status: string;
  sprint: string;
}> {
  return REASONING_FUTURE_PLANS.map(p => ({
    id:     p.id,
    name:   p.name,
    status: p.readinessStatus,
    sprint: p.targetSprint,
  }));
}
