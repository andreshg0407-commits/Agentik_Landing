"use client";

/**
 * clientes-client.tsx
 *
 * CLIENTES-DRAWER-360-01 — Server-side pagination + lateral 360 drawer.
 *
 * Row click opens a 360 drawer (wide, 680px) instead of navigating to a page.
 * Drawer loads data on demand via /api/orgs/[orgSlug]/comercial/clientes/[clienteId]/360.
 *
 * Tabs: PERFIL | PEDIDOS | FACTURAS | CARTERA | INTELIGENCIA
 */

import { useState, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { EmptyOperationalState, WorkspaceSection } from "@/components/shell/operational-primitives";
import { OperationalSideDrawer } from "@/components/workspace/operational-side-drawer";
import type { ClientesSummary, ClienteRow, ClientesPageResult } from "@/lib/comercial/clientes/client-loader";
import type { Cliente360Data } from "@/lib/comercial/clientes/cliente-360-loader";
import { UNVERIFIED_RECEIVABLE_LABEL } from "@/lib/comercial/frontline/receivable-truth-contract";
import {
  carteraTrafficLight as carteraTrafficLightPure,
  computeClientScore as computeClientScorePure,
} from "@/lib/comercial/clientes/clientes-pure";

// ── Constants ────────────────────────────────────────────────────────────────

type FilterKey = "todos" | "activos" | "inactivos" | "con_cartera" | "con_vendedor" | "sin_compra_90d" | "con_crm" | "sin_crm";

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "todos",          label: "Todos" },
  { key: "activos",        label: "Activos" },
  { key: "inactivos",      label: "Inactivos" },
  { key: "con_cartera",    label: "Con cartera" },
  { key: "con_vendedor",   label: "Con vendedor" },
  { key: "sin_compra_90d", label: "Sin compra 90d" },
  { key: "con_crm",        label: "Con CRM" },
  { key: "sin_crm",        label: "Sin CRM" },
];

type ClienteStatus = "ACTIVE" | "INACTIVE" | "PROSPECT" | "CHURNED" | "BLOCKED";

const STATUS_LABELS: Record<ClienteStatus, string> = {
  ACTIVE:   "Activo",
  INACTIVE: "Inactivo",
  PROSPECT: "Prospecto",
  CHURNED:  "Perdido",
  BLOCKED:  "Bloqueado",
};

const STATUS_VARIANT: Record<ClienteStatus, string> = {
  ACTIVE:   "ok",
  INACTIVE: "muted",
  PROSPECT: "info",
  CHURNED:  "critical",
  BLOCKED:  "critical",
};

const TABLE_GRID = "1.2fr 90px 90px 110px 75px 80px 70px 60px 40px";

// ── Drawer tab type ──────────────────────────────────────────────────────────

type DrawerTab = "perfil" | "pedidos" | "facturas" | "cartera" | "inteligencia" | "timeline";

const DRAWER_TABS: { key: DrawerTab; label: string }[] = [
  { key: "perfil",       label: "PERFIL" },
  { key: "pedidos",      label: "PEDIDOS" },
  { key: "facturas",     label: "FACTURAS" },
  { key: "cartera",      label: "CARTERA" },
  { key: "inteligencia", label: "INTELIGENCIA" },
  { key: "timeline",     label: "LINEA" },
];

// ── Formatters ───────────────────────────────────────────────────────────────

