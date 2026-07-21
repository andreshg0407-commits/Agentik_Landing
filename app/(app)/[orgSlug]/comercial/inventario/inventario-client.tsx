"use client";

/**
 * inventario-client.tsx
 *
 * COMERCIAL-INVENTARIO-CANONICAL-STATUS-INTEGRATION-01 — Client Component.
 *
 * The Inventory Control Center is the official owner of commercial inventory.
 * Textile: Bodega 01+04+14+15 (LT, CS, OT, PW, PD). Accessories: B26+B27 (productLine=5).
 *
 * Tab structure:
 *   CASTILLITOS | LATIN_KIDS | IMPORTACION | SIN_CLASIFICAR | AGOTADOS | VAULT
 *
 * Jupiter Pets (EXTERNAL_EXCLUDED) counted but never rendered in any tab.
 * LOW_ACTIVITY_AVAILABLE stays in its line tab with "Baja actividad" signal.
 * VAULT shows dormant, archive-review, non-commercial, unknown references.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { CommercialProductDrawer, ProductThumbnail } from "@/components/comercial/commercial-product-drawer";
import type { CommercialProductData } from "@/components/comercial/commercial-product-drawer";
import type {
  InventoryControlSnapshot,
  InventoryItem,
  InventoryOperationalState,
  SubgrupoCoverage,
  AccesorioBajaCantidad,
} from "@/lib/inventory/inventory-control-types";
import {
  CANONICAL_LINE_LABELS,
} from "@/lib/inventory/inventory-control-types";
import type {
  CanonicalInventorySnapshot,
  CanonicalInventoryItemStatus,
} from "@/lib/inventory/inventory-canonical-status-loader";
import type { PanelDestination, VaultSubcategory } from "@/lib/inventory/inventory-panel-destination";
import {
  VAULT_SUBCATEGORY_LABELS,
} from "@/lib/inventory/inventory-panel-destination";
import type { CommercialReferenceStatus } from "@/lib/inventory/commercial-reference-status";

// ── Date formatting (hydration-safe) ─────────────────────────────────────────

function formatDateTimeEsCoStable(iso: string): string {
  const d = new Date(iso);
  return d
    .toLocaleString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Bogota",
    })
    .replace(/\u00A0/g, " ")
    .replace(/\.\s*m\./g, (m) => m.replace(/\s+/g, "\u202F"));
}

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

type FilterKey =
  | "todos"
  | "disponible"
  | "bajo"
  | "sin_cobertura"
  | "subgrupos"
  | "accesorios_bajo";

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "todos",           label: "Todos" },
  { key: "disponible",      label: "Disponibles" },
  { key: "bajo",            label: "Bajo" },
  { key: "sin_cobertura",   label: "Sin cobertura" },
  { key: "subgrupos",       label: "Subgrupos" },
  { key: "accesorios_bajo", label: "Acc. bajo" },
];

const STATE_COLORS: Record<InventoryOperationalState, string> = {
  disponible:          C.green,
  alta_disponibilidad: C.green,
  bajo:                C.amber,
  sin_cobertura:       C.red,
  critico:             C.red,
  recompra_futura:     C.amber,
  agotado:             C.red,
  con_produccion:      "#6366f1",
  sin_produccion:      C.red,
  pendiente_validar:   C.inkGhost,
};

const STATE_LABELS: Record<InventoryOperationalState, string> = {
  disponible:          "Disponible",
  alta_disponibilidad: "Alta disp.",
  bajo:                "Bajo",
  sin_cobertura:       "Sin cobertura",
  critico:             "Critico",
  recompra_futura:     "Recompra",
  agotado:             "Agotado",
  con_produccion:      "Con OP",
  sin_produccion:      "Sin OP",
  pendiente_validar:   "Sin umbral",
};

const COMMERCIAL_STATUS_LABELS: Record<CommercialReferenceStatus, string> = {
  ACTIVE_AVAILABLE: "Activo disponible",
  ACTIVE_NON_COMMERCIAL: "Activo no comercial",
  LOW_ACTIVITY_AVAILABLE: "Baja actividad disponible",
  LOW_ACTIVITY_NON_COMMERCIAL: "Baja actividad no comercial",
  DORMANT: "Dormante",
  ARCHIVE_REVIEW: "Revision de archivo",
  UNKNOWN: "Desconocido",
};

const COMMERCIAL_STATUS_COLORS: Record<CommercialReferenceStatus, string> = {
  ACTIVE_AVAILABLE: C.green,
  ACTIVE_NON_COMMERCIAL: C.amber,
  LOW_ACTIVITY_AVAILABLE: C.blueDark,
  LOW_ACTIVITY_NON_COMMERCIAL: C.amber,
  DORMANT: C.inkLight,
  ARCHIVE_REVIEW: C.red,
  UNKNOWN: C.inkGhost,
};

// Tab order for the main navigation
const TAB_ORDER: PanelDestination[] = [
  "CASTILLITOS",
  "LATIN_KIDS",
  "IMPORTACION",
  "SIN_CLASIFICAR",
  "AGOTADOS",
  "VAULT",
];

const TAB_LABELS: Record<PanelDestination, string> = {
  CASTILLITOS: "Castillitos",
  LATIN_KIDS: "Latin Kids",
  IMPORTACION: "Importacion",
  SIN_CLASIFICAR: "Sin clasificar",
  AGOTADOS: "Agotadas",
  VAULT: "Historico",
  EXTERNAL_EXCLUDED: "Externas",
};

const TAB_ICONS: Record<PanelDestination, string> = {
  CASTILLITOS: "\uD83D\uDC55",
  LATIN_KIDS: "\uD83D\uDC76",
  IMPORTACION: "\uD83D\uDCE6",
  SIN_CLASIFICAR: "\u2753",
  AGOTADOS: "\u2B55",
  VAULT: "\uD83D\uDDC4\uFE0F",
  EXTERNAL_EXCLUDED: "",
};

// Grid columns
const TEXTILE_GRID = "36px 120px 1fr 120px 80px 90px";
const ACCESSORY_GRID = "36px 100px 1fr 100px 70px 80px 80px";
const VAULT_GRID = "120px 1fr 100px 100px 100px 90px 120px";
const AGOTADOS_GRID = "36px 120px 1fr 100px 100px 80px";

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug: string;
  snapshot: InventoryControlSnapshot;
  canonicalSnapshot: CanonicalInventorySnapshot;
}

// ── Component ────────────────────────────────────────────────────────────────

export function InventarioClient({ orgSlug, snapshot, canonicalSnapshot }: Props) {
  const [activeTab, setActiveTab] = useState<PanelDestination>("CASTILLITOS");
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [search, setSearch] = useState("");
  const [expandedLines, setExpandedLines] = useState<Set<string>>(
    () => new Set(["CASTILLITOS"]),
  );
  const [pageMap, setPageMap] = useState<Record<string, number>>({});

  const { health, dataQuality, items, subgrupoCoverage, accesoriosBajaCantidad } = snapshot;
  const { panels, canonicalItems } = canonicalSnapshot;

  // ── Compute tab counts ─────────────────────────────────────────────────
  const tabCounts = useMemo(() => {
    const counts: Record<PanelDestination, number> = {
      CASTILLITOS: panels.CASTILLITOS.length,
      LATIN_KIDS: panels.LATIN_KIDS.length,
      IMPORTACION: panels.IMPORTACION.length,
      SIN_CLASIFICAR: panels.SIN_CLASIFICAR.length,
      AGOTADOS: panels.AGOTADOS.length,
      VAULT: panels.VAULT.length,
      EXTERNAL_EXCLUDED: panels.EXTERNAL_EXCLUDED.length,
    };
    return counts;
  }, [panels]);

  // ── Active panel items (filtered + searched) ───────────────────────────

  const panelItems = useMemo(() => {
    if (activeTab === "VAULT" || activeTab === "AGOTADOS") {
      // These tabs use canonical items directly
      let result = panels[activeTab];
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        result = result.filter(
          ci => ci.reference.toLowerCase().includes(q) || ci.description.toLowerCase().includes(q),
        );
      }
      return result;
    }

    // For line-based tabs, we filter the original items from the panel
    let result = panels[activeTab];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        ci => ci.reference.toLowerCase().includes(q) || ci.description.toLowerCase().includes(q),
      );
    }
    return result;
  }, [panels, activeTab, search]);

  // ── Cross-panel search hint (CANONICAL-INVENTORY-REFERENCE-LOOKUP-01) ──
  // When search yields 0 results in current tab, check OTHER tabs for an exact
  // normalized reference match. Partial matches are excluded to avoid false hints.
  const crossPanelHint = useMemo(() => {
    if (!search.trim() || panelItems.length > 0) return null;
    // Normalize: trim, uppercase, collapse whitespace — same as normalizeReferenceCode
    const q = search.trim().toUpperCase().replace(/\s+/g, " ");
    if (!q) return null;
    const TAB_ORDER: PanelDestination[] = [
      "CASTILLITOS", "LATIN_KIDS", "IMPORTACION", "SIN_CLASIFICAR", "AGOTADOS", "VAULT",
    ];
    for (const tab of TAB_ORDER) {
      if (tab === activeTab || tab === "EXTERNAL_EXCLUDED") continue;
      const found = panels[tab].find(ci => {
        const normRef = ci.reference.trim().toUpperCase().replace(/\s+/g, " ");
        return normRef === q;
      });
      if (found) return { tab, label: TAB_LABELS[tab], reference: found.reference };
    }
    return null;
  }, [search, panelItems.length, activeTab, panels]);

  // ── Map canonical items to original items for line-based tabs ──────────
  const originalItemsByRef = useMemo(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of items) {
      map.set(item.reference, item);
    }
    return map;
  }, [items]);

  // ── Filter active tab items by operational filter ─────────────────────
  const filteredPanelItems = useMemo(() => {
    if (activeTab === "VAULT" || activeTab === "AGOTADOS") return panelItems;

    let result = panelItems;
    switch (filter) {
      case "disponible":
        result = result.filter(ci => {
          const orig = originalItemsByRef.get(ci.reference);
          return orig && (orig.operationalState === "disponible" || orig.operationalState === "alta_disponibilidad");
        });
        break;
      case "bajo":
        result = result.filter(ci => {
          const orig = originalItemsByRef.get(ci.reference);
          return orig && (orig.operationalState === "bajo" || orig.operationalState === "critico");
        });
        break;
      case "sin_cobertura":
        result = result.filter(ci => {
          const orig = originalItemsByRef.get(ci.reference);
          return orig && orig.disponibleReal <= 0;
        });
        break;
      case "accesorios_bajo":
        result = result.filter(ci => {
          const orig = originalItemsByRef.get(ci.reference);
          return orig && orig.isAccessory && orig.disponibleReal > 0 && orig.disponibleReal < 10;
        });
        break;
      case "subgrupos":
        result = result.filter(ci => {
          const orig = originalItemsByRef.get(ci.reference);
          return orig && orig.lineCategory === "textile";
        });
        break;
      default:
        break;
    }
    return result;
  }, [panelItems, filter, activeTab, originalItemsByRef]);

  // ── Grouped items for line-based tabs ─────────────────────────────────
  const sortedItems = useMemo(() => {
    const sorted = [...filteredPanelItems];
    sorted.sort((a, b) => {
      const origA = originalItemsByRef.get(a.reference);
      const origB = originalItemsByRef.get(b.reference);
      const ga = (origA?.grupoSag ?? "").localeCompare(origB?.grupoSag ?? "");
      if (ga !== 0) return ga;
      const sa = (origA?.subgrupoSag ?? "").localeCompare(origB?.subgrupoSag ?? "");
      if (sa !== 0) return sa;
      return a.reference.localeCompare(b.reference);
    });
    return sorted;
  }, [filteredPanelItems, originalItemsByRef]);

  // ── Vault subcategory groups ──────────────────────────────────────────
  const vaultGroups = useMemo(() => {
    if (activeTab !== "VAULT") return new Map<VaultSubcategory, CanonicalInventoryItemStatus[]>();
    const map = new Map<VaultSubcategory, CanonicalInventoryItemStatus[]>();
    for (const ci of panelItems) {
      if (!ci.vaultSubcategory) continue;
      const list = map.get(ci.vaultSubcategory) ?? [];
      list.push(ci);
      map.set(ci.vaultSubcategory, list);
    }
    return map;
  }, [panelItems, activeTab]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const toggleLine = (line: string) => {
    setExpandedLines(prev => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  };

  const getPage = (key: string) => pageMap[key] ?? 1;
  const setPage = (key: string, page: number) =>
    setPageMap(prev => ({ ...prev, [key]: page }));

  const switchTab = (tab: PanelDestination) => {
    setActiveTab(tab);
    setFilter("todos");
    setSearch("");
    setPageMap({});
  };

  // ── Drawer state + enrichment ────────────────────────────────────
  const [drawerItem, setDrawerItem] = useState<InventoryItem | null>(null);
  const [drawerCanonical, setDrawerCanonical] = useState<CanonicalInventoryItemStatus | null>(null);
  const [enrichment, setEnrichment] = useState<{
    categoria: string | null;
    precioDetal: number | null;
    precioMayorista: number | null;
    grupoSag: string | null;
    lineaSag: string | null;
    subgrupoSag: string | null;
    grupoId: number | null;
    lineaId: number | null;
    subgrupoId: number | null;
    costo: number | null;
    manejaTallaColor: boolean;
    barcode: string | null;
    description2: string | null;
    handlingUnit: string | null;
    createdAtSag: string | null;
    lastModifiedSag: string | null;
    lastPurchaseSag: string | null;
    lastSaleSag: string | null;
    tallas: string[];
    colores: string[];
    variantCount: number;
  } | null>(null);
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);
  const enrichmentRef = useRef<string | null>(null);

  // Build canonical lookup
  const canonicalByRef = useMemo(() => {
    const map = new Map<string, CanonicalInventoryItemStatus>();
    for (const ci of canonicalItems) {
      map.set(ci.reference, ci);
    }
    return map;
  }, [canonicalItems]);

  const openDrawer = useCallback((item: InventoryItem) => {
    setDrawerItem(item);
    setDrawerCanonical(canonicalByRef.get(item.reference) ?? null);
    setEnrichment(null);
    setEnrichmentLoading(true);
    enrichmentRef.current = item.reference;
  }, [canonicalByRef]);

  const openDrawerFromCanonical = useCallback((ci: CanonicalInventoryItemStatus) => {
    const orig = ci.originalItem;
    setDrawerItem(orig);
    setDrawerCanonical(ci);
    setEnrichment(null);
    setEnrichmentLoading(true);
    enrichmentRef.current = ci.reference;
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerItem(null);
    setDrawerCanonical(null);
    setEnrichment(null);
    setEnrichmentLoading(false);
    enrichmentRef.current = null;
  }, []);

  // Fetch enrichment data when drawer opens
  useEffect(() => {
    if (!drawerItem) return;
    const ref = drawerItem.reference;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `/api/orgs/${orgSlug}/comercial/inventario/product-detail?reference=${encodeURIComponent(ref)}`,
        );
        if (cancelled || enrichmentRef.current !== ref) return;
        if (res.ok) {
          const json = await res.json();
          if (json.ok && json.detail) {
            const d = json.detail;
            setEnrichment({
              categoria: d.categoria ?? null,
              precioDetal: d.precioDetal ?? null,
              precioMayorista: d.precioMayorista ?? null,
              grupoSag: d.grupoSag ?? null,
              lineaSag: d.lineaSag ?? null,
              subgrupoSag: d.subgrupoSag ?? null,
              grupoId: d.grupoId ?? null,
              lineaId: d.lineaId ?? null,
              subgrupoId: d.subgrupoId ?? null,
              costo: d.costo ?? null,
              manejaTallaColor: d.manejaTallaColor ?? false,
              barcode: d.barcode ?? null,
              description2: d.description2 ?? null,
              handlingUnit: d.handlingUnit ?? null,
              createdAtSag: d.createdAtSag ?? null,
              lastModifiedSag: d.lastModifiedSag ?? null,
              lastPurchaseSag: d.lastPurchaseSag ?? null,
              lastSaleSag: d.lastSaleSag ?? null,
              tallas: d.tallas ?? [],
              colores: d.colores ?? [],
              variantCount: d.variantCount ?? 0,
            });
          }
        }
      } catch {
        // Network error — graceful degradation
      } finally {
        if (!cancelled && enrichmentRef.current === ref) {
          setEnrichmentLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [drawerItem, orgSlug]);

  const drawerProduct: CommercialProductData | null = useMemo(() => {
    if (!drawerItem) return null;
    return {
      reference: drawerItem.reference,
      description: drawerItem.description,
      stateLabel: STATE_LABELS[drawerItem.operationalState],
      stateColor: STATE_COLORS[drawerItem.operationalState],
      disponible: drawerItem.disponibleReal,
      linea: drawerItem.subLinea,
      subGrupo: drawerItem.subGrupo,
      subgrupoSag: enrichment?.subgrupoSag ?? drawerItem.subgrupoSag,
      categoria: enrichment?.categoria ?? undefined,
      precioDetal: enrichment?.precioDetal ?? undefined,
      precioMayorista: enrichment?.precioMayorista ?? undefined,
      reservado: drawerItem.pedidosPendientes,
      totalStock: drawerItem.existenciaBodega01,
      lineCategory: drawerItem.lineCategory,
      isAccessory: drawerItem.isAccessory,
      enrichmentLoading,
      grupoSag: enrichment?.grupoSag ?? drawerItem.grupoSag,
      lineaSag: enrichment?.lineaSag,
      grupoId: enrichment?.grupoId,
      lineaId: enrichment?.lineaId,
      subgrupoId: enrichment?.subgrupoId,
      costo: enrichment?.costo,
      manejaTallaColor: enrichment?.manejaTallaColor,
      barcode: enrichment?.barcode,
      description2: enrichment?.description2,
      handlingUnit: enrichment?.handlingUnit ?? drawerItem.handlingUnit,
      createdAtSag: enrichment?.createdAtSag,
      lastModifiedSag: enrichment?.lastModifiedSag,
      lastPurchaseSag: enrichment?.lastPurchaseSag,
      lastSaleSag: enrichment?.lastSaleSag,
      tallas: enrichment?.tallas,
      colores: enrichment?.colores,
      variantCount: enrichment?.variantCount,
    };
  }, [drawerItem, enrichment, enrichmentLoading]);

  return (
    <div style={{ padding: S[6], maxWidth: 1200 }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Comercial", href: `/${orgSlug}/comercial/maletas` },
          { label: "Inventario" },
        ]}
        title="Inventario"
        subtitle={`Centro de control comercial — ${items.length.toLocaleString("es-CO")} referencias`}
      />

      {/* ── KPI Strip ─────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        gap: S[3],
        marginBottom: S[5],
      }}>
        <KpiCard
          label="Total referencias"
          value={items.length}
          detail="Referencias registradas"
          detailColor={C.inkGhost}
        />
        <KpiCard
          label="Total unidades"
          value={health.totalDisponibleBodega}
          suffix=" uds"
          detail="Inventario disponible"
          detailColor={C.inkGhost}
        />
        <KpiCard
          label="Castillitos"
          value={health.totalCS}
          suffix=" uds"
          color={C.blueDark}
          detail="Unidades disponibles"
          detailColor={C.inkGhost}
          onClick={() => switchTab("CASTILLITOS")}
        />
        <KpiCard
          label="Latin Kids"
          value={health.totalLT}
          suffix=" uds"
          color={C.blueDark}
          detail="Unidades disponibles"
          detailColor={C.inkGhost}
          onClick={() => switchTab("LATIN_KIDS")}
        />
        <KpiCard
          label="Importacion"
          value={health.totalImportacion}
          suffix=" uds"
          color={C.blueDark}
          detail="Unidades disponibles"
          detailColor={C.inkGhost}
          onClick={() => switchTab("IMPORTACION")}
        />
      </div>

      {/* ── Sync Status Block ──────────────────────────────────────────── */}
      <SyncStatusBlock dataQuality={dataQuality} />

      {/* ── Tab Navigation ─────────────────────────────────────────────── */}
      <TabNavigation
        tabs={TAB_ORDER}
        activeTab={activeTab}
        tabCounts={tabCounts}
        onSwitch={switchTab}
      />

      {/* ── Filters + Search (only for line-based tabs) ─────────────── */}
      {activeTab !== "VAULT" && activeTab !== "AGOTADOS" && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: S[3],
          marginBottom: S[5],
          flexWrap: "wrap" as const,
        }}>
          <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
            {FILTER_OPTIONS.map(opt => {
              const active = filter === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => { setFilter(opt.key); setPageMap({}); }}
                  className="ag-action-ghost"
                  style={{
                    fontFamily: T.mono,
                    fontSize: T.sz["2xs"],
                    padding: `4px ${S[3]}px`,
                    borderRadius: R.pill,
                    border: `1px solid ${active ? C.blueDark : C.line}`,
                    background: active ? C.blueDark : "transparent",
                    color: active ? "#fff" : C.inkMid,
                    cursor: "pointer",
                    fontWeight: active ? T.wt.semibold : T.wt.normal,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPageMap({}); }}
            placeholder="Buscar referencia o descripcion..."
            style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              padding: `6px ${S[3]}px`,
              borderRadius: R.sm,
              border: `1px solid ${C.line}`,
              background: C.surface,
              color: C.ink,
              flex: "1 1 200px",
              minWidth: 200,
              outline: "none",
            }}
          />

          <span style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            color: C.inkLight,
            flexShrink: 0,
          }}>
            {filteredPanelItems.length} referencia{filteredPanelItems.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* ── Search for VAULT / AGOTADOS tabs ───────────────────────── */}
      {(activeTab === "VAULT" || activeTab === "AGOTADOS") && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: S[3],
          marginBottom: S[5],
        }}>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPageMap({}); }}
            placeholder="Buscar referencia o descripcion..."
            style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              padding: `6px ${S[3]}px`,
              borderRadius: R.sm,
              border: `1px solid ${C.line}`,
              background: C.surface,
              color: C.ink,
              flex: "1 1 200px",
              minWidth: 200,
              outline: "none",
            }}
          />
          <span style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            color: C.inkLight,
            flexShrink: 0,
          }}>
            {panelItems.length} referencia{panelItems.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* ── Line-based Tab Content (CASTILLITOS, LATIN_KIDS, IMPORTACION, SIN_CLASIFICAR) */}
      {activeTab !== "VAULT" && activeTab !== "AGOTADOS" && (
        <>
          {sortedItems.length === 0 ? (
            <EmptyState
              message={
                search.trim()
                  ? `Sin resultados para "${search.trim()}"${crossPanelHint ? ` en ${TAB_LABELS[activeTab]}` : ""}`
                  : filter !== "todos"
                  ? `Sin referencias con estado "${FILTER_OPTIONS.find(o => o.key === filter)?.label}"`
                  : `Sin datos de inventario para ${TAB_LABELS[activeTab]}`
              }
              hint={
                crossPanelHint
                  ? `"${crossPanelHint.reference}" esta en el panel ${crossPanelHint.label}`
                  : dataQuality.freshnessLabel === "SIN_DATOS"
                  ? "Sincronice inventario desde SAG para ver datos"
                  : "Ajuste los filtros para ver referencias"
              }
            />
          ) : (
            <LineBasedTable
              items={sortedItems}
              originalItemsByRef={originalItemsByRef}
              canonicalByRef={canonicalByRef}
              isAccessoryTab={activeTab === "IMPORTACION"}
              getPage={getPage}
              setPage={setPage}
              tabKey={activeTab}
              onRowClick={openDrawerFromCanonical}
            />
          )}
        </>
      )}

      {/* ── AGOTADOS Tab Content ──────────────────────────────────── */}
      {activeTab === "AGOTADOS" && (
        <AgotadosTabContent
          items={panelItems}
          originalItemsByRef={originalItemsByRef}
          getPage={getPage}
          setPage={setPage}
          onRowClick={openDrawerFromCanonical}
        />
      )}

      {/* ── VAULT Tab Content ─────────────────────────────────────── */}
      {activeTab === "VAULT" && (
        <VaultTabContent
          groups={vaultGroups}
          expandedLines={expandedLines}
          toggleLine={toggleLine}
          getPage={getPage}
          setPage={setPage}
          onRowClick={openDrawerFromCanonical}
        />
      )}

      {/* ── Subgrupo Coverage Detail ──────────────────────────────── */}
      {filter === "subgrupos" && activeTab !== "VAULT" && activeTab !== "AGOTADOS" && subgrupoCoverage && subgrupoCoverage.length > 0 && (
        <SubgrupoCoveragePanel coverage={subgrupoCoverage} />
      )}

      {/* ── Accessory Low Stock Detail ────────────────────────────── */}
      {filter === "accesorios_bajo" && activeTab === "IMPORTACION" && accesoriosBajaCantidad && accesoriosBajaCantidad.length > 0 && (
        <AccesorioBajaCantidadPanel items={accesoriosBajaCantidad} />
      )}

      {/* ── Commercial Product Drawer ─────────────────────────────── */}
      <CommercialProductDrawer
        open={drawerItem !== null}
        onClose={closeDrawer}
        product={drawerProduct}
      >
        {/* Canonical status section inside drawer */}
        {drawerCanonical && (
          <CanonicalStatusSection canonical={drawerCanonical} />
        )}
      </CommercialProductDrawer>
    </div>
  );
}

