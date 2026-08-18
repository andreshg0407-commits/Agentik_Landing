/**
 * importaciones-client.tsx
 *
 * Importaciones — 3 vistas para decision comercial de importados.
 * Tabs: Ranking para recompra, Rotacion, Inteligencia.
 *
 * KPIs permitidos (verificables):
 *   - Referencias importadas con ventas certificadas
 *   - Inventario disponible de referencias importadas
 *
 * KPIs bloqueados (no verificables):
 *   - Revisar rotacion       → SAG-004 (ingreso fisico China no certificado)
 *   - Baja rotacion          → SAG-004
 *   - Importaciones abiertas → SAG-003 (transito y ordenes de importacion)
 *
 * IDENTIDAD DEL UNIVERSO IMPORTADO:
 *   ProductEntity.productLine = "5" (SAG LINEA 5, catalogo SAG certificado).
 *   El inventario y ventas se vinculan por referencia (externalId → referenceCode).
 *   No se certifica el origen de cada unidad vendida — solo que la referencia
 *   pertenece al catalogo importado.
 *
 * FUENTE DE RECIBOS:
 *   item.receipts[] proviene de SAG MOVIMIENTOS fuente C1/C2 (facturas de compra).
 *   NO son recepciones fisicas desde China — son compras generales.
 *   No se grafican como crecimiento de importaciones.
 *
 * ROTACION:
 *   Requiere ingreso fisico certificado desde China (SAG-004).
 *   Mientras no exista fuente certificada: NO VERIFICABLE.
 *   No se computan umbrales de 6/8 meses con datos no certificados.
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
 *   Show SOURCE_DOWN/PENDING_REFRESH, never EMPTY_CERTIFIED.
 *
 * Sprint: IMPORTS-CANONICAL-RUNTIME-MVP-05A1R
 */

"use client";

import React, { useState, useMemo, useCallback } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import type {
  ImportSupplyIntelligenceItem,
  ImportSupplyKpis,
  RecompraClassification,
  DataQuality,
  ImportSizeClass,
} from "@/lib/comercial/importaciones/import-types";
import { CommercialReferenceThumbnail } from "@/components/comercial/commercial-reference-thumbnail";

// ── Props ───────────────────────────────────────────────────────────────────

interface ImportacionesClientProps {
  orgSlug: string;
  items: ImportSupplyIntelligenceItem[];
  kpis: ImportSupplyKpis;
}

// ── Tab type ────────────────────────────────────────────────────────────────

type ViewTab = "ranking_recompra" | "rotacion" | "inteligencia";

