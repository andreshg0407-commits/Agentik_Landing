/**
 * app/api/orgs/[orgSlug]/marketing-studio/conexiones/route.ts
 *
 * MARKETING-CONNECTIONS-01 — API del Centro de Integraciones
 *
 * GET  /api/orgs/[orgSlug]/marketing-studio/conexiones
 *   → resumen, integraciones, syncedAt
 *
 * POST /api/orgs/[orgSlug]/marketing-studio/conexiones
 *   action: "disconnect" + provider (platformGroup) → disconnect all connections for provider
 *
 * Principios:
 *   - Los secretos permanecen en el Vault — este endpoint nunca los expone.
 *   - Disconnect es irreversible — requiere confirmación explícita en UI.
 *   - Requiere requireOrgAccess + canAccessMarketingStudio.
 */

import { NextResponse }                    from "next/server";
import { requireOrgAccess }                from "@/lib/auth/org-access";
import { canAccessMarketingStudio }        from "@/lib/auth/module-access";
import { getConnectionsSummary }           from "@/lib/marketing-studio/connections/connections-service";
import { prisma }                          from "@/lib/prisma";
import { recordIntegrationAuditEvent }     from "@/lib/integrations/integration-audit";

// Provider groups → actual DB providers
const PROVIDER_GROUP_MAP: Record<string, string[]> = {
  meta:     ["meta", "meta_facebook", "meta_instagram", "meta_ads", "meta_whatsapp"],
  tiktok:   ["tiktok"],
  shopify:  ["shopify"],
  whatsapp: ["meta_whatsapp", "whatsapp"],
  youtube:  ["youtube"],
  google:   ["google", "google_ads"],
  linkedin: ["linkedin"],
  x:        ["x", "twitter"],
  pinterest:["pinterest"],
};

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

    const data = await getConnectionsSummary(organization.id);

    return NextResponse.json(data);
  } catch (err) {
    console.error("[conexiones] GET error:", err);
    return NextResponse.json(
      { error: "Error interno. Intenta nuevamente." },
      { status: 500 },
    );
  }
}

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

    const body = await req.json() as unknown;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body inválido." }, { status: 400 });
    }

    const { action, provider } = body as { action?: string; provider?: string };

    if (action !== "disconnect" || !provider) {
      return NextResponse.json({ error: "Acción inválida." }, { status: 400 });
    }

    const providers = PROVIDER_GROUP_MAP[provider] ?? [provider];

    // Mark all connections for this provider group as not_connected
    const result = await prisma.integrationConnection.updateMany({
      where: {
        organizationId: organization.id,
        provider:       { in: providers },
        status:         { not: "not_connected" },
      },
      data: {
        status:         "not_connected",
        health:         "disconnected",
        disconnectedAt: new Date(),
        updatedAt:      new Date(),
      },
    });

    await recordIntegrationAuditEvent({
      organizationId: organization.id,
      provider,
      eventType:      "INTEGRATION_DISCONNECTED",
      payload:        { action: "manual_disconnect", connectionsUpdated: result.count, providers },
    }).catch(() => {});

    return NextResponse.json({ disconnected: result.count });
  } catch (err) {
    console.error("[conexiones] POST error:", err);
    return NextResponse.json(
      { error: "Error interno. Intenta nuevamente." },
      { status: 500 },
    );
  }
}
