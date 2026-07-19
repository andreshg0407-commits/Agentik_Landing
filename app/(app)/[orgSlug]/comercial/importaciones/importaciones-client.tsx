/**
 * importaciones-client.tsx
 *
 * Importaciones — commercial intelligence for imported products.
 * Helps the manager decide what to repurchase from China based on
 * sales history, rotation, inventory and channel performance.
 *
 * Sprint: GO-LIVE-IMPORTACIONES-DATA-TRUST-AND-NAVIGATION-01
 *
 * NO modifications to: Maletas, Inventario, Pedidos, Produccion, Prisma.
 */

"use client";

import React, { useState, useMemo, useCallback, useRef } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import type {
  ImportedReference,
  ImportSummary,
  RepurchaseStatus,
  RepurchaseMotivo,
  MonthlySale,
  DataQuality,
} from "@/lib/comercial/importaciones/import-types";

// ── Props ───────────────────────────────────────────────────────────────────

interface ImportacionesClientProps {
  orgSlug:    string;
  references: ImportedReference[];
  summary:    ImportSummary;
}

// ── Constants ───────────────────────────────────────────────────────────────

const RECOMPRA_GRID = "minmax(80px,1fr) minmax(120px,1.8fr) 85px 65px 65px 70px 60px 70px 70px minmax(100px,1.2fr) 70px";
const TOP_GRID      = "minmax(80px,1fr) minmax(120px,1.8fr) 70px 60px 60px 80px 80px";
const TOP6M_GRID    = "minmax(80px,1fr) minmax(120px,1.8fr) 70px 80px 60px 80px 80px";
const ROW_PAD       = `${S[2]}px ${S[3]}px`;

const STATUS_COLORS: Record<RepurchaseStatus, { bg: string; fg: string; label: string }> = {
  RECOMPRAR:     { bg: C.greenLight,  fg: C.green,    label: "Recomprar" },
  VIGILAR:       { bg: C.amberLight,  fg: C.amber,    label: "Vigilar" },
  NO_RECOMPRAR:  { bg: C.surface,     fg: C.inkMid,   label: "No recomprar" },
  SIN_DATOS:     { bg: C.surface,     fg: C.inkFaint, label: "Sin datos" },
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
  detal: "Detal",
  mayorista: "Mayorista",
  equilibrado: "Equilibrado",
  sin_datos: "\u2014",
};

// ── Main Component ──────────────────────────────────────────────────────────

