/**
 * importaciones-client.tsx
 *
 * Centro de Inteligencia de Abastecimiento — Importaciones.
 * 5 vistas: Prioridades, Recompras, Rotacion, Envejecimiento, Baja rotacion.
 * 6 KPIs ejecutivos. Insignia de salud comercial por referencia.
 *
 * Rules:
 *   - ZERO business calculations in this file
 *   - All classifications and KPIs come from import-intelligence-service.ts
 *   - Only filter/sort/useMemo for presentation
 *
 * Sprint: AGENTIK-IMPORTS-AUDIT-01
 */

"use client";

import React, { useState, useMemo, useCallback } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import type {
  ImportSupplyIntelligenceItem,
  ImportSupplyKpis,
  RepurchaseStatus,
  RepurchaseMotivo,
  SaludComercial,
  Prioridad,
  RecompraClassification,
  DataQuality,
} from "@/lib/comercial/importaciones/import-types";

// ── Props ───────────────────────────────────────────────────────────────────

interface ImportacionesClientProps {
  orgSlug: string;
  items: ImportSupplyIntelligenceItem[];
  kpis: ImportSupplyKpis;
}

// ── Tab type ────────────────────────────────────────────────────────────────

type ViewTab = "prioridades" | "recompras" | "rotacion" | "envejecimiento" | "baja_rotacion";

const VIEW_TABS: { key: ViewTab; label: string }[] = [
  { key: "prioridades", label: "Prioridades" },
  { key: "recompras", label: "Recompras" },
  { key: "rotacion", label: "Rotacion" },
  { key: "envejecimiento", label: "Envejecimiento" },
  { key: "baja_rotacion", label: "Baja rotacion" },
];

// ── Constants ───────────────────────────────────────────────────────────────

const ROW_PAD = `${S[2]}px ${S[3]}px`;

const STATUS_COLORS: Record<RepurchaseStatus, { bg: string; fg: string; label: string }> = {
  RECOMPRAR:     { bg: C.greenLight,  fg: C.green,    label: "Recomprar" },
  VIGILAR:       { bg: C.amberLight,  fg: C.amber,    label: "Vigilar" },
  NO_RECOMPRAR:  { bg: C.surface,     fg: C.inkMid,   label: "No recomprar" },
  SIN_DATOS:     { bg: C.surface,     fg: C.inkFaint, label: "Sin datos" },
};

const SALUD_COLORS: Record<SaludComercial, { bg: string; fg: string; label: string }> = {
  SANA:      { bg: C.greenLight, fg: C.green,    label: "Sana" },
  EN_RIESGO: { bg: C.amberLight, fg: C.amber,    label: "En riesgo" },
  CRITICA:   { bg: "#fef2f2",    fg: C.red,      label: "Critica" },
  SIN_DATOS: { bg: C.surface,    fg: C.inkFaint, label: "Sin datos" },
};

const PRIORIDAD_COLORS: Record<Prioridad, { bg: string; fg: string; label: string }> = {
  ALTA:       { bg: "#fef2f2",    fg: C.red,      label: "Alta" },
  MEDIA:      { bg: C.amberLight, fg: C.amber,    label: "Media" },
  BAJA:       { bg: C.greenLight, fg: C.green,    label: "Baja" },
  SIN_ACCION: { bg: C.surface,    fg: C.inkFaint, label: "Sin accion" },
};

const MOTIVO_LABELS: Record<RepurchaseMotivo, string> = {
  desabastecimiento:   "Desabastecimiento",
  alta_rotacion:       "Alta rotacion",
  exito_historico:     "Exito historico",
  recompra_recurrente: "Recompra recurrente",
  stock_suficiente:    "Stock suficiente",
  baja_rotacion:       "Baja rotacion",
  sin_datos:           "Sin datos",
};

const CHANNEL_LABELS: Record<string, string> = {
  detal: "Detal", mayorista: "Mayorista", equilibrado: "Equilibrado", sin_datos: "\u2014",
};