const VIEW_TABS: { key: ViewTab; label: string }[] = [
  { key: "ranking_recompra", label: "Ranking para recompra" },
  { key: "rotacion", label: "Rotacion" },
  { key: "inteligencia", label: "Inteligencia" },
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

const SIZE_LABELS: Record<string, string> = {
  PEQUENO: "Pequenos", MEDIANO: "Medianos", GRANDE: "Grandes",
};

const CHANNEL_LABELS: Record<string, string> = {
  detal: "Detal", mayorista: "Mayorista", equilibrado: "Equilibrado", sin_datos: "\u2014",
};

// ── Fail-closed detection ────────────────────────────────────────────────────
// When cache returns SOURCE_UNAVAILABLE, kpis.totalRefs = -1 (sentinel).
// This means NO snapshot exists — show SOURCE_DOWN, not EMPTY_CERTIFIED.

function isSourceDown(kpis: ImportSupplyKpis): boolean {
  return kpis.totalRefs < 0;
}

// ── Client-derived KPIs ─────────────────────────────────────────────────────

interface DerivedKpis {
  /** References with salesDataQuality=SYNCED and soldNet>0 */
  refsConVentasCertificadas: number;
  /** Sum of remaining stock across all import references */
  inventarioDisponible: number;
}

function derivarKpis(items: ImportSupplyIntelligenceItem[]): DerivedKpis {
  let refsConVentasCertificadas = 0;
  let inventarioDisponible = 0;

  for (const item of items) {
    if (item.salesDataQuality === "SYNCED" && item.soldNet > 0) {
      refsConVentasCertificadas++;
    }
    inventarioDisponible += item.remaining;
  }

  return { refsConVentasCertificadas, inventarioDisponible };
}

// ── Main Component ──────────────────────────────────────────────────────────

export function ImportacionesClient({ orgSlug, items, kpis }: ImportacionesClientProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>("ranking_recompra");
  const [drawerItem, setDrawerItem] = useState<ImportSupplyIntelligenceItem | null>(null);

  const openDrawer = useCallback((item: ImportSupplyIntelligenceItem) => setDrawerItem(item), []);
  const closeDrawer = useCallback(() => setDrawerItem(null), []);

  const sourceDown = isSourceDown(kpis);

  const derived = useMemo(() => derivarKpis(items), [items]);

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
      )}

      {/* ── KPIs (2 permitidos + 3 bloqueados) ───────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: S[3] }}>
        <KpiCard
          label="Refs importadas con ventas certificadas"
          value={sourceDown ? null : derived.refsConVentasCertificadas}
          color={!sourceDown && derived.refsConVentasCertificadas > 0 ? C.blueDark : undefined}
          active={activeTab === "ranking_recompra"}
          onClick={() => setActiveTab("ranking_recompra")}
        />
        <KpiCard
          label="Inventario disponible importados"
          value={sourceDown ? null : derived.inventarioDisponible}
          unit="und"
          active={false}
          onClick={() => setActiveTab("ranking_recompra")}
        />
        <BlockedKpiCard
          label="Revisar rotacion"
          reason="No verificable"
          debtCode="SAG-004"
          onClick={() => setActiveTab("rotacion")}
        />
        <BlockedKpiCard
          label="Baja rotacion"
          reason="No verificable"
          debtCode="SAG-004"
          onClick={() => setActiveTab("rotacion")}
        />
        <BlockedKpiCard
          label="Importaciones abiertas"
          reason="Fuente SAG pendiente"
          debtCode="SAG-003"
          onClick={() => setActiveTab("inteligencia")}
        />
      </div>

      {/* ── View tabs ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: S[1], borderBottom: `1px solid ${C.line}`, paddingBottom: 0 }}>
        {VIEW_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: activeTab === tab.key ? T.wt.bold : T.wt.medium,
              padding: `${S[2]}px ${S[4]}px`,
              border: "none", borderBottom: `2px solid ${activeTab === tab.key ? C.blueDark : "transparent"}`,
              background: "transparent", color: activeTab === tab.key ? C.blueDark : C.inkMid,
              cursor: "pointer", transition: "color 120ms, border-color 120ms",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Active view ──────────────────────────────────────────────── */}
      {sourceDown ? (
        <div style={{
          background: C.white, borderRadius: R.lg, border: `1px solid ${C.line}`, boxShadow: E.sm,
        }}>
          <EmptyRow text="SOURCE_DOWN / PENDING_REFRESH" />
        </div>
      ) : (
        <>
          {activeTab === "ranking_recompra" && <RankingRecompraView items={items} onDetail={openDrawer} />}
          {activeTab === "rotacion" && <RotacionBlockedView />}
          {activeTab === "inteligencia" && <InteligenciaView items={items} />}
        </>
      )}

      {/* ── Drawer ──────────────────────────────────────────────────── */}
      {drawerItem && <ImportDetailDrawer item={drawerItem} onClose={closeDrawer} />}
    </div>
  );
}

// ── VIEW 1: Ranking para recompra (flat sorted list, 3 independent sorts) ──

type RecompraSortMode = "units" | "velocity" | "value";

