// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Integration: Strategic Memory ↔ Copilot

import type { StrategicMemoryEntry, StrategicMemoryContext } from "../strategic-memory-types";

// ── Copilot Hint Types ────────────────────────────────────────────────────────

export interface StrategicCopilotHint {
  readonly orgSlug: string;
  readonly headline: string;
  readonly contextLines: string[];
  readonly criticalAlerts: string[];
  readonly suggestedTone: "CONFIDENT" | "CAUTIOUS" | "NEUTRAL";
  readonly strategicScore: number;
  readonly generatedAt: string;
}

export interface StrategicCopilotPromptContext {
  readonly systemInstructions: string;
  readonly contextBlock: string;
  readonly alertBlock: string;
}

// ── Adapters ──────────────────────────────────────────────────────────────────

export function buildStrategicCopilotHint(
  entries: StrategicMemoryEntry[],
  orgSlug: string
): StrategicCopilotHint {
  const active = entries.filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE");
  const critical = active.filter((e) => e.priority === "CRITICAL");
  const goals = active.filter((e) => e.type === "GOAL" || e.type === "OBJECTIVE");
  const risks = active.filter((e) => e.type === "RISK");

  const avgScore =
    active.length > 0
      ? active.reduce((s, e) => s + e.strategicScore, 0) / active.length
      : 0;

  const contextLines: string[] = [];
  if (goals.length > 0) {
    contextLines.push(`Active goals: ${goals.slice(0, 3).map((g) => g.title).join(", ")}`);
  }
  if (risks.length > 0) {
    contextLines.push(`Active risks: ${risks.slice(0, 3).map((r) => r.title).join(", ")}`);
  }

  const criticalAlerts = critical.slice(0, 5).map(
    (c) => `[CRITICAL/${c.type}] ${c.title}`
  );

  const suggestedTone: StrategicCopilotHint["suggestedTone"] =
    critical.length > 0 ? "CAUTIOUS" :
    avgScore >= 0.7 ? "CONFIDENT" :
    "NEUTRAL";

  const headline =
    active.length > 0
      ? `${active.length} strategic items — Score: ${(avgScore * 100).toFixed(0)}%`
      : "No active strategic context";

  return {
    orgSlug,
    headline,
    contextLines,
    criticalAlerts,
    suggestedTone,
    strategicScore: avgScore,
    generatedAt: new Date().toISOString(),
  };
}

export function buildStrategicCopilotPromptContext(
  hint: StrategicCopilotHint
): StrategicCopilotPromptContext {
  const systemInstructions =
    hint.suggestedTone === "CAUTIOUS"
      ? "Approach with caution — critical strategic risks are active. Prioritize risk mitigation."
      : hint.suggestedTone === "CONFIDENT"
      ? "Strategic posture is strong. Focus on goal execution and opportunity capture."
      : "Balanced strategic context. Focus on clarity and measured recommendations.";

  const contextBlock =
    hint.contextLines.length > 0
      ? `Strategic Context:\n${hint.contextLines.map((l) => `• ${l}`).join("\n")}`
      : "No current strategic context.";

  const alertBlock =
    hint.criticalAlerts.length > 0
      ? `CRITICAL ALERTS:\n${hint.criticalAlerts.map((a) => `⚠ ${a}`).join("\n")}`
      : "";

  return { systemInstructions, contextBlock, alertBlock };
}

export function formatStrategicContextForPrompt(
  context: StrategicMemoryContext,
  orgSlug: string
): string {
  if (context.orgSlug !== orgSlug) return "";

  const parts: string[] = [];

  if (context.activeGoals.length > 0) {
    parts.push(`Goals: ${context.activeGoals.slice(0, 3).map((g) => g.title).join(", ")}`);
  }
  if (context.criticalRisks.length > 0) {
    parts.push(`CRITICAL RISKS: ${context.criticalRisks.slice(0, 3).map((r) => r.title).join(", ")}`);
  }
  if (context.recentDecisions.length > 0) {
    parts.push(`Recent decisions: ${context.recentDecisions.slice(0, 3).map((d) => d.title).join(", ")}`);
  }
  if (context.activeCommitments.length > 0) {
    parts.push(`Active commitments: ${context.activeCommitments.length}`);
  }

  return parts.length > 0 ? `[Strategic Memory] ${parts.join(" | ")}` : "";
}

export function getStrategicToneModifier(entries: StrategicMemoryEntry[], orgSlug: string): string {
  const critical = entries.filter(
    (e) => e.orgSlug === orgSlug && e.priority === "CRITICAL" && e.status === "ACTIVE"
  );
  if (critical.length >= 3) return "VERY_CAUTIOUS";
  if (critical.length >= 1) return "CAUTIOUS";
  const avgScore =
    entries.length > 0
      ? entries.filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE")
              .reduce((s, e) => s + e.strategicScore, 0) /
        Math.max(1, entries.filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE").length)
      : 0;
  return avgScore >= 0.7 ? "CONFIDENT" : "NEUTRAL";
}
