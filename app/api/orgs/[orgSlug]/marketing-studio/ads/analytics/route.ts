/**
 * app/api/orgs/[orgSlug]/marketing-studio/ads/analytics/route.ts
 *
 * MARKETING-ANALYTICS-LIVE-01 — API de Analítica de Anuncios
 *
 * GET  /api/orgs/[orgSlug]/marketing-studio/ads/analytics?range=week
 *   Retorna AdsAnalyticsResult consolidado para el tenant.
 *   range: "today" | "week" | "month" (default: "week")
 *
 * POST /api/orgs/[orgSlug]/marketing-studio/ads/analytics
 *   Body: { executionId: string; range?: AdsAnalyticsRange }
 *   Fuerza re-sincronización de métricas para una ejecución específica
 *   (ignora caché). Retorna el AdsAnalyticsItem actualizado.
 *
 * Principios:
 *   - Solo consulta — nunca activa, modifica ni cobra.
 *   - No expone tokens ni credenciales en la respuesta.
 *   - Una plataforma que falla no cancela el resumen.
 *   - Requiere requireOrgAccess + canAccessMarketingStudio.
 */

import { NextResponse }              from "next/server";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";
import {
  getAdsAnalyticsSummary,
  syncAdsAnalyticsForExecution,
}                                    from "@/lib/marketing-studio/ads/ads-analytics-service";
import type { AdsAnalyticsRange }    from "@/lib/marketing-studio/ads/ads-analytics-types";
import type { AdsAnalyticsApiResponse } from "@/lib/marketing-studio/ads/ads-analytics-types";

const VALID_RANGES: AdsAnalyticsRange[] = ["today", "week", "month"];

function parseRange(raw: string | null): AdsAnalyticsRange {
  if (raw && (VALID_RANGES as string[]).includes(raw)) {
    return raw as AdsAnalyticsRange;
  }
  return "week";
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }    = await params;
    const { membership } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    const url   = new URL(req.url);
    const range = parseRange(url.searchParams.get("range"));

    const result      = await getAdsAnalyticsSummary(orgSlug, range);
    const cachedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const response: AdsAnalyticsApiResponse = { result, cachedUntil };
    return NextResponse.json(response);
  } catch (err) {
    console.error("[ads/analytics] GET error:", err);
    return NextResponse.json({ error: "Error interno. Intenta nuevamente." }, { status: 500 });
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }    = await params;
    const { membership } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    let executionId: string | null = null;
    let range: AdsAnalyticsRange   = "week";

    try {
      const body = await req.json() as Record<string, unknown>;
      if (typeof body.executionId === "string" && body.executionId.trim()) {
        executionId = body.executionId.trim();
      }
      if (typeof body.range === "string") {
        range = parseRange(body.range);
      }
    } catch {
      // Empty or invalid body
    }

    if (!executionId) {
      return NextResponse.json({ error: "executionId es requerido." }, { status: 400 });
    }

    const item = await syncAdsAnalyticsForExecution(orgSlug, executionId, range);
    if (!item) {
      return NextResponse.json({ error: "No se encontraron datos para la ejecución indicada." }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch (err) {
    console.error("[ads/analytics] POST error:", err);
    return NextResponse.json({ error: "Error interno. Intenta nuevamente." }, { status: 500 });
  }
}