function RankingRecompraView({ items, onDetail }: {
  items: ImportSupplyIntelligenceItem[];
  onDetail: (i: ImportSupplyIntelligenceItem) => void;
}) {
  const [sortBy, setSortBy] = useState<RecompraSortMode>("units");

  // Universe: references with certified sales (salesDataQuality=SYNCED, soldNet>0)
  // This is the SAME universe as the KPI "Refs importadas con ventas certificadas"
  const sorted = useMemo(() => {
    const withCertifiedSales = items.filter(i => i.salesDataQuality === "SYNCED" && i.soldNet > 0);
    switch (sortBy) {
      case "velocity":
        // velocidad mensual = unidades netas / meses efectivos observados
        // ritmoPromedioVentas is computed server-side as salesTotal6m / 6
        return [...withCertifiedSales].sort((a, b) => (b.ritmoPromedioVentas ?? 0) - (a.ritmoPromedioVentas ?? 0));
      case "value":
        // valor neto vendido 6M
        return [...withCertifiedSales].sort((a, b) => (b.revenue6m ?? 0) - (a.revenue6m ?? 0));
      case "units":
      default:
        // unidades netas vendidas (all time)
        return [...withCertifiedSales].sort((a, b) => b.soldNet - a.soldNet);
    }
  }, [items, sortBy]);

  const GRID = "36px minmax(70px,0.9fr) minmax(100px,1.6fr) 70px 65px 70px 65px 70px minmax(100px,1.2fr) 70px";

  return (
    <div style={{ background: C.white, borderRadius: R.lg, border: `1px solid ${C.line}`, boxShadow: E.sm, overflow: "hidden" }}>
      {/* Identity provenance */}
      <div style={{
        padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
        fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
      }}>
        Universo: ProductEntity.productLine = &quot;5&quot; (LINEA 5, catalogo SAG certificado).
        Ventas vinculadas por referencia (CustomerOrderLine.referenceCode). No se certifica origen de cada unidad vendida.
        Devoluciones y NC restadas de venta neta. Anulados excluidos por el pipeline de CustomerOrderRecord.
      </div>

      {/* Sort controls */}
      <div style={{ display: "flex", gap: S[2], padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.line}`, alignItems: "center" }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, textTransform: "uppercase" as const, letterSpacing: 0.4, marginRight: S[1] }}>
          Ordenar por
        </span>
        {([
          { key: "units" as const, label: "Unidades netas vendidas" },
          { key: "velocity" as const, label: "Velocidad mensual" },
          { key: "value" as const, label: "Valor neto vendido 6M" },
        ]).map(opt => (
          <button
            key={opt.key}
            onClick={() => setSortBy(opt.key)}
            style={{
              fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: sortBy === opt.key ? T.wt.semibold : T.wt.normal,
              padding: `${S[1]}px ${S[3]}px`, border: `1px solid ${sortBy === opt.key ? C.blueDark : C.line}`,
              borderRadius: R.pill, background: sortBy === opt.key ? C.blueLight : C.white,
              color: sortBy === opt.key ? C.blueDark : C.inkMid, cursor: "pointer",
            }}
          >
            {opt.label}
          </button>
        ))}
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginLeft: "auto" }}>
          {sorted.length} referencias con ventas certificadas
        </span>
      </div>

      {/* Velocity definition */}
      {sortBy === "velocity" && (
        <div style={{
          padding: `${S[1]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`,
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
        }}>
          Velocidad mensual = unidades netas vendidas 6M / 6 meses observados.
          Los meses efectivos corresponden al periodo fijo de 6 meses del pipeline de ventas.
        </div>
      )}

      {sorted.length === 0 ? (
        <EmptyRow text="Sin referencias importadas con ventas certificadas" />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: GRID, padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
            {["", "Ref", "Descripcion", "Tamano", "Stock", "Venta 6M", "Ritmo/m", "Valor 6M", "Motivo", "Accion"].map(h => (
              <ColHeader key={h}>{h}</ColHeader>
            ))}
          </div>
          {sorted.slice(0, 80).map((item, i) => {
            const action = CLASSIFICATION_DISPLAY[item.recompraClassification];
            return (
              <button
                key={item.productId}
                onClick={() => onDetail(item)}
                style={rowStyle(i === Math.min(sorted.length, 80) - 1)}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.surfaceAlt; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span style={{ ...cell, display: "grid", gridTemplateColumns: GRID, width: "100%", alignItems: "center" }}>
                  <CommercialReferenceThumbnail imageUrl={item.imageUrl} referenceCode={item.reference} description={item.description} />
                  <span style={{ ...cell, fontWeight: T.wt.semibold, color: C.blueDark }}>{item.reference}</span>
                  <span style={{ ...cell, color: C.inkMid }}>{item.description}</span>
                  <span style={{ ...cell, fontSize: T.sz["2xs"] }}>{item.sizeClass ? SIZE_LABELS[item.sizeClass] : "\u2014"}</span>
                  {(() => { const s = fmtStock(item); return <span style={{ ...cell, color: s.color, fontWeight: s.weight }}>{s.text}</span>; })()}
                  {(() => { const sv = fmtSales6m(item); return <span style={{ ...cell, color: sv.color }}>{sv.text}</span>; })()}
                  <span style={{ ...cell, color: C.inkMid }}>{item.ritmoPromedioVentas !== null ? `${item.ritmoPromedioVentas}` : "\u2014"}</span>
                  <span style={{ ...cell, color: C.inkMid }}>{item.revenue6m > 0 ? fmtCurrency(item.revenue6m) : "\u2014"}</span>
                  <span style={{ ...cell, fontSize: T.sz["2xs"], color: C.inkMid }} title={item.recompraReason}>{item.recompraReason}</span>
                  <span style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.medium,
                    padding: `1px ${S[1]}px`, borderRadius: R.pill,
                    background: action.bg, color: action.fg,
                    whiteSpace: "nowrap" as const, textAlign: "center" as const,
                  }}>
                    {action.label}
                  </span>
                </span>
              </button>
            );
          })}
        </>
      )}
    </div>
  );
}

// ── VIEW 2: Rotacion — BLOCKED ──────────────────────────────────────────────
// Rotation classification requires certified physical receipt from China (SAG-004).
// item.receipts[] are general purchase invoices (C1/C2), NOT China receipts.
// Cannot compute 6/8 calendar month thresholds from uncertified data.

function RotacionBlockedView() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      <SagBlockerBanner
        code="SAG-004"
        title="Ingreso fisico certificado desde China no disponible"
        detail='SAG no expone todavia una fuente reconciliada de ingresos fisicos desde China. La fuente CH (248) tiene cero documentos en LUDISAM. Los recibos disponibles (C1/C2) son facturas de compra generales — no certifican origen China.'
      />

      <div style={{
        background: C.white, borderRadius: R.lg, border: `1px solid ${C.line}`, boxShadow: E.sm,
        overflow: "hidden",
      }}>
        <div style={{ padding: `${S[4]}px ${S[5]}px`, borderBottom: `1px solid ${C.line}` }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.bold, color: C.ink }}>
            Clasificacion de rotacion
          </span>
        </div>

        <div style={{ padding: `${S[4]}px ${S[5]}px`, display: "flex", flexDirection: "column", gap: S[4] }}>
          {/* Revisar rotacion */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: S[3] }}>
            <BlockedBadge label="NO VERIFICABLE" />
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                Revisar rotacion
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginTop: 2 }}>
                Ultimo ingreso fisico certificado alcanzo 6 meses calendario y todavia no alcanzo 8 meses, con disponible &gt; 0.
                Requiere fuente de ingreso fisico desde China para verificar.
              </div>
            </div>
          </div>

          {/* Baja rotacion */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: S[3] }}>
            <BlockedBadge label="NO VERIFICABLE" />
            <div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                Baja rotacion
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginTop: 2 }}>
                Ultimo ingreso fisico certificado alcanzo 8 meses calendario o mas, con disponible &gt; 0.
                Requiere fuente de ingreso fisico desde China para verificar.
              </div>
            </div>
          </div>
        </div>

        <div style={{
          padding: `${S[2]}px ${S[5]}px ${S[3]}px`, borderTop: `1px solid ${C.lineSubtle}`,
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
        }}>
          Cuando SAG-004 se resuelva, la clasificacion usara meses calendario (no dias fijos) con zona horaria Colombia (America/Bogota).
        </div>
      </div>

      <SagBlockerBanner
        code="SAG-016"
        title="Ausencia de FUENTE/origen suficiente en ventas"
        detail="vw_agentik_ventas no tiene columna FUENTE. No es posible particionar ventas netas por origen importado vs. domestico. Las ventas mostradas corresponden al universo de referencias clasificadas como importadas por catalogo SAG (LINEA 5)."
      />
    </div>
  );
}

// ── VIEW 3: Inteligencia ────────────────────────────────────────────────────
// Only certifiable metrics:
// 1. Monthly net sales of references certified as imported — ALLOWED
// 2. Import growth (physical receipts from China) — SOURCE_BLOCKED

function InteligenciaView({ items }: { items: ImportSupplyIntelligenceItem[] }) {
  // Summary metrics (certifiable via identity + reference join)
  const summary = useMemo(() => {
    let totalStock = 0;
    let totalSales6m = 0;
    let totalRevenue6m = 0;
    let refsWithStock = 0;
    let refsWithSales = 0;
    for (const item of items) {
      totalStock += item.remaining;
      totalSales6m += item.salesTotal6m;
      totalRevenue6m += item.revenue6m;
      if (item.remaining > 0) refsWithStock++;
      if (item.salesTotal6m > 0) refsWithSales++;
    }
    return { totalStock, totalSales6m, totalRevenue6m, refsWithStock, refsWithSales, totalRefs: items.length };
  }, [items]);

  // Monthly net sales from items — certifiable because identity is certified
  // and sales join by referenceCode is certified
  // NOTE: we only have salesTotal6m (aggregate), not monthly breakdown at list level.
  // The monthly breakdown exists only in the detail drawer (ImportReferenceDetail.monthlySales).
  // So we show aggregate 6M metrics, not a monthly chart.

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {/* ── Identity provenance ───────────────────────────────────── */}
      <div style={{
        background: C.white, border: `1px solid ${C.line}`, borderRadius: R.lg,
        padding: `${S[3]}px ${S[4]}px`,
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink, marginBottom: S[2] }}>
          Identidad del universo importado
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["FUENTE", "CAMPO", "VALOR", "COBERTURA", "FRESCURA"].map(h => (
                <th key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkMid, textAlign: "left" as const, padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.line}`, textTransform: "uppercase" as const, letterSpacing: 0.4 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <IdentityRow fuente="Catalogo SAG" campo="ProductEntity.productLine" valor='"5" (LINEA 5)' cobertura={`${items.length} refs`} frescura="Sync SAG continuo" />
            <IdentityRow fuente="Inventario SAG" campo="ProductInventoryLevel" valor="B24 (bodegas importacion)" cobertura={`${summary.refsWithStock} refs con stock`} frescura="Sync SAG continuo" />
            <IdentityRow fuente="Ventas SAG" campo="CustomerOrderLine.referenceCode" valor="CODIGO_PRODUCTO" cobertura={`${summary.refsWithSales} refs con ventas`} frescura="6 meses rolling" />
            <IdentityRow fuente="Ingreso China" campo="SAG MOVIMIENTOS CH (248)" valor="CERO documentos" cobertura="0%" frescura="SAG-004 BLOCKED" blocked />
          </tbody>
        </table>
      </div>

      {/* ── Certifiable summary metrics ───────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[3] }}>
        <SummaryCard label="Inventario disponible" value={fmt(summary.totalStock)} sub={`${summary.refsWithStock} refs con stock`} />
        <SummaryCard label="Ventas netas 6M" value={`${fmt(summary.totalSales6m)} und`} sub={`${summary.refsWithSales} refs con ventas`} />
        <SummaryCard label="Facturacion 6M" value={fmtCurrency(summary.totalRevenue6m)} sub={`${summary.totalRefs} refs importadas`} />
      </div>

      {/* ── Crecimiento de importaciones — BLOCKED ────────────────── */}
      <SagBlockerBanner
        code="SAG-004"
        title="Crecimiento de importaciones: SOURCE_BLOCKED"
        detail='SAG no expone todavia una fuente reconciliada de ingresos fisicos desde China. Los recibos C1/C2 son facturas de compra generales — no se grafican como crecimiento de importaciones. No se usa item.receipts[] como proxy de importaciones.'
      />

      <SagBlockerBanner
        code="SAG-003"
        title="Transito y ordenes de importacion abiertas"
        detail="No existe fuente SAG para rastrear ordenes de importacion en transito ni pedidos abiertos a proveedores internacionales."
      />

      <SagBlockerBanner
        code="SAG-016"
        title="Ventas sin columna FUENTE"
        detail="vw_agentik_ventas no tiene columna FUENTE. Las ventas mostradas son el total de referencias clasificadas como importadas (LINEA 5). No se certifica que cada unidad vendida sea de origen importado."
      />

      {/* ── Rulings ───────────────────────────────────────────────── */}
      <div style={{
        background: C.surface, borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`,
        fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
        display: "flex", flexDirection: "column", gap: S[2],
      }}>
        <div>
          <span style={{ fontWeight: T.wt.semibold, color: C.green }}>IMPORTS_SALES_AND_STOCK_PARTIAL_RUNTIME_VERIFIED</span>
          {" "}Inventario y ventas de referencias importadas (LINEA 5) verificados en runtime.
        </div>
        <div>
          <span style={{ fontWeight: T.wt.semibold, color: C.red }}>IMPORT_RECEIPT_SOURCE_BLOCKED</span>
          {" "}Fuente de ingreso fisico desde China no disponible (SAG-004).
        </div>
        <div>
          <span style={{ fontWeight: T.wt.semibold, color: C.red }}>IMPORT_ROTATION_CLASSIFICATION_BLOCKED</span>
          {" "}Clasificacion de rotacion (6/8 meses calendario) no verificable sin ingreso fisico certificado.
        </div>
      </div>
    </div>
  );
}

// ── Identity row for provenance table ───────────────────────────────────────

function IdentityRow({ fuente, campo, valor, cobertura, frescura, blocked }: {
  fuente: string; campo: string; valor: string; cobertura: string; frescura: string; blocked?: boolean;
}) {
  return (
    <tr>
      <td style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>{fuente}</td>
      <td style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>{campo}</td>
      <td style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: blocked ? C.red : C.ink, fontWeight: blocked ? T.wt.bold : T.wt.normal, padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>{valor}</td>
      <td style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>{cobertura}</td>
      <td style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: blocked ? C.red : C.inkMid, fontWeight: blocked ? T.wt.semibold : T.wt.normal, padding: `${S[1]}px ${S[2]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>{frescura}</td>
    </tr>
  );
}

// ── SAG Blocker Banner ──────────────────────────────────────────────────────

function SagBlockerBanner({ code, title, detail }: { code: string; title: string; detail: string }) {
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.line}`, borderRadius: R.lg,
      borderLeft: `4px solid ${C.amber}`,
      padding: `${S[2]}px ${S[4]}px`, display: "flex", alignItems: "flex-start", gap: S[3],
    }}>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
        padding: `1px ${S[2]}px`, borderRadius: R.sm,
        background: C.amberLight, color: C.amber,
        whiteSpace: "nowrap" as const,
      }}>
        {code}
      </span>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
          {title}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginTop: 2 }}>
          {detail}
        </div>
      </div>
    </div>
  );
}

// ── Blocked Badge ───────────────────────────────────────────────────────────

function BlockedBadge({ label }: { label: string }) {
  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
      padding: `2px ${S[2]}px`, borderRadius: R.sm,
      background: C.surface, color: C.red, border: `1px solid ${C.red}20`,
      whiteSpace: "nowrap" as const, flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

// ── Summary Card ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.line}`, borderRadius: R.lg, boxShadow: E.sm,
      padding: `${S[3]}px ${S[4]}px`,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.medium, color: C.inkMid, textTransform: "uppercase" as const, letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink, marginTop: 2 }}>
        {value}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
        {sub}
      </div>
    </div>
  );
}

// ── Detail Drawer ───────────────────────────────────────────────────────────

function ImportDetailDrawer({ item, onClose }: { item: ImportSupplyIntelligenceItem; onClose: () => void }) {
  const classDisplay = CLASSIFICATION_DISPLAY[item.recompraClassification];

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, width: 460, height: "100vh",
      background: C.white, borderLeft: `1px solid ${C.line}`, boxShadow: E.lg,
      zIndex: 50, display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: `${S[4]}px ${S[5]}px`, borderBottom: `1px solid ${C.line}`,
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{item.reference}</div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, marginTop: 2 }}>{item.description}</div>
        </div>
        <button onClick={onClose} style={{
          fontFamily: T.mono, fontSize: T.sz.lg, background: "none", border: "none",
          color: C.inkMid, cursor: "pointer", padding: S[1],
        }}>
          ✕
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: `${S[4]}px ${S[5]}px` }}>
        {/* Classification + Size badge */}
        <div style={{ display: "flex", gap: S[2], marginBottom: S[3], flexWrap: "wrap" }}>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
            padding: `${S[1]}px ${S[3]}px`, borderRadius: R.pill, background: classDisplay.bg, color: classDisplay.fg,
          }}>
            {RECOMPRA_LABELS[item.recompraClassification]}
          </span>
          {item.sizeClass && (
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.medium,
              padding: `${S[1]}px ${S[2]}px`, borderRadius: R.pill, background: C.surface, color: C.inkMid,
            }}>
              {SIZE_LABELS[item.sizeClass] ?? item.sizeClass}
            </span>
          )}
        </div>

        {/* Calibrated reason */}
        <div style={{
          background: classDisplay.bg, border: `1px solid ${classDisplay.fg}20`,
          borderRadius: R.lg, padding: `${S[3]}px ${S[4]}px`, marginBottom: S[4],
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: classDisplay.fg, marginBottom: S[1] }}>
            Motivo
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>
            {item.recompraReason}
          </div>
          {item.repurchaseActionRationale && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginTop: S[2], borderTop: `1px solid ${classDisplay.fg}10`, paddingTop: S[1] }}>
              {item.repurchaseActionRationale}
            </div>
          )}
        </div>

        {/* ── Main info ───────────────────────────────────────────── */}
        <DrawerSection title="Inventario y ventas">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: `${S[2]}px ${S[4]}px` }}>
            <DrawerField
              label="Stock B24"
              value={item.stockDataQuality === "NO_PIL_RECORD" ? "Sin dato" : item.remaining === 0 ? "0" : fmt(item.remaining)}
              highlight={item.stockDataQuality === "NO_PIL_RECORD" ? C.inkFaint : item.remaining <= 20 ? C.red : undefined}
            />
            <DrawerField label="Venta neta" value={item.soldNet > 0 ? fmt(item.soldNet) : "0"} />
            <DrawerField label="Ventas 6M" value={item.salesTotal6m > 0 ? fmt(item.salesTotal6m) : "0"} />
            <DrawerField label="Ritmo/mes" value={item.ritmoPromedioVentas !== null ? `${item.ritmoPromedioVentas}` : "\u2014"} />
            <DrawerField label="Cobertura (dias)" value={item.coberturaPromedioDias !== null ? `${item.coberturaPromedioDias}` : "\u2014"} />
            <DrawerField label="% vendido" value={item.percentSold !== null ? `${item.percentSold}%` : "\u2014"} />
          </div>
        </DrawerSection>

        {/* Prices */}
        <DrawerSection title="Precios">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: `${S[2]}px ${S[4]}px` }}>
            <DrawerField label="PV3 Detal" value={item.pricePV3 !== null ? fmtCurrency(item.pricePV3) : "\u2014"} />
            <DrawerField label="PV4 Mayor." value={item.pricePV4 !== null ? fmtCurrency(item.pricePV4) : "\u2014"} />
            <DrawerField label="Costo" value={item.costo !== null ? fmtCurrency(item.costo) : "\u2014"} />
          </div>
        </DrawerSection>

        {/* Channel */}
        <DrawerSection title="Canal de venta (6M)">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[3] }}>
            <ChannelCard label="Detal" value={item.salesDetal6m} />
            <ChannelCard label="Mayorista" value={item.salesMayorista6m} />
            <ChannelCard label="No determ." value={item.salesNoDet6m} />
          </div>
          {item.channelConfidence > 0 && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginTop: S[2] }}>
              Dominante: {CHANNEL_LABELS[item.dominantChannel]}
            </div>
          )}
        </DrawerSection>

        {/* Revenue */}
        <DrawerSection title="Facturacion">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${S[2]}px ${S[4]}px` }}>
            <DrawerField label="Facturado total" value={item.revenueAll > 0 ? fmtCurrency(item.revenueAll) : "\u2014"} />
            <DrawerField label="Facturado 6M" value={item.revenue6m > 0 ? fmtCurrency(item.revenue6m) : "\u2014"} />
          </div>
        </DrawerSection>

        {/* Receipt history — labeled honestly as purchase invoices, not China imports */}
        {item.receipts && item.receipts.length > 0 && (
          <DrawerSection title="Facturas de compra (C1/C2)">
            <div style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[2],
            }}>
              Fuente: SAG MOVIMIENTOS. Facturas de compra generales — no certifican origen China.
            </div>
            <div style={{ background: C.surface, borderRadius: R.md, border: `1px solid ${C.line}`, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 70px 1fr", padding: `${S[1]}px ${S[3]}px`, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
                {["Fecha", "Doc", "Cant.", "Proveedor"].map(h => (
                  <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkMid, textTransform: "uppercase" as const }}>{h}</span>
                ))}
              </div>
              {item.receipts.map((r, i) => (
                <div key={`${r.documentNumber}-${i}`} style={{
                  display: "grid", gridTemplateColumns: "1fr 80px 70px 1fr",
                  padding: `${S[1]}px ${S[3]}px`,
                  borderBottom: i < item.receipts.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>{r.date}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>{r.fuenteCode}-{r.documentNumber}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>{fmt(r.quantity)}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.providerName ?? "\u2014"}</span>
                </div>
              ))}
            </div>
          </DrawerSection>
        )}

        {/* ── Secondary technical info ──────────────────────────── */}
        <DrawerSection title="Informacion tecnica">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: `${S[2]}px ${S[4]}px` }}>
            <DrawerField label="Stock total" value={item.totalStock > 0 ? fmt(item.totalStock) : "\u2014"} />
            <DrawerField label="Total importado" value={item.totalImported !== null ? fmt(item.totalImported) : "\u2014"} />
            <DrawerField label="Capital inmov." value={item.capitalInmovilizado !== null ? fmtCurrency(item.capitalInmovilizado) : "\u2014"} />
            <DrawerField label="Devoluciones" value={item.returns > 0 ? fmt(item.returns) : "\u2014"} />
            <DrawerField label="Lotes" value={item.batchCount > 0 ? `${item.batchCount}` : "\u2014"} />
            <DrawerField label="Tamano" value={item.sizeClass ? (SIZE_LABELS[item.sizeClass] ?? item.sizeClass) : "\u2014"} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${S[2]}px ${S[4]}px`, marginTop: S[3] }}>
            <DrawerField label="Ultimo ingreso (C1/C2)" value={item.lastInboundDate ?? "\u2014"} />
            <DrawerField label="Fuente fecha" value={inboundSourceLabel(item.lastInboundSource)} />
            <DrawerField label="Dias sin ingreso" value={item.daysSinceLastInbound !== null ? `${item.daysSinceLastInbound}` : "\u2014"} />
            <DrawerField label="Ult. compra SAG" value={item.lastPurchaseSag ?? "\u2014"} />
            <DrawerField label="Ult. venta SAG" value={item.lastSaleSag ?? "\u2014"} />
            <DrawerField label="Creado en SAG" value={item.createdAtSag ?? "\u2014"} />
          </div>
        </DrawerSection>
      </div>
    </div>
  );
}

