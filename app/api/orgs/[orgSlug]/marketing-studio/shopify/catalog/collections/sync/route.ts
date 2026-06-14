/**
 * POST /api/orgs/[orgSlug]/marketing-studio/shopify/catalog/collections/sync
 *
 * SHOPIFY-COLLECTIONS-03 — Publish + Sync Products to a Collection
 *
 * Handles:
 *   - dryRun preview of collection sync (no Shopify writes)
 *   - Real sync: publish missing products + add all to collection
 *
 * ── Request body ──────────────────────────────────────────────────────────────
 *   {
 *     title:        string    — collection name (required)
 *     handle?:      string    — URL handle
 *     description?: string    — collection description
 *     productIds?:  string[]  — explicit product selection (takes precedence)
 *     category?:    string    — Agentik category filter
 *     dryRun?:      boolean   — preview only (default false)
 *   }
 *
 * ── Response — dryRun: true ───────────────────────────────────────────────────
 *   200: CollectionDryRunResult
 *
 * ── Response — dryRun: false ──────────────────────────────────────────────────
 *   200: CollectionSyncResult
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *   dryRun skips vault fetch — no Shopify calls made.
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
  dryRunCollectionSync,
  publishCollectionProducts,
}                                     from "@/lib/marketing-studio/commerce/shopify-collections-service";

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
      title?:       string;
      handle?:      string;
      description?: string;
      productIds?:  string[];
      category?:    string;
      dryRun?:      boolean;
    };

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "El nombre de la colección es requerido." }, { status: 400 });
    }

    const input = {
      title:       body.title.trim(),
      handle:      body.handle,
      description: body.description,
      productIds:  Array.isArray(body.productIds) ? body.productIds : undefined,
      category:    typeof body.category === "string" ? body.category : undefined,
    };

    // ── DryRun — no vault, no Shopify calls ─────────────────────────────────
    if (body.dryRun === true) {
      const result = await dryRunCollectionSync(organization.id, input);
      return NextResponse.json({ ok: true, ...result });
    }

    // ── Real sync ────────────────────────────────────────────────────────────
    const connection = await getIntegrationConnection(organization.id, "shopify");
    if (!connection) {
      return NextResponse.json({ error: "Shopify no está conectado." }, { status: 412 });
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

    const result = await publishCollectionProducts(
      organization.id,
      vaultSecret.plainValue,   // ⚠ server-only — never forwarded to client
      connection.shopDomain,
      input,
    );

    return NextResponse.json({ ok: true, ...result });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
