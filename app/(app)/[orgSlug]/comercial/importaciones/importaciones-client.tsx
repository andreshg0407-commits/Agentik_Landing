/**
 * importaciones-client.tsx
 *
 * Informes gerenciales de importaciones — 4 pestanas.
 * Tabs: Mayor rotacion, Menor rotacion, Mas de 8 meses, Inteligencia.
 *
 * KPIs (5):
 *   1. Referencias importadas (totalRefs)
 *   2. Con ventas en la ventana elegida
 *   3. Sin ventas verificadas en la ventana
 *   4. Mas de 8 meses certificados (lastInbound > 8M, CERTIFIED only)
 *   5. Existencia fisica B24 (remaining > 0)
 *
 * IDENTIDAD DEL UNIVERSO IMPORTADO:
 *   ProductEntity.productLine = "5" (SAG LINEA 5, catalogo SAG certificado).
 *   El inventario y ventas se vinculan por referencia (externalId -> referenceCode).
 *   No se certifica el origen de cada unidad vendida — solo que la referencia
 *   pertenece al catalogo importado.
 *
 * FUENTE DE RECIBOS:
 *   item.receipts[] proviene de SAG MOVIMIENTOS fuente C1/C2 (facturas de compra).
 *   NO son recepciones fisicas desde China — son compras generales.
 *   No se grafican como crecimiento de importaciones.
 *
 * EVIDENCIA PARA MAS DE 8 MESES:
 *   Nivel 1: CERTIFIED_B24_REENTRY_DATE — lastInboundSource=SAG_RECEIPT_C1_C2
 *   Nivel 2: PURCHASE_DOCUMENT_DATE_PROXY — lastInboundSource=LAST_PURCHASE_SAG
 *   Nivel 3: PRODUCT_CREATION_DATE_PROXY — createdAtSag date
 *   Items proxy se muestran separados.
 *
 * DEUDA OFICIAL:
 *   SAG-003: Transito y ordenes de importacion abiertas.
 *   SAG-004: Ingreso fisico certificado desde China.
 *   SAG-016: Ausencia de FUENTE/origen suficiente en ventas.
 *
 * Rules:
 *   - ZERO business calculations in this file
 *   - All classifications come from import-intelligence-service.ts
 *   - Only filter/sort/useMemo for presentation
 *
 * FAIL-CLOSED (IMPORT-CACHE-PROD-01):
 *   When cache has no snapshot, kpis.totalRefs = -1 (sentinel).
 *   Show SOURCE_DOWN/PENDING_REFRESH, never EMPTY_CERTIFIED — never EMPTY_CERTIFIED.
 *
 * ROTATION (SAG-004):
 *   Requiere ingreso fisico certificado desde China (SAG-004).
 *   Mientras no exista fuente certificada: NO VERIFICABLE.
 *   No se computan umbrales con datos no certificados.
 *   Usa meses calendario (America/Bogota), no conteos fijos de dias.
 *
 * RULINGS EMITIDOS:
 *   IMPORTS_SALES_AND_STOCK_PARTIAL_RUNTIME_VERIFIED
 *   IMPORT_RECEIPT_SOURCE_BLOCKED
 *   IMPORT_ROTATION_CLASSIFICATION_BLOCKED
 *
 * Sprint: IMPORTS-CANONICAL-REPORTS-RUNTIME-05A2
 */

"use client";

import React, { useState, useMemo, useCallback } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import type {
  ImportSupplyIntelligenceItem,
  ImportSupplyKpis,
  RecompraClassification,
  ImportReceiptSummary,
  ImportMonthlySalesEntry,
  ImportSizeClass,
} from "@/lib/comercial/importaciones/import-types";
import type { CachedImportTruthState, ImportSourceFreshness } from "@/lib/comercial/importaciones/import-intelligence-cache";
import type { ImportSalesCoverage } from "@/lib/comercial/importaciones/import-types";
import { CommercialReferenceThumbnail } from "@/components/comercial/commercial-reference-thumbnail";

// ── Props ───────────────────────────────────────────────────────────────────

interface ImportacionesClientProps {
  orgSlug: string;
  items: ImportSupplyIntelligenceItem[];
  kpis: ImportSupplyKpis;
  truthState: CachedImportTruthState;
  freshness: ImportSourceFreshness;
  computedAt: string;
  salesCoverage?: ImportSalesCoverage;
  monthlySales?: ImportMonthlySalesEntry[];
}

// ── Tab type ────────────────────────────────────────────────────────────────

type ViewTab = "mayor_rotacion" | "menor_rotacion" | "mas_8_meses" | "inteligencia";

const VIEW_TABS: { key: ViewTab; label: string }[] = [
  { key: "mayor_rotacion", label: "Mayor rotacion" },
  { key: "menor_rotacion", label: "Menor rotacion" },
  { key: "mas_8_meses", label: "Mas de 8 meses" },
  { key: "inteligencia", label: "Inteligencia" },
];

// ── Window months ──────────────────────────────────────────────────────────

type WindowMonths = 6 | 8 | 12;

const WINDOW_OPTIONS: { value: WindowMonths; label: string }[] = [
  { value: 6, label: "6M" },
  { value: 8, label: "8M" },
  { value: 12, label: "12M" },
];

// ── Constants ───────────────────────────────────────────────────────────────

const ROW_PAD = `${S[2]}px ${S[3]}px`;

const RECOMPRA_LABELS: Record<RecompraClassification, string> = {
  INMEDIATA: "Alta rotacion",
  VIGILAR: "Revisar recompra",
  NO_RECOMPRAR: "Menor rotacion",
  SIN_DATOS: "Sin ventas 6M",
};

const CLASSIFICATION_DISPLAY: Record<RecompraClassification, { bg: string; fg: string; label: string }> = {
  INMEDIATA:    { bg: C.greenLight,  fg: C.green,    label: "Alta rotacion" },
  VIGILAR:      { bg: C.amberLight,  fg: C.amber,    label: "Revisar" },
  NO_RECOMPRAR: { bg: C.surface,     fg: C.inkMid,   label: "Menor rotacion" },
  SIN_DATOS:    { bg: C.surface,     fg: C.inkFaint, label: "Sin ventas" },
};

type SortKey = "units" | "velocity" | "value";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "units", label: "Unidades netas vendidas" },
  { key: "velocity", label: "Velocidad mensual" },
  { key: "value", label: "Valor neto vendido 6M" },
];

// ── COP formatter ─────────────────────────────────────────────────────────