// ── Shared UI primitives ────────────────────────────────────────────────────

function KpiCard({ label, value, color, active, onClick, unit }: {
  label: string; value: number | null; color?: string; active?: boolean; onClick: () => void;
  unit?: string;
}) {
  const isUnavailable = value === null;

  return (
    <button
      onClick={onClick}
      style={{
        background: active ? C.blueLight : C.white,
        border: `1px solid ${active ? C.blueDark : C.line}`,
        borderRadius: R.lg,
        padding: `${S[3]}px ${S[4]}px`,
        display: "flex", flexDirection: "column" as const, gap: 2,
        cursor: "pointer", textAlign: "left" as const,
        transition: "border-color 120ms, background 120ms",
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = C.blueDark; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = C.line; }}
    >
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.medium, color: C.inkMid, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: isUnavailable ? C.inkFaint : (value > 0 ? (color ?? C.ink) : C.inkFaint) }}>
        {isUnavailable ? "\u2014" : `${value.toLocaleString("es-CO")}${unit ? ` ${unit}` : ""}`}
      </span>
    </button>
  );
}

function BlockedKpiCard({ label, reason, debtCode, onClick }: {
  label: string; reason: string; debtCode: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: C.white, border: `1px solid ${C.line}`, borderRadius: R.lg,
        padding: `${S[3]}px ${S[4]}px`,
        display: "flex", flexDirection: "column" as const, gap: 2,
        cursor: "pointer", textAlign: "left" as const,
        transition: "border-color 120ms, background 120ms",
        opacity: 0.7,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.amber; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.line; }}
    >
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.medium, color: C.inkMid, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.red }}>
        {reason}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber, fontWeight: T.wt.medium }}>
        {debtCode}
      </span>
    </button>
  );
}