// ── Line-Based Table ──────────────────────────────────────────────────────────

function LineBasedTable({
  items,
  originalItemsByRef,
  canonicalByRef,
  isAccessoryTab,
  getPage,
  setPage,
  tabKey,
  onRowClick,
}: {
  items: CanonicalInventoryItemStatus[];
  originalItemsByRef: Map<string, InventoryItem>;
  canonicalByRef: Map<string, CanonicalInventoryItemStatus>;
  isAccessoryTab: boolean;
  getPage: (key: string) => number;
  setPage: (key: string, page: number) => void;
  tabKey: string;
  onRowClick: (ci: CanonicalInventoryItemStatus) => void;
}) {
  const page = getPage(tabKey);
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div style={{
      border: `1px solid ${C.line}`,
      borderRadius: R.sm,
      overflow: "hidden",
      marginBottom: S[4],
    }}>
      {/* Table Header */}
      {isAccessoryTab ? <AccessoryTableHeader /> : <TextileTableHeader />}

      {/* Rows */}
      {pageItems.map((ci, idx) => {
        const orig = originalItemsByRef.get(ci.reference);
        if (!orig) return null;
        const isLowActivity = ci.commercialReferenceStatus === "LOW_ACTIVITY_AVAILABLE";
        return isAccessoryTab ? (
          <AccessoryRow
            key={ci.reference}
            item={orig}
            even={idx % 2 === 0}
            onClick={() => onRowClick(ci)}
            lowActivity={isLowActivity}
          />
        ) : (
          <InventoryRow
            key={ci.reference}
            item={orig}
            even={idx % 2 === 0}
            onClick={() => onRowClick(ci)}
            lowActivity={isLowActivity}
          />
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: S[2],
          padding: `${S[3]}px ${S[4]}px`,
          borderTop: `1px solid ${C.line}`,
        }}>
          <PagButton label="Anterior" disabled={page <= 1} onClick={() => setPage(tabKey, page - 1)} />
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
            {page} / {totalPages}
          </span>
          <PagButton label="Siguiente" disabled={page >= totalPages} onClick={() => setPage(tabKey, page + 1)} />
        </div>
      )}
    </div>
  );
}

