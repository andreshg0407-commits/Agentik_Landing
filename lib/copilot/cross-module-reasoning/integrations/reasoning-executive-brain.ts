/**
 * lib/copilot/cross-module-reasoning/integrations/reasoning-executive-brain.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Executive Brain Adapter — converts Executive Brain signals and insights into
 * ReasoningSignal and ReasoningEvidence.
 * No DB. No server-only.
 */

import type {
  ExecutiveSignal,
  ExecutiveInsight,
  ExecutiveContext,
  ExecutiveSignalCategory,
} from "@/lib/copilot/executive-brain/executive-brain-types";
import type { ReasoningSignal, ReasoningEvidence, ReasoningSourceDomain } from "../cross-module-types";
import { generateCmrId } from "../cross-module-types";

// ── Category → Domain mapping ─────────────────────────────────────────────────

const CATEGORY_TO_DOMAIN: Record<ExecutiveSignalCategory, ReasoningSourceDomain> = {
  FINANCE:     "FINANCE",
  COMMERCIAL:  "COMMERCIAL",
  COLLECTIONS: "COLLECTIONS",
  MARKETING:   "MARKETING",
  OPERATIONS:  "EXECUTIVE",
  EXECUTIVE:   "EXECUTIVE",
};

// ── ExecutiveSignal → ReasoningSignal ─────────────────────────────────────────

export function executiveSignalToReasoningSignal(
  orgSlug: string,
  signal: ExecutiveSignal,
): ReasoningSignal {
  const severityMap: Record<string, ReasoningSignal["severity"]> = {
    CRITICAL: "CRITICAL",
    HIGH:     "HIGH",
    MEDIUM:   "MEDIUM",
    LOW:      "LOW",
  };

  // Map direction to reasoning signal direction
  const directionMap: Record<string, ReasoningSignal["direction"]> = {
    IMPROVING: "UP",
    STABLE:    "STABLE",
    DECLINING: "DOWN",
  };

  return {
    id:          generateCmrId("sig"),
    orgSlug,
    type:        "ALERT",
    domain:      CATEGORY_TO_DOMAIN[signal.category] ?? "EXECUTIVE",
    label:       signal.title,
    description: signal.description,
    direction:   directionMap[signal.direction],
    severity:    severityMap[signal.severity] ?? "LOW",
    confidence:  signal.confidence,
    source:      signal.source,
    metadata:    {
      signalId:  signal.id,
      category:  signal.category,
      direction: signal.direction,
      ...signal.metadata,
    },
    detectedAt:  signal.generatedAt,
  };
}

// ── ExecutiveInsight → ReasoningEvidence ──────────────────────────────────────

export function executiveInsightToEvidence(
  orgSlug: string,
  insight: ExecutiveInsight,
): ReasoningEvidence {
  const priorityToStrength: Record<string, number> = {
    CRITICAL: 0.95,
    HIGH:     0.80,
    MEDIUM:   0.60,
    LOW:      0.40,
  };

  // Derive primary domain from first category
  const primaryCategory = insight.categories[0] ?? "EXECUTIVE";
  const domain = CATEGORY_TO_DOMAIN[primaryCategory as ExecutiveSignalCategory] ?? "EXECUTIVE";

  return {
    id:          generateCmrId("ev"),
    orgSlug,
    type:        "EXECUTIVE_INSIGHT",
    domain,
    label:       insight.title,
    description: insight.summary,
    strength:    priorityToStrength[insight.priority] ?? 0.5,
    reliability: 0.85,  // executive insights are high-reliability
    sourceRef:   insight.id,
    sourceType:  "executive_insight",
    metadata:    {
      insightId:         insight.id,
      priority:          insight.priority,
      categories:        insight.categories,
      supportingSignals: insight.supportingSignals,
    },
    collectedAt: new Date().toISOString(),
  };
}

// ── ExecutiveContext → Reasoning inputs ───────────────────────────────────────

export interface ExecutiveBrainReasoningInput {
  orgSlug:  string;
  signals:  ReasoningSignal[];
  evidence: ReasoningEvidence[];
}

export function executiveContextToReasoningInput(
  ctx: ExecutiveContext,
): ExecutiveBrainReasoningInput {
  const signals = ctx.signals
    .filter(s => s.confidence >= 0.2)
    .map(s => executiveSignalToReasoningSignal(ctx.orgSlug, s));

  const evidence = ctx.insights
    .map(i => executiveInsightToEvidence(ctx.orgSlug, i));

  return {
    orgSlug: ctx.orgSlug,
    signals,
    evidence,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function filterCriticalExecutiveSignals(
  signals: ExecutiveSignal[],
): ExecutiveSignal[] {
  return signals.filter(
    s => s.severity === "CRITICAL" || s.severity === "HIGH",
  );
}

export function filterExecutiveSignalsByCategory(
  signals: ExecutiveSignal[],
  category: ExecutiveSignalCategory,
): ExecutiveSignal[] {
  return signals.filter(s => s.category === category);
}
