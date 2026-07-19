/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/operaciones/page.tsx
 *
 * SHOPIFY-MODULE-MATURITY-01 — Operaciones Intelligence Console
 * Server Component
 *
 * Architecture (mirrors estadisticas/page.tsx):
 *   - Single unified render path regardless of connection/data state
 *   - `connected`, `ops`, and `summary` passed to OperacionesClient
 *   - Client handles all states via placeholders — no early returns
 *   - accessToken resolved once, never passed to client
 */
import { redirect }                    from "next/navigation";
import { requireOrgAccess }            from "@/lib/auth/org-access";
import { canAccessMarketingStudio }    from "@/lib/auth/module-access";
import { T }                           from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader }  from "@/components/workspace/operational-workspace-header";

import { resolveShopifyContextStatus,
         vaultShopifyContextResolver } from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-context-resolver";
import {
  listOperations,
  generateOperationalSummary,
}                                      from "@/lib/marketing-studio/commerce/shopify-operations-service";
import type { OperationListResult }    from "@/lib/marketing-studio/commerce/shopify-operations-types";

import { OperacionesClient }           from "./operaciones-client";

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function OperacionesPage({
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

  let shopDomain: string                = connectionStatus.shopDomain ?? "";
  let ops:        OperationListResult | null = null;
  let summary:    string | null         = null;

  // ── 2. Data fetch (only when connected) ───────────────────────────────────
  if (connected) {
    const shopifyCtx = await vaultShopifyContextResolver()(
      { executionId: "", correlationId: "", tenantId, userId: "", requestedAt: new Date() },
    );

    if (shopifyCtx) {
      shopDomain = shopifyCtx.shopDomain;
      try {
        ops     = await listOperations(tenantId, shopifyCtx.accessToken, shopifyCtx.shopDomain);
        summary = ops ? generateOperationalSummary(ops) : null;
      } catch {
        // Non-blocking — client renders placeholders
      }
    }
  }

  // ── 3. Header status ───────────────────────────────────────────────────────
  const totalOrders   = ops?.total ?? 0;
  const criticalCount = ops?.alerts.critical ?? 0;

  const headerStatus =
    !connected      ? "neutral"  :
    criticalCount > 0 ? "critical" :
    totalOrders > 0   ? "ok"       : "neutral";

  const headerStatusLabel =
    !connected     ? "Integración requerida" :
    !ops           ? "Error al cargar datos" :
    criticalCount > 0
      ? `${criticalCount} alerta${criticalCount !== 1 ? "s" : ""} crítica${criticalCount !== 1 ? "s" : ""}`
      : totalOrders > 0
        ? `${totalOrders} pedido${totalOrders !== 1 ? "s" : ""} activo${totalOrders !== 1 ? "s" : ""}`
        : "Sin pedidos activos";

  // ── 4. Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, fontFamily: T.mono }}>
      <OperationalWorkspaceHeader
        title="Operaciones"
        subtitle={shopDomain || "Pedidos · Pagos · Envíos · Devoluciones"}
        status={headerStatus}
        statusLabel={headerStatusLabel}
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Shopify",          href: `/${orgSlug}/agentik/marketing-studio/shopify` },
          { label: "Operaciones" },
        ]}
      />

      <OperacionesClient
        orgSlug={orgSlug}
        connected={connected}
        shopDomain={shopDomain}
        ops={ops}
        summary={summary}
      />
    </div>
  );
}
