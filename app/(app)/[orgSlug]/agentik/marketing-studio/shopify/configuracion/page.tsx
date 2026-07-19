/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/configuracion/page.tsx
 *
 * SHOPIFY-CONFIGURATION-01 — Centro de Configuración y Diagnóstico
 * Server Component
 *
 * Architecture (mirrors operaciones/page.tsx):
 *   - Single unified render path regardless of connection/data state.
 *   - No Shopify API calls at page level — reads Agentik DB and Vault metadata.
 *   - accessToken is never resolved here — not needed for configuration display.
 *   - Secrets never cross the server → client boundary.
 */
import { redirect }                   from "next/navigation";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { canAccessMarketingStudio }   from "@/lib/auth/module-access";
import { T }                          from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";

import { resolveShopifyContextStatus } from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-context-resolver";
import {
  getShopifyConfigSummary,
  buildConfigStatusLabel,
}                                      from "@/lib/marketing-studio/commerce/shopify-config-service";
import type { ShopifyConfigSummary }  from "@/lib/marketing-studio/commerce/shopify-config-service";

import { ConfiguracionClient }        from "./configuracion-client";

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function ConfiguracionPage({
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

  // ── 2. Full config summary (reads DB + Vault metadata — no secrets) ────────
  let summary: ShopifyConfigSummary | null = null;
  try {
    summary = await getShopifyConfigSummary(tenantId);
  } catch {
    // Non-blocking — client renders placeholders
  }

  // ── 3. Header status ───────────────────────────────────────────────────────
  const criticals = summary?.signals.filter(s => s.severity === "critical").length ?? 0;
  const warnings  = summary?.signals.filter(s => s.severity === "warning").length  ?? 0;

  const headerStatus: "ok" | "warning" | "critical" | "neutral" =
    !connected    ? "neutral"  :
    criticals > 0 ? "critical" :
    warnings  > 0 ? "warning"  :
    summary       ? "ok"       :
    "neutral";

  const headerStatusLabel = buildConfigStatusLabel(connected, summary);

  // ── 4. Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1100, fontFamily: T.mono }}>
      <OperationalWorkspaceHeader
        title="Configuración Shopify"
        subtitle={shopDomain || "Conexión · Sincronización · Permisos · Diagnóstico"}
        status={headerStatus}
        statusLabel={headerStatusLabel}
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Shopify",          href: `/${orgSlug}/agentik/marketing-studio/shopify` },
          { label: "Configuración" },
        ]}
      />
      <ConfiguracionClient
        orgSlug={orgSlug}
        connected={connected}
        shopDomain={shopDomain}
        summary={summary}
      />
    </div>
  );
}