const ENVEJECIMIENTO_LABELS: Record<string, string> = {
  "0_3M": "0\u20133 meses", "3_6M": "3\u20136 meses", "6_8M": "6\u20138 meses",
  "8_12M": "8\u201312 meses", "12M_PLUS": ">12 meses",
};

const BAJA_ROT_LABELS: Record<string, string> = {
  SOBRESTOCK: "Sobrestock", SIN_MOVIMIENTO: "Sin movimiento", REVISAR_CONTINUIDAD: "Revisar continuidad",
};

// ── Main Component ──────────────────────────────────────────────────────────

export function ImportacionesClient({ orgSlug, items, kpis }: ImportacionesClientProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>("prioridades");
  const [drawerItem, setDrawerItem] = useState<ImportSupplyIntelligenceItem | null>(null);

  const openDrawer = useCallback((item: ImportSupplyIntelligenceItem) => setDrawerItem(item), []);
  const closeDrawer = useCallback(() => setDrawerItem(null), []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[5], padding: `${S[5]}px ${S[6]}px`, paddingBottom: S[12] }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Comercial", href: `/${orgSlug}/comercial/maletas` },
          { label: "Importaciones" },
        ]}
        title="Importaciones"
        subtitle="Centro de inteligencia de abastecimiento — rotacion, inventario y ventas por canal."
      />

      {/* ── KPIs ejecutivos (6) ──────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: S[3] }}>
        <ExecKpi label="Recompra inmediata" value={kpis.recompraInmediata} color={kpis.recompraInmediata > 0 ? C.green : undefined} />
        <ExecKpi label="Alta rotacion" value={kpis.altaRotacion} />
        <ExecKpi label="Baja rotacion" value={kpis.bajaRotacion} color={kpis.bajaRotacion > 0 ? C.amber : undefined} />
        <ExecKpi label="Inventario >8 meses" value={kpis.inventarioMas8Meses} color={kpis.inventarioMas8Meses > 0 ? C.red : undefined} />
        <ExecKpi label="Cobertura prom. (dias)" value={kpis.coberturaPromedioDias} />
        <ExecKpi
          label="Capital inv. lento"
          value={kpis.capitalInventarioLento !== null ? kpis.capitalInventarioLento : null}
          format="currency"
          footnote={kpis.capitalInventarioLentoCobertura < 100 ? `${kpis.capitalInventarioLentoCobertura}% refs con costo` : undefined}
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
      {activeTab === "prioridades" && <PrioridadesView items={items} onDetail={openDrawer} />}
      {activeTab === "recompras" && <RecomprasView items={items} onDetail={openDrawer} />}
      {activeTab === "rotacion" && <RotacionView items={items} onDetail={openDrawer} />}
      {activeTab === "envejecimiento" && <EnvejecimientoView items={items} onDetail={openDrawer} />}
      {activeTab === "baja_rotacion" && <BajaRotacionView items={items} onDetail={openDrawer} />}

      {/* ── Drawer ──────────────────────────────────────────────────── */}
      {drawerItem && <ImportDetailDrawer item={drawerItem} onClose={closeDrawer} />}
    </div>
  );
}

// ── VIEW 0: Prioridades ──────────────────────────────────────────────────────

