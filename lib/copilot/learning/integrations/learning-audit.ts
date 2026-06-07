// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning audit adapter — audit trail for learning lifecycle

import type {
  LearningEvent,
  LearningPattern,
  LearningResult,
  LearningAdjustment,
} from "../learning-types";

export type LearningAuditEventType =
  | "LEARNING_EVENT_CREATED"
  | "PATTERN_CREATED"
  | "PATTERN_REINFORCED"
  | "PATTERN_WEAKENED"
  | "PATTERN_DEPRECATED"
  | "ADJUSTMENT_SUGGESTED"
  | "ADJUSTMENT_APPLIED"
  | "LEARNING_CYCLE_COMPLETED"
  | "GUARDRAIL_TRIGGERED"
  | "TENANT_ISOLATION_ENFORCED";

export interface LearningAuditRecord {
  readonly id: string;
  readonly orgSlug: string;
  readonly eventType: LearningAuditEventType;
  readonly entityId: string;
  readonly entityType: "LEARNING_EVENT" | "PATTERN" | "ADJUSTMENT" | "RESULT";
  readonly description: string;
  readonly metadata: Record<string, unknown>;
  readonly occurredAt: string; // ISO8601
}

function generateAuditId(): string {
  return `learn_aud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function auditLearningEvent(event: LearningEvent): LearningAuditRecord {
  return {
    id: generateAuditId(),
    orgSlug: event.orgSlug,
    eventType: "LEARNING_EVENT_CREATED",
    entityId: event.id,
    entityType: "LEARNING_EVENT",
    description: `Learning event ${event.type} created from source ${event.source} in domain ${event.domain}`,
    metadata: {
      eventType: event.type,
      source: event.source,
      domain: event.domain,
      confidenceScore: event.confidenceScore,
      agentId: event.agentId,
    },
    occurredAt: new Date().toISOString(),
  };
}

export function auditPatternCreated(pattern: LearningPattern): LearningAuditRecord {
  return {
    id: generateAuditId(),
    orgSlug: pattern.orgSlug,
    eventType: "PATTERN_CREATED",
    entityId: pattern.id,
    entityType: "PATTERN",
    description: `Pattern "${pattern.name}" created in domain ${pattern.domain}`,
    metadata: {
      domain: pattern.domain,
      agentId: pattern.agentId,
      initialConfidence: pattern.confidenceScore,
    },
    occurredAt: new Date().toISOString(),
  };
}

export function auditPatternUpdated(
  pattern: LearningPattern,
  wasReinforced: boolean
): LearningAuditRecord {
  return {
    id: generateAuditId(),
    orgSlug: pattern.orgSlug,
    eventType: wasReinforced ? "PATTERN_REINFORCED" : "PATTERN_WEAKENED",
    entityId: pattern.id,
    entityType: "PATTERN",
    description: `Pattern "${pattern.name}" ${wasReinforced ? "reinforced" : "weakened"} — net score: ${pattern.netScore}`,
    metadata: {
      netScore: pattern.netScore,
      reinforcementCount: pattern.reinforcementCount,
      weakeningCount: pattern.weakeningCount,
      status: pattern.status,
      confidenceScore: pattern.confidenceScore,
    },
    occurredAt: new Date().toISOString(),
  };
}

export function auditAdjustmentSuggested(adjustment: LearningAdjustment): LearningAuditRecord {
  return {
    id: generateAuditId(),
    orgSlug: adjustment.orgSlug,
    eventType: "ADJUSTMENT_SUGGESTED",
    entityId: adjustment.id,
    entityType: "ADJUSTMENT",
    description: `Confidence adjustment suggested: ${adjustment.direction} by ${(adjustment.magnitude * 100).toFixed(1)}% for pattern ${adjustment.patternId}`,
    metadata: {
      direction: adjustment.direction,
      magnitude: adjustment.magnitude,
      patternId: adjustment.patternId,
      domain: adjustment.domain,
    },
    occurredAt: new Date().toISOString(),
  };
}

export function auditLearningCycle(result: LearningResult): LearningAuditRecord {
  return {
    id: generateAuditId(),
    orgSlug: result.orgSlug,
    eventType: "LEARNING_CYCLE_COMPLETED",
    entityId: result.id,
    entityType: "RESULT",
    description: `Learning cycle completed: ${result.eventsProcessed} events, ${result.patternsUpdated} patterns, status=${result.status}`,
    metadata: {
      status: result.status,
      eventsProcessed: result.eventsProcessed,
      patternsUpdated: result.patternsUpdated,
      signalsGenerated: result.signalsGenerated,
      adjustmentsSuggested: result.adjustmentsSuggested,
      durationMs: result.durationMs,
    },
    occurredAt: new Date().toISOString(),
  };
}

export function buildLearningAuditLog(
  events: LearningEvent[],
  patterns: LearningPattern[],
  adjustments: LearningAdjustment[],
  result: LearningResult
): LearningAuditRecord[] {
  const records: LearningAuditRecord[] = [];

  for (const event of events) {
    records.push(auditLearningEvent(event));
  }

  for (const pattern of patterns) {
    records.push(auditPatternCreated(pattern));
  }

  for (const adj of adjustments) {
    records.push(auditAdjustmentSuggested(adj));
  }

  records.push(auditLearningCycle(result));

  return records;
}
