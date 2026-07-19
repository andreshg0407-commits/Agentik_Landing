"use client";

/**
 * inventario-client.tsx
 *
 * COMMERCIAL-INVENTORY-CENTER-01 — Client Component.
 *
 * The Inventory Control Center is the official owner of commercial inventory.
 * Textile: Bodega 01+04+14+15 (LT, CS, OT, PW, PD). Accessories: B26+B27 (productLine=5).
 *
 * Features:
 * - Health KPI strip (textile + accessories)
 * - Filter by operational state (including accessory filters)
 * - Search by reference/description
 * - Grouping by line (SubLinea) with collapsible sections
 * - Real subgrupoSag from SAG (not parsed from description)
 * - Accessories/Importacion section with B26+B27 availability
 * - Criticality via tenant thresholds
 * - Production context (read-only)
 * - Pagination (PAGE_SIZE=20)
 * - Sync status block
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
  CanonicalLine,
  SubgrupoCoverage,
  AccesorioBajaCantidad,
} from "@/lib/inventory/inventory-control-types";
import {
  CANONICAL_LINE_LABELS,
  CANONICAL_LINE_ORDER,
  getActiveCanonicalInventory,
} from "@/lib/inventory/inventory-control-types";

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

// ── COMERCIAL-INVENTARIO-AGOTADOS-HISTORICO-02 ──────────────────────────────
// Active inventory = 4 canonical lines (only disponibleReal > 0).
// Agotados = separate section (disponibleReal <= 0, certified data).
// NO_DATA never mixes with Agotados.

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

// Grid columns: thumbnail + reference + description + subgrupo + disponible + estado
const TEXTILE_GRID = "36px 120px 1fr 120px 80px 90px";
const ACCESSORY_GRID = "36px 100px 1fr 100px 70px 80px 80px";

// Default collapsed lines
const DEFAULT_EXPANDED = new Set(["CASTILLITOS"]);

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug: string;
  snapshot: InventoryControlSnapshot;
}

// ── Component ────────────────────────────────────────────────────────────────

export function InventarioClient({ orgSlug, snapshot }: Props) {
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [search, setSearch] = useState("");
  const [expandedLines, setExpandedLines] = useState<Set<string>>(
    () => new Set(DEFAULT_EXPANDED),
  );
  const [pageMap, setPageMap] = useState<Record<string, number>>({});

  const { health, dataQuality, items, subgrupoCoverage, accesoriosBajaCantidad } = snapshot;

  // ── Split items: active vs agotados (AGOTADOS-HISTORICO-02) ────────────
  // ACTIVE = disponibleReal > 0 (operational inventory)
  // OUT_OF_STOCK = disponibleReal <= 0 AND has certified data (historical)
  // NO_DATA = no availability record — never mixed with agotados

  const activeItems = useMemo(
    () => getActiveCanonicalInventory(items),
    [items],
  );

  const agotadosItems = useMemo(
    () => items.filter(i => i.inventoryVisibility === "OUT_OF_STOCK"),
    [items],
  );

  // ── Counts — always from full item set ─────────────────────────────────

  const agotadosCount = agotadosItems.length;

  const filtered = useMemo(() => {
    // Only filter active items — agotados have their own section
    let result = activeItems;

    // Step 1: Apply operational filter
    switch (filter) {
      case "disponible":
        result = result.filter(i => i.operationalState === "disponible" || i.operationalState === "alta_disponibilidad");
        break;
      case "bajo":
        result = result.filter(i => i.operationalState === "bajo" || i.operationalState === "critico");
        break;
      case "sin_cobertura":
        result = result.filter(i => i.disponibleReal <= 0);
        break;
      case "accesorios_bajo":
        result = result.filter(i => i.isAccessory && i.disponibleReal > 0 && i.disponibleReal < 10);
        break;
      case "subgrupos":
        result = result.filter(i => i.lineCategory === "textile");
        break;
      case "todos":
      default:
        break;
    }

    // Step 2: Apply search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        i => i.reference.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
      );
    }

    return result;
  }, [activeItems, filter, search]);

  // ── Group ACTIVE items by canonical line ─────────────────────────────────

  const groupedByCanonicalLine = useMemo(() => {
    const map = new Map<CanonicalLine, InventoryItem[]>();
    for (const item of filtered) {
      const list = map.get(item.canonicalLine) ?? [];
      list.push(item);
      map.set(item.canonicalLine, list);
    }
    // Sort items within each canonical line by grupoSag → subgrupoSag → reference
    for (const [, lineItems] of map) {
      lineItems.sort((a, b) => {
        const ga = (a.grupoSag ?? "").localeCompare(b.grupoSag ?? "");
        if (ga !== 0) return ga;
        const sa = a.subgrupoSag.localeCompare(b.subgrupoSag);
        if (sa !== 0) return sa;
        return a.reference.localeCompare(b.reference);
      });
    }
    return map;
  }, [filtered]);

  // ── Group AGOTADOS by original canonical line (for sub-grouping) ───────

  const agotadosFiltered = useMemo(() => {
    if (!search.trim()) return agotadosItems;
    const q = search.trim().toLowerCase();
    return agotadosItems.filter(
      i => i.reference.toLowerCase().includes(q) || i.description.toLowerCase().includes(q),
    );
  }, [agotadosItems, search]);

  const agotadosByLine = useMemo(() => {
    const map = new Map<CanonicalLine, InventoryItem[]>();
    for (const item of agotadosFiltered) {
      const list = map.get(item.canonicalLine) ?? [];
      list.push(item);
      map.set(item.canonicalLine, list);
    }
    for (const [, lineItems] of map) {
      lineItems.sort((a, b) => a.reference.localeCompare(b.reference));
    }
    return map;
  }, [agotadosFiltered]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const toggleLine = (line: string) => {
    setExpandedLines(prev => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  };

  const getPage = (line: string) => pageMap[line] ?? 1;
  const setPage = (line: string, page: number) =>
    setPageMap(prev => ({ ...prev, [line]: page }));

  // ── Drawer state + enrichment ────────────────────────────────────
  const [drawerItem, setDrawerItem] = useState<InventoryItem | null>(null);
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

  const openDrawer = useCallback((item: InventoryItem) => {
    setDrawerItem(item);
    setEnrichment(null);
    setEnrichmentLoading(true);
    enrichmentRef.current = item.reference;
  }, []);
  const closeDrawer = useCallback(() => {
    setDrawerItem(null);
    setEnrichment(null);
    setEnrichmentLoading(false);
    enrichmentRef.current = null;
  }, []);

  // Fetch enrichment data (ProductEntity.category + SAG PV3/PV4) when drawer opens
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
        // Network error — graceful degradation, show data without enrichment
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
      // Master data enrichment
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

  // ── Derive header status ───────────────────────────────────────────────

  const headerStatus =
    dataQuality.freshnessLabel === "SIN_DATOS" ? "critical" as const :
    dataQuality.freshnessLabel === "DESACTUALIZADO" ? "warning" as const :
    health.coberturaComercialPct >= 70 ? "ok" as const : "warning" as const;

  const headerStatusLabel =
    dataQuality.freshnessLabel === "SIN_DATOS" ? "Sin datos" :
    `${health.coberturaComercialPct}% cobertura · ${dataQuality.freshnessLabel}`;

  return (
    <div style={{ padding: S[6], maxWidth: 1200 }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Comercial", href: `/${orgSlug}/comercial/maletas` },
          { label: "Inventario" },
        ]}
        title="Inventario"
        subtitle={`Disponibilidad comercial — ${activeItems.length} activas · ${agotadosCount} agotadas · ${items.length} totales`}
        status={headerStatus}
        statusLabel={headerStatusLabel}
      />

      {/* ── KPI Strip — operational (active only) (AGOTADOS-HISTORICO-02) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: S[3],
        marginBottom: S[6],
      }}>
        <KpiCard
          label="Refs activas"
          value={activeItems.length}
          onClick={() => setFilter("todos")}
        />
        <KpiCard
          label="Disponible en bodega"
          value={health.totalDisponibleBodega}
          suffix=" uds"
          onClick={() => setFilter("disponible")}
        />
        <KpiCard
          label="Total LT"
          value={health.totalLT}
          color={C.blueDark}
          suffix=" uds"
          onClick={() => { setFilter("todos"); setExpandedLines(prev => new Set([...prev, "LATIN_KIDS"])); }}
        />
        <KpiCard
          label="Total CS"
          value={health.totalCS}
          color={C.blueDark}
          suffix=" uds"
          onClick={() => { setFilter("todos"); setExpandedLines(prev => new Set([...prev, "CASTILLITOS"])); }}
        />
        <KpiCard
          label="Total Importacion"
          value={health.totalImportacion}
          suffix=" uds"
          detail={health.accesoriosBajaCantidad > 0 ? `${health.accesoriosBajaCantidad} acc. bajo` : undefined}
          detailColor={C.amber}
          onClick={() => { setFilter("todos"); setExpandedLines(prev => new Set([...prev, "IMPORTACION"])); }}
        />
        <KpiCard
          label="Agotadas historicas"
          value={agotadosCount}
          color={C.inkLight}
          onClick={() => setExpandedLines(prev => new Set([...prev, "AGOTADOS"]))}
        />
      </div>

      {/* ── Sync Status Block ─────────────────────────────────────────────── */}
      <SyncStatusBlock dataQuality={dataQuality} />

      {/* ── Filters + Search ──────────────────────────────────────────────── */}
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
          {filtered.length} activa{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Grouped Inventory Table (COMERCIAL-INVENTARIO-CANONICAL-STRUCTURE-01) */}
      {filtered.length === 0 ? (
        <EmptyState
          message={
            search.trim()
              ? `Sin resultados para "${search.trim()}"`
              : filter !== "todos"
              ? `Sin referencias con estado "${FILTER_OPTIONS.find(o => o.key === filter)?.label}"`
              : "Sin datos de inventario"
          }
          hint={
            dataQuality.freshnessLabel === "SIN_DATOS"
              ? "Sincronice inventario desde SAG para ver datos"
              : "Ajuste los filtros para ver referencias"
          }
        />
      ) : (
        CANONICAL_LINE_ORDER
          .filter(cl => groupedByCanonicalLine.has(cl))
          .map(cl => {
            const lineItems = groupedByCanonicalLine.get(cl)!;
            const expanded = expandedLines.has(cl);
            const page = getPage(cl);
            const totalPages = Math.ceil(lineItems.length / PAGE_SIZE);
            const pageItems = expanded
              ? lineItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
              : [];

            const isAccessoryLine = cl === "IMPORTACION";
            const isSinClasificar = cl === "SIN_CLASIFICAR";

            // Compute mini-stats — active items only (no agotados in these sections)
            const lineDisp = lineItems.filter(i =>
              i.operationalState === "disponible" || i.operationalState === "alta_disponibilidad"
            ).length;
            const lineCrit = lineItems.filter(i =>
              i.operationalState === "critico" || i.operationalState === "bajo"
            ).length;

            return (
              <div key={cl} style={{ marginBottom: S[4] }}>
                {/* Canonical Line Header */}
                <button
                  onClick={() => toggleLine(cl)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: `${S[3]}px ${S[4]}px`,
                    background: C.surface,
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
                      color: C.ink,
                    }}>
                      {CANONICAL_LINE_LABELS[cl]}
                    </span>
                    <span style={{
                      fontFamily: T.mono,
                      fontSize: T.sz["2xs"],
                      color: C.inkLight,
                    }}>
                      {lineItems.length} activas
                    </span>
                    {isAccessoryLine && (
                      <span style={{
                        fontFamily: T.mono,
                        fontSize: T.sz["2xs"],
                        color: C.blueDark,
                        padding: "2px 8px",
                        borderRadius: R.pill,
                        background: `${C.blueDark}10`,
                        border: `1px solid ${C.blueDark}30`,
                      }}>
                        B26+B27
                      </span>
                    )}
                    {isSinClasificar && (
                      <span style={{
                        fontFamily: T.mono,
                        fontSize: T.sz["2xs"],
                        color: C.amber,
                        padding: "2px 8px",
                        borderRadius: R.pill,
                        background: `${C.amber}10`,
                        border: `1px solid ${C.amber}30`,
                      }}>
                        Clasificacion pendiente
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: S[3], alignItems: "center" }}>
                    <MiniStat label="Activas" value={lineDisp} color={C.green} />
                    <MiniStat label="Criticas" value={lineCrit} color={C.amber} />
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
                    {isAccessoryLine ? (
                      <AccessoryTableHeader />
                    ) : (
                      <TextileTableHeader />
                    )}

                    {/* Rows */}
                    {pageItems.map((item, idx) =>
                      isAccessoryLine ? (
                        <AccessoryRow key={item.reference} item={item} even={idx % 2 === 0} onClick={openDrawer} />
                      ) : (
                        <InventoryRow key={item.reference} item={item} even={idx % 2 === 0} onClick={openDrawer} />
                      )
                    )}

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
                        <PagButton
                          label="Anterior"
                          disabled={page <= 1}
                          onClick={() => setPage(cl, page - 1)}
                        />
                        <span style={{
                          fontFamily: T.mono,
                          fontSize: T.sz["2xs"],
                          color: C.inkMid,
                        }}>
                          {page} / {totalPages}
                        </span>
                        <PagButton
                          label="Siguiente"
                          disabled={page >= totalPages}
                          onClick={() => setPage(cl, page + 1)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
      )}

      {/* ── Agotados / Historico Section (AGOTADOS-HISTORICO-02) ────────── */}
      {agotadosFiltered.length > 0 && (
        <AgotadosSection
          items={agotadosFiltered}
          byLine={agotadosByLine}
          expanded={expandedLines.has("AGOTADOS")}
          onToggle={() => toggleLine("AGOTADOS")}
          getPage={getPage}
          setPage={setPage}
          onRowClick={openDrawer}
        />
      )}

      {/* ── Subgrupo Coverage Detail (INVENTARIO-KPI-REALIGNMENT-01) ────── */}
      {filter === "subgrupos" && subgrupoCoverage && subgrupoCoverage.length > 0 && (
        <SubgrupoCoveragePanel coverage={subgrupoCoverage} />
      )}

      {/* ── Accessory Low Stock Detail (INVENTARIO-KPI-REALIGNMENT-01) ─── */}
      {filter === "accesorios_bajo" && accesoriosBajaCantidad && accesoriosBajaCantidad.length > 0 && (
        <AccesorioBajaCantidadPanel items={accesoriosBajaCantidad} />
      )}

      {/* ── Commercial Product Drawer (COMMERCIAL-PRODUCT-DRAWER-01) ── */}
      <CommercialProductDrawer
        open={drawerItem !== null}
        onClose={closeDrawer}
        product={drawerProduct}
      />
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

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        flexShrink: 0,
      }} />
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkMid,
      }}>
        {label} {value}
      </span>
    </span>
  );
}