function PrioridadesView({ items, onDetail }: { items: ImportSupplyIntelligenceItem[]; onDetail: (i: ImportSupplyIntelligenceItem) => void }) {
  const groups = useMemo(() => {
    const alta = items.filter(i => i.prioridad === "ALTA");
    const media = items.filter(i => i.prioridad === "MEDIA");
    const baja = items.filter(i => i.prioridad === "BAJA");
    const sinAccion = items.filter(i => i.prioridad === "SIN_ACCION");
    return [
      { key: "ALTA" as const, items: alta, accent: C.red },
      { key: "MEDIA" as const, items: media, accent: C.amber },
      { key: "BAJA" as const, items: baja, accent: C.green },
      { key: "SIN_ACCION" as const, items: sinAccion, accent: C.inkFaint },
    ];
  }, [items]);

  const GRID = "minmax(80px,1fr) minmax(140px,2fr) 80px 70px 70px minmax(120px,1.5fr) 80px 80px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {groups.map(group => (
        <CollapsibleSection key={group.key} title={PRIORIDAD_COLORS[group.key].label} count={group.items.length} accent={group.accent} defaultOpen={group.key === "ALTA" || group.key === "MEDIA"}>
          {group.items.length === 0 ? (
            <EmptyRow text={`Sin referencias con prioridad ${PRIORIDAD_COLORS[group.key].label.toLowerCase()}`} />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: GRID, padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
                {["Ref", "Descripcion", "Restante", "Ventas 6M", "Dias inv.", "Razon", "Salud", "Estado"].map(h => (
                  <ColHeader key={h}>{h}</ColHeader>
                ))}
              </div>
              {group.items.map((item, i) => (
                <button
                  key={item.productId}
                  onClick={() => onDetail(item)}
                  style={rowStyle(i === group.items.length - 1)}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.surfaceAlt; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ ...cell, display: "grid", gridTemplateColumns: GRID, width: "100%", alignItems: "center" }}>
                    <span style={{ ...cell, fontWeight: T.wt.semibold, color: C.blueDark }}>{item.reference}</span>
                    <span style={{ ...cell, color: C.inkMid }}>{item.description}</span>
                    <span style={{ ...cell, color: item.remaining <= 20 ? C.red : C.ink, fontWeight: item.remaining <= 20 ? T.wt.bold : T.wt.normal }}>
                      {item.remaining > 0 ? fmt(item.remaining) : "\u2014"}
                    </span>
                    <span style={{ ...cell }}>{item.salesTotal6m > 0 ? fmt(item.salesTotal6m) : "\u2014"}</span>
                    <span style={{ ...cell, color: C.inkMid }}>{item.daysSinceLastEntry !== null ? item.daysSinceLastEntry : "\u2014"}</span>
                    <span style={{ ...cell, fontSize: T.sz["2xs"], color: C.inkMid }}>{item.prioridadRazon}</span>
                    <SaludChip salud={item.saludComercial} />
                    <StatusChip status={item.repurchaseStatus} />
                  </span>
                </button>
              ))}
            </>
          )}
        </CollapsibleSection>
      ))}
    </div>
  );
}

// ── VIEW 1: Recompras ────────────────────────────────────────────────────────

function RecomprasView({ items, onDetail }: { items: ImportSupplyIntelligenceItem[]; onDetail: (i: ImportSupplyIntelligenceItem) => void }) {
  const groups = useMemo(() => {
    const classifications: RecompraClassification[] = ["INMEDIATA", "VIGILAR", "NO_RECOMPRAR", "SIN_DATOS"];
    return classifications.map(cls => ({
      key: cls,
      items: items.filter(i => i.recompraClassification === cls),
    }));
  }, [items]);

  const accents: Record<RecompraClassification, string> = {
    INMEDIATA: C.green, VIGILAR: C.amber, NO_RECOMPRAR: C.inkMid, SIN_DATOS: C.inkFaint,
  };
  const labels: Record<RecompraClassification, string> = {
    INMEDIATA: "Recompra inmediata", VIGILAR: "Vigilar", NO_RECOMPRAR: "No recomprar", SIN_DATOS: "Sin datos",
  };

  const GRID = "minmax(80px,1fr) minmax(120px,1.8fr) 70px 65px 65px 80px minmax(130px,1.5fr) 80px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {groups.map(group => (
        <CollapsibleSection key={group.key} title={labels[group.key]} count={group.items.length} accent={accents[group.key]} defaultOpen={group.key === "INMEDIATA"}>
          {group.items.length === 0 ? (
            <EmptyRow text={`Sin referencias en "${labels[group.key]}"`} />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: GRID, padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
                {["Ref", "Descripcion", "Restante", "Ventas 6M", "Detal 6M", "Canal", "Motivo", "Salud"].map(h => (
                  <ColHeader key={h}>{h}</ColHeader>
                ))}
              </div>
              {group.items.map((item, i) => (
                <button
                  key={item.productId}
                  onClick={() => onDetail(item)}
                  style={rowStyle(i === group.items.length - 1)}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.surfaceAlt; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ ...cell, display: "grid", gridTemplateColumns: GRID, width: "100%", alignItems: "center" }}>
                    <span style={{ ...cell, fontWeight: T.wt.semibold, color: C.blueDark }}>{item.reference}</span>
                    <span style={{ ...cell, color: C.inkMid }}>{item.description}</span>
                    <span style={{ ...cell, color: item.remaining <= 20 ? C.red : C.ink, fontWeight: item.remaining <= 20 ? T.wt.bold : T.wt.normal }}>
                      {item.remaining > 0 ? fmt(item.remaining) : "\u2014"}
                    </span>
                    <span style={{ ...cell }}>{item.salesTotal6m > 0 ? fmt(item.salesTotal6m) : "\u2014"}</span>
                    <span style={{ ...cell }}>{item.salesDetal6m > 0 ? fmt(item.salesDetal6m) : "\u2014"}</span>
                    <span style={{ ...cell, fontSize: T.sz["2xs"] }}>{CHANNEL_LABELS[item.dominantChannel]}</span>
                    <span style={{ ...cell, fontSize: T.sz["2xs"], color: C.inkMid }}>{MOTIVO_LABELS[item.repurchaseMotivo]}</span>
                    <SaludChip salud={item.saludComercial} />
                  </span>
                </button>
              ))}
            </>
          )}
        </CollapsibleSection>
      ))}
    </div>
  );
}

