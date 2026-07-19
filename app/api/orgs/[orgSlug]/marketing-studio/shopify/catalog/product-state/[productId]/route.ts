/**
 * GET /api/orgs/[orgSlug]/marketing-studio/shopify/catalog/product-state/[productId]
 *
 * SHOPIFY-CATALOG-OPERATIONS-01 — Live Shopify Product State
 *
 * Fetches real-time product state from the Shopify Admin API.
 * Used to populate the "Estado en Shopify" section of the product drawer.
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 *   requireOrgAccess — same gate as all marketing-studio routes.
 *   Connection must be CONNECTED.
 *
 * ── Response ──────────────────────────────────────────────────────────────────
 *   200: { ok: true, state: ShopifyExternalProductState | null, error, errorMessage }
 *   412: { error: string }  — no connection
 *   500: { error: string }
 *
 * ── Security ──────────────────────────────────────────────────────────────────
 *   Access token retrieved from vault — NEVER included in response.
 *   Response contains only safe product metadata.
 */

import { NextRequest, NextResponse }      from "next/server";
import { requireOrgAccess }              from "@/lib/auth/org-access";
import { getIntegrationConnection }      from "@/lib/integrations/integration-repository";
import { assertIntegrationActive }       from "@/lib/integrations/integration-runtime";
import { getIntegrationSecret }          from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }                   from "@/lib/integrations/vault/vault-types";
import { CONNECTION_STATUS }             from "@/lib/integrations/integration-types";
import { fetchShopifyProductLiveState }  from "@/lib/marketing-studio/commerce/shopify-catalog-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orgSlug: string; productId: string }> };

export async function GET(
  _req: NextRequest,
  { params }: RouteContext,
): Promise<NextResponse> {
  const { orgSlug, productId } = await params;

  try {
    const { organization } = await requireOrgAccess(orgSlug);

    const connection = await getIntegrationConnection(organization.id, "shopify");
    if (!connection) {
      return NextResponse.json(
        { error: "Shopify no está conectado." },
        { status: 412 },
      );
    }

    if (connection.status !== CONNECTION_STATUS.CONNECTED) {
      return NextResponse.json(
        { error: "La conexión de Shopify no está activa." },
        { status: 412 },
      );
    }

    assertIntegrationActive(connection, "shopify", organization.id);

    if (!connection.shopDomain) {
      return NextResponse.json(
        { error: "Conexión sin shopDomain." },
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
        { error: "Token de acceso no encontrado." },
        { status: 412 },
      );
    }

    const result = await fetchShopifyProductLiveState(
      organization.id,
      productId,
      vaultSecret.plainValue,   // ⚠ server-only — never included in response
      connection.shopDomain,
    );

    // Map error codes to human-readable labels
    const ERROR_LABEL: Record<string, string> = {
      not_found:     "Producto no encontrado en Shopify",
      unauthorized:  "Token de acceso no autorizado",
      rate_limited:  "Límite de API alcanzado — intenta más tarde",
      api_error:     "Error en la API de Shopify",
      network_error: "Error de red al conectar con Shopify",
    };

    // Build the Shopify Admin URL when we have a successful state fetch
    const adminUrl = result.state
      ? `https://${connection.shopDomain}/admin/products/${result.state.externalProductId}`
      : null;

    return NextResponse.json({
      ok:           !result.error,
      state:        result.state,
      adminUrl,
      error:        result.error,
      errorMessage: result.error ? (ERROR_LABEL[result.error] ?? result.errorMessage) : null,
    });

  } catch (err) {
    if (err instanceof Error && err.message.includes("NEXT_REDIRECT")) throw err;
    const msg = err instanceof Error ? err.message : "Error interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
