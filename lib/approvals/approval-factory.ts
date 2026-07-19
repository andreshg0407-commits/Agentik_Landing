/**
 * lib/approvals/approval-factory.ts
 *
 * Agentik — Approval Factory Functions
 * Sprint: AGENTIK-APPROVALS-FOUNDATION-01
 *
 * Pure factory functions for creating all approval domain objects.
 * No Prisma. No React. No side effects.
 */

import type {
  ApprovalActor,
  ApprovalActorType,
  ApprovalAuditEvent,
  ApprovalAuditEventType,
  ApprovalCreationInput,
  ApprovalDecision,
  ApprovalDecisionId,
  ApprovalRelationship,
  ApprovalRequest,
  ApprovalRequestId,
} from "./approval-types";

// ── ID generation ─────────────────────────────────────────────────────────────

function generateApprovalRequestId(): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `approval_req_${Date.now()}_${rand}`;
}

function generateApprovalDecisionId(): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `approval_dec_${Date.now()}_${rand}`;
}

// ── Well-known actors ─────────────────────────────────────────────────────────

export const SYSTEM_APPROVER: ApprovalActor = {
  id:   "system",
  type: "SYSTEM",
  name: "Sistema",
};

export const DIEGO_APPROVER: ApprovalActor = {
  id:   "diego",
  type: "AGENT",
  name: "Diego",
};

export const LUCA_APPROVER: ApprovalActor = {
  id:   "luca",
  type: "AGENT",
  name: "Luca",
};

export const MILA_APPROVER: ApprovalActor = {
  id:   "mila",
  type: "AGENT",
  name: "Mila",
};

// ── Factory functions ─────────────────────────────────────────────────────────

/**
 * Create an ApprovalActor.
 */
export function createApprovalActor(
  id:   string,
  type: ApprovalActorType,
  name: string,
): ApprovalActor {
  return { id, type, name };
}

/**
 * Create an ApprovalRelationship.
 */
export function createApprovalRelationship(
  type:          string,
  entityType:    string,
  entityId:      string,
  entityLabel?:  string,
): ApprovalRelationship {
  return { type, entityType, entityId, entityLabel };
}

/**
 * Create an ApprovalAuditEvent.
 */
export function createApprovalAuditEvent(
  type:      ApprovalAuditEventType,
  actor:     ApprovalActor,
  previous?: Record<string, unknown>,
  next?:     Record<string, unknown>,
  comment?:  string,
): ApprovalAuditEvent {
  return {
    type,
    occurredAt: new Date().toISOString(),
    actorId:    actor.id,
    actorType:  actor.type,
    previous,
    next,
    comment,
  };
}

/**
 * Create a full ApprovalRequest from a creation input.
 * Status starts as PENDING. Audit trail seeded with a "created" event.
 */
export function createApprovalRequest(
  input: ApprovalCreationInput,
): ApprovalRequest {
  const now = new Date().toISOString();

  const initialAuditEvent = createApprovalAuditEvent(
    "created",
    input.requestor,
    undefined,
    { status: "PENDING", priority: input.priority ?? "MEDIUM" },
    "Solicitud de aprobación generada.",
  );

  return {
    id:             generateApprovalRequestId(),
    title:          input.title,
    description:    input.description,
    status:         "PENDING",
    priority:       input.priority ?? "MEDIUM",
    source:         input.source,
    category:       input.category,
    requestor:      input.requestor,
    approver:       input.approver,
    context:        input.context,
    relationships:  input.relationships ?? [],
    auditTrail:     [initialAuditEvent],
    decision:       undefined,
    createdAt:      now,
    updatedAt:      now,
    expiresAt:       input.expiresAt,
    metadata:        input.metadata ?? {},
    idempotencyKey:  input.idempotencyKey,
  };
}

/**
 * Create an ApprovalDecision (approve or reject).
 * Does not mutate the request — callers apply the decision separately.
 */
export function createApprovalDecision(
  requestId: ApprovalRequestId,
  status:    "APPROVED" | "REJECTED",
  decidedBy: ApprovalActor,
  comment?:  string,
  metadata?: Record<string, unknown>,
): ApprovalDecision {
  return {
    id:        generateApprovalDecisionId() as ApprovalDecisionId,
    requestId,
    status,
    decidedBy,
    decidedAt: new Date().toISOString(),
    comment,
    metadata,
  };
}