// ── VIEW 2: Rotacion ─────────────────────────────────────────────────────────

function RotacionView({ items, onDetail }: { items: ImportSupplyIntelligenceItem[]; onDetail: (i: ImportSupplyIntelligenceItem) => void }) {
  const [sortBy, setSortBy] = useState<"volume" | "speed">("volume");

  const sorted = useMemo(() => {
    const withSales = items.filter(i => i.soldNet > 0 || i.salesTotal6m > 0);
    if (sortBy === "speed") {
      return [...withSales].sort((a, b) => (b.ritmoPromedioVentas ?? 0) - (a.ritmoPromedioVentas ?? 0));
    }
    return [...withSales].sort((a, b) => b.soldNet - a.soldNet);
  }, [items, sortBy]);

  const GRID = "40px minmax(80px,1fr) minmax(120px,1.8fr) 80px 80px 80px 80px 80px 80px";

  return (
    <div style={{ background: C.white, borderRadius: R.lg, border: `1px solid ${C.line}`, boxShadow: E.sm, overflow: "hidden" }}>
      {/* Sort tabs */}
      <div style={{ display: "flex", gap: S[2], padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.line}` }}>
        {(["volume", "speed"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSortBy(tab)}
            style={{
              fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: sortBy === tab ? T.wt.semibold : T.wt.normal,
              padding: `${S[1]}px ${S[3]}px`, border: `1px solid ${sortBy === tab ? C.blueDark : C.line}`,
              borderRadius: R.pill, background: sortBy === tab ? C.blueLight : C.white,
              color: sortBy === tab ? C.blueDark : C.inkMid, cursor: "pointer",
            }}
          >
            {tab === "volume" ? "Mas vendidas (volumen)" : "Mas rapidas (ritmo 6M)"}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <EmptyRow text="Sin referencias con ventas registradas" />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: GRID, padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
            {["#", "Ref", "Descripcion", "Venta neta", "Ventas 6M", "Ritmo/mes", "Restante", "Canal", "Salud"].map(h => (
              <ColHeader key={h}>{h}</ColHeader>
            ))}
          </div>
          {sorted.slice(0, 50).map((item, i) => (
            <button
              key={item.productId}
              onClick={() => onDetail(item)}
              style={rowStyle(i === Math.min(sorted.length, 50) - 1)}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.surfaceAlt; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{ ...cell, display: "grid", gridTemplateColumns: GRID, width: "100%", alignItems: "center" }}>
                <span style={{ ...cell, color: C.inkFaint, fontSize: T.sz["2xs"] }}>{i + 1}</span>
                <span style={{ ...cell, fontWeight: T.wt.semibold, color: C.blueDark }}>{item.reference}</span>
                <span style={{ ...cell, color: C.inkMid }}>{item.description}</span>
                <span style={{ ...cell, fontWeight: T.wt.bold }}>{item.soldNet > 0 ? fmt(item.soldNet) : "\u2014"}</span>
                <span style={{ ...cell }}>{item.salesTotal6m > 0 ? fmt(item.salesTotal6m) : "\u2014"}</span>
                <span style={{ ...cell, color: C.inkMid }}>{item.ritmoPromedioVentas !== null ? `${item.ritmoPromedioVentas}/m` : "\u2014"}</span>
                <span style={{ ...cell, color: item.remaining <= 20 ? C.red : C.ink }}>{item.remaining > 0 ? fmt(item.remaining) : "\u2014"}</span>
                <span style={{ ...cell, fontSize: T.sz["2xs"] }}>{CHANNEL_LABELS[item.dominantChannel]}</span>
                <SaludChip salud={item.saludComercial} />
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// ── VIEW 3: Envejecimiento ───────────────────────────────────────────────────

function EnvejecimientoView({ items, onDetail }: { items: ImportSupplyIntelligenceItem[]; onDetail: (i: ImportSupplyIntelligenceItem) => void }) {
  const bands = useMemo(() => {
    const order: Array<{ key: string; accent: string }> = [
      { key: "0_3M", accent: C.green },
      { key: "3_6M", accent: C.blueDark },
      { key: "6_8M", accent: C.amber },
      { key: "8_12M", accent: C.red },
      { key: "12M_PLUS", accent: "#7c3aed" },
    ];
    return order.map(b => ({
      ...b,
      items: items.filter(i => i.envejecimientoClassification === b.key),
    }));
  }, [items]);

  const GRID = "minmax(80px,1fr) minmax(120px,1.8fr) 80px 70px 70px 80px 80px 80px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {bands.map(band => (
        <CollapsibleSection
          key={band.key}
          title={ENVEJECIMIENTO_LABELS[band.key]}
          count={band.items.length}
          accent={band.accent}
          defaultOpen={band.key === "8_12M" || band.key === "12M_PLUS"}
        >
          {band.items.length === 0 ? (
            <EmptyRow text={`Sin referencias en banda ${ENVEJECIMIENTO_LABELS[band.key]}`} />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: GRID, padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
                {["Ref", "Descripcion", "Restante", "Ventas 6M", "Dias inv.", "Aging", "Canal", "Salud"].map(h => (
                  <ColHeader key={h}>{h}</ColHeader>
                ))}
              </div>
              {band.items.map((item, i) => (
                <button
                  key={item.productId}
                  onClick={() => onDetail(item)}
                  style={rowStyle(i === band.items.length - 1)}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.surfaceAlt; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <span style={{ ...cell, display: "grid", gridTemplateColumns: GRID, width: "100%", alignItems: "center" }}>
                    <span style={{ ...cell, fontWeight: T.wt.semibold, color: C.blueDark }}>{item.reference}</span>
                    <span style={{ ...cell, color: C.inkMid }}>{item.description}</span>
                    <span style={{ ...cell }}>{item.remaining > 0 ? fmt(item.remaining) : "\u2014"}</span>
                    <span style={{ ...cell }}>{item.salesTotal6m > 0 ? fmt(item.salesTotal6m) : "\u2014"}</span>
                    <span style={{ ...cell, color: C.inkMid }}>{item.daysSinceLastEntry !== null ? item.daysSinceLastEntry : "\u2014"}</span>
                    <AgingChip status={item.agingStatus} />
                    <span style={{ ...cell, fontSize: T.sz["2xs"] }}>{CHANNEL_LABELS[item.dominantChannel]}</span>
                    <SaludChip salud={item.saludComercial} />
                  </span>
                </button>
              ))}
            </>
          )}
        </CollapsibleSection>
      ))}
    </div>
  );
}

// ── VIEW 4: Baja rotacion ────────────────────────────────────────────────────

function BajaRotacionView({ items, onDetail }: { items: ImportSupplyIntelligenceItem[]; onDetail: (i: ImportSupplyIntelligenceItem) => void }) {
  const groups = useMemo(() => {
    const classifications = ["SIN_MOVIMIENTO", "SOBRESTOCK", "REVISAR_CONTINUIDAD"] as const;
    return classifications.map(cls => ({
      key: cls,
      items: items.filter(i => i.bajaRotacionClassification === cls),
    }));
  }, [items]);

  const accents: Record<string, string> = {
    SIN_MOVIMIENTO: C.red, SOBRESTOCK: C.amber, REVISAR_CONTINUIDAD: C.inkMid,
  };

  const GRID = "minmax(80px,1fr) minmax(120px,1.8fr) 80px 70px 70px 80px 80px";

  const totalBajaRotacion = groups.reduce((s, g) => s + g.items.length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {totalBajaRotacion === 0 ? (
        <div style={{ background: C.white, borderRadius: R.lg, border: `1px solid ${C.line}`, boxShadow: E.sm }}>
          <EmptyRow text="Sin referencias con baja rotacion identificada" />
        </div>
      ) : (
        groups.map(group => group.items.length > 0 && (
          <CollapsibleSection key={group.key} title={BAJA_ROT_LABELS[group.key]} count={group.items.length} accent={accents[group.key]} defaultOpen>
            <div style={{ display: "grid", gridTemplateColumns: GRID, padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
              {["Ref", "Descripcion", "Restante", "Ventas 6M", "Dias inv.", "Aging", "Salud"].map(h => (
                <ColHeader key={h}>{h}</ColHeader>
              ))}
            </div>
            {group.items.map((item, i) => (
              <button
                key={item.productId}
                onClick={() => onDetail(item)}
                style={rowStyle(i === group.items.length - 1)}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.surfaceAlt; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span style={{ ...cell, display: "grid", gridTemplateColumns: GRID, width: "100%", alignItems: "center" }}>
                  <span style={{ ...cell, fontWeight: T.wt.semibold, color: C.blueDark }}>{item.reference}</span>
                  <span style={{ ...cell, color: C.inkMid }}>{item.description}</span>
                  <span style={{ ...cell }}>{item.remaining > 0 ? fmt(item.remaining) : "\u2014"}</span>
                  <span style={{ ...cell }}>{item.salesTotal6m > 0 ? fmt(item.salesTotal6m) : "\u2014"}</span>
                  <span style={{ ...cell, color: C.inkMid }}>{item.daysSinceLastEntry !== null ? item.daysSinceLastEntry : "\u2014"}</span>
                  <AgingChip status={item.agingStatus} />
                  <SaludChip salud={item.saludComercial} />
                </span>
              </button>
            ))}
          </CollapsibleSection>
        ))
      )}
    </div>
  );
}

// ── Detail Drawer ───────────────────────────────────────────────────────────

function ImportDetailDrawer({ item, onClose }: { item: ImportSupplyIntelligenceItem; onClose: () => void }) {
  const status = STATUS_COLORS[item.repurchaseStatus];
  const salud = SALUD_COLORS[item.saludComercial];

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
        {/* Badges */}
        <div style={{ display: "flex", gap: S[2], marginBottom: S[3], flexWrap: "wrap" }}>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
            padding: `${S[1]}px ${S[3]}px`, borderRadius: R.pill, background: salud.bg, color: salud.fg,
          }}>
            {salud.label}
          </span>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
            padding: `${S[1]}px ${S[3]}px`, borderRadius: R.pill, background: status.bg, color: status.fg,
          }}>
            {status.label}
          </span>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.medium,
            padding: `${S[1]}px ${S[3]}px`, borderRadius: R.pill, background: C.surface, color: C.inkMid,
          }}>
            {MOTIVO_LABELS[item.repurchaseMotivo]}
          </span>
        </div>

        {/* Salud explanation */}
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid,
          marginBottom: S[4], padding: `${S[2]}px ${S[3]}px`,
          background: C.surface, borderRadius: R.md, borderLeft: `3px solid ${salud.fg}`,
        }}>
          {item.saludComercialRazon}
        </div>

        {/* Repurchase rationale (if available) */}
        {item.repurchaseActionRationale && (
          <div style={{
            background: status.bg, border: `1px solid ${status.fg}20`,
            borderRadius: R.lg, padding: `${S[3]}px ${S[4]}px`, marginBottom: S[4],
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: status.fg, marginBottom: S[1] }}>
              Recomendacion
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>
              {item.repurchaseRecommendedAction}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginTop: S[1] }}>
              {item.repurchaseActionRationale}
            </div>
          </div>
        )}

        {/* Prices */}
        <DrawerSection title="Precios">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: `${S[2]}px ${S[4]}px` }}>
            <DrawerField label="PV3 Detal" value={item.pricePV3 !== null ? fmtCurrency(item.pricePV3) : "\u2014"} />
            <DrawerField label="PV4 Mayor." value={item.pricePV4 !== null ? fmtCurrency(item.pricePV4) : "\u2014"} />
            <DrawerField label="Costo" value={item.costo !== null ? fmtCurrency(item.costo) : "\u2014"} />
          </div>
        </DrawerSection>

        {/* Inventory & metrics */}
        <DrawerSection title="Inventario y metricas">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: `${S[2]}px ${S[4]}px` }}>
            <DrawerField label="Stock B24" value={item.remaining > 0 ? fmt(item.remaining) : "\u2014"} highlight={item.remaining <= 20 && item.remaining > 0 ? C.red : undefined} />
            <DrawerField label="Stock total" value={item.totalStock > 0 ? fmt(item.totalStock) : "\u2014"} />
            <DrawerField label="Total importado" value={item.totalImported !== null ? fmt(item.totalImported) : "\u2014"} quality={item.totalImportedQuality} />
            <DrawerField label="Venta neta" value={item.soldNet > 0 ? fmt(item.soldNet) : "\u2014"} />
            <DrawerField label="Devoluciones" value={item.returns > 0 ? fmt(item.returns) : "\u2014"} />
            <DrawerField label="% vendido" value={item.percentSold !== null ? `${item.percentSold}%` : "\u2014"} />
            <DrawerField label="Ritmo/mes" value={item.ritmoPromedioVentas !== null ? `${item.ritmoPromedioVentas}` : "\u2014"} />
            <DrawerField label="Cobertura (dias)" value={item.coberturaPromedioDias !== null ? `${item.coberturaPromedioDias}` : "\u2014"} />
            <DrawerField label="Capital inmov." value={item.capitalInmovilizado !== null ? fmtCurrency(item.capitalInmovilizado) : "\u2014"} />
          </div>
        </DrawerSection>

        {/* Dates */}
        <DrawerSection title="Fechas de ingreso">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: `${S[2]}px ${S[4]}px` }}>
            <DrawerField label="Primera entrada" value={item.entryDate ?? "\u2014"} quality={item.entryDateQuality} />
            <DrawerField label="Ultima entrada" value={item.lastEntryDate ?? "\u2014"} />
            <DrawerField label="Dias sin ingreso" value={item.daysSinceLastEntry !== null ? `${item.daysSinceLastEntry}` : "\u2014"} />
            <DrawerField label="Lotes" value={item.batchCount > 0 ? `${item.batchCount}` : "\u2014"} />
            <DrawerField label="Aging" value={item.agingStatus.replace("_", " ")} />
            <DrawerField label="Lifecycle" value={item.lifecycleState.replace("_", " ")} />
          </div>
        </DrawerSection>

        {/* Revenue */}
        <DrawerSection title="Valor monetario">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${S[2]}px ${S[4]}px` }}>
            <DrawerField label="Facturado total" value={item.revenueAll > 0 ? fmtCurrency(item.revenueAll) : "\u2014"} />
            <DrawerField label="Facturado 6M" value={item.revenue6m > 0 ? fmtCurrency(item.revenue6m) : "\u2014"} />
            <DrawerField label="Detal 6M" value={item.revenueDetal6m > 0 ? fmtCurrency(item.revenueDetal6m) : "\u2014"} />
            <DrawerField label="Mayor. 6M" value={item.revenueMayorista6m > 0 ? fmtCurrency(item.revenueMayorista6m) : "\u2014"} />
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
              Confianza canal: {Math.round(item.channelConfidence * 100)}% | Dominante: {CHANNEL_LABELS[item.dominantChannel]}
            </div>
          )}
        </DrawerSection>

        {/* Receipt history */}
        {item.receipts && item.receipts.length > 0 && (
          <DrawerSection title="Historial de ingresos">
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
      </div>
    </div>
  );
}

