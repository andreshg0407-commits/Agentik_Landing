/**
 * lib/approvals/persistence/approval-mapper.ts
 *
 * Agentik — Approval ↔ Prisma Mapper
 * Sprint: AGENTIK-APPROVAL-PERSISTENCE-01
 *
 * Translates between domain ApprovalRequest and Prisma row shapes.
 * Uses Record<string, unknown> for Prisma inputs to avoid importing Prisma types.
 * No React. No server-only required here (consumed by the repository which is server-only).
 */

import type {
  ApprovalRequest,
  ApprovalActor,
  ApprovalActorType,
  ApprovalAuditEvent,
  ApprovalAuditEventType,
  ApprovalCategory,
  ApprovalContext,
  ApprovalDecision,
  ApprovalFilter,
  ApprovalPriority,
  ApprovalRelationship,
  ApprovalSource,
  ApprovalStatus,
  ApprovalUpdateInput,
} from "../approval-types";
import { createApprovalAuditEvent } from "../approval-factory";

// ── Domain → Prisma create input ──────────────────────────────────────────────

export function mapApprovalRequestToPrismaCreateInput(
  request:        ApprovalRequest,
  organizationId: string,
): Record<string, unknown> {
  return {
    id:                   request.id,
    organizationId,
    title:                request.title,
    description:          request.description     ?? null,
    status:               request.status,
    priority:             request.priority,
    category:             request.category,
    source:               request.source,
    requestorType:        request.requestor.type,
    requestorId:          request.requestor.id    ?? null,
    requestorLabel:       request.requestor.name  ?? null,
    approverType:         request.approver.type,
    approverId:           request.approver.id     ?? null,
    approverLabel:        request.approver.name   ?? null,
    module:               request.context.module  ?? null,
    entityType:           request.context.entityType     ?? null,
    entityId:             request.context.entityId       ?? null,
    navigationTarget:     request.context.navigationTarget ?? null,
    impactSummary:        request.context.impactSummary  ?? null,
    recommendation:       request.context.recommendation ?? null,
    businessContextJson:  request.context        as unknown,
    relationshipsJson:    request.relationships  as unknown,
    auditTrailJson:       request.auditTrail     as unknown,
    decisionJson:         request.decision       ?? null,
    metadataJson:         request.metadata       as unknown,
    expiresAt:            request.expiresAt ? new Date(request.expiresAt) : null,
    decidedAt:            request.decision?.decidedAt
                            ? new Date(request.decision.decidedAt)
                            : null,
    idempotencyKey:       request.idempotencyKey ?? null,
  };
}

// ── Domain → Prisma update input ──────────────────────────────────────────────

export function mapApprovalRequestToPrismaUpdateInput(
  input: ApprovalUpdateInput,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (input.title       !== undefined) data.title       = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.priority    !== undefined) data.priority    = input.priority;
  if (input.expiresAt   !== undefined) data.expiresAt   = input.expiresAt ? new Date(input.expiresAt) : null;
  if (input.metadata    !== undefined) data.metadataJson = input.metadata;
  if (input.approver    !== undefined) {
    data.approverType  = input.approver.type;
    data.approverId    = input.approver.id;
    data.approverLabel = input.approver.name;
  }

  return data;
}

// ── Prisma row → Domain ───────────────────────────────────────────────────────

