"use client";

/**
 * components/comercial/store-intelligence-tab.tsx
 *
 * AGENTIK-STORES-INTELLIGENCE-UX-IMPLEMENTATION-01 — Lectura ejecutiva diaria.
 *
 * RENDER-ONLY: todo texto, formato, label y estado sale del
 * StoreIntelligencePresentation (PA puro). Este componente solo:
 * layout responsive, disclosure, toggles, búsqueda visual y render.
 * CERO lógica de negocio · CERO formateo de negocio · CERO queries propias.
 *
 * UNA VERDAD, DOS COMPOSICIONES: mismo DTO; <560px composición móvil,
 * >=560px composición desktop (grid colapsa a 1 columna hasta ~900px).
 * Extraído de tiendas-client.tsx por tamaño (patrón store-supply-rules-tab).
 */

import { useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { C, T, S, R, panel } from "@/lib/ui/tokens";
import { CommercialReferenceThumbnail } from "@/components/comercial/commercial-reference-thumbnail";
import {
  buildStoreIntelligencePresentation,
  type StoreIntelligencePresentation,
  type IntelTone,
  type IntelProductRow,
  type IntelMomentumRow,
  type IntelNoSalesRow,
  type IntelUniverseKey,
} from "@/lib/comercial/tiendas/store-intelligence-presentation-assembler";
import type { CertifiedStoreIntelligenceResponse } from "@/lib/comercial/tiendas/store-certified-intelligence-types";
import type { StoreProductIntelligence, WindowId } from "@/lib/comercial/tiendas/store-product-intelligence-types";

// ── Tonos → tokens del sistema (jamás raw hex aquí) ──────────────────────────

const TONE_TEXT: Record<IntelTone, string> = {
  positive: C.green, warning: C.amber, critical: C.red, neutral: C.inkMid,
};
const TONE_BG: Record<IntelTone, string> = {
  positive: C.greenLight, warning: C.amberLight, critical: C.redLight, neutral: C.surfaceAlt,
};

// ── Viewport (SOLO presentación — el PA es viewport-agnostic) ────────────────

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 559px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

// ── Piezas compartidas ───────────────────────────────────────────────────────

function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: S[2], marginBottom: S[2], flexWrap: "wrap" }}>
      <h3 style={{ margin: 0, fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {children}
      </h3>
      {right}
    </div>
  );
}

function Chip({ active, onClick, big, children }: { active: boolean; onClick: () => void; big?: boolean; children: React.ReactNode }) {
  return (
    <button aria-pressed={active} onClick={onClick} style={{
      fontFamily: T.mono, fontSize: big ? T.sz.sm : T.sz.xs, fontWeight: big ? T.wt.bold : T.wt.semibold,
      padding: big ? "8px 20px" : "6px 14px", minHeight: big ? 44 : 32, borderRadius: R.sm, cursor: "pointer",
      background: active ? C.blueDark : C.white,
      color: active ? C.white : C.ink,
      border: `1.5px solid ${active ? C.blueDark : C.line}`,
    }}>
      {children}
    </button>
  );
}

function ToneBadge({ tone, big, children }: { tone: IntelTone; big?: boolean; children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: T.mono, fontSize: big ? T.sz.xs : T.sz["2xs"], fontWeight: big ? T.wt.bold : T.wt.semibold,
      padding: big ? "5px 11px" : "3px 9px", borderRadius: R.pill,
      background: TONE_BG[tone], color: TONE_TEXT[tone],
    }}>
      {children}
    </span>
  );
}

function Skeleton({ h }: { h: number }) {
  return <div style={{ height: h, background: C.surface, borderRadius: R.sm, animation: "pulse 1.5s infinite" }} />;
}

// ── Tooltip del chart — consume EXCLUSIVAMENTE el punto del PA (UX10) ────────

function TrendTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  return (
    <div style={{
      background: C.ink, color: C.white, borderRadius: R.lg, padding: `${S[2]}px ${S[3]}px`,
      fontFamily: T.mono, fontSize: T.sz["2xs"], lineHeight: 1.7, maxWidth: 190,
    }}>
      <div style={{ fontWeight: T.wt.bold }}>{pt.label} · {pt.formattedValue}</div>
      <div>{pt.invoicesText} · Ticket {pt.ticketText}</div>
      <div style={{ color: pt.deltaTone === "positive" ? C.greenBorder : pt.deltaTone === "warning" ? C.amberBorder : C.inkGhost }}>
        {pt.deltaPctText} vs mes anterior
      </div>
    </div>
  );
}

// ── Filas ────────────────────────────────────────────────────────────────────

function ProductRowView({ row, expanded, onToggle }: { row: IntelProductRow; expanded: boolean; onToggle: () => void }) {
  return (
    <div style={{ borderBottom: `1px solid ${C.lineSubtle}` }}>
      <button onClick={onToggle} aria-expanded={expanded} style={{
        display: "grid", gridTemplateColumns: "24px 32px 1fr auto", gap: S[2], alignItems: "center",
        width: "100%", minHeight: 44, padding: `${S[1]}px 0`, background: "none", border: "none",
        cursor: "pointer", textAlign: "left",
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkFaint }}>#{row.rank}</span>
        <CommercialReferenceThumbnail imageUrl={row.imageUrl} referenceCode={row.referenceCode} description={row.productName} size={28} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>{row.referenceCode}</span>
          <span style={{ display: "block", fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.productName}</span>
        </span>
        <span style={{ textAlign: "right" }}>
          {/* §4: UNA métrica dominante por modo — primaryText manda, el resto acompaña */}
          <span style={{ display: "block", fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.bold, letterSpacing: "-0.3px", color: C.ink }}>{row.primaryText}</span>
          <span style={{ display: "block", fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            {row.secondaryText}{row.shareText ? ` · ${row.shareText}` : ""}
          </span>
        </span>
      </button>
      {expanded && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, padding: `0 0 ${S[2]}px 56px`, lineHeight: 1.8 }}>
          {row.detail.recentUnitsText} · {row.detail.lastSaleText}<br />
          Ritmo de venta: <strong>{row.detail.rateText}</strong> ·{" "}
          <span style={{ color: TONE_TEXT[row.detail.momentumTone], fontWeight: T.wt.semibold }}>
            {row.detail.momentumArrow} {row.detail.momentumLabel}
          </span>
        </div>
      )}
    </div>
  );
}

function MomentumRowView({ row }: { row: IntelMomentumRow }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto 16px", gap: S[2], alignItems: "center", padding: `${S[1]}px 0`, borderBottom: `1px solid ${C.lineSubtle}`, minHeight: 32 }}>
      <span style={{ minWidth: 0, fontFamily: T.mono, fontSize: T.sz.xs }}>
        <strong>{row.referenceCode}</strong>{" "}
        <span style={{ color: C.inkFaint, fontSize: T.sz["2xs"] }}>{row.productName}</span>
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{row.changeText}</span>
      <span aria-hidden style={{ color: TONE_TEXT[row.tone], fontWeight: T.wt.bold }}>{row.arrow}</span>
    </div>
  );
}

