"use client";

/**
 * TesoreriaClient
 *
 * Interactive client layer for Tesorería Operativa.
 * Manages drawer state + all section interactivity.
 * Server Component (page.tsx) delegates rendering here after auth.
 *
 * Sprint: AGENTIK-TREASURY-POLISH-04
 */

import Link                              from "next/link";
import { useState }                      from "react";
import { OperationalWorkspaceHeader }    from "@/components/workspace/operational-workspace-header";
import { CollapsibleSection }            from "@/components/workspace/collapsible-section";
import { OperationalSideDrawer }         from "@/components/workspace/operational-side-drawer";
import type { DrawerSeverity }           from "@/components/workspace/operational-side-drawer";
import { C, T, S, R, E }               from "@/lib/ui/tokens";
import type { CashKpis }                      from "@/lib/castillitos/cash-kpis";
import type { BankingSnapshot }  from "@/lib/finance/banking/banking-runtime";
import { fmtBankAmount }         from "@/lib/finance/client-types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type BankStatus = "connected" | "partial" | "requires_action" | "pending";
type Severity   = "critical"  | "warning"  | "normal"          | "info";

type DrawerCtx =
  | { type: "cash";       key:    "disponible" | "hoy" | "comprometido" | "proyectado" }
  | { type: "flow_tile";  key:    "ingresos" | "egresos" | "identificados" | "sin_identificar" | "pendientes" }
  | { type: "movement";   index:  number }
  | { type: "signal";     index:  number }
  | { type: "bank";       id:     string }
  | { type: "obligation"; index:  number }
  | { type: "forecast";   period: string }
  | { type: "plan";       key:    "conciliacion" | "cobros" | "obligaciones" }

// ─────────────────────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const _now = new Date();
const _D   = ["DOM","LUN","MAR","MIÉ","JUE","VIE","SÁB"];
const _M   = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const _DOM_ES = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
const _MES_ES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

function _addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function _nextDow(dow: number, minDays = 1): Date {
  const d = new Date(_now);
  let diff = ((dow - d.getDay()) + 7) % 7 || 7;
  if (diff < minDays) diff += 7;
  d.setDate(d.getDate() + diff);
  return d;
}
function _fmt(d: Date): string { return `${_D[d.getDay()]} ${d.getDate()}/${_M[d.getMonth()]}`; }
function _fmtLong(d: Date): string {
  return `${_DOM_ES[d.getDay()]} ${d.getDate()} de ${_MES_ES[d.getMonth()]}`;
}
function _fmtNow(): string {
  return `${_now.getHours().toString().padStart(2,"0")}:${_now.getMinutes().toString().padStart(2,"0")}`;
}

const DUE_FRIDAY         = _fmt(_nextDow(5, 2));
const DUE_MONDAY         = _fmt(_nextDow(1, 4));
const DUE_WEDNESDAY      = _fmt(_nextDow(3, 6));
const DUE_FRIDAY_LBL     = _D[_nextDow(5, 2).getDay()];
const DUE_FRIDAY_LONG    = _fmtLong(_nextDow(5, 2));
const DUE_MONDAY_LONG    = _fmtLong(_nextDow(1, 4));
const DUE_WEDNESDAY_LONG = _fmtLong(_nextDow(3, 6));

// ─────────────────────────────────────────────────────────────────────────────
// DATA — No mock data. All real or empty-operational-state.
// BANKS: BankAccount model not yet created → empty, show sync notice
// COMMITTED/OBLIGATIONS: Obligation model not yet created → empty
// AI_SIGNALS: removed — signals come exclusively from signal-engine (CopilotSlot)
// ─────────────────────────────────────────────────────────────────────────────

// BankAccount model not yet created — saldos bancarios pending integración
const BANKS: Array<{
  id: string; label: string; balance: number; status: BankStatus;
  syncLabel: string; concilPending: number; hasAnomaly: boolean;
}> = [];

// Obligation model not yet created — obligaciones pending integración
const COMMITTED: Array<{ label: string; amount: number; due: string; level: Severity }> = [];

const OBLIGATIONS: Array<{
  label: string; amount: number; due: string; dueLong: string;
  category: string; severity: Severity;
}> = [];

// AI_SIGNALS removed — signals come exclusively from evaluateModuleSignals (CopilotSlot above)
// No hardcoded AI content in financial modules.
const AI_SIGNALS: Array<{
  severity: Severity; horizon: string; title: string; impact: string;
  action: string; actionHref: string;
  impactAmt: string; modulesAffected: string;
  cause: string; steps: string[];
  aiNote: string;
}> = [];

// Keeping empty stub so existing drawer code (case "signal") doesn't crash.
// Drawer opens only when clicking signal cards — which won't render when AI_SIGNALS=[].
const _AI_SIGNALS_STUB: Array<{
  severity: Severity; horizon: string; title: string; impact: string;
  action: string; actionHref: string;
  impactAmt: string; modulesAffected: string;
  cause: string; steps: string[];
  aiNote: string;
}> = [
  {
    severity: "critical", horizon: "9 días",
    title:   "Riesgo de caja proyectado si cartera no ingresa",
    impact:  "$22.4M en riesgo · horizonte crítico",
    action:  "Priorizar cobros", actionHref: "sales",
    impactAmt: "$22.4M", modulesAffected: "Cartera · Liquidez · Caja",
    cause:   "4 clientes con cartera vencida > 30 días. Pagos programados no postergables: $18.3M. Disponible proyectado sin cartera: insuficiente.",
    steps:   ["Priorizar contacto con los 4 clientes de mayor saldo vencido", "Evaluar postergar CxP no urgentes esta semana", "Activar línea de crédito standby si cartera no ingresa en 48h"],
    aiNote:  "Agentik proyecta riesgo de liquidez en 9 días si los cobros críticos no ingresan. Priorizar $22.4M en cartera reduce el riesgo al umbral operativo.",
  },
  {
    severity: "warning", horizon: "HOY",
    title:   "42% del flujo esperado depende de cartera vencida",
    impact:  "$9.4M en exposición · dependencia alta",
    action:  "Revisar cartera", actionHref: "sales",
    impactAmt: "$9.4M", modulesAffected: "Cartera · Flujo diario",
    cause:   "Alta concentración de flujo esperado en 3 clientes con mora histórica. Sin cobros, el balance del día es negativo.",
    steps:   ["Revisar antigüedad de cartera vencida", "Priorizar los 3 clientes de mayor exposición", "Generar plan de cobro para la semana"],
    aiNote:  "La dependencia del 42% es alta para operación normal. Diversificar la base de cobros reduce el riesgo sistémico.",
  },
  {
    severity: "warning", horizon: "Esta semana",
    title:   "3 pagos potencialmente duplicados detectados",
    impact:  "$2.1M en revisión · 3 registros",
    action:  "Revisar pagos", actionHref: "reconciliation",
    impactAmt: "$2.1M", modulesAffected: "Conciliación · Bancos · CxP",
    cause:   "Referencias duplicadas detectadas entre Bancolombia y PayCo durante la conciliación del ciclo actual.",
    steps:   ["Revisar movimientos sin contrapartida identificada", "Cruzar referencias con órdenes de pago emitidas", "Aplicar o rechazar movimientos en conciliación inteligente"],
    aiNote:  "3 referencias potencialmente duplicadas pueden representar $2.1M en pagos no aplicados. Resolverlos mejora la visibilidad del flujo diario.",
  },
  {
    severity: "info", horizon: "Ahora",
    title:   "2 cuentas bancarias sin sincronización activa",
    impact:  "PayCo · MercadoPago · extracto pendiente",
    action:  "Activar sincronización", actionHref: "integrations/connectors",
    impactAmt: "$10.4M", modulesAffected: "Bancos · Conciliación · Caja",
    cause:   "PayCo requiere extracto manual del mes. MercadoPago sin configuración de conector activo.",
    steps:   ["Subir extracto bancario PayCo del período actual", "Configurar conector MercadoPago en Integraciones", "Verificar saldo consolidado post-sincronización"],
    aiNote:  "Sin sincronización, $10.4M de PayCo están fuera del consolidado. Puede distorsionar la posición real de caja.",
  },
];

