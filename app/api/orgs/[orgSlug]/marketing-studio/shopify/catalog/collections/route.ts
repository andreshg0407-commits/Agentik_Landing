/**
 * GET  /api/orgs/[orgSlug]/marketing-studio/shopify/catalog/collections
 * POST /api/orgs/[orgSlug]/marketing-studio/shopify/catalog/collections
 *
 * SHOPIFY-COLLECTIONS-03 — Collections CRUD
 *
 * GET  → List all collections from the store.
 * POST → Create a new collection (deduplicates by handle).
 *
 * ── POST Request body ─────────────────────────────────────────────────────────
 *   {
 *     title:        string   — collection name (required)
 *     handle?:      string   — URL handle (auto-derived from title if absent)
 *     description?: string   — optional HTML description
 *   }
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *   Access token fetched from vault — never included in response.
 */

import { NextRequest, NextResponse }   from "next/server";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { getIntegrationConnection }   from "@/lib/integrations/integration-repository";
import { assertIntegrationActive }    from "@/lib/integrations/integration-runtime";
import { getIntegrationSecret }       from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }                from "@/lib/integrations/vault/vault-types";
import { CONNECTION_STATUS }          from "@/lib/integrations/integration-types";
import {
  findShopifyCollections,
  createShopifyCollection,
}                                     from "@/lib/marketing-studio/commerce/shopify-collections-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string }> };

// ── Shared connection resolver ─────────────────────────────────────────────────

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

// ── GET — List collections ─────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);
    const { shopDomain, vaultSecret } = await resolveShopifyConnection(organization.id);

    if (!shopDomain || !vaultSecret) {
      return NextResponse.json({ ok: true, collections: [], disconnected: true });
    }

    const collections = await findShopifyCollections(
      organization.id,
      vaultSecret.plainValue,   // ⚠ server-only
      shopDomain,
    );

    return NextResponse.json({ ok: true, collections });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST — Create collection ───────────────────────────────────────────────────

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
    };

    if (!body.title?.trim()) {
      return NextResponse.json({ error: "El nombre de la colección es requerido." }, { status: 400 });
    }

    const { shopDomain, vaultSecret } = await resolveShopifyConnection(organization.id);

    if (!shopDomain || !vaultSecret) {
      return NextResponse.json(
        { error: "Shopify no está conectado o el token no está disponible." },
        { status: 412 },
      );
    }

    const result = await createShopifyCollection(
      organization.id,
      vaultSecret.plainValue,   // ⚠ server-only
      shopDomain,
      {
        title:       body.title.trim(),
        handle:      body.handle,
        description: body.description,
      },
    );

    return NextResponse.json({ ok: true, ...result });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
