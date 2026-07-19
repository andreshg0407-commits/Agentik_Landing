/**
 * app/api/orgs/[orgSlug]/marketing-studio/ads/execute/route.ts
 *
 * MARKETING-ADS-EXECUTION-01 — API de Ejecución Real de Anuncios
 *
 * POST /api/orgs/[orgSlug]/marketing-studio/ads/execute
 *
 * Ejecuta un anuncio previamente aprobado en Meta y/o TikTok.
 *
 * Principios:
 *   - Solo ejecuta ejecuciones con status "approved".
 *   - Nunca lee el wizard vivo — solo el ApprovedExecutionSnapshot del metadataJson.
 *   - Resuelve credenciales desde Vault en tiempo de ejecución.
 *   - Crea campañas en estado PAUSED/DISABLE.
 *   - No expone tokens ni credenciales en la respuesta.
 *   - Copilot nunca puede llamar esta ruta directamente.
 *
 * Si el borrador cambió después de la aprobación, la UI debe mostrar
 * la advertencia de invalidación antes de permitir llegar a esta ruta.
 */

import { NextResponse }             from "next/server";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import { executeApprovedAd }        from "@/lib/marketing-studio/ads/ads-execution-service";
import type { AdsExecuteApiResponse } from "@/lib/marketing-studio/ads/ads-execution-types";

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

    // ── Leer body ─────────────────────────────────────────────────────────────

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

    // ── Ejecutar ─────────────────────────────────────────────────────────────
    // triggeredBy = membership.id (actor humano autenticado).
    // tenantId    = orgSlug (para Vault).
    // organizationId = organization.id (UUID para DB queries).

    const executionResult = await executeApprovedAd(
      executionId,
      orgSlug,
      organization.id,
      membership.id,
    );

    const response: AdsExecuteApiResponse = {
      executionResult,
      executionId: executionResult.executionId,
    };

    // HTTP status basado en resultado
    const httpStatus =
      executionResult.status === "completed" ? 200 :
      executionResult.status === "partial"   ? 207 : 500;

    return NextResponse.json(response, { status: httpStatus });
  } catch (err) {
    console.error("[ads/execute] POST error:", err);
    return NextResponse.json({ error: "Error interno. Intenta nuevamente." }, { status: 500 });
  }
}
