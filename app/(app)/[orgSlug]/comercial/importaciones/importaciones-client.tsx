/**
 * importaciones-client.tsx
 *
 * Importaciones — 3 vistas simplificadas para decision comercial.
 * Tabs: Recompras, Rotacion, Inventario lento.
 * 4 KPIs clickables que navegan a la vista correspondiente.
 *
 * Rules:
 *   - ZERO business calculations in this file
 *   - All classifications and KPIs come from import-intelligence-service.ts
 *   - Only filter/sort/useMemo for presentation
 *
 * Sprint: AGENTIK-IMPORTS-SIMPLIFICATION-01
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

type ViewTab = "recompras" | "rotacion" | "inventario_lento";

const VIEW_TABS: { key: ViewTab; label: string }[] = [
  { key: "recompras", label: "Recompras" },
  { key: "rotacion", label: "Rotacion" },
  { key: "inventario_lento", label: "Inventario lento" },
];

// ── Constants ───────────────────────────────────────────────────────────────

const ROW_PAD = `${S[2]}px ${S[3]}px`;

const RECOMPRA_LABELS: Record<RecompraClassification, string> = {
  INMEDIATA: "Comprar ahora",
  VIGILAR: "Revisar recompra",
  NO_RECOMPRAR: "No recomprar",
  SIN_DATOS: "Sin informacion suficiente",
};

const RECOMPRA_ACCENTS: Record<RecompraClassification, string> = {
  INMEDIATA: C.green, VIGILAR: C.amber, NO_RECOMPRAR: C.inkMid, SIN_DATOS: C.inkFaint,
};

const CLASSIFICATION_DISPLAY: Record<RecompraClassification, { bg: string; fg: string; label: string }> = {
  INMEDIATA:    { bg: C.greenLight,  fg: C.green,    label: "Comprar" },
  VIGILAR:      { bg: C.amberLight,  fg: C.amber,    label: "Revisar" },
  NO_RECOMPRAR: { bg: C.surface,     fg: C.inkMid,   label: "No comprar" },
  SIN_DATOS:    { bg: C.surface,     fg: C.inkFaint, label: "Verificar" },
};

const SIZE_ORDER: (ImportSizeClass | null)[] = ["PEQUENO", "MEDIANO", "GRANDE", null];
const SIZE_GROUP_LABELS: Record<string, string> = {
  PEQUENO: "Pequenos", MEDIANO: "Medianos", GRANDE: "Grandes", SIN_CLASIFICAR: "Sin clasificar",
};

const CHANNEL_LABELS: Record<string, string> = {
  detal: "Detal", mayorista: "Mayorista", equilibrado: "Equilibrado", sin_datos: "\u2014",
};

const SIZE_LABELS: Record<string, string> = {
  PEQUENO: "Pequenos", MEDIANO: "Medianos", GRANDE: "Grandes",
};

// ── Main Component ──────────────────────────────────────────────────────────

export function ImportacionesClient({ orgSlug, items, kpis }: ImportacionesClientProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>("recompras");
  const [drawerItem, setDrawerItem] = useState<ImportSupplyIntelligenceItem | null>(null);
  const [focusRecompra, setFocusRecompra] = useState<RecompraClassification | null>(null);

  const openDrawer = useCallback((item: ImportSupplyIntelligenceItem) => setDrawerItem(item), []);
  const closeDrawer = useCallback(() => setDrawerItem(null), []);

  const navigateTo = useCallback((tab: ViewTab, focus?: RecompraClassification) => {
    setActiveTab(tab);
    setFocusRecompra(focus ?? null);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[5], padding: `${S[5]}px ${S[6]}px`, paddingBottom: S[12] }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Comercial", href: `/${orgSlug}/comercial/maletas` },
          { label: "Importaciones" },
        ]}
        title="Importaciones"
        subtitle={`${kpis.totalRefs} referencias importadas`}
      />

      {/* ── KPIs clickables (4) ─────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[3] }}>
        <ClickableKpi
          label="Comprar ahora"
          value={kpis.comprarAhora}
          color={kpis.comprarAhora > 0 ? C.green : undefined}
          active={activeTab === "recompras" && focusRecompra === "INMEDIATA"}
          onClick={() => navigateTo("recompras", "INMEDIATA")}
        />
        <ClickableKpi
          label="Revisar recompra"
          value={kpis.revisarRecompra}
          color={kpis.revisarRecompra > 0 ? C.amber : undefined}
          active={activeTab === "recompras" && focusRecompra === "VIGILAR"}
          onClick={() => navigateTo("recompras", "VIGILAR")}
        />
        <ClickableKpi
          label="No recomprar"
          value={kpis.noRecomprar}
          active={activeTab === "recompras" && focusRecompra === "NO_RECOMPRAR"}
          onClick={() => navigateTo("recompras", "NO_RECOMPRAR")}
        />
        <ClickableKpi
          label="Inventario lento"
          value={kpis.inventarioLento}
          color={kpis.inventarioLento > 0 ? C.red : undefined}
          active={activeTab === "inventario_lento"}
          onClick={() => navigateTo("inventario_lento")}
        />
      </div>

      {/* ── View tabs ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: S[1], borderBottom: `1px solid ${C.line}`, paddingBottom: 0 }}>
        {VIEW_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setFocusRecompra(null); }}
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
      {activeTab === "recompras" && <RecomprasView items={items} onDetail={openDrawer} focusGroup={focusRecompra} />}
      {activeTab === "rotacion" && <RotacionView items={items} onDetail={openDrawer} />}
      {activeTab === "inventario_lento" && <InventarioLentoView items={items} onDetail={openDrawer} />}

      {/* ── Drawer ──────────────────────────────────────────────────── */}
      {drawerItem && <ImportDetailDrawer item={drawerItem} onClose={closeDrawer} />}
    </div>
  );
}

