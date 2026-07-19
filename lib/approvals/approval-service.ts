/**
 * lib/approvals/approval-service.ts
 *
 * Agentik — Approval Service
 * Sprint: AGENTIK-APPROVAL-PERSISTENCE-01
 *
 * SERVER-ONLY — imports Prisma transitively via approvalPrismaRepository.
 * Never import from client components, action-executor, or Copilot drawer.
 * Server path: Server Actions / API routes → approvalService → approvalPrismaRepository.
 *
 * Rules:
 *   - All persistence goes through approvalPrismaRepository
 *   - All validation goes through validateApprovalRequest
 *   - Returns typed result envelopes — never throws to callers
 *   - No React. No direct Prisma. No Copilot types.
 */
import "server-only";

import { validateApprovalRequest }         from "./approval-audit";
import { canTransitionApprovalStatus }     from "./approval-status";
import {
  createApprovalDecision,
  createApprovalAuditEvent,
}                                          from "./approval-factory";
import {
  approvalPrismaRepository,
  findApprovalByIdempotencyKey,
  createApprovalIdempotent as repoCreateApprovalIdempotent,
}                                          from "./persistence/approval-prisma-repository";
import type {
  ApprovalActor,
  ApprovalDecisionInput,
  ApprovalFilter,
  ApprovalId,
  ApprovalRequest,
  ApprovalUpdateInput,
} from "./approval-types";
import type {
  ApprovalCreationResult,
  ApprovalUpdateResult,
  ApprovalDecisionResult,
  ApprovalCancellationResult,
  ApprovalExpirationResult,
  ApprovalQueryResult,
  ApprovalListResult,
} from "./approval-result";

// ── Service ───────────────────────────────────────────────────────────────────