function ColHeader({ children }: { children: string }) {
  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
      color: C.inkMid, textTransform: "uppercase" as const, letterSpacing: 0.4,
    }}>
      {children}
    </span>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{ padding: S[6], textAlign: "center" as const, fontFamily: T.mono, fontSize: T.sz.base, color: C.inkFaint }}>
      {text}
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S[4] }}>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        color: C.ink, marginBottom: S[2],
        textTransform: "uppercase" as const, letterSpacing: 0.5,
        borderBottom: `1px solid ${C.lineSubtle}`, paddingBottom: S[1],
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function DrawerField({ label, value, highlight, quality }: {
  label: string; value: string; highlight?: string; quality?: DataQuality;
}) {
  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.semibold, color: highlight ?? C.ink, marginTop: 1 }}>
        {value}
      </div>
      {quality && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: quality === "CONFIRMED" ? C.green : quality === "ESTIMATED" ? C.amber : C.inkFaint, marginTop: 1 }}>
          {quality === "CONFIRMED" ? "Confirmado" : quality === "ESTIMATED" ? "Estimado" : "No disponible"}
        </div>
      )}
    </div>
  );
}

function ChannelCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.md,
      padding: `${S[2]}px ${S[3]}px`, textAlign: "center" as const,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: value > 0 ? C.ink : C.inkFaint, marginTop: 2 }}>
        {value > 0 ? fmt(value) : "\u2014"}
      </div>
    </div>
  );
}