// ── Sync Status Block ────────────────────────────────────────────────────────

function SyncStatusBlock({ dataQuality }: { dataQuality: InventoryControlSnapshot["dataQuality"] }) {
  const bg =
    dataQuality.freshnessLabel === "SIN_DATOS" ? `${C.red}08` :
    dataQuality.freshnessLabel === "DESACTUALIZADO" ? "#fffbeb" :
    `${C.green}08`;

  const borderColor =
    dataQuality.freshnessLabel === "SIN_DATOS" ? `${C.red}33` :
    dataQuality.freshnessLabel === "DESACTUALIZADO" ? `${C.amber}33` :
    `${C.green}33`;

  const labelColor =
    dataQuality.freshnessLabel === "SIN_DATOS" ? C.red :
    dataQuality.freshnessLabel === "DESACTUALIZADO" ? C.amber :
    C.green;

  return (
    <div style={{
      padding: `${S[3]}px ${S[4]}px`,
      marginBottom: S[5],
      background: bg,
      border: `1px solid ${borderColor}`,
      borderRadius: R.sm,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
        <span style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: labelColor,
          display: "inline-block",
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          fontWeight: T.wt.semibold,
          color: labelColor,
        }}>
          {dataQuality.freshnessLabel}
        </span>
        {dataQuality.snapshotAt && (
          <span
            suppressHydrationWarning
            style={{
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              color: C.inkMid,
            }}
          >
            {formatDateTimeEsCoStable(dataQuality.snapshotAt)}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
        {dataQuality.sources.map((s, i) => (
          <span key={i} style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            color: C.inkGhost,
            padding: "2px 6px",
            borderRadius: R.sm,
            background: `${C.ink}06`,
          }}>
            {s}
          </span>
        ))}
        <span style={{
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          color: C.inkLight,
        }}>
          {dataQuality.confidence}% confianza
        </span>
      </div>
    </div>
  );
}