// ── Agotados Tab Content ──────────────────────────────────────────────────────

function AgotadosTabContent({
  items,
  originalItemsByRef,
  getPage,
  setPage,
  onRowClick,
}: {
  items: CanonicalInventoryItemStatus[];
  originalItemsByRef: Map<string, InventoryItem>;
  getPage: (key: string) => number;
  setPage: (key: string, page: number) => void;
  onRowClick: (ci: CanonicalInventoryItemStatus) => void;
}) {
  const page = getPage("AGOTADOS_TAB");
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (items.length === 0) {
    return (
      <EmptyState
        message="Sin referencias agotadas"
        hint="Todas las referencias tienen unidades disponibles"
      />
    );
  }

  return (
    <div style={{
      border: `1px solid ${C.line}`,
      borderRadius: R.sm,
      overflow: "hidden",
      marginBottom: S[4],
    }}>
      {/* Header */}
      <div className="ag-op-row" style={{
        display: "grid",
        gridTemplateColumns: AGOTADOS_GRID,
        gap: S[2],
        padding: `${S[2]}px ${S[4]}px`,
        background: C.surfaceAlt ?? C.surface,
        borderBottom: `1px solid ${C.line}`,
      }}>
        {["", "Referencia", "Descripcion", "Linea", "Subgrupo", "Disponible"].map((h, i) => (
          <span key={`${h}-${i}`} style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            fontWeight: T.wt.semibold,
            color: C.inkLight,
            textTransform: "uppercase" as const,
            textAlign: i === 5 ? "center" as const : "left" as const,
          }}>
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      {pageItems.map((ci, idx) => {
        const orig = originalItemsByRef.get(ci.reference) ?? ci.originalItem;
        return (
          <AgotadoRow key={ci.reference} item={orig} even={idx % 2 === 0} onClick={() => onRowClick(ci)} />
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: S[2],
          padding: `${S[3]}px ${S[4]}px`,
          borderTop: `1px solid ${C.line}`,
        }}>
          <PagButton label="Anterior" disabled={page <= 1} onClick={() => setPage("AGOTADOS_TAB", page - 1)} />
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
            {page} / {totalPages}
          </span>
          <PagButton label="Siguiente" disabled={page >= totalPages} onClick={() => setPage("AGOTADOS_TAB", page + 1)} />
        </div>
      )}
    </div>
  );
}

// ── Vault Tab Content ─────────────────────────────────────────────────────────

function VaultTabContent({
  groups,
  expandedLines,
  toggleLine,
  getPage,
  setPage,
  onRowClick,
}: {
  groups: Map<VaultSubcategory, CanonicalInventoryItemStatus[]>;
  expandedLines: Set<string>;
  toggleLine: (key: string) => void;
  getPage: (key: string) => number;
  setPage: (key: string, page: number) => void;
  onRowClick: (ci: CanonicalInventoryItemStatus) => void;
}) {
  const entries = Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);

  if (entries.length === 0) {
    return (
      <EmptyState
        message="Sin referencias en historico"
        hint="Todas las referencias estan activas y disponibles"
      />
    );
  }

  return (
    <div>
      {entries.map(([subcategory, items]) => {
        const key = `VAULT_${subcategory}`;
        const expanded = expandedLines.has(key);
        const page = getPage(key);
        const totalPages = Math.ceil(items.length / PAGE_SIZE);
        const pageItems = expanded ? items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : [];

        return (
          <div key={subcategory} style={{ marginBottom: S[3] }}>
            {/* Subcategory Header */}
            <button
              onClick={() => toggleLine(key)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: `${S[3]}px ${S[4]}px`,
                background: `${C.ink}04`,
                border: `1px solid ${C.line}`,
                borderRadius: expanded ? `${R.sm}px ${R.sm}px 0 0` : R.sm,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
                <span style={{
                  fontFamily: T.mono,
                  fontSize: T.sz.xs,
                  color: C.inkGhost,
                  width: 16,
                  textAlign: "center" as const,
                }}>
                  {expanded ? "\u25BE" : "\u25B8"}
                </span>
                <span style={{
                  fontFamily: T.mono,
                  fontSize: T.sz.sm,
                  fontWeight: T.wt.bold,
                  color: C.inkMid,
                }}>
                  {VAULT_SUBCATEGORY_LABELS[subcategory]}
                </span>
                <span style={{
                  fontFamily: T.mono,
                  fontSize: T.sz["2xs"],
                  color: C.inkLight,
                }}>
                  {items.length} referencia{items.length !== 1 ? "s" : ""}
                </span>
              </div>
            </button>

            {/* Expanded Table */}
            {expanded && (
              <div style={{
                border: `1px solid ${C.line}`,
                borderTop: "none",
                borderRadius: `0 0 ${R.sm}px ${R.sm}px`,
                overflow: "hidden",
              }}>
                {/* Table Header */}
                <div className="ag-op-row" style={{
                  display: "grid",
                  gridTemplateColumns: VAULT_GRID,
                  gap: S[2],
                  padding: `${S[2]}px ${S[4]}px`,
                  background: C.surfaceAlt ?? C.surface,
                  borderBottom: `1px solid ${C.line}`,
                }}>
                  {["Referencia", "Descripcion", "Linea", "Estado", "Disponible", "En proceso", "Accion"].map((h, i) => (
                    <span key={`${h}-${i}`} style={{
                      fontFamily: T.mono,
                      fontSize: T.sz["2xs"],
                      fontWeight: T.wt.semibold,
                      color: C.inkLight,
                      textTransform: "uppercase" as const,
                      textAlign: i >= 4 ? "center" as const : "left" as const,
                    }}>
                      {h}
                    </span>
                  ))}
                </div>

                {/* Rows */}
                {pageItems.map((ci, idx) => (
                  <VaultRow key={ci.reference} ci={ci} even={idx % 2 === 0} onClick={() => onRowClick(ci)} />
                ))}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: S[2],
                    padding: `${S[3]}px ${S[4]}px`,
                    borderTop: `1px solid ${C.line}`,
                  }}>
                    <PagButton label="Anterior" disabled={page <= 1} onClick={() => setPage(key, page - 1)} />
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                      {page} / {totalPages}
                    </span>
                    <PagButton label="Siguiente" disabled={page >= totalPages} onClick={() => setPage(key, page + 1)} />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Vault Row ─────────────────────────────────────────────────────────────────

function VaultRow({ ci, even, onClick }: { ci: CanonicalInventoryItemStatus; even: boolean; onClick: () => void }) {
  const statusColor = COMMERCIAL_STATUS_COLORS[ci.commercialReferenceStatus];
  const statusLabel = COMMERCIAL_STATUS_LABELS[ci.commercialReferenceStatus];

  return (
    <div
      className="ag-op-row"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: VAULT_GRID,
        gap: S[2],
        padding: `${S[2]}px ${S[4]}px`,
        background: even ? C.surface : "transparent",
        borderBottom: `1px solid ${C.line}22`,
        alignItems: "center",
        cursor: "pointer",
        transition: "background 0.12s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${C.blueDark}06`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = even ? C.surface : "transparent"; }}
    >
      {/* Reference */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        fontWeight: T.wt.semibold,
        color: C.inkMid,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {ci.reference}
      </span>

      {/* Description */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkLight,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {ci.description}
      </span>

      {/* Canonical Line */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkGhost,
      }}>
        {CANONICAL_LINE_LABELS[ci.canonicalLine]}
      </span>

      {/* Commercial Status */}
      <span className="ag-op-status" style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        fontWeight: T.wt.semibold,
        color: statusColor,
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: statusColor,
          display: "inline-block",
          flexShrink: 0,
        }} />
        {statusLabel}
      </span>

      {/* Compatible commercial stock */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        color: ci.compatibleCommercialStock > 0 ? C.ink : C.inkGhost,
        textAlign: "center" as const,
      }}>
        {ci.compatibleCommercialStock > 0 ? ci.compatibleCommercialStock.toLocaleString("es-CO") : "\u2014"}
      </span>

      {/* Other stock (production + staging + container) */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        color: C.inkGhost,
        textAlign: "center" as const,
      }}>
        {(ci.totalProductionStock + ci.totalStagingStock + ci.totalContainerStock) > 0
          ? (ci.totalProductionStock + ci.totalStagingStock + ci.totalContainerStock).toLocaleString("es-CO")
          : "\u2014"}
      </span>

      {/* Action label */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.blueDark,
        textAlign: "center" as const,
      }}>
        {ci.vaultActionLabel ?? "\u2014"}
      </span>
    </div>
  );
}

// ── Canonical Status Section (Drawer) ─────────────────────────────────────────

function CanonicalStatusSection({ canonical }: { canonical: CanonicalInventoryItemStatus }) {
  const statusColor = COMMERCIAL_STATUS_COLORS[canonical.commercialReferenceStatus];
  const statusLabel = COMMERCIAL_STATUS_LABELS[canonical.commercialReferenceStatus];

  return (
    <div style={{
      padding: `${S[4]}px 0`,
      borderTop: `1px solid ${C.line}`,
    }}>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        fontWeight: T.wt.bold,
        color: C.ink,
        marginBottom: S[3],
        textTransform: "uppercase" as const,
      }}>
        Estado comercial
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${S[2]}px ${S[4]}px` }}>
        <DrawerField label="Estado" value={statusLabel} valueColor={statusColor} />
        <DrawerField label="Linea" value={CANONICAL_LINE_LABELS[canonical.canonicalLine]} />
        <DrawerField
          label="Disponible"
          value={canonical.compatibleCommercialStock > 0 ? canonical.compatibleCommercialStock.toLocaleString("es-CO") : "\u2014"}
        />
        <DrawerField
          label="En produccion"
          value={canonical.totalProductionStock > 0 ? canonical.totalProductionStock.toLocaleString("es-CO") : "\u2014"}
        />
        {canonical.lastRelevantActivityAt && (
          <DrawerField
            label="Ultima actividad"
            value={formatDateTimeEsCoStable(canonical.lastRelevantActivityAt)}
          />
        )}
        {canonical.inactivityDays !== null && (
          <DrawerField
            label="Dias inactivo"
            value={`${canonical.inactivityDays}`}
            valueColor={canonical.inactivityDays > 365 ? C.red : canonical.inactivityDays > 180 ? C.amber : C.ink}
          />
        )}
        <DrawerField label="Ubicacion" value={TAB_LABELS[canonical.panelDestination]} />
        {canonical.vaultSubcategory && (
          <DrawerField label="Subcategoria" value={VAULT_SUBCATEGORY_LABELS[canonical.vaultSubcategory]} />
        )}
      </div>

    </div>
  );
}

function DrawerField({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkGhost,
        textTransform: "uppercase" as const,
        marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        color: valueColor ?? C.ink,
        fontWeight: T.wt.semibold,
      }}>
        {value}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label, value, color, suffix, detail, detailColor, onClick,
}: {
  label: string;
  value: number;
  color?: string;
  suffix?: string;
  detail?: string;
  detailColor?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className="ag-kpi-card"
      onClick={onClick}
      style={{
        padding: `${S[4]}px ${S[4]}px`,
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderRadius: R.sm,
        boxShadow: E.xs,
        cursor: onClick ? "pointer" : undefined,
        transition: "border-color 0.15s",
      }}
      onMouseEnter={onClick ? (e) => { (e.currentTarget as HTMLDivElement).style.borderColor = C.blueDark; } : undefined}
      onMouseLeave={onClick ? (e) => { (e.currentTarget as HTMLDivElement).style.borderColor = C.line; } : undefined}
    >
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkLight,
        marginBottom: S[1],
        textTransform: "uppercase" as const,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xl"],
        fontWeight: T.wt.bold,
        color: color ?? C.ink,
        lineHeight: 1,
      }}>
        {value.toLocaleString("es-CO")}{suffix ?? ""}
      </div>
      {detail && (
        <div style={{
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          color: detailColor ?? C.inkFaint,
          marginTop: S[1],
        }}>
          {detail}
        </div>
      )}
    </div>
  );
}

// ── Tab Navigation (single-line, horizontally scrollable) ──────────────────

function TabNavigation({
  tabs,
  activeTab,
  tabCounts,
  onSwitch,
}: {
  tabs: PanelDestination[];
  activeTab: PanelDestination;
  tabCounts: Record<PanelDestination, number>;
  onSwitch: (tab: PanelDestination) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      ro.disconnect();
    };
  }, [checkScroll]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "right" ? 180 : -180, behavior: "smooth" });
  };

  return (
    <div style={{
      position: "relative" as const,
      marginBottom: S[5],
    }}>
      {/* Left arrow */}
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          aria-label="Desplazar pestanas a la izquierda"
          style={{
            position: "absolute" as const,
            left: 0,
            top: 0,
            bottom: 2,
            width: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(90deg, ${C.surface} 60%, transparent)`,
            border: "none",
            cursor: "pointer",
            zIndex: 2,
            fontFamily: T.mono,
            fontSize: T.sz.sm,
            color: C.inkMid,
          }}
        >
          {"\u25C0"}
        </button>
      )}

      {/* Scrollable track */}
      <div
        ref={scrollRef}
        className="ag-hide-scrollbar"
        style={{
          display: "flex",
          gap: S[2],
          borderBottom: `2px solid ${C.line}`,
          paddingBottom: 0,
          overflowX: "auto" as const,
        }}
      >
        {tabs.map(tab => {
          const active = activeTab === tab;
          const count = tabCounts[tab];
          const icon = TAB_ICONS[tab];
          return (
            <button
              key={tab}
              onClick={() => onSwitch(tab)}
              style={{
                fontFamily: T.mono,
                fontSize: T.sz.xs,
                fontWeight: active ? T.wt.bold : T.wt.semibold,
                padding: `${S[3]}px ${S[4]}px`,
                borderRadius: `${R.md}px ${R.md}px 0 0`,
                border: "none",
                borderBottom: active ? `3px solid ${C.blueDark}` : "3px solid transparent",
                background: active ? `${C.blueDark}0C` : "transparent",
                color: active ? C.blueDark : C.inkMid,
                cursor: "pointer",
                transition: "all 0.15s",
                display: "flex",
                alignItems: "center",
                gap: S[2],
                marginBottom: -2,
                whiteSpace: "nowrap" as const,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: T.sz.sm }}>{icon}</span>
              <span>{TAB_LABELS[tab]}</span>
              <span style={{
                fontFamily: T.mono,
                fontSize: T.sz["2xs"],
                fontWeight: T.wt.bold,
                color: active ? C.blueDark : C.inkLight,
                background: active ? `${C.blueDark}14` : `${C.ink}08`,
                padding: "2px 6px",
                borderRadius: R.pill,
                lineHeight: 1.2,
              }}>
                {count.toLocaleString("es-CO")}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right arrow */}
      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          aria-label="Desplazar pestanas a la derecha"
          style={{
            position: "absolute" as const,
            right: 0,
            top: 0,
            bottom: 2,
            width: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `linear-gradient(270deg, ${C.surface} 60%, transparent)`,
            border: "none",
            cursor: "pointer",
            zIndex: 2,
            fontFamily: T.mono,
            fontSize: T.sz.sm,
            color: C.inkMid,
          }}
        >
          {"\u25B6"}
        </button>
      )}
    </div>
  );
}