export function ImportacionesClient({ orgSlug, references, summary }: ImportacionesClientProps) {
  const [selectedRef, setSelectedRef] = useState<ImportedReference | null>(null);
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [topTab, setTopTab]           = useState<"total" | "detal" | "mayorista">("total");

  // Section refs for quick navigation
  const recomprasRef = useRef<HTMLDivElement>(null);
  const topHistRef = useRef<HTMLDivElement>(null);
  const top6mRef = useRef<HTMLDivElement>(null);

  const openDrawer = useCallback((ref: ImportedReference) => {
    setSelectedRef(ref);
    setDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setSelectedRef(null);
  }, []);

  // ── Derived datasets ──────────────────────────────────────────────────────

  const recomprasSugeridas = useMemo(
    () => references.filter(r => r.repurchaseStatus === "RECOMPRAR"),
    [references],
  );

  const top10Historico = useMemo(
    () => [...references]
      .filter(r => r.sold > 0)
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 10),
    [references],
  );

  const topActual = useMemo(() => {
    const sorted = [...references].filter(r => r.salesTotal6m > 0);
    if (topTab === "detal") return sorted.sort((a, b) => b.salesDetal6m - a.salesDetal6m).slice(0, 10);
    if (topTab === "mayorista") return sorted.sort((a, b) => b.salesMayorista6m - a.salesMayorista6m).slice(0, 10);
    return sorted.sort((a, b) => b.salesTotal6m - a.salesTotal6m).slice(0, 10);
  }, [references, topTab]);

  const scrollTo = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
        subtitle="Inteligencia de recompra basada en rotacion, inventario y ventas por canal."
      />

      {/* ── KPIs ejecutivos ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[4] }}>
        <ExecKpi label="Referencias importadas" value={summary.sagValidated ? summary.totalReferences : null} />
        <ExecKpi label="Recompras sugeridas" value={summary.sagValidated ? summary.repurchaseSuggested : null} color={summary.repurchaseSuggested > 0 ? C.green : undefined} />
        <ExecKpi label="Con ventas actuales" value={summary.sagValidated ? summary.topVentasActuales : null} />
        <ExecKpi label="Criticas por inventario" value={summary.sagValidated ? summary.refsCriticas : null} color={summary.refsCriticas > 0 ? C.red : undefined} />
      </div>

      {/* ── Quick navigation ──────────────────────────────────────── */}
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
        <NavPill label="Recompras" count={recomprasSugeridas.length} onClick={() => scrollTo(recomprasRef)} />
        <NavPill label="Top historico" count={top10Historico.length} onClick={() => scrollTo(topHistRef)} />
        <NavPill label="Top 6 meses" count={topActual.length} onClick={() => scrollTo(top6mRef)} />
      </div>

      {/* ── Recompras sugeridas ─────────────────────────────────────── */}
      <div ref={recomprasRef}>
        <CollapsibleSection title="Recompras sugeridas" count={recomprasSugeridas.length} accent={C.green} defaultOpen>
          {recomprasSugeridas.length === 0 ? (
            <EmptyRow text={references.length === 0 ? "Sin referencias importadas — En validacion SAG" : "Sin recompras sugeridas actualmente"} />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: RECOMPRA_GRID, padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
                {["Ref", "Descripcion", "Ult. ingreso", "Importado", "Vendidas", "Stock total", "Restante", "Detal 6M", "Mayor. 6M", "Motivo", "Accion"].map(h => (
                  <ColHeader key={h}>{h}</ColHeader>
                ))}
              </div>
              {recomprasSugeridas.map((r, i) => (
                <RecompraRow key={r.productId} item={r} isLast={i === recomprasSugeridas.length - 1} onDetail={() => openDrawer(r)} />
              ))}
            </>
          )}
        </CollapsibleSection>
      </div>

      {/* ── Top 10 histórico ─────────────────────────────────────────── */}
      <div ref={topHistRef}>
        <CollapsibleSection title="Top 10 historico" count={top10Historico.length} accent={C.blueDark}>
          {top10Historico.length === 0 ? (
            <EmptyRow text="Sin datos historicos de ventas" />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: TOP_GRID, padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
                {["Ref", "Descripcion", "Vendidas", "Recompras", "% vend.", "Canal domin.", "Accion"].map(h => (
                  <ColHeader key={h}>{h}</ColHeader>
                ))}
              </div>
              {top10Historico.map((r, i) => (
                <TopHistoricoRow key={r.productId} item={r} isLast={i === top10Historico.length - 1} onDetail={() => openDrawer(r)} />
              ))}
            </>
          )}
        </CollapsibleSection>
      </div>

      {/* ── Top actual últimos 6 meses ──────────────────────────────── */}
      <div ref={top6mRef}>
        <CollapsibleSection title="Top actual ultimos 6 meses" count={topActual.length} accent={C.blue}>
          {/* Channel tabs */}
          <div style={{ display: "flex", gap: S[2], padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.line}` }}>
            {(["total", "detal", "mayorista"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setTopTab(tab)}
                style={{
                  fontFamily: T.mono, fontSize: T.sz.sm,
                  fontWeight: topTab === tab ? T.wt.semibold : T.wt.normal,
                  padding: `${S[1]}px ${S[3]}px`,
                  border: `1px solid ${topTab === tab ? C.blueDark : C.line}`,
                  borderRadius: R.pill,
                  background: topTab === tab ? C.blueLight : C.white,
                  color: topTab === tab ? C.blueDark : C.inkMid,
                  cursor: "pointer",
                }}
              >
                {tab === "total" ? "Total" : tab === "detal" ? "Detal" : "Mayorista"}
              </button>
            ))}
          </div>
          {topActual.length === 0 ? (
            <EmptyRow text="Sin ventas en los ultimos 6 meses" />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: TOP6M_GRID, padding: ROW_PAD, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
                {["Ref", "Descripcion", "Uds. 6M", "Valor 6M", "Restante", "Canal domin.", "Estado"].map(h => (
                  <ColHeader key={h}>{h}</ColHeader>
                ))}
              </div>
              {topActual.map((r, i) => (
                <TopActualRow key={r.productId} item={r} tab={topTab} isLast={i === topActual.length - 1} onDetail={() => openDrawer(r)} />
              ))}
            </>
          )}
        </CollapsibleSection>
      </div>

      {/* ── Drawer ──────────────────────────────────────────────────── */}
      {drawerOpen && selectedRef && (
        <ImportDetailDrawer ref_={selectedRef} onClose={closeDrawer} />
      )}
    </div>
  );
}

// ── ExecKpi ─────────────────────────────────────────────────────────────────

function ExecKpi({ label, value, color }: { label: string; value: number | null; color?: string }) {
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.line}`, borderRadius: R.lg,
      padding: `${S[4]}px ${S[5]}px`, display: "flex", flexDirection: "column" as const, gap: S[1],
    }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.medium, color: C.inkMid, textTransform: "uppercase" as const, letterSpacing: 0.5 }}>
        {label}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: value !== null ? (color ?? C.ink) : C.inkFaint }}>
        {value !== null ? value.toLocaleString("es-CO") : "\u2014"}
      </span>
      {value === null && (
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberMid }}>Pendiente SAG</span>
      )}
    </div>
  );
}