function NoSalesRowView({ row }: { row: IntelNoSalesRow }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: S[2], alignItems: "center", padding: `${S[1]}px 0`, borderBottom: `1px solid ${C.lineSubtle}`, minHeight: 36 }}>
      <span style={{ minWidth: 0, fontFamily: T.mono, fontSize: T.sz.xs }}>
        <strong>{row.referenceCode}</strong>{" "}
        <span style={{ color: C.inkFaint, fontSize: T.sz["2xs"] }}>{row.productName}</span>
      </span>
      <span style={{ textAlign: "right", fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
        {row.unitsText}
        <span style={{ display: "block", color: row.neverSoldInHistory ? C.amber : C.inkFaint }}>{row.lastSaleText}</span>
      </span>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Componente principal
// ═════════════════════════════════════════════════════════════════════════════

export function StoreIntelligenceTab({
  certifiedIntel, certifiedLoading, certifiedError,
  productIntel, productLoading, productError,
  periodKey, onPeriodChange, onRetryCertified, onRetryProduct,
}: {
  certifiedIntel: CertifiedStoreIntelligenceResponse | null;
  certifiedLoading: boolean;
  certifiedError: boolean;
  productIntel: StoreProductIntelligence | null;
  productLoading: boolean;
  productError: boolean;
  periodKey: WindowId;
  onPeriodChange: (w: WindowId) => void;
  onRetryCertified: () => void;
  onRetryProduct: () => void;
}) {
  const isMobile = useIsMobile();
  const [trendRange, setTrendRange] = useState<"6M" | "12M" | "ALL">("6M");
  const [productMode, setProductMode] = useState<"UNITS" | "REVENUE" | "RATE">("UNITS");
  const [universe, setUniverse] = useState<IntelUniverseKey>("ALL");
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [expandedLine, setExpandedLine] = useState<string | null>(null);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [noSalesView, setNoSalesView] = useState<"summary" | "all">("summary");
  const [noSalesSearch, setNoSalesSearch] = useState("");
  const [noSalesSort, setNoSalesSort] = useState<"stock" | "days">("stock");
  const [accountingOpen, setAccountingOpen] = useState(false);

  // Degradación parcial (§7): el DTO se construye con certified solo;
  // product intelligence enriquece cuando llega. JAMÁS ambas-o-nada.
  const pres: StoreIntelligencePresentation | null = useMemo(
    () => (certifiedIntel ? buildStoreIntelligencePresentation(certifiedIntel, productIntel ?? null) : null),
    [certifiedIntel, productIntel],
  );

  // ── Error de API del certificado (técnico) — único caso de error principal ──
  if (certifiedError && !certifiedIntel) {
    return (
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, padding: `${S[4]}px 0`, textAlign: "center" }}>
        <div style={{ marginBottom: S[2] }}>No se pudo cargar Inteligencia comercial.</div>
        <Chip active={false} onClick={onRetryCertified}>Reintentar</Chip>
      </div>
    );
  }

  // ── Sin datos aún (primer frame o cargando): skeletons — jamás error ──
  if (!pres) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
        <Skeleton h={40} /><Skeleton h={110} /><Skeleton h={70} /><Skeleton h={170} /><Skeleton h={120} />
      </div>
    );
  }

  // ── NOT_SYNCED / NO_DATA: estado completo — JAMÁS $0 (UX5) ──
  if (pres.dataState.status === "NOT_SYNCED" || pres.dataState.status === "NO_DATA") {
    return (
      <div style={{ ...panel, padding: S[5], textAlign: "center" }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.bold, color: C.ink, marginBottom: S[2] }}>
          {pres.dataState.stateTitle}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{pres.dataState.stateText}</div>
      </div>
    );
  }

  const tp = pres.topProducts;
  const mm = pres.momentum;
  const ns = pres.noSales;
  const cp = pres.categoryPerformance;
  const mmU = mm === null ? null : mm.byUniverse[universe];
  const nsSummary = ns === null ? null : ns.universeSummaries[universe];
  // Filas no-sales del universo activo: allRows viaja UNA vez etiquetada por el PA;
  // aquí solo se SELECCIONA por universeKey (cero derivación de negocio).
  const nsUniverseRows = ns === null ? [] :
    ns.allRows.filter(r => universe === "ALL" || r.universeKey === universe);
  // Ranking REAL por universo en los 3 modos (UNIVERSE-RANKING-01):
  // el PA entrega los Records completos; aquí solo se SELECCIONA por key.
  const visibleProducts = tp === null ? [] :
    (productMode === "UNITS" ? tp.byUnits : productMode === "REVENUE" ? tp.byRevenue : tp.byRate)[universe];
  const productLimit = tp === null ? 0 : showAllProducts
    ? visibleProducts.length
    : (isMobile ? tp.visibleCount.mobile : tp.visibleCount.desktop);
  const momentumLimit = mm === null ? 0 : isMobile ? mm.visibleCount.mobile : mm.visibleCount.desktop;
  const noSalesLimit = ns === null ? 0 : isMobile ? ns.visibleCount.mobile : ns.visibleCount.desktop;
  const trendPoints = trendRange === "6M" ? pres.salesTrend.points.slice(-6) : trendRange === "12M" ? pres.salesTrend.points.slice(-12) : pres.salesTrend.points;

  // ── Secciones (compartidas por ambas composiciones) ──
  const heroCard = (
    <div style={{ ...panel, padding: S[3], background: C.white }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        Ventas · {pres.hero.periodLabel}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: S[2] }}>
        <span style={{ fontFamily: T.mono, fontSize: isMobile ? 26 : 24, fontWeight: T.wt.bold, letterSpacing: "-0.5px", color: C.ink }}>
          {pres.hero.salesText}
        </span>
        <span style={{ height: 30, flex: isMobile ? "0 0 110px" : "0 0 130px" }}>
          <ResponsiveContainer width="100%" height={30}>
            <AreaChart data={pres.hero.sparkline as any[]} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Area type="monotone" dataKey="value" stroke={C.blueDark} strokeWidth={2} fill={C.blueLight} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </span>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: TONE_TEXT[pres.hero.deltaTone] }}>
        {pres.hero.deltaText} <span style={{ fontWeight: T.wt.normal, fontSize: T.sz["2xs"], color: C.inkFaint }}>{pres.hero.deltaContextText}</span>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: S[1] }}>
        Facturas <strong style={{ color: C.ink }}>{pres.hero.invoicesText}</strong> · Ticket <strong style={{ color: C.ink }}>{pres.hero.ticketText}</strong> · <strong style={{ color: C.ink }}>{pres.hero.networkPositionText}</strong>
      </div>
    </div>
  );

  const readingCard = pres.reading.sentences.length > 0 && (
    <div style={{ border: `1px solid ${C.blueBorder}`, background: C.blueLight, borderRadius: R.md, padding: S[3] }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.blueDark, letterSpacing: "0.06em", marginBottom: S[1] }}>
        LECTURA DE AGENTIK
      </div>
      <p style={{ margin: 0, fontFamily: T.mono, fontSize: T.sz.sm, lineHeight: 1.55, color: C.ink }}>
        {pres.reading.sentences.join(" ")}
      </p>
    </div>
  );

  const trendCard = (
    <div style={{ ...panel, padding: S[3] }}>
      <SectionTitle right={
        <span style={{ display: "flex", gap: S[1] }} role="group" aria-label="Rango del gráfico">
          {pres.salesTrend.ranges.map(rg => (
            <Chip key={rg.key} active={trendRange === rg.key} onClick={() => setTrendRange(rg.key)}>{rg.label}</Chip>
          ))}
        </span>
      }>Evolución de ventas</SectionTitle>
      <ResponsiveContainer width="100%" height={isMobile ? 140 : 180}>
        <AreaChart data={trendPoints as any[]} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={C.lineSubtle} vertical={false} />
          <XAxis dataKey="label" tick={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fill: C.inkFaint }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={() => ""} width={4} axisLine={false} tickLine={false} />
          <Tooltip content={<TrendTooltip />} trigger={isMobile ? "click" : "hover"} />
          <Area type="monotone" dataKey="value" stroke={C.blueDark} strokeWidth={2} fill={C.blueLight} isAnimationActive={false}
            activeDot={{ r: 5, fill: C.white, stroke: C.blueDark, strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );

  const benchmarkCard = (
    <div style={{ ...panel, padding: S[3] }}>
      <SectionTitle right={<span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{pres.networkBenchmark.periodLabel}</span>}>
        {pres.networkBenchmark.title}
      </SectionTitle>
      {pres.networkBenchmark.stores.map(s => (
        <div key={s.storeName} style={{ display: "grid", gridTemplateColumns: "82px 1fr 66px", gap: S[2], alignItems: "center", marginBottom: S[1] }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: s.isCurrent ? T.wt.bold : T.wt.normal, color: s.isCurrent ? C.ink : C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {s.storeName}
          </span>
          <span style={{ height: 13, borderRadius: R.xs, background: C.lineSubtle, position: "relative", overflow: "hidden" }}>
            <span style={{ position: "absolute", inset: `0 auto 0 0`, width: `${s.barPct}%`, borderRadius: R.xs, background: s.isCurrent ? C.blueDark : C.inkGhost }} />
          </span>
          <span style={{ textAlign: "right", fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: s.isCurrent ? T.wt.bold : T.wt.normal, color: C.ink }}>{s.salesText}</span>
        </div>
      ))}
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: S[1], lineHeight: 1.6 }}>
        {pres.networkBenchmark.summaryText}
      </div>
    </div>
  );

  // ── Selector de universo comercial (VISUAL DIRECTION §2) — protagonista,
  //    lenguaje de filtros de Tiendas: label superior + activo azul + 44px ──
  const us = pres.universeSelector;
  const universeCard = us && (
    <div style={{ ...panel, padding: S[3], background: C.surface }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: S[2] }}>
        Universo comercial
      </div>
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }} role="group" aria-label="Universo comercial">
        {us.options.map(o => (
          <Chip key={o.key} big active={universe === o.key}
            onClick={() => { setUniverse(o.key); setShowAllProducts(false); setExpandedProduct(null); setNoSalesView("summary"); }}>
            {o.label}
          </Chip>
        ))}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: S[2] }}>
        {us.appliesToText}
      </div>
    </div>
  );

  const productsCard = tp && (
    <div style={{ ...panel, padding: S[3] }}>
      <SectionTitle right={
        <span style={{ display: "flex", gap: S[1] }} role="group" aria-label="Modo del ranking">
          {tp.modes.map(m => (
            <Chip key={m.key} active={productMode === m.key} onClick={() => { setProductMode(m.key); setShowAllProducts(false); setExpandedProduct(null); }}>{m.label}</Chip>
          ))}
        </span>
      }>{tp.title}</SectionTitle>
      {productMode === "RATE" && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[1] }}>
          {tp.rateContextText}
        </div>
      )}
      {visibleProducts.length === 0 && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, padding: S[2] }}>{tp.emptyText}</div>
      )}
      {visibleProducts.slice(0, productLimit).map(row => (
        <ProductRowView key={row.referenceCode} row={row} expanded={expandedProduct === row.referenceCode}
          onToggle={() => setExpandedProduct(expandedProduct === row.referenceCode ? null : row.referenceCode)} />
      ))}
      {visibleProducts.length > productLimit && (
        <button onClick={() => setShowAllProducts(true)} style={{ width: "100%", minHeight: 40, background: "none", border: "none", cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.blueDark }}>
          Ver más →
        </button>
      )}
    </div>
  );

  const momentumCard = mm && mmU && (
    <div style={{ ...panel, padding: S[3] }}>
      <SectionTitle right={<span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{mm.windowText}</span>}>
        {mm.title}
      </SectionTitle>
      {/* §6: resumen ejecutivo primero — acelerando/perdiendo ritmo mandan */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink, marginBottom: S[2] }}>
        {mmU.summaryText}
      </div>
      <div style={{ display: "flex", gap: S[1], flexWrap: "wrap", alignItems: "center", marginBottom: S[2] }}>
        {mmU.distribution.map(d => (
          <ToneBadge key={d.key} tone={d.tone} big={d.emphasized}>{d.arrow} {d.countText} {d.label.toLowerCase()}</ToneBadge>
        ))}
      </div>
      {mmU.accelerating.length > 0 && (
        <>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkMid, margin: `${S[1]}px 0` }}>EN CRECIMIENTO</div>
          {mmU.accelerating.slice(0, momentumLimit).map(r => <MomentumRowView key={r.referenceCode} row={r} />)}
        </>
      )}
      {mmU.decelerating.length > 0 && (
        <>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkMid, margin: `${S[1]}px 0` }}>PERDIENDO RITMO</div>
          {mmU.decelerating.slice(0, momentumLimit).map(r => <MomentumRowView key={r.referenceCode} row={r} />)}
        </>
      )}
    </div>
  );

  const filteredNoSales = nsUniverseRows
    .filter(r => {
      if (!noSalesSearch) return true;
      const q = noSalesSearch.toLowerCase();
      return r.referenceCode.toLowerCase().includes(q) || r.productName.toLowerCase().includes(q);
    })
    .sort((a, b) => noSalesSort === "stock"
      ? b.currentStock - a.currentStock
      : (b.daysSinceLastSale ?? -1) - (a.daysSinceLastSale ?? -1));

  const noSalesCard = ns && nsSummary && (
    <div style={{ ...panel, padding: S[3] }}>
      <SectionTitle right={<span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{ns.windowText}</span>}>
        {ns.title}
      </SectionTitle>
      {!ns.available && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, padding: S[2], background: C.surface, borderRadius: R.sm }}>
          {ns.unavailableText}
        </div>
      )}
      {ns.available && nsSummary.totalCount === 0 && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, padding: S[2] }}>{ns.emptyText}</div>
      )}
      {ns.available && nsSummary.totalCount > 0 && noSalesView === "summary" && (
        <>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, marginBottom: S[1] }}><strong>{nsSummary.summaryText}</strong></div>
          {nsUniverseRows.slice(0, noSalesLimit).map(r => <NoSalesRowView key={r.referenceCode} row={r} />)}
          {nsSummary.totalCount > noSalesLimit && (
            <button onClick={() => setNoSalesView("all")} style={{ width: "100%", minHeight: 40, background: "none", border: "none", cursor: "pointer", fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.blueDark }}>
              {nsSummary.viewAllText} →
            </button>
          )}
        </>
      )}
      {ns.available && noSalesView === "all" && (
        <>
          <div style={{ display: "flex", gap: S[2], marginBottom: S[2], flexWrap: "wrap" }}>
            <input value={noSalesSearch} onChange={e => setNoSalesSearch(e.target.value)}
              aria-label="Buscar por referencia o producto" placeholder="Buscar referencia o producto…"
              style={{ flex: 1, minWidth: 160, fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[2]}px ${S[3]}px`, border: `1px solid ${C.line}`, borderRadius: R.sm }} />
            <select value={noSalesSort} onChange={e => setNoSalesSort(e.target.value as "stock" | "days")}
              aria-label="Ordenar" style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], padding: `0 ${S[2]}px`, border: `1px solid ${C.line}`, borderRadius: R.sm }}>
              <option value="stock">Más inventario</option>
              <option value="days">Más días sin venta</option>
            </select>
            <Chip active={false} onClick={() => setNoSalesView("summary")}>Volver</Chip>
          </div>
          {filteredNoSales.map(r => <NoSalesRowView key={r.referenceCode} row={r} />)}
          {filteredNoSales.length === 0 && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, padding: S[2] }}>Sin resultados para esta búsqueda.</div>
          )}
        </>
      )}
      {ns.historyCaveatText && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: S[1] }}>{ns.historyCaveatText}</div>
      )}
    </div>
  );

  const linesCard = cp && (
    <div style={{ ...panel, padding: S[3] }}>
      <SectionTitle>{cp.title}</SectionTitle>
      {cp.rows.length === 0 && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, padding: S[2] }}>{cp.emptyText}</div>
      )}
      {cp.stacked.length > 0 && (
        <div style={{ display: "flex", height: 15, borderRadius: R.sm, overflow: "hidden", gap: 2, marginBottom: S[2] }} aria-hidden>
          {cp.stacked.map((seg, i) => (
            <span key={seg.name} style={{
              width: `${seg.sharePct < 1 ? 1 : seg.sharePct}%`,
              background: i === 0 ? C.blueDark : i === 1 ? C.blue : C.inkGhost,
              color: C.white, fontFamily: T.mono, fontSize: 8.5, fontWeight: T.wt.semibold,
              display: "flex", alignItems: "center", paddingLeft: 5, overflow: "hidden", whiteSpace: "nowrap",
            }}>
              {seg.sharePct >= 12 ? `${seg.name} ${seg.shareText}` : ""}
            </span>
          ))}
        </div>
      )}
      {cp.rows.map(row => (
        <div key={row.name} style={{ borderBottom: `1px solid ${C.lineSubtle}` }}>
          <button onClick={() => setExpandedLine(expandedLine === row.name ? null : row.name)} aria-expanded={expandedLine === row.name}
            style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: S[2], alignItems: "center", width: "100%", minHeight: 40, padding: `${S[1]}px 0`, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
            <span style={{ minWidth: 0, fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, display: "flex", alignItems: "center", gap: S[1] }}>
              <span>{expandedLine === row.name ? "▾" : "▸"} {row.name}</span>
              {row.worldTag && (
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkMid, background: C.surfaceAlt, borderRadius: R.pill, padding: "1px 7px" }}>
                  {row.worldTag}
                </span>
              )}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{row.revenueText} · {row.shareText}</span>
            <span style={{ textAlign: "right", fontFamily: T.mono, fontSize: T.sz["2xs"], color: TONE_TEXT[row.growthTone] }}>
              {row.growthText}
              <span style={{ display: "block", color: C.inkFaint }}>{row.growthContextText}</span>
            </span>
          </button>
          {expandedLine === row.name && row.groups.map(g => (
            <div key={g.name} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: S[2], padding: `${S[1]}px 0 ${S[1]}px ${S[4]}px`, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, borderTop: `1px solid ${C.lineSubtle}` }}>
              <span>{g.name}</span>
              <span>{g.revenueText}</span>
              <span style={{ color: TONE_TEXT[g.growthTone] }}>{g.growthText}</span>
            </div>
          ))}
        </div>
      ))}
      {cp.unclassifiedNote && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: S[1] }}>{cp.unclassifiedNote}</div>
      )}
    </div>
  );

  const historyCard = (
    <div style={{ ...panel, padding: S[3] }}>
      <SectionTitle right={pres.historicalGrowth.firstDataNote
        ? <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{pres.historicalGrowth.firstDataNote}</span>
        : undefined}>
        Crecimiento histórico
      </SectionTitle>
      {pres.historicalGrowth.rows.map(row => (
        isMobile ? (
          <div key={row.yearLabel} style={{ padding: `${S[1]}px 0`, borderBottom: `1px solid ${C.lineSubtle}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: T.mono, fontSize: T.sz.xs }}>
              <strong>{row.yearLabel}</strong>
              <span>{row.salesText} · <span style={{ color: TONE_TEXT[row.growthTone] }}>{row.growthText}</span></span>
            </div>
            {row.comparisonLabel && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{row.comparisonLabel}</div>
            )}
            <div style={{ height: 9, background: C.lineSubtle, borderRadius: R.xs, marginTop: 4, position: "relative", overflow: "hidden" }}>
              <span style={{ position: "absolute", inset: "0 auto 0 0", width: `${row.barPct}%`, background: C.blueDark, borderRadius: R.xs }} />
            </div>
          </div>
        ) : (
          <div key={row.yearLabel} style={{ display: "grid", gridTemplateColumns: "72px 84px 1fr 150px", gap: S[2], alignItems: "center", padding: `${S[1]}px 0`, borderBottom: `1px solid ${C.lineSubtle}`, fontFamily: T.mono, fontSize: T.sz.xs }}>
            <strong title={row.kindNote ?? undefined}>{row.yearLabel}</strong>
            <span>{row.salesText}</span>
            <span style={{ height: 10, background: C.lineSubtle, borderRadius: R.xs, position: "relative", overflow: "hidden" }}>
              <span style={{ position: "absolute", inset: "0 auto 0 0", width: `${row.barPct}%`, background: C.blueDark, borderRadius: R.xs }} />
            </span>
            <span style={{ textAlign: "right", color: TONE_TEXT[row.growthTone], fontSize: T.sz["2xs"] }}>
              {row.growthText}
              {row.comparisonLabel && <span style={{ display: "block", color: C.inkFaint }}>{row.comparisonLabel}</span>}
            </span>
          </div>
        )
      ))}
    </div>
  );

  const accountingCard = (
    <div style={{ ...panel, padding: `${S[2]}px ${S[3]}px` }}>
      <button onClick={() => setAccountingOpen(!accountingOpen)} aria-expanded={accountingOpen}
        style={{ display: "flex", justifyContent: "space-between", width: "100%", minHeight: 32, background: "none", border: "none", cursor: "pointer", fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.06em", alignItems: "center" }}>
        <span>{pres.accountingDetail.title}</span><span aria-hidden>{accountingOpen ? "▾" : "▸"}</span>
      </button>
      {accountingOpen && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.8, paddingTop: S[1] }}>
          {pres.accountingDetail.grossText}<br />
          {pres.accountingDetail.creditNotesText}<br />
          {pres.accountingDetail.documentsText}
        </div>
      )}
    </div>
  );

  const headerBlock = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: S[2], flexWrap: "wrap" }}>
        <div>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.bold, color: C.ink }}>{pres.header.title}</span>
          <span style={{ display: "block", fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            {pres.header.freshnessText}
            {pres.header.lagWarningText && (
              <span style={{ color: C.amber, fontWeight: T.wt.semibold }}> · {pres.header.lagWarningText}</span>
            )}
          </span>
        </div>
        <div style={{ display: "flex", gap: S[2], alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ display: "flex", gap: S[1] }} role="group" aria-label="Período de análisis">
            {pres.header.periodOptions.map(opt => (
              <Chip key={opt.key} active={periodKey === opt.key} onClick={() => onPeriodChange(opt.key as WindowId)}>{opt.label}</Chip>
            ))}
          </span>
          <ToneBadge tone={pres.header.trendTone}>{pres.header.trendArrow} {pres.header.trendLabel}</ToneBadge>
        </div>
      </div>
      {pres.dataState.partialBannerText && (
        <div role="status" style={{ background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberDark }}>
          ⚠ {pres.dataState.partialBannerText}
        </div>
      )}
    </>
  );

  const productSectionFailed = !productLoading && productIntel === null && productError;

  const productLocalState = (h: number) => productSectionFailed ? (
    <div style={{ ...panel, padding: S[3], textAlign: "center" }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginBottom: S[2] }}>
        No se pudo cargar la inteligencia de productos.
      </div>
      <Chip active={false} onClick={onRetryProduct}>Reintentar</Chip>
    </div>
  ) : <Skeleton h={h} />;

  // ── Composición móvil (<560px): secuencia editorial (§13: selector en 6) ──
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
        {headerBlock}
        {heroCard}
        {readingCard}
        {trendCard}
        {benchmarkCard}
        {universeCard}
        {pres.topProducts ? productsCard : productLocalState(140)}
        {pres.momentum ? momentumCard : productLocalState(100)}
        {pres.categoryPerformance ? linesCard : productLocalState(100)}
        {pres.noSales ? noSalesCard : productLocalState(100)}
        {historyCard}
        {accountingCard}
      </div>
    );
  }

  // ── Composición desktop (>=560px): 2 columnas con colapso fluido ──
  // El selector de universo separa lo certificado-general (evolución/red)
  // de la zona de producto que SÍ filtra (§3/§12).
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {headerBlock}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 340px) 1fr", gap: S[3] }}>
        {heroCard}
        {readingCard || <span />}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: S[3] }}>
        {trendCard}
        {benchmarkCard}
      </div>
      {universeCard}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: S[3] }}>
        {pres.topProducts ? productsCard : productLocalState(220)}
        {pres.momentum ? momentumCard : productLocalState(220)}
        {pres.categoryPerformance ? linesCard : productLocalState(180)}
        {pres.noSales ? noSalesCard : productLocalState(180)}
      </div>
      {historyCard}
      {accountingCard}
    </div>
  );
}
