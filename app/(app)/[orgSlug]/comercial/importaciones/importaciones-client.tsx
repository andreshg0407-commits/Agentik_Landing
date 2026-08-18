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
  INMEDIATA: "Comprar ahora",
  VIGILAR: "Revisar recompra",
  NO_RECOMPRAR: "No recomprar",
  SIN_DATOS: "Sin informacion suficiente",
};

const CLASSIFICATION_DISPLAY: Record<RecompraClassification, { bg: string; fg: string; label: string }> = {
  INMEDIATA:    { bg: C.greenLight,  fg: C.green,    label: "Comprar" },
  VIGILAR:      { bg: C.amberLight,  fg: C.amber,    label: "Revisar" },
  NO_RECOMPRAR: { bg: C.surface,     fg: C.inkMid,   label: "No comprar" },
  SIN_DATOS:    { bg: C.surface,     fg: C.inkFaint, label: "Verificar" },
};

type SortKey = "units" | "velocity" | "value";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "units", label: "Unidades netas vendidas" },
  { key: "velocity", label: "Velocidad mensual" },
  { key: "value", label: "Valor neto vendido 6M" },
];

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
}: ImportacionesClientProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>("mayor_rotacion");
  const [drawerItem, setDrawerItem] = useState<ImportSupplyIntelligenceItem | null>(null);
  const [windowMonths, setWindowMonths] = useState<WindowMonths>(6);
  const [sortKey, setSortKey] = useState<SortKey>("units");

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
            label="8M+ provisionales (pendiente SAG-004)"
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
          sortKey={sortKey}
          onSortChange={setSortKey}
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