// ── Sync Status Block ────────────────────────────────────────────────────────

function SyncStatusBlock({ dataQuality }: { dataQuality: InventoryControlSnapshot["dataQuality"] }) {
  const isStale = dataQuality.freshnessLabel === "SIN_DATOS" || dataQuality.freshnessLabel === "DESACTUALIZADO";
  const dotColor = isStale ? C.amber : C.green;

  // Format date in human-readable LATAM style
  let dateLabel = "";
  if (dataQuality.snapshotAt) {
    const d = new Date(dataQuality.snapshotAt);
    const datePart = d.toLocaleDateString("es-CO", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "America/Bogota",
    });
    const timePart = d.toLocaleTimeString("es-CO", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Bogota",
    });
    dateLabel = `${datePart} \u00B7 ${timePart}`;
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: S[3],
      marginBottom: S[5],
      padding: `${S[2]}px 0`,
    }}>
      <span style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: dotColor,
        display: "inline-block",
        flexShrink: 0,
      }} />
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        fontWeight: T.wt.semibold,
        color: isStale ? C.amber : C.inkMid,
      }}>
        {isStale ? "Desactualizado" : "Actualizado"}
      </span>
      {dateLabel && (
        <span
          suppressHydrationWarning
          style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            color: C.inkLight,
          }}
        >
          {dateLabel}
        </span>
      )}
    </div>
  );
}

