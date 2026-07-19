/**
 * app/api/orgs/[orgSlug]/marketing-studio/ads/sync/route.ts
 *
 * MARKETING-ADS-SYNC-01 — API de Sincronización de Estado de Anuncios
 *
 * POST /api/orgs/[orgSlug]/marketing-studio/ads/sync
 *
 * Si viene executionId en el body:
 *   Sincroniza solo esa ejecución.
 *
 * Si no viene executionId:
 *   Sincroniza las ejecuciones Ads recientes del tenant (máx 20).
 *
 * Principios:
 *   - Solo consulta estado — nunca activa, modifica ni cobra.
 *   - No expone tokens ni credenciales en la respuesta.
 *   - Una plataforma que falla no cancela la sincronización.
 *   - Requiere requireOrgAccess + canAccessMarketingStudio.
 */

import { NextResponse }              from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";
import {
  syncAdsExecutionById,
  syncAdsExecutions,
}                                    from "@/lib/marketing-studio/ads/ads-sync-service";
import type { AdsSyncApiResponse }   from "@/lib/marketing-studio/ads/ads-sync-types";

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }      = await params;
    const { membership }   = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    // ── Leer body opcional ────────────────────────────────────────────────────

    let executionId: string | null = null;
    try {
      const body = await req.json() as Record<string, unknown>;
      if (typeof body.executionId === "string" && body.executionId.trim()) {
        executionId = body.executionId.trim();
      }
    } catch {
      // Empty body is valid — triggers bulk sync
    }

    // ── Ejecutar sincronización ───────────────────────────────────────────────

    if (executionId) {
      // Sincronización puntual por ID
      const item       = await syncAdsExecutionById(orgSlug, executionId);
      const syncResult = {
        tenantId:     orgSlug,
        syncedAt:     item.lastSyncedAt,
        items:        [item],
        totalSynced:  item.issues.length === 0 ? 1 : 0,
        totalFailed:  item.issues.length > 0   ? 1 : 0,
      };

      const response: AdsSyncApiResponse = { syncResult, executionId };
      return NextResponse.json(response);
    }

    // Sincronización bulk — ejecuciones recientes del tenant
    const syncResult  = await syncAdsExecutions(orgSlug);
    const response: AdsSyncApiResponse = { syncResult, executionId: null };
    return NextResponse.json(response);
  } catch (err) {
    console.error("[ads/sync] POST error:", err);
    return NextResponse.json({ error: "Error interno. Intenta nuevamente." }, { status: 500 });
  }
}
