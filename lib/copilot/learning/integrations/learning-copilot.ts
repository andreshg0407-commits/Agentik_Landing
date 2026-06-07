// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning ↔ Copilot integration adapter

import type {
  LearningPattern,
  LearningApplicationContext,
  LearningDomain,
} from "../learning-types";

export interface CopilotLearningHint {
  readonly domain: LearningDomain;
  readonly confidenceBoost: number; // 0–1
  readonly confidencePenalty: number; // 0–1
  readonly activePatterns: number;
  readonly topPatternNames: string[];
  readonly suggestedTone: "CONFIDENT" | "CAUTIOUS" | "NEUTRAL";
}

export interface CopilotLearningPromptContext {
  readonly preamble: string;
  readonly hints: CopilotLearningHint[];
  readonly overallBoost: number;
  readonly overallPenalty: number;
}

export function buildCopilotLearningHint(
  context: LearningApplicationContext
): CopilotLearningHint {
  const net = context.confidenceBoost - context.confidencePenalty;
  const suggestedTone: "CONFIDENT" | "CAUTIOUS" | "NEUTRAL" =
    net >= 0.1 ? "CONFIDENT" : net <= -0.1 ? "CAUTIOUS" : "NEUTRAL";

  const topPatternNames = context.patterns
    .slice(0, 3)
    .map((p) => p.name);

  return {
    domain: context.domain,
    confidenceBoost: context.confidenceBoost,
    confidencePenalty: context.confidencePenalty,
    activePatterns: context.patterns.length,
    topPatternNames,
    suggestedTone,
  };
}

export function buildCopilotLearningPromptContext(
  hints: CopilotLearningHint[]
): CopilotLearningPromptContext {
  const overallBoost =
    hints.length > 0
      ? hints.reduce((sum, h) => sum + h.confidenceBoost, 0) / hints.length
      : 0;
  const overallPenalty =
    hints.length > 0
      ? hints.reduce((sum, h) => sum + h.confidencePenalty, 0) / hints.length
      : 0;

  const lines: string[] = [];

  if (overallBoost > 0.05) {
    lines.push(
      `Learning context indicates positive patterns across ${hints.length} domain(s). ` +
        `Confidence may be elevated by up to ${(overallBoost * 100).toFixed(0)}%.`
    );
  }

  if (overallPenalty > 0.05) {
    lines.push(
      `Learning context indicates caution in ${hints.filter((h) => h.confidencePenalty > 0.05).length} domain(s). ` +
        `Apply ${(overallPenalty * 100).toFixed(0)}% confidence reduction.`
    );
  }

  if (lines.length === 0) {
    lines.push("No significant learning patterns detected. Use baseline confidence.");
  }

  return {
    preamble: lines.join(" "),
    hints,
    overallBoost,
    overallPenalty,
  };
}

export function formatLearningForCopilotPrompt(
  context: CopilotLearningPromptContext
): string {
  if (context.hints.length === 0) return "";

  const parts: string[] = [
    `[Learning Context] ${context.preamble}`,
  ];

  for (const hint of context.hints.filter((h) => h.activePatterns > 0)) {
    parts.push(
      `- ${hint.domain}: ${hint.activePatterns} active pattern(s), tone=${hint.suggestedTone}`
    );
  }

  return parts.join("\n");
}
