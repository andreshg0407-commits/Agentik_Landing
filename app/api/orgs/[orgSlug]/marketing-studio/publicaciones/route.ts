/**
 * app/api/orgs/[orgSlug]/marketing-studio/publicaciones/route.ts
 *
 * MARKETING-PUBLICACIONES-01 — API de Publicaciones
 *
 * GET /api/orgs/[orgSlug]/marketing-studio/publicaciones
 *
 * Devuelve:
 *   - resumen:       contadores operativos (publicadas hoy, programadas, en revisión, con error)
 *   - publicaciones: listado completo de items
 *   - ultimaSincronizacion: ISO timestamp
 *
 * Principios:
 *   - Solo lectura. Nunca activa ni modifica publicaciones.
 *   - No expone tokens ni credenciales.
 *   - Requiere requireOrgAccess + canAccessMarketingStudio.
 */

import { NextResponse }                  from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { canAccessMarketingStudio }      from "@/lib/auth/module-access";
import { getPublicacionesSummary }       from "@/lib/marketing-studio/publicaciones/publicaciones-service";

// ── GET ────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }               = await params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    const data = await getPublicacionesSummary(organization.id);

    return NextResponse.json(data);
  } catch (err) {
    console.error("[publicaciones] GET error:", err);
    return NextResponse.json(
      { error: "Error interno. Intenta nuevamente." },
      { status: 500 },
    );
  }
}