function fmtCOP(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)} M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value).toLocaleString("es-CO")}`;
  return `$${value.toLocaleString("es-CO")}`;
}

function fmtCOPFull(value: number): string {
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

// ── Sortable header types ─────────────────────────────────────────────────

type SortDir = "asc" | "desc";

interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

function useSortable<K extends string>(defaultKey: K, defaultDir: SortDir = "desc") {
  const [state, setState] = useState<SortState<K>>({ key: defaultKey, dir: defaultDir });
  const toggle = useCallback((key: K) => {
    setState(prev => prev.key === key
      ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
      : { key, dir: "desc" }
    );
  }, []);
  return { sortKey: state.key, sortDir: state.dir, toggle };
}

function SortableHeader<K extends string>({
  label, colKey, current, dir, onSort, align,
}: {
  label: string; colKey: K; current: K; dir: SortDir; onSort: (k: K) => void; align?: "right";
}) {
  const isActive = current === colKey;
  return (
    <button
      onClick={() => onSort(colKey)}
      aria-sort={isActive ? (dir === "desc" ? "descending" : "ascending") : "none"}
      style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        color: isActive ? C.blueDark : C.inkMid,
        background: "none", border: "none", cursor: "pointer", padding: 0,
        textAlign: align ?? "left", display: "flex", alignItems: "center",
        gap: 2, justifyContent: align === "right" ? "flex-end" : "flex-start",
        width: "100%",
      }}
    >
      {label}
      <span style={{ fontSize: 9, opacity: isActive ? 1 : 0.3 }}>
        {isActive ? (dir === "desc" ? "\u2193" : "\u2191") : "\u2195"}
      </span>
    </button>
  );
}

function stableSort<T>(arr: T[], cmp: (a: T, b: T) => number, refKey: (item: T) => string): T[] {
  return [...arr].sort((a, b) => cmp(a, b) || refKey(a).localeCompare(refKey(b)));
}

const SIZE_TAB_LABELS: Record<string, string> = {
  PEQUENO: "Pequeno",
  MEDIANO: "Mediano",
  GRANDE: "Grande",
  SIN_CLASIFICAR: "Sin clasificar",
};

// ── Evidence levels for Mas de 8 meses ────────────────────────────────────

type EvidenceLevel = "CERTIFIED_B24_REENTRY_DATE" | "PURCHASE_DOCUMENT_DATE_PROXY" | "PRODUCT_CREATION_DATE_PROXY";

const EVIDENCE_LABELS: Record<EvidenceLevel, { label: string; badge: string; color: string }> = {
  CERTIFIED_B24_REENTRY_DATE:   { label: "Fecha de reingreso certificada (C1/C2)", badge: "CERTIFICADO", color: C.green },
  PURCHASE_DOCUMENT_DATE_PROXY: { label: "Fecha de ultima compra SAG (proxy)",     badge: "PROXY",       color: C.amber },
  PRODUCT_CREATION_DATE_PROXY:  { label: "Fecha de creacion del producto (proxy)", badge: "PROXY",       color: C.amber },
};

// ── Fail-closed detection ────────────────────────────────────────────────────

function isSourceDown(kpis: ImportSupplyKpis): boolean {
  return kpis.totalRefs < 0;
}

// ── Calendar months helper (client-side, America/Bogota) ────────────────────

function calendarMonthsAgo(dateStr: string, windowMonths: number): boolean {
  const d = new Date(dateStr);
  const bogotaStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const [y, m, day] = bogotaStr.split("-").map(Number);
  const today = new Date(y, m - 1, day);
  const cutoff = new Date(today.getFullYear(), today.getMonth() - windowMonths, today.getDate());
  return d >= cutoff;
}

function calendarMonthsSince(dateStr: string): number {
  const d = new Date(dateStr);
  const bogotaStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const [y, m, day] = bogotaStr.split("-").map(Number);
  const today = new Date(y, m - 1, day);
  const yearDiff = today.getFullYear() - d.getFullYear();
  const monthDiff = today.getMonth() - d.getMonth();
  let total = yearDiff * 12 + monthDiff;
  if (today.getDate() < d.getDate()) total--;
  return Math.max(0, total);
}

// ── Resolve evidence level for an item ──────────────────────────────────────

/**
 * Resolve evidence level for an item.
 *
 * IMPORTANT: CERTIFIED_B24_REENTRY_DATE requires a runtime query to B24
 * movements (not yet implemented — SAG-004 blocked). C1/C2 receipts are
 * purchase invoices, NOT physical B24 entries. They are classified as
 * PURCHASE_DOCUMENT_DATE_PROXY until a B24 movement query exists.
 *
 * Current evidence hierarchy (all are PROXY until SAG-004 resolved):
 *   Level 1: C1/C2 receipt date — PURCHASE_DOCUMENT_DATE_PROXY (best available)
 *   Level 2: d_ultima_compra SAG — PURCHASE_DOCUMENT_DATE_PROXY
 *   Level 3: Product creation date — PRODUCT_CREATION_DATE_PROXY
 */
function resolveEvidence(item: ImportSupplyIntelligenceItem): {
  level: EvidenceLevel;
  date: string;
  months: number;
  source: string;
} | null {
  // C1/C2 = purchase invoices, NOT certified B24 physical entries
  // Classified as PURCHASE_DOCUMENT_DATE_PROXY per Gate E ruling
  if (item.lastInboundSource === "SAG_RECEIPT_C1_C2" && item.lastInboundDate) {
    return {
      level: "PURCHASE_DOCUMENT_DATE_PROXY",
      date: item.lastInboundDate,
      months: calendarMonthsSince(item.lastInboundDate),
      source: "MOVIMIENTOS C1/C2 (factura de compra)",
    };
  }
  if (item.lastInboundSource === "LAST_PURCHASE_SAG" && item.lastInboundDate) {
    return {
      level: "PURCHASE_DOCUMENT_DATE_PROXY",
      date: item.lastInboundDate,
      months: calendarMonthsSince(item.lastInboundDate),
      source: "d_ultima_compra SAG",
    };
  }
  if (item.createdAtSag) {
    return {
      level: "PRODUCT_CREATION_DATE_PROXY",
      date: item.createdAtSag,
      months: calendarMonthsSince(item.createdAtSag),
      source: "Fecha creacion producto SAG",
    };
  }
  return null;
}

// ── KPI derivation ──────────────────────────────────────────────────────────

interface DerivedKpis {
  totalRefs: number;
  conVentasEnVentana: number;
  sinVentasVerificadas: number;
  /** Certified = B24 movement query (currently 0, SAG-004 blocked) */
  masde8MesesCertificados: number;
  /** Provisional = proxy dates (C1/C2 or d_ultima_compra) > 8 months */
  masde8MesesProvisionales: number;
  existenciaFisicaB24: number;
}

function salesInWindow(item: ImportSupplyIntelligenceItem, windowMonths: WindowMonths): number {
  switch (windowMonths) {
    case 6: return item.salesTotal6m;
    case 8: return item.sales8mNet;
    case 12: return item.sales12mNet;
  }
}

function revenueInWindow(item: ImportSupplyIntelligenceItem, windowMonths: WindowMonths): number {
  switch (windowMonths) {
    case 6: return item.revenue6m;
    case 8: return item.revenue8m;
    case 12: return item.revenue12m;
  }
}

function derivarKpis(items: ImportSupplyIntelligenceItem[], windowMonths: WindowMonths): DerivedKpis {
  let conVentasEnVentana = 0;
  let sinVentasVerificadas = 0;
  // Certified = 0 because no B24 movement query exists (SAG-004 blocked)
  const masde8MesesCertificados = 0;
  let masde8MesesProvisionales = 0;
  let existenciaFisicaB24 = 0;

  for (const item of items) {
    const windowSales = salesInWindow(item, windowMonths);
    const hasSalesInWindow = item.salesDataQuality === "SYNCED" && windowSales > 0;

    if (hasSalesInWindow) {
      conVentasEnVentana++;
    } else if (item.salesDataQuality === "SYNCED" && windowSales <= 0) {
      sinVentasVerificadas++;
    }

    // Provisional: any inbound date source > 8 months + SAG B24 existencia > 0
    const sagExist = item.sagB24Existencia;
    const ev = resolveEvidence(item);
    if (ev && ev.months >= 8 && sagExist !== null && sagExist > 0) masde8MesesProvisionales++;

    // SAG B24 authority for existencia count
    if (sagExist !== null && sagExist > 0) existenciaFisicaB24++;
  }

  return {
    totalRefs: items.length,
    conVentasEnVentana,
    sinVentasVerificadas,
    masde8MesesCertificados,
    masde8MesesProvisionales,
    existenciaFisicaB24,
  };
}

// ── Main Component ──────────────────────────────────────────────────────────

export function ImportacionesClient({
  orgSlug,
  items,
  kpis,
  truthState,
  freshness,
  computedAt,
  salesCoverage,
  monthlySales,
}: ImportacionesClientProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>("mayor_rotacion");
  const [drawerItem, setDrawerItem] = useState<ImportSupplyIntelligenceItem | null>(null);
  const [windowMonths, setWindowMonths] = useState<WindowMonths>(6);
  // sortKey state removed — each table manages its own sort (05A4)

  const openDrawer = useCallback((item: ImportSupplyIntelligenceItem) => setDrawerItem(item), []);
  const closeDrawer = useCallback(() => setDrawerItem(null), []);

  const sourceDown = isSourceDown(kpis);

  const derived = useMemo(() => derivarKpis(items, windowMonths), [items, windowMonths]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[5], padding: `${S[5]}px ${S[6]}px`, paddingBottom: S[12] }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Comercial", href: `/${orgSlug}/comercial/maletas` },
          { label: "Importaciones" },
        ]}
        title="Importaciones"
        subtitle={sourceDown
          ? "Fuente de datos no disponible"
          : `${kpis.totalRefs} referencias importadas (LINEA 5, catalogo SAG)`}
      />

      {/* ── SOURCE_DOWN banner ──────────────────────────────────────── */}
      {sourceDown && (
        <SourceDownBanner />
      )}

      {/* ── Truth state banner ──────────────────────────────────────── */}
      {!sourceDown && truthState === "STALE" && (
        <div style={{
          background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: R.lg,
          borderLeft: `4px solid ${C.amber}`,
          padding: `${S[2]}px ${S[4]}px`,
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amberDark }}>
            STALE — Datos del ultimo snapshot ({new Date(computedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}).
            Prewarm pendiente.
          </span>
        </div>
      )}

      {/* ── Window Selector ──────────────────────────────────────────── */}
      {!sourceDown && (
        <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>Ventana:</span>
          <div style={{ display: "flex", gap: S[1] }}>
            {WINDOW_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setWindowMonths(opt.value)}
                style={{
                  fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                  padding: `${S[1]}px ${S[3]}px`, borderRadius: R.md,
                  border: `1px solid ${windowMonths === opt.value ? C.blueDark : C.line}`,
                  background: windowMonths === opt.value ? C.blueLight : C.white,
                  color: windowMonths === opt.value ? C.blueDark : C.inkMid,
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Each window (6M/8M/12M) uses its own server-side aggregation */}
        </div>
      )}

      {/* ── KPIs (5) ───────────────────────────────────────────────────── */}
      {!sourceDown && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: S[3] }}>
          <KpiCard
            label="Referencias importadas"
            value={derived.totalRefs}
            active={false}
          />
          <KpiCard
            label={`Con ventas en ${windowMonths}M`}
            value={derived.conVentasEnVentana}
            color={derived.conVentasEnVentana > 0 ? C.blueDark : undefined}
            active={activeTab === "mayor_rotacion"}
            onClick={() => setActiveTab("mayor_rotacion")}
          />
          <KpiCard
            label="Sin ventas verificadas"
            value={derived.sinVentasVerificadas}
            color={derived.sinVentasVerificadas > 0 ? C.amber : undefined}
            active={activeTab === "menor_rotacion"}
            onClick={() => setActiveTab("menor_rotacion")}
          />
          <KpiCard
            label="Antiguedad estimada 8M+"
            value={derived.masde8MesesProvisionales}
            color={derived.masde8MesesProvisionales > 0 ? C.amber : undefined}
            active={activeTab === "mas_8_meses"}
            onClick={() => setActiveTab("mas_8_meses")}
          />
          <KpiCard
            label="Existencia fisica B24"
            value={derived.existenciaFisicaB24}
            active={false}
          />
        </div>
      )}

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      {!sourceDown && (
        <div style={{ display: "flex", gap: 0, borderBottom: `2px solid ${C.line}` }}>
          {VIEW_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.medium,
                padding: `${S[2]}px ${S[4]}px`,
                borderBottom: activeTab === tab.key ? `2px solid ${C.blueDark}` : "2px solid transparent",
                color: activeTab === tab.key ? C.blueDark : C.inkMid,
                background: "transparent", border: "none", cursor: "pointer",
                marginBottom: -2,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Tab content ──────────────────────────────────────────────── */}
      {!sourceDown && activeTab === "mayor_rotacion" && (
        <MayorRotacionView
          items={items}
          windowMonths={windowMonths}
          onRowClick={openDrawer}
        />
      )}
      {!sourceDown && activeTab === "menor_rotacion" && (
        <MenorRotacionView
          items={items}
          windowMonths={windowMonths}
          onRowClick={openDrawer}
        />
      )}
      {!sourceDown && activeTab === "mas_8_meses" && (
        <Masde8MesesView items={items} onRowClick={openDrawer} />
      )}
      {!sourceDown && activeTab === "inteligencia" && (
        <InteligenciaView
          items={items}
          truthState={truthState}
          freshness={freshness}
          computedAt={computedAt}
          salesCoverage={salesCoverage}
          monthlySales={monthlySales ?? []}
        />
      )}

      {/* ── Detail drawer ──────────────────────────────────────────────── */}
      {drawerItem && (
        <ImportDetailDrawer item={drawerItem} onClose={closeDrawer} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 1: Mayor rotacion
// ═══════════════════════════════════════════════════════════════════════════════

type MayorSortCol = "units" | "velocity" | "value" | "stock" | "ref";

function MayorRotacionView({
  items,
  windowMonths,
  onRowClick,
}: {
  items: ImportSupplyIntelligenceItem[];
  windowMonths: WindowMonths;
  onRowClick: (item: ImportSupplyIntelligenceItem) => void;
}) {
  const { sortKey, sortDir, toggle } = useSortable<MayorSortCol>("units");

  const filtered = useMemo(() => {
    return items.filter(item => item.salesDataQuality === "SYNCED" && salesInWindow(item, windowMonths) > 0);
  }, [items, windowMonths]);

  const sorted = useMemo(() => {
    const cmp = (a: ImportSupplyIntelligenceItem, b: ImportSupplyIntelligenceItem) => {
      let va: number, vb: number;
      switch (sortKey) {
        case "units": va = salesInWindow(a, windowMonths); vb = salesInWindow(b, windowMonths); break;
        case "velocity": va = salesInWindow(a, windowMonths) / windowMonths; vb = salesInWindow(b, windowMonths) / windowMonths; break;
        case "value": va = revenueInWindow(a, windowMonths); vb = revenueInWindow(b, windowMonths); break;
        case "stock": va = a.remaining; vb = b.remaining; break;
        case "ref": return sortDir === "desc" ? b.reference.localeCompare(a.reference) : a.reference.localeCompare(b.reference);
        default: va = 0; vb = 0;
      }
      return sortDir === "desc" ? vb - va : va - vb;
    };
    return stableSort(filtered, cmp, i => i.reference);
  }, [filtered, sortKey, sortDir, windowMonths]);

  const COLS = "48px 1fr 100px 80px 100px 90px 110px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
        Velocidad mensual = unidades netas / meses observados. Devoluciones y NC restadas. Anulados excluidos.
      </div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", background: C.white, boxShadow: E.sm }}>
        <div style={{ display: "grid", gridTemplateColumns: COLS, padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`, gap: S[1] }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid }}>#</span>
          <SortableHeader label="Referencia" colKey="ref" current={sortKey} dir={sortDir} onSort={toggle} />
          <SortableHeader label={`Und ${windowMonths}M`} colKey="units" current={sortKey} dir={sortDir} onSort={toggle} align="right" />
          <SortableHeader label="Vel/mes" colKey="velocity" current={sortKey} dir={sortDir} onSort={toggle} align="right" />
          <SortableHeader label={`Valor ${windowMonths}M`} colKey="value" current={sortKey} dir={sortDir} onSort={toggle} align="right" />
          <SortableHeader label="Stock B24" colKey="stock" current={sortKey} dir={sortDir} onSort={toggle} align="right" />
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid }}>Clasificacion</span>
        </div>
        {sorted.length === 0 && (
          <div style={{ padding: S[5], textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
            Sin referencias con ventas en la ventana seleccionada.
          </div>
        )}
        {sorted.map((item, idx) => {
          const windowSales = salesInWindow(item, windowMonths);
          const velocity = windowSales / windowMonths;
          const value = revenueInWindow(item, windowMonths);
          const cls = CLASSIFICATION_DISPLAY[item.recompraClassification];
          return (
            <div key={item.productId} onClick={() => onRowClick(item)} style={{
              display: "grid", gridTemplateColumns: COLS, padding: ROW_PAD, borderBottom: `1px solid ${C.lineSubtle}`,
              fontFamily: T.mono, fontSize: T.sz.base, cursor: "pointer", alignItems: "center", gap: S[1],
            }}>
              <span style={{ color: C.inkFaint, fontSize: T.sz.xs }}>{idx + 1}</span>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], minWidth: 0 }}>
                <CommercialReferenceThumbnail imageUrl={item.imageUrl} referenceCode={item.reference} size={28} />
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontWeight: T.wt.medium, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.reference}</div>
                  <div style={{ fontSize: T.sz.xs, color: C.inkLight, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.description}</div>
                </div>
              </div>
              <span style={{ textAlign: "right", fontWeight: T.wt.semibold }}>{windowSales.toLocaleString("es-CO")}</span>
              <span style={{ textAlign: "right", color: C.inkMid }}>{velocity > 0 ? velocity.toFixed(1) : "\u2014"}</span>
              <span style={{ textAlign: "right", color: C.inkMid }}>{fmtCOPFull(value)}</span>
              <span style={{ textAlign: "right", color: item.remaining > 0 ? C.ink : C.red }}>
                {item.stockDataQuality === "CONFIRMED" ? item.remaining.toLocaleString("es-CO") : "\u2014"}
              </span>
              <span style={{ fontSize: T.sz.xs, padding: `1px ${S[1]}px`, borderRadius: R.sm, background: cls.bg, color: cls.fg, textAlign: "center" }}>{cls.label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
        {sorted.length} referencias con ventas certificadas en ventana {windowMonths}M. Universo: productLine = &quot;5&quot; (LINEA 5).
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 2: Menor rotacion
// ═══════════════════════════════════════════════════════════════════════════════

type MenorSortCol = "units" | "stock" | "cobertura" | "capital" | "ingreso" | "ref";

function MenorRotacionView({
  items,
  windowMonths,
  onRowClick,
}: {
  items: ImportSupplyIntelligenceItem[];
  windowMonths: WindowMonths;
  onRowClick: (item: ImportSupplyIntelligenceItem) => void;
}) {
  const { sortKey, sortDir, toggle } = useSortable<MenorSortCol>("units", "asc");

  const filtered = useMemo(() => {
    return items.filter(item => item.sagB24Existencia !== null && item.sagB24Existencia > 0);
  }, [items]);

  const sorted = useMemo(() => {
    const cmp = (a: ImportSupplyIntelligenceItem, b: ImportSupplyIntelligenceItem) => {
      let va: number, vb: number;
      switch (sortKey) {
        case "units": va = salesInWindow(a, windowMonths); vb = salesInWindow(b, windowMonths); break;
        case "stock": va = a.remaining; vb = b.remaining; break;
        case "cobertura": va = a.coberturaPromedioDias ?? 999999; vb = b.coberturaPromedioDias ?? 999999; break;
        case "capital": va = a.capitalInmovilizado ?? -1; vb = b.capitalInmovilizado ?? -1; break;
        case "ingreso": return (sortDir === "desc" ? -1 : 1) * ((a.lastInboundDate ?? "").localeCompare(b.lastInboundDate ?? ""));
        case "ref": return (sortDir === "desc" ? -1 : 1) * a.reference.localeCompare(b.reference);
        default: va = 0; vb = 0;
      }
      return sortDir === "desc" ? vb - va : va - vb;
    };
    return stableSort(filtered, cmp, i => i.reference);
  }, [filtered, sortKey, sortDir, windowMonths]);

  const coverageInfo = useMemo(() => {
    const withSagData = items.filter(i => i.sagB24Existencia !== null).length;
    const withStock = filtered.length;
    return { total: items.length, confirmed: withSagData, withStock, coverage: items.length > 0 ? Math.round((withSagData / items.length) * 100) : 0 };
  }, [items, filtered]);

  const COLS = "48px 1fr 100px 100px 100px 100px 120px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, display: "flex", alignItems: "center", gap: S[2] }}>
        <span>SAG B24: {coverageInfo.confirmed}/{coverageInfo.total} refs con dato ({coverageInfo.coverage}%)</span>
        <span>{coverageInfo.withStock} con existencia &gt; 0</span>
      </div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", background: C.white, boxShadow: E.sm }}>
        <div style={{ display: "grid", gridTemplateColumns: COLS, padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`, gap: S[1] }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid }}>#</span>
          <SortableHeader label="Referencia" colKey="ref" current={sortKey} dir={sortDir} onSort={toggle} />
          <SortableHeader label={`Und ${windowMonths}M`} colKey="units" current={sortKey} dir={sortDir} onSort={toggle} align="right" />
          <SortableHeader label="Stock B24" colKey="stock" current={sortKey} dir={sortDir} onSort={toggle} align="right" />
          <SortableHeader label="Cobertura" colKey="cobertura" current={sortKey} dir={sortDir} onSort={toggle} align="right" />
          <SortableHeader label="Capital inmov." colKey="capital" current={sortKey} dir={sortDir} onSort={toggle} align="right" />
          <SortableHeader label="Ultimo ingreso" colKey="ingreso" current={sortKey} dir={sortDir} onSort={toggle} />
        </div>
        {sorted.length === 0 && (
          <div style={{ padding: S[5], textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>Sin referencias con existencia confirmada en B24.</div>
        )}
        {sorted.map((item, idx) => {
          const windowSales = salesInWindow(item, windowMonths);
          return (
            <div key={item.productId} onClick={() => onRowClick(item)} style={{
              display: "grid", gridTemplateColumns: COLS, padding: ROW_PAD, borderBottom: `1px solid ${C.lineSubtle}`,
              fontFamily: T.mono, fontSize: T.sz.base, cursor: "pointer", alignItems: "center", gap: S[1],
            }}>
              <span style={{ color: C.inkFaint, fontSize: T.sz.xs }}>{idx + 1}</span>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], minWidth: 0 }}>
                <CommercialReferenceThumbnail imageUrl={item.imageUrl} referenceCode={item.reference} size={28} />
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontWeight: T.wt.medium, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.reference}</div>
                  <div style={{ fontSize: T.sz.xs, color: C.inkLight, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.description}</div>
                </div>
              </div>
              <span style={{ textAlign: "right", color: windowSales === 0 ? C.red : C.ink }}>{windowSales.toLocaleString("es-CO")}</span>
              <span style={{ textAlign: "right" }}>{item.remaining.toLocaleString("es-CO")}</span>
              <span style={{ textAlign: "right", color: C.inkMid }}>{item.coberturaPromedioDias !== null ? `${item.coberturaPromedioDias}d` : "\u2014"}</span>
              <span style={{ textAlign: "right", color: C.inkMid }}>{item.capitalInmovilizado !== null ? fmtCOPFull(item.capitalInmovilizado) : "\u2014"}</span>
              <span style={{ fontSize: T.sz.xs, color: C.inkMid }}>{item.lastInboundDate ?? "\u2014"}</span>
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
        {sorted.length} referencias con existencia B24 confirmada (SAG vw_agentik_inventario), ordenadas de menor a mayor venta.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 3: Mas de 8 meses sin reingreso
// ═══════════════════════════════════════════════════════════════════════════════

type EightMSortCol = "meses" | "stock" | "fecha" | "ref";

function Masde8MesesView({
  items,
  onRowClick,
}: {
  items: ImportSupplyIntelligenceItem[];
  onRowClick: (item: ImportSupplyIntelligenceItem) => void;
}) {
  const { sortKey, sortDir, toggle } = useSortable<EightMSortCol>("meses");

  const proxy = useMemo(() => {
    const proxyList: Array<ImportSupplyIntelligenceItem & { evidence: NonNullable<ReturnType<typeof resolveEvidence>> }> = [];
    for (const item of items) {
      const sagExist = item.sagB24Existencia;
      if (sagExist === null || sagExist <= 0) continue;
      const ev = resolveEvidence(item);
      if (!ev || ev.months < 8) continue;
      proxyList.push({ ...item, evidence: ev });
    }
    return proxyList;
  }, [items]);

  const sorted = useMemo(() => {
    type Row = (typeof proxy)[number];
    const cmp = (a: Row, b: Row) => {
      let va: number, vb: number;
      switch (sortKey) {
        case "meses": va = a.evidence.months; vb = b.evidence.months; break;
        case "stock": va = a.remaining; vb = b.remaining; break;
        case "fecha": return (sortDir === "desc" ? -1 : 1) * (a.evidence.date).localeCompare(b.evidence.date);
        case "ref": return (sortDir === "desc" ? -1 : 1) * a.reference.localeCompare(b.reference);
        default: va = 0; vb = 0;
      }
      return sortDir === "desc" ? vb - va : va - vb;
    };
    return stableSort(proxy, cmp, i => i.reference);
  }, [proxy, sortKey, sortDir]);

  const COLS = "48px 1fr 80px 90px 80px 100px 120px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, background: C.surface, borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px` }}>
        Antiguedad estimada con fecha de ultima compra SAG o creacion del producto.
        Solo referencias con existencia B24 &gt; 0. Meses calendario (America/Bogota).
      </div>

      {sorted.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            Antiguedad estimada &gt; 8 meses ({sorted.length})
          </div>
          <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", background: C.white, boxShadow: E.sm }}>
            <div style={{ display: "grid", gridTemplateColumns: COLS, padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`, gap: S[1] }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid }}>#</span>
              <SortableHeader label="Referencia" colKey="ref" current={sortKey} dir={sortDir} onSort={toggle} />
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid }}>Tipo</span>
              <SortableHeader label="Fecha" colKey="fecha" current={sortKey} dir={sortDir} onSort={toggle} />
              <SortableHeader label="Meses" colKey="meses" current={sortKey} dir={sortDir} onSort={toggle} align="right" />
              <SortableHeader label="Stock B24" colKey="stock" current={sortKey} dir={sortDir} onSort={toggle} align="right" />
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid }}>Origen</span>
            </div>
            {sorted.map((item, idx) => {
              const ev = item.evidence;
              const badge = EVIDENCE_LABELS[ev.level];
              return (
                <div key={item.productId} onClick={() => onRowClick(item)} style={{
                  display: "grid", gridTemplateColumns: COLS, padding: ROW_PAD, borderBottom: `1px solid ${C.lineSubtle}`,
                  fontFamily: T.mono, fontSize: T.sz.base, cursor: "pointer", alignItems: "center", gap: S[1],
                }}>
                  <span style={{ color: C.inkFaint, fontSize: T.sz.xs }}>{idx + 1}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: S[2], minWidth: 0 }}>
                    <CommercialReferenceThumbnail imageUrl={item.imageUrl} referenceCode={item.reference} size={28} />
                    <div style={{ overflow: "hidden" }}>
                      <div style={{ fontWeight: T.wt.medium, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.reference}</div>
                      <div style={{ fontSize: T.sz.xs, color: C.inkLight, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.description}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: T.sz["2xs"], padding: `1px ${S[1]}px`, borderRadius: R.sm, background: C.amberLight, color: badge.color, textAlign: "center" }}>
                    {badge.badge}
                  </span>
                  <span style={{ fontSize: T.sz.xs, color: C.inkMid }}>{ev.date}</span>
                  <span style={{ textAlign: "right", fontWeight: T.wt.semibold, color: ev.months >= 12 ? C.red : C.ink }}>{ev.months}</span>
                  <span style={{ textAlign: "right", color: item.remaining > 0 ? C.ink : C.inkFaint }}>
                    {item.stockDataQuality === "CONFIRMED" ? item.remaining.toLocaleString("es-CO") : "\u2014"}
                  </span>
                  <span style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>{ev.source}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sorted.length === 0 && (
        <div style={{ padding: S[5], textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Sin referencias con mas de 8 meses desde ultimo ingreso documentado.
        </div>
      )}

      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
        Calculo con meses calendario (America/Bogota). EXISTENCIA B24 = SAG vw_agentik_inventario (BODEGA 24).
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 4: Inteligencia
// ═══════════════════════════════════════════════════════════════════════════════

type TopProdSortCol = "units" | "value" | "stock" | "lastSale" | "ref";

function InteligenciaView({
  items,
  truthState,
  freshness,
  computedAt,
  salesCoverage,
  monthlySales,
}: {
  items: ImportSupplyIntelligenceItem[];
  truthState: CachedImportTruthState;
  freshness: ImportSourceFreshness;
  computedAt: string;
  salesCoverage?: ImportSalesCoverage;
  monthlySales: ImportMonthlySalesEntry[];
}) {
  const [activeSizeTab, setActiveSizeTab] = useState<string>("ALL");

  // Executive KPIs
  const execKpis = useMemo(() => {
    const totalRevenue6m = items.reduce((s, i) => s + i.revenue6m, 0);
    const totalUnits6m = items.reduce((s, i) => s + i.salesTotal6m, 0);
    const refsWithSales = items.filter(i => i.salesDataQuality === "SYNCED" && i.salesTotal6m > 0).length;

    // Monthly average from monthlySales (complete months only)
    const completeMonths = monthlySales.filter(m => !m.partial);
    const avgMonthlyRevenue = completeMonths.length > 0
      ? completeMonths.reduce((s, m) => s + m.revenueNet, 0) / completeMonths.length
      : totalRevenue6m / 6;

    // Last closed month: most recent entry with partial=false
    const lastClosed = completeMonths.length > 0 ? completeMonths[completeMonths.length - 1] : null;

    return { totalRevenue6m, totalUnits6m, refsWithSales, avgMonthlyRevenue, lastClosed };
  }, [items, monthlySales]);

  // Products grouped by size class for Top Products
  const sizeGroups = useMemo(() => {
    const groups = new Map<string, ImportSupplyIntelligenceItem[]>();
    for (const item of items) {
      const key = item.sizeClass ?? "SIN_CLASIFICAR";
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    return groups;
  }, [items]);

  const sizeTabKeys = useMemo(() => {
    const keys = ["ALL", ...["PEQUENO", "MEDIANO", "GRANDE", "SIN_CLASIFICAR"].filter(k => sizeGroups.has(k))];
    return keys;
  }, [sizeGroups]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>

      {/* ── 1. Executive KPIs ────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[3] }}>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`, background: C.white, boxShadow: E.xs }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Ventas netas 6M</span>
          <div title={fmtCOPFull(execKpis.totalRevenue6m)} style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: C.blueDark }}>
            {fmtCOP(execKpis.totalRevenue6m)}
          </div>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>{execKpis.refsWithSales} referencias con ventas</span>
        </div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`, background: C.white, boxShadow: E.xs }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Unidades netas 6M</span>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: C.ink }}>
            {execKpis.totalUnits6m.toLocaleString("es-CO")}
          </div>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Facturado menos NC/devoluciones</span>
        </div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`, background: C.white, boxShadow: E.xs }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Promedio mensual</span>
          <div title={fmtCOPFull(execKpis.avgMonthlyRevenue)} style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: C.ink }}>
            {fmtCOP(execKpis.avgMonthlyRevenue)}
          </div>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Ventas netas / meses completos</span>
        </div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`, background: C.white, boxShadow: E.xs }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Ventas ultimo mes cerrado</span>
          {execKpis.lastClosed ? (
            <>
              <div title={fmtCOPFull(execKpis.lastClosed.revenueNet)} style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: C.blueDark }}>
                {fmtCOP(execKpis.lastClosed.revenueNet)}
              </div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
                Ventas netas {"\u00B7"} {new Date(execKpis.lastClosed.month + "-15").toLocaleString("es-CO", { month: "long", year: "numeric", timeZone: "America/Bogota" })}
              </span>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
                {execKpis.lastClosed.unitsNet.toLocaleString("es-CO")} unidades netas
              </div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: C.inkFaint }}>No disponible</div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>Sin meses cerrados en fuente</span>
            </>
          )}
        </div>
      </div>

      {/* ── 2. Monthly Sales Chart ───────────────────────────────────── */}
      {monthlySales.length > 0 && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", background: C.white, boxShadow: E.sm }}>
          <div style={{ padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`, background: C.surfaceAlt }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
              Ventas mensuales de productos importados
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
              Referencias del catalogo SAG LINEA 5 · Ventas netas
            </div>
          </div>
          <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
            <div style={{ display: "flex", gap: S[2], alignItems: "flex-end", height: 100 }}>
              {monthlySales.map((m, idx) => {
                const max = Math.max(...monthlySales.map(x => x.revenueNet));
                const h = max > 0 ? Math.max(4, (m.revenueNet / max) * 88) : 4;
                const prevMonth = idx > 0 ? monthlySales[idx - 1] : null;
                const change = prevMonth && prevMonth.revenueNet > 0 && !m.partial && !prevMonth.partial
                  ? Math.round(((m.revenueNet - prevMonth.revenueNet) / prevMonth.revenueNet) * 100)
                  : null;
                return (
                  <div key={m.month} title={`${fmtCOPFull(m.revenueNet)} · ${m.unitsNet.toLocaleString("es-CO")} und · ${m.documents} docs`}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginBottom: 2 }}>
                      {fmtCOP(m.revenueNet)}
                    </span>
                    {change !== null && (
                      <span style={{ fontFamily: T.mono, fontSize: 8, color: change >= 0 ? C.green : C.red, marginBottom: 1 }}>
                        {change > 0 ? "+" : ""}{change}%
                      </span>
                    )}
                    <div style={{
                      width: "100%", height: h, minWidth: 4, borderRadius: `${R.xs}px ${R.xs}px 0 0`,
                      background: m.partial ? C.blueLight : C.blueDark,
                      border: m.partial ? `1px dashed ${C.blueDark}` : "none",
                    }} />
                    <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 2 }}>
                      {m.month.substring(5)}{m.partial ? "*" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            {monthlySales.some(m => m.partial) && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginTop: S[1] }}>
                * Mes actual parcial — no incluido en calculo de crecimiento.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 3. Top Products by Size ──────────────────────────────────── */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", background: C.white, boxShadow: E.sm }}>
        <div style={{ padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`, background: C.surfaceAlt }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            Top productos por tamano
          </div>
        </div>
        {/* Size tabs */}
        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.line}` }}>
          {sizeTabKeys.map(key => (
            <button key={key} onClick={() => setActiveSizeTab(key)} style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.medium,
              padding: `${S[1]}px ${S[3]}px`,
              borderBottom: activeSizeTab === key ? `2px solid ${C.blueDark}` : "2px solid transparent",
              color: activeSizeTab === key ? C.blueDark : C.inkMid,
              background: "transparent", border: "none", cursor: "pointer", marginBottom: -1,
            }}>
              {key === "ALL" ? "Todos" : (SIZE_TAB_LABELS[key] ?? key)}
            </button>
          ))}
        </div>
        <TopProductsBySize
          items={activeSizeTab === "ALL" ? items : (sizeGroups.get(activeSizeTab) ?? [])}
          sizeLabel={activeSizeTab === "ALL" ? null : (SIZE_TAB_LABELS[activeSizeTab] ?? activeSizeTab)}
        />
      </div>

      {/* ── 4. Compact freshness footer ──────────────────────────────── */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, display: "flex", gap: S[4], flexWrap: "wrap" }}>
        <span>Actualizado: {new Date(computedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</span>
        {salesCoverage?.salesAsOf && <span>Ventas al: {salesCoverage.salesAsOf}</span>}
        {salesCoverage?.freshnessLagDays !== null && salesCoverage?.freshnessLagDays !== undefined && <span>Lag: {salesCoverage.freshnessLagDays}d</span>}
        <span>Catalogo: LINEA 5 ({items.length} refs)</span>
      </div>
    </div>
  );
}