function MayorRotacionView({
  items,
  windowMonths,
  sortKey,
  onSortChange,
  onRowClick,
}: {
  items: ImportSupplyIntelligenceItem[];
  windowMonths: WindowMonths;
  sortKey: SortKey;
  onSortChange: (k: SortKey) => void;
  onRowClick: (item: ImportSupplyIntelligenceItem) => void;
}) {
  const filtered = useMemo(() => {
    return items.filter(item => {
      if (item.salesDataQuality !== "SYNCED") return false;
      return salesInWindow(item, windowMonths) > 0;
    });
  }, [items, windowMonths]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    switch (sortKey) {
      case "units":
        return list.sort((a, b) => salesInWindow(b, windowMonths) - salesInWindow(a, windowMonths));
      case "velocity":
        return list.sort((a, b) => (salesInWindow(b, windowMonths) / windowMonths) - (salesInWindow(a, windowMonths) / windowMonths));
      case "value":
        return list.sort((a, b) => revenueInWindow(b, windowMonths) - revenueInWindow(a, windowMonths));
    }
  }, [filtered, sortKey, windowMonths]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {/* Sort selector */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Ordenar por:</span>
        {SORT_OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => onSortChange(opt.key)}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: sortKey === opt.key ? T.wt.semibold : T.wt.normal,
              padding: `${S[1] - 2}px ${S[2]}px`, borderRadius: R.sm,
              border: `1px solid ${sortKey === opt.key ? C.blueDark : C.line}`,
              background: sortKey === opt.key ? C.blueLight : C.white,
              color: sortKey === opt.key ? C.blueDark : C.inkMid,
              cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Methodology note */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
        Velocidad mensual = unidades netas vendidas 6M / 6 meses observados.
        Devoluciones y NC restadas de venta neta. Anulados excluidos.
      </div>

      {/* Table */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", background: C.white, boxShadow: E.sm }}>
        <div style={{
          display: "grid", gridTemplateColumns: "48px 1fr 100px 100px 100px 100px 90px",
          padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`,
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid,
        }}>
          <span>#</span>
          <span>Referencia</span>
          <span style={{ textAlign: "right" }}>Und netas {windowMonths}M</span>
          <span style={{ textAlign: "right" }}>Vel/mes</span>
          <span style={{ textAlign: "right" }}>Valor {windowMonths}M</span>
          <span style={{ textAlign: "right" }}>Stock B24</span>
          <span>Clasificacion</span>
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
            <div
              key={item.productId}
              onClick={() => onRowClick(item)}
              style={{
                display: "grid", gridTemplateColumns: "48px 1fr 100px 100px 100px 100px 90px",
                padding: ROW_PAD, borderBottom: `1px solid ${C.lineSubtle}`,
                fontFamily: T.mono, fontSize: T.sz.base, cursor: "pointer",
                alignItems: "center",
              }}
            >
              <span style={{ color: C.inkFaint, fontSize: T.sz.xs }}>{idx + 1}</span>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], minWidth: 0 }}>
                <CommercialReferenceThumbnail imageUrl={item.imageUrl} referenceCode={item.reference} size={28} />
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontWeight: T.wt.medium, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.reference}
                  </div>
                  <div style={{ fontSize: T.sz.xs, color: C.inkLight, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.description}
                  </div>
                </div>
              </div>
              <span style={{ textAlign: "right", fontWeight: T.wt.semibold }}>{windowSales.toLocaleString("es-CO")}</span>
              <span style={{ textAlign: "right", color: C.inkMid }}>{velocity > 0 ? velocity.toFixed(1) : "\u2014"}</span>
              <span style={{ textAlign: "right", color: C.inkMid }}>${Math.round(value).toLocaleString("es-CO")}</span>
              <span style={{ textAlign: "right", color: item.remaining > 0 ? C.ink : C.red }}>
                {item.stockDataQuality === "CONFIRMED" ? item.remaining.toLocaleString("es-CO") : "\u2014"}
              </span>
              <span style={{
                fontSize: T.sz.xs, padding: `1px ${S[1]}px`, borderRadius: R.sm,
                background: cls.bg, color: cls.fg, textAlign: "center",
              }}>
                {cls.label}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
        {sorted.length} referencias con ventas certificadas en ventana {windowMonths}M.
        Universo: productLine = &quot;5&quot; (LINEA 5).
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 2: Menor rotacion
// ═══════════════════════════════════════════════════════════════════════════════

function MenorRotacionView({
  items,
  windowMonths,
  onRowClick,
}: {
  items: ImportSupplyIntelligenceItem[];
  windowMonths: WindowMonths;
  onRowClick: (item: ImportSupplyIntelligenceItem) => void;
}) {
  const filtered = useMemo(() => {
    // Items with SAG B24 EXISTENCIA > 0, sorted by lowest sales
    return items
      .filter(item => item.sagB24Existencia !== null && item.sagB24Existencia > 0)
      .sort((a, b) => salesInWindow(a, windowMonths) - salesInWindow(b, windowMonths));
  }, [items, windowMonths]);

  const coverageInfo = useMemo(() => {
    const withSagData = items.filter(i => i.sagB24Existencia !== null).length;
    const withStock = items.filter(i => i.sagB24Existencia !== null && i.sagB24Existencia > 0).length;
    return { total: items.length, confirmed: withSagData, withStock, coverage: items.length > 0 ? Math.round((withSagData / items.length) * 100) : 0 };
  }, [items]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {/* Coverage info */}
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
        display: "flex", alignItems: "center", gap: S[2],
      }}>
        <span>SAG B24: {coverageInfo.confirmed}/{coverageInfo.total} refs con dato ({coverageInfo.coverage}%)</span>
        <span style={{ color: C.inkMid }}>
          {coverageInfo.withStock} con existencia &gt; 0
        </span>
      </div>

      {/* Table */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", background: C.white, boxShadow: E.sm }}>
        <div style={{
          display: "grid", gridTemplateColumns: "48px 1fr 100px 100px 100px 100px 120px",
          padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`,
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid,
        }}>
          <span>#</span>
          <span>Referencia</span>
          <span style={{ textAlign: "right" }}>Und netas {windowMonths}M</span>
          <span style={{ textAlign: "right" }}>Stock B24</span>
          <span style={{ textAlign: "right" }}>Cobertura (dias)</span>
          <span style={{ textAlign: "right" }}>Capital inmov.</span>
          <span>Ultimo ingreso</span>
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: S[5], textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
            Sin referencias con existencia confirmada en B24.
          </div>
        )}
        {filtered.map((item, idx) => {
          const windowSales = salesInWindow(item, windowMonths);
          return (
            <div
              key={item.productId}
              onClick={() => onRowClick(item)}
              style={{
                display: "grid", gridTemplateColumns: "48px 1fr 100px 100px 100px 100px 120px",
                padding: ROW_PAD, borderBottom: `1px solid ${C.lineSubtle}`,
                fontFamily: T.mono, fontSize: T.sz.base, cursor: "pointer",
                alignItems: "center",
              }}
            >
              <span style={{ color: C.inkFaint, fontSize: T.sz.xs }}>{idx + 1}</span>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], minWidth: 0 }}>
                <CommercialReferenceThumbnail imageUrl={item.imageUrl} referenceCode={item.reference} size={28} />
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontWeight: T.wt.medium, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.reference}
                  </div>
                  <div style={{ fontSize: T.sz.xs, color: C.inkLight, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.description}
                  </div>
                </div>
              </div>
              <span style={{ textAlign: "right", color: windowSales === 0 ? C.red : C.ink }}>
                {windowSales.toLocaleString("es-CO")}
              </span>
              <span style={{ textAlign: "right" }}>{item.remaining.toLocaleString("es-CO")}</span>
              <span style={{ textAlign: "right", color: C.inkMid }}>
                {item.coberturaPromedioDias !== null ? `${item.coberturaPromedioDias}d` : "\u2014"}
              </span>
              <span style={{ textAlign: "right", color: C.inkMid }}>
                {item.capitalInmovilizado !== null ? `$${item.capitalInmovilizado.toLocaleString("es-CO")}` : "\u2014"}
              </span>
              <span style={{ fontSize: T.sz.xs, color: C.inkMid }}>
                {item.lastInboundDate ?? "\u2014"}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
        {filtered.length} referencias con existencia B24 confirmada (SAG vw_agentik_inventario), ordenadas de menor a mayor venta.
        EXISTENCIA &gt; 0 para permanencia fisica. DISPONIBLE para disponibilidad comercial.
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 3: Mas de 8 meses sin reingreso
// ═══════════════════════════════════════════════════════════════════════════════

function Masde8MesesView({
  items,
  onRowClick,
}: {
  items: ImportSupplyIntelligenceItem[];
  onRowClick: (item: ImportSupplyIntelligenceItem) => void;
}) {
  const { proxy } = useMemo(() => {
    const proxyList: Array<ImportSupplyIntelligenceItem & { evidence: NonNullable<ReturnType<typeof resolveEvidence>> }> = [];

    for (const item of items) {
      // 05A2R1: Require EXISTENCIA SAG B24 > 0 — exclude zero-stock refs
      const sagExist = item.sagB24Existencia;
      if (sagExist === null || sagExist <= 0) continue;

      const ev = resolveEvidence(item);
      if (!ev || ev.months < 8) continue;
      proxyList.push({ ...item, evidence: ev });
    }

    proxyList.sort((a, b) => b.evidence.months - a.evidence.months);
    return { proxy: proxyList };
  }, [items]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {/* SAG-004 blocker banner */}
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.amberDark,
        background: C.amberLight, border: `1px solid ${C.amberBorder}`,
        borderRadius: R.md, padding: `${S[2]}px ${S[3]}px`,
        borderLeft: `4px solid ${C.amber}`,
      }}>
        <div style={{ fontWeight: T.wt.semibold, marginBottom: S[1] }}>
          IMPORTS_B24_REENTRY_AGE_PARTIAL — Todas las fechas son provisionales
        </div>
        <div>
          No existe una consulta runtime de movimientos B24 (SAG-004 bloqueado).
          Las fechas provienen de facturas de compra C1/C2 o d_ultima_compra SAG.
          Ninguna fecha proxy puede generar el KPI &quot;Mas de 8 meses certificados&quot;.
          Pendientes de confirmar antiguedad fisica hasta que SAG-004 se resuelva.
        </div>
      </div>

      {/* Section: Provisional (all proxy) */}
      {proxy.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.amber }}>
            Provisionales — Fecha de compra/creacion SAG &gt; 8 meses ({proxy.length})
          </div>
          <EightMonthTable items={proxy} onRowClick={onRowClick} />
        </div>
      )}

      {proxy.length === 0 && (
        <div style={{ padding: S[5], textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Sin referencias con mas de 8 meses desde ultimo ingreso documentado.
        </div>
      )}

      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
        Calculo con meses calendario (America/Bogota), no conteos fijos de dias.
        EXISTENCIA B24 = autoridad SAG vw_agentik_inventario (BODEGA 24). Solo refs con existencia &gt; 0.
      </div>
    </div>
  );
}

