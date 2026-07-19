/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/productos/page.tsx
 *
 * SHOPIFY-PRODUCTS-01 — Centro Inteligente de Gestión de Productos
 * Server Component
 *
 * Architecture (mirrors operaciones/page.tsx):
 *   - Single unified render path regardless of connection/data state
 *   - `connected` and `summary` passed to ProductosClient
 *   - Client handles all states via placeholders — no early returns
 *   - No accessToken needed: this module reads from the Agentik DB only
 *   - No Shopify API calls at page level
 */

import { redirect }                   from "next/navigation";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { canAccessMarketingStudio }   from "@/lib/auth/module-access";
import { T }                          from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";

import { resolveShopifyContextStatus } from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-context-resolver";
import {
  getProductsSummary,
  buildProductsStatusLabel,
}                                      from "@/lib/marketing-studio/commerce/shopify-products-service";
import type { ProductsSummary }        from "@/lib/marketing-studio/commerce/shopify-products-service";

import { ProductosClient }             from "./productos-client";

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function ProductosPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }                  = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  const tenantId = organization.id;

  // ── 1. Connection check ────────────────────────────────────────────────────
  const connectionStatus = await resolveShopifyContextStatus({ tenantId });
  const connected        = connectionStatus.ok;
  const shopDomain       = connectionStatus.shopDomain ?? "";

  // ── 2. Product summary — DB only, no Shopify API ──────────────────────────
  let summary: ProductsSummary | null = null;
  if (connected) {
    try {
      summary = await getProductsSummary(tenantId);
    } catch {
      // Non-blocking — client renders placeholders
    }
  }

  // ── 3. Header status ───────────────────────────────────────────────────────
  const headerStatus: "ok" | "warning" | "critical" | "neutral" =
    !connected                             ? "neutral"  :
    (summary?.requierenAtencion ?? 0) > 0  ? "critical" :
    summary                                ? "ok"       :
    "warning";

  const headerStatusLabel = buildProductsStatusLabel(connected, summary);

  // ── 4. Render — always a unified layout ───────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, fontFamily: T.mono }}>
      <OperationalWorkspaceHeader
        title="Productos"
        subtitle={shopDomain || "Estado del catálogo · Publicación · Calidad comercial"}
        status={headerStatus}
        statusLabel={headerStatusLabel}
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Shopify",          href: `/${orgSlug}/agentik/marketing-studio/shopify` },
          { label: "Productos" },
        ]}
      />

      <ProductosClient
        orgSlug={orgSlug}
        connected={connected}
        shopDomain={shopDomain}
        summary={summary}
      />
    </div>
  );
}
