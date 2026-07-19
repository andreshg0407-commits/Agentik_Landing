/**
 * lib/copilot/cross-module-reasoning/integrations/reasoning-copilot.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Copilot Adapter — bridges cross-module reasoning output to Copilot response context.
 * No DB. No server-only.
 */

import type { ReasoningResult, ReasoningRecommendation, ReasoningRisk } from "../cross-module-types";

// ── Copilot-facing summary ────────────────────────────────────────────────────

export interface CopilotReasoningSummary {
  orgSlug:            string;
  available:          boolean;
  confidenceLevel:    string;
  confidenceScore:    number;
  topRecommendations: CopilotReasoningItem[];
  topRisks:           CopilotReasoningItem[];
  narrative:          string | null;
  executionId:        string | null;
  generatedAt:        string;
}

export interface CopilotReasoningItem {
  id:          string;
  label:       string;
  description: string;
  priority:    string;
}

// ── Build copilot summary from reasoning result ───────────────────────────────

export function buildCopilotReasoningSummary(
  result:   ReasoningResult,
  maxRecs:  number = 3,
  maxRisks: number = 3,
): CopilotReasoningSummary {
  if (result.status === "ERROR") {
    return buildEmptyCopilotReasoningSummary(result.orgSlug);
  }

  const chain = result.chain;

  const topRecs = [...chain.recommendations]
    .filter(r => r.orgSlug === result.orgSlug)
    .sort((a, b) => _priorityRank(b.priority) - _priorityRank(a.priority))
    .slice(0, maxRecs)
    .map(_recToItem);

  const topRisks = [...chain.risks]
    .filter(r => r.orgSlug === result.orgSlug)
    .sort((a, b) => _severityRank(b.severity) - _severityRank(a.severity))
    .slice(0, maxRisks)
    .map(_riskToItem);

  return {
    orgSlug:            result.orgSlug,
    available:          true,
    confidenceLevel:    result.confidence.level,
    confidenceScore:    result.confidence.score,
    topRecommendations: topRecs,
    topRisks,
    narrative:          result.narrative || null,
    executionId:        result.id,
    generatedAt:        result.completedAt,
  };
}

export function buildEmptyCopilotReasoningSummary(
  orgSlug: string,
): CopilotReasoningSummary {
  return {
    orgSlug,
    available:          false,
    confidenceLevel:    "LOW",
    confidenceScore:    0,
    topRecommendations: [],
    topRisks:           [],
    narrative:          null,
    executionId:        null,
    generatedAt:        new Date().toISOString(),
  };
}

// ── Format for Copilot prompt injection ───────────────────────────────────────

export function formatReasoningForCopilotPrompt(
  summary: CopilotReasoningSummary,
): string {
  if (!summary.available) return "";

  const lines: string[] = [
    `## Razonamiento cruzado (confianza: ${summary.confidenceLevel} / ${(summary.confidenceScore * 100).toFixed(0)}%)`,
  ];

  if (summary.narrative) {
    lines.push(`\n${summary.narrative}`);
  }

  if (summary.topRisks.length > 0) {
    lines.push("\n**Riesgos detectados:**");
    for (const risk of summary.topRisks) {
      lines.push(`- [${risk.priority}] ${risk.label}: ${risk.description}`);
    }
  }

  if (summary.topRecommendations.length > 0) {
    lines.push("\n**Recomendaciones:**");
    for (const rec of summary.topRecommendations) {
      lines.push(`- [${rec.priority}] ${rec.label}: ${rec.description}`);
    }
  }

  return lines.join("\n");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _priorityRank(p: string): number {
  const ranks: Record<string, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1, MONITORING: 0 };
  return ranks[p] ?? 0;
}

function _severityRank(s: string): number {
  const ranks: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
  return ranks[s] ?? 0;
}

function _recToItem(r: ReasoningRecommendation): CopilotReasoningItem {
  return { id: r.id, label: r.title, description: r.description, priority: r.priority };
}

function _riskToItem(r: ReasoningRisk): CopilotReasoningItem {
  return { id: r.id, label: r.title, description: r.description, priority: r.severity };
}