// ── Table Headers ────────────────────────────────────────────────────────────

function TextileTableHeader() {
  const headers = ["", "Referencia", "Descripcion", "Subgrupo", "Disponible", "Estado"];
  const centerAligned = new Set([4]);
  return (
    <div className="ag-op-row" style={{
      display: "grid",
      gridTemplateColumns: TEXTILE_GRID,
      gap: S[2],
      padding: `${S[2]}px ${S[4]}px`,
      background: C.surfaceAlt ?? C.surface,
      borderBottom: `1px solid ${C.line}`,
    }}>
      {headers.map((h, i) => (
        <span key={`${h}-${i}`} style={{
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          fontWeight: T.wt.semibold,
          color: C.inkLight,
          textTransform: "uppercase" as const,
          textAlign: centerAligned.has(i) ? "center" as const : "left" as const,
        }}>
          {h}
        </span>
      ))}
    </div>
  );
}

function AccessoryTableHeader() {
  const headers = ["", "Referencia", "Descripcion", "Subgrupo", "Tamano", "Disponible", "Estado"];
  return (
    <div className="ag-op-row" style={{
      display: "grid",
      gridTemplateColumns: ACCESSORY_GRID,
      gap: S[2],
      padding: `${S[2]}px ${S[4]}px`,
      background: C.surfaceAlt ?? C.surface,
      borderBottom: `1px solid ${C.line}`,
    }}>
      {headers.map((h, i) => (
        <span key={`${h}-${i}`} style={{
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          fontWeight: T.wt.semibold,
          color: C.inkLight,
          textTransform: "uppercase" as const,
          textAlign: i >= 4 ? "center" as const : "left" as const,
        }}>
          {h}
        </span>
      ))}
    </div>
  );
}

