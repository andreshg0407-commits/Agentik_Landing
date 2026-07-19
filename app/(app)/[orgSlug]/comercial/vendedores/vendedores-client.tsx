"use client";

/**
 * vendedores-client.tsx
 *
 * VENDEDORES-360-01 + VENDEDORES-DASHBOARD-01
 * Executive commercial dashboard + seller directory + lateral 360 drawer.
 *
 * 8 tabs: PERFIL | CLIENTES | VENTAS | RECAUDOS | CARTERA | METAS | COMISIONES | INTELIGENCIA
 *
 * Data sources: CRM quotes (primary), customer join (cartera), maletas.
 * "—" for absent data, never 0.
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { EmptyOperationalState, StatusChip } from "@/components/shell/operational-primitives";
import { OperationalSideDrawer } from "@/components/workspace/operational-side-drawer";
import { Panel, PanelHeader } from "@/components/shell/primitives";
import type { Vendedor360Data } from "@/lib/comercial/vendors/vendedor-360-types";

// ── Types ─────────────────────────────────────────────────────────────────────

type SellerActivityStatus = "activo" | "atencion" | "inactivo";

interface SellerCard {
  sellerName: string;
  sellerSlug: string;
  active: boolean;
  crmQuoteCount: number;
  customerCount: number;
  totalCrmAmount: number;
  lastActivityAt: string | null;
  firstActivityAt: string | null;
  quotesFacturado: number;
  quotesPendiente: number;
  quotesAnulado: number;
  traceabilityRate: number;
  daysSinceLastActivity: number | null;
  isActive: boolean;
  activityStatus: SellerActivityStatus;
}

interface Props {
  orgSlug: string;
  sellers: SellerCard[];
  totalSellers: number;
  activeSellers: number;
}

// ── Drawer tabs ───────────────────────────────────────────────────────────────

type DrawerTab = "perfil" | "clientes" | "ventas" | "recaudos" | "cartera" | "metas" | "comisiones" | "inteligencia";

const DRAWER_TABS: { key: DrawerTab; label: string }[] = [
  { key: "perfil",       label: "PERFIL" },
  { key: "clientes",     label: "CLIENTES" },
  { key: "ventas",       label: "VENTAS" },
  { key: "recaudos",     label: "RECAUDOS" },
  { key: "cartera",      label: "CARTERA" },
  { key: "metas",        label: "METAS" },
  { key: "comisiones",   label: "COMISIONES" },
  { key: "inteligencia", label: "INTELIGENCIA" },
];

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCurrency(value: number): string {
  if (value === 0) return "\u2014";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString("es-CO")}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDaysAgo(iso: string | null): string {
  if (!iso) return "\u2014";
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days <= 30) return `${days}d`;
  if (days <= 365) return `${Math.round(days / 30)}m`;
  return `${(days / 365).toFixed(1)}a`;
}

function fmtNum(n: number): string {
  return n === 0 ? "\u2014" : n.toLocaleString("es-CO");
}

// ── Health helpers ─────────────────────────────────────────────────────────────
// VENDEDORES-ACTIVITY-AUDIT-01: 3-state rule
// activo = actividad CRM reciente (< 90d)
// atencion = sin actividad reciente pero con presencia comercial (pedidos/clientes)
// inactivo = sin presencia comercial alguna

function sellerHealth(s: SellerCard): "ok" | "warning" | "critical" | "neutral" {
  if (s.activityStatus === "inactivo") return "neutral";
  if (s.activityStatus === "atencion") {
    // Within "atencion", check for quality issues
    if (s.quotesAnulado > s.quotesFacturado && s.crmQuoteCount > 2) return "critical";
    return "warning";
  }
  // activo
  if (s.quotesAnulado > s.quotesFacturado) return "critical";
  if (s.quotesPendiente > s.quotesFacturado) return "warning";
  return "ok";
}

function healthLabel(h: "ok" | "warning" | "critical" | "neutral"): string {
  switch (h) {
    case "ok": return "Activo";
    case "warning": return "Atencion";
    case "critical": return "Riesgo";
    case "neutral": return "Inactivo";
  }
}

type StatusVariant = "ok" | "pending" | "warning" | "critical" | "info";

function healthToVariant(h: "ok" | "warning" | "critical" | "neutral"): StatusVariant {
  if (h === "neutral") return "pending";
  return h;
}

function orderStageVariant(stage: string): StatusVariant {
  const s = stage.toLowerCase().replace(/[_\s]+/g, "_");
  if (s === "facturado") return "ok";
  if (s === "anulado" || s === "cancelado") return "critical";
  if (s === "remisionado" || s.includes("gestionado")) return "pending";
  if (s === "borrador" || s === "draft") return "info";
  return "warning";
}

function orderStageLabel(stage: string): string {
  const s = stage.toLowerCase().replace(/[_\s]+/g, "_");
  if (s === "no_gestionado") return "Pendiente";
  if (s === "gestionado_parcialmente" || s === "gestionado_parcial") return "Parcial";
  if (s === "gestionado") return "Gestionado";
  if (s === "facturado") return "Facturado";
  if (s === "anulado" || s === "cancelado") return "Cancelado";
  if (s === "remisionado") return "Remisionado";
  if (s === "borrador" || s === "draft") return "Borrador";
  if (s === "pendiente" || s === "pending") return "Pendiente";
  if (s === "confirmado") return "Confirmado";
  if (s === "open") return "Abierto";
  if (s === "closed") return "Cerrado";
  // Fallback: capitalize first word only
  return stage.split(/[_\s]+/)[0].charAt(0).toUpperCase() + stage.split(/[_\s]+/)[0].slice(1).toLowerCase();
}

function sagStatusLabel(status: string): string {
  const s = status.toUpperCase();
  if (s === "PENDIENTE") return "Pendiente";
  if (s === "FACTURADO") return "Facturado";
  if (s === "DESPACHADO") return "Despachado";
  if (s === "EN_PROCESO") return "En proceso";
  if (s === "CANCELADO") return "Cancelado";
  if (s === "ENTREGADO") return "Entregado";
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replace(/_/g, " ");
}

// ── Main Component ────────────────────────────────────────────────────────────

export function VendedoresClient({ orgSlug, sellers, totalSellers, activeSellers }: Props) {
  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSellerSlug, setDrawerSellerSlug] = useState<string | null>(null);
  const [drawerSellerName, setDrawerSellerName] = useState("");
  const [drawerData, setDrawerData] = useState<Vendedor360Data | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("perfil");

  const openDrawer = useCallback((seller: SellerCard) => {
    setDrawerSellerSlug(seller.sellerSlug);
    setDrawerSellerName(seller.sellerName);
    setDrawerData(null);
    setDrawerError(false);
    setDrawerTab("perfil");
    setDrawerOpen(true);
    setDrawerLoading(true);
  }, []);

  // Fetch 360 data when drawer opens
  useEffect(() => {
    if (!drawerLoading || !drawerSellerSlug) return;
    let cancelled = false;

    fetch(`/api/orgs/${orgSlug}/comercial/vendedores/${encodeURIComponent(drawerSellerSlug)}`)
      .then(res => {
        if (!res.ok) throw new Error("not_found");
        return res.json();
      })
      .then((data: Vendedor360Data) => {
        if (!cancelled) {
          setDrawerData(data);
          setDrawerLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDrawerError(true);
          setDrawerLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [drawerLoading, drawerSellerSlug, orgSlug]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerSellerSlug(null);
  };

  const operativeCount = sellers.filter(s => s.activityStatus !== "inactivo").length;
  const headerStatus = totalSellers === 0 ? ("warning" as const) : ("ok" as const);
  const headerStatusLabel = totalSellers === 0
    ? "Pendiente integracion CRM"
    : `${totalSellers} vendedor(es) \u00B7 ${operativeCount} operativo(s)`;

  // ── Dashboard computations ───────────────────────────────────────────────────
  const dashboard = useMemo(() => {
    if (sellers.length === 0) return null;

    const activos = sellers.filter(s => s.activityStatus === "activo");
    const enAtencion = sellers.filter(s => s.activityStatus === "atencion");
    const inactivos = sellers.filter(s => s.activityStatus === "inactivo");
    const operativos = sellers.filter(s => s.activityStatus !== "inactivo"); // activo + atencion
    const totalClientes = sellers.reduce((a, s) => a + s.customerCount, 0);
    const totalPedidos = sellers.reduce((a, s) => a + s.crmQuoteCount, 0);
    const totalValor = sellers.reduce((a, s) => a + s.totalCrmAmount, 0);
    const avgPedidosPorVendedor = operativos.length > 0 ? Math.round(totalPedidos / operativos.length) : 0;
    const avgValorPorVendedor = operativos.length > 0 ? Math.round(totalValor / operativos.length) : 0;

    // Top performers by Valor CRM
    const ranked = [...sellers].sort((a, b) => b.totalCrmAmount - a.totalCrmAmount);
    const top3 = ranked.slice(0, 3);

    // Commercial intelligence (auto-detected insights)
    const insights: { type: "risk" | "opportunity" | "info"; title: string; detail: string }[] = [];

    if (inactivos.length > 0) {
      insights.push({
        type: "risk",
        title: `${inactivos.length} vendedor(es) sin presencia comercial`,
        detail: `Sin clientes ni pedidos registrados: ${inactivos.map(s => s.sellerName.split(" ")[0]).join(", ")}`,
      });
    }

    if (enAtencion.length > 0 && activos.length === 0) {
      insights.push({
        type: "info",
        title: "Actividad CRM baja",
        detail: `No se encontraron cotizaciones recientes en SuiteCRM. Validar si el equipo comercial esta registrando cotizaciones y pedidos en CRM.`,
      });
    }

    const highAnulacion = sellers.filter(s => s.quotesAnulado > s.quotesFacturado && s.crmQuoteCount > 2 && s.activityStatus !== "inactivo");
    if (highAnulacion.length > 0) {
      insights.push({
        type: "risk",
        title: "Tasa de anulacion alta",
        detail: `${highAnulacion.map(s => s.sellerName.split(" ")[0]).join(", ")} anulan mas de lo que facturan.`,
      });
    }

    const lowTraceability = sellers.filter(s => s.traceabilityRate < 30 && s.crmQuoteCount > 3 && s.activityStatus !== "inactivo");
    if (lowTraceability.length > 0) {
      insights.push({
        type: "opportunity",
        title: "Trazabilidad SAG baja",
        detail: `${lowTraceability.map(s => s.sellerName.split(" ")[0]).join(", ")} tienen <30% de enlace CRM→SAG.`,
      });
    }

    const topPerformer = top3[0];
    if (topPerformer && totalValor > 0) {
      const pct = Math.round((topPerformer.totalCrmAmount / totalValor) * 100);
      if (pct > 60) {
        insights.push({
          type: "info",
          title: "Alta concentracion",
          detail: `${topPerformer.sellerName.split(" ")[0]} representa el ${pct}% del valor CRM total.`,
        });
      }
    }

    // Alerts
    const alerts: { severity: "warning" | "critical"; message: string }[] = [];
    if (inactivos.length >= Math.ceil(sellers.length * 0.5)) {
      alerts.push({ severity: "critical", message: `${inactivos.length} de ${sellers.length} vendedores sin presencia comercial — riesgo de cobertura.` });
    }
    const noClients = sellers.filter(s => s.customerCount === 0 && s.activityStatus === "activo");
    if (noClients.length > 0) {
      alerts.push({ severity: "warning", message: `${noClients.length} vendedor(es) activo(s) sin clientes asignados.` });
    }

    // Health score (simple 0-100)
    // operativos (activo+atencion) / total → base 50. Avg traceability → up to 50.
    const operativeRate = sellers.length > 0 ? operativos.length / sellers.length : 0;
    const avgTraceability = operativos.length > 0 ? operativos.reduce((a, s) => a + s.traceabilityRate, 0) / operativos.length : 0;
    const healthScore = Math.round((operativeRate * 50) + (Math.min(avgTraceability, 100) * 0.5));

    return { activos, enAtencion, inactivos, operativos, totalClientes, totalPedidos, totalValor, avgPedidosPorVendedor, avgValorPorVendedor, top3, ranked, insights, alerts, healthScore };
  }, [sellers]);

  return (
    <div style={{ padding: S[6], maxWidth: 1400 }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Comercial", href: `/${orgSlug}/comercial/maletas` },
          { label: "Vendedores" },
        ]}
        title="Vendedores"
        subtitle="Consola de inteligencia comercial"
        status={headerStatus}
        statusLabel={headerStatusLabel}
      />

      {sellers.length === 0 ? (
        <EmptyOperationalState
          message="Sin vendedores registrados"
          detail="Los vendedores se consolidan automaticamente desde CRM."
        />
      ) : dashboard ? (
        <div style={{ display: "flex", flexDirection: "column", gap: S[5] }}>

          {/* ── Phase 1: Executive KPI Summary Band ─────────────────────────── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: S[3],
          }}>
            <DashboardKpi label="Vendedores operativos" value={`${dashboard.operativos.length}`} sub={`${dashboard.activos.length} activos \u00B7 ${dashboard.enAtencion.length} atencion`} />
            <DashboardKpi label="Clientes asignados" value={fmtNum(dashboard.totalClientes)} />
            <DashboardKpi label="Pedidos CRM" value={fmtNum(dashboard.totalPedidos)} sub={`${dashboard.avgPedidosPorVendedor} avg/vendedor`} />
            <DashboardKpi label="Valor CRM total" value={fmtCurrency(dashboard.totalValor)} sub={`${fmtCurrency(dashboard.avgValorPorVendedor)} avg`} />
            <DashboardKpi label="Salud comercial" value={`${dashboard.healthScore}%`} variant={dashboard.healthScore >= 70 ? "ok" : dashboard.healthScore >= 40 ? "warning" : "critical"} />
          </div>

          {/* ── Phase 4: Operational Alerts ─────────────────────────────────── */}
          {dashboard.alerts.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
              {dashboard.alerts.map((a, i) => (
                <div key={i} style={{
                  padding: `${S[2]}px ${S[3]}px`,
                  background: a.severity === "critical" ? C.redLight : C.amberLight,
                  border: `1px solid ${a.severity === "critical" ? C.redBorder : C.amberBorder}`,
                  borderRadius: R.card,
                  fontFamily: T.mono,
                  fontSize: T.sz.xs,
                  color: a.severity === "critical" ? C.red : C.amber,
                  fontWeight: T.wt.bold,
                }}>
                  {a.message}
                </div>
              ))}
            </div>
          )}

          {/* ── Phase 2: Top Performers + Phase 3: Intelligence (side by side) */}
          <div style={{
            display: "grid",
            gridTemplateColumns: dashboard.insights.length > 0 ? "1fr 1fr" : "1fr",
            gap: S[4],
          }}>
            {/* Top performers */}
            <Panel>
              <PanelHeader title="Top vendedores" badge={
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>por valor CRM</span>
              } />
              <div style={{ padding: S[3], display: "flex", flexDirection: "column", gap: S[2] }}>
                {dashboard.top3.map((s, i) => {
                  const medal = i === 0 ? "\u{1F3C6}" : i === 1 ? "\u{1F948}" : "\u{1F949}";
                  return (
                    <div key={s.sellerSlug} style={{
                      display: "grid",
                      gridTemplateColumns: "24px 1fr 80px",
                      gap: S[2],
                      alignItems: "center",
                      padding: `${S[2]}px ${S[2]}px`,
                      background: i === 0 ? C.blueLight : "transparent",
                      borderRadius: R.card,
                    }}>
                      <span style={{ fontSize: 14, textAlign: "center" }}>{medal}</span>
                      <div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                          {s.sellerName}
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
                          {fmtNum(s.crmQuoteCount)} pedidos \u00B7 {fmtNum(s.customerCount)} clientes
                        </div>
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.black, color: C.ink, textAlign: "right" }}>
                        {fmtCurrency(s.totalCrmAmount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            {/* Commercial intelligence */}
            {dashboard.insights.length > 0 && (
              <Panel>
                <PanelHeader title="Inteligencia comercial" />
                <div style={{ padding: S[3], display: "flex", flexDirection: "column", gap: S[2] }}>
                  {dashboard.insights.map((ins, i) => (
                    <div key={i} style={{
                      padding: `${S[2]}px ${S[3]}px`,
                      background: ins.type === "risk" ? C.redLight : ins.type === "opportunity" ? C.blueLight : C.surface,
                      border: `1px solid ${ins.type === "risk" ? C.redBorder : ins.type === "opportunity" ? C.blueBorder : C.lineSubtle}`,
                      borderRadius: R.card,
                    }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: ins.type === "risk" ? C.red : ins.type === "opportunity" ? C.blueDark : C.ink, marginBottom: 2 }}>
                        {ins.title}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                        {ins.detail}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>

          {/* ── Phase 7: PYA Preparation ───────────────────────────────────── */}
          <div style={{
            padding: `${S[3]}px ${S[4]}px`,
            background: C.amberLight,
            border: `1px solid ${C.amberBorder}`,
            borderRadius: R.card,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.amber, marginBottom: 2 }}>
              Proximamente: Metas, Comisiones y Recaudos
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
              Cuando se habilite la bodega analitica PYA, esta consola incluira metas de venta, comisiones acumuladas y eficiencia de recaudo por vendedor.
            </div>
          </div>

          {/* ── Phase 5: Seller Cards Grid (with ranking badges) ──────────── */}
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink, marginBottom: S[3] }}>
              Directorio de vendedores
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: S[4],
            }}>
              {dashboard.ranked.map((seller, idx) => (
                <SellerProfileCard
                  key={seller.sellerSlug}
                  seller={seller}
                  selected={seller.sellerSlug === drawerSellerSlug}
                  onOpen={() => openDrawer(seller)}
                  rank={idx < 3 ? (idx + 1) as 1 | 2 | 3 : undefined}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Drawer 360 ─────────────────────────────────────────────────────── */}
      <OperationalSideDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={drawerSellerName}
        subtitle="Perfil comercial 360"
        size="wide"
        severity="info"
        statusLabel="VENDEDOR"
      >
        {drawerLoading ? (
          <DrawerLoadingState />
        ) : drawerError ? (
          <DrawerErrorState />
        ) : drawerData ? (
          <DrawerContent
            data={drawerData}
            tab={drawerTab}
            onTabChange={setDrawerTab}
            orgSlug={orgSlug}
          />
        ) : null}
      </OperationalSideDrawer>
    </div>
  );
}

// ── Seller Profile Card ───────────────────────────────────────────────────────

function SellerProfileCard({
  seller,
  selected,
  onOpen,
  rank,
}: {
  seller: SellerCard;
  selected: boolean;
  onOpen: () => void;
  rank?: 1 | 2 | 3;
}) {
  const health = sellerHealth(seller);
  const rankMedal = rank === 1 ? "\u{1F3C6}" : rank === 2 ? "\u{1F948}" : rank === 3 ? "\u{1F949}" : null;

  return (
    <button
      onClick={onOpen}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: S[3],
        padding: S[4],
        border: selected ? `1.5px solid ${C.blueDark}` : `1px solid ${C.line}`,
        borderRadius: R.card,
        background: selected ? C.blueLight : C.white,
        boxShadow: selected ? E.sm : E.xs,
        cursor: "pointer",
        textAlign: "left" as const,
        width: "100%",
        transition: "all 120ms ease",
      }}
    >
      {/* Header row: avatar + identity */}
      <div style={{ display: "flex", gap: S[3], alignItems: "center" }}>
        {/* Avatar circle with initials + rank badge */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: R.pill,
            background: C.blueDark,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: "#fff" }}>
              {seller.sellerName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
            </span>
          </div>
          {rankMedal && (
            <span style={{ position: "absolute", top: -4, right: -4, fontSize: 14 }}>{rankMedal}</span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: T.mono,
            fontSize: T.sz.md,
            fontWeight: T.wt.bold,
            color: C.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {seller.sellerName}
          </div>
          <div style={{
            display: "flex",
            gap: S[2],
            alignItems: "center",
            marginTop: 2,
          }}>
            <StatusChip variant={healthToVariant(health)}>
              {healthLabel(health)}
            </StatusChip>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
              {fmtDaysAgo(seller.lastActivityAt)}
            </span>
          </div>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: S[2],
      }}>
        <CardMiniKpi label="Clientes" value={fmtNum(seller.customerCount)} />
        <CardMiniKpi label="Pedidos CRM" value={fmtNum(seller.crmQuoteCount)} />
        <CardMiniKpi label="Valor CRM" value={fmtCurrency(seller.totalCrmAmount)} />
      </div>

      {/* Bottom row: facturado / pendiente / SAG */}
      <div style={{
        display: "flex",
        gap: S[3],
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkMid,
      }}>
        <span>Facturado: {fmtNum(seller.quotesFacturado)}</span>
        <span>Pendiente: {fmtNum(seller.quotesPendiente)}</span>
        <span>SAG: {seller.traceabilityRate}%</span>
      </div>

      {/* Action row */}
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        fontWeight: T.wt.bold,
        color: C.blueDark,
        textTransform: "uppercase" as const,
        letterSpacing: "0.06em",
      }}>
        Abrir perfil
      </div>
    </button>
  );
}

function CardMiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: `${S[1]}px ${S[2]}px`,
      background: C.surface,
      borderRadius: R.sm,
      border: `1px solid ${C.lineSubtle}`,
    }}>
      <div style={{
        fontFamily: T.mono,
        fontSize: 9,
        fontWeight: T.wt.bold,
        color: C.inkLight,
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
        marginBottom: 1,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz.sm,
        fontWeight: T.wt.black,
        color: C.ink,
      }}>
        {value}
      </div>
    </div>
  );
}

// ── Dashboard KPI ────────────────────────────────────────────────────────────

function DashboardKpi({ label, value, sub, variant }: { label: string; value: string; sub?: string; variant?: "ok" | "warning" | "critical" }) {
  const bg = variant === "ok" ? C.greenLight : variant === "warning" ? C.amberLight : variant === "critical" ? C.redLight : C.surface;
  const border = variant === "ok" ? C.greenBorder : variant === "warning" ? C.amberBorder : variant === "critical" ? C.redBorder : C.lineSubtle;
  const valueColor = variant === "ok" ? C.green : variant === "warning" ? C.amber : variant === "critical" ? C.red : C.ink;

  return (
    <div style={{
      padding: `${S[3]}px ${S[3]}px`,
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: R.card,
    }}>
      <div style={{
        fontFamily: T.mono,
        fontSize: 9,
        fontWeight: T.wt.bold,
        color: C.inkLight,
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz.xl,
        fontWeight: T.wt.black,
        color: valueColor,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          color: C.inkLight,
          marginTop: 2,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Drawer Loading / Error States ─────────────────────────────────────────────

function DrawerLoadingState() {
  return (
    <div style={{ padding: S[8], textAlign: "center" }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
        Cargando perfil 360...
      </span>
    </div>
  );
}

function DrawerErrorState() {
  return (
    <div style={{ padding: S[8], textAlign: "center" }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.red }}>
        No se pudo cargar el perfil.
      </span>
    </div>
  );
}

// ── Drawer Content ────────────────────────────────────────────────────────────

function DrawerContent({
  data,
  tab,
  onTabChange,
  orgSlug,
}: {
  data: Vendedor360Data;
  tab: DrawerTab;
  onTabChange: (t: DrawerTab) => void;
  orgSlug: string;
}) {
  const { identity, intelligence } = data;
  const health = identity.active ? "ok" as const : "neutral" as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {/* ── Identity Header ──────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        gap: S[4],
        alignItems: "center",
        padding: `${S[3]}px 0`,
      }}>
        {/* Large avatar */}
        <div style={{
          width: 56,
          height: 56,
          borderRadius: R.pill,
          background: C.blueDark,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: "#fff" }}>
            {identity.sellerName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
          </span>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: T.mono,
            fontSize: T.sz.xl,
            fontWeight: T.wt.black,
            color: C.titleDeep,
            marginBottom: 2,
          }}>
            {identity.sellerName}
          </div>
          <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
            <StatusChip variant={healthToVariant(health)}>
              {identity.active ? "Activo" : "Inactivo"}
            </StatusChip>
            {identity.firstActivityAt && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
                Desde {fmtDate(identity.firstActivityAt)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Score KPIs */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: S[2],
      }}>
        <MiniKpi label="Clientes" value={fmtNum(identity.customerCount)} />
        <MiniKpi label="Pedidos" value={fmtNum(identity.crmQuoteCount)} />
        <MiniKpi label="Cartera" value={fmtCurrency(data.cartera.totalBalance)} />
        <MiniKpi
          label="Score"
          value={identity.active ? (data.intelligence.riesgos.length === 0 ? "Bueno" : "Revisar") : "\u2014"}
        />
      </div>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div style={{
        display: "flex",
        gap: 0,
        borderBottom: `1px solid ${C.line}`,
        overflowX: "auto",
      }}>
        {DRAWER_TABS.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              style={{
                fontFamily: T.mono,
                fontSize: T.sz["2xs"],
                fontWeight: active ? T.wt.bold : T.wt.medium,
                color: active ? C.blueDark : C.inkMid,
                padding: `${S[2]}px ${S[3]}px`,
                borderBottom: active ? `2px solid ${C.blueDark}` : "2px solid transparent",
                background: "none",
                border: "none",
                borderBottomStyle: "solid",
                borderBottomWidth: 2,
                borderBottomColor: active ? C.blueDark : "transparent",
                cursor: "pointer",
                whiteSpace: "nowrap",
                textTransform: "uppercase" as const,
                letterSpacing: "0.04em",
                transition: "all 100ms ease",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────────── */}
      {tab === "perfil" && <TabPerfil data={data} />}
      {tab === "clientes" && <TabClientes data={data} orgSlug={orgSlug} />}
      {tab === "ventas" && <TabVentas data={data} />}
      {tab === "recaudos" && <TabRecaudos />}
      {tab === "cartera" && <TabCartera data={data} />}
      {tab === "metas" && <TabMetas />}
      {tab === "comisiones" && <TabComisiones />}
      {tab === "inteligencia" && <TabInteligencia data={data} />}
    </div>
  );
}

// ── MiniKpi ───────────────────────────────────────────────────────────────────

function MiniKpi({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div style={{
      padding: `${S[2]}px ${S[3]}px`,
      background: alert ? C.redLight : C.surface,
      borderRadius: R.card,
      border: `1px solid ${alert ? C.redBorder : C.lineSubtle}`,
    }}>
      <div style={{
        fontFamily: T.mono,
        fontSize: 9,
        fontWeight: T.wt.bold,
        color: C.inkLight,
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
        marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono,
        fontSize: T.sz.lg,
        fontWeight: T.wt.black,
        color: alert ? C.red : C.ink,
      }}>
        {value}
      </div>
    </div>
  );
}

// ── Preview Table (show N items + "Ver más") ─────────────────────────────────

const PREVIEW_LIMIT = 10;

function usePreview<T>(items: T[], limit = PREVIEW_LIMIT) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, limit);
  const hasMore = items.length > limit;
  return { visible, expanded, hasMore, remaining: items.length - limit, toggle: () => setExpanded(v => !v) };
}

function PreviewToggle({ hasMore, expanded, remaining, toggle }: { hasMore: boolean; expanded: boolean; remaining: number; toggle: () => void }) {
  if (!hasMore) return null;
  return (
    <button
      onClick={toggle}
      style={{
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        fontWeight: T.wt.bold,
        color: C.blueDark,
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: `${S[2]}px ${S[4]}px`,
        textTransform: "uppercase" as const,
        letterSpacing: "0.04em",
      }}
    >
      {expanded ? "Ver menos" : `Ver ${remaining} mas`}
    </button>
  );
}

// ── Source Tag ────────────────────────────────────────────────────────────────

function SourceTag({ source }: { source: "CRM" | "SAG" | "PYA" }) {
  const bg = source === "CRM" ? C.blueLight : source === "SAG" ? C.surface : C.amberLight;
  const color = source === "CRM" ? C.blueDark : source === "SAG" ? C.inkMid : C.amber;
  const border = source === "CRM" ? C.blueBorder : source === "SAG" ? C.lineSubtle : C.amberBorder;
  return (
    <span style={{
      fontFamily: T.mono,
      fontSize: 9,
      fontWeight: T.wt.bold,
      color,
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: R.pill,
      padding: "1px 6px",
      textTransform: "uppercase" as const,
      letterSpacing: "0.04em",
    }}>
      {source}
    </span>
  );
}

// ── PYA Pending Banner ────────────────────────────────────────────────────────

function PyaPendingBanner({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: `${S[3]}px ${S[4]}px`,
      background: C.amberLight,
      border: `1px solid ${C.amberBorder}`,
      borderRadius: R.card,
      marginBottom: S[3],
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.amber, marginBottom: 2 }}>
        Disponible cuando se habilite la bodega analitica PYA
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
        {children}
      </div>
    </div>
  );
}

