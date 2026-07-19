/**
 * POST /api/orgs/[orgSlug]/marketing-studio/shopify/catalog/update-modified
 *
 * SHOPIFY-CATALOG-BULK-FILTERS-02 — Update Modified Products
 *
 * Handles dry-run preview and real bulk update of products that were modified
 * in Agentik after their last Shopify sync.
 *
 * ── Request body ──────────────────────────────────────────────────────────────
 *   {
 *     dryRun?:     boolean   — preview only, no Shopify calls (default false)
 *     category?:   string    — filter by product category
 *     limit?:      number    — max products to update (default 50)
 *     productIds?: string[]  — explicit product ID list (takes precedence)
 *   }
 *
 * ── Response — dryRun: true ───────────────────────────────────────────────────
 *   200: { ok: true, dryRun: true, total, candidates: [{ productId, name, updatedAt, lastSyncAt }] }
 *
 * ── Response — dryRun: false ──────────────────────────────────────────────────
 *   200: { ok: true, candidates, updated, failed, skipped, errors, durationMs }
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *   dryRun skips vault secret fetch (no Shopify calls needed).
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
  dryRunUpdateModified,
  updateModifiedProducts,
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
      dryRun?:     boolean;
      category?:   string;
      limit?:      number;
      productIds?: string[];
    };
    const isDryRun   = body.dryRun === true;
    const category   = typeof body.category === "string" ? body.category : undefined;
    const limit      = typeof body.limit === "number" ? body.limit : 50;
    const productIds = Array.isArray(body.productIds) ? (body.productIds as string[]) : undefined;

    // ── DryRun — no vault, no Shopify calls ───────────────────────────────
    if (isDryRun) {
      const result = await dryRunUpdateModified(organization.id, { category, productIds });
      return NextResponse.json({ ok: true, ...result });
    }

    // ── Real update ────────────────────────────────────────────────────────
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

    const result = await updateModifiedProducts(
      organization.id,
      vaultSecret.plainValue,   // ⚠ server-only — never forwarded to client
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
