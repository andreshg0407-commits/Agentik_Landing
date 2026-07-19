// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Integration: Strategic Memory ↔ Agent Learning (bidirectional)

import type { StrategicMemoryEntry } from "../strategic-memory-types";
import type { StrategicMemoryInput } from "../strategic-memory-builder";

// ── Agent Learning → Strategic Memory ────────────────────────────────────────

export interface AgentLearningOutcomeHint {
  readonly id: string;
  readonly orgSlug: string;
  readonly agentId: string;
  readonly domain: string;
  readonly outcome: "SUCCESS" | "FAILURE" | "PARTIAL";
  readonly description: string;
  readonly confidenceScore: number;
  readonly occurredAt: string;
}

export function agentOutcomeToStrategicInput(
  outcome: AgentLearningOutcomeHint,
  expectedOrgSlug: string
): StrategicMemoryInput | null {
  if (outcome.orgSlug !== expectedOrgSlug) return null;
  if (outcome.outcome === "FAILURE" && outcome.confidenceScore < 0.4) return null;

  const type: StrategicMemoryInput["type"] =
    outcome.outcome === "SUCCESS" ? "LESSON" :
    outcome.outcome === "FAILURE" ? "RISK" :
    "INSIGHT";

  const priority: StrategicMemoryInput["priority"] =
    outcome.outcome === "FAILURE" ? "HIGH" :
    outcome.confidenceScore >= 0.8 ? "HIGH" : "MEDIUM";

  return {
    orgSlug: outcome.orgSlug,
    type,
    priority,
    domain: mapAgentDomainToStrategic(outcome.domain),
    title: `Agent ${outcome.agentId} — ${outcome.outcome}: ${outcome.description.slice(0, 80)}`,
    description: outcome.description.slice(0, 500),
    rationale: `Agent learning outcome ${outcome.id} — outcome: ${outcome.outcome}, confidence: ${(outcome.confidenceScore * 100).toFixed(0)}%`,
    confidenceScore: outcome.confidenceScore,
    source: "AGENT",
    agentId: outcome.agentId,
    evidenceIds: [outcome.id],
  };
}

export function buildStrategicInputsFromAgentLearning(
  outcomes: AgentLearningOutcomeHint[],
  orgSlug: string
): StrategicMemoryInput[] {
  return outcomes
    .filter((o) => o.orgSlug === orgSlug)
    .map((o) => agentOutcomeToStrategicInput(o, orgSlug))
    .filter((i): i is StrategicMemoryInput => i !== null);
}

// ── Strategic Memory → Agent Learning ────────────────────────────────────────

export interface StrategicLearningFeedback {
  readonly orgSlug: string;
  readonly agentId: string | null;
  readonly domain: string;
  readonly feedbackType: "REINFORCE" | "WEAKEN" | "NEUTRAL";
  readonly magnitude: number; // 0–1
  readonly rationale: string;
  readonly sourceEntryId: string;
}

export function strategicEntryToLearningFeedback(
  entry: StrategicMemoryEntry,
  orgSlug: string
): StrategicLearningFeedback | null {
  if (entry.orgSlug !== orgSlug) return null;

  const feedbackType: StrategicLearningFeedback["feedbackType"] =
    entry.type === "LESSON" || entry.type === "OPPORTUNITY" ? "REINFORCE" :
    entry.type === "RISK" && entry.priority === "CRITICAL" ? "WEAKEN" :
    "NEUTRAL";

  if (feedbackType === "NEUTRAL") return null;

  return {
    orgSlug,
    agentId: entry.agentId ?? null,
    domain: mapStrategicDomainToAgentDomain(entry.domain),
    feedbackType,
    magnitude: entry.strategicScore,
    rationale: `Strategic memory ${entry.type}: ${entry.title}`,
    sourceEntryId: entry.id,
  };
}

export function buildLearningFeedbackFromStrategic(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicLearningFeedback[] {
  return entries
    .filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE")
    .map((e) => strategicEntryToLearningFeedback(e, orgSlug))
    .filter((f): f is StrategicLearningFeedback => f !== null);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapAgentDomainToStrategic(domain: string): StrategicMemoryInput["domain"] {
  switch (domain.toUpperCase()) {
    case "FINANCE": return "FINANCE";
    case "COMMERCIAL": return "COMMERCIAL";
    case "MARKETING": return "MARKETING";
    case "OPERATIONS": return "OPERATIONS";
    case "EXECUTIVE": return "EXECUTIVE";
    case "COMPLIANCE": return "COMPLIANCE";
    default: return "CROSS_DOMAIN";
  }
}

function mapStrategicDomainToAgentDomain(domain: string): string {
  switch (domain) {
    case "FINANCE": return "FINANCE";
    case "COMMERCIAL": return "COMMERCIAL";
    case "MARKETING": return "MARKETING";
    case "OPERATIONS": return "OPERATIONS";
    case "EXECUTIVE": return "EXECUTIVE";
    case "COMPLIANCE": return "COMPLIANCE";
    default: return "GENERAL";
  }
}
