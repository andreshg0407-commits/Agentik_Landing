// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Integration: Strategic Memory ↔ Cross-Module Reasoning

import type { StrategicMemoryEntry } from "../strategic-memory-types";
import type { StrategicMemoryInput } from "../strategic-memory-builder";

// Minimal cross-module reasoning interfaces
export interface CrossModuleHypothesis {
  readonly id: string;
  readonly orgSlug: string;
  readonly domain: string;
  readonly title: string;
  readonly description: string;
  readonly confidence: number;
  readonly status: "SUPPORTED" | "CONTRADICTED" | "UNRESOLVED";
  readonly contradicted: boolean;
  readonly createdAt: string;
}

export interface CrossModuleRecommendation {
  readonly id: string;
  readonly orgSlug: string;
  readonly domain: string;
  readonly title: string;
  readonly rationale: string;
  readonly confidence: number;
  readonly accepted: boolean;
  readonly createdAt: string;
}

// ── Adapters ──────────────────────────────────────────────────────────────────

export function hypothesisToStrategicInput(
  hypothesis: CrossModuleHypothesis,
  expectedOrgSlug: string
): StrategicMemoryInput | null {
  if (hypothesis.orgSlug !== expectedOrgSlug) return null;
  if (hypothesis.status !== "SUPPORTED") return null;
  if (hypothesis.contradicted) return null;
  if (hypothesis.confidence < 0.5) return null;

  return {
    orgSlug: hypothesis.orgSlug,
    type: "ASSUMPTION",
    priority: hypothesis.confidence >= 0.8 ? "HIGH" : "MEDIUM",
    domain: mapReasoningDomainToStrategic(hypothesis.domain),
    title: `Validated Hypothesis: ${hypothesis.title}`,
    description: hypothesis.description.slice(0, 500),
    rationale: `Cross-module reasoning confirmed hypothesis ${hypothesis.id} with confidence ${(hypothesis.confidence * 100).toFixed(0)}%`,
    confidenceScore: hypothesis.confidence,
    source: "SYSTEM",
    evidenceIds: [hypothesis.id],
  };
}

export function recommendationToStrategicInput(
  recommendation: CrossModuleRecommendation,
  expectedOrgSlug: string
): StrategicMemoryInput | null {
  if (recommendation.orgSlug !== expectedOrgSlug) return null;
  if (!recommendation.accepted) return null;

  return {
    orgSlug: recommendation.orgSlug,
    type: "DECISION",
    priority: recommendation.confidence >= 0.8 ? "HIGH" : "MEDIUM",
    domain: mapReasoningDomainToStrategic(recommendation.domain),
    title: `Accepted Recommendation: ${recommendation.title}`,
    description: recommendation.rationale.slice(0, 500),
    rationale: `Cross-module recommendation ${recommendation.id} accepted`,
    confidenceScore: recommendation.confidence,
    source: "SYSTEM",
    evidenceIds: [recommendation.id],
  };
}

export function buildCrossModuleStrategicContext(
  entries: StrategicMemoryEntry[],
  domain: string,
  orgSlug: string
): {
  goals: StrategicMemoryEntry[];
  risks: StrategicMemoryEntry[];
  decisions: StrategicMemoryEntry[];
  context: string;
} {
  const scoped = entries.filter(
    (e) => e.orgSlug === orgSlug && e.status === "ACTIVE" &&
    (e.domain === domain || e.domain === "CROSS_DOMAIN")
  );

  const goals = scoped.filter((e) => e.type === "GOAL" || e.type === "OBJECTIVE");
  const risks = scoped.filter((e) => e.type === "RISK");
  const decisions = scoped.filter((e) => e.type === "DECISION");

  const context = [
    goals.length > 0 ? `Goals: ${goals.map((g) => g.title).slice(0, 3).join(", ")}` : null,
    risks.length > 0 ? `Risks: ${risks.map((r) => r.title).slice(0, 3).join(", ")}` : null,
    decisions.length > 0 ? `Decisions: ${decisions.map((d) => d.title).slice(0, 3).join(", ")}` : null,
  ].filter(Boolean).join(" | ") || "No strategic context for this domain.";

  return { goals, risks, decisions, context };
}

export function findConflictingStrategicEntries(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicMemoryEntry[][] {
  const active = entries.filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE");
  const conflicts: StrategicMemoryEntry[][] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];
      // Detect conflicting risks vs opportunities in same domain
      if (
        a.domain === b.domain &&
        ((a.type === "RISK" && b.type === "OPPORTUNITY") ||
         (a.type === "CONSTRAINT" && b.type === "GOAL"))
      ) {
        conflicts.push([a, b]);
      }
    }
  }

  return conflicts;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function mapReasoningDomainToStrategic(domain: string): StrategicMemoryInput["domain"] {
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