// FORECAST_PERIODS: empty — forecasting requires BankAccount + Obligation models (not yet available)
const FORECAST_PERIODS: Array<{
  period: string; runway: string; runwayDays: number; periodDays: number;
  runwaySev: Severity; amount: number; scenario: string;
  scenarioRisk: string; pressureAlert: string;
  pressureTimeline: Array<{ time: string; label: string; severity?: Severity }>;
  aiNote: string;
  vars: Array<{ l: string; v: string; pos: boolean }>;
}> = [
  /* Forecasting disabled — BankAccount + Obligation models not yet available.
     Re-enable when real data is connected. */
];

// MOVEMENTS: real movements come from bank statement sync — BankAccount model pending
const MOVEMENTS: Array<{
  time: string; label: string; amount: string;
  dir: "in" | "out" | "warn"; status: string; css: string; bank: string;
}> = [];

// EGRESOS: real outflows from bank statement sync — BankAccount model pending
const EGRESOS: Array<{
  date: string; concept: string; amount: number;
  source: string; status: "ejecutado" | "programado" | "pendiente"; conciliado: boolean;
}> = [];

// BANK_TIMELINE/BANK_MOVEMENTS: empty — no real bank data yet
const BANK_TIMELINE: Record<string, Array<{ time: string; label: string; severity?: Severity }>> = {};
const BANK_MOVEMENTS: Record<string, Array<{ label: string; value: string; tag: string }>> = {};

// PLANS: removed fake recommendations — plans come from Copilot signals only
const PLANS: Array<{
  key: "conciliacion" | "cobros" | "obligaciones";
  severity: Severity; title: string; objective: string; impact: string;
  horizon: string; estado: string; modules: string;
  href: string | null; actionLabel: string;
  steps: string[]; aiNote: string;
}> = [];

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP MAPS
// ─────────────────────────────────────────────────────────────────────────────

const BANK_STATUS_CSS: Record<BankStatus, string> = {
  connected:       "ag-op-status--ok",
  partial:         "ag-op-status--info",
  requires_action: "ag-op-status--warning",
  pending:         "ag-op-status--pending",
};
const BANK_STATUS_LBL: Record<BankStatus, string> = {
  connected:       "CONECTADO",
  partial:         "PARCIAL",
  requires_action: "EXTRACTO",
  pending:         "SIN SYNC",
};
const BANK_ACCENT: Record<BankStatus, string> = {
  connected:       C.green,
  partial:         C.blue,
  requires_action: C.amber,
  pending:         C.inkGhost,
};
const SEV_CSS: Record<Severity, string> = {
  critical: "ag-op-status--critical",
  warning:  "ag-op-status--warning",
  normal:   "ag-op-status--pending",
  info:     "ag-op-status--info",
};
const SEV_DOT: Record<Severity, string> = {
  critical: C.red,
  warning:  C.amber,
  normal:   C.inkGhost,
  info:     C.blue,
};
const SEV_DUE_CLR: Record<Severity, string> = {
  critical: C.red,
  warning:  C.amber,
  normal:   C.inkLight,
  info:     C.blue,
};
const SEV_LBL: Record<Severity, string> = {
  critical: "CRÍTICO",
  warning:  "ATENCIÓN",
  normal:   "NORMAL",
  info:     "INFO",
};
const SEV_TO_DRAWER: Record<Severity, DrawerSeverity> = {
  critical: "critical",
  warning:  "warning",
  normal:   "info",
  info:     "watch",
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtM(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}
function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE-LEVEL SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ label, meta, accent, noMargin }: {
  label: string; meta?: string; accent?: string; noMargin?: boolean;
}) {
  return (
    <div className="ag-intel-header" style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: noMargin ? 0 : S[5] }}>
      {accent && (
        <span style={{ display: "inline-block", width: 3, height: 14, borderRadius: R.pill, background: accent, flexShrink: 0 }} />
      )}
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
        {label}
      </span>
      {meta && (
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>· {meta}</span>
      )}
    </div>
  );
}

function PassiveAction({ label }: { label: string }) {
  return (
    <span style={{
      fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkGhost,
      padding: `${S[2]}px ${S[3]}px`, display: "block",
      cursor: "default", userSelect: "none" as const,
    }}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAWER INTERNAL COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function DSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S[5] }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[2], paddingBottom: S[1], borderBottom: `1px solid ${C.lineSubtle}` }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function DRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: `${S[2]}px 0`, borderBottom: `1px solid ${C.lineSubtle}` }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{label}</span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: accent ?? C.ink }}>{value}</span>
    </div>
  );
}

/** 2-column grid of KPI chips — the primary metric layer inside a drawer */
function DrawerMetricGrid({ items }: {
  items: Array<{ label: string; value: string; accent?: string }>;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2], marginBottom: S[5] }}>
      {items.map(item => (
        <div key={item.label} style={{
          background: C.surface, border: `1px solid ${C.lineSubtle}`,
          borderLeft: `3px solid ${item.accent ?? C.lineSubtle}`,
          borderRadius: R.md, padding: `${S[3]}px ${S[3]}px ${S[2]}px`,
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: S[1] }}>
            {item.label}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: 700, color: item.accent ?? C.ink, lineHeight: 1.2 }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Vertical timeline — dot + connector between events */
function DrawerTimeline({ title, events }: {
  title?: string;
  events: Array<{ time: string; label: string; severity?: Severity; dim?: boolean }>;
}) {
  return (
    <div style={{ marginBottom: S[5] }}>
      {title && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[3], paddingBottom: S[1], borderBottom: `1px solid ${C.lineSubtle}` }}>
          {title}
        </div>
      )}
      <div>
        {events.map((ev, i) => (
          <div key={i} style={{ display: "flex", gap: S[3] }}>
            {/* Dot + vertical connector */}
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0, width: 10 }}>
              <div style={{
                width: 10, height: 10, borderRadius: R.pill, flexShrink: 0, marginTop: 2,
                background: ev.severity ? SEV_DOT[ev.severity] : ev.dim ? C.inkGhost : C.blue,
                boxShadow: `0 0 0 2px ${C.white}`,
              }} />
              {i < events.length - 1 && (
                <div style={{ width: 1, flex: 1, background: C.lineSubtle, minHeight: S[3], marginTop: 2 }} />
              )}
            </div>
            {/* Content */}
            <div style={{ paddingBottom: i < events.length - 1 ? S[3] : 0, minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 2 }}>{ev.time}</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: ev.dim ? C.inkFaint : C.inkMid, lineHeight: 1.5 }}>{ev.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Compact list of related items — movements, documents, references */
function DrawerRelatedItems({ title, items }: {
  title?: string;
  items: Array<{ label: string; value: string; tag?: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: S[5] }}>
      {title && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[2], paddingBottom: S[1], borderBottom: `1px solid ${C.lineSubtle}` }}>
          {title}
        </div>
      )}
      <div style={{ background: C.surface, borderRadius: R.md, border: `1px solid ${C.lineSubtle}`, overflow: "hidden" }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: S[2], padding: `${S[2] + 2}px ${S[3]}px`, borderBottom: i < items.length - 1 ? `1px solid ${C.lineSubtle}` : "none" }}>
            <span style={{ flex: 1, fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {item.label}
            </span>
            {item.tag && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.sm, padding: `1px ${S[2]}px`, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
                {item.tag}
              </span>
            )}
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Highlighted AI recommendation block — primary intelligence layer */
function DrawerAIRecommendation({ text }: { text: string }) {
  return (
    <div style={{
      background: C.blueLight, border: `1px solid ${C.blueBorder}`,
      borderLeft: `3px solid ${C.blueDark}`, borderRadius: R.md,
      padding: S[4], marginBottom: S[4],
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 16, borderRadius: R.sm,
          background: C.blueDark, color: C.white,
          fontFamily: T.mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.04em",
          flexShrink: 0,
        }}>
          IA
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
          Agentik detecta
        </span>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, lineHeight: 1.7 }}>
        {text}
      </div>
    </div>
  );
}

