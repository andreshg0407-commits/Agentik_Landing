"use server";

/**
 * app/(app)/[orgSlug]/aprobaciones/actions.ts
 *
 * Agentik — Aprobaciones Server Actions
 * Sprint: AGENTIK-APPROVAL-INBOX-01
 *
 * Server Actions for the Approval Inbox.
 * Called from ApprovalDetailDrawer (client component).
 * Never import approvalService from client components — this is the bridge.
 */

import { revalidatePath }  from "next/cache";
import { approvalService } from "@/lib/approvals/approval-service";

// ── Serializable result ───────────────────────────────────────────────────────

interface ApprovalActionResult {
  success:    boolean;
  message:    string;
  approvalId: string;
  status?:    string;
  errors?:    string[];
  warnings?:  string[];
}

// ── Approve ───────────────────────────────────────────────────────────────────

export async function approveApprovalAction(
  approvalId: string,
  orgSlug:    string,
  comment?:   string,
): Promise<ApprovalActionResult> {
  if (!orgSlug || !approvalId) {
    return { success: false, message: "Parámetros inválidos.", approvalId };
  }

  try {
    const result = await approvalService.approveApproval(approvalId, {
      status:    "APPROVED",
      decidedBy: { id: "current_user", type: "USER", name: "Usuario" },
      comment,
    });

    if (result.success) {
      revalidatePath(`/${orgSlug}/aprobaciones`);
    }

    return {
      success:    result.success,
      message:    result.message,
      approvalId,
      status:     result.approval?.status,
      errors:     result.errors,
      warnings:   result.warnings,
    };
  } catch {
    return {
      success: false,
      message: "No se pudo procesar la aprobación.",
      approvalId,
      errors:  ["Error inesperado al aprobar."],
    };
  }
}

// ── Reject ────────────────────────────────────────────────────────────────────

export async function rejectApprovalAction(
  approvalId: string,
  orgSlug:    string,
  comment:    string,
): Promise<ApprovalActionResult> {
  if (!orgSlug || !approvalId) {
    return { success: false, message: "Parámetros inválidos.", approvalId };
  }
  if (!comment?.trim()) {
    return {
      success: false,
      message: "Se requiere un comentario para rechazar.",
      approvalId,
      errors:  ["Comentario obligatorio para rechazo."],
    };
  }

  try {
    const result = await approvalService.rejectApproval(approvalId, {
      status:    "REJECTED",
      decidedBy: { id: "current_user", type: "USER", name: "Usuario" },
      comment:   comment.trim(),
    });

    if (result.success) {
      revalidatePath(`/${orgSlug}/aprobaciones`);
    }

    return {
      success:    result.success,
      message:    result.message,
      approvalId,
      status:     result.approval?.status,
      errors:     result.errors,
      warnings:   result.warnings,
    };
  } catch {
    return {
      success: false,
      message: "No se pudo procesar el rechazo.",
      approvalId,
      errors:  ["Error inesperado al rechazar."],
    };
  }
}

// ── Cancel ────────────────────────────────────────────────────────────────────

export async function cancelApprovalAction(
  approvalId: string,
  orgSlug:    string,
  reason?:    string,
): Promise<ApprovalActionResult> {
  if (!orgSlug || !approvalId) {
    return { success: false, message: "Parámetros inválidos.", approvalId };
  }

  try {
    const result = await approvalService.cancelApproval(
      approvalId,
      { id: "current_user", type: "USER", name: "Usuario" },
      reason,
    );

    if (result.success) {
      revalidatePath(`/${orgSlug}/aprobaciones`);
    }

    return {
      success:    result.success,
      message:    result.message,
      approvalId,
      status:     result.approval?.status,
      errors:     result.errors,
      warnings:   result.warnings,
    };
  } catch {
    return {
      success: false,
      message: "No se pudo cancelar la solicitud.",
      approvalId,
      errors:  ["Error inesperado al cancelar."],
    };
  }
}
