/**
 * app/api/orgs/[orgSlug]/marketing-studio/shopify/promotions/dry-run/route.ts
 *
 * SHOPIFY-PROMOTIONS-04 — Promotion Dry-Run
 *
 * POST → preview promotion impact without creating anything.
 *
 * Body: PromotionCreateInput + optional liveConflicts?: boolean
 *   liveConflicts=false → skip Shopify price_rules fetch (real-time form preview)
 *   liveConflicts=true  → fetch existing rules for conflict detection (default)
 */

import { NextRequest, NextResponse }  from "next/server";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { getIntegrationConnection }    from "@/lib/integrations/integration-repository";
import { getIntegrationSecret }        from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }                 from "@/lib/integrations/vault/vault-types";
import { CONNECTION_STATUS }           from "@/lib/integrations/integration-types";
import {
  dryRunPromotion,
  previewPromotionImpact,
} from "@/lib/marketing-studio/commerce/shopify-promotions-service";
import type { PromotionCreateInput }   from "@/lib/marketing-studio/commerce/shopify-promotions-types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
) {
  const { orgSlug } = await params;
  try {
    const { organization } = await requireOrgAccess(orgSlug);
    const body = await req.json() as PromotionCreateInput & { liveConflicts?: boolean };

    if (!body.title || !body.type || !body.valueType || body.value == null || !body.startsAt) {
      return NextResponse.json(
        { ok: false, error: "Faltan campos requeridos: title, type, valueType, value, startsAt" },
        { status: 400 },
      );
    }

    // Cheap path — no Shopify call (real-time form feedback)
    if (body.liveConflicts === false) {
      const result = await dryRunPromotion(organization.id, body);
      return NextResponse.json({ ok: true, ...result });
    }

    // Rich path — live conflict detection from Shopify
    const connection = await getIntegrationConnection(organization.id, "shopify");
    if (!connection?.shopDomain || connection.status !== CONNECTION_STATUS.CONNECTED) {
      const result = await dryRunPromotion(organization.id, body);
      return NextResponse.json({ ok: true, ...result });
    }

    const vaultSecret = await getIntegrationSecret({
      organizationId: organization.id,
      connectionId:   connection.id,
      secretType:     SECRET_TYPE.ACCESS_TOKEN,
    });

    if (!vaultSecret) {
      const result = await dryRunPromotion(organization.id, body);
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await previewPromotionImpact(
      organization.id,
      vaultSecret.plainValue,   // ⚠ server-only
      connection.shopDomain,
      body,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error en previsualización";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