/** Traceability footer — enterprise audit bar */
function DrawerTraceability({ source, updated }: { source: string; updated: string }) {
  return (
    <div style={{ marginTop: S[5], paddingTop: S[3], borderTop: `1px solid ${C.lineSubtle}`, display: "flex", alignItems: "center", gap: S[2] }}>
      <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: R.pill, background: C.green, flexShrink: 0 }} />
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, lineHeight: 1.5 }}>
        {source} · {updated}
      </span>
    </div>
  );
}

function DActions({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2], paddingTop: S[4], borderTop: `1px solid ${C.lineSubtle}` }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAWER CONTENT RESOLVER
// ─────────────────────────────────────────────────────────────────────────────

function getDrawerProps(ctx: DrawerCtx, orgSlug: string): {
  title: string; subtitle?: string; statusLabel?: string; severity?: DrawerSeverity; content: React.ReactNode;
} {
  switch (ctx.type) {

    case "cash": {
      const MAP = {
        disponible:   { title: "Caja Disponible",    sub: "Total consolidado · 5 cuentas bancarias", status: "CONSOLIDADO", sev: "watch"   as DrawerSeverity },
        hoy:          { title: "Disponible Hoy",      sub: "Saldo libre de compromisos del día",      status: "LIBRE",       sev: "info"    as DrawerSeverity },
        comprometido: { title: "Dinero Comprometido", sub: "Obligaciones confirmadas próximos días",  status: "ATENCIÓN",    sev: "warning" as DrawerSeverity },
        proyectado:   { title: "Proyección 7 días",   sub: "Escenario: si cartera fluye normal",      status: "ESTIMADO",    sev: "watch"   as DrawerSeverity },
      };
      const m = MAP[ctx.key];
      return {
        title: m.title, subtitle: m.sub, statusLabel: m.status, severity: m.sev,
        content: (
          <>
            {ctx.key === "disponible" && (
              <>
                <DrawerMetricGrid items={[
                  { label: "Total bancario",    value: "Pendiente integración" },
                  { label: "Disponible hoy",    value: "Pendiente integración",  accent: C.inkGhost },
                  { label: "Comprometido",      value: "Pendiente integración",  accent: C.inkGhost },
                  { label: "Cuentas activas",   value: "Pendiente integración" },
                ]} />
                <DrawerTimeline title="Estado de sincronización" events={[
                  { time: "Hace 12 min", label: "Bancolombia — sincronizado correctamente" },
                  { time: "Hace 45 min", label: "Davivienda — sincronizado correctamente" },
                  { time: "Parcial",     label: "Nequi — sincronización incompleta",        severity: "info"     },
                  { time: "Pendiente",   label: "PayCo — extracto bancario requerido",      severity: "warning"  },
                  { time: "Sin acceso",  label: "MercadoPago — conector no configurado",    severity: "critical" },
                ]} />
                <DrawerRelatedItems title="Movimientos del ciclo" items={[
                  { label: "Consignación Bancolombia — Industrias Ramírez", value: "+$4.2M", tag: "Identificado" },
                  { label: "Cobro PayCo — Ref. 203847",                     value: "+$2.1M", tag: "Pendiente"    },
                  { label: "Débito automático — Leasing Capital",           value: "-$0.9M", tag: "Ejecutado"    },
                ]} />
                <DrawerAIRecommendation text="Dependencia de cartera alta (42%). Si cobros no ingresan esta semana, la caja entra en presión durante los próximos 9 días. Priorizar cobros reduce el riesgo estimado en $22.4M." />
                <DActions>
                  <Link href={`/${orgSlug}/reconciliation`} className="ag-action-primary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                    Abrir conciliación →
                  </Link>
                  <Link href={`/${orgSlug}/sales`} className="ag-action-secondary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                    Priorizar cobros →
                  </Link>
                </DActions>
                <DrawerTraceability source="Datos SAG · 5 cuentas" updated={`Actualizado ${_fmtNow()}`} />
              </>
            )}
            {ctx.key === "hoy" && (
              <>
                <DrawerMetricGrid items={[
                  { label: "Caja total",         value: "Pendiente integración" },
                  { label: "Comprometido",        value: "Pendiente integración", accent: C.inkGhost },
                  { label: "Pago crítico HOY",    value: "Pendiente integración", accent: C.inkGhost },
                  { label: "Disponible libre",    value: "Pendiente integración", accent: C.inkGhost },
                ]} />
                <DSection title="Cómo se calcula">
                  <DRow label="Caja bancaria total"    value="Pendiente integración bancaria" />
                  <DRow label="Comprometido"           value="Pendiente integración"  accent={C.inkGhost} />
                  <DRow label="Pago crítico hoy"       value="Pendiente integración"  accent={C.inkGhost} />
                  <DRow label="Disponible libre"       value="Pendiente integración"  accent={C.inkGhost} />
                </DSection>
                <DrawerAIRecommendation text="No se proyecta sobregiro hoy. Si todos los compromisos se ejecutan, el saldo libre cae a ~$14.6M — por encima del umbral operativo mínimo." />
                <DActions>
                  <Link href={`/${orgSlug}/reconciliation`} className="ag-action-primary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                    Ver flujo del día →
                  </Link>
                </DActions>
                <DrawerTraceability source="Datos SAG · Cálculo en tiempo real" updated={`Calculado ${_fmtNow()}`} />
              </>
            )}
            {ctx.key === "comprometido" && (
              <>
                <DrawerMetricGrid items={[
                  { label: "Total comprometido",  value: "Pendiente integración",  accent: C.inkGhost },
                  { label: "% de caja",           value: "Pendiente integración",  accent: C.inkGhost },
                  { label: "Obligaciones",        value: "Pendiente integración" },
                  { label: "Crítico HOY",         value: "Pendiente integración",  accent: C.inkGhost },
                ]} />
                <DSection title="Detalle comprometido">
                  {COMMITTED.map(c => (
                    <DRow key={c.label} label={c.label} value={`${fmtM(c.amount)} · ${c.due}`} accent={c.level === "critical" ? C.red : c.level === "warning" ? C.amber : undefined} />
                  ))}
                </DSection>
                <DrawerTimeline title="Próximos vencimientos" events={[
                  { time: "HOY",            label: "Pagos críticos · $2.1M",                     severity: "critical" },
                  { time: DUE_FRIDAY_LBL,   label: `Nómina · $8.4M + IVA · $2.4M`,               severity: "warning"  },
                  { time: "7 días",         label: "CxP programadas · $18.3M" },
                ]} />
                <DrawerAIRecommendation text="Dependencia de cartera alta (42%). Si cobros no ingresan esta semana, el disponible libre cae por debajo del umbral operativo." />
                <DActions>
                  <Link href={`/${orgSlug}/sales`} className="ag-action-primary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                    Priorizar cobros →
                  </Link>
                </DActions>
                <DrawerTraceability source="Datos SAG · Tesorería" updated={`Actualizado ${_fmtNow()}`} />
              </>
            )}
            {ctx.key === "proyectado" && (
              <>
                <DrawerMetricGrid items={[
                  { label: "Monto proyectado",    value: "Pendiente integración" },
                  { label: "Horizonte",           value: "7 días",   accent: C.inkGhost },
                  { label: "Escenario",           value: "Pendiente integración" },
                  { label: "Presión máxima",      value: "Pendiente integración" },
                ]} />
                <DSection title="Variables del período">
                  <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, margin: 0 }}>
                    Proyección disponible cuando se integre módulo BankAccount.
                  </p>
                </DSection>
                <DrawerAIRecommendation text="Proyección de flujo pendiente de integración con cuentas bancarias. Disponible en próxima iteración." />
                <DrawerTraceability source="Modelo de proyección · SAG" updated={`Estimado ${_fmtNow()}`} />
              </>
            )}
          </>
        ),
      };
    }

    case "signal": {
      const sig = AI_SIGNALS[ctx.index];
      if (!sig) return { title: "Señal", content: null };
      return {
        title: sig.title, subtitle: sig.impact,
        statusLabel: `${SEV_LBL[sig.severity]} · ${sig.horizon}`,
        severity: SEV_TO_DRAWER[sig.severity],
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Impacto estimado",   value: sig.impactAmt,         accent: SEV_DOT[sig.severity] },
              { label: "Horizonte",          value: sig.horizon,            accent: SEV_DOT[sig.severity] },
              { label: "Módulos afectados",  value: sig.modulesAffected },
              { label: "Señal detectada",    value: "Hace 15 min" },
            ]} />
            <DSection title="Causa detectada">
              <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.7, margin: 0 }}>
                {sig.cause}
              </p>
            </DSection>
            <DrawerTimeline title="Ruta de solución recomendada" events={sig.steps.map((s, i) => ({
              time: `Paso ${i + 1}`, label: s,
            }))} />
            <DrawerAIRecommendation text={sig.aiNote} />
            <DActions>
              <Link href={`/${orgSlug}/${sig.actionHref}`} className="ag-action-primary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                {sig.action} →
              </Link>
            </DActions>
            <DrawerTraceability source="Agentik IA · Motor de riesgo" updated={`Detectado ${_fmtNow()}`} />
          </>
        ),
      };
    }

    case "bank": {
      const bank = BANKS.find(b => b.id === ctx.id);
      if (!bank) return { title: "Banco", content: null };
      const sev: DrawerSeverity = bank.status === "requires_action" ? "warning" : bank.status === "pending" ? "critical" : bank.status === "partial" ? "watch" : "info";
      return {
        title: bank.label, subtitle: `${BANK_STATUS_LBL[bank.status]} · ${bank.syncLabel}`,
        statusLabel: BANK_STATUS_LBL[bank.status], severity: sev,
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Saldo",              value: bank.status === "pending" ? "—" : fmtM(bank.balance), accent: bank.status === "pending" ? C.inkFaint : undefined },
              { label: "Estado",             value: BANK_STATUS_LBL[bank.status], accent: BANK_ACCENT[bank.status] },
              { label: "Conciliaciones",     value: bank.concilPending > 0 ? `${bank.concilPending} pendientes` : "Al día", accent: bank.concilPending > 0 ? C.amber : C.green },
              { label: "Última sincronía",   value: bank.syncLabel },
            ]} />
            <DrawerTimeline title="Historial de sincronía" events={BANK_TIMELINE[bank.id] ?? []} />
            <DrawerRelatedItems title="Movimientos recientes" items={BANK_MOVEMENTS[bank.id] ?? []} />
            {bank.status === "requires_action" && (
              <>
                <DrawerAIRecommendation text="Subir extracto PayCo puede liberar 3 conciliaciones pendientes y mejorar la visibilidad del flujo diario. Sin extracto, $10.4M quedan fuera del consolidado." />
                <DActions>
                  <Link href={`/${orgSlug}/integrations/connectors`} className="ag-action-primary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                    Configurar conector →
                  </Link>
                  <Link href={`/${orgSlug}/reconciliation`} className="ag-action-secondary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                    Ver conciliación →
                  </Link>
                </DActions>
              </>
            )}
            {bank.status === "pending" && (
              <>
                <DrawerAIRecommendation text="Sin conector activo, MercadoPago está fuera del consolidado de caja. Configurar las credenciales activa la sincronización automática." />
                <DActions>
                  <Link href={`/${orgSlug}/integrations/connectors`} className="ag-action-primary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                    Configurar conector →
                  </Link>
                </DActions>
              </>
            )}
            {bank.status === "connected" && bank.concilPending > 0 && (
              <DActions>
                <Link href={`/${orgSlug}/reconciliation`} className="ag-action-secondary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                  Resolver {bank.concilPending} pendientes →
                </Link>
              </DActions>
            )}
            {bank.status === "connected" && bank.concilPending === 0 && (
              <DrawerAIRecommendation text="Cuenta conectada y al día. No se requiere acción. Próxima sincronización automática en curso." />
            )}
            <DrawerTraceability source={`SAG · Conector ${bank.label}`} updated={bank.syncLabel} />
          </>
        ),
      };
    }

    case "obligation": {
      const obl = OBLIGATIONS[ctx.index];
      if (!obl) return { title: "Obligación", content: null };
      const netPost = 0 - obl.amount; // BankAccount not integrated — balance unknown
      const netAccent = netPost > 10_000_000 ? C.green : netPost > 0 ? C.amber : C.red;
      return {
        title: obl.label, subtitle: `${obl.category} · Vence: ${obl.dueLong}`,
        statusLabel: SEV_LBL[obl.severity], severity: SEV_TO_DRAWER[obl.severity],
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Monto",          value: fmtCOP(obl.amount) },
              { label: "Vencimiento",    value: obl.dueLong,                      accent: SEV_DUE_CLR[obl.severity] },
              { label: "Categoría",      value: obl.category },
              { label: "Prioridad",      value: SEV_LBL[obl.severity],            accent: SEV_DOT[obl.severity] },
            ]} />
            <DSection title="Impacto en caja disponible">
              <DRow label="Caja disponible hoy"   value="Pendiente integración" />
              <DRow label="Este pago"              value={`-${fmtM(obl.amount)}`}    accent={C.red} />
              <DRow label="Caja después del pago"  value={fmtM(netPost)}              accent={netAccent} />
            </DSection>
            <DrawerRelatedItems title="Documentos relacionados" items={[
              { label: "Factura proveedor",    value: obl.category,   tag: "Registrado"   },
              { label: "Orden de pago",        value: fmtCOP(obl.amount), tag: "Pendiente" },
            ]} />
            {obl.severity === "critical" && (
              <DrawerAIRecommendation text="Proveedor crítico. El retraso genera intereses y puede bloquear pedidos futuros. Ejecutar hoy asegura condiciones de suministro." />
            )}
            {obl.severity === "warning" && (
              <DrawerAIRecommendation text="Obligación sensible de esta semana. Asegurar liquidez suficiente antes del vencimiento. No postergar sin aprobación." />
            )}
            {(obl.severity === "normal" || obl.severity === "info") && (
              <DrawerAIRecommendation text="Obligación no urgente. Puede ser evaluada para postergar si hay presión de liquidez sin afectar relaciones comerciales." />
            )}
            <DActions>
              <PassiveAction label="Marcar como ejecutado" />
              <PassiveAction label="Posponer" />
              <Link href={`/${orgSlug}/sales`} className="ag-action-ghost" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                Ver impacto en cartera →
              </Link>
            </DActions>
            <DrawerTraceability source="Datos SAG · CxP" updated={`Vence ${obl.dueLong}`} />
          </>
        ),
      };
    }

    case "forecast": {
      const fc = FORECAST_PERIODS.find(f => f.period === ctx.period);
      if (!fc) return { title: "Proyección", content: null };
      const pct = Math.min(100, Math.round((fc.runwayDays / fc.periodDays) * 100));
      const barColor = pct >= 90 ? C.green : pct >= 55 ? C.amber : C.red;
      return {
        title: `Proyección ${fc.period}`, subtitle: fc.scenario,
        statusLabel: "ESTIMADO", severity: SEV_TO_DRAWER[fc.runwaySev],
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Horizonte",        value: fc.runway,           accent: barColor },
              { label: "Cobertura",        value: `${pct}%`,           accent: barColor },
              { label: "Monto proyectado", value: fmtM(fc.amount) },
              { label: "Presión máxima",   value: fc.pressureAlert.split(" ").slice(0, 3).join(" ") },
            ]} />
            <DSection title="Variables del período">
              {fc.vars.map(v => (
                <DRow key={v.l} label={v.l} value={v.v} accent={v.pos ? C.green : C.inkMid} />
              ))}
            </DSection>
            <DrawerTimeline title="Eventos de presión proyectados" events={fc.pressureTimeline} />
            <DSection title="Escenario de riesgo">
              <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber, lineHeight: 1.7, margin: 0 }}>
                {fc.scenarioRisk}
              </p>
            </DSection>
            <DrawerAIRecommendation text={fc.aiNote} />
            <DActions>
              <Link href={`/${orgSlug}/sales`} className="ag-action-primary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                Priorizar cobros →
              </Link>
              <PassiveAction label="Actualizar proyección" />
            </DActions>
            <DrawerTraceability source="Modelo de proyección · SAG" updated={`Estimado ${_fmtNow()}`} />
          </>
        ),
      };
    }

    case "plan": {
      const pb = PLANS.find(p => p.key === ctx.key);
      if (!pb) return { title: "Plan de Acción", content: null };
      return {
        title: pb.title, subtitle: pb.objective,
        statusLabel: `${SEV_LBL[pb.severity]} · ${pb.horizon}`,
        severity: SEV_TO_DRAWER[pb.severity],
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Impacto esperado", value: pb.impact,   accent: C.green },
              { label: "Horizonte",        value: pb.horizon,  accent: SEV_DOT[pb.severity] },
              { label: "Estado",           value: pb.estado },
              { label: "Módulos",          value: pb.modules.split(" · ")[0] + "…" },
            ]} />
            <DSection title="Módulos involucrados">
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[2] }}>
                {pb.modules.split(" · ").map(mod => (
                  <span key={mod} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.sm, padding: `2px ${S[2]}px` }}>
                    {mod}
                  </span>
                ))}
              </div>
            </DSection>
            <DrawerTimeline title="Pasos del plan" events={pb.steps.map((s, i) => ({
              time: `Paso ${i + 1}`, label: s,
            }))} />
            <DrawerAIRecommendation text={pb.aiNote} />
            <DActions>
              {pb.href
                ? <Link href={`/${orgSlug}/${pb.href}`} className="ag-action-primary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                    {pb.actionLabel}
                  </Link>
                : <PassiveAction label={pb.actionLabel} />
              }
            </DActions>
            <DrawerTraceability source="Agentik IA · Planes operativos" updated={`Actualizado ${_fmtNow()}`} />
          </>
        ),
      };
    }

    case "flow_tile": {
      const MAP: Record<string, { title: string; value: string; detail: string; isAlert: boolean }> = {
        ingresos:        { title: "Ingresos del Día",          value: "+$8.4M", detail: "Cobros recibidos en el ciclo operativo de hoy.",                        isAlert: false },
        egresos:         { title: "Egresos del Día",           value: "-$3.2M", detail: "Pagos ejecutados en el ciclo operativo de hoy.",                        isAlert: false },
        identificados:   { title: "Movimientos Identificados", value: "24",     detail: "Movimientos cruzados exitosamente contra CxC o CxP.",                   isAlert: false },
        sin_identificar: { title: "Sin Identificar",           value: "3",      detail: "Consignaciones sin contrapartida. Requieren acción en conciliación.",   isAlert: true  },
        pendientes:      { title: "Pendientes de Clasificar",  value: "7",      detail: "Movimientos recibidos sin clasificación asignada.",                     isAlert: false },
      };
      const tile = MAP[ctx.key] ?? { title: ctx.key, value: "—", detail: "", isAlert: false };
      return {
        title: tile.title, subtitle: tile.detail,
        statusLabel: tile.isAlert ? "REQUIERE ACCIÓN" : "OPERATIVO",
        severity: tile.isAlert ? "warning" : "watch",
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Valor del ciclo",   value: tile.value },
              { label: "Ciclo",             value: "Operativo hoy" },
              { label: "Actualización",     value: _fmtNow() },
              { label: "Estado",            value: tile.isAlert ? "Requiere acción" : "Normal", accent: tile.isAlert ? C.amber : C.green },
            ]} />
            {tile.isAlert && (
              <>
                <DrawerRelatedItems title="Consignaciones sin identificar" items={[
                  { label: "Consignación — Banco Popular",        value: "+$2.1M", tag: "Sin cruzar"    },
                  { label: "Cobro PayCo — Ref. 203847",           value: "+$1.1M", tag: "Sin cruzar"    },
                  { label: "Depósito origen desconocido",         value: "+$0.9M", tag: "Sin cruzar"    },
                ]} />
                <DrawerAIRecommendation text="3 consignaciones sin identificar pueden representar pagos de clientes no aplicados a CxC. Resolverlos en conciliación mejora la visibilidad del flujo." />
                <DActions>
                  <Link href={`/${orgSlug}/reconciliation`} className="ag-action-primary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                    Conciliar movimientos →
                  </Link>
                </DActions>
              </>
            )}
            <DrawerTraceability source="Datos SAG · Ciclo diario" updated={`Ciclo ${_fmtNow()}`} />
          </>
        ),
      };
    }

    case "movement": {
      const mv = MOVEMENTS[ctx.index];
      if (!mv) return { title: "Movimiento", content: null };
      const isPending = mv.dir === "warn";
      return {
        title: mv.label, subtitle: `${mv.bank} · ${mv.time}`,
        statusLabel: mv.status.toUpperCase(),
        severity: isPending ? "warning" : "info",
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Banco",    value: mv.bank },
              { label: "Monto",   value: mv.amount, accent: mv.dir === "in" ? C.green : mv.dir === "warn" ? C.amber : C.inkMid },
              { label: "Hora",    value: mv.time },
              { label: "Estado",  value: mv.status, accent: isPending ? C.amber : undefined },
            ]} />
            <DSection title="Detalle del movimiento">
              <DRow label="Descripción" value={mv.label} />
              <DRow label="Banco"       value={mv.bank}  />
              <DRow label="Dirección"   value={mv.dir === "in" ? "Ingreso" : mv.dir === "out" ? "Egreso" : "Por identificar"} />
            </DSection>
            {isPending && (
              <>
                <DrawerAIRecommendation text="Movimiento sin contrapartida identificada. Puede ser un pago de cliente no cruzado con CxC. Requiere verificación manual en conciliación." />
                <DActions>
                  <Link href={`/${orgSlug}/reconciliation`} className="ag-action-primary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                    Abrir en conciliación →
                  </Link>
                </DActions>
              </>
            )}
            <DrawerTraceability source={`SAG · ${mv.bank}`} updated={`Registrado ${mv.time}`} />
          </>
        ),
      };
    }

    default:
      return { title: "Detalle", content: null };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CLIENT COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function TesoreriaClient({
  orgSlug,
  cashKpis,
  bankingSnapshot,
  graphIssueCount    = 0,
  graphCriticalCount = 0,
}: {
  orgSlug:             string;
  cashKpis?:           CashKpis;
  bankingSnapshot?:    BankingSnapshot;
  graphIssueCount?:    number;
  graphCriticalCount?: number;
}) {
  const [ctx, setCtx] = useState<DrawerCtx | null>(null);
  const open  = (c: DrawerCtx) => setCtx(c);
  const close = () => setCtx(null);

  const drawerProps = ctx ? getDrawerProps(ctx, orgSlug) : null;
  const criticalCount  = OBLIGATIONS.filter(o => o.severity === "critical").length;
  const totalOblAmount = OBLIGATIONS.reduce((s, o) => s + o.amount, 0);

  // ── Real cash data from getCashKpis (SAG SaleRecord) ─────────────────────
  const cajaHoy      = cashKpis?.cajaRecibidaHoy.amount ?? 0;
  const recaudoF1    = cashKpis?.recaudoF1Hoy.amount ?? 0;
  const recaudoF2    = cashKpis?.recaudoF2Hoy.amount ?? 0;
  const consignPend  = cashKpis?.consignacionesPendientes.amount ?? 0;
  const consignCount = cashKpis?.consignacionesPendientes.count ?? 0;
  const anticipos    = cashKpis?.anticiposPorAplicar.amount ?? 0;
  const diferencia   = cashKpis?.diferenciaConciliacion.amount ?? 0;
  const hasCashData  = cashKpis?.hasData ?? false;
  const healthStatus = cashKpis?.cashHealthStatus ?? "sin_datos";
  const healthReason = cashKpis?.cashHealthReason ?? "Sin datos de caja SAG";
  const asOf         = cashKpis?.asOf ?? null;

  // ── Banking data from BankAccount (real when accounts exist) ─────────────
  const hasBankData       = bankingSnapshot?.hasRealData ?? false;
  const bankAvailable     = bankingSnapshot?.balances.totalAvailable ?? 0;
  const bankCreditToday   = bankingSnapshot?.balances.totalCreditToday ?? 0;
  const bankPendingConsig = bankingSnapshot?.balances.pendingConsignaciones ?? 0;
  const bankHealthLevel   = bankingSnapshot?.health.level ?? "no_data";
  const bankHealthLabel   = bankingSnapshot?.health.label ?? "Sin datos bancarios — integración pendiente";
  const bankAccountCount  = bankingSnapshot?.balances.accounts.length ?? 0;

  const connectedCount = hasBankData ? bankAccountCount : BANKS.filter(b => b.status === "connected").length;
  const attnCount      = hasBankData ? (bankingSnapshot?.integrityIssues.filter(i => i.severity === "critical" || i.severity === "warning").length ?? 0) : BANKS.filter(b => b.status === "requires_action" || b.status === "partial").length;

  const OBL_HOY  = OBLIGATIONS.map((o, i) => ({ ...o, i })).filter(o => o.due === "HOY");
  const OBL_WEEK = OBLIGATIONS.map((o, i) => ({ ...o, i })).filter(o => o.severity === "warning");
  const OBL_PROX = OBLIGATIONS.map((o, i) => ({ ...o, i })).filter(o => o.severity === "normal" || o.severity === "info");

  return (
    <div style={{ minWidth: 0, overflowX: "hidden" }}>

      {/* ── 1. HEADER ──────────────────────────────────────────────────────── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Torre de Control", href: `/${orgSlug}/executive` },
          { label: "Tesorería Operativa" },
        ]}
        title="Tesorería Operativa"
        subtitle={`Centro de caja · ${_fmtNow()}`}
        status={healthStatus === "critico" ? "critical" : healthStatus === "atencion" ? "warning" : healthStatus === "saludable" ? "ok" : "neutral"}
        statusLabel={hasCashData ? healthReason : "Sin datos de caja SAG · verificar sincronización"}
      />

      {/* ── 2. FRANJA DE ESTADO ────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", flexWrap: "wrap" as const,
        gap: S[1], padding: `${S[3]}px ${S[5]}px`,
        background: C.blueLight, border: `1px solid ${C.blueBorder}`,
        borderRadius: R.lg, marginBottom: S[8],
      }}>
        {([
          { label: "ENTRÓ HOY · F1",   value: hasCashData ? fmtM(recaudoF1) : "Sin datos",      css: hasCashData ? "ag-op-status--ok" : "ag-op-status--pending"  },
          { label: "ENTRÓ HOY · F2",   value: hasCashData ? fmtM(recaudoF2) : "Sin datos",      css: hasCashData ? "ag-op-status--ok" : "ag-op-status--pending"  },
          { label: "SIN IDENTIFICAR",  value: hasCashData ? `${consignCount} · ${fmtM(consignPend)}` : "Sin datos", css: consignPend > 0 ? "ag-op-status--warning" : "ag-op-status--ok" },
          { label: "CAJA BANCARIA",    value: hasBankData ? fmtBankAmount(bankAvailable) : "Pendiente integración", css: hasBankData ? (bankHealthLevel === "critical" ? "ag-op-status--critical" : bankHealthLevel === "attention" ? "ag-op-status--warning" : "ag-op-status--ok") : "ag-op-status--info" },
          { label: "INTEGRIDAD GRAFO", value: graphIssueCount === 0 ? "Sin alertas" : `${graphIssueCount} alerta${graphIssueCount !== 1 ? "s" : ""}`, css: graphCriticalCount > 0 ? "ag-op-status--critical" : graphIssueCount > 0 ? "ag-op-status--warning" : "ag-op-status--ok" },
        ] as const).map((item, i) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center" }}>
            {i > 0 && <span style={{ display: "inline-block", width: 1, height: 28, background: C.blueBorder, margin: `0 ${S[4]}px` }} />}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>{item.label}</span>
              <span className={`ag-op-status ${item.css}`} style={{ fontSize: T.sz.xs }}>{item.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── 3. CAJA DISPONIBLE ─────────────────────────────────────────────── */}
      <section style={{ marginBottom: S[8] }}>
        <SectionLabel label="Caja disponible" meta="¿cuánto hay y de dónde viene?" accent={C.blueDark} />

        {/* 2×2 KPI cards — cada una abre drawer al hacer click */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[4], marginBottom: S[4] }}>

          {/* Caja bancaria — saldo total disponible en cuentas */}
          <div
            className="ag-kpi-card"
            onClick={() => open({ type: "cash", key: "disponible" })}
            style={{ padding: S[6], border: `1px solid ${C.lineSubtle}`, boxShadow: E.sm, cursor: "pointer" }}
          >
            <div className="ag-kpi-bar" style={{ background: hasBankData ? C.blueDark : C.inkGhost }} />
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Caja bancaria</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["3xl"], fontWeight: 700, color: hasBankData ? C.ink : C.inkGhost, lineHeight: 1.1, marginTop: S[3] }}>
              {hasBankData ? fmtBankAmount(bankAvailable) : "—"}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[3], lineHeight: 1.5 }}>
              {hasBankData
                ? `${bankAccountCount} cuenta${bankAccountCount !== 1 ? "s" : ""} · saldo disponible total`
                : "Pendiente integración bancaria"}
            </div>
          </div>

          {/* Entró hoy — F1 + F2 combinado */}
          <div
            className="ag-kpi-card"
            onClick={() => open({ type: "cash", key: "hoy" })}
            style={{ padding: S[6], border: `1px solid ${C.lineSubtle}`, boxShadow: E.sm, cursor: "pointer" }}
          >
            <div className="ag-kpi-bar" style={{ background: hasCashData ? C.green : C.inkGhost }} />
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Entró hoy</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["3xl"], fontWeight: 700, color: hasCashData ? C.green : C.inkGhost, lineHeight: 1.1, marginTop: S[3] }}>
              {hasCashData ? fmtM(recaudoF1 + recaudoF2) : "—"}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[3], lineHeight: 1.5 }}>
              {hasCashData
                ? `F1: ${fmtM(recaudoF1)} · F2: ${fmtM(recaudoF2)}`
                : "Sin datos SAG · verificar ciclo"}
              {asOf && <span style={{ display: "block", color: C.inkGhost, marginTop: 2 }}>Actualizado {asOf.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
          </div>

          {/* Sin identificar — ingresos sin cruzar (consignaciones) */}
          <div
            className="ag-kpi-card"
            onClick={() => open({ type: "flow_tile", key: "sin_identificar" })}
            style={{ padding: S[6], border: `1px solid ${consignPend > 0 ? C.amberBorder : C.lineSubtle}`, cursor: "pointer" }}
          >
            <div className="ag-kpi-bar" style={{ background: consignPend > 0 ? C.amber : C.inkGhost }} />
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Sin identificar</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["3xl"], fontWeight: 700, color: consignPend > 0 ? C.amber : C.inkGhost, lineHeight: 1.1, marginTop: S[3] }}>
              {hasCashData ? fmtM(consignPend) : "—"}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[3], lineHeight: 1.5 }}>
              {consignCount > 0
                ? `${consignCount} consignación${consignCount !== 1 ? "es" : ""} sin cruzar · B1/B2/H1/H2`
                : "Sin ingresos pendientes de identificar"}
            </div>
          </div>

          {/* Recibido sin aplicar — anticipos por aplicar a CxC */}
          <div
            className="ag-kpi-card"
            onClick={() => open({ type: "cash", key: "comprometido" })}
            style={{ padding: S[6], border: `1px solid ${anticipos > 0 ? C.amberBorder : C.lineSubtle}`, cursor: "pointer" }}
          >
            <div className="ag-kpi-bar" style={{ background: anticipos > 0 ? C.amber : C.inkGhost }} />
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Recibido sin aplicar</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["3xl"], fontWeight: 700, color: anticipos > 0 ? C.amber : C.inkGhost, lineHeight: 1.1, marginTop: S[3] }}>
              {hasCashData ? fmtM(anticipos) : "—"}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[3], lineHeight: 1.5 }}>
              Dinero recibido aún no aplicado a CxC · A1/A2
            </div>
          </div>
        </div>

        {/* Disponible operativo — resumen de fondo de caja */}
        <div
          onClick={() => open({ type: "cash", key: "proyectado" })}
          style={{
            background: C.blueLight, border: `1px solid ${C.blueBorder}`,
            borderLeft: `4px solid ${C.blueDark}`, borderRadius: R.lg,
            padding: `${S[4]}px ${S[5]}px`, display: "flex", justifyContent: "space-between",
            alignItems: "center", cursor: "pointer",
          }}
        >
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[1] }}>
              Disponible operativo
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, lineHeight: 1.5 }}>
              Caja bancaria confirmada · libre de compromisos conocidos
            </div>
          </div>
          <div style={{ textAlign: "right" as const, flexShrink: 0, marginLeft: S[5] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: 700, color: hasBankData ? C.ink : C.inkGhost }}>
              {hasBankData ? fmtBankAmount(bankAvailable) : "Pendiente"}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 2 }}>
              {hasBankData ? "Saldo bancario disponible" : "Requiere integración BankAccount"}
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. ENTRADAS DE HOY ─────────────────────────────────────────────── */}
      <CollapsibleSection
        title="Entradas de hoy"
        meta={hasCashData
          ? `F1: ${fmtM(recaudoF1)} · F2: ${fmtM(recaudoF2)} · ${consignCount > 0 ? `${consignCount} sin identificar` : "todo identificado"} · ${_fmtNow()}`
          : `Sin datos SAG · ${_fmtNow()}`}
        accent={C.green}
        detailLabel="Ver conciliación"
        defaultOpen
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: S[3], marginBottom: S[4] }}>
          {([
            { label: "Entró hoy por F1",     key: "ingresos"       as const, value: hasCashData ? `+${fmtM(recaudoF1)}` : "—",       color: hasCashData ? C.green    : C.inkGhost, sub: "Cobros oficiales · R1/A1/AN"       },
            { label: "Entró hoy por F2",     key: "egresos"        as const, value: hasCashData ? `+${fmtM(recaudoF2)}` : "—",       color: hasCashData ? C.blue     : C.inkGhost, sub: "Cobros operativos · R2/A2"         },
            { label: "Sin identificar",      key: "sin_identificar" as const, value: hasCashData ? `${consignCount} consig.` : "—",   color: consignCount > 0 ? C.amber : hasCashData ? C.green : C.inkGhost, sub: "Pendientes cruce · B1/B2/H1"      },
            { label: "En limbo",             key: "pendientes"     as const, value: hasCashData ? fmtM(diferencia) : "—",            color: diferencia > 0 ? C.amber : hasCashData ? C.green : C.inkGhost,   sub: "Consig. + recibos sin clasificar"  },
            { label: "Recibido sin aplicar", key: "identificados"  as const, value: hasCashData ? fmtM(anticipos) : "—",             color: anticipos > 0 ? C.amber  : hasCashData ? C.inkLight : C.inkGhost, sub: "Anticipos por aplicar · A1/A2"    },
          ]).map(f => (
            <div
              key={f.label}
              onClick={() => open({ type: "flow_tile", key: f.key })}
              style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.md, padding: `${S[4]}px ${S[4]}px ${S[3]}px`, boxShadow: E.xs, cursor: "pointer" }}
            >
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[1] }}>{f.label}</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: 700, color: f.color, lineHeight: 1.2 }}>{f.value}</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost, marginTop: S[1] }}>{f.sub}</div>
            </div>
          ))}
        </div>

        {consignCount > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.amberBorder}`, borderLeft: `3px solid ${C.amber}`, borderRadius: R.md, padding: `${S[3]}px ${S[4]}px`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
              {consignCount} consignación{consignCount !== 1 ? "es" : ""} sin identificar — requieren cruce en conciliación
            </span>
            <Link href={`/${orgSlug}/finanzas/conciliacion`} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark, textDecoration: "none", fontWeight: 600, flexShrink: 0, marginLeft: S[4] }}>
              Conciliar →
            </Link>
          </div>
        )}

        {!hasCashData && (
          <div style={{ background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.md, padding: `${S[4]}px`, textAlign: "center" as const }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, marginBottom: S[1] }}>Sin datos de entradas de hoy</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost }}>Verificar sincronización SAG · SaleRecord</div>
          </div>
        )}
      </CollapsibleSection>

      {/* ── 5. PRÓXIMOS PAGOS ──────────────────────────────────────────────── */}
      <CollapsibleSection
        title="Próximos pagos"
        meta={OBLIGATIONS.length > 0
          ? `${criticalCount} crítico${criticalCount !== 1 ? "s" : ""} · ${fmtM(totalOblAmount)} comprometido`
          : "Pendiente integración · modelo Obligation"}
        accent={C.amber}
        detailLabel="Ver obligaciones"
        defaultOpen
      >
        {OBLIGATIONS.length > 0 ? (
          <>
            {[
              { key: "hoy",    label: "HOY",        sev: "critical" as Severity, items: OBL_HOY  },
              { key: "semana", label: "ESTA SEMANA", sev: "warning"  as Severity, items: OBL_WEEK },
              { key: "prox",   label: "PRÓXIMAS",    sev: "normal"   as Severity, items: OBL_PROX },
            ].filter(g => g.items.length > 0).map(g => (
              <div key={g.key} style={{ marginBottom: S[4] }}>
                <div style={{ display: "flex", alignItems: "center", gap: S[3], padding: `${S[2]}px ${S[4]}px`, background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: `${R.md}px ${R.md}px 0 0` }}>
                  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: R.pill, background: SEV_DOT[g.sev], flexShrink: 0 }} />
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: SEV_DOT[g.sev], textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{g.label}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                    {g.items.length} obligación{g.items.length !== 1 ? "es" : ""} · {fmtM(g.items.reduce((s, o) => s + o.amount, 0))}
                  </span>
                </div>
                <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderTop: "none", borderRadius: `0 0 ${R.md}px ${R.md}px`, overflow: "hidden" }}>
                  {g.items.map((obl, ri) => (
                    <div key={obl.i} onClick={() => open({type:"obligation",index:obl.i})} className="ag-op-row" style={{ display: "grid", gridTemplateColumns: "1fr 72px 84px 112px 76px", gap: S[4], alignItems: "center", padding: `${S[3]}px ${S[4]}px`, borderBottom: ri < g.items.length - 1 ? `1px solid ${C.lineSubtle}` : "none", borderLeft: `3px solid ${SEV_DOT[obl.severity]}`, cursor: "pointer", transition: "background 0.1s" }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{obl.label}</span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{obl.category}</span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: SEV_DUE_CLR[obl.severity], fontWeight: obl.severity === "critical" ? 700 : 400 }}>{obl.due}</span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.inkMid, textAlign: "right" as const }}>{fmtCOP(obl.amount)}</span>
                      <span className={`ag-op-status ${SEV_CSS[obl.severity]}`} style={{ fontSize: T.sz["2xs"] }}>{SEV_LBL[obl.severity]}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : (
          /* Próximos pagos — categorías vacías mientras se integra modelo Obligation */
          <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, overflow: "hidden" }}>
            <div style={{ padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`, background: C.surface, display: "grid", gridTemplateColumns: "1fr 100px 100px 80px", gap: S[3] }}>
              {["Tipo de pago", "Categoría", "Vencimiento", "Estado"].map(h => (
                <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</span>
              ))}
            </div>
            {(["Proveedores","Bancos","Nómina","Impuestos","Seguros","Pólizas","Servicios","Otros"] as const).map((cat, i) => (
              <div key={cat} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 80px", gap: S[3], alignItems: "center", padding: `${S[3]}px ${S[4]}px`, borderBottom: i < 7 ? `1px solid ${C.lineSubtle}` : "none", opacity: 0.5 }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>{cat}</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>—</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>—</span>
                <span className="ag-op-status ag-op-status--pending" style={{ fontSize: T.sz["2xs"] }}>PENDIENTE</span>
              </div>
            ))}
            <div style={{ padding: `${S[3]}px ${S[4]}px`, borderTop: `1px solid ${C.lineSubtle}`, background: C.surface }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost }}>
                Próximos pagos disponibles cuando se integre el modelo de Obligaciones
              </span>
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* ── 6. CONTROL OPERATIVO ───────────────────────────────────────────── */}
      <CollapsibleSection
        title="Control operativo"
        meta={hasBankData
          ? `${connectedCount} cuenta${connectedCount !== 1 ? "s" : ""} · ${fmtBankAmount(bankAvailable)} disponible · ${EGRESOS.length > 0 ? `${EGRESOS.length} egresos recientes` : "sin egresos registrados"}`
          : "Pendiente integración bancaria"}
        accent={C.blue}
        detailLabel="Ver bancos"
        defaultOpen
      >

        {/* Últimos egresos */}
        <div style={{ marginBottom: S[6] }}>
          <SectionLabel label="Últimos egresos" />
          <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, overflow: "hidden" }}>
            <div style={{ padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`, background: C.surface, display: "grid", gridTemplateColumns: "90px 1fr 110px 100px 80px 70px", gap: S[3], alignItems: "center" }}>
              {["Fecha","Concepto","Monto","Fuente","Estado","Conciliado"].map(h => (
                <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</span>
              ))}
            </div>
            {EGRESOS.length > 0 ? (
              EGRESOS.map((eg, i) => (
                <div
                  key={i}
                  onClick={() => open({ type: "movement", index: i })}
                  className="ag-op-row"
                  style={{ display: "grid", gridTemplateColumns: "90px 1fr 110px 100px 80px 70px", gap: S[3], alignItems: "center", padding: `${S[3]}px ${S[4]}px`, borderBottom: i < EGRESOS.length - 1 ? `1px solid ${C.lineSubtle}` : "none", cursor: "pointer" }}
                >
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{eg.date}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{eg.concept}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.inkMid }}>{fmtCOP(eg.amount)}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{eg.source}</span>
                  <span className={`ag-op-status ${eg.status === "ejecutado" ? "ag-op-status--ok" : eg.status === "programado" ? "ag-op-status--info" : "ag-op-status--pending"}`} style={{ fontSize: T.sz["2xs"] }}>
                    {eg.status.toUpperCase()}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: eg.conciliado ? C.green : C.amber }}>
                    {eg.conciliado ? "SÍ" : "NO"}
                  </span>
                </div>
              ))
            ) : (
              <div style={{ padding: `${S[5]}px ${S[4]}px`, textAlign: "center" as const }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, marginBottom: S[1] }}>Sin egresos registrados</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost }}>Los egresos aparecen aquí cuando se integre BankAccount · modelo de movimientos</div>
              </div>
            )}
          </div>
        </div>

        {/* Caja bancaria — estado de cuentas */}
        <div>
          <SectionLabel label="Caja bancaria" meta={hasBankData ? `${connectedCount} cuenta${connectedCount !== 1 ? "s" : ""}` : "pendiente sync"} />
          <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, overflow: "hidden" }}>
            <div style={{ padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`, background: C.surface, display: "grid", gridTemplateColumns: "1fr 90px 88px 120px 110px 120px", gap: S[3], alignItems: "center" }}>
              {["Banco","Saldo","Estado","Sincronía","Conciliación","Acción"].map(h => (
                <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</span>
              ))}
            </div>

            {hasBankData ? (
              (bankingSnapshot?.balances.accounts ?? []).map((acct, i) => {
                const acctStatus: BankStatus = !acct.lastSyncAt ? "pending" : "connected";
                return (
                  <div key={acct.accountId} className="ag-op-row" style={{ display: "grid", gridTemplateColumns: "1fr 90px 88px 120px 110px 120px", gap: S[3], alignItems: "center", padding: `${S[3]}px ${S[4]}px`, borderBottom: i < (bankingSnapshot?.balances.accounts.length ?? 1) - 1 ? `1px solid ${C.lineSubtle}` : "none", borderLeft: `3px solid ${BANK_ACCENT[acctStatus]}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>{acct.accountName}</span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{acct.bankName}</span>
                    </div>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>{fmtBankAmount(acct.availableBalance)}</span>
                    <span className={`ag-op-status ${BANK_STATUS_CSS[acctStatus]}`} style={{ fontSize: T.sz["2xs"] }}>{BANK_STATUS_LBL[acctStatus]}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{acct.lastSyncAt ? acct.lastSyncAt.toLocaleDateString("es-CO") : "Sin sync"}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{acct.movementCount} movimientos</span>
                    <button className="ag-action-ghost" onClick={() => open({type:"bank",id:acct.accountId})} style={{ fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer", minWidth: 112, height: 28 }}>
                      Ver movimientos
                    </button>
                  </div>
                );
              })
            ) : BANKS.length > 0 ? (
              BANKS.map((bank, i) => {
                const isPending = bank.status === "pending";
                const actionLbl = bank.status === "connected" ? "Ver movimientos" : bank.status === "partial" ? "Ver actividad" : bank.status === "requires_action" ? "Subir extracto" : "Configurar";
                const actionCls = bank.status === "requires_action" || bank.status === "pending" ? "ag-action-secondary" : "ag-action-ghost";
                return (
                  <div key={bank.id} className="ag-op-row" style={{ display: "grid", gridTemplateColumns: "1fr 90px 88px 120px 110px 120px", gap: S[3], alignItems: "center", padding: `${S[3]}px ${S[4]}px`, borderBottom: i < BANKS.length - 1 ? `1px solid ${C.lineSubtle}` : "none", borderLeft: `3px solid ${BANK_ACCENT[bank.status]}`, transition: "background 0.1s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>{bank.label}</span>
                      {bank.hasAnomaly && <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: R.pill, background: C.amber, flexShrink: 0 }} />}
                    </div>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: isPending ? C.inkFaint : C.ink }}>{isPending ? "—" : fmtM(bank.balance)}</span>
                    <span className={`ag-op-status ${BANK_STATUS_CSS[bank.status]}`} style={{ fontSize: T.sz["2xs"] }}>{BANK_STATUS_LBL[bank.status]}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{bank.syncLabel}</span>
                    <div>
                      {bank.concilPending > 0
                        ? <Link href={`/${orgSlug}/reconciliation`} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber, textDecoration: "none", fontWeight: 600 }}>{bank.concilPending} pendientes →</Link>
                        : <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>—</span>
                      }
                    </div>
                    <button className={actionCls} onClick={() => open({type:"bank",id:bank.id})} style={{ fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer", minWidth: 112, height: 28 }}>{actionLbl}</button>
                  </div>
                );
              })
            ) : (
              <div style={{ padding: `${S[5]}px ${S[4]}px`, textAlign: "center" as const }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, marginBottom: S[1] }}>Sin cuentas bancarias configuradas</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost, marginBottom: S[3] }}>Conecta tus cuentas para ver saldos en tiempo real</div>
                <Link href={`/${orgSlug}/integrations/connectors`} className="ag-action-secondary" style={{ textDecoration: "none", fontSize: T.sz.xs, display: "inline-block" }}>
                  Configurar conectores →
                </Link>
              </div>
            )}

            <div style={{ padding: `${S[2]}px ${S[4]}px`, borderTop: `1px solid ${C.lineSubtle}`, background: C.blueLight, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>Total disponible</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink }}>
                {hasBankData ? fmtBankAmount(bankAvailable) : fmtM(BANKS.filter(b => b.status !== "pending").reduce((s, b) => s + b.balance, 0))}
              </span>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* ── DRAWER ──────────────────────────────────────────────────────────── */}
      {drawerProps && (
        <OperationalSideDrawer
          open={ctx !== null}
          onClose={close}
          title={drawerProps.title}
          subtitle={drawerProps.subtitle}
          statusLabel={drawerProps.statusLabel}
          severity={drawerProps.severity}
        >
          {drawerProps.content}
        </OperationalSideDrawer>
      )}

    </div>
  );
}
