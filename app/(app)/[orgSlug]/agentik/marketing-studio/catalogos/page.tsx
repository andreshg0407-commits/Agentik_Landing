/**
 * /[orgSlug]/agentik/marketing-studio/catalogos
 *
 * MARKETING-STUDIO-CATALOGS-PANEL-UX-03
 *
 * ── Blueprint layers ─────────────────────────────────────────────────────────
 *   1. OperationalWorkspaceHeader
 *   2. CatalogsPanelClient — quick catalog + custom types + saved catalogs
 *
 * ── Data ─────────────────────────────────────────────────────────────────────
 *   Real: listCatalogDefinitions (persisted) + listProductConsoleItems (in-memory)
 */

import { redirect }                          from "next/navigation";
import { requireOrgAccess }                  from "@/lib/auth/org-access";
import { canAccessMarketingStudio }          from "@/lib/auth/module-access";
import { listProductConsoleItems }           from "@/lib/marketing-studio/products/product-query-service";
import { listCatalogDefinitions }            from "@/lib/marketing-studio/catalogs/catalog-definition-repository";
import { C, T, S }                          from "@/lib/ui/tokens";
import {
  OperationalWorkspaceHeader,
}                                            from "@/components/workspace/operational-workspace-header";
import { CatalogsPanelClient }               from "@/components/marketing-studio/catalogs/catalogs-panel-client";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CatalogosPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }                  = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  // ── Real data ──
  const [products, savedCatalogs] = await Promise.all([
    listProductConsoleItems(organization.id),
    listCatalogDefinitions(organization.id),
  ]);

  // ── Header status ──
  const readyProducts     = products.filter(p => p.readinessLevel === "ready").length;
  const headerStatus      = products.length === 0 || readyProducts > 0 ? "ok" : "warning";
  const headerStatusLabel =
    products.length === 0
      ? "Sin productos — aprueba assets en Foto Estudio para comenzar"
      : readyProducts > 0
        ? `${readyProducts} producto${readyProducts !== 1 ? "s" : ""} listo${readyProducts !== 1 ? "s" : ""} para catálogos`
        : "Completa la información de los productos para comenzar";

  return (
    <div style={{ fontFamily: T.mono, maxWidth: 1080 }}>

      {/* ── 1. Header ── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Catálogos" },
        ]}
        title="Catálogos"
        subtitle="Convierte productos aprobados en catálogos comerciales listos para WhatsApp, Shopify y campañas."
        status={headerStatus}
        statusLabel={headerStatusLabel}
      />

      {/* ── 2. Main panel — alert + quick + custom + saved + wizard ── */}
      <CatalogsPanelClient
        products={products}
        savedCatalogs={savedCatalogs}
        orgSlug={orgSlug}
      />

      {/* ── Footer ── */}
      <div style={{
        marginTop: S[8], paddingTop: S[4],
        borderTop: `1px solid ${C.lineSubtle}`,
        display: "flex", justifyContent: "flex-end",
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
          MS-CA-03 Catalogs Panel v3
        </div>
      </div>

    </div>
  );
}