// ── Textile Row ──────────────────────────────────────────────────────────────

function InventoryRow({ item, even, onClick, lowActivity }: {
  item: InventoryItem;
  even: boolean;
  onClick: () => void;
  lowActivity?: boolean;
}) {
  const stateColor = STATE_COLORS[item.operationalState];
  const stateLabel = STATE_LABELS[item.operationalState];

  return (
    <div
      className="ag-op-row"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: TEXTILE_GRID,
        gap: S[2],
        padding: `${S[2]}px ${S[4]}px`,
        background: even ? C.surface : "transparent",
        borderBottom: `1px solid ${C.line}22`,
        alignItems: "center",
        cursor: "pointer",
        transition: "background 0.12s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${C.blueDark}06`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = even ? C.surface : "transparent"; }}
    >
      <ProductThumbnail reference={item.reference} size={28} />

      <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          fontWeight: T.wt.semibold,
          color: C.ink,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
        }}>
          {item.reference}
        </span>
        {lowActivity && (
          <span style={{
            fontFamily: T.mono,
            fontSize: 9,
            color: C.blueDark,
            padding: "1px 4px",
            borderRadius: R.sm,
            background: `${C.blueDark}10`,
            flexShrink: 0,
          }}>
            BA
          </span>
        )}
      </div>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkMid,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {item.description}
      </span>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkLight,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {item.subgrupoSag}
      </span>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        fontWeight: T.wt.semibold,
        color: item.disponibleReal <= 0 ? C.red : item.disponibleReal <= (item.threshold ?? 0) ? C.amber : C.ink,
        textAlign: "center" as const,
      }}>
        {item.disponibleReal > 0 ? item.disponibleReal.toLocaleString("es-CO") : "\u2014"}
      </span>

      <span className="ag-op-status" style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        fontWeight: T.wt.semibold,
        color: stateColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
      }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: stateColor,
          display: "inline-block",
          flexShrink: 0,
        }} />
        {stateLabel}
      </span>
    </div>
  );
}

