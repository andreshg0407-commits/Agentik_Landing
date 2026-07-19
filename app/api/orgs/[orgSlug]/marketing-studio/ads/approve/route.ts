/**
 * app/api/orgs/[orgSlug]/marketing-studio/ads/approve/route.ts
 *
 * AGENTIK-APPROVAL-WORKFLOW-01 — API de Aprobación Formal de Anuncios
 *
 * POST /api/orgs/[orgSlug]/marketing-studio/ads/approve
 *
 * Aprueba formalmente una ejecución que está en estado "Listo para aprobación".
 * Avanza el AgentExecution de awaiting_approval → approved.
 *
 * Principios:
 *   - No crea anuncios.
 *   - No llama APIs externas (Meta, TikTok, Google).
 *   - No gasta recursos.
 *   - No expone secretos.
 *   - Requiere actor humano identificado — Copilot no puede aprobar.
 *   - Verifica tenant y permisos antes de operar.
 *
 * La ejecución aprobada queda lista para MARKETING-ADS-EXECUTION-01.
 */

import { NextResponse }             from "next/server";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import { approveExecution }         from "@/lib/approval/approval-service";
import { appendMetadata }           from "@/lib/execution/execution-registry";

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }                  = await params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    // ── Leer body ────────────────────────────────────────────────────────────

    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "El cuerpo de la solicitud no es válido." }, { status: 400 });
    }

    const executionId = typeof body.executionId === "string" ? body.executionId.trim() : "";

    if (!executionId) {
      return NextResponse.json({ error: "executionId es requerido." }, { status: 400 });
    }

    // snapshot — captura inmutable del borrador al momento de aprobar.
    // El cliente construye el snapshot con computeApprovalVersion() antes de llamar.
    // Si no se envía snapshot, la ejecución posterior fallará con MISSING_SNAPSHOT.
    const snapshot = body.snapshot && typeof body.snapshot === "object" ? body.snapshot : null;

    // ── Ejecutar aprobación ──────────────────────────────────────────────────
    // Actor = membership.id (userId del operador autenticado).
    // Copilot nunca llega aquí directamente — siempre pasa por el operador.

    const result = await approveExecution(
      executionId,
      organization.id,
      membership.id,
    );

    // ── Almacenar snapshot atómicamente con la aprobación ─────────────────
    // El snapshot se guarda en metadataJson.snapshot para que el ejecutor lo lea.
    // Si no hay snapshot, el ejecutor rechazará con MISSING_SNAPSHOT.
    if (result.success && snapshot) {
      await appendMetadata(executionId, organization.id, { snapshot });
    }

    if (!result.success) {
      const statusCode =
        result.errorCode === "EXECUTION_NOT_FOUND"   ? 404 :
        result.errorCode === "PERMISSION_DENIED"     ? 403 :
        result.errorCode === "ALREADY_CANCELLED"     ? 409 :
        result.errorCode === "INVALID_STATUS_FOR_APPROVAL" ? 409 : 500;

      return NextResponse.json({ error: result.message, errorCode: result.errorCode }, { status: statusCode });
    }

    return NextResponse.json({ result });
  } catch (err) {
    console.error("[ads/approve] POST error:", err);
    return NextResponse.json({ error: "Error interno. Intenta nuevamente." }, { status: 500 });
  }
}