export const approvalService = {

  /**
   * Validate and persist a new ApprovalRequest.
   */
  async createApprovalFromRequest(
    request: ApprovalRequest,
  ): Promise<ApprovalCreationResult> {
    const report = validateApprovalRequest(request);
    if (!report.valid) {
      return {
        success:  false,
        message:  "La solicitud de aprobación no pasó validación.",
        errors:   report.errors.map(e => e.message),
        warnings: report.warnings.map(w => w.message),
      };
    }

    try {
      const saved = await approvalPrismaRepository.createApproval(request);
      return {
        success:  true,
        message:  "Solicitud de aprobación creada correctamente.",
        approval: saved,
        warnings: report.warnings.map(w => w.message),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado al crear aprobación.";
      return { success: false, message, errors: [message] };
    }
  },

  /**
   * Apply a partial update to an existing approval.
   */
  async updateApproval(
    id:    ApprovalId,
    input: ApprovalUpdateInput,
  ): Promise<ApprovalUpdateResult> {
    try {
      const updated = await approvalPrismaRepository.updateApproval(id, input);
      return { success: true, message: "Aprobación actualizada.", approval: updated };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al actualizar aprobación.";
      return { success: false, message, errors: [message] };
    }
  },

  /**
   * Fetch a single approval by ID.
   */
  async getApproval(id: ApprovalId): Promise<ApprovalQueryResult> {
    try {
      const approval = await approvalPrismaRepository.getApprovalById(id);
      return {
        success:  true,
        message:  approval ? "Aprobación encontrada." : "Aprobación no encontrada.",
        approval,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al consultar aprobación.";
      return { success: false, message, approval: null, errors: [message] };
    }
  },

  /**
   * List approvals for an org with optional filters.
   */
  async listApprovals(
    orgSlug: string,
    filter?: ApprovalFilter,
  ): Promise<ApprovalListResult> {
    try {
      const approvals = await approvalPrismaRepository.listApprovals(orgSlug, filter);
      return {
        success:    true,
        message:    "Aprobaciones consultadas.",
        approvals,
        totalCount: approvals.length,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al listar aprobaciones.";
      return { success: false, message, approvals: [], totalCount: 0, errors: [message] };
    }
  },

  /**
   * Approve a pending request.
   */
  async approveApproval(
    id:    ApprovalId,
    input: ApprovalDecisionInput,
  ): Promise<ApprovalDecisionResult> {
    try {
      const current = await approvalPrismaRepository.getApprovalById(id);
      if (!current) {
        return { success: false, message: `Aprobación ${id} no encontrada.`, approval: undefined };
      }
      if (!canTransitionApprovalStatus(current.status, "APPROVED")) {
        return {
          success: false,
          message: `No se puede aprobar una solicitud en estado "${current.status}".`,
        };
      }

      const decision = createApprovalDecision(id, "APPROVED", input.decidedBy, input.comment, input.metadata);
      const updated  = await approvalPrismaRepository.approveApproval(id, decision);

      // Emit post-approval event to trigger work execution (non-blocking)
      if (updated) {
        const { handleApprovalApproved } = await import("./events/approval-approved-handler");
        void handleApprovalApproved(updated);
      }

      return { success: true, message: "Aprobación registrada.", approval: updated, decision };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al aprobar solicitud.";
      return { success: false, message, errors: [message] };
    }
  },

  /**
   * Reject a pending request.
   * HIGH/CRITICAL require a comment.
   */
  async rejectApproval(
    id:    ApprovalId,
    input: ApprovalDecisionInput,
  ): Promise<ApprovalDecisionResult> {
    try {
      const current = await approvalPrismaRepository.getApprovalById(id);
      if (!current) {
        return { success: false, message: `Aprobación ${id} no encontrada.`, approval: undefined };
      }
      if (!canTransitionApprovalStatus(current.status, "REJECTED")) {
        return {
          success: false,
          message: `No se puede rechazar una solicitud en estado "${current.status}".`,
        };
      }
      if ((current.priority === "HIGH" || current.priority === "CRITICAL") && !input.comment) {
        return {
          success: false,
          message: "Las aprobaciones de prioridad Alta o Crítica requieren un comentario al rechazar.",
          errors:  ["Comentario obligatorio para rechazo de prioridad alta."],
        };
      }

      const decision = createApprovalDecision(id, "REJECTED", input.decidedBy, input.comment, input.metadata);
      const updated  = await approvalPrismaRepository.rejectApproval(id, decision);
      return { success: true, message: "Rechazo registrado.", approval: updated, decision };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al rechazar solicitud.";
      return { success: false, message, errors: [message] };
    }
  },

  /**
   * Cancel an approval.
   */
  async cancelApproval(
    id:      ApprovalId,
    actor:   ApprovalActor,
    reason?: string,
  ): Promise<ApprovalCancellationResult> {
    try {
      const current = await approvalPrismaRepository.getApprovalById(id);
      if (!current) {
        return { success: false, message: `Aprobación ${id} no encontrada.` };
      }
      if (!canTransitionApprovalStatus(current.status, "CANCELLED")) {
        return {
          success: false,
          message: `No se puede cancelar una solicitud en estado "${current.status}".`,
        };
      }

      const updated = await approvalPrismaRepository.cancelApproval(id, actor, reason);
      return { success: true, message: "Aprobación cancelada.", approval: updated };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al cancelar aprobación.";
      return { success: false, message, errors: [message] };
    }
  },

  // ── AGENTIK-IDEMPOTENCY-01 ─────────────────────────────────────────────────

  /**
   * Find an approval by its idempotency key.
   */
  async findApprovalByIdempotencyKey(
    orgSlug:        string,
    idempotencyKey: string,
  ): Promise<ApprovalQueryResult> {
    try {
      const approval = await findApprovalByIdempotencyKey(orgSlug, idempotencyKey);
      return {
        success:  true,
        message:  approval ? "Aprobación encontrada." : "Aprobación no encontrada.",
        approval,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al consultar aprobación por clave.";
      return { success: false, message, approval: null, errors: [message] };
    }
  },

  /**
   * Create an approval with idempotency protection.
   * Returns the existing approval if the key was already processed.
   */
  async createApprovalIdempotent(
    request:        ApprovalRequest,
    idempotencyKey: string,
  ): Promise<ApprovalCreationResult & { alreadyProcessed: boolean }> {
    const report = validateApprovalRequest(request);
    if (!report.valid) {
      return {
        success:          false,
        alreadyProcessed: false,
        message:          "La solicitud de aprobación no pasó validación.",
        errors:           report.errors.map(e => e.message),
        warnings:         report.warnings.map(w => w.message),
      };
    }

    try {
      const { approval, alreadyProcessed } = await repoCreateApprovalIdempotent(request, idempotencyKey);
      return {
        success:          true,
        alreadyProcessed,
        message:          alreadyProcessed
          ? `Aprobación ya existente (idempotencyKey reutilizada): ${approval.id}`
          : "Solicitud de aprobación creada correctamente.",
        approval,
        warnings:         report.warnings.map(w => w.message),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al crear aprobación de forma idempotente.";
      return { success: false, alreadyProcessed: false, message, errors: [message] };
    }
  },

  /**
   * Expire a pending approval (typically called by a scheduled job).
   */
  async expireApproval(id: ApprovalId): Promise<ApprovalExpirationResult> {
    try {
      const current = await approvalPrismaRepository.getApprovalById(id);
      if (!current) {
        return { success: false, message: `Aprobación ${id} no encontrada.` };
      }
      if (!canTransitionApprovalStatus(current.status, "EXPIRED")) {
        return {
          success: false,
          message: `No se puede expirar una solicitud en estado "${current.status}".`,
        };
      }

      const updated = await approvalPrismaRepository.expireApproval(id);
      return { success: true, message: "Aprobación expirada.", approval: updated };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al expirar aprobación.";
      return { success: false, message, errors: [message] };
    }
  },

};