// ── Accessory Row ────────────────────────────────────────────────────────────

function AccessoryRow({ item, even, onClick, lowActivity }: {
  item: InventoryItem;
  even: boolean;
  onClick: () => void;
  lowActivity?: boolean;
}) {
  const stateColor = STATE_COLORS[item.operationalState];
  const stateLabel = STATE_LABELS[item.operationalState];

  return (
    <div
      className="ag-op-row"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: ACCESSORY_GRID,
        gap: S[2],
        padding: `${S[2]}px ${S[4]}px`,
        background: even ? C.surface : "transparent",
        borderBottom: `1px solid ${C.line}22`,
        alignItems: "center",
        cursor: "pointer",
        transition: "background 0.12s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${C.blueDark}06`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = even ? C.surface : "transparent"; }}
    >
      <ProductThumbnail reference={item.reference} size={28} />

      <div style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden" }}>
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          fontWeight: T.wt.semibold,
          color: C.ink,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap" as const,
        }}>
          {item.reference}
        </span>
        {lowActivity && (
          <span style={{
            fontFamily: T.mono,
            fontSize: 9,
            color: C.blueDark,
            padding: "1px 4px",
            borderRadius: R.sm,
            background: `${C.blueDark}10`,
            flexShrink: 0,
          }}>
            BA
          </span>
        )}
      </div>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkMid,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {item.description}
      </span>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkLight,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {item.subgrupoSag !== "ACCESORIO" ? item.subgrupoSag : "\u2014"}
      </span>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkMid,
        textAlign: "center" as const,
      }}>
        {item.handlingUnit ?? "\u2014"}
      </span>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        fontWeight: T.wt.semibold,
        color: item.disponibleReal <= 0 ? C.red : item.disponibleReal <= (item.threshold ?? 0) ? C.amber : C.ink,
        textAlign: "center" as const,
      }}>
        {item.disponibleReal > 0 ? item.disponibleReal.toLocaleString("es-CO") : "\u2014"}
      </span>

      <span className="ag-op-status" style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        fontWeight: T.wt.semibold,
        color: stateColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
      }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: stateColor,
          display: "inline-block",
          flexShrink: 0,
        }} />
        {stateLabel}
      </span>
    </div>
  );
}

// ── Agotado Row ──────────────────────────────────────────────────────────────

function AgotadoRow({ item, even, onClick }: { item: InventoryItem; even: boolean; onClick: () => void }) {
  return (
    <div
      className="ag-op-row"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: AGOTADOS_GRID,
        gap: S[2],
        padding: `${S[2]}px ${S[4]}px`,
        background: even ? C.surface : "transparent",
        borderBottom: `1px solid ${C.line}22`,
        alignItems: "center",
        cursor: "pointer",
        transition: "background 0.12s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${C.blueDark}06`; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = even ? C.surface : "transparent"; }}
    >
      <ProductThumbnail reference={item.reference} size={28} />

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        fontWeight: T.wt.semibold,
        color: C.inkMid,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {item.reference}
      </span>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkLight,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {item.description}
      </span>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkGhost,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {CANONICAL_LINE_LABELS[item.canonicalLine]}
      </span>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkGhost,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap" as const,
      }}>
        {item.subgrupoSag}
      </span>

      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        color: C.inkGhost,
        textAlign: "center" as const,
      }}>
        {"\u2014"}
      </span>
    </div>
  );
}

