/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/banners/page.tsx
 *
 * SHOPIFY-EXPERIENCES-ARCHITECTURE-01 — Experiencias Shopify
 * Server Component
 *
 * Constructs the full workspace data bundle and passes it to the client.
 * No Shopify API calls — service reads Agentik DB + catalog only.
 *
 * FUNCTION:
 *   1. Detect Shopify products.
 *   2. Cross with Biblioteca resources.
 *   3. Show what has / doesn't have a landing.
 *   4. Show banner slots.
 *   5. Provide template registry.
 *   6. Show drafts pending review.
 */

import { redirect }                   from "next/navigation";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { canAccessMarketingStudio }   from "@/lib/auth/module-access";
import { T }                          from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";

import { resolveShopifyContextStatus }    from "@/lib/marketing-studio/commerce/shopify-runtime/shopify-context-resolver";
import { getExperiencesWorkspaceData }    from "@/lib/marketing-studio/commerce/shopify-experiences-service";

import { ExperienciasClient }             from "./banners-client";

export default async function ExperienciasPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }                  = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  const tenantId = organization.id;

  // ── Connection check ───────────────────────────────────────────────────────
  const connectionStatus = await resolveShopifyContextStatus({ tenantId });
  const connected        = connectionStatus.ok;
  const shopDomain       = connectionStatus.shopDomain ?? "";

  // ── Load workspace data ────────────────────────────────────────────────────
  let workspace = await getExperiencesWorkspaceData(tenantId, connected, shopDomain);

  // ── Header status ──────────────────────────────────────────────────────────
  const { summary } = workspace;
  const headerStatus: "ok" | "warning" | "critical" | "neutral" =
    !connected                          ? "neutral" :
    summary.borrradoresPendientes > 0   ? "warning" :
    summary.productosListos > 0         ? "ok"      :
    summary.productosDetectados > 0     ? "ok"      :
    "neutral";

  const headerStatusLabel =
    !connected                        ? "Integración requerida" :
    summary.borrradoresPendientes > 0 ? `${summary.borrradoresPendientes} borradores pendientes de revisión` :
    summary.productosListos > 0       ? `${summary.productosListos} productos listos para landing` :
    summary.productosDetectados > 0   ? `${summary.productosDetectados} productos detectados` :
    "Sin productos en catálogo";

  return (
    <div style={{ maxWidth: 1100, fontFamily: T.mono }}>
      <OperationalWorkspaceHeader
        title="Experiencias Shopify"
        subtitle={shopDomain || "Landings · Banners · Plantillas · Borradores"}
        status={headerStatus}
        statusLabel={headerStatusLabel}
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Shopify",          href: `/${orgSlug}/agentik/marketing-studio/shopify` },
          { label: "Experiencias" },
        ]}
      />

      <ExperienciasClient
        orgSlug={orgSlug}
        workspace={workspace}
      />
    </div>
  );
}