// ── Shared UI primitives ────────────────────────────────────────────────────

function ExecKpi({ label, value, color, format, footnote }: {
  label: string; value: number | null; color?: string; format?: "currency"; footnote?: string;
}) {
  const displayValue = value !== null
    ? format === "currency" ? fmtCurrency(value) : value.toLocaleString("es-CO")
    : "\u2014";

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.line}`, borderRadius: R.lg,
      padding: `${S[3]}px ${S[4]}px`, display: "flex", flexDirection: "column" as const, gap: 2,
    }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.medium, color: C.inkMid, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: value !== null ? (color ?? C.ink) : C.inkFaint }}>
        {displayValue}
      </span>
      {footnote && (
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberMid }}>{footnote}</span>
      )}
    </div>
  );
}

function CollapsibleSection({ title, count, accent, defaultOpen = false, children }: {
  title: string; count: number; accent: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{ background: C.white, borderRadius: R.lg, border: `1px solid ${C.line}`, boxShadow: E.sm, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: `${S[3]}px ${S[4]}px`, borderBottom: open ? `1px solid ${C.line}` : "none",
          display: "flex", alignItems: "center", gap: S[3],
          width: "100%", background: "transparent", border: "none", cursor: "pointer",
          textAlign: "left" as const,
        }}
      >
        <span style={{
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid,
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 150ms", display: "inline-block", width: 16, textAlign: "center" as const,
        }}>
          ▸
        </span>
        <div style={{ width: 4, height: 20, borderRadius: 2, background: accent }} />
        <span style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.bold, color: C.ink }}>{title}</span>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          padding: `1px ${S[2]}px`, borderRadius: R.pill, background: C.surface, color: C.inkMid,
        }}>
          {count}
        </span>
      </button>
      {open && children}
    </div>
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

function StatusChip({ status }: { status: RepurchaseStatus }) {
  const s = STATUS_COLORS[status];
  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
      padding: `2px ${S[2]}px`, borderRadius: R.pill, background: s.bg, color: s.fg,
      textAlign: "center" as const, whiteSpace: "nowrap" as const,
    }}>
      {s.label}
    </span>
  );
}

function SaludChip({ salud }: { salud: SaludComercial }) {
  const s = SALUD_COLORS[salud];
  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
      padding: `2px ${S[2]}px`, borderRadius: R.pill, background: s.bg, color: s.fg,
      textAlign: "center" as const, whiteSpace: "nowrap" as const,
    }}>
      {s.label}
    </span>
  );
}

function AgingChip({ status }: { status: string }) {
  const AGING_COLORS: Record<string, { bg: string; fg: string }> = {
    NEW: { bg: C.greenLight, fg: C.green },
    NORMAL: { bg: C.blueLight, fg: C.blueDark },
    AGING: { bg: C.amberLight, fg: C.amber },
    LOW_ROTATION: { bg: "#fef2f2", fg: C.red },
    OBSOLETE_CANDIDATE: { bg: "#fef2f2", fg: C.red },
  };
  const s = AGING_COLORS[status] ?? { bg: C.surface, fg: C.inkFaint };
  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
      padding: `2px ${S[2]}px`, borderRadius: R.pill, background: s.bg, color: s.fg,
      textAlign: "center" as const, whiteSpace: "nowrap" as const,
    }}>
      {status.replace("_", " ")}
    </span>
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