export function mapPrismaApprovalToRequest(row: Record<string, unknown>): ApprovalRequest {
  const requestor: ApprovalActor = {
    id:   (row.requestorId   as string) ?? "system",
    type: (row.requestorType as ApprovalActorType) ?? "SYSTEM",
    name: (row.requestorLabel as string) ?? "Sistema",
  };

  const approver: ApprovalActor = {
    id:   (row.approverId   as string) ?? "manager",
    type: (row.approverType as ApprovalActorType) ?? "USER",
    name: (row.approverLabel as string) ?? "Gerencia",
  };

  // Restore full context — prefer stored JSON, fall back to flat columns
  const storedCtx = (row.businessContextJson as Record<string, unknown> | null) ?? {};
  const context: ApprovalContext = {
    orgSlug:           (storedCtx.orgSlug          as string) ?? "",
    module:            (row.module                 as string | undefined) ?? (storedCtx.module as string | undefined),
    sourceAgentId:     storedCtx.sourceAgentId     as string | undefined,
    sourceAgentName:   storedCtx.sourceAgentName   as string | undefined,
    entityType:        (row.entityType             as string | undefined) ?? (storedCtx.entityType as string | undefined),
    entityId:          (row.entityId               as string | undefined) ?? (storedCtx.entityId as string | undefined),
    navigationTarget:  (row.navigationTarget       as string | undefined) ?? (storedCtx.navigationTarget as string | undefined),
    impactSummary:     (row.impactSummary          as string | undefined) ?? (storedCtx.impactSummary as string | undefined),
    recommendation:    (row.recommendation         as string | undefined) ?? (storedCtx.recommendation as string | undefined),
    metadata:          storedCtx.metadata          as Record<string, unknown> | undefined,
  };

  const relationships: ApprovalRelationship[] = Array.isArray(row.relationshipsJson)
    ? (row.relationshipsJson as ApprovalRelationship[])
    : [];

  const auditTrail: ApprovalAuditEvent[] = Array.isArray(row.auditTrailJson)
    ? (row.auditTrailJson as ApprovalAuditEvent[])
    : [createApprovalAuditEvent("created", requestor, undefined, { status: row.status as string })];

  const decision: ApprovalDecision | undefined =
    row.decisionJson && typeof row.decisionJson === "object"
      ? (row.decisionJson as ApprovalDecision)
      : undefined;

  const createdAt = row.createdAt instanceof Date
    ? row.createdAt.toISOString()
    : (row.createdAt as string);
  const updatedAt = row.updatedAt instanceof Date
    ? row.updatedAt.toISOString()
    : (row.updatedAt as string);

  return {
    id:              row.id            as string,
    title:           row.title         as string,
    description:     row.description   as string | undefined,
    status:          row.status        as ApprovalStatus,
    priority:        row.priority      as ApprovalPriority,
    source:          row.source        as ApprovalSource,
    category:        row.category      as ApprovalCategory,
    requestor,
    approver,
    context,
    relationships,
    auditTrail,
    decision,
    createdAt,
    updatedAt,
    expiresAt:       row.expiresAt instanceof Date
                       ? row.expiresAt.toISOString()
                       : (row.expiresAt as string | undefined) ?? undefined,
    metadata:        (row.metadataJson as Record<string, unknown>) ?? {},
    idempotencyKey:  (row.idempotencyKey as string | undefined) ?? undefined,
  };
}

// ── Filter → Prisma where ─────────────────────────────────────────────────────

export function mapApprovalFilterToPrismaWhere(
  orgId:   string,
  filter?: ApprovalFilter,
): Record<string, unknown> {
  if (!filter) return { organizationId: orgId };

  return {
    organizationId: orgId,
    ...(filter.status?.length      ? { status:     { in: filter.status   } } : {}),
    ...(filter.priority?.length    ? { priority:   { in: filter.priority } } : {}),
    ...(filter.category?.length    ? { category:   { in: filter.category } } : {}),
    ...(filter.source?.length      ? { source:     { in: filter.source   } } : {}),
    ...(filter.requestorId         ? { requestorId: filter.requestorId }     : {}),
    ...(filter.approverId          ? { approverId:  filter.approverId }      : {}),
    ...(filter.module              ? { module:      filter.module }          : {}),
    ...(filter.entityType          ? { entityType:  filter.entityType }      : {}),
    ...(filter.entityId            ? { entityId:    filter.entityId }        : {}),
    ...(filter.createdFrom || filter.createdTo
      ? {
          createdAt: {
            ...(filter.createdFrom ? { gte: new Date(filter.createdFrom) } : {}),
            ...(filter.createdTo   ? { lte: new Date(filter.createdTo)   } : {}),
          },
        }
      : {}),
  };
}
