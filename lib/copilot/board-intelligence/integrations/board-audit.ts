// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 28: Audit Integration

let _auditCounter = 0;

function nextAuditId(): string {
  return `baud_${Date.now().toString(36)}_${(++_auditCounter).toString(36).padStart(4, "0")}`;
}

// ── Types ───────────────────────────────────────────────────────────────────

export type BoardAuditEventType =
  | "BOARD_SESSION_CREATED"
  | "BOARD_GOVERNANCE_ASSESSED"
  | "BOARD_STRATEGIC_ASSESSED"
  | "BOARD_RISKS_IDENTIFIED"
  | "BOARD_OPPORTUNITIES_IDENTIFIED"
  | "BOARD_RESOLUTION_GENERATED"
  | "BOARD_BRIEFING_GENERATED"
  | "BOARD_DIGEST_GENERATED"
  | "BOARD_NARRATIVE_GENERATED"
  | "BOARD_COMPLIANCE_CHECKED"
  | "BOARD_TENANT_ISOLATION_VIOLATION"
  | "BOARD_PIPELINE_FAILED";

export interface BoardAuditEvent {
  readonly id:            string;
  readonly orgSlug:       string;
  readonly sessionId:     string;
  readonly eventType:     BoardAuditEventType;
  readonly timestamp:     string;
  readonly metadata:      Record<string, unknown>;
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildBoardAuditEvent(
  orgSlug:   string,
  sessionId: string,
  eventType: BoardAuditEventType,
  metadata:  Record<string, unknown> = {}
): BoardAuditEvent {
  return {
    id:        nextAuditId(),
    orgSlug,
    sessionId,
    eventType,
    timestamp: new Date().toISOString(),
    metadata,
  };
}

// ── Named constructors ──────────────────────────────────────────────────────

export const auditBoardSessionCreated = (
  orgSlug: string, sessionId: string, topic: string
): BoardAuditEvent =>
  buildBoardAuditEvent(orgSlug, sessionId, "BOARD_SESSION_CREATED", { topic });

export const auditBoardGovernanceAssessed = (
  orgSlug: string, sessionId: string, governanceScore: number, status: string
): BoardAuditEvent =>
  buildBoardAuditEvent(orgSlug, sessionId, "BOARD_GOVERNANCE_ASSESSED", { governanceScore, status });

export const auditBoardStrategicAssessed = (
  orgSlug: string, sessionId: string, strategicScore: number
): BoardAuditEvent =>
  buildBoardAuditEvent(orgSlug, sessionId, "BOARD_STRATEGIC_ASSESSED", { strategicScore });

export const auditBoardRisksIdentified = (
  orgSlug: string, sessionId: string, count: number, criticalCount: number
): BoardAuditEvent =>
  buildBoardAuditEvent(orgSlug, sessionId, "BOARD_RISKS_IDENTIFIED", { count, criticalCount });

export const auditBoardResolutionGenerated = (
  orgSlug: string, sessionId: string, outcome: string, confidence: string
): BoardAuditEvent =>
  buildBoardAuditEvent(orgSlug, sessionId, "BOARD_RESOLUTION_GENERATED", { outcome, confidence, suggestedOnly: true });

export const auditBoardBriefingGenerated = (
  orgSlug: string, sessionId: string, type: string
): BoardAuditEvent =>
  buildBoardAuditEvent(orgSlug, sessionId, "BOARD_BRIEFING_GENERATED", { type });

export const auditBoardComplianceChecked = (
  orgSlug: string, sessionId: string, passed: boolean, failedChecks: string[]
): BoardAuditEvent =>
  buildBoardAuditEvent(orgSlug, sessionId, "BOARD_COMPLIANCE_CHECKED", { passed, failedChecks });

export const auditBoardTenantIsolationViolation = (
  orgSlug: string, sessionId: string, violatingOrgSlug: string
): BoardAuditEvent =>
  buildBoardAuditEvent(orgSlug, sessionId, "BOARD_TENANT_ISOLATION_VIOLATION", { violatingOrgSlug });

export const auditBoardPipelineFailed = (
  orgSlug: string, sessionId: string, error: string
): BoardAuditEvent =>
  buildBoardAuditEvent(orgSlug, sessionId, "BOARD_PIPELINE_FAILED", { error });
