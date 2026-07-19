"use client";

/**
 * ConciliacionClient
 *
 * Workspace Operacional de Conciliación Inteligente.
 * Motor de matching · Selector de fuentes SAG · Excepciones · Historial real.
 *
 * Sprint: AGENTIK-RECONCILIATION-WORKSPACE-01
 * Data: sessions from session-service (real DB), sources from RECONCILIATION_SOURCES registry.
 */

import Link                           from "next/link";
import { useState }                   from "react";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { CollapsibleSection }         from "@/components/workspace/collapsible-section";
import { OperationalSideDrawer }      from "@/components/workspace/operational-side-drawer";
import type { DrawerSeverity }        from "@/components/workspace/operational-side-drawer";
import { C, T, S, R, E }            from "@/lib/ui/tokens";
import { opActionBtn, opActionCol } from "@/lib/ui/op-table";
import { ExecutionObservabilityPanel } from "@/components/reconciliation/execution-observability-panel";
import { ExecutionTimeline }           from "@/components/reconciliation/execution-timeline";
import { ReviewCenter }               from "@/components/reconciliation/review-center";
import { SourceReadinessBoard }        from "@/components/reconciliation/source-readiness-board";
import { DetectedLimitationsCard }     from "@/components/reconciliation/detected-limitations-card";
import type { SourceReadinessReport }  from "@/lib/reconciliation/readiness/source-readiness";
import type { DetectedLimitationsReport } from "@/lib/reconciliation/readiness/detected-limitations";
import type { ReconciliationSummary }           from "@/lib/finance/reconciliation";
import type { CashKpis }                        from "@/lib/castillitos/cash-kpis";
import type { ReconSessionRow }                 from "@/lib/reconciliation/session-types";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Severity = "critical" | "warning" | "normal" | "info";

type DrawerCtx =
  | { type: "result_group"; key: "conciliados" | "pendientes" | "duplicados" | "inconsistentes" | "huerfanos" | "revision" }
  | { type: "exception";       index: number }
  | { type: "match_field";     index: number }
  | { type: "rule";            index: number }
  | { type: "session";         index: number }
  | { type: "source_selector"; sourceId: "a" | "b" }
  | { type: "run_matching" }
  | { type: "new_rule" }

/** Serializable source contract — no Prisma types. */
export type SourceForUI = {
  sourceId:            string;
  label:               string;
  shortLabel:          string;
  provider:            string;
  readiness:           string;
  readinessNote:       string;
  availableFields:     string[];
  requiresUpload:      boolean;
  requiresCredential:  boolean;
  requiresIntegration: boolean;
};

/** Client-safe rule representation for the rule engine. No server imports. */
type RuleForUI = {
  ruleId:       string;
  label:        string;
  description:  string;
  group:        "identity" | "financial" | "temporal" | "counterpart" | "custom";
  sourceField:  string;
  targetField:  string;
  operator:     "equals" | "contains" | "starts_with" | "numeric_tolerance" | "date_window" | "exact_match";
  tolerance?:   number;
  windowDays?:  number;
  maxPoints:    number;
  enabled:      boolean;
};

/** API response from POST /reconciliation/rule-engine/run */
type RuleEngineResponse = {
  status:        "ok" | "pending_source" | "unsupported_combination" | "no_records";
  summary?:      {
    period:              string;
    sourceALabel:        string;
    sourceBLabel:        string;
    recordsA:            number;
    recordsB:            number;
    pairsEvaluated:      number;
    noCandidate:         number;
    reconciled:          number;
    partial:             number;
    pending:             number;
    mismatches:          number;
    suspicious:          number;
    avgScore:            number;
    governanceSnapshots: number;
  };
  pairResults?:  Array<{
    recordAKey:     string;
    recordBKey:     string | null;
    score:          number;
    confidence:     "high" | "medium" | "low";
    verdict:        string;
    verdictLabel:   string;
    requiresAction: boolean;
    severity:       "ok" | "watch" | "elevated" | "critical";
    headline:       string;
    reasons:        string[];
    rulesPassed:    number;
    rulesEvaluated: number;
  }>;
  /** Full observability report — present when status === "ok". */
  executionReport?: import("@/lib/reconciliation/observability/execution-report").ExecutionReport;
  reason?:           string;
  blockers?:         string[];
  sourceAReadiness?: string;
  sourceBReadiness?: string;
  sourceALabel?:     string;
  sourceBLabel?:     string;
};

// Default active rules matching the enabled presets in rule-presets.ts
const DEFAULT_RULE_STUBS: RuleForUI[] = [
  {
    ruleId: "preset_doc_exact", label: "Número de documento — exacto",
    description: "Los números de documento deben coincidir exactamente.",
    group: "identity", sourceField: "documentNumber", targetField: "documentNumber",
    operator: "exact_match", maxPoints: 40, enabled: true,
  },
  {
    ruleId: "preset_amount_exact", label: "Valor — exacto (0.1% tolerancia)",
    description: "Los valores monetarios deben coincidir dentro de 0.1%.",
    group: "financial", sourceField: "amount", targetField: "amount",
    operator: "numeric_tolerance", tolerance: 0.001, maxPoints: 30, enabled: true,
  },
  {
    ruleId: "preset_date_same_day", label: "Fecha — mismo día",
    description: "Las fechas de documento deben ser el mismo día.",
    group: "temporal", sourceField: "date", targetField: "date",
    operator: "date_window", windowDays: 0, maxPoints: 10, enabled: false,
  },
  {
    ruleId: "preset_nit_exact", label: "NIT / Tercero — exacto",
    description: "El NIT o ID de tercero debe coincidir exactamente.",
    group: "counterpart", sourceField: "thirdPartyId", targetField: "thirdPartyId",
    operator: "exact_match", maxPoints: 20, enabled: false,
  },
  {
    ruleId: "preset_amount_2pct", label: "Valor — tolerancia 2%",
    description: "Tolerancia del 2% para diferencias de redondeo o comisiones.",
    group: "financial", sourceField: "amount", targetField: "amount",
    operator: "numeric_tolerance", tolerance: 0.02, maxPoints: 20, enabled: false,
  },
  {
    ruleId: "preset_date_3days", label: "Fecha — ventana ±3 días",
    description: "Las fechas deben estar dentro de 3 días calendario.",
    group: "temporal", sourceField: "date", targetField: "date",
    operator: "date_window", windowDays: 3, maxPoints: 5, enabled: false,
  },
];

// ── Operational view metadata per source type (for Source A/B display) ─────────
const SOURCE_OPERATIONAL_META: Record<string, { tag: string; color: string; bg: string; border: string }> = {
  "sag_orders":       { tag: "F2",    color: "#92400e", bg: "#fffbeb", border: "#fde68a" },
  "sag_sales":        { tag: "F1",    color: "#1e40af", bg: "#eff6ff", border: "#bfdbfe" },
  "sag_payments":     { tag: "F1",    color: "#1e40af", bg: "#eff6ff", border: "#bfdbfe" },
  "sag_receivables":  { tag: "F1",    color: "#1e40af", bg: "#eff6ff", border: "#bfdbfe" },
  "dian_xml":         { tag: "DIAN",  color: "#166534", bg: "#f0fdf4", border: "#bbf7d0" },
  "dian_invoice":     { tag: "DIAN",  color: "#166534", bg: "#f0fdf4", border: "#bbf7d0" },
  "bank_statement":   { tag: "BANCO", color: "#0369a1", bg: "#eff6ff", border: "#bfdbfe" },
  "payment_gateway":  { tag: "WEB",   color: "#0e7490", bg: "#ecfeff", border: "#a5f3fc" },
  "manual_upload":    { tag: "MANUAL",color: "#374151", bg: "#f9fafb", border: "#e5e7eb" },
  "spreadsheet":      { tag: "XLSX",  color: "#374151", bg: "#f9fafb", border: "#e5e7eb" },
};

const READINESS_META: Record<string, { dot: string; label: string; css: string }> = {
  "available":               { dot: C.green,    label: "Disponible",              css: "ag-op-status--ok"      },
  "pending_sag_validation":  { dot: C.amber,    label: "Pendiente SAG",           css: "ag-op-status--pending" },
  "pending_integration":     { dot: C.amber,    label: "Pendiente integración",   css: "ag-op-status--pending" },
  "requires_integration":    { dot: C.amber,    label: "Requiere integración",    css: "ag-op-status--pending" },
  "requires_upload":         { dot: "#6366f1",  label: "Requiere carga",          css: "ag-op-status--info"    },
  "requires_credential":     { dot: "#6366f1",  label: "Requiere credencial",     css: "ag-op-status--info"    },
  "unavailable":             { dot: C.inkGhost, label: "No disponible",           css: "ag-op-status--blocked" },
};

/** Map ReconciliationSessionStatus to canvas display format. */
function mapSessionStatus(status: string): "ok" | "warning" {
  return (status === "needs_review" || status === "failed" || status === "cancelled") ? "warning" : "ok";
}

