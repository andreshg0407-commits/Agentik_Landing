// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 29: Audit Events Integration

let _auditCounter = 0;

export type CouncilAuditEventType =
  | "COUNCIL_SESSION_CREATED"
  | "COUNCIL_CONSENSUS_REACHED"
  | "COUNCIL_DISAGREEMENT_DETECTED"
  | "COUNCIL_RESOLUTION_BUILT"
  | "COUNCIL_ESCALATION_REQUIRED"
  | "COUNCIL_ENGINE_COMPLETED"
  | "COUNCIL_ENGINE_FAILED"
  | "COUNCIL_TENANT_BOUNDARY_VIOLATION"
  | "COUNCIL_SESSION_ARCHIVED"
  | "COUNCIL_COMPLIANCE_FAILED";

export interface CouncilAuditEvent {
  readonly id:          string;
  readonly orgSlug:     string;
  readonly eventType:   CouncilAuditEventType;
  readonly entityId:    string;
  readonly summary:     string;
  readonly metadata:    Record<string, unknown>;
  readonly occurredAt:  string;
}

export function buildCouncilAuditEvent(input: {
  orgSlug:    string;
  eventType:  CouncilAuditEventType;
  entityId:   string;
  summary:    string;
  metadata?:  Record<string, unknown>;
}): CouncilAuditEvent {
  _auditCounter = (_auditCounter + 1) % 999999;
  return {
    id:          `caudit_${Date.now().toString(36)}_${_auditCounter}`,
    orgSlug:     input.orgSlug,
    eventType:   input.eventType,
    entityId:    input.entityId,
    summary:     input.summary,
    metadata:    input.metadata ?? {},
    occurredAt:  new Date().toISOString(),
  };
}

export const auditSessionCreated = (orgSlug: string, sessionId: string, topic: string) =>
  buildCouncilAuditEvent({ orgSlug, eventType: "COUNCIL_SESSION_CREATED", entityId: sessionId, summary: `Sesión del consejo creada: ${topic}` });

export const auditConsensusReached = (orgSlug: string, sessionId: string, outcome: string, score: number) =>
  buildCouncilAuditEvent({ orgSlug, eventType: "COUNCIL_CONSENSUS_REACHED", entityId: sessionId, summary: `Consenso: ${outcome} (${Math.round(score * 100)}%)`, metadata: { outcome, score } });

export const auditDisagreementDetected = (orgSlug: string, sessionId: string, count: number) =>
  buildCouncilAuditEvent({ orgSlug, eventType: "COUNCIL_DISAGREEMENT_DETECTED", entityId: sessionId, summary: `${count} desacuerdo(s) detectado(s)`, metadata: { count } });

export const auditResolutionBuilt = (orgSlug: string, sessionId: string, recCount: number) =>
  buildCouncilAuditEvent({ orgSlug, eventType: "COUNCIL_RESOLUTION_BUILT", entityId: sessionId, summary: `Resolución con ${recCount} recomendación(es)`, metadata: { recCount } });

export const auditEscalationRequired = (orgSlug: string, sessionId: string) =>
  buildCouncilAuditEvent({ orgSlug, eventType: "COUNCIL_ESCALATION_REQUIRED", entityId: sessionId, summary: "Escalación ejecutiva requerida" });

export const auditEngineCompleted = (orgSlug: string, sessionId: string, durationMs: number) =>
  buildCouncilAuditEvent({ orgSlug, eventType: "COUNCIL_ENGINE_COMPLETED", entityId: sessionId, summary: `Motor completado en ${durationMs}ms`, metadata: { durationMs } });

export const auditEngineFailed = (orgSlug: string, sessionId: string, error: string) =>
  buildCouncilAuditEvent({ orgSlug, eventType: "COUNCIL_ENGINE_FAILED", entityId: sessionId, summary: `Error en motor: ${error}`, metadata: { error } });

export const auditTenantBoundaryViolation = (orgSlug: string, sessionId: string) =>
  buildCouncilAuditEvent({ orgSlug, eventType: "COUNCIL_TENANT_BOUNDARY_VIOLATION", entityId: sessionId, summary: "Violación de aislamiento de tenant detectada" });

export const auditComplianceFailed = (orgSlug: string, sessionId: string, failedRules: string[]) =>
  buildCouncilAuditEvent({ orgSlug, eventType: "COUNCIL_COMPLIANCE_FAILED", entityId: sessionId, summary: `Compliance fallido: ${failedRules.join(", ")}`, metadata: { failedRules } });