// ── Shared styles ───────────────────────────────────────────────────────────

const cell: React.CSSProperties = {
  fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

function rowStyle(isLast: boolean): React.CSSProperties {
  return {
    display: "block", padding: ROW_PAD, minHeight: 48,
    borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
    background: "transparent", border: "none", cursor: "pointer",
    width: "100%", textAlign: "left" as const, transition: "background 120ms",
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("es-CO");
}

function fmtCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

function fmtStock(item: ImportSupplyIntelligenceItem): { text: string; color: string; weight: number } {
  if (item.stockDataQuality === "NO_PIL_RECORD") {
    return { text: "Sin dato", color: C.inkFaint, weight: T.wt.normal };
  }
  if (item.remaining === 0) {
    return { text: "0", color: C.red, weight: T.wt.bold };
  }
  if (item.remaining <= 20) {
    return { text: fmt(item.remaining), color: C.red, weight: T.wt.bold };
  }
  return { text: fmt(item.remaining), color: C.ink, weight: T.wt.normal };
}

function fmtSales6m(item: ImportSupplyIntelligenceItem): { text: string; color: string } {
  if (item.salesDataQuality === "UNAVAILABLE") {
    return { text: "Sin dato", color: C.inkFaint };
  }
  return { text: item.salesTotal6m > 0 ? fmt(item.salesTotal6m) : "0", color: item.salesTotal6m > 0 ? C.ink : C.inkMid };
}

function inboundSourceLabel(source: string): string {
  switch (source) {
    case "SAG_RECEIPT_C1_C2": return "Factura compra (C1/C2)";
    case "LAST_PURCHASE_SAG": return "Ult. compra SAG";
    case "UNAVAILABLE": return "Sin fecha";
    default: return "\u2014";
  }
}