// ── VIEW 1: Recompras (two-level collapsible) ────────────────────────────────

function RecomprasView({ items, onDetail, focusGroup }: {
  items: ImportSupplyIntelligenceItem[];
  onDetail: (i: ImportSupplyIntelligenceItem) => void;
  focusGroup: RecompraClassification | null;
}) {
  const groups = useMemo(() => {
    const classifications: RecompraClassification[] = ["INMEDIATA", "VIGILAR", "NO_RECOMPRAR", "SIN_DATOS"];
    return classifications.map(cls => {
      const classItems = items.filter(i => i.recompraClassification === cls);
      // Always show all 4 size groups (even if 0) for navigation clarity
      const sizeGroups = SIZE_ORDER.map(size => ({
        key: size ?? "SIN_CLASIFICAR",
        label: SIZE_GROUP_LABELS[size ?? "SIN_CLASIFICAR"],
        items: classItems.filter(i => i.sizeClass === size),
      }));
      return { key: cls, items: classItems, sizeGroups };
    });
  }, [items]);

  const GRID = "36px minmax(70px,0.9fr) minmax(90px,1.4fr) 60px 55px 60px 55px 55px minmax(120px,1.3fr) 60px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {groups.map(group => (
        <CollapsibleSection
          key={group.key}
          title={RECOMPRA_LABELS[group.key]}
          count={group.items.length}
          accent={RECOMPRA_ACCENTS[group.key]}
          defaultOpen={false}
          highlight={focusGroup === group.key}
        >
          {group.items.length === 0 ? (
            <EmptyRow text={`Sin referencias en "${RECOMPRA_LABELS[group.key]}"`} />
          ) : (
            <SizeGroupList
              sizeGroups={group.sizeGroups}
              classKey={group.key}
              grid={GRID}
              onDetail={onDetail}
            />
          )}
        </CollapsibleSection>
      ))}
    </div>
  );
}

