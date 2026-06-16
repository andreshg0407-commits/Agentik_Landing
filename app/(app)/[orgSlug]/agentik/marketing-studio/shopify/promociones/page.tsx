/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/promociones/page.tsx
 *
 * SHOPIFY-MODULE-MATURITY-01 — Promociones Intelligence Console
 * Server Component
 *
 * Architecture (mirrors estadisticas/page.tsx):
 *   - Single unified render path regardless of connection/data state
 *   - `connected` and `promotions` passed to PromocionesClient
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
import { listPromotions }              from "@/lib/marketing-studio/commerce/shopify-promotions-service";
import type { PromotionListResult }    from "@/lib/marketing-studio/commerce/shopify-promotions-types";

import { PromocionesClient }           from "./promociones-client";

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function PromocionesPage({
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

  let shopDomain: string                  = connectionStatus.shopDomain ?? "";
  let promotions: PromotionListResult | null = null;

  // ── 2. Data fetch (only when connected) ───────────────────────────────────
  if (connected) {
    const shopifyCtx = await vaultShopifyContextResolver()(
      { executionId: "", correlationId: "", tenantId, userId: "", requestedAt: new Date() },
    );

    if (shopifyCtx) {
      shopDomain = shopifyCtx.shopDomain;
      try {
        promotions = await listPromotions(
          tenantId,
          shopifyCtx.accessToken,
          shopifyCtx.shopDomain,
        );
      } catch {
        // Non-blocking — client renders placeholders
      }
    }
  }

  // ── 3. Header status ───────────────────────────────────────────────────────
  const activeCount  = promotions?.active.length ?? 0;
  const headerStatus =
    !connected    ? "neutral" :
    activeCount > 0 ? "ok"     : "neutral";

  const headerStatusLabel =
    !connected   ? "Integración requerida" :
    !promotions  ? "Error al cargar datos" :
    activeCount === 0
      ? "Sin promociones activas"
      : `${activeCount} promoción${activeCount !== 1 ? "es" : ""} activa${activeCount !== 1 ? "s" : ""}`;

  // ── 4. Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, fontFamily: T.mono }}>
      <OperationalWorkspaceHeader
        title="Promociones y descuentos"
        subtitle={shopDomain || "Descuentos · Códigos · Campañas"}
        status={headerStatus}
        statusLabel={headerStatusLabel}
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Shopify",          href: `/${orgSlug}/agentik/marketing-studio/shopify` },
          { label: "Promociones" },
        ]}
      />

      <PromocionesClient
        orgSlug={orgSlug}
        connected={connected}
        shopDomain={shopDomain}
        promotions={promotions}
      />
    </div>
  );
}