// ── Quick navigation pill ──────────────────────────────────────────────────

function NavPill({ label, count, onClick }: { label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.medium,
        padding: `${S[1]}px ${S[3]}px`, borderRadius: R.pill,
        border: `1px solid ${C.line}`, background: C.white, color: C.inkMid,
        cursor: "pointer", display: "flex", alignItems: "center", gap: S[1],
        transition: "background 120ms",
      }}
    >
      {label}
      <span style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
        padding: `0 ${S[1]}px`, borderRadius: R.pill, background: C.surface, color: C.inkMid,
        minWidth: 18, textAlign: "center" as const,
      }}>
        {count}
      </span>
    </button>
  );
}

// ── Collapsible section ────────────────────────────────────────────────────

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
          transition: "transform 150ms",
          display: "inline-block", width: 16, textAlign: "center" as const,
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

// ── Column header ───────────────────────────────────────────────────────────

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

// ── Empty row ───────────────────────────────────────────────────────────────

function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{ padding: S[6], textAlign: "center" as const, fontFamily: T.mono, fontSize: T.sz.base, color: C.inkFaint }}>
      {text}
    </div>
  );
}

// ── Shared cell style ───────────────────────────────────────────────────────

const cell: React.CSSProperties = {
  fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

// ── Recompras sugeridas row ─────────────────────────────────────────────────

function RecompraRow({ item, isLast, onDetail }: { item: ImportedReference; isLast: boolean; onDetail: () => void }) {
  return (
    <button
      onClick={onDetail}
      title={`Ver detalle de ${item.reference}`}
      style={{
        display: "grid", gridTemplateColumns: RECOMPRA_GRID, padding: ROW_PAD,
        minHeight: 52, alignItems: "center",
        borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
        background: "transparent", border: "none", cursor: "pointer",
        width: "100%", textAlign: "left" as const, transition: "background 120ms",
        borderBottomStyle: isLast ? undefined : "solid",
        borderBottomWidth: isLast ? undefined : 1,
        borderBottomColor: isLast ? undefined : C.lineSubtle,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.surfaceAlt; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <span style={{ ...cell, fontWeight: T.wt.semibold, color: C.blueDark }}>{item.reference}</span>
      <span style={{ ...cell, color: C.inkMid }}>{item.description}</span>
      <span style={{ ...cell, color: C.inkMid, fontSize: T.sz["2xs"] }}>
        {item.lastEntryDate ?? "\u2014"}
        {item.entryDateQuality === "CONFIRMED" && item.daysSinceLastEntry !== null && (
          <span style={{ color: C.inkFaint, marginLeft: 2 }}>({item.daysSinceLastEntry}d)</span>
        )}
      </span>
      <span style={{ ...cell }}>{item.totalImported !== null ? fmt(item.totalImported) : "\u2014"}</span>
      <span style={{ ...cell }}>{item.sold > 0 ? fmt(item.sold) : "\u2014"}</span>
      <span style={{ ...cell, color: C.inkMid }}>{item.totalStock > 0 ? fmt(item.totalStock) : "\u2014"}</span>
      <span style={{ ...cell, color: item.remaining <= 20 ? C.red : C.ink, fontWeight: item.remaining <= 20 ? T.wt.bold : T.wt.normal }}>
        {item.remaining > 0 ? fmt(item.remaining) : "\u2014"}
      </span>
      <span style={{ ...cell }}>{item.salesDetal6m > 0 ? fmt(item.salesDetal6m) : "\u2014"}</span>
      <span style={{ ...cell }}>{item.salesMayorista6m > 0 ? fmt(item.salesMayorista6m) : "\u2014"}</span>
      <MotivoChip motivo={item.repurchaseMotivo} />
      <StatusChip status={item.repurchaseStatus} />
    </button>
  );
}

// ── Top 10 histórico row ────────────────────────────────────────────────────

function TopHistoricoRow({ item, isLast, onDetail }: { item: ImportedReference; isLast: boolean; onDetail: () => void }) {
  return (
    <button
      onClick={onDetail} title={`Ver detalle de ${item.reference}`}
      style={{
        display: "grid", gridTemplateColumns: TOP_GRID, padding: ROW_PAD,
        minHeight: 48, alignItems: "center",
        borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
        background: "transparent", border: "none", cursor: "pointer",
        width: "100%", textAlign: "left" as const, transition: "background 120ms",
        borderBottomStyle: isLast ? undefined : "solid",
        borderBottomWidth: isLast ? undefined : 1,
        borderBottomColor: isLast ? undefined : C.lineSubtle,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.surfaceAlt; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <span style={{ ...cell, fontWeight: T.wt.semibold, color: C.blueDark }}>{item.reference}</span>
      <span style={{ ...cell, color: C.inkMid }}>{item.description}</span>
      <span style={{ ...cell, fontWeight: T.wt.bold }}>{fmt(item.sold)}</span>
      <span style={{ ...cell }}>{item.batchCount > 1 ? item.batchCount : "\u2014"}</span>
      <span style={{ ...cell, fontWeight: T.wt.semibold, color: pctColor(item.percentSold) }}>
        {item.percentSold !== null ? `${item.percentSold}%` : "\u2014"}
      </span>
      <span style={{ ...cell }}>{CHANNEL_LABELS[item.dominantChannel]}</span>
      <StatusChip status={item.repurchaseStatus} />
    </button>
  );
}

// ── Top actual row ──────────────────────────────────────────────────────────

function TopActualRow({ item, tab, isLast, onDetail }: {
  item: ImportedReference; tab: "total" | "detal" | "mayorista"; isLast: boolean; onDetail: () => void;
}) {
  const salesValue = tab === "detal" ? item.salesDetal6m
    : tab === "mayorista" ? item.salesMayorista6m
    : item.salesTotal6m;

  const revenueValue = tab === "detal" ? item.revenueDetal6m
    : tab === "mayorista" ? item.revenueMayorista6m
    : item.revenue6m;

  return (
    <button
      onClick={onDetail} title={`Ver detalle de ${item.reference}`}
      style={{
        display: "grid", gridTemplateColumns: TOP6M_GRID, padding: ROW_PAD,
        minHeight: 48, alignItems: "center",
        borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
        background: "transparent", border: "none", cursor: "pointer",
        width: "100%", textAlign: "left" as const, transition: "background 120ms",
        borderBottomStyle: isLast ? undefined : "solid",
        borderBottomWidth: isLast ? undefined : 1,
        borderBottomColor: isLast ? undefined : C.lineSubtle,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.surfaceAlt; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      <span style={{ ...cell, fontWeight: T.wt.semibold, color: C.blueDark }}>{item.reference}</span>
      <span style={{ ...cell, color: C.inkMid }}>{item.description}</span>
      <span style={{ ...cell, fontWeight: T.wt.bold }}>{fmt(salesValue)}</span>
      <span style={{ ...cell, color: C.inkMid }}>{revenueValue > 0 ? fmtCurrency(revenueValue) : "\u2014"}</span>
      <span style={{ ...cell, color: item.remaining <= 20 ? C.red : C.ink, fontWeight: item.remaining <= 20 ? T.wt.bold : T.wt.normal }}>
        {item.remaining > 0 ? fmt(item.remaining) : "\u2014"}
      </span>
      <span style={{ ...cell }}>{CHANNEL_LABELS[item.dominantChannel]}</span>
      <StatusChip status={item.repurchaseStatus} />
    </button>
  );
}

// ── Status chip ─────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: RepurchaseStatus }) {
  const s = STATUS_COLORS[status];
  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
      padding: `2px ${S[2]}px`, borderRadius: R.pill,
      background: s.bg, color: s.fg,
      textAlign: "center" as const, whiteSpace: "nowrap" as const,
    }}>
      {s.label}
    </span>
  );
}

// ── Motivo chip ─────────────────────────────────────────────────────────────

function MotivoChip({ motivo }: { motivo: RepurchaseMotivo }) {
  const label = MOTIVO_LABELS[motivo];
  const isAlert = motivo === "desabastecimiento";
  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.medium,
      color: isAlert ? C.red : C.inkMid,
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
    }}>
      {label}
    </span>
  );
}