// ── Provisional Banner ────────────────────────────────────────────────────────

function ProvisionalBanner() {
  return (
    <div style={{
      padding: `${S[3]}px ${S[4]}px`,
      background: C.amberLight,
      border: `1px solid ${C.amberBorder}`,
      borderRadius: R.card,
      marginBottom: S[3],
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
        Informacion provisional. Pendiente conciliacion con bodega analitica.
      </div>
    </div>
  );
}

// ── Tab: Perfil ───────────────────────────────────────────────────────────────

function TabPerfil({ data }: { data: Vendedor360Data }) {
  const { identity } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      <Panel>
        <PanelHeader title="Informacion del vendedor" />
        <div style={{ padding: S[3] }}>
          <div className="ag-op-table">
            <InfoRow label="Nombre" value={identity.sellerName} />
            <InfoRow label="Codigo SAG" value={identity.sagName ?? "\u2014"} />
            <InfoRow label="Estado" value={identity.active ? "Activo" : "Inactivo"} />
            <InfoRow label="Slug" value={identity.sellerSlug} />
            <InfoRow label="Primera actividad" value={fmtDate(identity.firstActivityAt)} />
            <InfoRow label="Ultima actividad" value={fmtDate(identity.lastActivityAt)} />
            <InfoRow label="Clientes asignados" value={fmtNum(identity.customerCount)} />
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader title="Cobertura comercial" />
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: S[2],
          padding: S[3],
        }}>
          <MiniKpi label="Clientes activos" value={fmtNum(data.intelligence.clientesActivos)} />
          <MiniKpi label="Clientes con cartera" value={fmtNum(data.cartera.items.length)} />
          <MiniKpi label="Pedidos CRM" value={fmtNum(identity.crmQuoteCount)} />
          <MiniKpi label="Pedidos SAG" value={fmtNum(data.sagOrders.items.length)} />
        </div>
      </Panel>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="ag-op-row" style={{
      display: "grid",
      gridTemplateColumns: "140px 1fr",
      gap: S[3],
      padding: `${S[1]}px ${S[4]}px`,
      fontFamily: T.mono,
      fontSize: T.sz.xs,
    }}>
      <span style={{ color: C.inkLight, fontWeight: T.wt.bold }}>{label}</span>
      <span style={{ color: C.ink }}>{value}</span>
    </div>
  );
}