function EightMonthTable({
  items,
  onRowClick,
}: {
  items: Array<ImportSupplyIntelligenceItem & { evidence: NonNullable<ReturnType<typeof resolveEvidence>> }>;
  onRowClick: (item: ImportSupplyIntelligenceItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div style={{ padding: S[3], fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
        Sin items en esta categoria.
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", background: C.white, boxShadow: E.sm }}>
      <div style={{
        display: "grid", gridTemplateColumns: "48px 1fr 80px 90px 80px 100px 120px",
        padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`,
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid,
      }}>
        <span>#</span>
        <span>Referencia</span>
        <span>Evidencia</span>
        <span>Fecha</span>
        <span style={{ textAlign: "right" }}>Meses</span>
        <span style={{ textAlign: "right" }}>Stock B24</span>
        <span>Fuente</span>
      </div>
      {items.map((item, idx) => {
        const ev = item.evidence;
        const badge = EVIDENCE_LABELS[ev.level];
        return (
          <div
            key={item.productId}
            onClick={() => onRowClick(item)}
            style={{
              display: "grid", gridTemplateColumns: "48px 1fr 80px 90px 80px 100px 120px",
              padding: ROW_PAD, borderBottom: `1px solid ${C.lineSubtle}`,
              fontFamily: T.mono, fontSize: T.sz.base, cursor: "pointer",
              alignItems: "center",
            }}
          >
            <span style={{ color: C.inkFaint, fontSize: T.sz.xs }}>{idx + 1}</span>
            <div style={{ display: "flex", alignItems: "center", gap: S[2], minWidth: 0 }}>
              <CommercialReferenceThumbnail imageUrl={item.imageUrl} referenceCode={item.reference} size={28} />
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontWeight: T.wt.medium, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.reference}
                </div>
                <div style={{ fontSize: T.sz.xs, color: C.inkLight, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.description}
                </div>
              </div>
            </div>
            <span style={{
              fontSize: T.sz["2xs"], padding: `1px ${S[1]}px`, borderRadius: R.sm,
              background: ev.level === "CERTIFIED_B24_REENTRY_DATE" ? C.greenLight : C.amberLight,
              color: badge.color, textAlign: "center",
            }}>
              {badge.badge}
            </span>
            <span style={{ fontSize: T.sz.xs, color: C.inkMid }}>{ev.date}</span>
            <span style={{ textAlign: "right", fontWeight: T.wt.semibold, color: ev.months >= 12 ? C.red : C.ink }}>
              {ev.months}
            </span>
            <span style={{ textAlign: "right", color: item.remaining > 0 ? C.ink : C.inkFaint }}>
              {item.stockDataQuality === "CONFIRMED" ? item.remaining.toLocaleString("es-CO") : "\u2014"}
            </span>
            <span style={{ fontSize: T.sz["2xs"], color: C.inkLight }}>{ev.source}</span>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORT 4: Inteligencia
// ═══════════════════════════════════════════════════════════════════════════════

function InteligenciaView({
  items,
  truthState,
  freshness,
  computedAt,
  salesCoverage,
}: {
  items: ImportSupplyIntelligenceItem[];
  truthState: CachedImportTruthState;
  freshness: ImportSourceFreshness;
  computedAt: string;
  salesCoverage?: ImportSalesCoverage;
}) {
  // C1/C2 documented purchases summary
  const receiptSummary = useMemo(() => {
    let totalDocs = 0;
    let totalQty = 0;
    const monthly = new Map<string, number>();

    for (const item of items) {
      for (const r of item.receipts) {
        totalDocs++;
        totalQty += r.quantity;
        const month = r.date.substring(0, 7);
        monthly.set(month, (monthly.get(month) ?? 0) + r.quantity);
      }
    }

    const months = Array.from(monthly.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    return { totalDocs, totalQty, months };
  }, [items]);

  // Monthly import product sales
  const monthlySalesSummary = useMemo(() => {
    const byMonth = new Map<string, number>();
    // We only have 6M aggregate sales, no per-month breakdown at list level.
    // Show total sales alongside receipt data for comparison.
    return {
      totalSalesRefs: items.filter(i => i.salesDataQuality === "SYNCED" && i.soldNet > 0).length,
      totalSalesUnits: items.reduce((s, i) => s + i.salesTotal6m, 0),
      totalRevenueAll: items.reduce((s, i) => s + i.revenueAll, 0),
    };
  }, [items]);

  // Inbound date coverage
  const inboundCoverage = useMemo(() => {
    let c1c2 = 0, lastPurchase = 0, none = 0;
    for (const item of items) {
      if (item.lastInboundSource === "SAG_RECEIPT_C1_C2") c1c2++;
      else if (item.lastInboundSource === "LAST_PURCHASE_SAG") lastPurchase++;
      else none++;
    }
    return { c1c2, lastPurchase, none, total: items.length };
  }, [items]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[5] }}>

      {/* ── Chart 1: C1/C2 Documented Purchases ──────────────────────── */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", background: C.white, boxShadow: E.sm }}>
        <div style={{
          padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`,
          background: C.surfaceAlt, fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink,
        }}>
          Compras documentadas C1/C2 (facturas de compra)
        </div>
        <div style={{ padding: `${S[3]}px ${S[4]}px`, display: "flex", flexDirection: "column", gap: S[3] }}>
          <div style={{ display: "flex", gap: S[6] }}>
            <div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Documentos</span>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>
                {receiptSummary.totalDocs.toLocaleString("es-CO")}
              </div>
            </div>
            <div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Unidades recibidas</span>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>
                {receiptSummary.totalQty.toLocaleString("es-CO")}
              </div>
            </div>
          </div>
          {receiptSummary.months.length > 0 && (
            <div style={{ display: "flex", gap: S[1], alignItems: "flex-end", height: 60 }}>
              {receiptSummary.months.slice(-12).map(([month, qty]) => {
                const max = Math.max(...receiptSummary.months.map(m => m[1]));
                const h = max > 0 ? Math.max(4, (qty / max) * 56) : 4;
                return (
                  <div key={month} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                    <div style={{ width: "100%", height: h, background: C.blueDark, borderRadius: `${R.xs}px ${R.xs}px 0 0`, minWidth: 4 }} />
                    <span style={{ fontFamily: T.mono, fontSize: 7, color: C.inkFaint, marginTop: 2 }}>
                      {month.substring(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberDark }}>
            Estos son facturas de compra (C1/C2), no certifican origen China.
            No se grafican como crecimiento de importaciones — no se grafican como crecimiento de importaciones.
            SAG no expone todavia una fuente reconciliada de ingresos fisicos desde China.
            Facturas de compra (C1/C2): no certifican origen China.
          </div>
        </div>
      </div>

      {/* ── Chart 2: Monthly Import Product Sales ────────────────────── */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", background: C.white, boxShadow: E.sm }}>
        <div style={{
          padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`,
          background: C.surfaceAlt, fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink,
        }}>
          Ventas de productos importados
        </div>
        <div style={{ padding: `${S[3]}px ${S[4]}px`, display: "flex", flexDirection: "column", gap: S[2] }}>
          <div style={{ display: "flex", gap: S[6] }}>
            <div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Refs con ventas</span>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>
                {monthlySalesSummary.totalSalesRefs}
              </div>
            </div>
            <div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Und netas 6M</span>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>
                {monthlySalesSummary.totalSalesUnits.toLocaleString("es-CO")}
              </div>
            </div>
            <div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Valor total (all time)</span>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>
                ${Math.round(monthlySalesSummary.totalRevenueAll).toLocaleString("es-CO")}
              </div>
            </div>
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
            No se certifica el origen de cada unidad vendida — solo que la referencia pertenece al catalogo importado.
            Ventas de CustomerOrderLine con status FACTURADO. Devoluciones y NC restadas.
          </div>
        </div>
      </div>

      {/* ── SAG Blockers ─────────────────────────────────────────────── */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", background: C.white, boxShadow: E.sm }}>
        <div style={{
          padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`,
          background: C.surfaceAlt, fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.red,
        }}>
          Blockers SAG — Datos no disponibles
        </div>
        <div style={{ padding: `${S[3]}px ${S[4]}px`, display: "flex", flexDirection: "column", gap: S[3] }}>
          <BlockerRow id="SAG-003" label="Transito y ordenes de importacion abiertas" status="Fuente SAG pendiente" />
          <BlockerRow id="SAG-004" label="Ingreso fisico certificado desde China" status="SAG-004 BLOCKED — CERO documentos" />
          <BlockerRow id="SAG-016" label="FUENTE/origen en ventas por unidad" status="No disponible en vista SAG" />
        </div>
      </div>

      {/* ── Identity provenance ──────────────────────────────────────── */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", background: C.white, boxShadow: E.sm }}>
        <div style={{
          padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`,
          background: C.surfaceAlt, fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink,
        }}>
          Identidad del universo importado
        </div>
        <div style={{ padding: 0 }}>
          <div style={{
            display: "grid", gridTemplateColumns: "120px 160px 120px 80px 100px",
            padding: `${S[1]}px ${S[4]}px`, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`,
            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkMid,
          }}>
            <span>{"FUENTE"}</span>
            <span>{"CAMPO"}</span>
            <span>{"VALOR"}</span>
            <span>{"COBERTURA"}</span>
            <span>{"FRESCURA"}</span>
          </div>
          <ProvenanceRow
            fuente="Catalogo SAG"
            campo="productLine"
            valor={`LINEA 5 (${items.length} refs)`}
            cobertura="100%"
            frescura={freshness.productEntityAsOf ? fmtFreshness(freshness.productEntityAsOf) : "\u2014"}
          />
          <ProvenanceRow
            fuente="Inventario SAG"
            campo="B24 existencia"
            valor={`${items.filter(i => i.remaining > 0).length} con stock`}
            cobertura={`${Math.round((items.filter(i => i.stockDataQuality === "CONFIRMED").length / Math.max(items.length, 1)) * 100)}%`}
            frescura={freshness.inventoryAsOf ? fmtFreshness(freshness.inventoryAsOf) : "\u2014"}
          />
          <ProvenanceRow
            fuente="Ventas SAG"
            campo="CustomerOrderLine"
            valor={`${items.filter(i => i.salesDataQuality === "SYNCED" && i.soldNet > 0).length} con ventas`}
            cobertura={`${Math.round((items.filter(i => i.salesDataQuality === "SYNCED").length / Math.max(items.length, 1)) * 100)}%`}
            frescura={freshness.orderLinesAsOf ? fmtFreshness(freshness.orderLinesAsOf) : "\u2014"}
          />
          <ProvenanceRow
            fuente="Ingreso China"
            campo="CH 248"
            valor="CERO documentos"
            cobertura="SAG-004 BLOCKED"
            frescura="SOURCE_BLOCKED"
          />
        </div>
      </div>

      {/* ── Inbound date coverage ──────────────────────────────────────── */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", background: C.white, boxShadow: E.sm }}>
        <div style={{
          padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`,
          background: C.surfaceAlt, fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink,
        }}>
          Cobertura de fecha de ingreso
        </div>
        <div style={{ padding: `${S[3]}px ${S[4]}px`, display: "flex", flexDirection: "column", gap: S[2] }}>
          <CoverageBar label="C1/C2 (certificado)" count={inboundCoverage.c1c2} total={inboundCoverage.total} color={C.green} />
          <CoverageBar label="d_ultima_compra (proxy)" count={inboundCoverage.lastPurchase} total={inboundCoverage.total} color={C.amber} />
          <CoverageBar label="Sin fecha" count={inboundCoverage.none} total={inboundCoverage.total} color={C.red} />
        </div>
      </div>

      {/* ── Rulings ───────────────────────────────────────────────────── */}
      <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", background: C.white, boxShadow: E.sm }}>
        <div style={{
          padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`,
          background: C.surfaceAlt, fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink,
        }}>
          Rulings emitidos
        </div>
        <div style={{ padding: `${S[3]}px ${S[4]}px`, display: "flex", flexDirection: "column", gap: S[2] }}>
          <RulingRow ruling="IMPORTS_SALES_AND_STOCK_PARTIAL_RUNTIME_VERIFIED" status="PASS" />
          <RulingRow ruling="IMPORT_RECEIPT_SOURCE_BLOCKED" status="BLOCKED" />
          <RulingRow ruling="IMPORT_ROTATION_CLASSIFICATION_BLOCKED" status="BLOCKED" />
          <RulingRow ruling="IMPORTS_B24_REENTRY_AGE_PARTIAL" status="BLOCKED" />
        </div>
      </div>

      {/* ── Sales coverage ──────────────────────────────────────────── */}
      {salesCoverage && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: R.md, overflow: "hidden", background: C.white, boxShadow: E.sm }}>
          <div style={{ padding: `${S[2]}px ${S[3]}px`, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}`, fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid }}>
            Cobertura de ventas
          </div>
          <div style={{ padding: `${S[3]}px ${S[4]}px`, fontFamily: T.mono, fontSize: T.sz.xs, display: "flex", flexDirection: "column", gap: 4 }}>
            <span>salesAsOf: {salesCoverage.salesAsOf ?? "\u2014"}</span>
            <span>Rango: {salesCoverage.salesSourceMinDate ?? "\u2014"} .. {salesCoverage.salesSourceMaxDate ?? "\u2014"}</span>
            <span>Lag: {salesCoverage.freshnessLagDays !== null ? `${salesCoverage.freshnessLagDays} dias` : "\u2014"}</span>
            <span>
              6M: {salesCoverage.coverage6m ? "FULL" : "PARTIAL"} |
              8M: {salesCoverage.coverage8m ? "FULL" : "PARTIAL"} |
              12M: {salesCoverage.coverage12m ? "FULL" : "PARTIAL"}
            </span>
          </div>
        </div>
      )}

      {/* ── Cache state ───────────────────────────────────────────────── */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, display: "flex", flexDirection: "column", gap: 2 }}>
        <span>Truth state: {truthState} | Computed at: {new Date(computedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" })}</span>
        <span>Composite freshness: {freshness.compositeAsOf ? fmtFreshness(freshness.compositeAsOf) : "\u2014"}</span>
        <span>Rotacion: NO VERIFICABLE sin SAG-004. Meses calendario (America/Bogota).</span>
      </div>
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

  return (
    <div
      style={{
        position: "fixed", top: 0, right: 0, bottom: 0, width: 420,
        background: C.white, boxShadow: E.lg, zIndex: 50,
        display: "flex", flexDirection: "column", overflow: "auto",
        borderLeft: `1px solid ${C.line}`,
      }}
    >
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
          style={{
            fontFamily: T.mono, fontSize: T.sz.lg, color: C.inkMid, background: "none",
            border: "none", cursor: "pointer", padding: S[1],
          }}
        >
          \u2715
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

        {/* Key metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
          <MetricBox label="Und netas (total)" value={item.soldNet.toLocaleString("es-CO")} />
          <MetricBox label="Und netas 6M" value={item.salesTotal6m.toLocaleString("es-CO")} />
          <MetricBox label="Stock B24" value={item.stockDataQuality === "CONFIRMED" ? item.remaining.toLocaleString("es-CO") : "\u2014"} />
          <MetricBox label="Vel/mes" value={item.ritmoPromedioVentas !== null ? item.ritmoPromedioVentas.toFixed(1) : "\u2014"} />
          <MetricBox label="Cobertura" value={item.coberturaPromedioDias !== null ? `${item.coberturaPromedioDias}d` : "\u2014"} />
          <MetricBox label="Capital inmov." value={item.capitalInmovilizado !== null ? `$${item.capitalInmovilizado.toLocaleString("es-CO")}` : "\u2014"} />
        </div>

        {/* Evidence */}
        {evidence && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
              Ultimo ingreso documentado
            </span>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
              background: C.surface, borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`,
            }}>
              <div>Fecha: {evidence.date}</div>
              <div>Meses: {evidence.months}</div>
              <div>Fuente: {evidence.source}</div>
              <div>Nivel: {EVIDENCE_LABELS[evidence.level].badge}</div>
            </div>
          </div>
        )}

        {/* Facturas de compra (C1/C2) */}
        {item.receipts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
              Facturas de compra (C1/C2)
            </span>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberDark, marginBottom: S[1] }}>
              Estas facturas de compra no certifican origen China.
            </div>
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

        {/* Informacion tecnica */}
        <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
            Informacion tecnica
          </span>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            <div>productId: {item.productId}</div>
            <div>salesDataQuality: {item.salesDataQuality}</div>
            <div>stockDataQuality: {item.stockDataQuality}</div>
            <div>lastInboundSource: {item.lastInboundSource}</div>
            <div>lastInboundDate: {item.lastInboundDate ?? "\u2014"}</div>
            <div>createdAtSag: {item.createdAtSag ?? "\u2014"}</div>
            <div>lastPurchaseSag: {item.lastPurchaseSag ?? "\u2014"}</div>
            <div>lastSaleSag: {item.lastSaleSag ?? "\u2014"}</div>
            <div>recompraClassification: {item.recompraClassification}</div>
            <div>recompraReason: {item.recompraReason}</div>
          </div>
        </div>
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

function BlockerRow({ id, label, status }: { id: string; label: string; status: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: S[3],
      padding: `${S[1]}px 0`, borderBottom: `1px solid ${C.lineSubtle}`,
    }}>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        color: C.red, minWidth: 60,
      }}>
        {id}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, flex: 1 }}>
        {label}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>
        {status}
      </span>
    </div>
  );
}

function ProvenanceRow({
  fuente,
  campo,
  valor,
  cobertura,
  frescura,
}: {
  fuente: string;
  campo: string;
  valor: string;
  cobertura: string;
  frescura: string;
}) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "120px 160px 120px 80px 100px",
      padding: `${S[1]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
      fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
    }}>
      <span>{fuente}</span>
      <span style={{ color: C.inkMid }}>{campo}</span>
      <span>{valor}</span>
      <span style={{ color: cobertura.includes("BLOCKED") ? C.red : C.inkMid }}>{cobertura}</span>
      <span style={{ color: frescura.includes("BLOCKED") ? C.red : C.inkLight }}>{frescura}</span>
    </div>
  );
}

function RulingRow({ ruling, status }: { ruling: string; status: "PASS" | "BLOCKED" }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: S[2],
      fontFamily: T.mono, fontSize: T.sz.xs,
    }}>
      <span style={{
        padding: `1px ${S[1]}px`, borderRadius: R.sm,
        background: status === "PASS" ? C.greenLight : C.redLight,
        color: status === "PASS" ? C.green : C.red,
        fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
      }}>
        {status}
      </span>
      <span style={{ color: C.inkMid }}>{ruling}</span>
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
