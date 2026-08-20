/**
 * /[orgSlug]/agentik/marketing-studio/biblioteca
 *
 * MS-04A / MARKETING-LIBRARY-INVENTORY-TRUTH-02A-R1 — Biblioteca / Asset Hub
 *
 * Server Component — owns auth, data fetching.
 * Interactive grid + drawer delegated to BibliotecaClient (client boundary).
 *
 * ── Data ──────────────────────────────────────────────────────────────────────
 *   Real:        loadInventoryReferences (CCS + PIL + ProductEntity)
 *   Real:        listOrgApprovedAssets (orphan approved assets)
 *   Placeholder: per-asset channels/usage/score  // PLACEHOLDER
 *
 * ── No Prisma changes · no engine changes · no SAG adapter changes ────────────
 */

import { redirect }                 from "next/navigation";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import { listOrgApprovedAssets }    from "@/lib/marketing-studio/asset-service";
import { C, T, S }                  from "@/lib/ui/tokens";
import {
  OperationalWorkspaceHeader,
} from "@/components/workspace/operational-workspace-header";
import {
  BibliotecaClient,
} from "@/components/marketing-studio/library/biblioteca-client";
import type {
  BibliotecaAssetDisplay,
} from "@/components/marketing-studio/library/asset-detail-drawer";
import { listProductConsoleItems }    from "@/lib/marketing-studio/products/product-query-service";
import { loadInventoryReferences }    from "@/lib/marketing-studio/library/inventory-reference-service";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function BibliotecaPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }                  = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  // ── Load inventory references (Tres Mundos) ──
  const inventoryResult = await loadInventoryReferences(organization.id);
  const inventoryMode   = inventoryResult.hasSnapshot;
  const truthState      = inventoryResult.truthState;

  // ── Fallback: load legacy data if no inventory snapshot ──
  const [products, legacyAssets] = inventoryMode
    ? [[], []]
    : await Promise.all([
        listProductConsoleItems(organization.id),
        listOrgApprovedAssets(organization.id, 60),
      ]);

  // ── Also load approved assets for orphan detection ──
  const approvedAssets = inventoryMode
    ? await listOrgApprovedAssets(organization.id, 200)
    : legacyAssets;

  const productMode = !inventoryMode && products.length > 0;

  // ── Status line ──
  const totalRefs      = inventoryResult.worldCounts.total;
  const available      = inventoryResult.references.filter(r => r.isAvailable).length;
  const sinClasificar  = inventoryResult.worldCounts.sin_clasificar;
  const vs             = inventoryResult.visualStateCounts;

  // Pre-compute display model for legacy assets (backward compat)
  const displayAssets: BibliotecaAssetDisplay[] = legacyAssets.map((asset) => ({
    id:           asset.id,
    assetUrl:     asset.assetUrl,
    assetType:    asset.assetType,
    name:         asset.session.productSku
                    ? `SKU ${asset.session.productSku}`
                    : asset.assetType.replace(/_/g, " "),
    sku:          asset.session.productSku ?? null,
    status:       "approved",
    channels:     [],
    usageCount:   0,
    variantCount: 0,
    score:        0,
    highPerformer: false,
    stale:         false,
    createdAt:     "—",
    origin:        "ai" as const,
  }));

  // ── Presets ──
  const inventoryPresets = [
    { id: "available",        label: "Con stock",            accent: "green",  description: "Referencias con inventario disponible" },
    { id: "with_hero",        label: "Con imagen principal", accent: "blue",   description: "Referencias con hero image" },
    { id: "no_assets",        label: "Sin recursos",         accent: "gray",   description: "Sin ningún asset visual" },
    { id: "inactive",         label: "Sin stock",            accent: "red",    description: "Inventario agotado — conservan assets" },
    { id: "sin_clasificar",   label: "Sin clasificar",       accent: "amber",  description: "Mundo no determinado — requiere revisión" },
  ];

  const legacyPresets = [
    { id: "all",              label: "Todos",                accent: "blue",   description: "Todos los assets aprobados" },
  ];

  const featuredPresets = inventoryMode ? inventoryPresets : legacyPresets;

  return (
    <div style={{ fontFamily: T.mono, maxWidth: 1080 }}>

      {/* ── 1. Header ── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Biblioteca / Asset Hub" },
        ]}
        title="Biblioteca / Asset Hub"
        subtitle={inventoryMode
          ? `Registro visual canónico · ${totalRefs} referencias · ${available} disponibles`
          : "Sistema nervioso visual de marketing — assets, catálogos, destinos, inteligencia."
        }
        status={
          truthState === "DATA_UNVERIFIED" ? "warning"
            : truthState === "STALE" ? "warning"
            : truthState === "PARTIAL" ? "warning"
            : sinClasificar > 0 ? "warning"
            : totalRefs > 0 ? "ok"
            : "neutral"
        }
        statusLabel={
          truthState === "DATA_UNVERIFIED"
            ? "DATA_UNVERIFIED — sin snapshot SAG"
            : truthState === "STALE"
            ? "STALE — mostrando último snapshot válido"
            : truthState === "PARTIAL"
            ? `PARTIAL — ${!inventoryResult.sourceHealth.ccs.ok ? "CCS" : "PIL"} no disponible`
            : inventoryMode
              ? sinClasificar > 0
                ? `${sinClasificar} sin clasificar`
                : `${totalRefs} referencias clasificadas`
              : `${displayAssets.length} assets aprobados`
        }
      />

      {/* ── Truth state banners ── */}
      {truthState === "DATA_UNVERIFIED" && (
        <div style={{
          padding:      `${S[3]}px ${S[4]}px`,
          background:   C.amberLight,
          border:       `1px solid ${C.amberBorder}`,
          borderRadius: 6,
          marginBottom: S[4],
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          color:        C.amber,
          fontWeight:   600,
        }}>
          DATA_UNVERIFIED — No se encontró snapshot de inventario SAG.
          Mostrando datos de producto/assets existentes. La fuente SAG no está disponible.
        </div>
      )}

      {truthState === "STALE" && (
        <div style={{
          padding:      `${S[3]}px ${S[4]}px`,
          background:   C.amberLight,
          border:       `1px solid ${C.amberBorder}`,
          borderRadius: 6,
          marginBottom: S[4],
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          color:        C.amber,
          fontWeight:   600,
        }}>
          STALE — La fuente CCS falló. Mostrando último snapshot válido
          {inventoryResult.snapshotAt
            ? ` del ${new Date(inventoryResult.snapshotAt).toLocaleDateString("es-CO", {
                day: "2-digit", month: "short", year: "numeric",
              })}`
            : ""
          }.
          Los datos pueden no reflejar el inventario actual.
        </div>
      )}

      {truthState === "PARTIAL" && (
        <div style={{
          padding:      `${S[3]}px ${S[4]}px`,
          background:   C.amberLight,
          border:       `1px solid ${C.amberBorder}`,
          borderRadius: 6,
          marginBottom: S[4],
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          color:        C.amber,
          fontWeight:   600,
        }}>
          PARTIAL — {!inventoryResult.sourceHealth.ccs.ok
            ? "CCS (Castillitos + Latin Kids) no disponible. Importación visible."
            : "PIL (Importación) no disponible. Castillitos y Latin Kids visibles."
          }
          {" "}La sección afectada no muestra datos — no significa stock cero.
        </div>
      )}

      {/* ── 2. Client workspace ── */}
      <BibliotecaClient
        assets={displayAssets}
        products={productMode ? products : undefined}
        inventoryReferences={inventoryMode ? inventoryResult.references : undefined}
        inventoryWorldCounts={inventoryMode ? inventoryResult.worldCounts : undefined}
        inventorySnapshotAt={inventoryResult.snapshotAt}
        reconciliation={inventoryMode ? inventoryResult.reconciliation : undefined}
        orgSlug={orgSlug}
        organizationId={organization.id}
        presets={featuredPresets}
      />

      {/* ── Visual state summary (inventory mode) ── */}
      {inventoryMode && (
        <div style={{
          display: "flex", alignItems: "center", gap: S[4],
          marginTop: S[4], padding: `${S[2]}px ${S[3]}px`,
          background: C.surface, borderRadius: 6,
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
        }}>
          <span>Estados visuales:</span>
          <span style={{ color: C.green }}>Con hero: {vs.with_hero}</span>
          <span style={{ color: C.amber }}>Con assets: {vs.with_assets}</span>
          <span style={{ color: C.inkFaint }}>Sin recursos: {vs.no_assets}</span>
          <span style={{ color: C.red }}>Inactivas: {vs.inactive}</span>
          <span style={{ color: C.amber }}>Sin clasificar: {vs.sin_clasificar}</span>
          <span style={{ fontWeight: 700, color: C.ink }}>Total: {vs.total}</span>
        </div>
      )}

      {/* ── Status legend ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: S[3],
        marginTop: S[8], paddingTop: S[4],
        borderTop: `1px solid ${C.lineSubtle}`, flexWrap: "wrap" as const,
      }}>
        {LEGEND.map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: S[1], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.dot, display: "inline-block", flexShrink: 0 }} />
            {s.label}
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
          MARKETING-LIBRARY-INVENTORY-TRUTH-02A-R1
        </div>
      </div>

    </div>
  );
}

// ── Static data ───────────────────────────────────────────────────────────────

const LEGEND = [
  { dot: "#22c55e", label: "Con imagen principal" },
  { dot: "#f59e0b", label: "Con assets, sin principal" },
  { dot: "#94a3b8", label: "Sin recursos visuales" },
  { dot: "#ef4444", label: "Inactiva (sin stock)" },
  { dot: "#f59e0b", label: "Sin clasificar" },
];