// ── Table Headers ────────────────────────────────────────────────────────────

function TextileTableHeader() {
  const headers = ["", "Referencia", "Descripcion", "Subgrupo SAG", "Disponible", "Estado"];
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

function InventoryRow({ item, even, onClick }: { item: InventoryItem; even: boolean; onClick: (item: InventoryItem) => void }) {
  const stateColor = STATE_COLORS[item.operationalState];
  const stateLabel = STATE_LABELS[item.operationalState];

  return (
    <div
      className="ag-op-row"
      onClick={() => onClick(item)}
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
      {/* Thumbnail */}
      <ProductThumbnail reference={item.reference} size={28} />

      {/* Reference */}
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

      {/* Description */}
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

      {/* Subgrupo SAG */}
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

      {/* Disponible Real */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        fontWeight: T.wt.semibold,
        color: item.disponibleReal <= 0 ? C.red : item.disponibleReal <= (item.threshold ?? 0) ? C.amber : C.ink,
        textAlign: "center" as const,
      }}>
        {item.disponibleReal > 0 ? item.disponibleReal.toLocaleString("es-CO") : "\u2014"}
      </span>

      {/* Operational State */}
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

function AccessoryRow({ item, even, onClick }: { item: InventoryItem; even: boolean; onClick: (item: InventoryItem) => void }) {
  const stateColor = STATE_COLORS[item.operationalState];
  const stateLabel = STATE_LABELS[item.operationalState];

  return (
    <div
      className="ag-op-row"
      onClick={() => onClick(item)}
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
      {/* Thumbnail */}
      <ProductThumbnail reference={item.reference} size={28} />

      {/* Reference */}
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

      {/* Description */}
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

      {/* Subgrupo */}
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

      {/* Tamano (handlingUnit) */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkMid,
        textAlign: "center" as const,
      }}>
        {item.handlingUnit ?? "\u2014"}
      </span>

      {/* Disponible (B26+B27) */}
      <span style={{
        fontFamily: T.mono,
        fontSize: T.sz.xs,
        fontWeight: T.wt.semibold,
        color: item.disponibleReal <= 0 ? C.red : item.disponibleReal <= (item.threshold ?? 0) ? C.amber : C.ink,
        textAlign: "center" as const,
      }}>
        {item.disponibleReal > 0 ? item.disponibleReal.toLocaleString("es-CO") : "\u2014"}
      </span>

      {/* State */}
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

// ── Empty State ──────────────────────────────────────────────────────────────

// ── Subgrupo Coverage Panel (INVENTARIO-KPI-REALIGNMENT-01) ─────────────────

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

      {/* Header */}
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

      {/* Rows */}
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

// ── Accessory Low Stock Panel (INVENTARIO-KPI-REALIGNMENT-01) ───────────────

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

      {/* Header */}
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

      {/* Rows */}
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

// ── Agotados Section (COMERCIAL-INVENTARIO-AGOTADOS-HISTORICO-02) ────────────

const AGOTADOS_GRID = "36px 120px 1fr 100px 100px 80px";

function AgotadosSection({
  items,
  byLine,
  expanded,
  onToggle,
  getPage,
  setPage,
  onRowClick,
}: {
  items: InventoryItem[];
  byLine: Map<CanonicalLine, InventoryItem[]>;
  expanded: boolean;
  onToggle: () => void;
  getPage: (line: string) => number;
  setPage: (line: string, page: number) => void;
  onRowClick: (item: InventoryItem) => void;
}) {
  const page = getPage("AGOTADOS");
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = expanded
    ? items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : [];

  return (
    <div style={{ marginBottom: S[4], marginTop: S[6] }}>
      {/* Section Header */}
      <button
        onClick={onToggle}
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
            Agotados
          </span>
          <span style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            color: C.inkLight,
          }}>
            {items.length} historicas
          </span>
          <span style={{
            fontFamily: T.mono,
            fontSize: T.sz["2xs"],
            color: C.inkGhost,
            padding: "2px 8px",
            borderRadius: R.pill,
            background: `${C.ink}06`,
            border: `1px solid ${C.line}`,
          }}>
            Solo lectura
          </span>
        </div>

        {/* Sub-line breakdown */}
        <div style={{ display: "flex", gap: S[3], alignItems: "center" }}>
          {CANONICAL_LINE_ORDER.map(cl => {
            const count = byLine.get(cl)?.length ?? 0;
            if (count === 0) return null;
            return (
              <span key={cl} style={{
                fontFamily: T.mono,
                fontSize: T.sz["2xs"],
                color: C.inkGhost,
              }}>
                {CANONICAL_LINE_LABELS[cl].split(" /")[0]} {count}
              </span>
            );
          })}
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
            gridTemplateColumns: AGOTADOS_GRID,
            gap: S[2],
            padding: `${S[2]}px ${S[4]}px`,
            background: C.surfaceAlt ?? C.surface,
            borderBottom: `1px solid ${C.line}`,
          }}>
            {["", "Referencia", "Descripcion", "Linea original", "Subgrupo", "Disponible"].map((h, i) => (
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
          {pageItems.map((item, idx) => (
            <AgotadoRow key={item.reference} item={item} even={idx % 2 === 0} onClick={onRowClick} />
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
              <PagButton
                label="Anterior"
                disabled={page <= 1}
                onClick={() => setPage("AGOTADOS", page - 1)}
              />
              <span style={{
                fontFamily: T.mono,
                fontSize: T.sz["2xs"],
                color: C.inkMid,
              }}>
                {page} / {totalPages}
              </span>
              <PagButton
                label="Siguiente"
                disabled={page >= totalPages}
                onClick={() => setPage("AGOTADOS", page + 1)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AgotadoRow({ item, even, onClick }: { item: InventoryItem; even: boolean; onClick: (item: InventoryItem) => void }) {
  return (
    <div
      className="ag-op-row"
      onClick={() => onClick(item)}
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
      {/* Thumbnail */}
      <ProductThumbnail reference={item.reference} size={28} />

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
        {item.reference}
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
        {item.description}
      </span>

      {/* Original canonical line */}
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

      {/* Subgrupo */}
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

      {/* Disponible (always 0 or negative — show em dash) */}
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