// ── Tab: Clientes ─────────────────────────────────────────────────────────────

function TabClientes({ data, orgSlug }: { data: Vendedor360Data; orgSlug: string }) {
  const { clients } = data;
  const preview = usePreview(clients.items);

  if (clients.state === "no_disponible" || clients.items.length === 0) {
    return <EmptyOperationalState message="Sin clientes asignados" detail="No se encontraron clientes con cotizaciones CRM para este vendedor." />;
  }

  // Determine if "Última compra" column has data worth showing
  const hasLastPurchase = clients.items.some(c => c.lastPurchaseAt !== null);
  const GRID = hasLastPurchase
    ? "1fr 90px 80px 90px 80px"
    : "1fr 90px 80px 90px";

  return (
    <div>
      <div style={{ marginBottom: S[3], fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, display: "flex", gap: S[2], alignItems: "center" }}>
        <SourceTag source="CRM" />
        {clients.items.length} cliente(s) asociado(s) via cotizaciones
      </div>
      <div className="ag-op-table">
        {/* Header */}
        <div className="ag-op-row" style={{
          display: "grid",
          gridTemplateColumns: GRID,
          gap: S[2],
          padding: `${S[1]}px ${S[4]}px`,
          fontFamily: T.mono,
          fontSize: T.sz["2xs"],
          fontWeight: T.wt.bold,
          color: C.inkLight,
          textTransform: "uppercase" as const,
          letterSpacing: "0.04em",
          borderBottom: `1px solid ${C.line}`,
        }}>
          <span>Cliente</span>
          <span>Ciudad</span>
          <span style={{ textAlign: "right" }}>Cartera</span>
          <span>Estado</span>
          {hasLastPurchase && <span>Ultima compra</span>}
        </div>
        {preview.visible.map(c => (
          <div
            key={c.profileId}
            className="ag-op-row"
            style={{
              display: "grid",
              gridTemplateColumns: GRID,
              gap: S[2],
              padding: `${S[2]}px ${S[4]}px`,
              fontFamily: T.mono,
              fontSize: T.sz.xs,
              cursor: "pointer",
              borderBottom: `1px solid ${C.lineSubtle}`,
            }}
            onClick={() => {
              window.location.href = `/${orgSlug}/comercial/clientes?q=${encodeURIComponent(c.name)}`;
            }}
          >
            <span style={{ color: C.ink, fontWeight: T.wt.medium, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {c.name}
            </span>
            <span style={{ color: C.inkMid }}>{c.city ?? "\u2014"}</span>
            <span style={{ textAlign: "right", color: c.carteraBalance > 0 ? C.red : C.inkMid, fontWeight: c.carteraBalance > 0 ? T.wt.bold : T.wt.normal }}>
              {fmtCurrency(c.carteraBalance)}
            </span>
            <span style={{ overflow: "hidden" }}>
              <StatusChip variant={clientStatusVariant(c.status, c.lastPurchaseAt)}>
                {clientStatusLabel(c.status, c.lastPurchaseAt)}
              </StatusChip>
            </span>
            {hasLastPurchase && (
              <span style={{ color: C.inkMid }}>{fmtDaysAgo(c.lastPurchaseAt)}</span>
            )}
          </div>
        ))}
      </div>
      <PreviewToggle {...preview} />
    </div>
  );
}

function clientStatusVariant(status: string, lastPurchaseAt: string | null): StatusVariant {
  if (status === "ACTIVE") return "ok";
  if (status === "BLOCKED" || status === "CHURNED") return "critical";
  // Inactive with no recent purchase
  if (lastPurchaseAt) {
    const days = Math.round((Date.now() - new Date(lastPurchaseAt).getTime()) / 86400000);
    if (days > 90) return "warning";
  }
  return "pending";
}

function clientStatusLabel(status: string, lastPurchaseAt: string | null): string {
  if (status === "ACTIVE") return "Activo";
  if (status === "BLOCKED") return "Bloqueado";
  if (status === "CHURNED") return "Perdido";
  if (lastPurchaseAt) {
    const days = Math.round((Date.now() - new Date(lastPurchaseAt).getTime()) / 86400000);
    if (days > 90) return "Sin compras";
  }
  return "Inactivo";
}

// ── Tab: Ventas ───────────────────────────────────────────────────────────────
// VENDEDORES-DATA-REFINEMENT-01
// Conceptual separation:
//   VENTAS = actividad CRM (cotizaciones generadas en SuiteCRM)
//   FACTURAS = documentos SAG (pedidos confirmados en ERP)
// Preview pattern: show 10 items + "Ver más"

function TabVentas({ data }: { data: Vendedor360Data }) {
  const { crmQuotes, sagOrders, identity } = data;
  const crmPreview = usePreview(crmQuotes.items);
  const sagPreview = usePreview(sagOrders.items);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {/* Summary KPIs with source attribution */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: S[2],
      }}>
        <MiniKpi label="Cotizaciones CRM" value={fmtNum(identity.crmQuoteCount)} />
        <MiniKpi label="Pedidos SAG" value={fmtNum(sagOrders.items.length)} />
        <MiniKpi label="Valor CRM" value={fmtCurrency(identity.totalCrmAmount)} />
        <MiniKpi label="Ultima cotizacion" value={fmtDaysAgo(identity.lastActivityAt)} />
      </div>

      {/* Data flow explanation */}
      <div style={{
        padding: `${S[2]}px ${S[3]}px`,
        background: C.surface,
        border: `1px solid ${C.lineSubtle}`,
        borderRadius: R.card,
        fontFamily: T.mono,
        fontSize: T.sz["2xs"],
        color: C.inkMid,
        display: "flex",
        gap: S[3],
        alignItems: "center",
      }}>
        <span><SourceTag source="CRM" /> Cotizaciones en SuiteCRM</span>
        <span style={{ color: C.inkGhost }}>→</span>
        <span><SourceTag source="SAG" /> Pedidos confirmados en ERP</span>
      </div>

      {/* CRM Quotes (Ventas) */}
      <Panel>
        <PanelHeader title="Cotizaciones CRM" badge={
          <span style={{ display: "flex", gap: S[2], alignItems: "center" }}>
            <SourceTag source="CRM" />
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
              {crmQuotes.items.length}
            </span>
          </span>
        } />
        <div style={{ padding: S[2] }}>
          {crmQuotes.items.length === 0 ? (
            <EmptyOperationalState message="Sin cotizaciones CRM" detail="No se encontraron cotizaciones en SuiteCRM para este vendedor." />
          ) : (
            <>
              <div className="ag-op-table">
                {crmPreview.visible.map(q => (
                  <div key={q.id} className="ag-op-row" style={{
                    display: "grid",
                    gridTemplateColumns: "70px 1fr 80px 90px",
                    gap: S[2],
                    padding: `${S[1]}px ${S[4]}px`,
                    fontFamily: T.mono,
                    fontSize: T.sz.xs,
                    alignItems: "center",
                  }}>
                    <span style={{ color: C.inkMid }}>{fmtDate(q.issuedAt)}</span>
                    <span style={{ color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {q.customerName ?? "\u2014"}
                    </span>
                    <span style={{ color: C.ink, fontWeight: T.wt.bold }}>{fmtCurrency(q.amount)}</span>
                    <span style={{ overflow: "hidden" }}>
                      <StatusChip variant={orderStageVariant(q.stage)}>{orderStageLabel(q.stage)}</StatusChip>
                    </span>
                  </div>
                ))}
              </div>
              <PreviewToggle {...crmPreview} />
            </>
          )}
        </div>
      </Panel>

      {/* SAG Orders (Facturas/Pedidos ERP) */}
      {sagOrders.items.length > 0 && (
        <Panel>
          <PanelHeader title="Pedidos SAG (ERP)" badge={
            <span style={{ display: "flex", gap: S[2], alignItems: "center" }}>
              <SourceTag source="SAG" />
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                {sagOrders.items.length}
              </span>
            </span>
          } />
          <div style={{ padding: S[2] }}>
            <div className="ag-op-table">
              {sagPreview.visible.map(o => (
                <div key={o.id} className="ag-op-row" style={{
                  display: "grid",
                  gridTemplateColumns: "70px 1fr 80px 90px",
                  gap: S[2],
                  padding: `${S[1]}px ${S[4]}px`,
                  fontFamily: T.mono,
                  fontSize: T.sz.xs,
                  alignItems: "center",
                }}>
                  <span style={{ color: C.inkMid }}>{fmtDate(o.orderDate)}</span>
                  <span style={{ color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.customerName ?? "\u2014"}
                  </span>
                  <span style={{ color: C.ink, fontWeight: T.wt.bold }}>{fmtCurrency(o.amount)}</span>
                  <span style={{ overflow: "hidden" }}>
                    <StatusChip variant={orderStageVariant(o.status)}>{sagStatusLabel(o.status)}</StatusChip>
                  </span>
                </div>
              ))}
            </div>
            <PreviewToggle {...sagPreview} />
          </div>
        </Panel>
      )}
    </div>
  );
}

// ── Tab: Recaudos ─────────────────────────────────────────────────────────────

function TabRecaudos() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      <PyaPendingBanner>
        Esta seccion consolidara pagos, recaudos, recuperacion de cartera y eficiencia de cobro.
      </PyaPendingBanner>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: S[2],
      }}>
        <MiniKpi label="Pagos" value="\u2014" />
        <MiniKpi label="Recaudos" value="\u2014" />
        <MiniKpi label="Recuperacion cartera" value="\u2014" />
        <MiniKpi label="Eficiencia de cobro" value="\u2014" />
      </div>
    </div>
  );
}

