// AGENTIK-STRATEGIC-PLANNING-01 — Phase 23: Planning Audit Events

export type PlanningAuditEventType =
  | "STRATEGIC_PLAN_CREATED"
  | "OBJECTIVE_CREATED"
  | "INITIATIVE_CREATED"
  | "MILESTONE_CREATED"
  | "ROADMAP_CREATED"
  | "PLAN_UPDATED"
  | "PLAN_ARCHIVED"
  | "TENANT_BOUNDARY_VIOLATION"
  | "COMPLIANCE_GATE_EVALUATED"
  | "PLANNING_ENGINE_STARTED"
  | "PLANNING_ENGINE_COMPLETED"
  | "PLANNING_ENGINE_FAILED";

export interface PlanningAuditEvent {
  readonly id:        string;
  readonly orgSlug:   string;
  readonly eventType: PlanningAuditEventType;
  readonly entityId:  string;
  readonly summary:   string;
  readonly metadata:  Record<string, unknown>;
  readonly occurredAt: string;
}

let _counter = 0;
function _nextId(): string {
  _counter = (_counter + 1) % 99999;
  return `paudit_${Date.now().toString(36)}_${_counter}`;
}

export function buildPlanningAuditEvent(input: {
  orgSlug:   string;
  eventType: PlanningAuditEventType;
  entityId:  string;
  summary:   string;
  metadata?: Record<string, unknown>;
}): PlanningAuditEvent {
  return {
    id:          _nextId(),
    orgSlug:     input.orgSlug,
    eventType:   input.eventType,
    entityId:    input.entityId,
    summary:     input.summary,
    metadata:    input.metadata ?? {},
    occurredAt:  new Date().toISOString(),
  };
}

export function auditPlanCreated(orgSlug: string, planId: string, title: string): PlanningAuditEvent {
  return buildPlanningAuditEvent({
    orgSlug, eventType: "STRATEGIC_PLAN_CREATED", entityId: planId,
    summary:  `Strategic plan created: "${title}"`,
    metadata: { planId, title },
  });
}

export function auditObjectiveCreated(orgSlug: string, objectiveId: string, title: string): PlanningAuditEvent {
  return buildPlanningAuditEvent({
    orgSlug, eventType: "OBJECTIVE_CREATED", entityId: objectiveId,
    summary:  `Objective created: "${title}"`,
    metadata: { objectiveId, title },
  });
}

export function auditInitiativeCreated(orgSlug: string, initiativeId: string, title: string): PlanningAuditEvent {
  return buildPlanningAuditEvent({
    orgSlug, eventType: "INITIATIVE_CREATED", entityId: initiativeId,
    summary:  `Initiative created: "${title}"`,
    metadata: { initiativeId, title },
  });
}

export function auditMilestoneCreated(orgSlug: string, milestoneId: string, title: string): PlanningAuditEvent {
  return buildPlanningAuditEvent({
    orgSlug, eventType: "MILESTONE_CREATED", entityId: milestoneId,
    summary:  `Milestone created: "${title}"`,
    metadata: { milestoneId, title },
  });
}

export function auditRoadmapCreated(orgSlug: string, roadmapId: string, title: string): PlanningAuditEvent {
  return buildPlanningAuditEvent({
    orgSlug, eventType: "ROADMAP_CREATED", entityId: roadmapId,
    summary:  `Roadmap created: "${title}"`,
    metadata: { roadmapId, title },
  });
}

export function auditPlanUpdated(orgSlug: string, planId: string, changes: string[]): PlanningAuditEvent {
  return buildPlanningAuditEvent({
    orgSlug, eventType: "PLAN_UPDATED", entityId: planId,
    summary:  `Plan updated: ${changes.join(", ")}`,
    metadata: { planId, changes },
  });
}

export function auditPlanArchived(orgSlug: string, planId: string): PlanningAuditEvent {
  return buildPlanningAuditEvent({
    orgSlug, eventType: "PLAN_ARCHIVED", entityId: planId,
    summary:  `Plan archived: ${planId}`,
    metadata: { planId },
  });
}

export function auditTenantBoundaryViolation(orgSlug: string, violatingId: string, detail: string): PlanningAuditEvent {
  return buildPlanningAuditEvent({
    orgSlug, eventType: "TENANT_BOUNDARY_VIOLATION", entityId: violatingId,
    summary:  `Tenant boundary violation: ${detail}`,
    metadata: { violatingId, detail },
  });
}

export function auditEngineCompleted(orgSlug: string, planId: string, duration: number): PlanningAuditEvent {
  return buildPlanningAuditEvent({
    orgSlug, eventType: "PLANNING_ENGINE_COMPLETED", entityId: planId,
    summary:  `Planning engine completed for plan ${planId} in ${duration}ms`,
    metadata: { planId, duration },
  });
}

export function auditEngineFailed(orgSlug: string, reason: string): PlanningAuditEvent {
  return buildPlanningAuditEvent({
    orgSlug, eventType: "PLANNING_ENGINE_FAILED", entityId: "engine",
    summary:  `Planning engine failed: ${reason}`,
    metadata: { reason },
  });
}
