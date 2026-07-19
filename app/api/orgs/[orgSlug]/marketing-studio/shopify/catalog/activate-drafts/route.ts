/**
 * POST /api/orgs/[orgSlug]/marketing-studio/shopify/catalog/activate-drafts
 *
 * SHOPIFY-CATALOG-OPERATIONS-01B — Activate Draft Products
 *
 * Sets Shopify products from "draft" to "active" (visible on storefront).
 * Targets products that exist in Shopify (have externalPublicationId) but
 * are not yet marked as published in Agentik.
 *
 * ── Request body ──────────────────────────────────────────────────────────────
 *   {
 *     dryRun?:    boolean  — preview candidates, no Shopify calls (default false)
 *     category?:  string   — filter by product category
 *     limit?:     number   — max products to activate (default 50)
 *   }
 *
 * ── Response — dryRun: true ───────────────────────────────────────────────────
 *   200: { ok: true, dryRun: true, total, candidates: [{ productId, name, sku }] }
 *
 * ── Response — dryRun: false ──────────────────────────────────────────────────
 *   200: { ok: true, activated, failed, skipped, errors, durationMs }
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *   dryRun skips vault secret fetch.
 *   Access token never included in response.
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { getIntegrationConnection }   from "@/lib/integrations/integration-repository";
import { assertIntegrationActive }    from "@/lib/integrations/integration-runtime";
import { getIntegrationSecret }       from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }                from "@/lib/integrations/vault/vault-types";
import { CONNECTION_STATUS }          from "@/lib/integrations/integration-types";
import {
  dryRunActivateDrafts,
  activatePublishedDraftProducts,
}                                     from "@/lib/marketing-studio/commerce/shopify-catalog-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string }> };

export async function POST(
  req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);

    const body = await req.json().catch(() => ({})) as {
      dryRun?:    boolean;
      category?:  string;
      limit?:     number;
      productIds?: string[];
    };
    const isDryRun   = body.dryRun === true;
    const category   = typeof body.category === "string" ? body.category : undefined;
    const limit      = typeof body.limit === "number" ? body.limit : 50;
    const productIds = Array.isArray(body.productIds) ? (body.productIds as string[]) : undefined;

    // ── DryRun — no vault, no Shopify calls ───────────────────────────────
    if (isDryRun) {
      const result = await dryRunActivateDrafts(organization.id, { category, productIds });
      return NextResponse.json({ ok: true, ...result });
    }

    // ── Real activation ────────────────────────────────────────────────────
    const connection = await getIntegrationConnection(organization.id, "shopify");
    if (!connection) {
      return NextResponse.json(
        { error: "Shopify no está conectado." },
        { status: 412 },
      );
    }

    if (connection.status !== CONNECTION_STATUS.CONNECTED) {
      return NextResponse.json(
        { error: `La conexión de Shopify no está activa (estado: ${connection.status}).` },
        { status: 412 },
      );
    }

    assertIntegrationActive(connection, "shopify", organization.id);

    if (!connection.shopDomain) {
      return NextResponse.json(
        { error: "La conexión no tiene shopDomain configurado." },
        { status: 500 },
      );
    }

    const vaultSecret = await getIntegrationSecret({
      organizationId: organization.id,
      connectionId:   connection.id,
      secretType:     SECRET_TYPE.ACCESS_TOKEN,
    });

    if (!vaultSecret) {
      return NextResponse.json(
        { error: "Token de acceso no encontrado — reconecta tu tienda Shopify." },
        { status: 412 },
      );
    }

    const result = await activatePublishedDraftProducts(
      organization.id,
      vaultSecret.plainValue,   // ⚠ server-only
      connection.shopDomain,
      { category, limit, productIds },
    );

    return NextResponse.json({ ok: true, ...result });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