// ── Tab: Cartera ──────────────────────────────────────────────────────────────

function TabCartera({ data }: { data: Vendedor360Data }) {
  const { cartera } = data;
  const preview = usePreview(cartera.items);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {cartera.state === "provisional_sag" && <ProvisionalBanner />}

      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, display: "flex", gap: S[2], alignItems: "center", marginBottom: S[1] }}>
        <SourceTag source="SAG" /> Cuentas por cobrar desde ERP
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: S[2],
      }}>
        <MiniKpi label="Clientes con cartera" value={fmtNum(cartera.items.length)} />
        <MiniKpi label="Saldo asociado" value={fmtCurrency(cartera.totalBalance)} alert={cartera.totalBalance > 0} />
      </div>

      {cartera.items.length === 0 ? (
        <EmptyOperationalState message="Sin cartera registrada" detail="No se encontraron documentos de cartera para los clientes de este vendedor." />
      ) : (
        <>
          <div className="ag-op-table">
            <div className="ag-op-row" style={{
              display: "grid",
              gridTemplateColumns: "1fr 90px 50px 70px",
              gap: S[2],
              padding: `${S[1]}px ${S[4]}px`,
              fontFamily: T.mono,
              fontSize: T.sz["2xs"],
              fontWeight: T.wt.bold,
              color: C.inkLight,
              textTransform: "uppercase" as const,
              borderBottom: `1px solid ${C.line}`,
            }}>
              <span>Cliente</span>
              <span>Saldo</span>
              <span>Docs</span>
              <span>Vencim.</span>
            </div>
            {preview.visible.map((e, i) => (
              <div key={i} className="ag-op-row" style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px 50px 70px",
                gap: S[2],
                padding: `${S[2]}px ${S[4]}px`,
                fontFamily: T.mono,
                fontSize: T.sz.xs,
                borderBottom: `1px solid ${C.lineSubtle}`,
              }}>
                <span style={{ color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {e.clientName}
                </span>
                <span style={{ color: C.red, fontWeight: T.wt.bold }}>{fmtCurrency(e.balanceDue)}</span>
                <span style={{ color: C.inkMid }}>{e.documentsCount}</span>
                <span style={{ color: e.daysOverdue > 30 ? C.red : C.inkMid }}>
                  {e.daysOverdue > 0 ? `${e.daysOverdue}d` : "\u2014"}
                </span>
              </div>
            ))}
          </div>
          <PreviewToggle {...preview} />
        </>
      )}
    </div>
  );
}

