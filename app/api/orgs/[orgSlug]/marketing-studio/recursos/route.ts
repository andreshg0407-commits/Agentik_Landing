/**
 * app/api/orgs/[orgSlug]/marketing-studio/recursos/route.ts
 *
 * MARKETING-CONNECTIONS-HARDENING-01 — API de Recursos Descubiertos
 *
 * GET  → lista de IntegrationResource para el org (filtrables por provider/tipo)
 * POST → actualiza la selección de recursos (toggle selected)
 *
 * Principios:
 * - Solo expone IDs y nombres externos — nunca secretos.
 * - requireOrgAccess + canAccessMarketingStudio en todas las rutas.
 */

import { NextResponse }             from "next/server";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import {
  listIntegrationResources,
  bulkUpdateResourceSelection,
  discoverMetaResources,
  discoverTikTokResources,
}                                   from "@/lib/integrations/resource-discovery";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }                = await params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    const url          = new URL(req.url);
    const provider     = url.searchParams.get("provider") ?? undefined;
    const resourceType = url.searchParams.get("type")     ?? undefined;

    const resources = await listIntegrationResources(organization.id, provider, resourceType);

    return NextResponse.json({ resources, syncedAt: new Date().toISOString() });
  } catch (err) {
    console.error("[recursos] GET error:", err);
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug }                = await params;
    const { membership, organization } = await requireOrgAccess(orgSlug);

    if (!canAccessMarketingStudio(membership.role)) {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }

    const body = await req.json() as unknown;

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body inválido." }, { status: 400 });
    }

    const { action, resourceIds, selected } = body as {
      action?:      string;
      resourceIds?: unknown;
      selected?:    unknown;
    };

    // ── Discover action ──────────────────────────────────────────────────────
    if (action === "discover") {
      const { provider } = body as { provider?: string };
      if (provider === "meta") {
        const result = await discoverMetaResources(organization.id);
        return NextResponse.json({ result });
      }
      if (provider === "tiktok") {
        const result = await discoverTikTokResources(organization.id);
        return NextResponse.json({ result });
      }
      return NextResponse.json({ error: "Provider no soportado para discovery." }, { status: 400 });
    }

    // ── Selection update action ──────────────────────────────────────────────
    if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
      return NextResponse.json({ error: "resourceIds requeridos." }, { status: 400 });
    }
    if (typeof selected !== "boolean") {
      return NextResponse.json({ error: "selected (boolean) requerido." }, { status: 400 });
    }

    const ids = (resourceIds as unknown[]).filter((id): id is string => typeof id === "string");
    await bulkUpdateResourceSelection(organization.id, ids, selected);

    return NextResponse.json({ updated: ids.length });
  } catch (err) {
    console.error("[recursos] POST error:", err);
    return NextResponse.json({ error: "Error interno." }, { status: 500 });
  }
}
