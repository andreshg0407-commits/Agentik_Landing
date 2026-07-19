/**
 * app/api/orgs/[orgSlug]/marketing-studio/ads/analytics/history/route.ts
 *
 * MARKETING-ANALYTICS-HISTORY-01 — API de Historial de Métricas de Anuncios
 *
 * GET /api/orgs/[orgSlug]/marketing-studio/ads/analytics/history?range=week
 *
 * Devuelve:
 *   - historySummary: AdsHistorySummary completo
 *   - trendSeries:    serie temporal por plataforma
 *   - periodComparison: comparativa vs período anterior
 *
 * Principios:
 *   - Solo lectura — nunca activa ni modifica campañas.
 *   - No expone tokens ni credenciales.
 *   - Requiere requireOrgAccess + canAccessMarketingStudio.
 */

import { NextResponse }                    from "next/server";
import { requireOrgAccess }                from "@/lib/auth/org-access";
import { canAccessMarketingStudio }        from "@/lib/auth/module-access";
import { getAdsHistorySummary }            from "@/lib/marketing-studio/ads/ads-analytics-history-service";
import type { AdsHistoryRange }            from "@/lib/marketing-studio/ads/ads-analytics-history-types";
import type { AdsAnalyticsHistoryApiResponse } from "@/lib/marketing-studio/ads/ads-analytics-history-types";

const VALID_RANGES: AdsHistoryRange[] = ["today", "week", "month", "quarter"];

function parseRange(raw: string | null): AdsHistoryRange {
  if (raw && (VALID_RANGES as string[]).includes(raw)) {
    return raw as AdsHistoryRange;
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

    const historySummary = await getAdsHistorySummary(orgSlug, range);

    const response: AdsAnalyticsHistoryApiResponse = {
      historySummary,
      trendSeries:      historySummary.trendSeries,
      periodComparison: historySummary.periodComparison,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[ads/analytics/history] GET error:", err);
    return NextResponse.json({ error: "Error interno. Intenta nuevamente." }, { status: 500 });
  }
}