// ── Tab: Metas ────────────────────────────────────────────────────────────────

function TabMetas() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      <PyaPendingBanner>
        Esta seccion mostrara meta mensual, cumplimiento, tendencia y forecast.
      </PyaPendingBanner>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: S[2],
      }}>
        <MiniKpi label="Meta mensual" value="\u2014" />
        <MiniKpi label="Cumplimiento" value="\u2014" />
        <MiniKpi label="Tendencia" value="\u2014" />
        <MiniKpi label="Forecast" value="\u2014" />
      </div>
    </div>
  );
}

// ── Tab: Comisiones ───────────────────────────────────────────────────────────

function TabComisiones() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      <PyaPendingBanner>
        Esta seccion mostrara comision acumulada, comision pagada, pendiente e historico.
      </PyaPendingBanner>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: S[2],
      }}>
        <MiniKpi label="Comision acumulada" value="\u2014" />
        <MiniKpi label="Comision pagada" value="\u2014" />
        <MiniKpi label="Pendiente" value="\u2014" />
        <MiniKpi label="Historico" value="\u2014" />
      </div>
    </div>
  );
}

// ── Tab: Inteligencia ─────────────────────────────────────────────────────────

function TabInteligencia({ data }: { data: Vendedor360Data }) {
  const { intelligence } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {/* Resumen ejecutivo */}
      <Panel>
        <PanelHeader title="Resumen ejecutivo" />
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: S[2],
          padding: S[3],
        }}>
          <MiniKpi label="Clientes activos" value={fmtNum(intelligence.clientesActivos)} />
          <MiniKpi
            label="Sin compra reciente"
            value={fmtNum(intelligence.clientesSinCompraReciente)}
            alert={intelligence.clientesSinCompraReciente > 2}
          />
          <MiniKpi
            label="Concentracion cartera"
            value={intelligence.concentracionCartera ? `${intelligence.concentracionCartera.top3Percent}% top 3` : "\u2014"}
          />
          <MiniKpi label="Pedidos 30d" value={fmtNum(intelligence.actividadReciente.pedidosUltimos30d)} />
        </div>
      </Panel>

      {/* Riesgos */}
      {intelligence.riesgos.length > 0 && (
        <Panel urgent>
          <PanelHeader title="Riesgos" urgent badge={
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
              color: C.red, background: C.redLight, padding: "2px 6px", borderRadius: R.pill,
            }}>
              {intelligence.riesgos.length}
            </span>
          } />
          <div style={{ padding: S[3], display: "flex", flexDirection: "column", gap: S[2] }}>
            {intelligence.riesgos.map((r, i) => (
              <div key={i} style={{
                padding: `${S[2]}px ${S[3]}px`,
                background: C.redLight,
                borderRadius: R.card,
                border: `1px solid ${C.redBorder}`,
              }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink, marginBottom: 2 }}>
                  {r.title}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                  {r.detail}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Oportunidades */}
      {intelligence.oportunidades.length > 0 && (
        <Panel>
          <PanelHeader title="Oportunidades" badge={
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
              color: C.blueDark, background: C.blueLight, padding: "2px 6px", borderRadius: R.pill,
            }}>
              {intelligence.oportunidades.length}
            </span>
          } />
          <div style={{ padding: S[3], display: "flex", flexDirection: "column", gap: S[2] }}>
            {intelligence.oportunidades.map((o, i) => (
              <div key={i} style={{
                padding: `${S[2]}px ${S[3]}px`,
                background: C.blueLight,
                borderRadius: R.card,
                border: `1px solid ${C.blueBorder}`,
              }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.blueDark, marginBottom: 2 }}>
                  {o.title}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                  {o.detail}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Recomendaciones IA */}
      {intelligence.recomendaciones.length > 0 && (
        <Panel>
          <PanelHeader title="Recomendaciones" />
          <div style={{ padding: S[3], display: "flex", flexDirection: "column", gap: S[2] }}>
            {intelligence.recomendaciones.map((r, i) => (
              <div key={i} style={{
                padding: `${S[2]}px ${S[3]}px`,
                background: C.surface,
                borderRadius: R.card,
                border: `1px solid ${C.lineSubtle}`,
              }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink, marginBottom: 2 }}>
                  {r.title}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                  {r.detail}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* If nothing to show */}
      {intelligence.riesgos.length === 0 && intelligence.oportunidades.length === 0 && intelligence.recomendaciones.length === 0 && (
        <EmptyOperationalState
          message="Sin senales de inteligencia"
          detail="No hay riesgos, oportunidades ni recomendaciones para este vendedor."
        />
      )}
    </div>
  );
}
