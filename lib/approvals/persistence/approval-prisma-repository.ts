/**
 * lib/approvals/persistence/approval-prisma-repository.ts
 *
 * Agentik — Prisma Approval Repository Implementation
 * Sprint: AGENTIK-APPROVAL-PERSISTENCE-01
 *
 * SERVER-ONLY — imports Prisma directly.
 * Never import from UI, client components, action-executor, or Copilot drawer.
 * Access via approvalService only (which is also server-only).
 */
import "server-only";

import { prisma }                           from "@/lib/prisma";
import type { ApprovalRepository }          from "./approval-repository";
import type {
  ApprovalId,
  ApprovalActor,
  ApprovalDecision,
  ApprovalFilter,
  ApprovalRequest,
  ApprovalUpdateInput,
} from "../approval-types";
import {
  createApprovalAuditEvent,
  SYSTEM_APPROVER,
} from "../approval-factory";
import {
  mapApprovalRequestToPrismaCreateInput,
  mapApprovalRequestToPrismaUpdateInput,
  mapPrismaApprovalToRequest,
  mapApprovalFilterToPrismaWhere,
} from "./approval-mapper";

// ── Org slug → ID resolver ────────────────────────────────────────────────────

async function resolveOrgId(orgSlug: string): Promise<string> {
  const org = await prisma.organization.findFirst({
    where:  { slug: orgSlug },
    select: { id: true },
  });
  if (!org) throw new Error(`Organization not found for slug: ${orgSlug}`);
  return org.id;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Find an active (PENDING or APPROVED) approval for a specific workflow step.
 * Used by workflowChainService to prevent duplicate approval creation.
 *
 * Searches by entityId (= stepId) + entityType = "workflow_step" + org context,
 * then post-filters by workflowRunId stored in businessContextJson.metadata.
 */
export async function findApprovalByWorkflowStep(
  workflowRunId: string,
  stepId:        string,
): Promise<ApprovalRequest | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (prisma as any).approval.findMany({
    where: {
      entityId:   stepId,
      entityType: "workflow_step",
      status:     { in: ["PENDING", "APPROVED"] },
    },
    orderBy: { createdAt: "desc" },
    take:    20,
  });

  // Post-filter: confirm workflowRunId matches in JSON context
  for (const row of rows as Record<string, unknown>[]) {
    const ctx  = (row.businessContextJson as Record<string, unknown> | null) ?? {};
    const meta = (ctx.metadata as Record<string, unknown> | null) ?? {};
    if (meta.workflowRunId === workflowRunId) {
      return mapPrismaApprovalToRequest(row);
    }
  }

  return null;
}

// ── Idempotent approval creation — AGENTIK-IDEMPOTENCY-01 ─────────────────────

/**
 * Find an approval by its idempotency key + org.
 */
export async function findApprovalByIdempotencyKey(
  orgSlug:        string,
  idempotencyKey: string,
): Promise<ApprovalRequest | null> {
  const orgId = await resolveOrgId(orgSlug);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (prisma as any).approval.findFirst({
    where: { organizationId: orgId, idempotencyKey },
  });
  return row ? mapPrismaApprovalToRequest(row as Record<string, unknown>) : null;
}

/**
 * Create an approval with idempotency protection.
 * - If one with the same key exists, return it (alreadyProcessed=true).
 * - If not, create it.
 * - On unique constraint race, read back the winner.
 */
export async function createApprovalIdempotent(
  request:        ApprovalRequest,
  idempotencyKey: string,
): Promise<{ approval: ApprovalRequest; alreadyProcessed: boolean }> {
  const existing = await findApprovalByIdempotencyKey(request.context.orgSlug, idempotencyKey);
  if (existing) {
    return { approval: existing, alreadyProcessed: true };
  }

  const orgId = await resolveOrgId(request.context.orgSlug);
  const data  = { ...mapApprovalRequestToPrismaCreateInput(request, orgId), idempotencyKey };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).approval.create({ data });
    return { approval: mapPrismaApprovalToRequest(row as Record<string, unknown>), alreadyProcessed: false };
  } catch (err) {
    const isUniqueViolation = err instanceof Error &&
      (err.message.includes("Unique constraint") || err.message.includes("unique constraint") || err.message.includes("P2002"));
    if (isUniqueViolation) {
      const raceWinner = await findApprovalByIdempotencyKey(request.context.orgSlug, idempotencyKey);
      if (raceWinner) return { approval: raceWinner, alreadyProcessed: true };
    }
    throw err;
  }
}

