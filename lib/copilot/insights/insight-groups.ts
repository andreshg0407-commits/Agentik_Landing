/**
 * lib/copilot/insights/insight-groups.ts
 *
 * Agentik Copilot — Insight Groups
 * Sprint: AGENTIK-COPILOT-INSIGHTS-01
 *
 * Groups ranked insights into logical sections for UI consumption.
 *
 * Group definitions:
 *
 *   summary      — Observation and summary type insights (high-level context)
 *   risks        — Risk, alert, and anomaly insights
 *   opportunities — Opportunity insights
 *   attention    — High/critical severity items requiring human review
 *   explanation  — Explanation insights that provide context for suggestions
 *
 * Assignment is deterministic: type + severity determine group membership.
 * Each insight belongs to exactly one group.
 * All 5 groups are always returned (empty groups included).
 */

import type {
  CopilotInsight,
  InsightGroup,
  InsightGroupKey,
  InsightType,
  InsightSeverity,
} from "./insight-types";

// ── Group definitions ─────────────────────────────────────────────────────────

const GROUP_DEFINITIONS: Record<InsightGroupKey, { label: string; descripcion: string }> = {
  summary: {
    label:       "Resumen de contexto",
    descripcion: "Visión general del estado actual de los dominios activos.",
  },
  risks: {
    label:       "Riesgos y alertas",
    descripcion: "Condiciones que representan un riesgo o requieren atención inmediata.",
  },
  opportunities: {
    label:       "Oportunidades",
    descripcion: "Condiciones que pueden aprovecharse para mejorar el rendimiento.",
  },
  attention: {
    label:       "Requiere revisión",
    descripcion: "Elementos con severidad alta o crítica que necesitan acción humana.",
  },
  explanation: {
    label:       "Contexto y explicaciones",
    descripcion: "Contexto de por qué se sugieren determinadas acciones.",
  },
};

// ── Assignment logic ──────────────────────────────────────────────────────────

/**
 * Assigns an insight to exactly one group key.
 *
 * Precedence:
 *   1. critical severity + any type              → attention
 *   2. type = "explanation" | "summary"          → explanation / summary
 *   3. type = "opportunity"                      → opportunities
 *   4. type = "risk" | "alert" | "anomaly"       → risks
 *   5. high severity + any remaining type        → attention
 *   6. type = "observation" | "trend"            → summary
 *   7. fallback                                  → summary
 */
function assignGroup(insight: CopilotInsight): InsightGroupKey {
  const { type, severity } = insight;

  if (severity === "critical") return "attention";

  if (type === "explanation")  return "explanation";
  if (type === "summary")      return "summary";
  if (type === "opportunity")  return "opportunities";

  if (type === "risk" || type === "alert" || type === "anomaly") {
    if (severity === "high") return "risks";
    return "risks";
  }

  if (severity === "high") return "attention";

  if (type === "observation" || type === "trend") return "summary";

  return "summary";
}

// ── Grouper ───────────────────────────────────────────────────────────────────

/**
 * Groups a ranked list of insights into InsightGroup[].
 * Preserves order within each group.
 * Always returns all 5 groups.
 */
export function groupInsights(insights: CopilotInsight[]): InsightGroup[] {
  const buckets: Record<InsightGroupKey, CopilotInsight[]> = {
    summary:       [],
    risks:         [],
    opportunities: [],
    attention:     [],
    explanation:   [],
  };

  for (const insight of insights) {
    buckets[assignGroup(insight)].push(insight);
  }

  const ORDER: InsightGroupKey[] = ["attention", "risks", "summary", "opportunities", "explanation"];

  return ORDER.map(key => ({
    key,
    label:       GROUP_DEFINITIONS[key].label,
    descripcion: GROUP_DEFINITIONS[key].descripcion,
    insights:    buckets[key],
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getInsightGroup(
  groups: InsightGroup[],
  key:    InsightGroupKey,
): InsightGroup | undefined {
  return groups.find(g => g.key === key);
}

export function countGroupedInsights(groups: InsightGroup[]): number {
  return groups.reduce((sum, g) => sum + g.insights.length, 0);
}

export function getNonEmptyInsightGroups(groups: InsightGroup[]): InsightGroup[] {
  return groups.filter(g => g.insights.length > 0);
}