// ── Top Products By Size (sub-component with sortable headers) ────────────

function TopProductsBySize({
  items,
  sizeLabel,
}: {
  items: ImportSupplyIntelligenceItem[];
  sizeLabel: string | null;
}) {
  const { sortKey, sortDir, toggle } = useSortable<TopProdSortCol>("units");

  const summary = useMemo(() => {
    const totalUnits = items.reduce((s, i) => s + i.salesTotal6m, 0);
    const totalRevenue = items.reduce((s, i) => s + i.revenue6m, 0);
    return { count: items.length, totalUnits, totalRevenue };
  }, [items]);

  const sorted = useMemo(() => {
    const withSales = items.filter(i => i.salesTotal6m > 0 || i.soldNet > 0);
    const cmp = (a: ImportSupplyIntelligenceItem, b: ImportSupplyIntelligenceItem) => {
      let va: number, vb: number;
      switch (sortKey) {
        case "units": va = a.salesTotal6m; vb = b.salesTotal6m; break;
        case "value": va = a.revenue6m; vb = b.revenue6m; break;
        case "stock": va = a.remaining; vb = b.remaining; break;
        case "lastSale": return (sortDir === "desc" ? -1 : 1) * ((a.lastSaleSag ?? "").localeCompare(b.lastSaleSag ?? ""));
        case "ref": return (sortDir === "desc" ? -1 : 1) * a.reference.localeCompare(b.reference);
        default: va = 0; vb = 0;
      }
      return sortDir === "desc" ? vb - va : va - vb;
    };
    return stableSort(withSales, cmp, i => i.reference).slice(0, 10);
  }, [items, sortKey, sortDir]);

  const COLS = "36px 1fr 100px 110px 80px 90px";

  return (
    <div>
      {/* Summary strip */}
      {sizeLabel && (
        <div style={{ padding: `${S[1]}px ${S[4]}px`, fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, background: C.surface, borderBottom: `1px solid ${C.lineSubtle}` }}>
          {sizeLabel}: {summary.totalUnits.toLocaleString("es-CO")} und 6M · {fmtCOP(summary.totalRevenue)} · {summary.count} productos
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: COLS, padding: `${S[1]}px ${S[4]}px`, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`, gap: S[1] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid }}>#</span>
        <SortableHeader label="Referencia" colKey="ref" current={sortKey} dir={sortDir} onSort={toggle} />
        <SortableHeader label="Und 6M" colKey="units" current={sortKey} dir={sortDir} onSort={toggle} align="right" />
        <SortableHeader label="Valor 6M" colKey="value" current={sortKey} dir={sortDir} onSort={toggle} align="right" />
        <SortableHeader label="Stock B24" colKey="stock" current={sortKey} dir={sortDir} onSort={toggle} align="right" />
        <SortableHeader label="Ultima venta" colKey="lastSale" current={sortKey} dir={sortDir} onSort={toggle} />
      </div>
      {sorted.length === 0 && (
        <div style={{ padding: S[4], textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>Sin referencias con ventas en este tamano.</div>
      )}
      {sorted.map((item, idx) => (
        <div key={item.productId} style={{
          display: "grid", gridTemplateColumns: COLS, padding: `${S[1]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, alignItems: "center", gap: S[1],
        }}>
          <span style={{ color: C.inkFaint }}>{idx + 1}</span>
          <div style={{ overflow: "hidden" }}>
            <div style={{ fontWeight: T.wt.medium, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.reference}</div>
            <div style={{ fontSize: T.sz["2xs"], color: C.inkLight, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.description}</div>
          </div>
          <span style={{ textAlign: "right", fontWeight: T.wt.semibold }}>{item.salesTotal6m.toLocaleString("es-CO")}</span>
          <span style={{ textAlign: "right", color: C.inkMid }}>{fmtCOPFull(item.revenue6m)}</span>
          <span style={{ textAlign: "right", color: item.remaining > 0 ? C.ink : C.inkFaint }}>
            {item.stockDataQuality === "CONFIRMED" ? item.remaining.toLocaleString("es-CO") : "\u2014"}
          </span>
          <span style={{ color: C.inkMid }}>{item.lastSaleSag ?? "\u2014"}</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Detail drawer
// ═══════════════════════════════════════════════════════════════════════════════

function ImportDetailDrawer({
  item,
  onClose,
}: {
  item: ImportSupplyIntelligenceItem;
  onClose: () => void;
}) {
  const evidence = resolveEvidence(item);

  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 420,
        background: C.white, boxShadow: E.lg, zIndex: 100,
        display: "flex", flexDirection: "column", overflow: "auto",
        borderLeft: `1px solid ${C.line}`,
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", top: 0, left: 0, right: 420, bottom: 0,
          background: "rgba(0,0,0,0.15)", zIndex: -1,
        }}
      />
      {/* Header */}
      <div style={{
        padding: `${S[4]}px ${S[5]}px`, borderBottom: `1px solid ${C.line}`,
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
            {item.reference}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, marginTop: 2 }}>
            {item.description}
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Cerrar"
          style={{
            fontSize: 20, lineHeight: 1, color: C.inkMid, background: "none",
            border: "none", cursor: "pointer", padding: `${S[1]}px ${S[2]}px`,
            borderRadius: R.sm,
          }}
        >
          {"\u00D7"}
        </button>
      </div>

      <div style={{ padding: `${S[4]}px ${S[5]}px`, display: "flex", flexDirection: "column", gap: S[4] }}>
        {/* Classification badge */}
        <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.xs, padding: `2px ${S[2]}px`, borderRadius: R.sm,
            background: CLASSIFICATION_DISPLAY[item.recompraClassification].bg,
            color: CLASSIFICATION_DISPLAY[item.recompraClassification].fg,
          }}>
            {RECOMPRA_LABELS[item.recompraClassification]}
          </span>
          {item.sizeClass && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
              {item.sizeClass}
            </span>
          )}
        </div>

        {/* Key metrics — omit null cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
          <MetricBox label="Und netas 6M" value={item.salesTotal6m.toLocaleString("es-CO")} />
          {item.soldNet > 0 && <MetricBox label="Und netas (total)" value={item.soldNet.toLocaleString("es-CO")} />}
          {item.stockDataQuality === "CONFIRMED" && <MetricBox label="Stock B24" value={item.remaining.toLocaleString("es-CO")} />}
          {item.ritmoPromedioVentas !== null && item.ritmoPromedioVentas > 0 && (
            <MetricBox label="Velocidad/mes" value={item.ritmoPromedioVentas.toFixed(1)} />
          )}
          {item.coberturaPromedioDias !== null && (
            <MetricBox label="Cobertura stock" value={`${item.coberturaPromedioDias} dias`} />
          )}
          {item.capitalInmovilizado !== null && item.capitalInmovilizado > 0 && (
            <MetricBox label="Capital inmovilizado" value={`$${item.capitalInmovilizado.toLocaleString("es-CO")}`} />
          )}
        </div>

        {/* Evidence — antiguedad estimada */}
        {evidence && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
              Antiguedad estimada
            </span>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
              background: C.surface, borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`,
            }}>
              <div>{evidence.months} meses desde {evidence.date}</div>
              <div style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>{evidence.source}</div>
            </div>
          </div>
        )}

        {/* Recent purchases (C1/C2) */}
        {item.receipts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
              Ultimas compras
            </span>
            {item.receipts.slice(0, 5).map((r, i) => (
              <div key={i} style={{
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
                display: "flex", gap: S[3],
              }}>
                <span>{r.date}</span>
                <span>{r.documentNumber}</span>
                <span>{r.quantity} und</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Reusable sub-components
// ═══════════════════════════════════════════════════════════════════════════════

function SourceDownBanner() {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.lg,
      borderLeft: `4px solid ${C.red}`,
      padding: `${S[3]}px ${S[5]}px`, display: "flex", flexDirection: "column", gap: S[1],
    }}>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.red,
      }}>
        SOURCE_DOWN / PENDING_REFRESH
      </span>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
      }}>
        El cache de inteligencia de importaciones no tiene snapshot.
        El cron de prewarm se ejecuta diariamente a las 5:15 AM UTC.
        Esto NO significa que hay cero importaciones — solo que los datos aun no se han computado.
      </span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  color,
  unit,
  active,
  onClick,
}: {
  label: string;
  value: number | null;
  color?: string;
  unit?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${active ? C.blueDark : C.line}`,
        borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`,
        background: active ? C.blueLight : C.white,
        boxShadow: active ? E.sm : E.xs,
        cursor: onClick ? "pointer" : "default",
        display: "flex", flexDirection: "column", gap: S[1],
      }}
    >
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{label}</span>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold,
        color: value === null ? C.inkFaint : (color ?? C.ink),
      }}>
        {value === null ? "\u2014" : value.toLocaleString("es-CO")}
        {unit && value !== null && (
          <span style={{ fontSize: T.sz.xs, fontWeight: T.wt.normal, color: C.inkMid, marginLeft: S[1] }}>{unit}</span>
        )}
      </span>
    </div>
  );
}

function CoverageBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, minWidth: 160 }}>{label}</span>
      <div style={{ flex: 1, height: 8, background: C.lineSubtle, borderRadius: R.pill }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: R.pill }} />
      </div>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, minWidth: 60, textAlign: "right" }}>
        {count} ({pct}%)
      </span>
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: C.surface, borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.semibold, color: C.ink }}>{value}</div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtFreshness(isoStr: string): string {
  const d = new Date(isoStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return `${Math.floor(diffH / 24)}d`;
}