export const approvalPrismaRepository: ApprovalRepository = {

  async createApproval(request: ApprovalRequest): Promise<ApprovalRequest> {
    const orgId = await resolveOrgId(request.context.orgSlug);
    const data  = mapApprovalRequestToPrismaCreateInput(request, orgId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row   = await (prisma as any).approval.create({ data });
    return mapPrismaApprovalToRequest(row as Record<string, unknown>);
  },

  async updateApproval(id: ApprovalId, input: ApprovalUpdateInput): Promise<ApprovalRequest> {
    const data = {
      ...mapApprovalRequestToPrismaUpdateInput(input),
      updatedAt: new Date(),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).approval.update({
      where: { id },
      data,
    });
    return mapPrismaApprovalToRequest(row as Record<string, unknown>);
  },

  async getApprovalById(id: ApprovalId): Promise<ApprovalRequest | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).approval.findFirst({ where: { id } });
    return row ? mapPrismaApprovalToRequest(row as Record<string, unknown>) : null;
  },

  async listApprovals(orgSlug: string, filter?: ApprovalFilter): Promise<ApprovalRequest[]> {
    const orgId = await resolveOrgId(orgSlug);
    const where = mapApprovalFilterToPrismaWhere(orgId, filter);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows  = await (prisma as any).approval.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return (rows as Record<string, unknown>[]).map(mapPrismaApprovalToRequest);
  },

  async approveApproval(id: ApprovalId, decision: ApprovalDecision): Promise<ApprovalRequest> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma as any).approval.findFirst({ where: { id } });
    if (!existing) throw new Error(`Approval ${id} not found`);

    const current    = mapPrismaApprovalToRequest(existing as Record<string, unknown>);
    const auditEvent = createApprovalAuditEvent(
      "approved",
      decision.decidedBy,
      { status: current.status },
      { status: "APPROVED" },
      decision.comment,
    );

    const updatedAuditTrail = [...current.auditTrail, auditEvent];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).approval.update({
      where: { id },
      data:  {
        status:       "APPROVED",
        decisionJson: decision as unknown,
        auditTrailJson: updatedAuditTrail as unknown,
        decidedAt:    new Date(decision.decidedAt),
        updatedAt:    new Date(),
      },
    });
    return mapPrismaApprovalToRequest(row as Record<string, unknown>);
  },

  async rejectApproval(id: ApprovalId, decision: ApprovalDecision): Promise<ApprovalRequest> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma as any).approval.findFirst({ where: { id } });
    if (!existing) throw new Error(`Approval ${id} not found`);

    const current    = mapPrismaApprovalToRequest(existing as Record<string, unknown>);
    const auditEvent = createApprovalAuditEvent(
      "rejected",
      decision.decidedBy,
      { status: current.status },
      { status: "REJECTED" },
      decision.comment,
    );

    const updatedAuditTrail = [...current.auditTrail, auditEvent];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).approval.update({
      where: { id },
      data:  {
        status:         "REJECTED",
        decisionJson:   decision as unknown,
        auditTrailJson: updatedAuditTrail as unknown,
        decidedAt:      new Date(decision.decidedAt),
        updatedAt:      new Date(),
      },
    });
    return mapPrismaApprovalToRequest(row as Record<string, unknown>);
  },

  async cancelApproval(id: ApprovalId, actor: ApprovalActor, reason?: string): Promise<ApprovalRequest> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma as any).approval.findFirst({ where: { id } });
    if (!existing) throw new Error(`Approval ${id} not found`);

    const current    = mapPrismaApprovalToRequest(existing as Record<string, unknown>);
    const auditEvent = createApprovalAuditEvent(
      "cancelled",
      actor,
      { status: current.status },
      { status: "CANCELLED" },
      reason,
    );

    const updatedAuditTrail = [...current.auditTrail, auditEvent];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).approval.update({
      where: { id },
      data:  {
        status:         "CANCELLED",
        cancelledAt:    new Date(),
        auditTrailJson: updatedAuditTrail as unknown,
        updatedAt:      new Date(),
      },
    });
    return mapPrismaApprovalToRequest(row as Record<string, unknown>);
  },

  async expireApproval(id: ApprovalId): Promise<ApprovalRequest> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma as any).approval.findFirst({ where: { id } });
    if (!existing) throw new Error(`Approval ${id} not found`);

    const current    = mapPrismaApprovalToRequest(existing as Record<string, unknown>);
    const auditEvent = createApprovalAuditEvent(
      "expired",
      SYSTEM_APPROVER,
      { status: current.status },
      { status: "EXPIRED" },
    );

    const updatedAuditTrail = [...current.auditTrail, auditEvent];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).approval.update({
      where: { id },
      data:  {
        status:         "EXPIRED",
        expiredAt:      new Date(),
        auditTrailJson: updatedAuditTrail as unknown,
        updatedAt:      new Date(),
      },
    });
    return mapPrismaApprovalToRequest(row as Record<string, unknown>);
  },

};
