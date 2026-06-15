/**
 * app/api/orgs/[orgSlug]/marketing-studio/shopify/promotions/route.ts
 *
 * SHOPIFY-PROMOTIONS-04 — Promotions API
 *
 * GET  → list promotions grouped by status (active / scheduled / expired / disabled)
 * POST → create promotion (with optional discount code); pass preview:true for dryRun
 */

import { NextRequest, NextResponse }  from "next/server";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { getIntegrationConnection }    from "@/lib/integrations/integration-repository";
import { assertIntegrationActive }     from "@/lib/integrations/integration-runtime";
import { getIntegrationSecret }        from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }                 from "@/lib/integrations/vault/vault-types";
import { CONNECTION_STATUS }           from "@/lib/integrations/integration-types";
import {
  listPromotions,
  createPromotion,
  previewPromotionImpact,
} from "@/lib/marketing-studio/commerce/shopify-promotions-service";
import type { PromotionCreateInput }   from "@/lib/marketing-studio/commerce/shopify-promotions-types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string }> };

// ── Connection resolver ────────────────────────────────────────────────────────

async function resolveShopifyConnection(orgId: string) {
  const connection = await getIntegrationConnection(orgId, "shopify");
  if (!connection || connection.status !== CONNECTION_STATUS.CONNECTED) {
    return { connection: null, shopDomain: null, vaultSecret: null };
  }
  assertIntegrationActive(connection, "shopify", orgId);
  if (!connection.shopDomain) return { connection: null, shopDomain: null, vaultSecret: null };

  const vaultSecret = await getIntegrationSecret({
    organizationId: orgId,
    connectionId:   connection.id,
    secretType:     SECRET_TYPE.ACCESS_TOKEN,
  });

  if (!vaultSecret) return { connection, shopDomain: connection.shopDomain, vaultSecret: null };
  return { connection, shopDomain: connection.shopDomain, vaultSecret };
}

// ── GET — list promotions ──────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
) {
  const { orgSlug } = await params;
  try {
    const { organization } = await requireOrgAccess(orgSlug);
    const { shopDomain, vaultSecret } = await resolveShopifyConnection(organization.id);

    if (!shopDomain || !vaultSecret) {
      return NextResponse.json({
        ok: true, disconnected: true,
        active: [], scheduled: [], expired: [], disabled: [], total: 0,
      });
    }

    const result = await listPromotions(
      organization.id,
      vaultSecret.plainValue,   // ⚠ server-only
      shopDomain,
    );

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al cargar promociones";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// ── POST — create / preview ────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
) {
  const { orgSlug } = await params;
  try {
    const { organization } = await requireOrgAccess(orgSlug);
    const body = await req.json() as PromotionCreateInput & { preview?: boolean };

    if (!body.title || !body.type || !body.valueType || body.value == null || !body.startsAt) {
      return NextResponse.json(
        { ok: false, error: "Faltan campos requeridos: title, type, valueType, value, startsAt" },
        { status: 400 },
      );
    }

    const { shopDomain, vaultSecret } = await resolveShopifyConnection(organization.id);

    if (!shopDomain || !vaultSecret) {
      return NextResponse.json(
        { ok: false, error: "Shopify no está conectado" },
        { status: 422 },
      );
    }

    if (body.preview) {
      const dryRun = await previewPromotionImpact(
        organization.id,
        vaultSecret.plainValue,   // ⚠ server-only
        shopDomain,
        body,
      );
      return NextResponse.json({ ok: true, ...dryRun });
    }

    const result = await createPromotion(
      organization.id,
      vaultSecret.plainValue,   // ⚠ server-only
      shopDomain,
      body,
    );

    return NextResponse.json(result, { status: result.ok ? 201 : 422 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al crear promoción";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
