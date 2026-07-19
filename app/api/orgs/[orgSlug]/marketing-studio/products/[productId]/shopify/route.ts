/**
 * app/api/orgs/[orgSlug]/marketing-studio/products/[productId]/shopify/route.ts
 *
 * MARKETING-STUDIO-SHOPIFY-PUBLISHING-01
 *
 * GET    → readiness + publication status (no token needed — reads DB only)
 * POST   → publish new product to Shopify
 * PUT    → update existing Shopify product from Agentik content
 * DELETE → archive (soft-unpublish) on Shopify
 *
 * ── SECURITY ──────────────────────────────────────────────────────────────────
 *   requireOrgAccess validates the session.
 *   Access token fetched from vault server-side only — NEVER sent to client.
 *   Response body contains only safe publication metadata.
 *   All DB operations scoped to organizationId.
 */

import { NextRequest, NextResponse }     from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { getIntegrationConnection }      from "@/lib/integrations/integration-repository";
import { assertIntegrationActive }       from "@/lib/integrations/integration-runtime";
import { getIntegrationSecret }          from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }                   from "@/lib/integrations/vault/vault-types";
import { checkShopifyReadiness }         from "@/lib/integrations/shopify/shopify-content-resolver";
import {
  publishWithContent,
  updateWithContent,
  archiveShopifyProduct,
} from "@/lib/integrations/shopify/shopify-content-publisher";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ orgSlug: string; productId: string }>;
}

// ── GET — readiness + publication status ──────────────────────────────────────

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, productId } = await params;
    const { organization }       = await requireOrgAccess(orgSlug);

    // Check whether Shopify is connected (no token needed for readiness)
    const connection = await getIntegrationConnection(organization.id, "shopify");

    const readiness = await checkShopifyReadiness(organization.id, productId);

    return NextResponse.json({
      ...readiness,
      shopifyConnected:  !!connection && connection.status === "connected",
      shopifyShopDomain: connection?.shopDomain ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[shopify GET]", err);
    if (msg.includes("unauthorized")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to load Shopify status" }, { status: 500 });
  }
}

// ── Shared: resolve connection + vault token ─────────────────────────────────

async function resolveAccess(organizationId: string) {
  const connection = await getIntegrationConnection(organizationId, "shopify");
  if (!connection) throw Object.assign(new Error("shopify_not_connected"), { status: 412 });

  assertIntegrationActive(connection, "shopify", organizationId);

  if (!connection.shopDomain) throw Object.assign(new Error("shopify_missing_domain"), { status: 500 });

  const vaultSecret = await getIntegrationSecret({
    organizationId,
    connectionId: connection.id,
    secretType:   SECRET_TYPE.ACCESS_TOKEN,
  });
  if (!vaultSecret) throw Object.assign(new Error("shopify_token_missing"), { status: 412 });

  return {
    shopDomain:  connection.shopDomain,
    accessToken: vaultSecret.plainValue,   // ⚠ server-only — never forwarded
  };
}

// ── POST — publish new product ────────────────────────────────────────────────

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, productId } = await params;
    const { organization }       = await requireOrgAccess(orgSlug);

    const { shopDomain, accessToken } = await resolveAccess(organization.id);

    const result = await publishWithContent({
      organizationId: organization.id,
      productId,
      accessToken,    // ⚠ server-only — never in response
      shopDomain,
    });

    // Return safe subset — no token, no shopDomain
    return NextResponse.json({
      success:             result.success,
      shopifyProductId:    result.shopifyProductId,
      shopifyHandle:       result.shopifyHandle,
      adminUrl:            result.adminUrl,
      variantCount:        result.variantCount,
      imageCount:          result.imageCount,
      metafieldCount:      result.metafieldCount,
      warnings:            result.warnings,
      contentScore:        result.contentScore,
      hasShopifyOverrides: result.hasShopifyOverrides,
      errorMessage:        result.errorMessage,
    });
  } catch (err) {
    return _handleActionError(err);
  }
}

// ── PUT — update existing product ────────────────────────────────────────────

export async function PUT(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, productId } = await params;
    const { organization }       = await requireOrgAccess(orgSlug);

    const { shopDomain, accessToken } = await resolveAccess(organization.id);

    const result = await updateWithContent({
      organizationId: organization.id,
      productId,
      accessToken,
      shopDomain,
    });

    return NextResponse.json({
      success:             result.success,
      shopifyProductId:    result.shopifyProductId,
      shopifyHandle:       result.shopifyHandle,
      adminUrl:            result.adminUrl,
      variantCount:        result.variantCount,
      imageCount:          result.imageCount,
      metafieldCount:      result.metafieldCount,
      warnings:            result.warnings,
      contentScore:        result.contentScore,
      hasShopifyOverrides: result.hasShopifyOverrides,
      errorMessage:        result.errorMessage,
    });
  } catch (err) {
    return _handleActionError(err);
  }
}

// ── DELETE — archive (soft-unpublish) ────────────────────────────────────────

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { orgSlug, productId } = await params;
    const { organization }       = await requireOrgAccess(orgSlug);

    const { shopDomain, accessToken } = await resolveAccess(organization.id);

    const result = await archiveShopifyProduct({
      organizationId: organization.id,
      productId,
      accessToken,
      shopDomain,
    });

    return NextResponse.json(result);
  } catch (err) {
    return _handleActionError(err);
  }
}

// ── Error handler ─────────────────────────────────────────────────────────────

function _handleActionError(err: unknown): NextResponse {
  const msg = err instanceof Error ? err.message : "unknown";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (err as any)?.status ?? 500;
  console.error("[shopify action]", err);

  const USER_MESSAGES: Record<string, string> = {
    shopify_not_connected: "Shopify no está conectado. Conecta tu tienda primero.",
    shopify_missing_domain: "La conexión Shopify no tiene dominio configurado.",
    shopify_token_missing:  "Token de acceso no encontrado — reconecta tu tienda Shopify.",
    unauthorized:           "No autorizado.",
  };

  return NextResponse.json(
    { error: USER_MESSAGES[msg] ?? "Error al ejecutar acción en Shopify" },
    { status },
  );
}
