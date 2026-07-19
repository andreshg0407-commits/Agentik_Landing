/**
 * POST /api/orgs/[orgSlug]/marketing-studio/shopify/catalog/publish-ready
 *
 * SHOPIFY-CATALOG-OPERATIONS-01B — Bulk Publish / DryRun
 *
 * Handles both dry-run preview and real bulk publication.
 *
 * ── Request body ──────────────────────────────────────────────────────────────
 *   {
 *     dryRun?:    boolean   — preview only, no Shopify calls (default false)
 *     category?:  string    — filter by product category
 *     batchLimit?: number   — max products to publish (default 50)
 *   }
 *
 * ── Response — dryRun: true ───────────────────────────────────────────────────
 *   200: {
 *     ok: true, dryRun: true,
 *     publishableCount, updateableCount, blockedCount, alreadyPublishedCount,
 *     items: [{ productId, name, sku, category, action, reason }]
 *   }
 *
 * ── Response — dryRun: false (default) ───────────────────────────────────────
 *   200: { ok: true, published, failed, skipped, errors, durationMs }
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *   dryRun skips the vault secret fetch (no Shopify calls needed).
 *   Access token is retrieved from vault only for real publish operations.
 *   Token never included in response.
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { getIntegrationConnection }   from "@/lib/integrations/integration-repository";
import { assertIntegrationActive }    from "@/lib/integrations/integration-runtime";
import { getIntegrationSecret }       from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }                from "@/lib/integrations/vault/vault-types";
import { CONNECTION_STATUS }          from "@/lib/integrations/integration-types";
import {
  dryRunBulkPublish,
  publishReadyProducts,
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

    // ── Parse body ─────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({})) as {
      dryRun?:    boolean;
      category?:  string;
      batchLimit?: number;
      productIds?: string[];
    };
    const isDryRun   = body.dryRun === true;
    const category   = typeof body.category === "string" ? body.category : undefined;
    const batchLimit = typeof body.batchLimit === "number" ? body.batchLimit : 50;
    const productIds = Array.isArray(body.productIds) ? (body.productIds as string[]) : undefined;

    // ── DryRun path — no vault, no Shopify calls ───────────────────────────
    if (isDryRun) {
      const result = await dryRunBulkPublish(organization.id, { category, productIds });
      return NextResponse.json({ ok: true, ...result });
    }

    // ── Real publish path — requires active connection + vault ─────────────
    const connection = await getIntegrationConnection(organization.id, "shopify");
    if (!connection) {
      return NextResponse.json(
        { error: "Shopify no está conectado. Conecta tu tienda primero." },
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

    const result = await publishReadyProducts(
      organization.id,
      vaultSecret.plainValue,   // ⚠ server-only — never forwarded to client
      connection.shopDomain,
      { category, batchLimit, productIds },
    );

    return NextResponse.json({ ok: true, ...result });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