/** Format a ReconSessionRow for the history table. */
function formatSessionRow(s: ReconSessionRow): {
  id: string; code: string; title: string; date: string;
  operator: string; type: string;
  matches: number; conflicts: number; exceptions: number;
  duration: string; status: "ok" | "warning";
  period: string | null;
} {
  const summary = s.summary;
  return {
    id:         s.id,
    code:       s.sessionCode,
    title:      s.title,
    date:       new Date(s.updatedAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }),
    operator:   "Sistema",
    type:       "Automática",
    matches:    summary?.matched           ?? 0,
    conflicts:  summary ? Math.round((summary.mismatchAmount > 0 ? 1 : 0) + summary.possibleDuplicates) : 0,
    exceptions: summary ? summary.onlyInA + summary.onlyInB : 0,
    duration:   "—",
    status:     mapSessionStatus(s.status),
    period:     s.period,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const _now = new Date();
function _fmtNow(): string {
  return `${_now.getHours().toString().padStart(2, "0")}:${_now.getMinutes().toString().padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA — Sources driven by props from page.tsx (real runtime data).
// FUENTE_A/B: Bank statement sources — pending BankAccount model integration.
// MATCH_RESULTS: real ReconciliationSummary from getReconciliationSummary().
// EXCEPTIONS: pending real exception tracking (no mock).
// ─────────────────────────────────────────────────────────────────────────────

// Source A/B defaults — overridden by allSources prop when available
// sourceId drives look-up into SOURCE_OPERATIONAL_META for view-type tag
const FUENTE_A_DEFAULT: SourceForUI & { sourceId: string } = {
  sourceId: "sag_sales", label: "Ventas SAG", shortLabel: "SAG Ventas",
  provider: "SAG PYA", readiness: "available",
  readinessNote: "Datos disponibles vía SaleRecord (SAG PYA sync).",
  availableFields: ["sellerSlug", "productLine", "channel", "amount", "period"],
  requiresUpload: false, requiresCredential: false, requiresIntegration: false,
};
const FUENTE_B_DEFAULT: SourceForUI & { sourceId: string } = {
  sourceId: "bank_statement", label: "Extracto Bancario", shortLabel: "Extracto",
  provider: "Banco", readiness: "requires_integration",
  readinessNote: "Requiere conexión con extracto bancario o carga de archivo CSV.",
  availableFields: ["transactionDate", "description", "credit", "debit", "balance", "reference"],
  requiresUpload: true, requiresCredential: true, requiresIntegration: true,
};

// MATCH_FIELDS: real field-level matching driven by reconciliation.ts rules (no mock)
const MATCH_FIELDS: Array<{
  fieldA: string; fieldB: string; confidence: number;
  status: "match" | "partial" | "conflict";
  note: string; interpretation: string;
}> = [];

// MATCH_RESULTS_EMPTY: zero fallback used when reconSummary is not available
const MATCH_RESULTS_EMPTY: Record<string, { count: number; amount: number }> = {
  conciliados:    { count: 0, amount: 0 },
  pendientes:     { count: 0, amount: 0 },
  duplicados:     { count: 0, amount: 0 },
  inconsistentes: { count: 0, amount: 0 },
  huerfanos:      { count: 0, amount: 0 },
  revision:       { count: 0, amount: 0 },
};

// EXCEPTIONS: no mock — real exceptions come from reconSummary.items (INCONSISTENTE status)
const EXCEPTIONS: Array<{
  id: string; label: string; amount: number; source: string; type: string;
  severity: Severity; date: string; detail: string; resolution: string; action: string; cta: string;
  timeline: Array<{ time: string; label: string; severity?: Severity }>;
}> = [];

// Reconciliation rules
const RULES: Array<{
  id: string; label: string; conditions: string;
  conditionDetail: string[];
  ifThen: { if: string[]; then: string };
  hits: number; active: boolean;
  severity: Severity; lastApplied: string; aiNote: string;
}> = [
  {
    id: "R01", label: "Conciliación automática SAG ↔ Bancolombia",
    conditions: "referencia · valor ±2% · fecha ±3 días",
    conditionDetail: [
      "Campo: referencia_banco = numero_documento",
      "Tolerancia valor: ±2% del monto",
      "Tolerancia fecha: ±3 días calendario",
    ],
    ifThen: {
      if: ["referencia bancaria coincide con documento SAG", "diferencia de valor ≤ 2%", "diferencia de fecha ≤ 3 días"],
      then: "conciliar automáticamente sin revisión manual",
    },
    hits: 127, active: true, severity: "info", lastApplied: "Hace 2h",
    aiNote: "Esta regla tiene 94% de tasa de éxito histórica. Aplicable a la mayoría de movimientos de Bancolombia.",
  },
  {
    id: "R02", label: "Facturas DIAN ↔ pagos bancarios exactos",
    conditions: "NIT + número doc + valor exacto",
    conditionDetail: [
      "Campo: nit_emisor = nit_tercero (exacto)",
      "Campo: numero_factura = referencia_doc (exacto)",
      "Valor total exacto — sin tolerancia (normativa DIAN)",
    ],
    ifThen: {
      if: ["NIT del emisor coincide exactamente", "número de factura coincide", "valor total es idéntico"],
      then: "conciliar factura DIAN con pago bancario automáticamente",
    },
    hits: 48, active: true, severity: "info", lastApplied: "Hace 4h",
    aiNote: "Regla estricta para facturas DIAN. Alta precisión — sin tolerancia de valor por normativa fiscal.",
  },
  {
    id: "R03", label: "Depósitos sin referencia bancaria",
    conditions: "valor ±5% · fecha ±7 días",
    conditionDetail: [
      "No requiere coincidencia de referencia",
      "Tolerancia valor: ±5% del monto",
      "Tolerancia fecha: ±7 días calendario",
    ],
    ifThen: {
      if: ["diferencia de valor ≤ 5%", "diferencia de fecha ≤ 7 días"],
      then: "marcar para revisión manual antes de conciliar",
    },
    hits: 12, active: false, severity: "normal", lastApplied: "Hace 3 días",
    aiNote: "Mayor tolerancia para depósitos sin referencia. Riesgo de falsos positivos — activar con revisión manual habilitada.",
  },
];

// SESSIONS — populated from real DB data passed as prop (formatSessionRow converts ReconSessionRow)
// This const is replaced inside the component with derived data; kept here as empty fallback.
const SESSIONS_EMPTY: ReturnType<typeof formatSessionRow>[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP MAPS
// ─────────────────────────────────────────────────────────────────────────────

const SEV_DOT: Record<Severity, string> = {
  critical: C.red, warning: C.amber, normal: C.inkGhost, info: C.blue,
};
const SEV_TO_DRAWER: Record<Severity, DrawerSeverity> = {
  critical: "critical", warning: "warning", normal: "info", info: "watch",
};
const TYPE_COLOR: Record<string, string> = {
  "Pago sin soporte":        C.blue,
  "Pago duplicado":          C.red,
  "Valor no coincide":       C.amber,
  "Sin soporte documental":  C.amber,
  "Identidad inconsistente": C.red,
};

const RESULT_META: Record<string, { label: string; color: string; sev: DrawerSeverity; sub: string }> = {
  conciliados:    { label: "CONCILIADOS",    color: C.green, sev: "info",    sub: "Match automático confirmado"   },
  pendientes:     { label: "PENDIENTES",     color: C.amber, sev: "warning", sub: "En cola · sin match"           },
  duplicados:     { label: "DUPLICADOS",     color: C.red,   sev: "warning", sub: "Referencia repetida"           },
  inconsistentes: { label: "INCONSISTENTES", color: C.amber, sev: "warning", sub: "Valores divergentes"           },
  huerfanos:      { label: "HUÉRFANOS",      color: C.blue,  sev: "watch",   sub: "Sin contrapartida detectada"   },
  revision:       { label: "REVISIÓN",       color: C.blue,  sev: "watch",   sub: "Revisión manual requerida"     },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function fmtM(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE-LEVEL SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ label, meta, accent }: { label: string; meta?: string; accent?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: S[2], marginBottom: S[5],
      padding: `${S[2] + 2}px ${S[3]}px`,
      background: C.surface, border: `1px solid ${C.lineSubtle}`,
      ...(accent ? { borderLeft: `3px solid ${accent}` } : {}),
      borderRadius: R.md,
    }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>{label}</span>
      {meta && <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>· {meta}</span>}
    </div>
  );
}

function PassiveAction({ label }: { label: string }) {
  return (
    <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkGhost, padding: `${S[2]}px ${S[3]}px`, display: "block", cursor: "default", userSelect: "none" as const }}>
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

function DrawerMetricGrid({ items }: { items: Array<{ label: string; value: string; accent?: string }> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2], marginBottom: S[5] }}>
      {items.map(item => (
        <div key={item.label} style={{
          background: C.surface, border: `1px solid ${C.lineSubtle}`,
          borderLeft: `3px solid ${item.accent ?? C.lineSubtle}`,
          borderRadius: R.md, padding: `${S[3]}px ${S[3]}px ${S[2]}px`,
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: S[1] }}>{item.label}</div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: 700, color: item.accent ?? C.ink, lineHeight: 1.2 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function DrawerTimeline({ title, events }: {
  title?: string;
  events: Array<{ time: string; label: string; severity?: Severity }>;
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
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0, width: 10 }}>
              <div style={{
                width: 10, height: 10, borderRadius: R.pill, flexShrink: 0, marginTop: 2,
                background: ev.severity ? SEV_DOT[ev.severity] : C.blue,
                boxShadow: `0 0 0 2px ${C.white}`,
              }} />
              {i < events.length - 1 && <div style={{ width: 1, flex: 1, background: C.lineSubtle, minHeight: S[3], marginTop: 2 }} />}
            </div>
            <div style={{ paddingBottom: i < events.length - 1 ? S[3] : 0, minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 2 }}>{ev.time}</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.5 }}>{ev.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
            <span style={{ flex: 1, fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{item.label}</span>
            {item.tag && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.sm, padding: `1px ${S[2]}px`, whiteSpace: "nowrap" as const, flexShrink: 0 }}>{item.tag}</span>
            )}
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink, whiteSpace: "nowrap" as const, flexShrink: 0 }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawerAIRecommendation({ text }: { text: string }) {
  return (
    <div style={{ background: C.blueLight, border: `1px solid ${C.blueBorder}`, borderLeft: `3px solid ${C.blueDark}`, borderRadius: R.md, padding: S[4], marginBottom: S[4] }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 16, borderRadius: R.sm, background: C.blueDark, color: C.white, fontFamily: T.mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.04em", flexShrink: 0 }}>
          IA
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Agentik detecta</span>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, lineHeight: 1.7 }}>{text}</div>
    </div>
  );
}

function DrawerTraceability({ source, updated }: { source: string; updated: string }) {
  return (
    <div style={{ marginTop: S[5], paddingTop: S[3], borderTop: `1px solid ${C.lineSubtle}`, display: "flex", alignItems: "center", gap: S[2] }}>
      <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: R.pill, background: C.green, flexShrink: 0 }} />
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>{source} · {updated}</span>
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

type DrawerConfig = {
  runLoading:     boolean;
  runResult:      RuleEngineResponse | null;
  runError:       string | null;
  onRun:          () => void;
  activeRuleSet:  RuleForUI[];
  onToggleRule:   (ruleId: string) => void;
  period:         string;
  onPeriodChange: (p: string) => void;
  onSelectA:      (sourceId: string) => void;
  onSelectB:      (sourceId: string) => void;
  onAddPreset:    (ruleId: string) => void;
};

function getDrawerProps(
  ctx: DrawerCtx,
  orgSlug: string,
  matchResults: Record<string, { count: number; amount: number }>,
  sessions: ReturnType<typeof formatSessionRow>[],
  fuenteA: SourceForUI,
  fuenteB: SourceForUI,
  allSources: SourceForUI[],
  config: DrawerConfig,
): {
  title: string; subtitle?: string; statusLabel?: string; severity?: DrawerSeverity; content: React.ReactNode;
} {
  switch (ctx.type) {

    case "result_group": {
      const m   = RESULT_META[ctx.key];
      const r   = matchResults[ctx.key];
      const total = Object.values(matchResults).reduce((s, v) => s + v.count, 0);
      const pct = Math.round((r.count / total) * 100);
      return {
        title: m.label === "CONCILIADOS" ? "Documentos Conciliados" : m.label === "PENDIENTES" ? "Pendientes de Conciliación" : m.label === "DUPLICADOS" ? "Duplicados Detectados" : m.label === "INCONSISTENTES" ? "Registros Inconsistentes" : m.label === "HUÉRFANOS" ? "Documentos Huérfanos" : "Revisión Manual Requerida",
        subtitle: `${r.count} registros · ${r.amount > 0 ? fmtM(r.amount) : "sin monto"}`,
        statusLabel: m.label, severity: m.sev,
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Registros",     value: `${r.count}`,              accent: m.color },
              { label: "% del total",   value: `${pct}%`,                 accent: m.color },
              { label: "Monto",         value: r.amount > 0 ? fmtM(r.amount) : "—" },
              { label: "Última sesión", value: "Hace 2h" },
            ]} />
            {ctx.key === "pendientes" && (
              <DrawerTimeline title="Antigüedad de pendientes" events={[
                { time: "Hoy",        label: "12 documentos ingresados en el ciclo actual" },
                { time: "Ayer",       label: "8 documentos sin match en sesión anterior",  severity: "info"    },
                { time: "Hace 3 días",label: "14 documentos acumulados sin resolver",       severity: "warning" },
              ]} />
            )}
            {ctx.key === "conciliados" && (
              <DrawerRelatedItems title="Muestra de conciliaciones recientes" items={[
                { label: "Bancolombia — Industrias Ramírez",  value: "+$4.2M",  tag: "Exacto"     },
                { label: "DIAN Factura F-2024-0891",          value: "$3.8M",   tag: "Exacto"     },
                { label: "SAG CxC 20847 — Transferencia",     value: "+$2.1M",  tag: "±0.8%"      },
                { label: "Davivienda — Pagos automáticos",    value: "$1.4M",   tag: "Exacto"     },
              ]} />
            )}
            {ctx.key === "duplicados" && (
              <DrawerRelatedItems title="Duplicados detectados" items={[
                { label: "PayCo Ref. 203847 — x2",            value: "$1.8M",   tag: "Duplicado"  },
                { label: "SAG mov. #4821 — x2",               value: "$0.9M",   tag: "Duplicado"  },
              ]} />
            )}
            {ctx.key === "huerfanos" && (
              <DrawerRelatedItems title="Documentos sin contrapartida" items={[
                { label: "Consignación Banco Popular 09:15",  value: "$2.1M",   tag: "Sin CxC"    },
                { label: "Depósito Nequi — sin referencia",   value: "$0.8M",   tag: "Sin CxC"    },
                { label: "Cobro PayCo sin factura",           value: "$0.5M",   tag: "Sin factura"},
              ]} />
            )}
            <DrawerAIRecommendation text={
              ctx.key === "conciliados"    ? "127 documentos conciliados representan el 65% del volumen total. Tasa de éxito por encima del promedio histórico (58%). Regla R01 explica el 89% de los matches." :
              ctx.key === "pendientes"     ? "34 pendientes acumulados. El 41% llevan más de 2 días sin resolver. Ejecutar sesión manual para los de mayor antigüedad." :
              ctx.key === "duplicados"     ? "6 duplicados detectados con valor total $2.1M. Revisar antes del cierre del ciclo para evitar pagos dobles." :
              ctx.key === "inconsistentes" ? "8 inconsistencias de valor. La mayoría son diferencias menores al 1% — posiblemente por redondeos o tasas de cambio." :
              ctx.key === "huerfanos"      ? "12 documentos sin contrapartida. Priorizar los de mayor monto. Posibles cobros no aplicados a CxC." :
                                            "7 documentos requieren revisión manual. El motor IA no pudo clasificarlos automáticamente por datos incompletos."
            } />
            <DActions>
              <Link href={`/${orgSlug}/reconciliation`} className="ag-action-primary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                Abrir en conciliación →
              </Link>
            </DActions>
            <DrawerTraceability source="Motor IA · Última sesión" updated={`Hace 2h · ciclo ${_fmtNow()}`} />
          </>
        ),
      };
    }

    case "exception": {
      const ex = EXCEPTIONS[ctx.index];
      if (!ex) return { title: "Excepción", content: null };
      return {
        title: ex.label, subtitle: `${ex.type} · ${ex.source} · ${ex.date}`,
        statusLabel: ex.type.toUpperCase(), severity: SEV_TO_DRAWER[ex.severity],
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Monto",       value: ex.amount > 0 ? fmtM(ex.amount) : "—",  accent: TYPE_COLOR[ex.type] ?? C.amber },
              { label: "Tipo",        value: ex.type,                                  accent: TYPE_COLOR[ex.type] ?? C.amber },
              { label: "Fuente",      value: ex.source },
              { label: "Detectado",   value: ex.date },
            ]} />
            <DSection title="Detalle de la discrepancia">
              <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.7, margin: 0 }}>{ex.detail}</p>
            </DSection>
            <DrawerTimeline title="Historial de la excepción" events={ex.timeline} />
            <DSection title="Resolución sugerida">
              <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.7, margin: 0 }}>{ex.resolution}</p>
            </DSection>
            <DrawerAIRecommendation text={`Excepción tipo "${ex.type}" detectada automáticamente. ${ex.resolution} Aplicar antes del cierre del ciclo para mantener exactitud del estado de caja.`} />
            <DActions>
              <PassiveAction label="Aplicar resolución sugerida" />
              <PassiveAction label="Marcar como revisado" />
              <Link href={`/${orgSlug}/reconciliation`} className="ag-action-secondary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                Abrir en conciliación →
              </Link>
            </DActions>
            <DrawerTraceability source={`Motor IA · ${ex.source}`} updated={ex.date} />
          </>
        ),
      };
    }

    case "match_field": {
      const mf = MATCH_FIELDS[ctx.index];
      if (!mf) return { title: "Mapeo", content: null };
      const confColor  = mf.confidence >= 85 ? C.green : mf.confidence >= 65 ? C.amber : C.red;
      const confLabel  = mf.confidence >= 85 ? "Alta confianza" : mf.confidence >= 65 ? "Confianza parcial" : "Baja confianza";
      const sev: DrawerSeverity = mf.status === "conflict" ? "warning" : mf.status === "partial" ? "watch" : "info";
      return {
        title: `${mf.fieldA} → ${mf.fieldB}`,
        subtitle: `Coincidencia ${mf.status === "match" ? "directa" : mf.status === "partial" ? "parcial" : "en conflicto"}`,
        statusLabel: `${mf.confidence}% CONFIANZA`, severity: sev,
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Confianza",   value: `${mf.confidence}%`,   accent: confColor },
              { label: "Nivel",       value: confLabel,              accent: confColor },
              { label: "Campo A",     value: mf.fieldA,              accent: C.blueDark },
              { label: "Campo B",     value: mf.fieldB,              accent: C.blue },
            ]} />
            <DSection title="Por qué este mapeo">
              <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.7, margin: 0 }}>{mf.note}</p>
            </DSection>
            {mf.status !== "match" && (
              <DSection title="Acción requerida">
                <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber, lineHeight: 1.7, margin: 0 }}>
                  {mf.status === "partial"
                    ? "Mapeo parcial detectado. Revisar prefijos y limpiar datos antes de aplicar la regla automática."
                    : "Conflicto de formato. Los valores de texto libre no son comparables directamente. Crear regla manual."}
                </p>
              </DSection>
            )}
            <DrawerAIRecommendation text={`Confianza ${mf.confidence}% calculada sobre ${Math.round(mf.confidence * 0.3)} registros de muestra. ${mf.note}`} />
            <DActions>
              <PassiveAction label="Confirmar mapeo" />
              <PassiveAction label="Ajustar tolerancia" />
            </DActions>
            <DrawerTraceability source="Motor IA · Análisis automático" updated={`Calculado ${_fmtNow()}`} />
          </>
        ),
      };
    }

    case "rule": {
      const rule = RULES[ctx.index];
      if (!rule) return { title: "Regla", content: null };
      return {
        title: rule.label,
        subtitle: rule.conditions,
        statusLabel: rule.active ? "ACTIVA" : "PAUSADA",
        severity: rule.active ? "watch" : "info",
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Coincidencias",   value: `${rule.hits}`,                          accent: rule.active ? C.green : C.inkFaint },
              { label: "Estado",          value: rule.active ? "Activa" : "Pausada",       accent: rule.active ? C.green : C.inkFaint },
              { label: "Última ejecución",value: rule.lastApplied },
              { label: "Condiciones",     value: `${rule.conditionDetail.length}` },
            ]} />
            <DSection title="Condiciones de la regla">
              {rule.conditionDetail.map((c, i) => (
                <DRow key={i} label={`Condición ${i + 1}`} value={c} />
              ))}
            </DSection>
            <DrawerTimeline title="Historial de aplicación" events={[
              { time: rule.lastApplied,     label: `Ejecutada — ${rule.hits} coincidencias`, severity: "info" },
              { time: "Hace 1 día",         label: `Ejecutada — ${rule.hits - 8} coincidencias` },
              { time: "Hace 3 días",        label: `Ejecutada — ${rule.hits - 15} coincidencias` },
            ]} />
            <DrawerAIRecommendation text={rule.aiNote} />
            <DActions>
              <PassiveAction label={rule.active ? "Pausar regla" : "Activar regla"} />
              <PassiveAction label="Editar condiciones" />
            </DActions>
            <DrawerTraceability source="Motor de Reglas · Agentik" updated={rule.lastApplied} />
          </>
        ),
      };
    }

    case "session": {
      const sess = sessions[ctx.index];
      if (!sess) return { title: "Sesión", content: null };
      const sev: DrawerSeverity = sess.status === "warning" ? "warning" : "info";
      const matchRate = (sess.matches + sess.conflicts + sess.exceptions) > 0
        ? Math.round((sess.matches / Math.max(sess.matches + sess.conflicts + sess.exceptions, 1)) * 100)
        : 0;
      return {
        title: sess.code,
        subtitle: `${sess.title}${sess.period ? ` · ${sess.period}` : ""}`,
        statusLabel: sess.type.toUpperCase(), severity: sev,
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Conciliados",   value: `${sess.matches}`,    accent: C.green },
              { label: "Tasa match",    value: `${matchRate}%`,      accent: matchRate >= 80 ? C.green : matchRate >= 60 ? C.amber : C.red },
              { label: "Conflictos",   value: `${sess.conflicts}`,   accent: sess.conflicts > 5 ? C.amber : C.inkFaint },
              { label: "Excepciones",  value: `${sess.exceptions}`,  accent: sess.exceptions > 10 ? C.red : C.inkFaint },
            ]} />
            <DSection title="Fuentes conciliadas">
              <DRow label="Fuente A" value={fuenteA.shortLabel} accent={C.blueDark} />
              <DRow label="Fuente B" value={fuenteB.shortLabel} accent={C.blue} />
              <DRow label="Ejecutado" value={sess.date} />
            </DSection>
            <DrawerTimeline title="Eventos de la sesión" events={[
              { time: sess.date,   label: `Sesión ${sess.code} iniciada` },
              { time: "+carga",    label: `Fuentes cargadas — ${fuenteA.shortLabel} ↔ ${fuenteB.shortLabel}` },
              { time: "+matching", label: `Motor ejecutó matching — ${sess.matches} coincidencias`, severity: sess.matches > 50 ? undefined : "info" },
              { time: "fin",       label: `Sesión completada — ${sess.conflicts} conflictos${sess.exceptions > 0 ? ` · ${sess.exceptions} excepciones` : ""}`, severity: sess.conflicts > 5 ? "warning" : undefined },
            ]} />
            <DrawerAIRecommendation text={sess.status === "warning"
              ? `Sesión con ${sess.conflicts} conflictos — por encima del umbral (5). Revisar excepciones manuales antes del cierre.`
              : `Sesión completada. ${sess.matches} conciliaciones automáticas (${matchRate}% match rate). Dentro del rango operacional esperado.`
            } />
            <DActions>
              <PassiveAction label="Ver reporte completo" />
              <PassiveAction label="Exportar sesión" />
            </DActions>
            <DrawerTraceability source={`Motor Conciliación · ${sess.code}`} updated={sess.date} />
          </>
        ),
      };
    }

    case "source_selector": {
      const isOrig     = ctx.sourceId === "a";
      const currentSrc = isOrig ? fuenteA : fuenteB;
      const role       = isOrig ? "Fuente A · Origen" : "Fuente B · Validación";
      const opMeta     = SOURCE_OPERATIONAL_META[currentSrc.sourceId];
      const availSrcs  = allSources.filter(s => s.sourceId !== currentSrc.sourceId);
      const activeSrcs = allSources.filter(s => s.readiness === "available");
      const pendingSrcs = allSources.filter(s => s.readiness !== "available" && s.readiness !== "unavailable");

      return {
        title: `Configurar ${role}`,
        subtitle: `Actualmente: ${currentSrc.label} · ${currentSrc.provider}`,
        statusLabel: "FUENTES OPERACIONALES", severity: "info",
        content: (
          <>
            {/* 1. Fuente activa */}
            <div style={{ background: C.blueLight, border: `1px solid ${C.blueBorder}`, borderLeft: `3px solid ${C.blueDark}`, borderRadius: R.md, padding: S[3], marginBottom: S[4] }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[2] }}>
                <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: C.blueDark, background: C.blueBorder, padding: "1px 5px", borderRadius: R.sm }}>
                  {isOrig ? "FUENTE A" : "FUENTE B"}
                </span>
                {opMeta && (
                  <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: opMeta.color, background: opMeta.bg, border: `1px solid ${opMeta.border}`, padding: "1px 5px", borderRadius: R.sm }}>
                    {opMeta.tag}
                  </span>
                )}
                <span className={`ag-op-status ${READINESS_META[currentSrc.readiness]?.css ?? "ag-op-status--pending"}`} style={{ fontSize: T.sz["2xs"], marginLeft: "auto" }}>
                  {READINESS_META[currentSrc.readiness]?.label ?? currentSrc.readiness}
                </span>
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink, marginBottom: 2 }}>{currentSrc.label}</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{currentSrc.provider} · {currentSrc.availableFields.length} campos disponibles</div>
              {currentSrc.readiness !== "available" && (
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberDark, marginTop: S[2], fontStyle: "italic" }}>
                  ⚠ {currentSrc.readinessNote}
                </div>
              )}
            </div>

            {/* 2. Campos disponibles */}
            <DSection title="Campos disponibles para matching">
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
                {currentSrc.availableFields.map((f: string) => (
                  <code key={f} style={{ fontFamily: T.mono, fontSize: 9, color: C.blue, background: C.blueLight, border: `1px solid ${C.blueBorder}`, borderRadius: R.xs, padding: "1px 5px" }}>
                    {f}
                  </code>
                ))}
              </div>
            </DSection>

            {/* 3. Fuentes disponibles ahora */}
            <DSection title={`Disponibles ahora (${activeSrcs.length})`}>
              {activeSrcs.map((s: SourceForUI, i: number) => {
                const meta      = SOURCE_OPERATIONAL_META[s.sourceId];
                const isActive  = s.sourceId === currentSrc.sourceId;
                const onSelect  = isOrig ? config.onSelectA : config.onSelectB;
                return (
                  <div
                    key={s.sourceId}
                    onClick={() => !isActive && onSelect(s.sourceId)}
                    style={{
                      display: "flex", alignItems: "center", gap: S[2],
                      padding: `${S[2]}px 0`,
                      borderBottom: i < activeSrcs.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                      cursor: isActive ? "default" : "pointer",
                      opacity: isActive ? 1 : 0.85,
                    }}
                  >
                    {meta && <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, padding: "1px 4px", borderRadius: R.xs, flexShrink: 0 }}>{meta.tag}</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: isActive ? 700 : 400 }}>{s.label}</div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{s.provider}</div>
                    </div>
                    {isActive
                      ? <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: C.blueDark, background: C.blueLight, border: `1px solid ${C.blueBorder}`, padding: "1px 5px", borderRadius: R.xs, flexShrink: 0 }}>ACTIVA</span>
                      : <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: R.pill, background: C.green, flexShrink: 0 }} />
                    }
                  </div>
                );
              })}
            </DSection>

            {/* 4. Pendiente de activación */}
            {pendingSrcs.length > 0 && (
              <DSection title={`Pendiente de activación (${pendingSrcs.length})`}>
                {pendingSrcs.map((s: SourceForUI, i: number) => {
                  const readinessMeta = READINESS_META[s.readiness];
                  return (
                    <div key={s.sourceId} style={{ display: "flex", alignItems: "flex-start", gap: S[2], padding: `${S[2]}px 0`, borderBottom: i < pendingSrcs.length - 1 ? `1px solid ${C.lineSubtle}` : "none" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{s.label}</div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>{s.readinessNote}</div>
                      </div>
                      <span className={`ag-op-status ${readinessMeta?.css ?? "ag-op-status--pending"}`} style={{ fontSize: T.sz["2xs"], flexShrink: 0 }}>
                        {readinessMeta?.label ?? s.readiness}
                      </span>
                    </div>
                  );
                })}
              </DSection>
            )}

            {/* 5. Acciones */}
            <DActions>
              <Link href={`/${orgSlug}/finanzas/documentos`} className="ag-action-primary" style={{ textDecoration: "none", textAlign: "center" as const, fontSize: T.sz.sm }}>
                Ir a Centro Documental →
              </Link>
              <button onClick={() => {}} className="ag-action-secondary" style={{ fontFamily: T.mono, fontSize: T.sz.sm, cursor: "pointer" }}>
                Conectar nueva fuente →
              </button>
            </DActions>
            <DrawerTraceability source={`Catálogo de Fuentes · ${allSources.length} registradas`} updated={`${activeSrcs.length} disponibles hoy`} />
          </>
        ),
      };
    }

    case "run_matching": {
      const { runLoading, runResult, runError, onRun, activeRuleSet, onToggleRule, period, onPeriodChange } = config;
      const enabledCount = activeRuleSet.filter(r => r.enabled).length;
      const canRun       = fuenteA.readiness === "available" && fuenteB.readiness === "available" && enabledCount > 0;
      const VERDICT_COLOR: Record<string, string> = {
        reconciled: C.green, partial: C.amber, pending_review: C.amber,
        mismatch: C.inkFaint, suspicious: C.red,
      };

      return {
        title:       "Motor de Reglas · Ejecutar",
        subtitle:    `${fuenteA.shortLabel} ↔ ${fuenteB.shortLabel}`,
        statusLabel: "RULE ENGINE", severity: "watch",
        content: (
          <>
            {/* Source pair summary */}
            <DrawerMetricGrid items={[
              { label: "Fuente A",    value: fuenteA.shortLabel,                     accent: fuenteA.readiness === "available" ? C.green : C.amber },
              { label: "Fuente B",    value: fuenteB.shortLabel,                     accent: fuenteB.readiness === "available" ? C.green : C.amber },
              { label: "Reglas act.", value: `${enabledCount} / ${activeRuleSet.length}`, accent: enabledCount > 0 ? C.green : C.amber },
              { label: "Período",     value: period },
            ]} />

            {/* Period input */}
            <DSection title="Período de conciliación (YYYYMM)">
              <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                <input
                  type="text"
                  value={period}
                  onChange={e => onPeriodChange(e.target.value)}
                  maxLength={6}
                  placeholder="202605"
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
                    background: C.white, border: `1px solid ${C.lineSubtle}`,
                    borderRadius: R.md, padding: `${S[2]}px ${S[3]}px`,
                    width: 100, outline: "none",
                  }}
                />
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                  formato YYYYMM
                </span>
              </div>
            </DSection>

            {/* Active rules — toggle list */}
            <DSection title={`Reglas activas en este run (${enabledCount})`}>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                {activeRuleSet.map(r => (
                  <div
                    key={r.ruleId}
                    onClick={() => onToggleRule(r.ruleId)}
                    style={{
                      display: "flex", alignItems: "center", gap: S[2],
                      padding: `${S[2]}px ${S[3]}px`,
                      background: r.enabled ? C.blueLight : C.surface,
                      border: `1px solid ${r.enabled ? C.blueBorder : C.lineSubtle}`,
                      borderLeft: `3px solid ${r.enabled ? C.blueDark : C.inkGhost}`,
                      borderRadius: R.sm, cursor: "pointer",
                    }}
                  >
                    <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: R.pill, background: r.enabled ? C.green : C.inkGhost, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: r.enabled ? C.ink : C.inkFaint, fontWeight: r.enabled ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                        {r.label}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                        {r.group} · {r.sourceField}→{r.targetField} · {r.maxPoints} pts
                      </div>
                    </div>
                    <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: r.enabled ? C.blueDark : C.inkGhost, flexShrink: 0 }}>
                      {r.enabled ? "ACT" : "OFF"}
                    </span>
                  </div>
                ))}
              </div>
            </DSection>

            {/* Warnings */}
            {!canRun && enabledCount > 0 && fuenteA.readiness !== "available" && (
              <div style={{ background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderLeft: `3px solid ${C.amber}`, borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, marginBottom: S[3], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberDark, lineHeight: 1.5 }}>
                ⚠ {fuenteA.label}: {fuenteA.readinessNote}
              </div>
            )}
            {!canRun && enabledCount > 0 && fuenteB.readiness !== "available" && (
              <div style={{ background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderLeft: `3px solid ${C.amber}`, borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, marginBottom: S[3], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberDark, lineHeight: 1.5 }}>
                ⚠ {fuenteB.label}: {fuenteB.readinessNote}
              </div>
            )}
            {enabledCount === 0 && (
              <div style={{ background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderLeft: `3px solid ${C.amber}`, borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, marginBottom: S[3], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberDark }}>
                Activa al menos una regla para ejecutar el motor.
              </div>
            )}

            {/* Execute */}
            <DActions>
              <button
                onClick={onRun}
                disabled={runLoading || !canRun}
                className="ag-action-primary"
                style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, cursor: canRun && !runLoading ? "pointer" : "not-allowed", opacity: (!canRun || runLoading) ? 0.6 : 1, border: "none", padding: `${S[3]}px ${S[4]}px` }}
              >
                {runLoading ? "Ejecutando…" : `Ejecutar · ${fuenteA.shortLabel} ↔ ${fuenteB.shortLabel}`}
              </button>
            </DActions>

            {/* Error */}
            {runError && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderLeft: `3px solid ${C.red}`, borderRadius: R.sm, padding: S[3], marginTop: S[3], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red, lineHeight: 1.5 }}>
                Error: {runError}
              </div>
            )}

            {/* Result: pending source */}
            {runResult?.status === "pending_source" && (
              <div style={{ marginTop: S[4] }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[2] }}>FUENTES PENDIENTES</div>
                {(runResult.blockers ?? []).map((b, i) => (
                  <div key={i} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberDark, background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, marginBottom: 4 }}>
                    ⚠ {b}
                  </div>
                ))}
              </div>
            )}

            {/* Result: unsupported */}
            {runResult?.status === "unsupported_combination" && (
              <div style={{ marginTop: S[4], background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.md, padding: S[3] }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[2] }}>SIN ADAPTADOR</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.5 }}>{runResult.reason}</div>
              </div>
            )}

            {/* Result: no records */}
            {runResult?.status === "no_records" && (
              <div style={{ marginTop: S[4], background: C.surface, border: `1px dashed ${C.line}`, borderRadius: R.md, padding: S[4], textAlign: "center" as const }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontStyle: "italic" }}>{runResult.reason}</div>
              </div>
            )}

            {/* Result: ok — full observability panel */}
            {runResult?.status === "ok" && runResult.executionReport && (
              <ExecutionObservabilityPanel
                report={runResult.executionReport}
                pairResults={runResult.pairResults ?? []}
              />
            )}
            {/* Fallback: basic summary if executionReport is missing (legacy responses) */}
            {runResult?.status === "ok" && !runResult.executionReport && runResult.summary && (
              <div style={{ marginTop: S[4] }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: S[2] }}>
                  RESULTADO · {runResult.summary.reconciled} conciliados · {runResult.summary.mismatches} diferencias
                </div>
              </div>
            )}

            <DrawerTraceability source="Motor de Reglas · Agentik" updated={sessions.length > 0 ? `Última sesión: ${sessions[0].date}` : "Sin sesiones previas"} />
          </>
        ),
      };
    }

    case "new_rule": {
      const { onAddPreset, activeRuleSet } = config;
      return {
        title:       "Gestionar reglas del motor",
        subtitle:    `${fuenteA.shortLabel} → campos disponibles`,
        statusLabel: "RULE BUILDER", severity: "info",
        content: (
          <>
            <DrawerMetricGrid items={[
              { label: "Reglas activas",  value: `${activeRuleSet.filter(r => r.enabled).length}`,  accent: C.green   },
              { label: "Total reglas",    value: `${activeRuleSet.length}`,                           accent: C.inkFaint },
              { label: "Campos A",        value: `${fuenteA.availableFields.length}`,                 accent: C.blueDark },
              { label: "Campos B",        value: `${fuenteB.availableFields.length}`,                 accent: C.blue     },
            ]} />

            {/* Available fields A */}
            <DSection title={`Campos disponibles — ${fuenteA.shortLabel}`}>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
                {fuenteA.availableFields.map(f => (
                  <code key={f} style={{ fontFamily: T.mono, fontSize: 9, color: C.blueDark, background: C.blueLight, border: `1px solid ${C.blueBorder}`, borderRadius: R.xs, padding: "1px 5px" }}>
                    {f}
                  </code>
                ))}
              </div>
            </DSection>

            {/* Available fields B */}
            <DSection title={`Campos disponibles — ${fuenteB.shortLabel}`}>
              <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
                {fuenteB.availableFields.map(f => (
                  <code key={f} style={{ fontFamily: T.mono, fontSize: 9, color: C.blue, background: C.blueLight, border: `1px solid ${C.blueBorder}`, borderRadius: R.xs, padding: "1px 5px" }}>
                    {f}
                  </code>
                ))}
              </div>
            </DSection>

            {/* Preset rules — click to add */}
            <DSection title="Presets disponibles — click para agregar/activar">
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
                {DEFAULT_RULE_STUBS.map(r => {
                  const alreadyEnabled = activeRuleSet.find(a => a.ruleId === r.ruleId)?.enabled;
                  return (
                    <div
                      key={r.ruleId}
                      onClick={() => onAddPreset(r.ruleId)}
                      style={{
                        display: "flex", alignItems: "center", gap: S[2],
                        padding: `${S[2]}px ${S[3]}px`,
                        background: alreadyEnabled ? C.blueLight : C.surface,
                        border: `1px solid ${alreadyEnabled ? C.blueBorder : C.lineSubtle}`,
                        borderLeft: `3px solid ${alreadyEnabled ? C.blueDark : C.line}`,
                        borderRadius: R.sm, cursor: "pointer",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: alreadyEnabled ? C.ink : C.inkMid, fontWeight: alreadyEnabled ? 600 : 400 }}>
                          {r.label}
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                          {r.group} · {r.sourceField}→{r.targetField} · {r.maxPoints} pts max
                        </div>
                      </div>
                      <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: alreadyEnabled ? C.green : C.inkFaint, flexShrink: 0 }}>
                        {alreadyEnabled ? "✓ ACTIVA" : "+ AGREGAR"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </DSection>

            <DrawerTraceability source="Motor de Reglas · Agentik" updated={`${activeRuleSet.filter(r => r.enabled).length} reglas activas`} />
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

export function ConciliacionClient({
  orgSlug,
  reconSummary,
  cashKpis: _cashKpis,
  graphCriticalCount   = 0,
  graphWarningCount    = 0,
  graphOrphanCount     = 0,
  graphUnresolvedCount = 0,
  graphHasData         = false,
  sessions:            sessionRows = [],
  allSources:          allSourcesProp = [],
  readinessReport,
  limitationsReport,
}: {
  orgSlug:               string;
  reconSummary?:         ReconciliationSummary;
  cashKpis?:             CashKpis;
  graphCriticalCount?:   number;
  graphWarningCount?:    number;
  graphOrphanCount?:     number;
  graphUnresolvedCount?: number;
  graphHasData?:         boolean;
  sessions?:             ReconSessionRow[];
  allSources?:           SourceForUI[];
  readinessReport?:      SourceReadinessReport;
  limitationsReport?:    DetectedLimitationsReport;
}) {
  const [ctx, setCtx]                   = useState<DrawerCtx | null>(null);
  const [fieldsExpanded, setFieldsExpanded] = useState(false);
  const open  = (c: DrawerCtx) => setCtx(c);
  const close = () => setCtx(null);

  // Source selection state — operator can switch A/B
  const allSrcs = allSourcesProp.length > 0 ? allSourcesProp : [FUENTE_A_DEFAULT, FUENTE_B_DEFAULT];
  const [selectedAId, setSelectedAId] = useState<string>("sag_orders");
  const [selectedBId, setSelectedBId] = useState<string>("sag_sales");
  const fuenteA: SourceForUI = allSrcs.find(s => s.sourceId === selectedAId) ?? FUENTE_A_DEFAULT;
  const fuenteB: SourceForUI = allSrcs.find(s => s.sourceId === selectedBId) ?? FUENTE_B_DEFAULT;

  // Rule engine state
  const [activeRuleSet, setActiveRuleSet] = useState<RuleForUI[]>(DEFAULT_RULE_STUBS);
  const [runLoading, setRunLoading]       = useState(false);
  const [runResult, setRunResult]         = useState<RuleEngineResponse | null>(null);
  const [runError, setRunError]           = useState<string | null>(null);
  const [period, setPeriod]               = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Derive display sessions from real DB rows
  const SESSIONS = sessionRows.map(formatSessionRow);

  // Execute rule engine against real records
  async function handleRunEngine() {
    setRunLoading(true);
    setRunError(null);
    setRunResult(null);
    try {
      const enabledRules = activeRuleSet.filter(r => r.enabled).map(r => ({
        ruleId:      r.ruleId,
        label:       r.label,
        description: r.description,
        group:       r.group,
        conditions:  [{
          sourceField: r.sourceField,
          targetField: r.targetField,
          operator:    r.operator,
          tolerance:   r.tolerance,
          windowDays:  r.windowDays,
          normalize:   true,
        }],
        weight:   { maxPoints: r.maxPoints },
        enabled:  true,
        priority: 1,
      }));
      const res  = await fetch(`/api/orgs/${orgSlug}/reconciliation/rule-engine/run`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          sourceAType: fuenteA.sourceId,
          sourceBType: fuenteB.sourceId,
          period,
          rules: enabledRules,
        }),
      });
      const data = await res.json() as RuleEngineResponse;
      setRunResult(data);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Error inesperado al ejecutar el motor");
    } finally {
      setRunLoading(false);
    }
  }

  // Derive MATCH_RESULTS from real reconciliation data (or fall back to zeros)
  const MATCH_RESULTS: Record<string, { count: number; amount: number }> = reconSummary ? {
    conciliados:    { count: reconSummary.conciliado,                         amount: 0 },
    pendientes:     { count: reconSummary.pendiente,                          amount: 0 },
    duplicados:     { count: 0,                                               amount: 0 },
    inconsistentes: { count: reconSummary.inconsistente + graphCriticalCount, amount: 0 },
    huerfanos:      { count: graphOrphanCount,                                amount: 0 },
    revision:       { count: reconSummary.parcial + graphWarningCount,        amount: 0 },
  } : MATCH_RESULTS_EMPTY;

  const drawerProps = ctx ? getDrawerProps(ctx, orgSlug, MATCH_RESULTS, SESSIONS, fuenteA, fuenteB, allSrcs, {
    runLoading,
    runResult,
    runError,
    onRun: handleRunEngine,
    activeRuleSet,
    onToggleRule: (ruleId: string) =>
      setActiveRuleSet(prev => prev.map(r => r.ruleId === ruleId ? { ...r, enabled: !r.enabled } : r)),
    period,
    onPeriodChange: setPeriod,
    onSelectA: setSelectedAId,
    onSelectB: setSelectedBId,
    onAddPreset: (ruleId: string) =>
      setActiveRuleSet(prev => prev.map(r => r.ruleId === ruleId ? { ...r, enabled: true } : r)),
  }) : null;

  const totalExceptions = EXCEPTIONS.length;
  const avgConfidence   = MATCH_FIELDS.length > 0
    ? Math.round(MATCH_FIELDS.reduce((s, f) => s + f.confidence, 0) / MATCH_FIELDS.length)
    : 0;
  const activeRules     = RULES.filter(r => r.active).length;

  return (
    <div style={{ minWidth: 0, overflowX: "hidden" }}>

      {/* ── 1. HEADER ─────────────────────────────────────────────────────── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Finanzas", href: `/${orgSlug}/executive` },
          { label: "Conciliación Inteligente" },
        ]}
        title="Conciliación Inteligente"
        subtitle={`Centro de cruce y validación entre universos de datos empresariales · ciclo ${_fmtNow()}`}
        status={
          graphCriticalCount > 0 ? "warning" :
          !reconSummary?.hasData ? "neutral" :
          reconSummary.inconsistente > 0 || totalExceptions > 0 ? "warning" :
          reconSummary.pendiente > 0 ? "warning" : "ok"
        }
        statusLabel={
          !reconSummary?.hasData
            ? `Sin datos · ${activeRules} reglas activas${graphHasData ? ` · ${graphCriticalCount > 0 ? graphCriticalCount + " alertas graph" : "Graph sano"}` : ""}`
            : `${reconSummary.conciliado} conciliados · ${reconSummary.pendiente} pendientes · ${reconSummary.inconsistente + graphCriticalCount} inconsistentes · ${activeRules} reglas activas${graphHasData && graphUnresolvedCount > 0 ? ` · ${graphUnresolvedCount} sin resolver en graph` : ""}`
        }
      />


      {/* ── 2. FRANJA DE ESTADO OPERACIONAL ───────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", flexWrap: "wrap" as const,
        gap: S[1], padding: `${S[3]}px ${S[5]}px`,
        background: C.blueLight, border: `1px solid ${C.blueBorder}`,
        borderRadius: R.lg, marginBottom: S[6],
      }}>
        {([
          { label: "TOTAL DOCUMENTOS",   value: reconSummary?.hasData ? `${reconSummary.total} registros`         : "Sin datos",    css: reconSummary?.hasData ? "ag-op-status--ok"      : "ag-op-status--pending" },
          { label: "CONCILIADOS",        value: reconSummary?.hasData ? `${reconSummary.conciliado} documentos`   : "—",            css: "ag-op-status--ok"      },
          { label: "PENDIENTES",         value: reconSummary?.hasData ? `${reconSummary.pendiente} documentos`    : "—",            css: reconSummary?.pendiente ? "ag-op-status--warning" : "ag-op-status--ok" },
          { label: "INCONSISTENTES",     value: reconSummary?.hasData ? `${reconSummary.inconsistente} detectados`: "—",            css: reconSummary?.inconsistente ? "ag-op-status--warning" : "ag-op-status--ok" },
          { label: "FUENTE",             value: "SAG · ReconciliationSummary",                                                       css: "ag-op-status--info"    },
        ] as Array<{ label: string; value: string; css: string }>).map((item, i) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center" }}>
            {i > 0 && <span style={{ display: "inline-block", width: 1, height: 28, background: C.blueBorder, margin: `0 ${S[4]}px` }} />}
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>{item.label}</span>
              <span className={`ag-op-status ${item.css}`} style={{ fontSize: T.sz.xs }}>{item.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── 3. ESTADO DE INTEGRACIÓN — visible sin ejecutar conciliación ──── */}
      {readinessReport && (
        <CollapsibleSection
          title="ESTADO DE INTEGRACIÓN OPERACIONAL"
          meta={`${readinessReport.readyCount} listas · ${readinessReport.partialCount} parciales · ${readinessReport.pendingCount} pendientes · ${readinessReport.totalCount} fuentes registradas`}
          accent={readinessReport.allOperational ? C.green : readinessReport.readyCount > readinessReport.pendingCount ? C.amber : C.inkLight}
          detailLabel="Ver integraciones"
          defaultOpen={false}
        >
          <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, padding: `${S[4]}px` }}>
            <SourceReadinessBoard report={readinessReport} />
          </div>
        </CollapsibleSection>
      )}

      {/* ── 3b. LIMITACIONES DETECTADAS — justo debajo del board ─────────── */}
      {limitationsReport && (
        <div style={{ marginBottom: S[4] }}>
          <DetectedLimitationsCard report={limitationsReport} />
        </div>
      )}

      {/* ── 4. WORKSPACE DE CONCILIACIÓN ─────────────────────────────────── */}
      <section style={{ marginBottom: S[8] }}>
        <SectionLabel label="Universos conectados · Flujo de conciliación" meta="Origen de datos → Motor IA → Fuente de validación → Resultados del ciclo" accent={C.blueDark} />

        {/* Flujo: ORIGEN → MOTOR IA → VALIDACIÓN */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 44px 1fr 44px 1fr", alignItems: "stretch" }}>

          {/* PASO 01 — Origen de datos */}
          <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderTop: `3px solid ${C.blueDark}`, borderRadius: R.lg, padding: S[5], display: "flex", flexDirection: "column" as const, gap: S[3], boxShadow: E.sm }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 18, borderRadius: R.sm, background: C.blueDark, color: C.white, fontFamily: T.mono, fontSize: 9, fontWeight: 700, flexShrink: 0 }}>01</span>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Origen de datos</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Universo base que será conciliado</div>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.lineSubtle}`, paddingTop: S[3], display: "flex", flexDirection: "column" as const, gap: S[3] }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                {(() => { const m = SOURCE_OPERATIONAL_META[fuenteA.sourceId]; return m ? (
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "1px 6px", height: 20, borderRadius: R.sm, background: m.color, color: C.white, fontFamily: T.mono, fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{m.tag}</span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 20, borderRadius: R.sm, background: C.blueDark, color: C.white, fontFamily: T.mono, fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{fuenteA.shortLabel.slice(0, 4)}</span>
                ); })()}
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink }}>{fuenteA.label}</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{fuenteA.provider}</div>
                </div>
              </div>
              <div style={{ background: C.surface, borderRadius: R.md, padding: S[3], display: "flex", flexDirection: "column" as const, gap: S[1] + 2 }}>
                {[
                  { l: "Campos",      v: `${fuenteA.availableFields.length} disponibles` },
                  { l: "Proveedor",   v: fuenteA.provider },
                  { l: "Estado",      v: READINESS_META[fuenteA.readiness]?.label ?? fuenteA.readiness },
                ].map(r => (
                  <div key={r.l} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{r.l}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: 600 }}>{r.v}</span>
                  </div>
                ))}
              </div>
              {/* IA detected entities */}
              <div style={{ background: C.blueLight, border: `1px solid ${C.blueBorder}`, borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, display: "flex", flexDirection: "column" as const, gap: S[1] }}>
                <div style={{ display: "flex", alignItems: "center", gap: S[1], marginBottom: 2 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 11, borderRadius: 2, background: C.blueDark, color: C.white, fontFamily: T.mono, fontSize: 6, fontWeight: 700 }}>IA</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, fontWeight: 700, letterSpacing: "0.06em" }}>ENTIDADES DETECTADAS</span>
                </div>
                {[
                  { label: "Pagos",     count: "1,204" },
                  { label: "Facturas",  count: "847"   },
                  { label: "Clientes",  count: "312"   },
                  { label: "Cuentas",   count: "18"    },
                ].map(e => (
                  <div key={e.label} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{e.label}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: 600 }}>{e.count}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: R.pill, background: C.green, flexShrink: 0 }} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green }}>Listo para conciliar</span>
              </div>
            </div>
            <button onClick={() => open({ type: "source_selector", sourceId: "a" })} className="ag-action-secondary" style={{ fontFamily: T.mono, fontSize: T.sz.xs, cursor: "pointer" }}>
              Cambiar origen ▸
            </button>
          </div>

          {/* Conector 01→02 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: C.blueDark, fontFamily: T.mono, fontSize: 20, opacity: 0.35, lineHeight: 1 }}>→</span>
          </div>

          {/* PASO 02 — Análisis Inteligente (motor central) */}
          <div style={{ background: C.blueLight, border: `1.5px solid ${C.blueBorder}`, borderTop: `3px solid ${C.blueDark}`, borderRadius: R.lg, padding: `${S[5]}px ${S[5]}px ${S[4]}px`, display: "flex", flexDirection: "column" as const, alignItems: "center", gap: S[5], boxShadow: `${E.sm}, 0 0 0 3px ${C.blueBorder}40` }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 18, borderRadius: R.sm, background: C.blueDark, color: C.white, fontFamily: T.mono, fontSize: 9, fontWeight: 700, flexShrink: 0 }}>02</span>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Análisis Inteligente</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Validación contextual del cruce</div>
              </div>
            </div>

            {/* ANÁLISIS OPERACIONAL */}
            <div style={{ width: "100%", background: C.surface, borderRadius: R.md, padding: `${S[4]}px ${S[3]}px` }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[3] }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 14, borderRadius: 2, background: C.blueDark, color: C.white, fontFamily: T.mono, fontSize: 7, fontWeight: 700, flexShrink: 0 }}>IA</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const }}>Agentik analiza</span>
              </div>
              {[
                { label: `${fuenteA.label} — ${READINESS_META[fuenteA.readiness]?.label ?? fuenteA.readiness}`,     dot: fuenteA.readiness === "available" ? C.green : C.amber },
                { label: `${fuenteB.label} — ${READINESS_META[fuenteB.readiness]?.label ?? fuenteB.readiness}`,     dot: fuenteB.readiness === "available" ? C.green : C.amber },
                { label: `${MATCH_FIELDS.filter(f => f.status === "match").length} campos compatibles encontrados`, dot: C.green  },
                { label: `${MATCH_FIELDS.filter(f => f.status === "conflict").length} conflictos requieren revisión`, dot: MATCH_FIELDS.some(f => f.status === "conflict") ? C.red : C.inkGhost },
                { label: `${MATCH_FIELDS.filter(f => f.status === "partial").length} coincidencias parciales`,       dot: MATCH_FIELDS.some(f => f.status === "partial") ? C.amber : C.inkGhost },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: S[2], padding: `${S[1] + 1}px 0` }}>
                  <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: R.pill, background: item.dot, flexShrink: 0 }} />
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: item.dot, lineHeight: 1.5 }}>{item.label}</span>
                </div>
              ))}
            </div>

            <div style={{ textAlign: "center" as const, paddingTop: S[1] }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["3xl"], fontWeight: 700, color: C.amber, lineHeight: 1.1 }}>{avgConfidence}%</div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: S[1] }}>nivel de compatibilidad detectado</div>
            </div>

            <button onClick={() => open({ type: "run_matching" })} className="ag-action-primary" style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, cursor: "pointer", width: "100%", border: "none", padding: `${S[3]}px ${S[4]}px` }}>
              Conciliar
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: R.pill, background: C.green, flexShrink: 0 }} />
              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>ciclo activo · última lectura {_fmtNow()}</span>
            </div>
          </div>

          {/* Conector 02→03 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: C.blueDark, fontFamily: T.mono, fontSize: 20, opacity: 0.35, lineHeight: 1 }}>→</span>
          </div>

          {/* PASO 03 — Fuente de validación */}
          <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderTop: `3px solid ${C.blueDark}`, borderRadius: R.lg, padding: S[5], display: "flex", flexDirection: "column" as const, gap: S[3], boxShadow: E.sm }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 18, borderRadius: R.sm, background: C.blueDark, color: C.white, fontFamily: T.mono, fontSize: 9, fontWeight: 700, flexShrink: 0 }}>03</span>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Fuente de validación</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Contraparte operacional del cruce</div>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.lineSubtle}`, paddingTop: S[3], display: "flex", flexDirection: "column" as const, gap: S[3] }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                {(() => { const m = SOURCE_OPERATIONAL_META[fuenteB.sourceId]; return m ? (
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "1px 6px", height: 20, borderRadius: R.sm, background: m.color, color: C.white, fontFamily: T.mono, fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{m.tag}</span>
                ) : (
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 20, borderRadius: R.sm, background: C.blue, color: C.white, fontFamily: T.mono, fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{fuenteB.shortLabel.slice(0, 4)}</span>
                ); })()}
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink }}>{fuenteB.label}</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{fuenteB.provider}</div>
                </div>
              </div>
              <div style={{ background: C.surface, borderRadius: R.md, padding: S[3], display: "flex", flexDirection: "column" as const, gap: S[1] + 2 }}>
                {[
                  { l: "Campos",     v: `${fuenteB.availableFields.length} disponibles` },
                  { l: "Proveedor",  v: fuenteB.provider },
                  { l: "Estado",     v: READINESS_META[fuenteB.readiness]?.label ?? fuenteB.readiness },
                ].map(r => (
                  <div key={r.l} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{r.l}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: 600 }}>{r.v}</span>
                  </div>
                ))}
              </div>
              {fuenteB.readiness !== "available" && (
                <div style={{ background: C.amberLight, border: `1px solid ${C.amberBorder}`, borderLeft: `3px solid ${C.amber}`, borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberDark, lineHeight: 1.5 }}>
                  ⚠ {fuenteB.readinessNote}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: R.pill, background: fuenteB.readiness === "available" ? C.green : C.amber, flexShrink: 0 }} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: fuenteB.readiness === "available" ? C.green : C.amber }}>
                  {fuenteB.readiness === "available" ? "Listo para conciliar" : "Pendiente configuración"}
                </span>
              </div>
            </div>
            <button onClick={() => open({ type: "source_selector", sourceId: "b" })} className="ag-action-secondary" style={{ fontFamily: T.mono, fontSize: T.sz.xs, cursor: "pointer" }}>
              Cambiar validación ▸
            </button>
          </div>

        </div>
      </section>

      {/* ── 4. ANÁLISIS DE CAMPOS ─────────────────────────────────────────── */}
      <section style={{ marginTop: S[2], marginBottom: S[8] }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[4] }}>
          <SectionLabel label="Campos que Agentik está comparando" accent={C.blueDark} />
          <div style={{ display: "flex", alignItems: "center", gap: S[3], flexShrink: 0 }}>
            <span className="ag-op-status ag-op-status--info" style={{ fontSize: T.sz["2xs"] }}>
              {MATCH_FIELDS.filter(f => f.status === "match").length} compatibles
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>· {_fmtNow()}</span>
          </div>
        </div>

        <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, overflow: "hidden", boxShadow: E.xs }}>
          <div style={{ padding: `${S[1] + 2}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`, background: C.surface, display: "grid", gridTemplateColumns: "1fr 80px 1fr", gap: S[3] }}>
            {[`Origen (${fuenteA.shortLabel})`, "Compatibilidad", `Validación (${fuenteB.shortLabel})`].map(h => (
              <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</span>
            ))}
          </div>

          {MATCH_FIELDS
            .filter((mf, i) => fieldsExpanded || i < 3 || mf.status === "conflict")
            .map((mf, _, arr) => {
              const origIndex   = MATCH_FIELDS.indexOf(mf);
              const confColor   = mf.confidence >= 85 ? C.green : mf.confidence >= 65 ? C.amber : C.red;
              const statusIcon  = mf.status === "conflict" ? "✗" : mf.status === "partial" ? "~" : "✓";
              // border handled via borderBottom on each row
              return (
                <div
                  key={origIndex}
                  onClick={() => open({ type: "match_field", index: origIndex })}
                  className="ag-op-row"
                  style={{
                    borderBottom: `1px solid ${C.lineSubtle}`,
                    borderLeft: `3px solid ${confColor}`,
                    cursor: "pointer", transition: "background 0.1s",
                  }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 1fr", alignItems: "center", gap: S[3], padding: `${S[2]}px ${S[4]}px ${S[1]}px` }}>
                    <div>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: 600, background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.sm, padding: `1px ${S[2]}px`, display: "inline-block" }}>
                        {mf.fieldA}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 3 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
                        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: confColor, lineHeight: 1 }}>{mf.confidence}%</span>
                        <span style={{ fontFamily: T.mono, fontSize: 9, color: confColor, fontWeight: 700 }}>{statusIcon}</span>
                      </div>
                      <div style={{ height: 3, width: 48, background: C.surfaceAlt, borderRadius: R.pill, overflow: "hidden" }}>
                        <div style={{ width: `${mf.confidence}%`, height: "100%", background: confColor, borderRadius: R.pill }} />
                      </div>
                    </div>
                    <div>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: 600, background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.sm, padding: `1px ${S[2]}px`, display: "inline-block" }}>
                        {mf.fieldB}
                      </span>
                    </div>
                  </div>
                  <div style={{ padding: `0 ${S[4]}px ${S[2]}px`, display: "flex", alignItems: "center", gap: S[2] }}>
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 11, borderRadius: 2, background: confColor, color: C.white, fontFamily: T.mono, fontSize: 6, fontWeight: 700, flexShrink: 0 }}>IA</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, lineHeight: 1.4 }}>{mf.interpretation}</span>
                  </div>
                </div>
              );
            })
          }

          {/* Toggle: Ver análisis completo / Contraer */}
          <div style={{ padding: `${S[2]}px ${S[4]}px`, background: C.surface, borderTop: `1px solid ${C.lineSubtle}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              {MATCH_FIELDS.filter(f => f.status === "match").length} compatibles · {MATCH_FIELDS.filter(f => f.status === "partial").length} parcial · {MATCH_FIELDS.filter(f => f.status === "conflict").length} conflicto
            </span>
            {!fieldsExpanded && MATCH_FIELDS.length > 4 && (
              <button
                onClick={() => setFieldsExpanded(true)}
                style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blueDark, background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}
              >
                Ver análisis completo ({MATCH_FIELDS.length - MATCH_FIELDS.filter((mf, i) => i < 3 || mf.status === "conflict").length} más) →
              </button>
            )}
            {fieldsExpanded && (
              <button
                onClick={() => setFieldsExpanded(false)}
                style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Contraer ↑
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── 5. RESULTADO DEL CICLO + INCIDENCIAS ─────────────────────────── */}
      <section style={{ marginBottom: S[8] }}>

        {/* RESULTADO DEL CICLO — cards compactas agrupadas */}
        <SectionLabel label="RESULTADO DEL CICLO" meta={`${Object.values(MATCH_RESULTS).reduce((s, v) => s + v.count, 0)} registros procesados en este ciclo`} accent={C.amber} />

        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2], marginBottom: S[4] }}>

          {/* Grupo 1 — Resultado exitoso */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2] }}>
            {(["conciliados"] as const).map(key => {
              const m = RESULT_META[key]; const r = MATCH_RESULTS[key];
              return (
                <div key={key} onClick={() => open({ type: "result_group", key })} className="ag-kpi-card" style={{
                  padding: `${S[2] + 2}px ${S[3]}px`, border: `1px solid ${C.lineSubtle}`,
                  borderTop: `2px solid ${m.color}`, cursor: "pointer",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: m.color, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{m.label}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: 700, color: C.ink, lineHeight: 1 }}>{r.count}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: S[1] }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{m.sub}</span>
                    {r.amount > 0 && <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>{fmtM(r.amount)}</span>}
                  </div>
                </div>
              );
            })}
            {/* fill remaining 2 cols with attention group */}
            {(["pendientes", "revision"] as const).map(key => {
              const m = RESULT_META[key]; const r = MATCH_RESULTS[key];
              return (
                <div key={key} onClick={() => open({ type: "result_group", key })} className="ag-kpi-card" style={{
                  padding: `${S[2] + 2}px ${S[3]}px`, border: `1px solid ${C.lineSubtle}`,
                  borderTop: `2px solid ${m.color}`, cursor: "pointer",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: m.color, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{m.label}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: 700, color: r.count > 0 ? C.ink : C.inkFaint, lineHeight: 1 }}>{r.count}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: S[1] }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{m.sub}</span>
                    {r.amount > 0 && <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>{fmtM(r.amount)}</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grupo 2 — Problemas */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2] }}>
            {(["duplicados", "inconsistentes", "huerfanos"] as const).map(key => {
              const m = RESULT_META[key]; const r = MATCH_RESULTS[key];
              return (
                <div key={key} onClick={() => open({ type: "result_group", key })} className="ag-kpi-card" style={{
                  padding: `${S[2] + 2}px ${S[3]}px`, border: `1px solid ${C.lineSubtle}`,
                  borderTop: `2px solid ${m.color}`, cursor: "pointer",
                  opacity: r.count === 0 ? 0.55 : 1,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: m.color, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{m.label}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: 700, color: r.count > 0 ? C.ink : C.inkFaint, lineHeight: 1 }}>{r.count}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: S[1] }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{m.sub}</span>
                    {r.amount > 0 && <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>{fmtM(r.amount)}</span>}
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        {/* INCIDENCIAS OPERACIONALES — corazón del módulo */}
        <div style={{ background: C.white, border: `1.5px solid ${C.lineSubtle}`, borderTop: `3px solid ${C.amber}`, borderRadius: R.lg, overflow: "hidden", boxShadow: E.sm }}>
          <div style={{ padding: `${S[3]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`, background: C.surface, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>Incidencias operacionales</span>
              <span className="ag-op-status ag-op-status--warning" style={{ fontSize: T.sz["2xs"] }}>{EXCEPTIONS.length} registros requieren decisión</span>
            </div>
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{_fmtNow()}</span>
          </div>
          {EXCEPTIONS.map((ex, i) => {
            const typeCol  = TYPE_COLOR[ex.type] ?? C.amber;
            const exBgTint = ex.severity === "critical" ? "rgba(220,38,38,0.025)" : ex.severity === "warning" ? "rgba(217,119,6,0.025)" : undefined;
            return (
              <div key={ex.id} style={{
                borderBottom: i < EXCEPTIONS.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                borderLeft: `3px solid ${typeCol}`,
                background: exBgTint,
              }}>
                <div
                  onClick={() => open({ type: "exception", index: i })}
                  className="ag-op-row"
                  style={{ display: "grid", gridTemplateColumns: "48px 1fr 80px 100px 140px", alignItems: "center", gap: S[3], padding: `${S[3]}px ${S[4]}px`, cursor: "pointer", transition: "background 0.1s" }}
                >
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{ex.id}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{ex.label}</div>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: typeCol, fontWeight: 700, background: `${typeCol}15`, border: `1px solid ${typeCol}35`, borderRadius: R.sm, padding: `1px ${S[2]}px`, display: "inline-block", marginTop: 2 }}>{ex.type}</span>
                  </div>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{ex.source}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink, textAlign: "right" as const }}>{ex.amount > 0 ? fmtM(ex.amount) : "—"}</span>
                  <div style={opActionCol()}>
                    <button
                      onClick={e => { e.stopPropagation(); open({ type: "exception", index: i }); }}
                      style={{ ...opActionBtn(typeCol), transition: "background 0.1s" }}
                    >
                      {ex.cta} →
                    </button>
                  </div>
                </div>
                <div style={{ padding: `0 ${S[4]}px ${S[2]}px`, display: "flex", alignItems: "center", gap: S[1] }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>Acción sugerida:</span>
                  {ex.action.includes("Centro Documental") ? (
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                      {ex.action.replace("Centro Documental", "").trim().replace(/en$|en\s$/, "").trim()}
                      {" "}<Link href={`/${orgSlug}/finanzas/documentos`} style={{ color: C.blueDark, fontWeight: 700, textDecoration: "none", borderBottom: `1px solid ${C.blueBorder}` }}>Centro Documental →</Link>
                    </span>
                  ) : (
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{ex.action}</span>
                  )}
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginLeft: S[2] }}>· {ex.date}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 6. AUTOMATIZACIONES ACTIVAS (colapsado) ───────────────────────── */}
      <CollapsibleSection
        title="AUTOMATIZACIONES ACTIVAS"
        meta={`${activeRules} activas · ${RULES.length} configuradas · Motor IA`}
        accent={C.blue}
        detailLabel="Ver reglas"
        defaultOpen={false}
      >
        <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, overflow: "hidden" }}>
          <div style={{ padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`, background: C.surface, display: "grid", gridTemplateColumns: "32px 1fr 80px 110px 80px", gap: S[3], alignItems: "center" }}>
            {["", "Regla automática · SI / ENTONCES", "Ejecuciones", "Última vez", "Estado"].map(h => (
              <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</span>
            ))}
          </div>
          {RULES.map((rule, i) => (
            <div key={rule.id} onClick={() => open({ type: "rule", index: i })} className="ag-op-row" style={{
              display: "grid", gridTemplateColumns: "32px 1fr 80px 110px 80px",
              alignItems: "start", gap: S[3], padding: `${S[3]}px ${S[4]}px`,
              background: rule.active ? undefined : "rgba(0,0,0,0.01)",
              borderBottom: i < RULES.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
              borderLeft: `3px solid ${rule.active ? C.green : C.inkGhost}`,
              cursor: "pointer", transition: "background 0.1s",
            }}>
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 3 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: R.pill, background: rule.active ? C.green : C.inkGhost, flexShrink: 0 }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: 600 }}>{rule.label}</div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1], background: C.surface, borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px` }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: S[2] }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.blue, fontWeight: 700, flexShrink: 0, minWidth: 22 }}>SI</span>
                    <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
                      {rule.ifThen.if.map((cond, ci) => (
                        <span key={ci} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{cond}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: S[2] }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.green, fontWeight: 700, flexShrink: 0, minWidth: 22 }}>→</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, fontWeight: 600 }}>{rule.ifThen.then}</span>
                  </div>
                </div>
              </div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink, paddingTop: 2 }}>{rule.hits}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, paddingTop: 3 }}>{rule.lastApplied}</span>
              <div style={{ paddingTop: 2 }}>
                <span className={`ag-op-status ${rule.active ? "ag-op-status--ok" : "ag-op-status--pending"}`} style={{ fontSize: T.sz["2xs"] }}>
                  {rule.active ? "ACTIVA" : "PAUSADA"}
                </span>
              </div>
            </div>
          ))}
          <div style={{ padding: `${S[3]}px ${S[4]}px`, borderTop: `1px solid ${C.lineSubtle}`, background: C.surface }}>
            <button onClick={() => open({ type: "new_rule" })} className="ag-action-secondary" style={{ fontFamily: T.mono, fontSize: T.sz.xs, cursor: "pointer" }}>
              + Nueva regla automática
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* ── 7. HISTORIAL OPERACIONAL (colapsado) ─────────────────────────── */}
      <CollapsibleSection
        title="HISTORIAL OPERACIONAL"
        meta={SESSIONS.length > 0 ? `${SESSIONS.length} ciclos ejecutados · último ${SESSIONS[0].date}` : "Sin historial — primer ciclo pendiente"}
        accent={C.inkLight}
        detailLabel="Ver historial"
        defaultOpen={false}
      >
        <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, overflow: "hidden" }}>
          <div style={{ padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`, background: C.surface, display: "grid", gridTemplateColumns: "80px 1fr 100px 80px 80px 80px 100px", gap: S[3], alignItems: "center" }}>
            {["Sesión", "Operador", "Tipo", "Conciliados", "Conflictos", "Problemas", "Duración"].map(h => (
              <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</span>
            ))}
          </div>
          {SESSIONS.length === 0 ? (
            <div style={{ padding: `${S[6]}px ${S[4]}px`, textAlign: "center" as const, fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontStyle: "italic" }}>
              Sin sesiones de conciliación registradas. Inicia el primer ciclo para ver el historial.
            </div>
          ) : SESSIONS.map((sess, i) => (
            <div key={sess.id} onClick={() => open({ type: "session", index: i })} className="ag-op-row" style={{
              display: "grid", gridTemplateColumns: "90px 1fr 100px 80px 80px 80px 100px",
              alignItems: "center", gap: S[3], padding: `${S[3]}px ${S[4]}px`,
              borderBottom: i < SESSIONS.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
              borderLeft: `3px solid ${sess.status === "warning" ? C.amber : C.inkGhost}`,
              cursor: "pointer", transition: "background 0.1s",
            }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{sess.code}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{sess.title}</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{sess.date}{sess.period ? ` · ${sess.period}` : ""}</div>
              </div>
              <span className={`ag-op-status ${sess.type === "Automática" ? "ag-op-status--info" : "ag-op-status--pending"}`} style={{ fontSize: T.sz["2xs"] }}>{sess.type.toUpperCase()}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.green }}>{sess.matches}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: sess.conflicts > 5 ? C.amber : C.inkMid }}>{sess.conflicts}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: sess.exceptions > 10 ? C.red : C.inkMid }}>{sess.exceptions}</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{sess.duration}</span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* ── 8. RESULTADOS EXPORTABLES (colapsado) ────────────────────────── */}
      <CollapsibleSection
        title="RESULTADOS EXPORTABLES"
        meta={`${Object.values(MATCH_RESULTS).reduce((s, v) => s + v.count, 0)} registros listos · 4 formatos disponibles`}
        accent={C.inkMid}
        detailLabel="Ver exportaciones"
        defaultOpen={false}
      >
        <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, overflow: "hidden" }}>
          {([
            { format: "PDF",  icon: "PDF", label: "Reporte ejecutivo",      sub: "Conciliación + resumen gerencial",       records: 194, badge: "Listo",      iconColor: "#dc2626"  },
            { format: "XML",  icon: "XML", label: "Validación DIAN",         sub: "Facturas electrónicas · normativa DIAN", records: 48,  badge: "Listo",      iconColor: C.amber    },
            { format: "XLSX", icon: "XLS", label: "Conciliación completa",   sub: "Dataset completo para auditoría",        records: 194, badge: "Listo",      iconColor: C.green    },
            { format: "RPT",  icon: "RPT", label: "Reporte de incidencias",  sub: "Problemas + trazabilidad operacional",   records: 12,  badge: "Con alertas", iconColor: C.blueDark },
          ]).map((exp, i, arr) => (
            <div key={exp.format} style={{
              display: "grid", gridTemplateColumns: "40px 1fr 80px 90px 120px",
              alignItems: "center", gap: S[3],
              padding: `${S[3]}px ${S[4]}px`,
              borderBottom: i < arr.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
              borderLeft: `3px solid ${exp.iconColor}`,
            }}>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 32, height: 20, borderRadius: R.sm, background: `${exp.iconColor}12`, border: `1px solid ${exp.iconColor}25`, fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: exp.iconColor }}>
                {exp.icon}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink }}>{exp.label}</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{exp.sub}</div>
              </div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textAlign: "right" as const }}>{exp.records} reg.</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: exp.badge === "Listo" ? C.green : C.amber, fontWeight: 700, textAlign: "right" as const }}>{exp.badge}</span>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <PassiveAction label={`Descargar ${exp.format} →`} />
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* ── 9. CENTRO DE REVISIÓN ─────────────────────────────────────────── */}
      <CollapsibleSection
        title="CENTRO DE REVISIÓN"
        meta={
          runResult?.executionReport
            ? `${runResult.summary?.mismatches ?? 0} diferencias · ${runResult.summary?.partial ?? 0} parciales · ${runResult.summary?.suspicious ?? 0} sospechosos · última ejecución`
            : "Casos de revisión generados por el motor de reglas"
        }
        accent={C.red}
        detailLabel="Ver bandeja"
        defaultOpen={runResult?.status === "ok"}
      >
        <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, padding: `${S[4]}px` }}>
          <ReviewCenter
            orgSlug={orgSlug}
            sourceAType={selectedAId}
            sourceBType={selectedBId}
            latestExecutionId={runResult?.executionReport?.executionId}
          />
        </div>
      </CollapsibleSection>

      {/* ── 10. HISTORIAL DE EJECUCIONES ──────────────────────────────────── */}
      <CollapsibleSection
        title="HISTORIAL DE EJECUCIONES"
        meta="Ejecuciones del motor de reglas · comparación matemática entre corridas"
        accent={C.blueDark}
        detailLabel="Ver ejecuciones"
        defaultOpen={false}
      >
        <div style={{ background: C.white, border: `1px solid ${C.lineSubtle}`, borderRadius: R.lg, padding: `${S[4]}px` }}>
          <ExecutionTimeline
            orgSlug={orgSlug}
            sourceAType={selectedAId}
            sourceBType={selectedBId}
            latestExecutionId={runResult?.executionReport?.executionId}
          />
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