// ── Detail Drawer ───────────────────────────────────────────────────────────

function ImportDetailDrawer({ ref_, onClose }: { ref_: ImportedReference; onClose: () => void }) {
  const status = STATUS_COLORS[ref_.repurchaseStatus];

  // Generate placeholder monthly sales — real data comes from server via detail endpoint
  const monthlySales: MonthlySale[] = useMemo(() => {
    const months: MonthlySale[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        detal: 0, mayorista: 0, noDet: 0, total: 0,
      });
    }
    return months;
  }, []);

  const motivoText: Record<RepurchaseMotivo, string> = {
    desabastecimiento:   "Stock critico con demanda activa. Recompra prioritaria.",
    alta_rotacion:       "Alta rotacion con stock bajo. Considerar recompra.",
    exito_historico:     "Referencia con alto volumen vendido historicamente.",
    recompra_recurrente: "Referencia con multiples recompras exitosas.",
    stock_suficiente:    "Vende pero tiene stock suficiente. Monitorear.",
    baja_rotacion:       "Baja rotacion o stock alto. No requiere recompra.",
    sin_datos:           "Datos insuficientes para generar recomendacion.",
  };

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, width: 440, height: "100vh",
      background: C.white, borderLeft: `1px solid ${C.line}`, boxShadow: E.lg,
      zIndex: 50, display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: `${S[4]}px ${S[5]}px`, borderBottom: `1px solid ${C.line}`,
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{ref_.reference}</div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, marginTop: 2 }}>{ref_.description}</div>
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
        {/* Status + motivo */}
        <div style={{ display: "flex", gap: S[2], marginBottom: S[4], flexWrap: "wrap" }}>
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
            {MOTIVO_LABELS[ref_.repurchaseMotivo]}
          </span>
        </div>

        {/* Prices */}
        <DrawerSection title="Precios">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${S[2]}px ${S[4]}px` }}>
            <DrawerField label="PV3 — Detal" value={ref_.pricePV3 !== null ? fmtCurrency(ref_.pricePV3) : "\u2014"} pending={ref_.pricePV3 === null} />
            <DrawerField label="PV4 — Mayorista" value={ref_.pricePV4 !== null ? fmtCurrency(ref_.pricePV4) : "\u2014"} pending={ref_.pricePV4 === null} />
          </div>
        </DrawerSection>

        {/* Inventory */}
        <DrawerSection title="Inventario y rotacion">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${S[2]}px ${S[4]}px` }}>
            <DrawerField label="Primera entrada" value={ref_.entryDate ?? "\u2014"} quality={ref_.entryDateQuality} />
            <DrawerField label="Ultima entrada" value={ref_.lastEntryDate ?? "\u2014"} quality={ref_.entryDateQuality} />
            <DrawerField
              label="Desde ultimo ingreso"
              value={ref_.daysSinceLastEntry !== null ? `${ref_.daysSinceLastEntry} dias` : "\u2014"}
              quality={ref_.entryDateQuality}
            />
            <DrawerField label="Ingresos" value={ref_.receiptCount > 0 ? `${ref_.receiptCount} documentos` : "\u2014"} />
            <DrawerField label="Total importado" value={ref_.totalImported !== null ? fmt(ref_.totalImported) : "\u2014"} quality={ref_.totalImportedQuality} />
            <DrawerField label="Venta neta" value={ref_.soldNet > 0 ? fmt(ref_.soldNet) : "\u2014"} />
            <DrawerField label="Devoluciones" value={ref_.returns > 0 ? fmt(ref_.returns) : "\u2014"} highlight={ref_.returns > 0 ? C.amber : undefined} />
            <DrawerField label="Stock importacion" value={ref_.remaining > 0 ? fmt(ref_.remaining) : "\u2014"} highlight={ref_.remaining <= 20 && ref_.remaining > 0 ? C.red : undefined} />
            <DrawerField label="Stock total" value={ref_.totalStock > 0 ? fmt(ref_.totalStock) : "\u2014"} />
            <DrawerField
              label="% vendido"
              value={ref_.percentSold !== null ? `${ref_.percentSold}%` : "\u2014"}
              highlight={ref_.percentSold !== null && ref_.percentSold >= 70 ? C.green : undefined}
              quality={ref_.totalImportedQuality}
            />
          </div>
        </DrawerSection>

        {/* Revenue */}
        <DrawerSection title="Valor monetario">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: `${S[2]}px ${S[4]}px` }}>
            <DrawerField label="Facturado total" value={ref_.revenueAll > 0 ? fmtCurrency(ref_.revenueAll) : "\u2014"} />
            <DrawerField label="Facturado 6M" value={ref_.revenue6m > 0 ? fmtCurrency(ref_.revenue6m) : "\u2014"} />
            <DrawerField label="Detal 6M" value={ref_.revenueDetal6m > 0 ? fmtCurrency(ref_.revenueDetal6m) : "\u2014"} />
            <DrawerField label="Mayorista 6M" value={ref_.revenueMayorista6m > 0 ? fmtCurrency(ref_.revenueMayorista6m) : "\u2014"} />
          </div>
        </DrawerSection>

        {/* Receipt history */}
        {ref_.receipts && ref_.receipts.length > 0 && (
          <DrawerSection title="Historial de ingresos">
            <div style={{ background: C.surface, borderRadius: R.md, border: `1px solid ${C.line}`, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 70px 1fr", padding: `${S[1]}px ${S[3]}px`, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
                {["Fecha", "Doc", "Cant.", "Proveedor"].map(h => (
                  <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkMid, textTransform: "uppercase" as const }}>{h}</span>
                ))}
              </div>
              {ref_.receipts.map((r, i) => (
                <div key={`${r.documentNumber}-${i}`} style={{
                  display: "grid", gridTemplateColumns: "1fr 80px 70px 1fr",
                  padding: `${S[1]}px ${S[3]}px`,
                  borderBottom: i < ref_.receipts.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
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

        {/* Sales by channel */}
        <DrawerSection title="Ventas ultimos 6 meses">
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: `${S[2]}px ${S[4]}px`, marginBottom: S[3] }}>
              <DrawerField label="Detal" value={ref_.salesDetal6m > 0 ? `${fmt(ref_.salesDetal6m)} uds` : "\u2014"} />
              <DrawerField label="Mayorista" value={ref_.salesMayorista6m > 0 ? `${fmt(ref_.salesMayorista6m)} uds` : "\u2014"} />
              <DrawerField label="No determinado" value={ref_.salesNoDet6m > 0 ? `${fmt(ref_.salesNoDet6m)} uds` : "\u2014"} />
            </div>
            {ref_.channelConfidence > 0 && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginBottom: S[2] }}>
                Confianza: {Math.round(ref_.channelConfidence * 100)}% | {QUALITY_LABELS[ref_.channelQuality].text}
              </div>
            )}

              {/* Monthly table */}
              <div style={{ background: C.surface, borderRadius: R.md, border: `1px solid ${C.line}`, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 70px 70px", padding: `${S[1]}px ${S[3]}px`, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
                  {["Mes", "Detal", "Mayor.", "Total"].map(h => (
                    <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkMid, textTransform: "uppercase" as const }}>{h}</span>
                  ))}
                </div>
                {monthlySales.map((m, i) => (
                  <div key={m.month} style={{
                    display: "grid", gridTemplateColumns: "1fr 70px 70px 70px",
                    padding: `${S[1]}px ${S[3]}px`,
                    borderBottom: i < monthlySales.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                  }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>{m.month}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>{m.detal || "\u2014"}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>{m.mayorista || "\u2014"}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>{m.total || "\u2014"}</span>
                  </div>
                ))}
              </div>
          </>
        </DrawerSection>

        {/* Distribucion acumulada */}
        <DrawerSection title="Distribucion por canal (historico)">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[3] }}>
            <ChannelCard label="Detal" value={ref_.soldDetal} />
            <ChannelCard label="Mayorista" value={ref_.soldMayorista} />
            <ChannelCard label="No determ." value={ref_.soldNoDet} />
          </div>
        </DrawerSection>

        {/* Recommendation */}
        <div style={{
          background: status.bg, border: `1px solid ${status.fg}20`,
          borderRadius: R.lg, padding: `${S[3]}px ${S[4]}px`, marginTop: S[3],
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: status.fg, marginBottom: S[1] }}>
            Recomendacion
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.base, color: C.ink }}>
            {motivoText[ref_.repurchaseMotivo]}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Drawer section ──────────────────────────────────────────────────────────

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

// ── Drawer field ────────────────────────────────────────────────────────────

const QUALITY_LABELS: Record<DataQuality, { text: string; color: string }> = {
  CONFIRMED: { text: "Confirmado", color: C.green },
  ESTIMATED: { text: "Estimado", color: C.amber },
  UNAVAILABLE: { text: "No disponible", color: C.inkFaint },
};

function DrawerField({ label, value, highlight, pending, quality }: {
  label: string; value: string; highlight?: string; pending?: boolean; quality?: DataQuality;
}) {
  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.semibold, color: highlight ?? C.ink, marginTop: 1 }}>
        {value}
      </div>
      {pending && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberMid, marginTop: 1 }}>Pendiente SAG</div>
      )}
      {quality && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: QUALITY_LABELS[quality].color, marginTop: 1 }}>
          {QUALITY_LABELS[quality].text}
        </div>
      )}
    </div>
  );
}

// ── Channel card ────────────────────────────────────────────────────────────

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

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString("es-CO");
}

function fmtCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

function pctColor(pct: number | null): string {
  if (pct === null) return C.inkFaint;
  if (pct >= 70) return C.green;
  if (pct >= 40) return C.amber;
  return C.inkMid;
}
