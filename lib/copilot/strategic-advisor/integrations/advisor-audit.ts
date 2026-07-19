// AGENTIK-STRATEGIC-ADVISOR-01 — Phase 23: Audit Integration

let _auditCounter = 0;
function _auditId(): string {
  _auditCounter = (_auditCounter + 1) % 99999;
  return `saaudit_${Date.now()}_${_auditCounter}`;
}

export type StrategicAdvisorAuditEventType =
  | "STRATEGIC_ADVICE_GENERATED"
  | "STRATEGIC_CONCERN_IDENTIFIED"
  | "STRATEGIC_OPPORTUNITY_IDENTIFIED"
  | "STRATEGIC_QUESTION_GENERATED"
  | "STRATEGIC_RECOMMENDATION_CREATED"
  | "STRATEGIC_BRIEFING_CREATED"
  | "STRATEGIC_DIGEST_CREATED"
  | "STRATEGIC_ADVISOR_RUN"
  | "STRATEGIC_GUARDRAIL_VIOLATION"
  | "STRATEGIC_CONTEXT_BUILT";

export const STRATEGIC_ADVISOR_AUDIT_EVENTS: StrategicAdvisorAuditEventType[] = [
  "STRATEGIC_ADVICE_GENERATED", "STRATEGIC_CONCERN_IDENTIFIED",
  "STRATEGIC_OPPORTUNITY_IDENTIFIED", "STRATEGIC_QUESTION_GENERATED",
  "STRATEGIC_RECOMMENDATION_CREATED", "STRATEGIC_BRIEFING_CREATED",
  "STRATEGIC_DIGEST_CREATED", "STRATEGIC_ADVISOR_RUN",
  "STRATEGIC_GUARDRAIL_VIOLATION", "STRATEGIC_CONTEXT_BUILT",
];

export interface StrategicAdvisorAuditEvent {
  readonly id:        string;
  readonly eventType: StrategicAdvisorAuditEventType;
  readonly orgSlug:   string;
  readonly metadata:  Record<string, unknown>;
  readonly occurredAt: string;
}

export function buildAdvisorAuditLog(
  eventType: StrategicAdvisorAuditEventType,
  orgSlug: string,
  metadata: Record<string, unknown>
): StrategicAdvisorAuditEvent {
  return { id: _auditId(), eventType, orgSlug, metadata, occurredAt: new Date().toISOString() };
}

export function auditAdvisoryGenerated(orgSlug: string, adviceCount: number): StrategicAdvisorAuditEvent {
  return buildAdvisorAuditLog("STRATEGIC_ADVICE_GENERATED", orgSlug, { adviceCount });
}

export function auditConcernIdentified(orgSlug: string, concernId: string, severity: string): StrategicAdvisorAuditEvent {
  return buildAdvisorAuditLog("STRATEGIC_CONCERN_IDENTIFIED", orgSlug, { concernId, severity });
}

export function auditOpportunityIdentified(orgSlug: string, oppId: string, magnitude: string): StrategicAdvisorAuditEvent {
  return buildAdvisorAuditLog("STRATEGIC_OPPORTUNITY_IDENTIFIED", orgSlug, { oppId, magnitude });
}

export function auditQuestionGenerated(orgSlug: string, questionId: string, category: string): StrategicAdvisorAuditEvent {
  return buildAdvisorAuditLog("STRATEGIC_QUESTION_GENERATED", orgSlug, { questionId, category });
}

export function auditRecommendationCreated(orgSlug: string, recId: string, priority: string): StrategicAdvisorAuditEvent {
  return buildAdvisorAuditLog("STRATEGIC_RECOMMENDATION_CREATED", orgSlug, { recId, priority });
}

export function auditBriefingCreated(orgSlug: string, briefingId: string, type: string): StrategicAdvisorAuditEvent {
  return buildAdvisorAuditLog("STRATEGIC_BRIEFING_CREATED", orgSlug, { briefingId, type });
}

export function auditDigestCreated(orgSlug: string, digestId: string, period: string): StrategicAdvisorAuditEvent {
  return buildAdvisorAuditLog("STRATEGIC_DIGEST_CREATED", orgSlug, { digestId, period });
}

export function auditAdvisorRun(orgSlug: string, runId: string, status: string, durationMs: number): StrategicAdvisorAuditEvent {
  return buildAdvisorAuditLog("STRATEGIC_ADVISOR_RUN", orgSlug, { runId, status, durationMs });
}

export function auditGuardrailViolation(orgSlug: string, message: string): StrategicAdvisorAuditEvent {
  return buildAdvisorAuditLog("STRATEGIC_GUARDRAIL_VIOLATION", orgSlug, { message });
}