function fmtCurrency(value: number): string {
  if (value === 0) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString("es-CO")}`;
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

function fmtDate(iso: string | null): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Status helpers ───────────────────────────────────────────────────────────

type StatusVariant = "ok" | "pending" | "warning" | "critical" | "info";

function profileStatusVariant(status: string): StatusVariant {
  switch (status) {
    case "ACTIVE": return "ok";
    case "INACTIVE": return "warning";
    case "PROSPECT": return "info";
    case "CHURNED": case "BLOCKED": return "critical";
    default: return "pending";
  }
}

function profileStatusLabel(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: "Activo", INACTIVE: "Inactivo", PROSPECT: "Prospecto",
    CHURNED: "Perdido", BLOCKED: "Bloqueado",
  };
  return map[status] ?? status;
}

function orderStageVariant(stage: string): StatusVariant {
  if (stage === "Facturado") return "ok";
  if (stage === "Anulado") return "critical";
  if (stage === "Remisionado" || stage === "Gestionado_Parcialmente") return "pending";
  return "warning";
}

function sagOrderStatusVariant(status: string): StatusVariant {
  switch (status) {
    case "FACTURADO": return "ok";
    case "DESPACHADO": return "info";
    case "EN_PROCESO": return "pending";
    case "CANCELADO": return "critical";
    default: return "warning";
  }
}

function receivableStatusVariant(status: string): StatusVariant {
  switch (status) {
    case "PAID": case "CLOSED": return "ok";
    case "OPEN": return "warning";
    case "PARTIAL": return "pending";
    case "OVERDUE": return "critical";
    case "WRITTEN_OFF": case "CANCELLED": return "critical";
    default: return "info";
  }
}

const CARTERA_STATUS_LABELS: Record<string, string> = {
  OPEN: "Pendiente",
  CLOSED: "Pagada",
  PAID: "Pagada",
  PARTIAL: "Pago parcial",
  OVERDUE: "Vencida",
  CANCELLED: "Anulada",
  WRITTEN_OFF: "Anulada",
};

function carteraStatusLabel(status: string): string {
  return CARTERA_STATUS_LABELS[status] ?? status;
}

// ── Opportunity helpers ──────────────────────────────────────────────────────

function oppVariant(type: string): StatusVariant {
  switch (type) {
    case "cartera": return "critical";
    case "inactividad": return "warning";
    case "conversion": return "pending";
    case "asignacion": case "trazabilidad": return "info";
    default: return "info";
  }
}

function oppColor(type: string): string {
  switch (type) {
    case "cartera": return C.red;
    case "inactividad": return C.amber;
    case "conversion": return C.blueDark;
    case "asignacion": case "trazabilidad": return C.blue;
    default: return C.inkLight;
  }
}

function oppLabel(type: string): string {
  switch (type) {
    case "cartera": return "CARTERA";
    case "inactividad": return "INACTIVIDAD";
    case "conversion": return "CONVERSION";
    case "asignacion": return "ASIGNACION";
    case "trazabilidad": return "TRAZABILIDAD";
    default: return type.toUpperCase();
  }
}

// ── Cartera traffic light (semaforo) ─────────────────────────────────────────

function carteraTrafficLight(receivables: Cliente360Data["receivables"]): { label: string; color: string } {
  const result = carteraTrafficLightPure({
    truthStatus: receivables.truthStatus,
    totalBalance: receivables.totalBalance,
    items: receivables.items.map(r => ({ daysOverdue: r.daysOverdue, balanceDue: r.balanceDue })),
  });
  // Map color token names to actual C.* values
  const colorMap: Record<string, string> = {
    inkGhost: C.inkGhost, inkMid: C.inkMid, green: C.green, red: C.red, amber: C.amber,
  };
  return { label: result.label, color: colorMap[result.color] ?? C.inkGhost };
}

// ── Grid constants for drawer tables ─────────────────────────────────────────

const ORDER_GRID = "52px 1fr 80px 80px 80px 60px";
const RECEIVABLE_GRID = "1fr 80px 80px 80px 60px 70px";
const HISTORY_GRID = "80px 1fr 80px 70px";

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug: string;
  summary: ClientesSummary;
  pageResult: ClientesPageResult;
  currentFilter: FilterKey;
  currentSearch: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function ClientesClient({ orgSlug, summary, pageResult, currentFilter, currentSearch }: Props) {
  const arCertified = summary.dataState === "CERTIFIED";
  const router = useRouter();
  const pathname = usePathname();
  const [searchInput, setSearchInput] = useState(currentSearch);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClientId, setDrawerClientId] = useState<string | null>(null);
  const [drawerClientName, setDrawerClientName] = useState("");
  const [drawerData, setDrawerData] = useState<Cliente360Data | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("perfil");

  const navigate = useCallback((params: { page?: number; q?: string; filter?: string }) => {
    const sp = new URLSearchParams();
    const pg = params.page ?? 1;
    const q = params.q ?? searchInput;
    const f = params.filter ?? currentFilter;

    if (pg > 1) sp.set("page", String(pg));
    if (q) sp.set("q", q);
    if (f !== "todos") sp.set("filter", f);

    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }, [router, pathname, searchInput, currentFilter]);

  const handleFilterChange = (key: FilterKey) => {
    navigate({ page: 1, filter: key });
  };

  const handleSearch = () => {
    navigate({ page: 1, q: searchInput });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleClearSearch = () => {
    setSearchInput("");
    navigate({ page: 1, q: "" });
  };

  // Open drawer + load data
  const openDrawer = useCallback((client: ClienteRow) => {
    setDrawerClientId(client.id);
    setDrawerClientName(client.name);
    setDrawerData(null);
    setDrawerError(false);
    setDrawerTab("perfil");
    setDrawerOpen(true);
    setDrawerLoading(true);
  }, []);

  // Fetch 360 data when drawer opens
  useEffect(() => {
    if (!drawerLoading || !drawerClientId) return;
    let cancelled = false;

    fetch(`/api/orgs/${orgSlug}/comercial/clientes/${drawerClientId}/360`)
      .then(res => {
        if (!res.ok) throw new Error("not_found");
        return res.json();
      })
      .then((data: Cliente360Data) => {
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
  }, [drawerLoading, drawerClientId, orgSlug]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerClientId(null);
  };

  const { clients, totalFiltered, page, totalPages } = pageResult;

  const headerStatus = summary.total === 0 ? ("warning" as const) : ("ok" as const);
  const headerStatusLabel =
    summary.total === 0
      ? "En consolidacion"
      : `${summary.total.toLocaleString("es-CO")} clientes \u00B7 ${summary.active.toLocaleString("es-CO")} activos \u00B7 ${summary.inactive.toLocaleString("es-CO")} inactivos`;

  // Drawer severity
  const drawerSeverity = drawerData
    ? ((drawerData.receivables.totalOverdue ?? 0) > 0 ? "warning" as const : "info" as const)
    : "info" as const;

  return (
    <div style={{ padding: S[6], maxWidth: 1400 }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Comercial", href: `/${orgSlug}/comercial/maletas` },
          { label: "Clientes" },
        ]}
        title="Clientes"
        subtitle="Directorio comercial activo"
        status={headerStatus}
        statusLabel={headerStatusLabel}
      />

      {summary.loadFailed ? (
        <EmptyOperationalState
          message="Directorio de clientes no disponible"
          detail="No se pudo cargar la informacion de clientes. Intente nuevamente recargando la pagina."
        />
      ) : summary.total === 0 ? (
        <EmptyOperationalState
          message="Sin clientes registrados"
          detail="Los clientes se consolidan automaticamente desde SAG y CRM."
        />
      ) : (
        <>
          {/* KPI strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: S[3], marginBottom: S[6] }}>
            <ListKpiCard label="Total" value={summary.total} />
            <ListKpiCard label="Activos" value={summary.active} color={C.green} />
            <ListKpiCard label="Inactivos" value={summary.inactive} color={summary.inactive > 0 ? C.amber : undefined} />
            <ListKpiCard label="Con saldo" value={summary.withCartera} color={(summary.withCartera ?? 0) > 0 ? C.blueDark : undefined} />
            <ListKpiCard label="Sin compra 90d" value={summary.sinCompra90d} color={summary.sinCompra90d > 0 ? C.amber : undefined} />
          </div>

          {/* Filters + search */}
          <div style={{ display: "flex", alignItems: "center", gap: S[3], marginBottom: S[5], flexWrap: "wrap" as const }}>
            <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
              {FILTER_OPTIONS.map(opt => {
                const active = currentFilter === opt.key;
                const carteraDisabled = opt.key === "con_cartera" && pageResult.dataState !== "CERTIFIED";
                return (
                  <button
                    key={opt.key}
                    onClick={() => !carteraDisabled && handleFilterChange(opt.key)}
                    disabled={carteraDisabled}
                    aria-disabled={carteraDisabled || undefined}
                    className="ag-action-ghost"
                    title={carteraDisabled ? "Cartera no verificada" : undefined}
                    style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], padding: `4px ${S[3]}px`,
                      borderRadius: R.pill, border: `1px solid ${active ? C.blueDark : C.line}`,
                      background: active ? C.blueDark : "transparent",
                      color: carteraDisabled ? C.inkGhost : active ? "#fff" : C.inkMid,
                      cursor: carteraDisabled ? "not-allowed" : "pointer",
                      fontWeight: active ? T.wt.semibold : T.wt.normal,
                      opacity: carteraDisabled ? 0.5 : 1,
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: S[1], flex: "1 1 200px", minWidth: 200 }}>
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Buscar nombre, NIT, codigo, email... (Enter)"
                style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, padding: `6px ${S[3]}px`,
                  borderRadius: R.sm, border: `1px solid ${C.line}`, background: C.surface,
                  color: C.ink, flex: 1, outline: "none",
                }}
              />
              {currentSearch && (
                <button
                  onClick={handleClearSearch}
                  className="ag-action-ghost"
                  style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"], padding: `4px ${S[2]}px`,
                    borderRadius: R.sm, border: `1px solid ${C.line}`, background: "transparent",
                    color: C.inkMid, cursor: "pointer",
                  }}
                >
                  Limpiar
                </button>
              )}
            </div>

            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, flexShrink: 0 }}>
              {totalFiltered.toLocaleString("es-CO")} cliente{totalFiltered !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Table */}
          {currentFilter === "con_cartera" && pageResult.dataState !== "CERTIFIED" ? (
            <EmptyOperationalState
              message={pageResult.dataState === "UNAVAILABLE" ? "Cartera no disponible" : "Cartera no verificada"}
              detail="Los datos de cartera no estan certificados en este momento. No es posible filtrar por cartera hasta que la fuente SAG este verificada."
            />
          ) : clients.length === 0 ? (
            <EmptyOperationalState
              message={currentSearch ? `Sin resultados para "${currentSearch}"` : `Sin clientes con filtro "${FILTER_OPTIONS.find(o => o.key === currentFilter)?.label}"`}
              detail="Ajuste los filtros para ver clientes"
            />
          ) : (
            <div className="ag-op-table" style={{ border: `1px solid ${C.line}`, borderRadius: R.sm, overflow: "hidden" }}>
              {/* Header */}
              <div className="ag-op-row" style={{ display: "grid", gridTemplateColumns: TABLE_GRID, gap: S[2], padding: `${S[2]}px ${S[4]}px`, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
                {["Cliente", "NIT", "Ciudad", "Vendedor", "Tipo", "Cartera", "Ult. mov", "Estado", ""].map(h => (
                  <span key={h || "action"} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkLight, textTransform: "uppercase" as const }}>{h}</span>
                ))}
              </div>

              {/* Rows */}
              {clients.map((client, idx) => (
                <ClienteRowItem
                  key={client.id}
                  client={client}
                  even={idx % 2 === 0}
                  selected={drawerOpen && drawerClientId === client.id}
                  onClick={() => openDrawer(client)}
                />
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: S[2], padding: `${S[3]}px ${S[4]}px`, borderTop: `1px solid ${C.line}` }}>
                  <PagButton label="Anterior" disabled={page <= 1} onClick={() => navigate({ page: page - 1 })} />
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{page} / {totalPages}</span>
                  <PagButton label="Siguiente" disabled={page >= totalPages} onClick={() => navigate({ page: page + 1 })} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Cliente 360 Drawer ──────────────────────────────────────────── */}
      <OperationalSideDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={drawerClientName}
        subtitle={drawerData ? `NIT ${drawerData.profile.nit ?? "\u2014"} \u00B7 ${drawerData.profile.city ?? "\u2014"}` : undefined}
        severity={drawerSeverity}
        statusLabel={drawerData ? profileStatusLabel(drawerData.profile.status) : "Cargando..."}
        size="wide"
      >
        {drawerLoading && <DrawerLoadingState />}
        {drawerError && <DrawerErrorState />}
        {drawerData && (
          <DrawerContent
            data={drawerData}
            activeTab={drawerTab}
            onTabChange={setDrawerTab}
          />
        )}
      </OperationalSideDrawer>
    </div>
  );
}

// ── Drawer Content ───────────────────────────────────────────────────────────

function DrawerContent({
  data,
  activeTab,
  onTabChange,
}: {
  data: Cliente360Data;
  activeTab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
}) {
  const { profile, seller, crmQuotes, sagOrders, receivables, sales, collections, opportunities } = data;

  // Last activity
  const allDates: number[] = [];
  for (const q of crmQuotes.items) if (q.issuedAt) allDates.push(new Date(q.issuedAt).getTime());
  for (const o of sagOrders.items) if (o.orderDate) allDates.push(new Date(o.orderDate).getTime());
  for (const s of sales.items) if (s.saleDate) allDates.push(new Date(s.saleDate).getTime());
  const lastActivity = allDates.length > 0 ? new Date(Math.max(...allDates)).toISOString() : null;

  const totalOrders = crmQuotes.items.length + sagOrders.items.length;
  const facturaCount = sales.items.filter(s => s.sagSourceType === "OFICIAL").length;

  return (
    <div>
      {/* ── Executive Header ─────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: S[4], alignItems: "center", marginBottom: S[5] }}>
        {/* Avatar */}
        <div style={{
          width: 52, height: 52, borderRadius: R.pill, background: C.blueDark,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: "#fff" }}>
            {getInitials(profile.name)}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2], flexWrap: "wrap" as const }}>
            <span className={`ag-op-status ag-op-status--${profileStatusVariant(profile.status)}`}
              style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold }}>
              {profileStatusLabel(profile.status)}
            </span>
            {seller.state === "disponible" && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                {seller.sellerName} ({seller.confidence}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI Strip ────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2], marginBottom: S[5] }}>
        <DrawerKpi label="Pedidos CRM" value={crmQuotes.items.length} />
        <DrawerKpi label="Pedidos SAG" value={sagOrders.items.length} />
        <DrawerKpi label="Facturas" value={facturaCount} />
        <DrawerKpi label="Saldo cartera" textValue={receivables.truthStatus !== "CERTIFIED" ? "No verificado" : receivables.totalBalance !== null && receivables.totalBalance > 0 ? fmtCurrency(receivables.totalBalance) : "$0"} color={receivables.truthStatus !== "CERTIFIED" ? C.inkGhost : (receivables.totalOverdue ?? 0) > 0 ? C.red : undefined} />
        <DrawerKpi label="Ultima compra" textValue={fmtDaysAgo(lastActivity)} />
        <DrawerKpi label="Salud cartera" textValue={carteraTrafficLight(receivables).label} color={carteraTrafficLight(receivables).color} />
      </div>

      {/* ── Tab Bar ──────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 0, borderBottom: `1px solid ${C.line}`, marginBottom: S[5],
      }}>
        {DRAWER_TABS.map(tab => {
          const active = activeTab === tab.key;
          // Badge counts
          let badge: number | null = null;
          if (tab.key === "pedidos") badge = totalOrders || null;
          if (tab.key === "facturas") badge = facturaCount || null;
          if (tab.key === "cartera" && (receivables.openCount ?? 0) > 0) badge = receivables.openCount;
          if (tab.key === "inteligencia" && opportunities.length > 0) badge = opportunities.length;

          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: active ? T.wt.bold : T.wt.normal,
                color: active ? C.blueDark : C.inkMid, background: "none", border: "none",
                padding: `${S[2]}px ${S[3]}px`, cursor: "pointer", position: "relative" as const,
                borderBottom: active ? `2px solid ${C.blueDark}` : "2px solid transparent",
                marginBottom: -1, display: "flex", alignItems: "center", gap: S[1],
              }}
            >
              {tab.label}
              {badge != null && (
                <span style={{
                  fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.bold, color: "#fff",
                  background: tab.key === "cartera" ? C.red : C.blueDark,
                  borderRadius: R.pill, padding: "1px 5px", lineHeight: 1.2,
                }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ──────────────────────────────────────────────── */}
      {activeTab === "perfil" && <TabPerfil profile={profile} seller={seller} />}
      {activeTab === "pedidos" && <TabPedidos crmQuotes={crmQuotes} sagOrders={sagOrders} />}
      {activeTab === "facturas" && <TabFacturas sales={sales} collections={collections} />}
      {activeTab === "cartera" && <TabCartera receivables={receivables} />}
      {activeTab === "inteligencia" && <TabInteligencia data={data} />}
      {activeTab === "timeline" && <TabTimeline data={data} />}
    </div>
  );
}

// ── Tab: PERFIL ──────────────────────────────────────────────────────────────

function TabPerfil({ profile, seller }: { profile: Cliente360Data["profile"]; seller: Cliente360Data["seller"] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[5] }}>
      {/* Datos generales */}
      <div>
        <SectionLabel label="Datos generales" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
          <FieldRow label="Nombre comercial" value={profile.name} />
          <FieldRow label="Razon social" value={profile.legalName} />
          <FieldRow label="NIT" value={profile.nit} />
          <FieldRow label="Codigo SAG" value={profile.erpId} />
          <FieldRow label="Tipo cliente" value={profile.customerType} />
          <FieldRow label="Estado" value={profileStatusLabel(profile.status)} />
        </div>
      </div>

      {/* Contacto */}
      <div>
        <SectionLabel label="Contacto" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
          <FieldRow label="Email" value={profile.email} />
          <FieldRow label="Telefono" value={profile.phone} />
          <FieldRow label="Direccion" value={profile.address} span={2} />
        </div>
      </div>

      {/* Ubicacion */}
      <div>
        <SectionLabel label="Ubicacion" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
          <FieldRow label="Ciudad" value={profile.city} />
          <FieldRow label="Departamento" value={profile.department} />
          <FieldRow label="Zona comercial" value={profile.zone} />
        </div>
      </div>

      {/* Configuracion comercial */}
      <div>
        <SectionLabel label="Configuracion comercial" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
          <FieldRow label="Vendedor" value={seller.sellerName} />
          <FieldRow label="Confianza" value={seller.confidence > 0 ? `${seller.confidence}%` : null} />
          <FieldRow label="Canal" value={profile.segment} />
          <FieldRow label="Lista de precios" value={profile.priceListName} />
          <FieldRow label="Cupo credito" value={profile.creditLimit != null && profile.creditLimit > 0 ? fmtCurrency(profile.creditLimit) : null} />
          <FieldRow label="Ultima compra" value={fmtDate(profile.lastPurchaseAt)} />
        </div>
      </div>

      {/* Integraciones */}
      <div>
        <SectionLabel label="Integraciones" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
          <FieldRow label="SAG Tercero" value={profile.sagTerceroId != null ? String(profile.sagTerceroId) : null} />
          <FieldRow label="CRM ID" value={profile.crmId} />
          <FieldRow label="ERP sync" value={fmtDate(profile.erpSyncedAt)} />
          <FieldRow label="CRM sync" value={fmtDate(profile.crmSyncedAt)} />
          <FieldRow label="Creado en SAG" value={fmtDate(profile.createdAtSag)} />
        </div>
      </div>
    </div>
  );
}

// ── Tab: PEDIDOS ─────────────────────────────────────────────────────────────

function TabPedidos({ crmQuotes, sagOrders }: {
  crmQuotes: Cliente360Data["crmQuotes"];
  sagOrders: Cliente360Data["sagOrders"];
}) {
  const totalOrders = crmQuotes.items.length + sagOrders.items.length;

  if (totalOrders === 0) {
    return <EmptyOperationalState message="Sin pedidos registrados" detail="No hay pedidos CRM ni SAG vinculados a este cliente." />;
  }

  return (
    <div className="ag-op-table" style={{ border: `1px solid ${C.line}`, borderRadius: R.sm, overflow: "hidden" }}>
      <div className="ag-op-row" style={{ display: "grid", gridTemplateColumns: ORDER_GRID, gap: S[2], padding: `${S[2]}px ${S[3]}px`, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
        {["Origen", "Numero", "Fecha", "Valor", "Estado", "SAG"].map(h => (
          <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkLight, textTransform: "uppercase" as const }}>{h}</span>
        ))}
      </div>

      {crmQuotes.items.map(q => (
        <div key={q.id} className="ag-op-row" style={{ display: "grid", gridTemplateColumns: ORDER_GRID, gap: S[2], padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.line}22`, alignItems: "center" }}>
          <span className="ag-op-status ag-op-status--info" style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold }}>CRM</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{q.quoteNumber ?? q.id.slice(0, 8)}</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{fmtDate(q.issuedAt)}</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{fmtCurrency(q.amount)}</span>
          <span className={`ag-op-status ag-op-status--${orderStageVariant(q.stage)}`} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold }}>{q.stage}</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: q.sagOrderId ? C.green : C.inkGhost }}>{q.sagOrderId ? "\u2713" : "\u2014"}</span>
        </div>
      ))}

      {sagOrders.items.map(o => (
        <div key={o.id} className="ag-op-row" style={{ display: "grid", gridTemplateColumns: ORDER_GRID, gap: S[2], padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.line}22`, alignItems: "center" }}>
          <span className="ag-op-status ag-op-status--scheduled" style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold }}>SAG</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{o.orderNumber ?? String(o.erpMovId ?? "\u2014")}</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{fmtDate(o.orderDate)}</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{fmtCurrency(o.amount)}</span>
          <span className={`ag-op-status ag-op-status--${sagOrderStatusVariant(o.status)}`} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold }}>{o.status}</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>{String(o.erpMovId ?? "\u2014")}</span>
        </div>
      ))}
    </div>
  );
}

// ── Tab: FACTURAS ────────────────────────────────────────────────────────────

function TabFacturas({ sales, collections }: {
  sales: Cliente360Data["sales"];
  collections: Cliente360Data["collections"];
}) {
  const facturas = sales.items.filter(s => s.sagSourceType === "OFICIAL");
  const remisiones = sales.items.filter(s => s.sagSourceType === "REMISION");
  const totalFacturado = facturas.reduce((s, f) => s + f.amount, 0);

  if (sales.state === "no_disponible" && collections.state === "no_disponible") {
    return <EmptyOperationalState message="Sin historial comercial" detail="No hay facturas ni cobros registrados para este cliente." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
      {/* Summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2] }}>
        <MiniStat label="Total facturado" value={fmtCurrency(totalFacturado)} />
        <MiniStat label="Facturas" value={String(facturas.length || "\u2014")} />
        <MiniStat label="Cobros" value={String(collections.items.length || "\u2014")} />
      </div>

      {/* History table */}
      <div className="ag-op-table" style={{ border: `1px solid ${C.line}`, borderRadius: R.sm, overflow: "hidden" }}>
        <div className="ag-op-row" style={{ display: "grid", gridTemplateColumns: HISTORY_GRID, gap: S[2], padding: `${S[2]}px ${S[3]}px`, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
          {["Fecha", "Tipo", "Valor", "Ref"].map(h => (
            <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkLight, textTransform: "uppercase" as const }}>{h}</span>
          ))}
        </div>

        {sales.items.slice(0, 30).map(s => (
          <div key={s.id} className="ag-op-row" style={{ display: "grid", gridTemplateColumns: HISTORY_GRID, gap: S[2], padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.line}22`, alignItems: "center" }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{fmtDate(s.saleDate)}</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
              {s.sagSourceType === "OFICIAL" ? "Factura" : s.sagSourceType === "REMISION" ? "Remision" : s.sagSourceType ?? "Venta"}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{fmtCurrency(s.amount)}</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{s.comprobanteCode ?? "\u2014"}</span>
          </div>
        ))}

        {collections.items.slice(0, 20).map(c => (
          <div key={c.id} className="ag-op-row" style={{ display: "grid", gridTemplateColumns: HISTORY_GRID, gap: S[2], padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.line}22`, alignItems: "center" }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{fmtDate(c.collectionDate)}</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green }}>Cobro</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green }}>{fmtCurrency(c.amount)}</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>{c.documentNumber ?? "\u2014"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: CARTERA ─────────────────────────────────────────────────────────────

function TabCartera({ receivables }: { receivables: Cliente360Data["receivables"] }) {
  const isCertified = receivables.truthStatus === "CERTIFIED";
  const isCertifiedZero = isCertified && receivables.totalBalance === 0 && receivables.items.length === 0;

  // UNVERIFIED — show validation message, do NOT show legacy items
  if (!isCertified) {
    return <EmptyOperationalState message={UNVERIFIED_RECEIVABLE_LABEL} detail="Los datos de cartera estan siendo validados contra la fuente certificada (SAG). No se muestran valores financieros hasta completar la certificacion." />;
  }

  // CERTIFIED_ZERO — customer truly has no receivables
  if (isCertifiedZero) {
    return <EmptyOperationalState message="Sin cartera" detail="Este cliente no tiene facturas pendientes de cobro segun la fuente certificada (SAG)." />;
  }

  if (receivables.state === "no_disponible") {
    return <EmptyOperationalState message="Sin cartera registrada" detail="No hay facturas pendientes de cobro para este cliente." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[4] }}>
      {/* CERTIFIED SAG badge */}
      <div style={{
        padding: `${S[2]}px ${S[3]}px`, borderRadius: R.sm,
        background: `${C.green}11`, border: `1px solid ${C.green}33`,
        display: "flex", alignItems: "center", gap: S[2],
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.green }}>CERTIFICADO SAG</span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
          Saldos certificados desde vw_agentik_cartera. Incluyen aplicacion de recaudos.
        </span>
      </div>

      {/* Cartera summary strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2] }}>
        <MiniStat label="Total cartera" value={receivables.totalBalance !== null ? fmtCurrency(receivables.totalBalance) : "\u2014"} />
        <MiniStat label="Vencida" value={receivables.totalOverdue !== null ? fmtCurrency(receivables.totalOverdue) : "\u2014"} color={(receivables.totalOverdue ?? 0) > 0 ? C.red : undefined} />
        <MiniStat label="Facturas abiertas" value={receivables.openCount !== null ? String(receivables.openCount) : "\u2014"} />
      </div>

      {/* Receivables table — only shown when certified items exist */}
      {receivables.items.length > 0 && (
        <div className="ag-op-table" style={{ border: `1px solid ${C.line}`, borderRadius: R.sm, overflow: "hidden" }}>
          <div className="ag-op-row" style={{ display: "grid", gridTemplateColumns: RECEIVABLE_GRID, gap: S[2], padding: `${S[2]}px ${S[3]}px`, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
            {["Factura", "Monto", "Pagado", "Saldo", "Mora", "Estado"].map(h => (
              <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkLight, textTransform: "uppercase" as const }}>{h}</span>
            ))}
          </div>
          {receivables.items.map(r => (
            <div key={r.id} className={`ag-op-row${(r.daysOverdue ?? 0) > 90 ? " ag-op-row--critical" : (r.daysOverdue ?? 0) > 30 ? " ag-op-row--warning" : ""}`}
              style={{ display: "grid", gridTemplateColumns: RECEIVABLE_GRID, gap: S[2], padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.line}22`, alignItems: "center" }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{r.erpId ?? r.id.slice(0, 8)}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{fmtCurrency(r.originalAmount)}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green }}>{fmtCurrency(r.paidAmount)}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: r.balanceDue > 0 ? C.red : C.ink }}>{fmtCurrency(r.balanceDue)}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: r.daysOverdue == null ? C.inkGhost : r.daysOverdue > 30 ? C.red : r.daysOverdue > 0 ? C.amber : C.inkGhost }}>{r.daysOverdue != null && r.daysOverdue > 0 ? `${r.daysOverdue}d` : "\u2014"}</span>
              <span className={`ag-op-status ag-op-status--${receivableStatusVariant(r.status)}`} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold }}>{carteraStatusLabel(r.status)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab: INTELIGENCIA ────────────────────────────────────────────────────────

function TabInteligencia({ data }: { data: Cliente360Data }) {
  const { profile, seller, crmQuotes, sagOrders, receivables, sales, opportunities } = data;

  // Product line aggregation
  const lineAgg = new Map<string, { count: number; total: number }>();
  for (const s of sales.items) {
    const line = s.productLine ?? "Sin linea";
    const entry = lineAgg.get(line) ?? { count: 0, total: 0 };
    entry.count++;
    entry.total += s.amount;
    lineAgg.set(line, entry);
  }
  const productLines = [...lineAgg.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, d]) => ({ name, ...d }));

  const score = computeClientScore(data);
  const totalSales = sales.items.reduce((s, r) => s + r.amount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[5] }}>
      {/* Score */}
      <div style={{ ...panelStyle, padding: S[4], display: "flex", alignItems: "center", gap: S[4] }}>
        <div style={{
          width: 48, height: 48, borderRadius: R.pill,
          background: scoreColor(score.grade), display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: "#fff" }}>{score.grade}</span>
        </div>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, textTransform: "uppercase" as const }}>
            Score cliente{score.incomplete ? " (incompleto)" : ""}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>{scoreDescription(score.grade)}</div>
          {score.incomplete && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber, marginTop: 2 }}>
              Cartera no verificada — score puede variar
            </div>
          )}
        </div>
      </div>

      {/* Comportamiento */}
      <div>
        <SectionLabel label="Comportamiento" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
          <FieldRow label="Pedidos CRM" value={String(crmQuotes.items.length || "\u2014")} />
          <FieldRow label="Pedidos SAG" value={String(sagOrders.items.length || "\u2014")} />
          <FieldRow label="Facturas" value={String(sales.items.filter(s => s.sagSourceType === "OFICIAL").length || "\u2014")} />
          <FieldRow label="Cobros registrados" value={String(data.collections.items.length || "\u2014")} />
        </div>
      </div>

      {/* Preferencias */}
      <div>
        <SectionLabel label="Preferencias (lineas de producto)" />
        {productLines.length === 0 ? (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost }}>Sin datos suficientes</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
            {productLines.slice(0, 5).map(pl => (
              <div key={pl.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{pl.name}</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{fmtCurrency(pl.total)} ({pl.count})</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rentabilidad */}
      <div>
        <SectionLabel label="Rentabilidad" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
          <FieldRow label="Total facturado" value={totalSales > 0 ? fmtCurrency(totalSales) : null} />
          <FieldRow label="Saldo cartera" value={receivables.truthStatus !== "CERTIFIED" ? "No verificado" : receivables.totalBalance !== null && receivables.totalBalance > 0 ? fmtCurrency(receivables.totalBalance) : "Sin cartera"} color={receivables.truthStatus !== "CERTIFIED" ? C.inkGhost : undefined} />
        </div>
      </div>

      {/* Riesgo */}
      <div>
        <SectionLabel label="Riesgo" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
          <FieldRow label="Cartera vencida" value={receivables.truthStatus !== "CERTIFIED" ? "No verificada" : receivables.totalOverdue !== null && receivables.totalOverdue > 0 ? fmtCurrency(receivables.totalOverdue) : null} color={receivables.truthStatus !== "CERTIFIED" ? C.inkGhost : (receivables.totalOverdue ?? 0) > 0 ? C.red : undefined} />
          <FieldRow label="Facturas abiertas" value={receivables.openCount !== null && receivables.openCount > 0 ? String(receivables.openCount) : null} />
        </div>
      </div>

      {/* Oportunidades */}
      <div>
        <SectionLabel label="Oportunidades detectadas" />
        {opportunities.length === 0 ? (
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost }}>Sin oportunidades detectadas</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
            {opportunities.map(opp => (
              <div key={opp.id} style={{ ...panelStyle, padding: S[3], borderLeft: `3px solid ${oppColor(opp.type)}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 2 }}>
                  <span className={`ag-op-status ag-op-status--${oppVariant(opp.type)}`}
                    style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold }}>
                    {oppLabel(opp.type)}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>{opp.title}</span>
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{opp.reason}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tab: LINEA DE TIEMPO ─────────────────────────────────────────────────────

interface TimelineEvent {
  date: string;
  type: string;
  label: string;
  detail: string;
  color: string;
}

function TabTimeline({ data }: { data: Cliente360Data }) {
  // Build timeline from all real data sources
  const events: TimelineEvent[] = [];

  // CRM quotes
  for (const q of data.crmQuotes.items) {
    if (q.issuedAt) {
      events.push({
        date: q.issuedAt,
        type: "CRM",
        label: `Pedido CRM ${q.quoteNumber ?? ""}`.trim(),
        detail: `${fmtCurrency(q.amount)} — ${q.stage}`,
        color: C.blueDark,
      });
    }
  }

  // SAG orders
  for (const o of data.sagOrders.items) {
    if (o.orderDate) {
      events.push({
        date: o.orderDate,
        type: "SAG",
        label: `Pedido SAG ${o.orderNumber ?? String(o.erpMovId ?? "")}`.trim(),
        detail: `${fmtCurrency(o.amount)} — ${o.status}`,
        color: C.blue,
      });
    }
  }

  // Sales
  for (const s of data.sales.items) {
    if (s.saleDate) {
      events.push({
        date: s.saleDate,
        type: s.sagSourceType === "OFICIAL" ? "FAC" : "REM",
        label: s.sagSourceType === "OFICIAL" ? "Factura" : "Remision",
        detail: `${fmtCurrency(s.amount)} — ${s.comprobanteCode ?? ""}`,
        color: s.sagSourceType === "OFICIAL" ? C.green : C.inkMid,
      });
    }
  }

  // Collections
  for (const c of data.collections.items) {
    if (c.collectionDate) {
      events.push({
        date: c.collectionDate,
        type: "COB",
        label: "Cobro registrado",
        detail: `${fmtCurrency(c.amount)} — ${c.documentNumber ?? ""}`,
        color: C.green,
      });
    }
  }

  // Sort descending by date
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (events.length === 0) {
    return <EmptyOperationalState message="Sin eventos registrados" detail="No hay actividad comercial con fecha para este cliente." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: 0 }}>
      {events.slice(0, 50).map((ev, i) => (
        <div key={`${ev.date}-${ev.type}-${i}`} style={{
          display: "flex", gap: S[3], padding: `${S[2]}px 0`,
          borderBottom: i < events.length - 1 ? `1px solid ${C.line}22` : "none",
        }}>
          {/* Date */}
          <div style={{ width: 70, flexShrink: 0, textAlign: "right" as const }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{fmtDate(ev.date)}</span>
          </div>
          {/* Dot + line */}
          <div style={{ width: 16, display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: R.pill, background: ev.color, marginTop: 4 }} />
            {i < events.length - 1 && <div style={{ width: 1, flex: 1, background: C.line }} />}
          </div>
          {/* Content */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
              <span className={`ag-op-status ag-op-status--${ev.type === "CRM" ? "info" : ev.type === "FAC" ? "ok" : ev.type === "COB" ? "ok" : "scheduled"}`}
                style={{ fontFamily: T.mono, fontSize: 9, fontWeight: T.wt.semibold }}>
                {ev.type}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{ev.label}</span>
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{ev.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Client score computation ─────────────────────────────────────────────────

function computeClientScore(data: Cliente360Data): { grade: string; incomplete: boolean } {
  const { crmQuotes, sagOrders, receivables, sales, seller, opportunities } = data;
  return computeClientScorePure({
    crmQuoteCount: crmQuotes.items.length,
    sagOrderCount: sagOrders.items.length,
    salesCount: sales.items.length,
    sellerConfidence: seller.confidence,
    arCertified: receivables.truthStatus === "CERTIFIED",
    totalOverdue: receivables.totalOverdue,
    totalBalance: receivables.totalBalance,
    opportunityTypes: opportunities.map(o => o.type),
  });
}

function scoreColor(score: string): string {
  if (score.startsWith("A")) return C.green;
  if (score.startsWith("B")) return C.blueDark;
  if (score === "C") return C.amber;
  return C.red;
}

function scoreDescription(score: string): string {
  if (score === "A+") return "Cliente excepcional — alta actividad, sin riesgo";
  if (score === "A") return "Cliente solido — buena actividad comercial";
  if (score === "B+") return "Cliente activo — con areas de mejora";
  if (score === "B") return "Cliente moderado — actividad regular";
  if (score === "C") return "Cliente en riesgo — requiere atencion";
  return "Cliente critico — multiples alertas activas";
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ListKpiCard({ label, value, color }: { label: string; value: number | null; color?: string }) {
  const display = value === null ? "\u2014" : value === 0 ? "0" : value.toLocaleString("es-CO");
  return (
    <div className="ag-kpi-card" style={{ padding: S[4], background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.sm, boxShadow: E.xs }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginBottom: S[1], textTransform: "uppercase" as const }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: color ?? C.ink, lineHeight: 1 }}>
        {display}
      </div>
    </div>
  );
}

function DrawerKpi({ label, value, textValue, color }: {
  label: string; value?: number; textValue?: string; color?: string;
}) {
  return (
    <div style={{ ...panelStyle, padding: `${S[2]}px ${S[3]}px` }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkLight, textTransform: "uppercase" as const }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.bold, color: color ?? C.ink, lineHeight: 1.3 }}>
        {textValue ?? (value != null ? (value === 0 ? "\u2014" : value.toLocaleString("es-CO")) : "\u2014")}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ ...panelStyle, padding: `${S[2]}px ${S[3]}px` }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkLight, textTransform: "uppercase" as const }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: color ?? C.ink }}>{value}</div>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkLight,
      textTransform: "uppercase" as const, letterSpacing: "0.06em",
      marginBottom: S[3], paddingBottom: S[1], borderBottom: `1px solid ${C.line}`,
    }}>
      {label}
    </div>
  );
}

function FieldRow({ label, value, span, color, compact }: { label: string; value: string | null | undefined; span?: number; color?: string; compact?: boolean }) {
  const placeholder = compact ? "\u2014" : "Sin registrar";
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkLight, textTransform: "uppercase" as const, marginBottom: 1 }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: value ? (color ?? C.ink) : C.inkGhost }}>{value ?? placeholder}</div>
    </div>
  );
}

function ClienteRowItem({ client, even, selected, onClick }: {
  client: ClienteRow; even: boolean; selected: boolean; onClick: () => void;
}) {
  const status = client.status as ClienteStatus;
  const variant = STATUS_VARIANT[status] ?? "muted";
  const stateLabel = STATUS_LABELS[status] ?? client.status;

  return (
    <div
      onClick={onClick}
      className="ag-op-row"
      style={{
        display: "grid", gridTemplateColumns: TABLE_GRID, gap: S[2],
        padding: `${S[2]}px ${S[4]}px`,
        background: selected ? `${C.blueDark}08` : even ? C.surface : "transparent",
        borderBottom: `1px solid ${C.line}22`, alignItems: "center", cursor: "pointer",
        borderLeft: selected ? `3px solid ${C.blueDark}` : "3px solid transparent",
      }}
    >
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
        {client.name}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
        {client.nit ?? "\u2014"}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: client.city ? C.inkMid : C.inkGhost, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
        {client.city ?? "\u2014"}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: client.sellerName ? C.ink : C.inkGhost, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
        {client.sellerName ?? "\u2014"}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: client.customerType ? C.inkMid : C.inkGhost, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
        {client.customerType ?? "\u2014"}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: (client.overdueReceivable ?? 0) > 0 ? T.wt.semibold : T.wt.normal, color: (client.overdueReceivable ?? 0) > 0 ? C.red : C.inkGhost, textAlign: "right" as const }}>
        {client.overdueReceivable != null ? fmtCurrency(client.overdueReceivable) : "\u2014"}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, textAlign: "center" as const }}>
        {fmtDaysAgo(client.lastPurchaseAt)}
      </span>
      <span className={`ag-op-status ag-op-status--${variant}`} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold }}>
        {stateLabel}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, textAlign: "center" as const }}>
        360
      </span>
    </div>
  );
}

function PagButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="ag-action-ghost"
      style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], padding: `4px ${S[3]}px`,
        borderRadius: R.sm, border: `1px solid ${C.line}`, background: "transparent",
        color: disabled ? C.inkGhost : C.blueDark, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}

function DrawerLoadingState() {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: S[8], gap: S[3] }}>
      <div style={{
        width: 32, height: 32, borderRadius: R.pill,
        border: `3px solid ${C.line}`, borderTopColor: C.blueDark,
        animation: "spin 0.8s linear infinite",
      }} />
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>Cargando datos 360...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function DrawerErrorState() {
  return (
    <EmptyOperationalState
      message="Error al cargar datos"
      detail="No se pudo cargar la informacion del cliente. Intente nuevamente."
    />
  );
}

function getInitials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return "??";
}

// ── Shared styles ────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.line}`,
  borderRadius: R.sm,
  boxShadow: E.xs,
};
