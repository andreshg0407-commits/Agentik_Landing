// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning ↔ Executive Brain integration adapter

import type { LearningEvent, LearningDomain } from "../learning-types";
import { buildLearningEvent } from "../learning-event-builder";

// Lightweight shapes to avoid importing full executive-brain module
interface ExecutiveSignalRef {
  readonly id: string;
  readonly orgSlug: string;
  readonly category: string;
  readonly severity: string;
  readonly direction: string;
  readonly confidence: number;
  readonly description: string;
}

interface ExecutiveInsightRef {
  readonly id: string;
  readonly orgSlug: string;
  readonly category: string;
  readonly confidence: number;
  readonly impact?: string;
  readonly validated?: boolean;
}

function executiveCategoryToLearningDomain(category: string): LearningDomain {
  switch (category.toUpperCase()) {
    case "FINANCE":
    case "FINANCIAL":
    case "COLLECTIONS":
      return "FINANCE";
    case "COMMERCIAL":
    case "SALES":
      return "COMMERCIAL";
    case "MARKETING":
      return "MARKETING";
    case "OPERATIONS":
      return "OPERATIONS";
    case "EXECUTIVE":
      return "EXECUTIVE";
    case "COMPLIANCE":
      return "COMPLIANCE";
    default:
      return "EXECUTIVE";
  }
}

function executiveSeverityToConfidenceScore(severity: string): number {
  switch (severity.toUpperCase()) {
    case "CRITICAL":
      return 0.95;
    case "HIGH":
      return 0.8;
    case "MEDIUM":
      return 0.65;
    case "LOW":
      return 0.45;
    default:
      return 0.5;
  }
}

export function executiveSignalToLearningEvent(
  orgSlug: string,
  signal: ExecutiveSignalRef,
  agentId?: string
): LearningEvent {
  if (signal.orgSlug !== orgSlug) {
    throw new Error(
      `Tenant isolation: executive signal belongs to "${signal.orgSlug}", not "${orgSlug}"`
    );
  }

  const domain = executiveCategoryToLearningDomain(signal.category);
  const confidenceScore = Math.min(
    signal.confidence,
    executiveSeverityToConfidenceScore(signal.severity)
  );

  const isPositive = signal.direction.toUpperCase() === "POSITIVE" ||
    signal.direction.toUpperCase() === "UP" ||
    signal.direction.toUpperCase() === "IMPROVING";

  return buildLearningEvent({
    orgSlug,
    type: isPositive ? "PATTERN_REINFORCED" : "PATTERN_WEAKENED",
    source: "EXECUTIVE_BRAIN",
    domain,
    referenceId: signal.id,
    referenceType: "PATTERN",
    confidence: confidenceScore >= 0.8 ? "HIGH" : confidenceScore >= 0.6 ? "MEDIUM" : "LOW",
    confidenceScore,
    agentId,
    metadata: {
      executiveCategory: signal.category,
      executiveSeverity: signal.severity,
      executiveDirection: signal.direction,
    },
  });
}

export function executiveInsightToLearningEvent(
  orgSlug: string,
  insight: ExecutiveInsightRef,
  agentId?: string
): LearningEvent {
  if (insight.orgSlug !== orgSlug) {
    throw new Error(
      `Tenant isolation: executive insight belongs to "${insight.orgSlug}", not "${orgSlug}"`
    );
  }

  const domain = executiveCategoryToLearningDomain(insight.category);
  const isValidated = insight.validated === true;

  return buildLearningEvent({
    orgSlug,
    type: isValidated ? "HYPOTHESIS_CONFIRMED" : "HYPOTHESIS_REJECTED",
    source: "EXECUTIVE_BRAIN",
    domain,
    referenceId: insight.id,
    referenceType: "HYPOTHESIS",
    confidence: insight.confidence >= 0.8 ? "HIGH" : "MEDIUM",
    confidenceScore: insight.confidence,
    agentId,
    metadata: {
      executiveCategory: insight.category,
      insightImpact: insight.impact,
    },
  });
}

export function buildExecutiveLearningEvents(
  orgSlug: string,
  signals: ExecutiveSignalRef[],
  insights: ExecutiveInsightRef[],
  agentId?: string
): LearningEvent[] {
  const signalEvents = signals
    .filter((s) => s.orgSlug === orgSlug)
    .map((s) => executiveSignalToLearningEvent(orgSlug, s, agentId));

  const insightEvents = insights
    .filter((i) => i.orgSlug === orgSlug)
    .map((i) => executiveInsightToLearningEvent(orgSlug, i, agentId));

  return [...signalEvents, ...insightEvents];
}