/** Second-level collapsible: size groups within a classification */
function SizeGroupList({ sizeGroups, classKey, grid, onDetail }: {
  sizeGroups: { key: string; label: string; items: ImportSupplyIntelligenceItem[] }[];
  classKey: RecompraClassification;
  grid: string;
  onDetail: (i: ImportSupplyIntelligenceItem) => void;
}) {
  const [openSize, setOpenSize] = useState<string | null>(null);

  const toggleSize = useCallback((key: string) => {
    setOpenSize(prev => prev === key ? null : key);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {sizeGroups.map((sg, idx) => {
        const isOpen = openSize === sg.key;
        const isEmpty = sg.items.length === 0;
        const isLast = idx === sizeGroups.length - 1;
        const action = CLASSIFICATION_DISPLAY[classKey];

        return (
          <div key={sg.key}>
            {/* Size group header */}
            <button
              onClick={() => { if (!isEmpty) toggleSize(sg.key); }}
              style={{
                display: "flex", alignItems: "center", gap: S[2],
                width: "100%", padding: `${S[2]}px ${S[5]}px`,
                background: isOpen ? C.surfaceAlt : "transparent",
                border: "none", borderBottom: isLast && !isOpen ? "none" : `1px solid ${C.lineSubtle}`,
                cursor: isEmpty ? "default" : "pointer",
                textAlign: "left" as const, transition: "background 120ms",
                opacity: isEmpty ? 0.5 : 1,
              }}
              onMouseEnter={e => { if (!isEmpty && !isOpen) (e.currentTarget as HTMLElement).style.background = C.surface; }}
              onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], color: isEmpty ? C.inkFaint : C.inkMid,
                transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 150ms", display: "inline-block", width: 14, textAlign: "center" as const,
              }}>
                {isEmpty ? "" : "\u25B8"}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: isEmpty ? C.inkFaint : C.ink }}>
                {sg.label}
              </span>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.medium,
                padding: `0px ${S[2]}px`, borderRadius: R.pill,
                background: isEmpty ? "transparent" : C.surface, color: isEmpty ? C.inkFaint : C.inkMid,
              }}>
                {sg.items.length}
              </span>
            </button>

            {/* Table — only rendered when size group is open */}
            {isOpen && (
              <div style={{ borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}` }}>
                <div style={{ display: "grid", gridTemplateColumns: grid, padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
                  {["", "Ref", "Descripcion", "Tamano", "Stock", "Venta 6M", "Ritmo/m", "Cobert.", "Motivo", "Accion"].map(h => (
                    <ColHeader key={h}>{h}</ColHeader>
                  ))}
                </div>
                {sg.items.map((item, i) => (
                  <button
                    key={item.productId}
                    onClick={() => onDetail(item)}
                    style={rowStyle(i === sg.items.length - 1)}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.surfaceAlt; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <span style={{ ...cell, display: "grid", gridTemplateColumns: grid, width: "100%", alignItems: "center" }}>
                      <CommercialReferenceThumbnail imageUrl={item.imageUrl} reference={item.reference} description={item.description} />
                      <span style={{ ...cell, fontWeight: T.wt.semibold, color: C.blueDark }}>{item.reference}</span>
                      <span style={{ ...cell, color: C.inkMid }}>{item.description}</span>
                      <span style={{ ...cell, fontSize: T.sz["2xs"] }}>{item.sizeClass ? SIZE_LABELS[item.sizeClass] : "\u2014"}</span>
                      {(() => { const s = fmtStock(item); return <span style={{ ...cell, color: s.color, fontWeight: s.weight }}>{s.text}</span>; })()}
                      {(() => { const sv = fmtSales6m(item); return <span style={{ ...cell, color: sv.color }}>{sv.text}</span>; })()}
                      <span style={{ ...cell, color: C.inkMid }}>{item.ritmoPromedioVentas !== null ? `${item.ritmoPromedioVentas}` : "\u2014"}</span>
                      <span style={{ ...cell, color: C.inkMid }}>{item.coberturaPromedioDias !== null ? `${item.coberturaPromedioDias}d` : "\u2014"}</span>
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
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── VIEW 2: Rotacion ─────────────────────────────────────────────────────────

type SizeFilter = "TODOS" | ImportSizeClass | "SIN_CLASIFICAR";

function RotacionView({ items, onDetail }: { items: ImportSupplyIntelligenceItem[]; onDetail: (i: ImportSupplyIntelligenceItem) => void }) {
  const [sortBy, setSortBy] = useState<"volume" | "speed">("volume");
  const [sizeFilter, setSizeFilter] = useState<SizeFilter>("TODOS");

  const sorted = useMemo(() => {
    let withSales = items.filter(i => i.soldNet > 0 || i.salesTotal6m > 0);
    if (sizeFilter === "SIN_CLASIFICAR") {
      withSales = withSales.filter(i => i.sizeClass === null);
    } else if (sizeFilter !== "TODOS") {
      withSales = withSales.filter(i => i.sizeClass === sizeFilter);
    }
    if (sortBy === "speed") {
      return [...withSales].sort((a, b) => (b.ritmoPromedioVentas ?? 0) - (a.ritmoPromedioVentas ?? 0));
    }
    return [...withSales].sort((a, b) => b.soldNet - a.soldNet);
  }, [items, sortBy, sizeFilter]);

  // Count per size for the filter badges
  const sizeCounts = useMemo(() => {
    const withSales = items.filter(i => i.soldNet > 0 || i.salesTotal6m > 0);
    return {
      TODOS: withSales.length,
      PEQUENO: withSales.filter(i => i.sizeClass === "PEQUENO").length,
      MEDIANO: withSales.filter(i => i.sizeClass === "MEDIANO").length,
      GRANDE: withSales.filter(i => i.sizeClass === "GRANDE").length,
      SIN_CLASIFICAR: withSales.filter(i => i.sizeClass === null).length,
    };
  }, [items]);

  const GRID = "36px 40px minmax(80px,1fr) minmax(120px,1.8fr) 80px 80px 80px 80px 80px";

  return (
    <div style={{ background: C.white, borderRadius: R.lg, border: `1px solid ${C.line}`, boxShadow: E.sm, overflow: "hidden" }}>
      {/* Sort + Size filter */}
      <div style={{ display: "flex", gap: S[3], padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.line}`, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: S[2] }}>
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
              {tab === "volume" ? "Mas vendidas" : "Mayor ritmo mensual"}
            </button>
          ))}
        </div>
        <div style={{ width: 1, height: 20, background: C.line }} />
        <div style={{ display: "flex", gap: S[1] }}>
          {(["TODOS", "PEQUENO", "MEDIANO", "GRANDE", "SIN_CLASIFICAR"] as SizeFilter[]).map(size => (
            <button
              key={size}
              onClick={() => setSizeFilter(size)}
              style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: sizeFilter === size ? T.wt.semibold : T.wt.normal,
                padding: `${S[1]}px ${S[2]}px`, border: `1px solid ${sizeFilter === size ? C.blueDark : C.line}`,
                borderRadius: R.pill, background: sizeFilter === size ? C.blueLight : C.white,
                color: sizeFilter === size ? C.blueDark : C.inkMid, cursor: "pointer",
              }}
            >
              {size === "TODOS" ? "Todos" : size === "SIN_CLASIFICAR" ? "Sin clasificar" : SIZE_LABELS[size]} ({sizeCounts[size]})
            </button>
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyRow text={sizeFilter !== "TODOS" ? `Sin referencias ${sizeFilter === "SIN_CLASIFICAR" ? "sin clasificar" : SIZE_LABELS[sizeFilter]?.toLowerCase() ?? ""} con ventas` : "Sin referencias con ventas registradas"} />
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: GRID, padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
            {["", "#", "Ref", "Descripcion", "Venta neta", "Ventas 6M", "Ritmo/mes", "Restante", "Canal"].map(h => (
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
                <CommercialReferenceThumbnail imageUrl={item.imageUrl} reference={item.reference} description={item.description} />
                <span style={{ ...cell, color: C.inkFaint, fontSize: T.sz["2xs"] }}>{i + 1}</span>
                <span style={{ ...cell, fontWeight: T.wt.semibold, color: C.blueDark }}>{item.reference}</span>
                <span style={{ ...cell, color: C.inkMid }}>{item.description}</span>
                <span style={{ ...cell, fontWeight: T.wt.bold }}>{item.soldNet > 0 ? fmt(item.soldNet) : "\u2014"}</span>
                {(() => { const sv = fmtSales6m(item); return <span style={{ ...cell, color: sv.color }}>{sv.text}</span>; })()}
                <span style={{ ...cell, color: C.inkMid }}>{item.ritmoPromedioVentas !== null ? `${item.ritmoPromedioVentas}/m` : "\u2014"}</span>
                {(() => { const s = fmtStock(item); return <span style={{ ...cell, color: s.color, fontWeight: s.weight }}>{s.text}</span>; })()}
                <span style={{ ...cell, fontSize: T.sz["2xs"] }}>{CHANNEL_LABELS[item.dominantChannel]}</span>
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// ── VIEW 3: Inventario lento ─────────────────────────────────────────────────

function InventarioLentoView({ items, onDetail }: { items: ImportSupplyIntelligenceItem[]; onDetail: (i: ImportSupplyIntelligenceItem) => void }) {
  const groups = useMemo(() => {
    // Inventario lento: daysSinceLastInbound > 240 && remaining > 0
    const lentas = items.filter(i =>
      i.daysSinceLastInbound !== null && i.daysSinceLastInbound > 240 && i.remaining > 0,
    );

    const sinMovimiento = lentas.filter(i => i.salesTotal6m === 0);
    const sobrestock = lentas.filter(i => i.remaining > 100 && i.salesTotal6m > 0 && i.salesTotal6m < 10);
    const restantes = lentas.filter(i =>
      i.salesTotal6m > 0 && !(i.remaining > 100 && i.salesTotal6m < 10),
    );

    return [
      { key: "sin_movimiento", label: "Sin movimiento (0 ventas 6M)", items: sinMovimiento, accent: C.red },
      { key: "sobrestock", label: "Sobrestock (>100 und, <10 ventas 6M)", items: sobrestock, accent: C.amber },
      { key: "con_movimiento", label: "Con movimiento bajo", items: restantes, accent: C.inkMid },
    ];
  }, [items]);

  const totalLentas = groups.reduce((s, g) => s + g.items.length, 0);

  const GRID = "36px minmax(80px,1fr) minmax(120px,1.8fr) 80px 70px 80px 80px";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {totalLentas === 0 ? (
        <div style={{ background: C.white, borderRadius: R.lg, border: `1px solid ${C.line}`, boxShadow: E.sm }}>
          <EmptyRow text="Sin inventario lento identificado" />
        </div>
      ) : (
        groups.map(group => group.items.length > 0 && (
          <CollapsibleSection key={group.key} title={group.label} count={group.items.length} accent={group.accent} defaultOpen={false}>
            <div style={{ display: "grid", gridTemplateColumns: GRID, padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
              {["", "Ref", "Descripcion", "Restante", "Ventas 6M", "Dias sin ingreso", "Fuente fecha"].map(h => (
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
                  <CommercialReferenceThumbnail imageUrl={item.imageUrl} reference={item.reference} description={item.description} />
                  <span style={{ ...cell, fontWeight: T.wt.semibold, color: C.blueDark }}>{item.reference}</span>
                  <span style={{ ...cell, color: C.inkMid }}>{item.description}</span>
                  {(() => { const s = fmtStock(item); return <span style={{ ...cell, color: s.color, fontWeight: s.weight }}>{s.text}</span>; })()}
                  {(() => { const sv = fmtSales6m(item); return <span style={{ ...cell, color: sv.color }}>{sv.text}</span>; })()}
                  <span style={{ ...cell }}>{item.daysSinceLastInbound !== null ? `${item.daysSinceLastInbound}d` : "\u2014"}</span>
                  <InboundSourceBadge source={item.lastInboundSource} />
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

        {/* ── Secondary technical info (collapsed by default) ──── */}
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
            <DrawerField label="Ultimo ingreso" value={item.lastInboundDate ?? "\u2014"} />
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

function ClickableKpi({ label, value, color, active, onClick }: {
  label: string; value: number; color?: string; active?: boolean; onClick: () => void;
}) {
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
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: value > 0 ? (color ?? C.ink) : C.inkFaint }}>
        {value.toLocaleString("es-CO")}
      </span>
    </button>
  );
}

function CollapsibleSection({ title, count, accent, defaultOpen = false, highlight = false, children }: {
  title: string; count: number; accent: string; defaultOpen?: boolean; highlight?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div style={{
      background: C.white, borderRadius: R.lg,
      border: `1px solid ${highlight ? accent : C.line}`,
      boxShadow: highlight ? `0 0 0 1px ${accent}40` : E.sm,
      overflow: "hidden", transition: "border-color 200ms, box-shadow 200ms",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: `${S[3]}px ${S[4]}px`, borderBottom: open ? `1px solid ${C.line}` : "none",
          display: "flex", alignItems: "center", gap: S[3],
          width: "100%", background: highlight ? `${accent}08` : "transparent",
          border: "none", cursor: "pointer", textAlign: "left" as const,
          transition: "background 200ms",
        }}
      >
        <span style={{
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid,
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 150ms", display: "inline-block", width: 16, textAlign: "center" as const,
        }}>
          ▸
        </span>
        <div style={{ width: highlight ? 6 : 4, height: 20, borderRadius: 2, background: accent, transition: "width 200ms" }} />
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

function InboundSourceBadge({ source }: { source: string }) {
  const label = inboundSourceLabel(source);
  const color = source === "SAG_RECEIPT_C1_C2" ? C.green : source === "LAST_PURCHASE_SAG" ? C.amber : C.inkFaint;
  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.medium,
      color, whiteSpace: "nowrap" as const,
    }}>
      {label}
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
    case "SAG_RECEIPT_C1_C2": return "Recibo SAG";
    case "LAST_PURCHASE_SAG": return "Ult. compra";
    case "UNAVAILABLE": return "Sin fecha";
    default: return "\u2014";
  }
}