// ── Pagination ───────────────────────────────────────────────────────────────

function PagButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="ag-action-ghost"
      style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        padding: `4px ${S[3]}px`,
        borderRadius: R.sm,
        border: `1px solid ${C.line}`,
        background: "transparent",
        color: disabled ? C.inkGhost : C.blueDark,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

// ── Subgrupo Coverage Panel ─────────────────────────────────────────────────

function SubgrupoCoveragePanel({ coverage }: { coverage: SubgrupoCoverage[] }) {
  const stateColor: Record<string, string> = {
    cubierto: C.green,
    riesgo: C.amber,
    sin_cobertura: C.red,
  };
  const stateLabel: Record<string, string> = {
    cubierto: "Cubierto",
    riesgo: "En riesgo",
    sin_cobertura: "Sin cobertura",
  };

  return (
    <div style={{
      marginTop: S[5],
      border: `1px solid ${C.line}`,
      borderRadius: R.sm,
      overflow: "hidden",
    }}>
      <div style={{
        padding: `${S[3]}px ${S[4]}px`,
        background: C.surfaceAlt ?? C.surface,
        borderBottom: `1px solid ${C.line}`,
      }}>
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          fontWeight: T.wt.bold,
          color: C.ink,
        }}>
          Cobertura por subgrupo
        </span>
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          color: C.inkLight,
          marginLeft: S[3],
        }}>
          {coverage.length} subgrupos
        </span>
      </div>

      <div className="ag-op-row" style={{
        display: "grid",
        gridTemplateColumns: "1fr 80px 80px 80px 100px",
        gap: S[2],
        padding: `${S[2]}px ${S[4]}px`,
        background: C.surfaceAlt ?? C.surface,
        borderBottom: `1px solid ${C.line}`,
      }}>
        {["Subgrupo", "Refs", "Uds", "Tallas", "Estado"].map((h, i) => (
          <span key={h} style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            fontWeight: T.wt.semibold,
            color: C.inkLight,
            textTransform: "uppercase" as const,
            textAlign: i >= 1 && i <= 3 ? "center" as const : "left" as const,
          }}>
            {h}
          </span>
        ))}
      </div>

      {coverage.map((sg, idx) => {
        const sc = stateColor[sg.estado] ?? C.inkGhost;
        return (
          <div key={sg.subgrupoSag} className="ag-op-row" style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px 80px 80px 100px",
            gap: S[2],
            padding: `${S[2]}px ${S[4]}px`,
            background: idx % 2 === 0 ? C.surface : "transparent",
            borderBottom: `1px solid ${C.line}22`,
            alignItems: "center",
          }}>
            <div>
              <span style={{
                fontFamily: T.mono,
                fontSize: T.sz.xs,
                fontWeight: T.wt.semibold,
                color: C.ink,
              }}>
                {sg.subgrupoSag}
              </span>
              <span style={{
                fontFamily: T.mono,
                fontSize: T.sz["2xs"],
                color: C.inkGhost,
                marginLeft: S[2],
              }}>
                {sg.subLinea}
              </span>
            </div>
            <span style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              color: C.inkMid,
              textAlign: "center" as const,
            }}>
              {sg.referenciasActivas}
            </span>
            <span style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              fontWeight: T.wt.semibold,
              color: sg.unidadesDisponibles <= 0 ? C.red : C.ink,
              textAlign: "center" as const,
            }}>
              {sg.unidadesDisponibles > 0 ? sg.unidadesDisponibles.toLocaleString("es-CO") : "\u2014"}
            </span>
            <span style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              color: C.inkMid,
              textAlign: "center" as const,
            }}>
              {sg.tallasDisponibles}
            </span>
            <span className="ag-op-status" style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              fontWeight: T.wt.semibold,
              color: sc,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: sc,
                display: "inline-block",
                flexShrink: 0,
              }} />
              {stateLabel[sg.estado] ?? sg.estado}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Accessory Low Stock Panel ───────────────────────────────────────────────

function AccesorioBajaCantidadPanel({ items }: { items: AccesorioBajaCantidad[] }) {
  const stateColor: Record<string, string> = {
    suficiente: C.green,
    bajo: C.amber,
    critico: C.red,
  };
  const stateLabel: Record<string, string> = {
    suficiente: "Suficiente",
    bajo: "Bajo",
    critico: "Critico",
  };

  return (
    <div style={{
      marginTop: S[5],
      border: `1px solid ${C.line}`,
      borderRadius: R.sm,
      overflow: "hidden",
    }}>
      <div style={{
        padding: `${S[3]}px ${S[4]}px`,
        background: C.surfaceAlt ?? C.surface,
        borderBottom: `1px solid ${C.line}`,
      }}>
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          fontWeight: T.wt.bold,
          color: C.ink,
        }}>
          Accesorios con baja cantidad
        </span>
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          color: C.inkLight,
          marginLeft: S[3],
        }}>
          {items.length} categorias
        </span>
      </div>

      <div className="ag-op-row" style={{
        display: "grid",
        gridTemplateColumns: "1fr 80px 100px 100px",
        gap: S[2],
        padding: `${S[2]}px ${S[4]}px`,
        background: C.surfaceAlt ?? C.surface,
        borderBottom: `1px solid ${C.line}`,
      }}>
        {["Categoria", "Refs", "Uds disponibles", "Estado"].map((h, i) => (
          <span key={h} style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            fontWeight: T.wt.semibold,
            color: C.inkLight,
            textTransform: "uppercase" as const,
            textAlign: i >= 1 && i <= 2 ? "center" as const : "left" as const,
          }}>
            {h}
          </span>
        ))}
      </div>

      {items.map((acc, idx) => {
        const sc = stateColor[acc.estado] ?? C.inkGhost;
        return (
          <div key={acc.categoria} className="ag-op-row" style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px 100px 100px",
            gap: S[2],
            padding: `${S[2]}px ${S[4]}px`,
            background: idx % 2 === 0 ? C.surface : "transparent",
            borderBottom: `1px solid ${C.line}22`,
            alignItems: "center",
          }}>
            <span style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              fontWeight: T.wt.semibold,
              color: C.ink,
            }}>
              {acc.categoria}
            </span>
            <span style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              color: C.inkMid,
              textAlign: "center" as const,
            }}>
              {acc.referenciasActivas}
            </span>
            <span style={{
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              fontWeight: T.wt.semibold,
              color: acc.unidadesDisponibles <= 0 ? C.red : C.ink,
              textAlign: "center" as const,
            }}>
              {acc.unidadesDisponibles > 0 ? acc.unidadesDisponibles.toLocaleString("es-CO") : "\u2014"}
            </span>
            <span className="ag-op-status" style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              fontWeight: T.wt.semibold,
              color: sc,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: sc,
                display: "inline-block",
                flexShrink: 0,
              }} />
              {stateLabel[acc.estado] ?? acc.estado}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ message, hint }: { message: string; hint: string }) {
  return (
    <div style={{
      padding: `${S[8]}px ${S[6]}px`,
      textAlign: "center" as const,
      background: C.surface,
      border: `1px solid ${C.line}`,
      borderRadius: R.sm,
    }}>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz.sm,
        color: C.inkMid,
        marginBottom: S[2],
      }}>
        {message}
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkGhost,
      }}>
        {hint}
      </div>
    </div>
  );
}
