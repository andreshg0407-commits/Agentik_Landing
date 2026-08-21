/**
 * /[orgSlug]/agentik/marketing-studio/biblioteca
 *
 * MS-04A / MARKETING-LIBRARY-ACTIVE-ASSET-INGESTION-02A-R4A — Biblioteca / Asset Hub
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

  // ── R4: Active-only filtering ──
  // Biblioteca shows ONLY references with available inventory.
  // Sin stock references are hidden from grid/tabs/filters — not deleted from DB/R2.
  const activeRefs = inventoryResult.references.filter(r => r.isAvailable);

  // Recompute world counts over active references only
  const activeWorldCounts: import("@/lib/marketing-studio/library/world-classification").WorldCounts = {
    castillitos:    activeRefs.filter(r => r.world === "castillitos").length,
    latin_kids:     activeRefs.filter(r => r.world === "latin_kids").length,
    importacion:    activeRefs.filter(r => r.world === "importacion").length,
    sin_clasificar: activeRefs.filter(r => r.world === "sin_clasificar").length,
    total:          activeRefs.length,
  };

  // Recompute visual state counts over active references only
  const activeVs = {
    with_hero:      activeRefs.filter(r => r.visualState === "with_hero").length,
    with_assets:    activeRefs.filter(r => r.visualState === "with_assets").length,
    no_assets:      activeRefs.filter(r => r.visualState === "no_assets").length,
    sin_clasificar: activeRefs.filter(r => r.visualState === "sin_clasificar").length,
    inactive:       0, // excluded by definition
    total:          activeRefs.length,
  };

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

  // ── Status line (R4A: source-qualified counts) ──
  const totalRefs      = activeRefs.length;
  const sinClasificar  = activeWorldCounts.sin_clasificar;
  const vs             = activeVs;

  // Source-qualified counts for transparency
  const ccsActive = activeRefs.filter(r => r.source === "ccs").length;
  const pilActive = activeRefs.filter(r => r.source === "pil").length;
  const pilUnverified = !inventoryResult.pilReservationReliable;

  // Snapshot freshness label
  const snapshotLabel = inventoryResult.snapshotAt
    ? new Date(inventoryResult.snapshotAt).toLocaleDateString("es-CO", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

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
    { id: "with_hero",        label: "Con imagen principal", accent: "blue",   description: "Referencias con hero image" },
    { id: "no_assets",        label: "Sin recursos",         accent: "gray",   description: "Sin ningún asset visual" },
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
          ? `${totalRefs} referencias disponibles · CCS: ${ccsActive}${pilActive > 0 ? ` · IM: ${pilActive}${pilUnverified ? " (stock fisico)" : ""}` : ""}${snapshotLabel ? ` · Corte: ${snapshotLabel}` : ""}`
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
                ? `${totalRefs} disponibles · ${sinClasificar} sin clasificar`
                : `${totalRefs} referencias disponibles`
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

      {/* ── PIL reservation reliability warning (R4A Section B) ── */}
      {inventoryMode && pilUnverified && pilActive > 0 && (
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
          IMPORTACION ({pilActive} ref{pilActive !== 1 ? "s" : ""}) — Stock fisico en bodega, no disponible real.
          Las reservas de importacion no estan integradas en SAG (reservedQty=0).
          Las cantidades mostradas son inventario fisico en bodega. Confirmar disponibilidad con operaciones antes de comprometer stock.
        </div>
      )}

      {/* ── 2. Client workspace ── */}
      <BibliotecaClient
        assets={displayAssets}
        products={productMode ? products : undefined}
        inventoryReferences={inventoryMode ? activeRefs : undefined}
        inventoryWorldCounts={inventoryMode ? activeWorldCounts : undefined}
        inventorySnapshotAt={inventoryResult.snapshotAt}
        reconciliation={inventoryMode ? inventoryResult.reconciliation : undefined}
        orgSlug={orgSlug}
        organizationId={organization.id}
        presets={featuredPresets}
      />

      {/* ── Visual state summary + source qualification (inventory mode) ── */}
      {inventoryMode && (
        <div style={{
          display: "flex", flexDirection: "column" as const, gap: S[2],
          marginTop: S[4],
        }}>
          {/* Source-qualified counts (R4A Section A) */}
          <div style={{
            display: "flex", alignItems: "center", gap: S[4],
            padding: `${S[2]}px ${S[3]}px`,
            background: C.surface, borderRadius: 6,
            fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
          }}>
            <span style={{ fontWeight: 600 }}>Fuentes:</span>
            <span>CCS (CS+LT+OT): {ccsActive} activas</span>
            <span>{pilUnverified ? "·" : "·"} PIL (IM): {pilActive}{pilUnverified ? " (stock fisico)" : ""}</span>
            <span>· Bodegas CCS: B01+B04+B14+B15</span>
            {snapshotLabel && <span style={{ color: C.inkFaint }}>· Corte: {snapshotLabel}</span>}
          </div>
          {/* Visual states */}
          <div style={{
            display: "flex", alignItems: "center", gap: S[4],
            padding: `${S[2]}px ${S[3]}px`,
            background: C.surface, borderRadius: 6,
            fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
          }}>
            <span>Estados visuales:</span>
            <span style={{ color: C.green }}>Con hero: {vs.with_hero}</span>
            <span style={{ color: C.amber }}>Con assets: {vs.with_assets}</span>
            <span style={{ color: C.inkFaint }}>Sin recursos: {vs.no_assets}</span>
            <span style={{ color: C.amber }}>Sin clasificar: {vs.sin_clasificar}</span>
            <span style={{ fontWeight: 700, color: C.ink }}>Total: {vs.total}</span>
          </div>
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
          MARKETING-LIBRARY-ACTIVE-ASSET-INGESTION-02A-R4A
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
  { dot: "#f59e0b", label: "Sin clasificar" },
];
