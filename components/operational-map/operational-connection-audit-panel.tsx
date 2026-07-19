"use client";
/**
 * components/operational-map/operational-connection-audit-panel.tsx
 *
 * Centro de Certificación Operacional — Enterprise Governance Panel.
 *
 * INTERNAL ONLY: SUPER_ADMIN / AGENTIK_ADMIN
 *
 * Phases: 5 (panel) · 6 (columns) · 7 (enterprise drawer) · 8 (workflow)
 *         9 (badges) · 10 (trust score) · 11 (meeting mode)
 *
 * Sprint: AGENTIK-OPERATIONAL-KPI-CERTIFICATION-01
 */

import React, { useState, useMemo, useCallback, useTransition, useEffect } from "react";
import { C, T, S }      from "@/lib/ui/tokens";
import type {
  OperationalConnectionAudit,
  OperationalConnectionAuditRow,
  ConnectionHealth,
  AuditFlags,
} from "@/lib/operational-map/audit/operational-connection-audit-types";
import type { KpiCertificationRecord, KpiApprovalAction } from "@/lib/operational-map/certification/operational-kpi-certification-types";
import type { KpiGapReport } from "@/lib/operational-map/certification/operational-kpi-gap-detector";
import type { KpiSourceRecord, KpiSourceValidationStatus, KpiSourceAction } from "@/lib/operational-map/certification/operational-kpi-source-service";
import { SOURCE_PRESETS_BY_PROVIDER, PROVIDER_LABELS } from "@/lib/operational-map/source-catalog/source-catalog-presets";
import type { SourcePreset } from "@/lib/operational-map/source-catalog/source-catalog-presets";
import { SAG_REAL_GROUPS, buildSagSourceName, buildSagSourceDescription } from "@/lib/operational-map/source-catalog/sag-real-source-catalog";
import type { SagRealSource } from "@/lib/operational-map/source-catalog/sag-real-source-catalog";
import { normalizeKpiKey } from "@/lib/operational-map/runtime/kpi-runtime-key-aliases";
import { LineageView }    from "@/components/operational-map/lineage-view";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  audit:       OperationalConnectionAudit;
  orgSlug:     string;
  meetingMode: boolean;
  gapReport?:  KpiGapReport;
  kpiSources?: KpiSourceRecord[];
}

// ─── Visual config ────────────────────────────────────────────────────────────

type HealthStyle = { bg: string; color: string; label: string; dot: string };

const HEALTH_STYLES: Record<ConnectionHealth, HealthStyle> = {
  live:          { bg: C.greenLight,  color: C.green,    label: "Live",          dot: "🔵" },
  partial:       { bg: C.amberLight,  color: C.amber,    label: "Parcial",       dot: "🟡" },
  manual:        { bg: "#fdf4ff",     color: "#7c3aed",  label: "Manual",        dot: "🟣" },
  stale:         { bg: C.amberLight,  color: C.amberDark,label: "Stale",         dot: "🟠" },
  mock:          { bg: C.redLight,    color: C.red,      label: "Mock",          dot: "⚫" },
  disconnected:  { bg: C.redLight,    color: C.redDark,  label: "Desconectado",  dot: "🔴" },
  pending:       { bg: C.surface,     color: C.inkLight, label: "Pendiente",     dot: "⚪" },
  wrong_source:  { bg: C.redLight,    color: C.red,      label: "Fuente ×",      dot: "🔴" },
};

const CERT_STYLES: Record<string, { bg: string; color: string; label: string; dot: string }> = {
  draft:               { bg: C.surface,     color: C.inkLight, label: "Draft",              dot: "⚪" },
  reviewing:           { bg: C.blueLight,   color: C.blue,     label: "Revisando",          dot: "🔵" },
  technical_validated: { bg: "#eff6ff",     color: "#1d4ed8",  label: "Téc. validado",      dot: "🔵" },
  business_validated:  { bg: "#f0fdf4",     color: "#15803d",  label: "Neg. validado",      dot: "🟢" },
  sag_validated:       { bg: "#fdf4ff",     color: "#7c3aed",  label: "SAG validado",       dot: "🟣" },
  certified:           { bg: C.greenLight,  color: C.green,    label: "Certificado",        dot: "🟢" },
  production_ready:    { bg: "#d1fae5",     color: "#065f46",  label: "Producción",         dot: "🟢" },
  blocked:             { bg: C.redLight,    color: C.red,      label: "Bloqueado",          dot: "🔴" },
  deprecated:          { bg: C.surfaceAlt,  color: C.inkFaint, label: "Deprecado",          dot: "⚫" },
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: C.red, high: C.amber, medium: C.blue, low: C.inkLight,
};

const ACTION_LABELS: Record<KpiApprovalAction, string> = {
  start_review:         "Iniciar revisión",
  approve_technical:    "Aprobar técnico",
  approve_business:     "Aprobar negocio",
  approve_sag:          "Aprobar SAG",
  certify:              "Certificar",
  mark_production_ready:"Listo producción",
  block:                "Bloquear",
  revoke:               "Revocar",
  deprecate:            "Deprecar",
};

const ACTION_COLORS: Record<KpiApprovalAction, { bg: string; color: string }> = {
  start_review:         { bg: C.blueLight, color: C.blueDark },
  approve_technical:    { bg: "#eff6ff", color: "#1d4ed8" },
  approve_business:     { bg: C.greenLight, color: C.green },
  approve_sag:          { bg: "#fdf4ff", color: "#7c3aed" },
  certify:              { bg: C.greenLight, color: C.greenDark },
  mark_production_ready:{ bg: "#d1fae5", color: "#065f46" },
  block:                { bg: C.redLight, color: C.red },
  revoke:               { bg: C.amberLight, color: C.amberDark },
  deprecate:            { bg: C.surfaceAlt, color: C.inkLight },
};

// Filter options
const DOMAIN_OPTIONS = [
  { value: "", label: "Todos los dominios" },
  { value: "torre_control", label: "Torre de Control" },
  { value: "comercial", label: "Comercial" },
  { value: "cobranza", label: "Cobranza" },
  { value: "tesoreria", label: "Tesorería" },
  { value: "finanzas", label: "Finanzas" },
  { value: "logistica", label: "Logística" },
  { value: "produccion", label: "Producción" },
];

const CERT_STATUS_OPTIONS = [
  { value: "", label: "Todos los estados cert." },
  { value: "production_ready", label: "Producción" },
  { value: "certified", label: "Certificado" },
  { value: "sag_validated", label: "SAG validado" },
  { value: "business_validated", label: "Negocio validado" },
  { value: "technical_validated", label: "Técnico validado" },
  { value: "reviewing", label: "Revisando" },
  { value: "draft", label: "Draft" },
  { value: "blocked", label: "Bloqueado" },
  { value: "null", label: "Sin certificación" },
];

// ─── Small components ─────────────────────────────────────────────────────────

function HealthBadge({ health }: { health: ConnectionHealth }) {
  const s = HEALTH_STYLES[health];
  return (
    <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 4,
      background: s.bg, color: s.color, fontFamily: T.mono, fontSize: "10px", fontWeight: 600, whiteSpace: "nowrap" }}>
      {s.dot} {s.label}
    </span>
  );
}

function CertBadge({ status }: { status: string | null }) {
  if (!status) return (
    <span style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkFaint }}>—</span>
  );
  const s = CERT_STYLES[status] ?? { bg: C.surface, color: C.inkLight, label: status, dot: "•" };
  return (
    <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 4,
      background: s.bg, color: s.color, fontFamily: T.mono, fontSize: "10px", fontWeight: 600, whiteSpace: "nowrap" }}>
      {s.dot} {s.label}
    </span>
  );
}

function TrustGrade({ score, grade }: { score: number; grade: string }) {
  const color = score >= 90 ? C.green : score >= 75 ? "#15803d" : score >= 55 ? C.amber : score >= 35 ? C.amberDark : C.red;
  return (
    <span style={{ fontFamily: T.mono, fontSize: "11px", fontWeight: 700, color }}>
      {grade} <span style={{ fontSize: "10px", fontWeight: 400 }}>({score})</span>
    </span>
  );
}

function ApprovalDot({ approved, label }: { approved: boolean; label: string }) {
  return (
    <span title={label} style={{
      display: "inline-block", width: 10, height: 10, borderRadius: "50%",
      background: approved ? C.green : C.line, border: `1px solid ${approved ? C.green : C.inkGhost}`,
      marginRight: 2,
    }} />
  );
}

function SelectFilter({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      fontFamily: T.mono, fontSize: "11px", padding: "5px 8px",
      border: `1px solid ${C.line}`, borderRadius: 5, background: C.white, color: C.ink, cursor: "pointer", outline: "none",
    }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Enterprise Detail Drawer (Phase 7) ──────────────────────────────────────

function EnterpriseDrawer({
  row,
  orgSlug,
  onClose,
  onActionComplete,
  rowSources,
  onSourcesUpdated,
}: {
  row:              OperationalConnectionAuditRow;
  orgSlug:          string;
  onClose:          () => void;
  onActionComplete: (updated: KpiCertificationRecord) => void;
  rowSources:       KpiSourceRecord[];
  onSourcesUpdated: () => void;
}) {
  const [activeSection, setActiveSection] = useState<"identity" | "sources" | "validation" | "query" | "telemetry" | "risk">("validation");
  const [actionInput,   setActionInput]   = useState<{ action: KpiApprovalAction; notes: string; table: string; query: string; fields: string } | null>(null);
  const [isPending,     startTransition]  = useTransition();
  const [error,         setError]         = useState<string | null>(null);

  const hs = HEALTH_STYLES[row.connectionHealth];
  const cs = row.certificationStatus ? CERT_STYLES[row.certificationStatus] : null;

  // Determine allowed actions from current cert status
  const allowedActions: KpiApprovalAction[] = useMemo(() => {
    const status = row.certificationStatus ?? "draft";
    const base: Record<string, KpiApprovalAction[]> = {
      draft:               ["start_review", "block"],
      reviewing:           ["approve_technical", "block"],
      technical_validated: ["approve_business", "approve_sag", "block"],
      business_validated:  ["approve_sag", "certify", "block"],
      sag_validated:       ["approve_business", "certify", "block"],
      certified:           ["mark_production_ready", "block"],
      production_ready:    ["block", "deprecate"],
      blocked:             ["start_review", "revoke", "deprecate"],
      deprecated:          [],
    };
    const actions = base[status] ?? ["start_review"];
    // Filter mark_production_ready if approvals missing
    return actions.filter(a => {
      if (a === "mark_production_ready" && (!row.businessApproved || !row.sagApproved)) return false;
      return true;
    });
  }, [row.certificationStatus, row.businessApproved, row.sagApproved]);

  const handleAction = useCallback(async () => {
    if (!actionInput) return;
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch(`/api/orgs/${orgSlug}/operational-map/connection-audit`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            kpiKey:         row.entityKey,
            domain:         row.domain,
            action:         actionInput.action,
            notes:          actionInput.notes || undefined,
            approvedTable:  actionInput.table  || undefined,
            approvedQuery:  actionInput.query  || undefined,
            approvedFields: actionInput.fields
              ? actionInput.fields.split(",").map(f => f.trim()).filter(Boolean)
              : undefined,
          }),
        });
        const data = await res.json();
        if (!data.ok) {
          setError(data.error ?? "Error desconocido");
        } else {
          onActionComplete(data.certification);
          setActionInput(null);
        }
      } catch {
        setError("Error de red. Intenta de nuevo.");
      }
    });
  }, [actionInput, orgSlug, row.entityKey, row.domain, onActionComplete]);

  const SECTIONS = [
    { id: "identity",   label: "Identidad" },
    { id: "sources",    label: "Fuentes" },
    { id: "validation", label: "Validación" },
    { id: "query",      label: "Query SAG" },
    { id: "telemetry",  label: "Telemetría" },
    { id: "risk",       label: "Riesgo" },
  ] as const;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", background: "rgba(0,0,0,0.22)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: 560, maxWidth: "92vw", height: "100vh", background: C.white, borderLeft: `1px solid ${C.line}`, overflowY: "auto", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.line}`, background: C.surface, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {row.domainLabel ?? row.domain} · {row.priority.toUpperCase()}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: "13px", fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>
              {row.entityLabel}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <HealthBadge health={row.connectionHealth} />
              <CertBadge status={row.certificationStatus} />
              <TrustGrade score={row.trustScore} grade={row.trustGrade} />
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkLight, fontFamily: T.mono, fontSize: "18px", padding: "0 4px", lineHeight: 1 }}>×</button>
        </div>

        {/* Section tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.line}`, overflowX: "auto" }}>
          {SECTIONS.map(sec => (
            <button key={sec.id} onClick={() => setActiveSection(sec.id as typeof activeSection)} style={{
              background: "none", border: "none", cursor: "pointer",
              padding: "8px 14px", fontFamily: T.mono, fontSize: "10px",
              color: activeSection === sec.id ? C.blueDark : C.inkLight,
              fontWeight: activeSection === sec.id ? 700 : 400,
              borderBottom: activeSection === sec.id ? `2px solid ${C.blueDark}` : "2px solid transparent",
              whiteSpace: "nowrap",
            }}>{sec.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>

          {/* IDENTITY */}
          {activeSection === "identity" && (
            <>
              <DataGrid rows={[
                ["KPI Key",         row.entityKey],
                ["Definición",      row.kpiDefinition],
                ["Dominio",         row.domainLabel ?? row.domain],
                ["Criticidad",      row.priority.toUpperCase()],
                ["Frecuencia",      row.frequency],
                ["Source of Truth", row.sourceOfTruth],
              ]} />
              <div>
                <SectionLabel label="Módulos afectados" />
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {row.affectedModules.map(m => (
                    <span key={m} style={{ fontFamily: T.mono, fontSize: "10px", padding: "3px 8px", background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: 4, color: C.inkMid }}>{m}</span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* SOURCES — editable */}
          {activeSection === "sources" && (
            <EditableSourcesSection
              kpiKey={row.entityKey}
              orgSlug={orgSlug}
              expectedSources={row.expectedSources}
              rowSources={rowSources}
              onSourcesUpdated={onSourcesUpdated}
            />
          )}

          {/* VALIDATION */}
          {activeSection === "validation" && (
            <>
              {/* Approval gates */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
                <GateCard label="Negocio" approved={row.businessApproved} validator={null} />
                <GateCard label="SAG DBA"  approved={row.sagApproved}      validator={null} />
              </div>
              <DataGrid rows={[
                ["Estado cert.",       row.certificationStatus ?? "draft"],
                ["Validado por",       row.validatedBy ?? "—"],
                ["Última validación",  row.lastValidatedAt ? new Date(row.lastValidatedAt).toLocaleString("es-CO") : "—"],
                ["Confidence score",   `${row.confidenceScore}/100`],
                ["Trust score",        `${row.trustScore}/100 (${row.trustGrade})`],
              ]} />

              {/* Action section */}
              {allowedActions.length > 0 && (
                <div>
                  <SectionLabel label="Acciones disponibles" />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {allowedActions.map(action => (
                      <button
                        key={action}
                        onClick={() => setActionInput({ action, notes: "", table: "", query: "", fields: "" })}
                        disabled={isPending}
                        style={{
                          padding: "6px 12px", borderRadius: 5, cursor: "pointer",
                          fontFamily: T.mono, fontSize: "11px", fontWeight: 600,
                          border: `1px solid ${ACTION_COLORS[action].color}`,
                          background: ACTION_COLORS[action].bg, color: ACTION_COLORS[action].color,
                          opacity: isPending ? 0.6 : 1,
                        }}
                      >
                        {ACTION_LABELS[action]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Action form */}
              {actionInput && (
                <div style={{ padding: "12px 14px", background: C.surface, borderRadius: 7, border: `1px solid ${C.line}` }}>
                  <div style={{ fontFamily: T.mono, fontSize: "11px", fontWeight: 700, color: C.ink, marginBottom: 10 }}>
                    {ACTION_LABELS[actionInput.action]}
                  </div>
                  {actionInput.action === "approve_sag" && (
                    <>
                      <FormField label="Tabla SAG aprobada" value={actionInput.table}
                        onChange={v => setActionInput(p => p ? { ...p, table: v } : p)} placeholder="Ej: CXCCXC" />
                      <FormField label="Campos (separados por coma)" value={actionInput.fields}
                        onChange={v => setActionInput(p => p ? { ...p, fields: v } : p)} placeholder="Ej: NIT, SALDO, FECHA_VEN" />
                      <FormField label="Query aprobada" value={actionInput.query}
                        onChange={v => setActionInput(p => p ? { ...p, query: v } : p)} placeholder="SELECT ... FROM ..." textarea />
                    </>
                  )}
                  {actionInput.action === "block" && (
                    <FormField label="Descripción del bloqueo" value={actionInput.notes}
                      onChange={v => setActionInput(p => p ? { ...p, notes: v } : p)} placeholder="Describe el bloqueador..." textarea />
                  )}
                  <FormField label="Notas" value={actionInput.notes}
                    onChange={v => setActionInput(p => p ? { ...p, notes: v } : p)} placeholder="Notas opcionales..." textarea />
                  {error && <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.red, marginTop: 6 }}>{error}</div>}
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      onClick={handleAction}
                      disabled={isPending}
                      style={{
                        padding: "7px 16px", borderRadius: 5, cursor: "pointer",
                        fontFamily: T.mono, fontSize: "11px", fontWeight: 700,
                        background: C.blueDark, color: C.white, border: "none",
                        opacity: isPending ? 0.6 : 1,
                      }}
                    >
                      {isPending ? "Guardando…" : "Confirmar"}
                    </button>
                    <button
                      onClick={() => { setActionInput(null); setError(null); }}
                      style={{ padding: "7px 12px", borderRadius: 5, cursor: "pointer", fontFamily: T.mono, fontSize: "11px", background: "none", border: `1px solid ${C.line}`, color: C.inkLight }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* QUERY */}
          {activeSection === "query" && (
            <>
              <DataGrid rows={[
                ["SAG query status",   row.sagQueryStatus],
                ["Tabla confirmada",   row.sagTableConfirmed ? "Sí" : "No"],
                ["Campos confirmados", row.sagFieldsConfirmed ? "Sí" : "No"],
              ]} />
              <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkFaint, marginBottom: 4 }}>
                Estos campos se rellenan cuando SAG DBA aprueba el KPI (acción "Aprobar SAG").
              </div>
              <InfoCard title="Stub — AGENTIK-REAL-CONNECTION-TELEMETRY-01" color={C.surface} borderColor={C.line} textColor={C.inkLight}>
                <div style={{ fontFamily: T.mono, fontSize: "10px" }}>
                  Query aprobada, tabla y campos se rellenarán después del sprint de telemetría real.
                  La arquitectura ya está preparada.
                </div>
              </InfoCard>
            </>
          )}

          {/* TELEMETRY */}
          {activeSection === "telemetry" && (
            <>
              <DataGrid rows={[
                ["Último sync",     row.lastSyncAt ? new Date(row.lastSyncAt).toLocaleString("es-CO") : "—"],
                ["Freshness",       row.dataFreshness],
                ["Frecuencia esp.", row.frequency],
                ["Health estado",   row.connectionHealth],
              ]} />
              <InfoCard title="Telemetría real — Stub" color={C.surface} borderColor={C.line} textColor={C.inkLight}>
                <div style={{ fontFamily: T.mono, fontSize: "10px" }}>
                  Latencia, filas sincronizadas, heartbeat y fallas de conector estarán disponibles
                  en sprint AGENTIK-REAL-CONNECTION-TELEMETRY-01.
                </div>
              </InfoCard>
            </>
          )}

          {/* RISK */}
          {activeSection === "risk" && (
            <>
              {row.riskDescription && (
                <InfoCard title="Descripción de riesgo" color={C.amberLight} borderColor={C.amberBorder} textColor={C.amberDark}>
                  <div style={{ fontFamily: T.mono, fontSize: "11px" }}>{row.riskDescription}</div>
                </InfoCard>
              )}
              {row.recommendedAction && (
                <InfoCard title="Acción recomendada" color={C.blueLight} borderColor={C.blueBorder} textColor={C.blue}>
                  <div style={{ fontFamily: T.mono, fontSize: "11px" }}>{row.recommendedAction}</div>
                </InfoCard>
              )}
              <SectionLabel label="Módulos en riesgo si KPI no se certifica" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {row.affectedModules.map(m => (
                  <span key={m} style={{ fontFamily: T.mono, fontSize: "10px", padding: "3px 8px", background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: 4, color: C.red }}>{m}</span>
                ))}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Small drawer helpers ─────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
      {label}
    </div>
  );
}

function DataGrid({ rows }: { rows: [string, string | null | undefined][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 16px" }}>
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <span style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight }}>{k}</span>
          <span style={{ fontFamily: T.mono, fontSize: "10px", color: C.ink, fontWeight: 600 }}>{v ?? "—"}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function InfoCard({ title, color, borderColor, textColor, children }: {
  title: string; color: string; borderColor: string; textColor: string; children: React.ReactNode;
}) {
  return (
    <div style={{ padding: "10px 12px", background: color, border: `1px solid ${borderColor}`, borderRadius: 6 }}>
      <div style={{ fontFamily: T.mono, fontSize: "9px", color: textColor, fontWeight: 700, marginBottom: 5, textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );
}

function GateCard({ label, approved, validator }: { label: string; approved: boolean; validator: string | null }) {
  return (
    <div style={{ padding: "10px 12px", background: approved ? C.greenLight : C.surface, border: `1px solid ${approved ? C.greenBorder : C.line}`, borderRadius: 6 }}>
      <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: "13px", fontWeight: 700, color: approved ? C.green : C.inkFaint }}>
        {approved ? "✓ Aprobado" : "◯ Pendiente"}
      </div>
      {validator && <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginTop: 2 }}>{validator}</div>}
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, textarea }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean;
}) {
  const style: React.CSSProperties = {
    width: "100%", fontFamily: T.mono, fontSize: "11px", padding: "6px 8px",
    border: `1px solid ${C.line}`, borderRadius: 5, background: C.white, color: C.ink,
    outline: "none", resize: "vertical" as const, boxSizing: "border-box" as const,
  };
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>{label}</div>
      {textarea
        ? <textarea rows={3} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={style} />
        : <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={style} />
      }
    </div>
  );
}

// ─── Executive source resolution helpers ──────────────────────────────────────

interface PrimaryOperationalSource {
  primaryCode:      string;
  primaryName:      string;
  primaryRowCount:  number;
  primaryType:      string;
  primaryFuente:    string;
  confidence:       number;
  ventasSigno:      string | null;
  cobrosSigno:      string | null;
  secondarySources: Array<{ code: string; name: string; rowCount: number; type: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolvePrimaryOperationalSource(lineage: any): PrimaryOperationalSource | null {
  const primary = lineage?.primarySagSource;
  if (!primary || primary.unresolved) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const secondary = (lineage?.sourceCodeGroups ?? []).filter((g: any) => g.code !== primary.code).slice(0, 5).map((g: any) => ({
    code:     g.code as string,
    name:     (g.catalogMatch?.nombreFuente as string | null) ?? "Pendiente clasificar",
    rowCount: g.rowCount as number,
    type:     (g.sagSourceType as string | null) ?? "—",
  }));
  return {
    primaryCode:      primary.code as string,
    primaryName:      primary.sourceName as string,
    primaryRowCount:  primary.rowCount as number,
    primaryType:      (primary.sourceType as string) ?? "—",
    primaryFuente:    (primary.fuente as string | null) ?? "unknown",
    confidence:       (primary.confidence as number | null) ?? 0,
    ventasSigno:      (primary.catalogMatch?.impactoVentasSigno as string | null) ?? null,
    cobrosSigno:      (primary.catalogMatch?.impactoCobrosSigno as string | null) ?? null,
    secondarySources: secondary,
  };
}

function buildOperationalNarrative(src: PrimaryOperationalSource): string {
  const tipo = src.primaryType === "OFICIAL" ? "datos operacionales oficiales" : "datos de remisión";
  if (src.secondarySources.length === 0) {
    return `Agentik calcula este KPI usando ${src.primaryCode} (${src.primaryName}) sobre ${tipo} SAG.`;
  }
  const others = src.secondarySources.map(s => s.code).join(", ");
  return `Agentik detectó múltiples fuentes SAG (${others}). ${src.primaryCode} fue seleccionada automáticamente como fuente principal por volumen y clasificación operacional.`;
}

function getConfidenceLabel(confidence: number): { label: string; color: string; bg: string } {
  if (confidence >= 80) return { label: "Confiabilidad alta",              color: "#065f46", bg: "#d1fae5" };
  if (confidence >= 55) return { label: "Confiabilidad media",             color: "#92400e", bg: "#fef3c7" };
  return                        { label: "Pendiente confirmar confianza",  color: "#c2410c", bg: "#fee2e2" };
}

// ─── Meeting mode row ─────────────────────────────────────────────────────────

function MeetingRow({ row, orgSlug, onUpdate }: {
  row: OperationalConnectionAuditRow;
  orgSlug: string;
  onUpdate: (updated: KpiCertificationRecord) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const quickApprove = useCallback((action: KpiApprovalAction) => {
    startTransition(async () => {
      const res = await fetch(`/api/orgs/${orgSlug}/operational-map/connection-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kpiKey: row.entityKey, domain: row.domain, action }),
      });
      const data = await res.json();
      if (data.ok) onUpdate(data.certification);
    });
  }, [orgSlug, row.entityKey, row.domain, onUpdate]);

  const certStatus = row.certificationStatus ?? "draft";
  const canApproveTech = certStatus === "draft" || certStatus === "reviewing";
  const canApproveBiz  = !row.businessApproved;
  const canApproveSag  = !row.sagApproved;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "1fr 80px 60px 80px 80px 80px",
      gap: S[2], padding: "6px 12px", borderBottom: `1px solid ${C.lineSubtle}`,
      alignItems: "center", opacity: isPending ? 0.6 : 1,
    }}>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: "11px", fontWeight: 600, color: C.ink }}>{row.entityLabel}</div>
        <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>{row.domainLabel ?? row.domain}</div>
      </div>
      <HealthBadge health={row.connectionHealth} />
      <TrustGrade score={row.trustScore} grade={row.trustGrade} />
      {canApproveTech
        ? <button onClick={() => quickApprove("approve_technical")} style={{ padding: "3px 7px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", fontWeight: 600, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>Téc ✓</button>
        : <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.green }}>Téc ✓</span>
      }
      {canApproveBiz
        ? <button onClick={() => quickApprove("approve_business")} style={{ padding: "3px 7px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", fontWeight: 600, background: C.greenLight, color: C.green, border: `1px solid ${C.greenBorder}` }}>Neg ✓</button>
        : <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.green }}>Neg ✓</span>
      }
      {canApproveSag
        ? <button onClick={() => quickApprove("approve_sag")} style={{ padding: "3px 7px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", fontWeight: 600, background: "#fdf4ff", color: "#7c3aed", border: "1px solid #e9d5ff" }}>SAG ✓</button>
        : <span style={{ fontFamily: T.mono, fontSize: "9px", color: "#7c3aed" }}>SAG ✓</span>
      }
    </div>
  );
}

// ─── Source status helpers ────────────────────────────────────────────────────

type SourceStatus = "no_source" | "suggested" | "assigned" | "confirmed_agentik" | "confirmed_sag" | "confirmed_biz" | "integration_ready";

function getSourceStatus(sources: KpiSourceRecord[]): SourceStatus {
  if (!sources.length)                                      return "no_source";
  const hasSag     = sources.some(s => s.sagValidated);
  const hasBiz     = sources.some(s => s.businessValidated);
  const hasConf    = sources.some(s => s.queryValidated && s.fieldsValidated);
  const hasRuntime = sources.some(s =>
    s.validationStatus === "runtime_detected" ||
    s.validationStatus === "connected_partial" ||
    s.validationStatus === "snapshot_detected" ||
    s.validationStatus === "used_by_agentik"
  );
  if (hasSag && hasBiz && hasConf)                          return "integration_ready";
  if (hasSag && hasBiz)                                     return "confirmed_biz";
  if (hasSag)                                               return "confirmed_sag";
  if (hasConf)                                              return "confirmed_agentik";
  if (hasRuntime)                                           return "assigned"; // runtime data → shows as assigned, not "suggested"
  if (sources.some(s => s.tableName))                       return "assigned";
  return "suggested";
}

const SOURCE_STATUS_CONFIG: Record<SourceStatus, { bg: string; color: string; label: string }> = {
  no_source:          { bg: C.redLight,    color: C.red,      label: "Sin runtime detectado" },
  suggested:          { bg: C.surface,     color: C.inkLight, label: "Sugerida" },
  assigned:           { bg: "#f0fdf4",     color: "#16a34a",  label: "Datos detectados" },
  confirmed_agentik:  { bg: C.blueLight,   color: C.blueDark, label: "Conf. Agentik" },
  confirmed_sag:      { bg: "#fdf4ff",     color: "#7c3aed",  label: "Conf. SAG" },
  confirmed_biz:      { bg: C.greenLight,  color: C.green,    label: "Conf. Negocio" },
  integration_ready:  { bg: "#d1fae5",     color: "#065f46",  label: "Lista integrar" },
};

function SourceStatusBadge({ sources }: { sources: KpiSourceRecord[] }) {
  const status = getSourceStatus(sources);
  const s      = SOURCE_STATUS_CONFIG[status];
  return (
    <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 4,
      background: s.bg, color: s.color, fontFamily: T.mono, fontSize: "10px", fontWeight: 600, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

// ─── Editable Sources Section (Drawer Tab) ───────────────────────────────────

const ROLE_OPTIONS = [
  { value: "primary",    label: "Primaria" },
  { value: "secondary",  label: "Secundaria" },
  { value: "fallback",   label: "Fallback" },
  { value: "calculated", label: "Calculada" },
  { value: "hybrid",     label: "Híbrida" },
];

function EditableSourcesSection({ kpiKey, orgSlug, expectedSources, rowSources, onSourcesUpdated }: {
  kpiKey:           string;
  orgSlug:          string;
  expectedSources:  string[];
  rowSources:       KpiSourceRecord[];
  onSourcesUpdated: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [showAdd,   setShowAdd]      = useState(false);
  const [error,     setError]        = useState<string | null>(null);
  const [addForm,   setAddForm]      = useState({
    sourceName: "", sourceType: "table", sourceRole: "primary", provider: "sag",
    tableName: "", approvedQuery: "", fields: "", notes: "", preset: "",
  });

  // Select a preset
  const applyPreset = useCallback((preset: SourcePreset) => {
    setAddForm(p => ({
      ...p,
      sourceName:    preset.label,
      sourceType:    preset.sourceType,
      provider:      preset.provider,
      tableName:     preset.tableName ?? "",
      fields:        preset.fields?.join(", ") ?? "",
      preset:        preset.name,
    }));
  }, []);

  const handleAdd = useCallback(() => {
    if (!addForm.sourceName) { setError("Nombre de fuente requerido."); return; }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/orgs/${orgSlug}/operational-map/kpi-sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kpiKey,
            sourceName:   addForm.sourceName,
            sourceType:   addForm.sourceType,
            sourceRole:   addForm.sourceRole,
            provider:     addForm.provider,
            tableName:    addForm.tableName || undefined,
            approvedQuery: addForm.approvedQuery || undefined,
            approvedFields: addForm.fields ? addForm.fields.split(",").map(f => f.trim()).filter(Boolean) : undefined,
            notes:         addForm.notes || undefined,
          }),
        });
        const data = await res.json();
        if (!data.ok) { setError(data.error ?? "Error al guardar"); return; }
        setShowAdd(false);
        setAddForm({ sourceName: "", sourceType: "table", sourceRole: "primary", provider: "sag", tableName: "", approvedQuery: "", fields: "", notes: "", preset: "" });
        onSourcesUpdated();
      } catch { setError("Error de red"); }
    });
  }, [addForm, kpiKey, orgSlug, onSourcesUpdated]);

  const handleDelete = useCallback((id: string) => {
    startTransition(async () => {
      await fetch(`/api/orgs/${orgSlug}/operational-map/kpi-sources?id=${id}&kpiKey=${kpiKey}`, { method: "DELETE" });
      onSourcesUpdated();
    });
  }, [orgSlug, kpiKey, onSourcesUpdated]);

  const handleConfirmSag = useCallback((source: KpiSourceRecord) => {
    startTransition(async () => {
      await fetch(`/api/orgs/${orgSlug}/operational-map/kpi-sources`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: source.id, kpiKey, tableName: source.tableName }),
      });
      onSourcesUpdated();
    });
  }, [orgSlug, kpiKey, onSourcesUpdated]);

  const inputStyle: React.CSSProperties = {
    width: "100%", fontFamily: T.mono, fontSize: "11px", padding: "5px 7px",
    border: `1px solid ${C.line}`, borderRadius: 4, background: C.white, color: C.ink,
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div>
      {/* Expected design */}
      <InfoCard title="Fuente esperada (diseño)" color={C.blueLight} borderColor={C.blueBorder} textColor={C.blue}>
        {expectedSources.length > 0
          ? expectedSources.map((s, i) => <div key={i} style={{ fontFamily: T.mono, fontSize: "11px", color: C.ink, padding: "2px 0" }}>→ {s}</div>)
          : <div style={{ fontFamily: T.mono, fontSize: "11px", color: C.inkFaint }}>No definido</div>}
      </InfoCard>

      {/* Assigned sources list */}
      <SectionLabel label={`Fuentes asignadas (${rowSources.length})`} />
      {rowSources.length === 0 && (
        <div style={{ fontFamily: T.mono, fontSize: "11px", color: C.inkFaint, padding: "8px 0" }}>Sin fuentes asignadas. Agrega una abajo.</div>
      )}
      {rowSources.map(src => (
        <div key={src.id} style={{ padding: "10px 12px", border: `1px solid ${C.line}`, borderRadius: 6, marginBottom: 8, background: src.sourceOfTruth ? "#f0fdf4" : C.white }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.mono, fontSize: "11px", fontWeight: 700, color: C.ink }}>{src.sourceName}</div>
              <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginTop: 2 }}>
                {PROVIDER_LABELS[src.provider] ?? src.provider} · {src.sourceRole} · {src.sourceType}
              </div>
              {src.tableName && (
                <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.blue, marginTop: 2 }}>Tabla: {src.tableName}</div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                {src.sagValidated     && <span style={{ fontFamily: T.mono, fontSize: "9px", padding: "1px 6px", borderRadius: 3, background: "#fdf4ff", color: "#7c3aed", fontWeight: 700 }}>SAG ✓</span>}
                {src.businessValidated && <span style={{ fontFamily: T.mono, fontSize: "9px", padding: "1px 6px", borderRadius: 3, background: C.greenLight, color: C.green, fontWeight: 700 }}>Neg ✓</span>}
                {src.queryValidated   && <span style={{ fontFamily: T.mono, fontSize: "9px", padding: "1px 6px", borderRadius: 3, background: C.blueLight, color: C.blueDark, fontWeight: 700 }}>Query ✓</span>}
                {src.fieldsValidated  && <span style={{ fontFamily: T.mono, fontSize: "9px", padding: "1px 6px", borderRadius: 3, background: C.blueLight, color: C.blueDark, fontWeight: 700 }}>Campos ✓</span>}
                {src.sourceOfTruth    && <span style={{ fontFamily: T.mono, fontSize: "9px", padding: "1px 6px", borderRadius: 3, background: "#d1fae5", color: "#065f46", fontWeight: 700 }}>⭐ SoT</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 5, flexDirection: "column", alignItems: "flex-end" }}>
              {!src.sagValidated && (
                <button onClick={() => handleConfirmSag(src)} disabled={isPending} style={{ padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", fontWeight: 600, background: "#fdf4ff", color: "#7c3aed", border: "1px solid #e9d5ff" }}>
                  Confirmar SAG
                </button>
              )}
              <button onClick={() => handleDelete(src.id)} disabled={isPending} style={{ padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "none", color: C.red, border: `1px solid ${C.redBorder}` }}>
                Eliminar
              </button>
            </div>
          </div>
        </div>
      ))}

      {/* Add source */}
      {!showAdd ? (
        <button onClick={() => setShowAdd(true)} style={{ padding: "7px 14px", borderRadius: 5, cursor: "pointer", fontFamily: T.mono, fontSize: "11px", fontWeight: 700, background: C.blueDark, color: C.white, border: "none" }}>
          + Agregar fuente
        </button>
      ) : (
        <div style={{ padding: "12px 14px", border: `1px solid ${C.line}`, borderRadius: 7, background: C.surface, marginTop: 8 }}>
          <div style={{ fontFamily: T.mono, fontSize: "11px", fontWeight: 700, color: C.ink, marginBottom: 10 }}>Nueva fuente</div>

          {/* Preset picker */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 4 }}>Elegir preset (o rellenar manual)</div>
            {Object.entries(SOURCE_PRESETS_BY_PROVIDER).map(([prov, presets]) => (
              <div key={prov} style={{ marginBottom: 6 }}>
                <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, textTransform: "uppercase", marginBottom: 3 }}>{PROVIDER_LABELS[prov]}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {presets.map(preset => (
                    <button key={preset.name} onClick={() => applyPreset(preset)} style={{
                      padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px",
                      background: addForm.preset === preset.name ? C.blueLight : C.white,
                      color: addForm.preset === preset.name ? C.blueDark : C.inkMid,
                      border: `1px solid ${addForm.preset === preset.name ? C.blueDark : C.line}`,
                      fontWeight: addForm.preset === preset.name ? 700 : 400,
                    }}>
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Nombre fuente *</div>
              <input type="text" value={addForm.sourceName} onChange={e => setAddForm(p => ({ ...p, sourceName: e.target.value }))} style={inputStyle} placeholder="Ej: SAG PEDIDOS" />
            </div>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Provider</div>
              <select value={addForm.provider} onChange={e => setAddForm(p => ({ ...p, provider: e.target.value }))} style={inputStyle}>
                {Object.entries(PROVIDER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Rol</div>
              <select value={addForm.sourceRole} onChange={e => setAddForm(p => ({ ...p, sourceRole: e.target.value }))} style={inputStyle}>
                {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Tipo</div>
              <select value={addForm.sourceType} onChange={e => setAddForm(p => ({ ...p, sourceType: e.target.value }))} style={inputStyle}>
                {["table","view","api","query","module","file","engine","custom"].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Tabla / Vista / API</div>
            <input type="text" value={addForm.tableName} onChange={e => setAddForm(p => ({ ...p, tableName: e.target.value }))} style={inputStyle} placeholder="Ej: DOCPED" />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Campos (separados por coma)</div>
            <input type="text" value={addForm.fields} onChange={e => setAddForm(p => ({ ...p, fields: e.target.value }))} style={inputStyle} placeholder="Ej: NIT, FECHA, VALOR" />
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Query aprobada</div>
            <textarea rows={2} value={addForm.approvedQuery} onChange={e => setAddForm(p => ({ ...p, approvedQuery: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} placeholder="SELECT ... FROM ..." />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Notas</div>
            <input type="text" value={addForm.notes} onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))} style={inputStyle} placeholder="Contexto, bloqueadores, pendientes..." />
          </div>
          {error && <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.red, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleAdd} disabled={isPending} style={{ padding: "7px 16px", borderRadius: 5, cursor: "pointer", fontFamily: T.mono, fontSize: "11px", fontWeight: 700, background: C.blueDark, color: C.white, border: "none", opacity: isPending ? 0.6 : 1 }}>
              {isPending ? "Guardando…" : "Guardar fuente"}
            </button>
            <button onClick={() => { setShowAdd(false); setError(null); }} style={{ padding: "7px 12px", borderRadius: 5, cursor: "pointer", fontFamily: T.mono, fontSize: "11px", background: "none", border: `1px solid ${C.line}`, color: C.inkLight }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Meeting Mode Panel ───────────────────────────────────────────────────────

type MeetingFilter =
  | "all"
  | "no_source"
  | "no_validated"
  | "critical"
  | "connected"
  | "certified"
  | "bootstrap_only"
  | "bootstrap_pending"
  | "bootstrap_unresolved";

const MEETING_FILTER_OPTIONS: { value: MeetingFilter; label: string }[] = [
  { value: "all",                   label: "Todos" },
  { value: "no_source",             label: "Sin fuente" },
  { value: "no_validated",          label: "Sin validar" },
  { value: "critical",              label: "Solo críticos" },
  { value: "connected",             label: "Conectados" },
  { value: "certified",             label: "Certificados" },
  { value: "bootstrap_only",        label: "Solo históricos" },
  { value: "bootstrap_pending",     label: "Histórico pendiente" },
  { value: "bootstrap_unresolved",  label: "Sin match CSV" },
];

function MeetingModePanel({
  audit, orgSlug, sourceMap, onCertificationUpdate, onSourcesUpdated,
  search, onSearchChange, filter, onFilterChange,
}: {
  audit:                  OperationalConnectionAudit;
  orgSlug:                string;
  sourceMap:              Map<string, KpiSourceRecord[]>;
  onCertificationUpdate:  (u: KpiCertificationRecord) => void;
  onSourcesUpdated:       () => void;
  search:                 string;
  onSearchChange:         (v: string) => void;
  filter:                 MeetingFilter;
  onFilterChange:         (v: MeetingFilter) => void;
}) {
  const prio = { critical: 3, high: 2, medium: 1, low: 0 };
  const [syncState, setSyncState] = React.useState<"idle" | "running" | "done" | "error">("idle");

  const syncRuntimeSources = useCallback(async () => {
    setSyncState("running");
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/operational-map/runtime-sources`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      });
      const d = await res.json();
      if (d.ok) {
        setSyncState("done");
        onSourcesUpdated();
        setTimeout(() => setSyncState("idle"), 3000);
      } else {
        setSyncState("error");
        setTimeout(() => setSyncState("idle"), 3000);
      }
    } catch {
      setSyncState("error");
      setTimeout(() => setSyncState("idle"), 3000);
    }
  }, [orgSlug, onSourcesUpdated]);

  const filteredRows = useMemo(() => {
    let rows = [...audit.rows].sort(
      (a, b) => (prio[b.priority as keyof typeof prio] ?? 0) - (prio[a.priority as keyof typeof prio] ?? 0)
    );

    // Text search (Phase 2)
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      rows = rows.filter(r =>
        r.entityLabel.toLowerCase().includes(q) ||
        r.kpiDefinition.toLowerCase().includes(q) ||
        r.domain.toLowerCase().includes(q) ||
        (r.domainLabel ?? "").toLowerCase().includes(q) ||
        r.expectedSources.some(s => s.toLowerCase().includes(q)) ||
        r.actualSources.some(s => s.toLowerCase().includes(q)) ||
        r.affectedModules.some(m => m.toLowerCase().includes(q)) ||
        (r.certificationStatus ?? "").includes(q) ||
        r.connectionHealth.includes(q) ||
        (() => {
          const srcs = sourceMap.get(normalizeKpiKey(r.entityKey)) ?? [];
          return srcs.some(s =>
            s.sourceName.toLowerCase().includes(q) ||
            (s.tableName ?? "").toLowerCase().includes(q) ||
            s.provider.toLowerCase().includes(q) ||
            ((s.approvedFields as string[] | null) ?? []).some(f => f.toLowerCase().includes(q))
          );
        })()
      );
    }

    // Filter toggles (Phase 1)
    switch (filter) {
      case "no_source":
        return rows.filter(r => (sourceMap.get(normalizeKpiKey(r.entityKey)) ?? []).length === 0 && r.actualSources.length === 0);
      case "no_validated":
        return rows.filter(r => !r.sagApproved || !r.businessApproved);
      case "critical":
        return rows.filter(r => r.priority === "critical");
      case "connected":
        return rows.filter(r => r.connectionHealth === "live" || r.connectionHealth === "partial");
      case "certified":
        return rows.filter(r => r.certificationStatus === "certified" || r.certificationStatus === "production_ready");
      case "bootstrap_only":
        return rows.filter(r => (sourceMap.get(normalizeKpiKey(r.entityKey)) ?? []).some(s => s.bootstrapBatchId));
      case "bootstrap_pending":
        return rows.filter(r =>
          (sourceMap.get(normalizeKpiKey(r.entityKey)) ?? []).some(s =>
            s.bootstrapBatchId &&
            (s.validationStatus === "suggested_from_csv" ||
             s.validationStatus === "pending_meeting_validation" ||
             s.validationStatus === "needs_source_confirmation")
          )
        );
      case "bootstrap_unresolved":
        return rows.filter(r =>
          (sourceMap.get(normalizeKpiKey(r.entityKey)) ?? []).some(s =>
            s.bootstrapBatchId && s.validationStatus === "unresolved_mapping"
          )
        );
      default:
        return rows;
    }
  }, [audit.rows, search, filter, sourceMap]);

  return (
    <div>
      {/* Header */}
      <div style={{ padding: "10px 14px", background: C.blueLight, border: `1px solid ${C.blueBorder}`, borderRadius: 7, marginBottom: S[3], display: "flex", alignItems: "center", gap: S[3], flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.mono, fontSize: "11px", color: C.blueDark, fontWeight: 700 }}>Mesa viva SAG × CRM × Agentik × Negocio</div>
          <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.blue, marginTop: 3 }}>
            Mapeo completo de fuentes por KPI. Mostrando <strong>{filteredRows.length}</strong> de <strong>{audit.rows.length}</strong> KPIs totales.
            {sourceMap.size > 0 && <span style={{ marginLeft: 8, color: "#16a34a" }}>· {sourceMap.size} KPIs con fuente</span>}
          </div>
        </div>
        {/* Sincronizar fuentes runtime */}
        <button
          onClick={syncRuntimeSources}
          disabled={syncState === "running"}
          style={{
            padding: "5px 12px", borderRadius: 5, cursor: syncState === "running" ? "wait" : "pointer",
            fontFamily: T.mono, fontSize: "10px", fontWeight: 700, flexShrink: 0,
            background: syncState === "done" ? "#d1fae5" : syncState === "error" ? "#fee2e2" : C.blueDark,
            color:      syncState === "done" ? "#065f46" : syncState === "error" ? "#991b1b" : C.white,
            border:     "none", opacity: syncState === "running" ? 0.7 : 1,
          }}
        >
          {syncState === "running" ? "Detectando…" : syncState === "done" ? "✓ Fuentes actualizadas" : syncState === "error" ? "Error — reintentar" : "⟳ Sincronizar fuentes"}
        </button>
      </div>

      {/* Search + filter bar (Phases 1+2) */}
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap", alignItems: "center", marginBottom: S[3], padding: "8px 12px", background: C.surface, borderRadius: 7, border: `1px solid ${C.line}` }}>
        <input
          type="text" value={search} onChange={e => onSearchChange(e.target.value)}
          placeholder="Buscar KPI, dominio, tabla, campo, fuente..."
          style={{ flex: "1 1 220px", fontFamily: T.mono, fontSize: "11px", padding: "6px 10px", border: `1px solid ${C.line}`, borderRadius: 5, background: C.white, color: C.ink, outline: "none", minWidth: 180 }}
        />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {MEETING_FILTER_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => onFilterChange(opt.value)} style={{
              padding: "5px 10px", borderRadius: 5, cursor: "pointer", fontFamily: T.mono, fontSize: "10px", fontWeight: filter === opt.value ? 700 : 400,
              background: filter === opt.value ? C.blueDark : C.white,
              color:      filter === opt.value ? C.white : C.inkLight,
              border:     `1px solid ${filter === opt.value ? C.blueDark : C.line}`,
            }}>
              {opt.label}
            </button>
          ))}
        </div>
        {(search || filter !== "all") && (
          <button onClick={() => { onSearchChange(""); onFilterChange("all"); }} style={{ padding: "5px 10px", borderRadius: 5, cursor: "pointer", fontFamily: T.mono, fontSize: "10px", background: "none", border: `1px solid ${C.line}`, color: C.inkLight }}>
            Limpiar
          </button>
        )}
      </div>

      {/* Table header */}
      <div style={{ display: "grid", gridTemplateColumns: "16px 1.6fr 80px 120px 90px 60px 60px 110px", gap: S[2], padding: "6px 12px", background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
        {["", "KPI", "Conexión", "Fuente Operacional", "Certificación", "Neg", "SAG", "Acciones"].map(h => (
          <span key={h} style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, textTransform: "uppercase", fontWeight: 600 }}>{h}</span>
        ))}
      </div>

      {filteredRows.length === 0 && (
        <div style={{ padding: "32px", fontFamily: T.mono, fontSize: "11px", color: C.inkFaint, textAlign: "center" }}>
          No hay KPIs que coincidan con la búsqueda o filtro.
        </div>
      )}

      {filteredRows.map(row => (
        <MeetingRowFull
          key={row.id}
          row={row}
          orgSlug={orgSlug}
          rowSources={sourceMap.get(normalizeKpiKey(row.entityKey)) ?? []}
          onUpdate={onCertificationUpdate}
          onSourcesUpdated={onSourcesUpdated}
        />
      ))}

      {/* Export strip (Phase 9) */}
      <div style={{ marginTop: S[4], padding: "10px 14px", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 7, display: "flex", gap: S[2], alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, flex: 1 }}>Integration Build Sheet — exportar para construir integraciones</span>
        {[
          { label: "CSV", format: "integration-sheet-csv", mime: "text/csv", ext: "csv" },
          { label: "JSON", format: "integration-sheet-json", mime: "application/json", ext: "json" },
          { label: "Markdown", format: "integration-sheet-md", mime: "text/markdown", ext: "md" },
        ].map(({ label, format, ext }) => (
          <a key={format} href={`/api/orgs/${orgSlug}/operational-map/connection-audit?format=${format}`} download={`integration-build-sheet.${ext}`} style={{ padding: "5px 12px", borderRadius: 5, fontFamily: T.mono, fontSize: "10px", fontWeight: 600, background: C.blueDark, color: C.white, textDecoration: "none" }}>
            ↓ {label}
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Validation status badge ──────────────────────────────────────────────────

const VALIDATION_STATUS_CONFIG: Record<KpiSourceValidationStatus, { bg: string; color: string; label: string }> = {
  // Standard lifecycle
  suggested:                    { bg: C.surface,    color: C.inkLight,  label: "Sugerida" },
  assigned:                     { bg: C.amberLight, color: C.amberDark, label: "Asignada" },
  pending_existence_validation: { bg: "#fef3c7",    color: "#92400e",   label: "⚠ Pendiente validar" },
  exists_confirmed:             { bg: C.blueLight,  color: C.blueDark,  label: "Existe ✓" },
  fields_confirmed:             { bg: C.blueLight,  color: C.blue,      label: "Campos ✓" },
  query_confirmed:              { bg: C.blueLight,  color: C.blueDark,  label: "Query ✓" },
  sag_confirmed:                { bg: "#fdf4ff",    color: "#7c3aed",   label: "SAG ✓" },
  crm_confirmed:                { bg: "#eff6ff",    color: "#1d4ed8",   label: "CRM ✓" },
  business_confirmed:           { bg: C.greenLight, color: C.green,     label: "Neg ✓" },
  ready_for_integration:        { bg: "#d1fae5",    color: "#065f46",   label: "⭐ Lista integrar" },
  rejected:                     { bg: C.redLight,   color: C.red,       label: "Rechazada" },
  // Bootstrap / historical import
  historical_import:            { bg: C.surfaceAlt, color: C.inkLight,  label: "Historial CSV" },
  suggested_from_csv:           { bg: "#f0f9ff",    color: "#0369a1",   label: "Sugerida CSV" },
  pending_meeting_validation:   { bg: "#fef9c3",    color: "#854d0e",   label: "⏳ Validar reunión" },
  needs_source_confirmation:    { bg: C.amberLight, color: C.amberDark, label: "⚠ Confirmar fuente" },
  unresolved_mapping:           { bg: C.redLight,   color: C.red,       label: "Sin match" },
  // Certification statuses (AGENTIK-SAG-CERTIFICATION-FLOW-01)
  confirmed_with_dba:           { bg: "#ecfdf5",    color: "#059669",   label: "DBA ✓" },
  production_certified:         { bg: "#d1fae5",    color: "#065f46",   label: "Cert. Producción" },
  replaced:                     { bg: "#f5f3ff",    color: "#7c3aed",   label: "Reemplazada" },
  // Runtime detection statuses (AGENTIK-SAG-RUNTIME-SOURCE-HYDRATION-01)
  runtime_detected:             { bg: "#f0fdf4",    color: "#16a34a",   label: "Datos detectados" },
  connected_partial:            { bg: "#f0fdf4",    color: "#16a34a",   label: "Runtime activo" },
  snapshot_detected:            { bg: "#f0f9ff",    color: "#0284c7",   label: "Snapshot activo" },
  used_by_agentik:              { bg: "#faf5ff",    color: "#7c3aed",   label: "Usado por Agentik" },
};

function ValidationStatusBadge({ status }: { status: KpiSourceValidationStatus }) {
  const s = VALIDATION_STATUS_CONFIG[status] ?? VALIDATION_STATUS_CONFIG.suggested;
  return (
    <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 4,
      background: s.bg, color: s.color, fontFamily: T.mono, fontSize: "9px", fontWeight: 600, whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

// ─── Meeting Source Mapping Drawer ────────────────────────────────────────────

type DrawerTab = "fuentes" | "nueva" | "notas";

interface NewSourceFormState {
  sourceName:        string;
  provider:          string;
  sourceType:        string;
  sourceRole:        string;
  description:       string;
  tableName:         string;
  viewName:          string;
  endpoint:          string;
  moduleName:        string;
  approvedFields:    string;
  approvedFilters:   string;
  expectedFrequency: string;
  sourceOfTruth:     boolean;
  notes:             string;
  preset:            string;
}

const NEW_SOURCE_FORM_DEFAULT: NewSourceFormState = {
  sourceName: "", provider: "sag", sourceType: "table", sourceRole: "primary",
  description: "", tableName: "", viewName: "", endpoint: "", moduleName: "",
  approvedFields: "", approvedFilters: "", expectedFrequency: "daily",
  sourceOfTruth: false, notes: "", preset: "",
};

function MeetingSourceMappingDrawer({
  row, orgSlug, rowSources, onClose, onSourcesUpdated,
}: {
  row:              OperationalConnectionAuditRow;
  orgSlug:          string;
  rowSources:       KpiSourceRecord[];
  onClose:          () => void;
  onSourcesUpdated: () => void;
}) {
  const [tab,       setTab]       = useState<DrawerTab>("fuentes");
  const [form,      setForm]      = useState<NewSourceFormState>(NEW_SOURCE_FORM_DEFAULT);
  const [isPending, startTransition] = useTransition();
  const [error,     setError]     = useState<string | null>(null);
  const [success,   setSuccess]   = useState<string | null>(null);

  const inputStyle: React.CSSProperties = {
    width: "100%", fontFamily: T.mono, fontSize: "11px", padding: "5px 7px",
    border: `1px solid ${C.line}`, borderRadius: 4, background: C.white, color: C.ink,
    outline: "none", boxSizing: "border-box",
  };

  const showFeedback = useCallback((msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 2400);
  }, []);

  const applyPreset = useCallback((preset: SourcePreset) => {
    setForm(p => ({
      ...p,
      sourceName:     preset.label,
      sourceType:     preset.sourceType,
      provider:       preset.provider,
      tableName:      preset.tableName ?? "",
      approvedFields: preset.fields?.join(", ") ?? "",
      endpoint:       preset.endpoint ?? "",
      preset:         preset.name,
    }));
  }, []);

  // Apply a real SAG document-type source from the CSV catalog
  const applySagRealSource = useCallback((src: SagRealSource) => {
    const impacto = [
      src.impactaVentas ? `Ventas ${src.impactoVentasSigno ?? ""}`.trim() : null,
      src.impactaCobros ? `Cobros ${src.impactoCobrosSigno ?? ""}`.trim() : null,
    ].filter(Boolean).join(" · ");
    setForm(p => ({
      ...p,
      sourceName:     buildSagSourceName(src),
      sourceType:     "sag_document_type",
      provider:       "sag",
      sourceRole:     src.impactaVentas || src.impactaCobros ? "primary" : "secondary",
      description:    buildSagSourceDescription(src),
      tableName:      "",   // NOT the code — table must be confirmed by SAG DBA
      viewName:       "",
      endpoint:       "",
      moduleName:     "",
      approvedFields: "",
      notes:          impacto ? `Impacto: ${impacto}` : "",
      preset:         `sag_real_${src.codigoFuente}`,
    }));
  }, []);

  const handleAdd = useCallback(() => {
    if (!form.sourceName.trim()) { setError("Nombre de fuente requerido."); return; }
    setError(null);
    startTransition(async () => {
      try {
        // Determine validationStatus
        const hasLocation  = form.tableName || form.viewName || form.endpoint || form.moduleName;
        const isSagReal    = form.preset.startsWith("sag_real_");
        const isFreeText   = !form.preset && !hasLocation;
        const validationStatus: KpiSourceValidationStatus = isSagReal
          ? "suggested_from_csv"
          : isFreeText
          ? "pending_existence_validation"
          : hasLocation
          ? "assigned"
          : "suggested";

        const res = await fetch(`/api/orgs/${orgSlug}/operational-map/kpi-sources`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kpiKey:            row.entityKey,
            sourceName:        form.sourceName,
            sourceType:        form.sourceType,
            sourceRole:        form.sourceRole,
            provider:          form.provider,
            validationStatus,
            description:       form.description    || undefined,
            tableName:         form.tableName       || undefined,
            viewName:          form.viewName        || undefined,
            endpoint:          form.endpoint        || undefined,
            moduleName:        form.moduleName      || undefined,
            approvedFields:    form.approvedFields  ? form.approvedFields.split(",").map(f => f.trim()).filter(Boolean) : undefined,
            approvedFilters:   form.approvedFilters ? form.approvedFilters.split(",").map(f => f.trim()).filter(Boolean) : undefined,
            expectedFrequency: form.expectedFrequency || undefined,
            sourceOfTruth:     form.sourceOfTruth,
            notes:             form.notes || undefined,
          }),
        });
        const d = await res.json();
        if (!d.ok) { setError(d.error ?? "Error al guardar"); return; }
        setForm(NEW_SOURCE_FORM_DEFAULT);
        setTab("fuentes");
        showFeedback("Fuente agregada");
        onSourcesUpdated();
      } catch { setError("Error de red"); }
    });
  }, [form, orgSlug, row.entityKey, onSourcesUpdated, showFeedback]);

  const handleAction = useCallback((sourceId: string, action: KpiSourceAction, sourceName: string) => {
    startTransition(async () => {
      const res = await fetch(`/api/orgs/${orgSlug}/operational-map/kpi-sources`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sourceId, kpiKey: row.entityKey, action }),
      });
      const d = await res.json();
      if (d.ok) {
        showFeedback(`${sourceName} — ${action}`);
        onSourcesUpdated();
      }
    });
  }, [orgSlug, row.entityKey, onSourcesUpdated, showFeedback]);

  const handleDelete = useCallback((sourceId: string) => {
    startTransition(async () => {
      await fetch(`/api/orgs/${orgSlug}/operational-map/kpi-sources?id=${sourceId}&kpiKey=${row.entityKey}`, { method: "DELETE" });
      showFeedback("Fuente eliminada");
      onSourcesUpdated();
    });
  }, [orgSlug, row.entityKey, onSourcesUpdated, showFeedback]);

  const TABS: { id: DrawerTab; label: string }[] = [
    { id: "fuentes", label: "Vista Operacional" },
    { id: "nueva",   label: "Validar / Reemplazar" },
    { id: "notas",   label: "Notas reunión" },
  ];

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 250, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", background: "rgba(0,0,0,0.26)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: 600, maxWidth: "96vw", height: "100vh", background: C.white, borderLeft: `1px solid ${C.line}`, overflowY: "auto", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.line}`, background: C.surface }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>
                {row.domainLabel ?? row.domain} · {row.priority.toUpperCase()} · Certificación de Mapeo Operacional
              </div>
              <div style={{ fontFamily: T.mono, fontSize: "13px", fontWeight: 700, color: C.ink }}>{row.entityLabel}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                <HealthBadge health={row.connectionHealth} />
                <span style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight }}>
                  Fuente esperada: {row.sourceOfTruth}
                </span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkLight, fontSize: "20px", lineHeight: 1, padding: "0 4px" }}>×</button>
          </div>

          {/* Expected sources */}
          {row.expectedSources.length > 0 && (
            <div style={{ marginTop: 8, padding: "6px 10px", background: C.blueLight, border: `1px solid ${C.blueBorder}`, borderRadius: 5 }}>
              <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, textTransform: "uppercase", marginBottom: 4 }}>Fuentes esperadas (diseño)</div>
              {row.expectedSources.map((s, i) => (
                <div key={i} style={{ fontFamily: T.mono, fontSize: "10px", color: C.blue }}>→ {s}</div>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.line}` }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              background: "none", border: "none", cursor: "pointer", padding: "8px 14px",
              fontFamily: T.mono, fontSize: "11px",
              color:      tab === t.id ? C.blueDark : C.inkLight,
              fontWeight: tab === t.id ? 700 : 400,
              borderBottom: tab === t.id ? `2px solid ${C.blueDark}` : "2px solid transparent",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Feedback strip */}
        {success && (
          <div style={{ padding: "6px 18px", background: "#d1fae5", fontFamily: T.mono, fontSize: "10px", color: "#065f46" }}>
            ✓ {success}
          </div>
        )}

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* TAB: VISTA OPERACIONAL — multi-source governance lineage */}
          {tab === "fuentes" && (
            <>
              {/* ── Lineage view (new multisource governance renderer) ── */}
              <LineageView
                kpiKey={row.entityKey}
                entityLabel={row.entityLabel}
                compact={true}
              />

              {/* ── Section divider ── */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                <span style={{ fontFamily: T.mono, fontSize: 9, color: "var(--ink-faint)", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
                  Certificación de fuentes
                </span>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
              </div>

              {/* ── Runtime detection strip ── */}
              {(() => {
                const runtimeSources = rowSources.filter(s =>
                  s.validationStatus === "runtime_detected" ||
                  s.validationStatus === "connected_partial" ||
                  s.validationStatus === "snapshot_detected" ||
                  s.validationStatus === "used_by_agentik"
                );
                if (runtimeSources.length === 0) return null;
                return (
                  <div style={{ padding: "10px 12px", background: "#f0fdf4", border: `1px solid #86efac`, borderRadius: 7, marginBottom: 4 }}>
                    <div style={{ fontFamily: T.mono, fontSize: "9px", fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
                      AGENTIK está usando actualmente
                    </div>
                    {runtimeSources.map(src => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const lineage = src.runtimeLineage as any ?? null;
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const primary: any = lineage?.primarySagSource ?? null;
                      const hasCodeGroups = lineage?.sourceCodeGroups?.length > 0;
                      const resolved = resolvePrimaryOperationalSource(lineage);
                      return (
                        <div key={src.id} style={{ marginBottom: 6, padding: "8px 10px", background: C.white, borderRadius: 5, border: `1px solid #d1fae5` }}>

                          {/* Executive primary card */}
                          {resolved ? (() => {
                            const conf = getConfidenceLabel(resolved.confidence);
                            return (
                              <>
                                <div style={{ padding: "10px 12px", borderRadius: 6, background: "#f0fdf4", border: "1px solid #86efac", marginBottom: 8 }}>
                                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                                    <span style={{ fontFamily: T.mono, fontSize: "18px", fontWeight: 800, color: "#065f46", letterSpacing: "-0.02em", flexShrink: 0 }}>
                                      {resolved.primaryCode}
                                    </span>
                                    <span style={{ fontFamily: T.mono, fontSize: "11px", fontWeight: 700, color: "#15803d", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {resolved.primaryName}
                                    </span>
                                  </div>
                                  <div style={{ fontFamily: T.mono, fontSize: "9px", color: "#15803d", marginBottom: 7, opacity: 0.8 }}>
                                    Fuente operacional principal detectada automáticamente
                                  </div>
                                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                                    <span style={{ fontFamily: T.mono, fontSize: "9px", color: "#065f46", fontWeight: 700 }}>
                                      {resolved.primaryRowCount.toLocaleString()} registros
                                    </span>
                                    <span style={{ fontFamily: T.mono, fontSize: "9px", padding: "1px 6px", borderRadius: 3,
                                      background: resolved.primaryType === "OFICIAL" ? "#d1fae5" : "#fef3c7",
                                      color:      resolved.primaryType === "OFICIAL" ? "#065f46"  : "#92400e",
                                      fontWeight: 700 }}>
                                      {resolved.primaryType === "OFICIAL" ? "Oficial" : resolved.primaryType}
                                    </span>
                                    {resolved.ventasSigno && (
                                      <span style={{ fontFamily: T.mono, fontSize: "9px", padding: "1px 6px", borderRadius: 3, background: "#d1fae5", color: "#15803d", fontWeight: 700 }}>
                                        Ventas {resolved.ventasSigno}
                                      </span>
                                    )}
                                    {resolved.cobrosSigno && (
                                      <span style={{ fontFamily: T.mono, fontSize: "9px", padding: "1px 6px", borderRadius: 3, background: "#eff6ff", color: C.blueDark, fontWeight: 700 }}>
                                        Cobros {resolved.cobrosSigno}
                                      </span>
                                    )}
                                    {resolved.primaryFuente !== "unknown" && (
                                      <span style={{ fontFamily: T.mono, fontSize: "9px", padding: "1px 6px", borderRadius: 3, background: "#eff6ff", color: C.blueDark, fontWeight: 700 }}>
                                        SAG {resolved.primaryFuente}
                                      </span>
                                    )}
                                    <span style={{ fontFamily: T.mono, fontSize: "9px", padding: "1px 6px", borderRadius: 3, background: conf.bg, color: conf.color, fontWeight: 600 }}>
                                      {conf.label}
                                    </span>
                                  </div>
                                </div>

                                {/* Narrative */}
                                <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkMid, lineHeight: 1.5, marginBottom: 8, padding: "0 2px" }}>
                                  {buildOperationalNarrative(resolved)}
                                </div>

                                {/* Secondary sources */}
                                {resolved.secondarySources.length > 0 && (
                                  <details style={{ marginBottom: 8 }}>
                                    <summary style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, cursor: "pointer", userSelect: "none", padding: "2px 0" }}>
                                      Otras fuentes detectadas ({resolved.secondarySources.length})
                                    </summary>
                                    <div style={{ marginTop: 4 }}>
                                      {resolved.secondarySources.map(s => (
                                        <div key={s.code} style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "2px 0", borderBottom: `1px solid #f0fdf4` }}>
                                          <span style={{ fontFamily: T.mono, fontSize: "10px", fontWeight: 700, color: C.inkMid, minWidth: 24 }}>{s.code}</span>
                                          <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkLight, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                                          <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, whiteSpace: "nowrap" }}>{s.rowCount.toLocaleString()}</span>
                                          <span style={{ fontFamily: T.mono, fontSize: "8px", padding: "1px 4px", borderRadius: 3,
                                            background: s.type === "OFICIAL" ? "#d1fae5" : "#fef3c7",
                                            color:      s.type === "OFICIAL" ? "#065f46"  : "#92400e",
                                            fontWeight: 600 }}>
                                            {s.type === "OFICIAL" ? "F1" : "F2"}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                )}
                              </>
                            );
                          })() : primary?.unresolved ? (
                            <div style={{ marginBottom: 6, padding: "6px 8px", background: "#fff7ed", borderRadius: 4, border: "1px solid #fed7aa" }}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                                <span style={{ fontFamily: T.mono, fontSize: "9px", fontWeight: 700, color: "#92400e", padding: "1px 5px", background: "#fef3c7", borderRadius: 3 }}>
                                  Código SAG: sin clasificación en catálogo
                                </span>
                                <ValidationStatusBadge status={src.validationStatus} />
                              </div>
                              <div style={{ fontFamily: T.mono, fontSize: "9px", color: "#92400e" }}>{primary.unresolvedReason}</div>
                              {primary.codesFound?.length > 0 && (
                                <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkLight, marginTop: 2 }}>
                                  Códigos encontrados: <b>{primary.codesFound.join(", ")}</b>
                                </div>
                              )}
                            </div>
                          ) : hasCodeGroups ? (
                            <div style={{ marginBottom: 6 }}>
                              <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                                Fuentes SAG detectadas
                              </div>
                              {lineage.sourceCodeGroups.slice(0, 6).map((g: { code: string; rowCount: number; sagSourceType: string; catalogMatch: { nombreFuente: string; clasificacion: string; impactoVentasSigno?: string | null } | null }) => (
                                <div key={g.code} style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "3px 0", borderBottom: `1px solid #f0fdf4` }}>
                                  <span style={{ fontFamily: T.mono, fontSize: "12px", fontWeight: 700, color: "#15803d", minWidth: 28 }}>{g.code}</span>
                                  <span style={{ fontFamily: T.mono, fontSize: "10px", color: C.ink, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {g.catalogMatch?.nombreFuente ?? "Pendiente clasificar"}
                                  </span>
                                  <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, whiteSpace: "nowrap" }}>{g.rowCount.toLocaleString()} filas</span>
                                  <span style={{ fontFamily: T.mono, fontSize: "9px", padding: "1px 5px", borderRadius: 3,
                                    background: g.sagSourceType === "OFICIAL" ? "#d1fae5" : "#fef3c7",
                                    color:      g.sagSourceType === "OFICIAL" ? "#065f46"  : "#92400e",
                                    whiteSpace: "nowrap", fontWeight: 700 }}>
                                    {g.sagSourceType === "OFICIAL" ? "F1" : "F2"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div style={{ marginBottom: 6 }}>
                              {src.provider === "sag" ? (
                                <>
                                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                                    <span style={{ fontFamily: T.mono, fontSize: "9px", fontWeight: 700, color: "#92400e", padding: "1px 5px", background: "#fef3c7", borderRadius: 3 }}>
                                      Fuente SAG pendiente sincronizar
                                    </span>
                                    <ValidationStatusBadge status={src.validationStatus} />
                                  </div>
                                  {src.runtimeRowCount != null && src.runtimeRowCount > 0 && (
                                    <div style={{ fontFamily: T.mono, fontSize: "9px", color: "#15803d" }}>
                                      {src.runtimeRowCount.toLocaleString()} registros detectados en SAG
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                                    <span style={{ fontFamily: T.mono, fontSize: "9px", fontWeight: 600, color: C.inkFaint, padding: "1px 5px", background: "#f8fafc", border: "1px solid " + C.line, borderRadius: 3 }}>
                                      {(PROVIDER_LABELS[src.provider] ?? src.provider)} — sin código SAG
                                    </span>
                                    <ValidationStatusBadge status={src.validationStatus} />
                                  </div>
                                  {src.runtimeRowCount != null && src.runtimeRowCount > 0 && (
                                    <div style={{ fontFamily: T.mono, fontSize: "9px", color: "#15803d", marginTop: 2 }}>
                                      {src.runtimeRowCount.toLocaleString()} registros detectados
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}

                          {/* Action buttons */}
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8, paddingTop: 6, borderTop: `1px solid #d1fae5` }}>
                            {src.validationStatus !== "confirmed_with_dba" && src.validationStatus !== "production_certified" && src.validationStatus !== "rejected" && src.validationStatus !== "replaced" && (
                              <button onClick={() => handleAction(src.id, "confirm_dba", src.sourceName)} disabled={isPending}
                                style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "#ecfdf5", color: "#059669", border: "1px solid #6ee7b7", fontWeight: 700 }}>
                                DBA ✓
                              </button>
                            )}
                            {src.validationStatus !== "sag_confirmed" && src.validationStatus !== "ready_for_integration" && src.validationStatus !== "production_certified" && (
                              <button onClick={() => handleAction(src.id, "confirm_sag", src.sourceName)} disabled={isPending}
                                style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "#fdf4ff", color: "#7c3aed", border: "1px solid #e9d5ff", fontWeight: 700 }}>
                                SAG ✓
                              </button>
                            )}
                            {src.validationStatus !== "business_confirmed" && src.validationStatus !== "production_certified" && (
                              <button onClick={() => handleAction(src.id, "confirm_business", src.sourceName)} disabled={isPending}
                                style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: C.greenLight, color: C.green, border: `1px solid ${C.greenBorder}`, fontWeight: 700 }}>
                                Neg ✓
                              </button>
                            )}
                            {src.validationStatus === "confirmed_with_dba" && (
                              <button onClick={() => handleAction(src.id, "certify_production", src.sourceName)} disabled={isPending}
                                style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "#d1fae5", color: "#065f46", border: "1px solid #a7f3d0", fontWeight: 700 }}>
                                Cert. Prod ✓
                              </button>
                            )}
                            {src.validationStatus !== "rejected" && src.validationStatus !== "replaced" && src.validationStatus !== "production_certified" && (
                              <button onClick={() => handleAction(src.id, "reject", src.sourceName)} disabled={isPending}
                                style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "none", color: C.red, border: `1px solid ${C.redBorder}` }}>
                                Rechazar
                              </button>
                            )}
                          </div>

                          {/* Technical details */}
                          <details style={{ marginTop: 6 }}>
                            <summary style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, cursor: "pointer", userSelect: "none", padding: "2px 0" }}>
                              Detalle técnico
                            </summary>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", margin: "5px 0", padding: "6px 8px", background: "#f8fafc", borderRadius: 4 }}>
                              <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                                Modelo: <span style={{ color: C.ink, fontWeight: 700 }}>{lineage?.runtimeModel ?? src.moduleName ?? "—"}</span>
                              </div>
                              <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                                Proveedor: <span style={{ color: C.ink, fontWeight: 700 }}>{src.provider}</span>
                              </div>
                              <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                                Filas: <span style={{ color: C.ink, fontWeight: 700 }}>{(src.runtimeRowCount ?? lineage?.rowCount ?? 0).toLocaleString()}</span>
                              </div>
                              {lineage?.fuente && lineage.fuente !== "unknown" && (
                                <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                                  Fuente SAG: <span style={{ color: "#15803d", fontWeight: 700 }}>{lineage.fuente}</span>
                                </div>
                              )}
                              {lineage?.dateRange?.earliest && (
                                <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                                  Período: <span style={{ color: C.ink }}>{lineage.dateRange.earliest.slice(0,10)} → {lineage.dateRange.latest?.slice(0,10) ?? "hoy"}</span>
                                </div>
                              )}
                              {src.runtimeLastSyncAt && (
                                <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                                  Último sync: <span style={{ color: C.ink }}>{new Date(src.runtimeLastSyncAt).toLocaleDateString("es-CO")}</span>
                                </div>
                              )}
                              {src.runtimeConfidence != null && (
                                <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                                  Confianza lineage: <span style={{ color: C.ink }}>{lineage?.confidence ?? src.runtimeConfidence}%</span>
                                </div>
                              )}
                            </div>
                            {lineage?.batches?.length > 0 && (
                              <div style={{ marginTop: 4 }}>
                                <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, textTransform: "uppercase", marginBottom: 3 }}>Lotes importados</div>
                                {lineage.batches.slice(0, 3).map((b: { id: string; fileName: string | null; importedAt: string; rowCount: number; status: string; scopeKey: string }) => (
                                  <div key={b.id} style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkLight, marginBottom: 2 }}>
                                    · {b.fileName ?? `Lote ${b.scopeKey}`} — {b.rowCount.toLocaleString()} filas — {new Date(b.importedAt).toLocaleDateString("es-CO")} — {b.status}
                                  </div>
                                ))}
                              </div>
                            )}
                            {lineage?.missingConfirmations?.length > 0 && (
                              <div style={{ marginTop: 4, padding: "4px 6px", background: "#fff7ed", borderRadius: 4, border: "1px solid #fed7aa" }}>
                                {lineage.missingConfirmations.map((m: string, i: number) => (
                                  <div key={i} style={{ fontFamily: T.mono, fontSize: "9px", color: "#c2410c" }}>⚠ {m}</div>
                                ))}
                              </div>
                            )}
                            <div style={{ fontFamily: T.mono, fontSize: "9px", padding: "4px 8px", background: C.surface, borderRadius: 4, color: C.inkFaint, marginTop: 4, border: `1px solid ${C.line}` }}>
                              Pendiente validación DBA para conexión ODBC directa. Query confirmada tras aprobación SAG.
                            </div>
                          </details>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ── CSV hypothesis sources ── */}
              {(() => {
                const csvSources = rowSources.filter(s =>
                  s.bootstrapBatchId &&
                  s.validationStatus !== "runtime_detected" &&
                  s.validationStatus !== "connected_partial" &&
                  s.validationStatus !== "snapshot_detected" &&
                  s.validationStatus !== "used_by_agentik"
                );
                if (csvSources.length === 0) return null;
                return (
                  <div style={{ padding: "6px 10px", background: "#eff6ff", border: `1px solid #bfdbfe`, borderRadius: 6, marginBottom: 4 }}>
                    <div style={{ fontFamily: T.mono, fontSize: "9px", fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 2 }}>
                      Hipótesis CSV ({csvSources.length})
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {csvSources.map(s => {
                        const meta = s.bootstrapMetadata as { sagCode?: string } | null;
                        return (
                          <span key={s.id} style={{ fontFamily: T.mono, fontSize: "9px", padding: "1px 6px", borderRadius: 3, background: C.white, border: `1px solid #bfdbfe`, color: "#1d4ed8", fontWeight: 600 }}>
                            {meta?.sagCode ?? s.sourceName}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {rowSources.length === 0 && (
                <div style={{ padding: "24px", fontFamily: T.mono, fontSize: "11px", color: C.inkFaint, textAlign: "center", border: `1px dashed ${C.line}`, borderRadius: 7 }}>
                  Sin fuentes asignadas.<br />
                  <button onClick={() => setTab("nueva")} style={{ marginTop: 8, padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontFamily: T.mono, fontSize: "11px", fontWeight: 700, background: C.blueDark, color: C.white, border: "none" }}>
                    + Agregar primera fuente
                  </button>
                </div>
              )}
              {rowSources.map(src => {
                // Runtime sources are shown in the "Fuente actualmente usada por Agentik" section
                // above — render compactly here to avoid duplicating model-internal names.
                const isRuntimeSrc =
                  src.validationStatus === "runtime_detected" ||
                  src.validationStatus === "connected_partial" ||
                  src.validationStatus === "snapshot_detected" ||
                  src.validationStatus === "used_by_agentik";
                if (isRuntimeSrc) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const lin = src.runtimeLineage as any ?? null;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const prim: any = lin?.primarySagSource ?? null;
                  const topGroup = lin?.sourceCodeGroups?.[0] ?? null;
                  const displayName = prim && !prim.unresolved
                    ? `${prim.code} — ${prim.sourceName}`
                    : topGroup
                      ? `${topGroup.code} — ${topGroup.catalogMatch?.nombreFuente ?? topGroup.code}`
                      : (lin?.runtimeModel ?? src.moduleName ?? src.sourceName);
                  return (
                    <div key={src.id} style={{ padding: "5px 10px", border: "1px solid #d1fae5", borderRadius: 6, background: "#f9fefb", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontFamily: T.mono, fontSize: "9px", color: "#16a34a", fontWeight: 700 }}>{displayName}</div>
                        <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                          Datos SAG activos{src.runtimeRowCount != null && src.runtimeRowCount > 0 ? ` · ${src.runtimeRowCount.toLocaleString()} filas` : ""} · ver detalle ↑
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                        {src.validationStatus !== "confirmed_with_dba" && src.validationStatus !== "production_certified" && src.validationStatus !== "rejected" && (
                          <button onClick={() => handleAction(src.id, "confirm_dba", src.sourceName)} disabled={isPending}
                            style={{ padding: "2px 7px", borderRadius: 3, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "#ecfdf5", color: "#059669", border: "1px solid #6ee7b7", fontWeight: 700 }}>
                            DBA ✓
                          </button>
                        )}
                        {src.validationStatus === "confirmed_with_dba" && (
                          <button onClick={() => handleAction(src.id, "certify_production", src.sourceName)} disabled={isPending}
                            style={{ padding: "2px 7px", borderRadius: 3, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "#d1fae5", color: "#065f46", border: "1px solid #a7f3d0", fontWeight: 700 }}>
                            Cert. Prod ✓
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }
                return (
                <div key={src.id} style={{
                  padding: "10px 12px", border: `1px solid ${src.sourceOfTruth ? "#86efac" : C.line}`,
                  borderRadius: 7, background: src.sourceOfTruth ? "#f0fdf4" : C.white,
                  borderLeft: `3px solid ${src.validationStatus === "rejected" ? C.red : src.validationStatus === "ready_for_integration" ? "#10b981" : src.validationStatus === "pending_existence_validation" ? "#f59e0b" : C.line}`,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 3 }}>
                        <span style={{ fontFamily: T.mono, fontSize: "11px", fontWeight: 700, color: C.ink }}>{src.sourceName}</span>
                        {src.sourceOfTruth && <span style={{ fontFamily: T.mono, fontSize: "9px", padding: "1px 5px", borderRadius: 3, background: "#d1fae5", color: "#065f46", fontWeight: 700 }}>⭐ SoT</span>}
                        <ValidationStatusBadge status={src.validationStatus} />
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 4 }}>
                        {PROVIDER_LABELS[src.provider] ?? src.provider} · {src.sourceRole} · {src.sourceType}
                      </div>
                      {(src.tableName || src.viewName || src.endpoint || src.moduleName) && (
                        <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.blue, marginBottom: 3 }}>
                          {src.tableName  && `${src.sourceType === "sag_document_type" ? "Tabla SAG (TBC): " : "Tabla: "}${src.tableName}`}
                          {src.viewName   && ` Vista: ${src.viewName}`}
                          {src.endpoint   && ` API: ${src.endpoint}`}
                          {src.moduleName && ` Módulo: ${src.moduleName}`}
                        </div>
                      )}
                      {src.description && (
                        <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkMid, marginBottom: 3 }}>{src.description}</div>
                      )}
                      {(src.approvedFields as string[] | null)?.length ? (
                        <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                          Campos: {(src.approvedFields as string[]).join(", ")}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* ORIGEN HISTÓRICO — bootstrap provenance */}
                  {src.bootstrapBatchId && (() => {
                    const meta = src.bootstrapMetadata as import("@/lib/operational-map/certification/operational-kpi-source-service").BootstrapMetadata | null;
                    if (!meta) return null;
                    return (
                      <div style={{ marginTop: 8, padding: "6px 8px", background: "#f8faff", border: `1px solid #dbeafe`, borderRadius: 5 }}>
                        <div style={{ fontFamily: T.mono, fontSize: "9px", fontWeight: 700, color: "#1d4ed8", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Origen histórico CSV
                        </div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkLight }}>
                            Código SAG: <b>{meta.sagCode}</b> (ID {meta.sagId})
                          </span>
                          <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkLight }}>
                            Clasificación: <b>{meta.classification}</b>
                          </span>
                          {meta.tipo && (
                            <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkLight }}>
                              Tipo: <b>{meta.tipo}</b>
                            </span>
                          )}
                          <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkLight }}>
                            Match: <b>{meta.matchType}</b> ({Math.round(meta.matchConfidence * 100)}%)
                          </span>
                          {meta.unresolvedFields && meta.unresolvedFields.length > 0 && (
                            <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.amber }}>
                              Sin resolver: {meta.unresolvedFields.join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Action row */}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
                    {!src.sourceOfTruth && (
                      <button onClick={() => handleAction(src.id, "mark_sot", src.sourceName)} disabled={isPending}
                        style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "#fefce8", color: "#a16207", border: "1px solid #fde68a", fontWeight: 600 }}>
                        ⭐ SoT
                      </button>
                    )}
                    {src.validationStatus !== "sag_confirmed" && src.validationStatus !== "ready_for_integration" && (
                      <button onClick={() => handleAction(src.id, "confirm_sag", src.sourceName)} disabled={isPending}
                        style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "#fdf4ff", color: "#7c3aed", border: "1px solid #e9d5ff", fontWeight: 600 }}>
                        SAG ✓
                      </button>
                    )}
                    {src.validationStatus !== "crm_confirmed" && src.validationStatus !== "ready_for_integration" && (
                      <button onClick={() => handleAction(src.id, "confirm_crm", src.sourceName)} disabled={isPending}
                        style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", fontWeight: 600 }}>
                        CRM ✓
                      </button>
                    )}
                    {src.validationStatus !== "business_confirmed" && src.validationStatus !== "ready_for_integration" && (
                      <button onClick={() => handleAction(src.id, "confirm_business", src.sourceName)} disabled={isPending}
                        style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: C.greenLight, color: C.green, border: `1px solid ${C.greenBorder}`, fontWeight: 600 }}>
                        Neg ✓
                      </button>
                    )}
                    {src.validationStatus === "pending_existence_validation" && (
                      <button onClick={() => handleAction(src.id, "confirm_exists", src.sourceName)} disabled={isPending}
                        style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: C.blueLight, color: C.blueDark, border: `1px solid ${C.blueBorder}`, fontWeight: 600 }}>
                        Existe ✓
                      </button>
                    )}
                    {src.validationStatus !== "confirmed_with_dba" && src.validationStatus !== "production_certified" && src.validationStatus !== "rejected" && src.validationStatus !== "replaced" && (
                      <button onClick={() => handleAction(src.id, "confirm_dba", src.sourceName)} disabled={isPending}
                        style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "#ecfdf5", color: "#059669", border: "1px solid #6ee7b7", fontWeight: 600 }}>
                        DBA ✓
                      </button>
                    )}
                    {src.validationStatus === "confirmed_with_dba" && (
                      <button onClick={() => handleAction(src.id, "certify_production", src.sourceName)} disabled={isPending}
                        style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "#d1fae5", color: "#065f46", border: "1px solid #a7f3d0", fontWeight: 700 }}>
                        Cert. Prod ✓
                      </button>
                    )}
                    {src.validationStatus !== "ready_for_integration" && src.validationStatus !== "confirmed_with_dba" && src.validationStatus !== "production_certified" && (
                      <button onClick={() => handleAction(src.id, "mark_ready", src.sourceName)} disabled={isPending}
                        style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "#d1fae5", color: "#065f46", border: "1px solid #6ee7b7", fontWeight: 600 }}>
                        Lista ✓
                      </button>
                    )}
                    {src.validationStatus !== "rejected" && src.validationStatus !== "replaced" && src.validationStatus !== "production_certified" && (
                      <button onClick={() => handleAction(src.id, "reject", src.sourceName)} disabled={isPending}
                        style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "none", color: C.red, border: `1px solid ${C.redBorder}` }}>
                        Rechazar
                      </button>
                    )}
                    <button onClick={() => handleDelete(src.id)} disabled={isPending}
                      style={{ padding: "2px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "none", color: C.inkLight, border: `1px solid ${C.line}` }}>
                      Eliminar
                    </button>
                  </div>

                  {src.notes && (
                    <div style={{ marginTop: 6, fontFamily: T.mono, fontSize: "10px", color: C.inkFaint, fontStyle: "italic" }}>
                      Nota: {src.notes}
                    </div>
                  )}
                </div>
              ); })}

              <button onClick={() => setTab("nueva")} style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: 5, cursor: "pointer", fontFamily: T.mono, fontSize: "11px", fontWeight: 700, background: C.blueDark, color: C.white, border: "none" }}>
                + Agregar fuente
              </button>
            </>
          )}

          {/* TAB: NUEVA FUENTE */}
          {tab === "nueva" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

              {/* ── SAG Real Source Catalog (from CSV) ── */}
              <div style={{ border: `1px solid #dbeafe`, borderRadius: 7, overflow: "hidden" }}>
                <div style={{ padding: "7px 10px", background: "#eff6ff", borderBottom: `1px solid #dbeafe`, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontFamily: T.mono, fontSize: "9px", fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Fuentes SAG — Catálogo real (CSV histórico)
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: "9px", color: "#93c5fd" }}>·</span>
                  <span style={{ fontFamily: T.mono, fontSize: "9px", color: "#3b82f6" }}>
                    Selecciona para pre-cargar. Tabla SAG real pendiente confirmar con DBA.
                  </span>
                </div>
                <div style={{ padding: "8px 10px", maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                  {SAG_REAL_GROUPS.map(group => (
                    <div key={group.label}>
                      <div style={{ fontFamily: T.mono, fontSize: "8px", color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>
                        {group.label}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                        {group.sources.map(src => {
                          const key      = `sag_real_${src.codigoFuente}`;
                          const isActive = form.preset === key;
                          const impacto  = src.impactaVentas
                            ? `Ventas ${src.impactoVentasSigno ?? ""}`
                            : src.impactaCobros
                            ? `Cobros ${src.impactoCobrosSigno ?? ""}`
                            : null;
                          return (
                            <button key={src.codigoFuente} onClick={() => applySagRealSource(src)} style={{
                              padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                              fontFamily: T.mono, fontSize: "9px",
                              background: isActive ? "#dbeafe" : C.white,
                              color:      isActive ? "#1d4ed8" : C.inkMid,
                              border:     `1px solid ${isActive ? "#3b82f6" : C.line}`,
                              fontWeight: isActive ? 700 : 400,
                              display: "flex", gap: 5, alignItems: "center",
                            }}>
                              <span style={{ fontWeight: 700, color: isActive ? "#1d4ed8" : "#374151" }}>{src.codigoFuente}</span>
                              <span style={{ color: C.inkLight, fontSize: "8px" }}>·</span>
                              <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {src.nombreFuente}
                              </span>
                              {impacto && (
                                <span style={{
                                  fontSize: "8px", padding: "0 4px", borderRadius: 2,
                                  background: src.impactaVentas ? "#f0fdf4" : "#eff6ff",
                                  color:      src.impactaVentas ? "#15803d" : "#1d4ed8",
                                  fontWeight: 600,
                                }}>
                                  {impacto}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Otros presets (fallback) ── */}
              <details style={{ border: `1px solid ${C.line}`, borderRadius: 7, overflow: "hidden" }}>
                <summary style={{ padding: "7px 10px", cursor: "pointer", fontFamily: T.mono, fontSize: "9px", color: C.inkLight, background: C.surface, userSelect: "none" }}>
                  Otros presets (CRM, Agentik, Banco, Shopify)
                </summary>
                <div style={{ padding: "8px 10px" }}>
                  {Object.entries(SOURCE_PRESETS_BY_PROVIDER).filter(([p]) => p !== "sag").map(([prov, presets]) => (
                    <div key={prov} style={{ marginBottom: 6 }}>
                      <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{PROVIDER_LABELS[prov]}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {presets.map(preset => (
                          <button key={preset.name} onClick={() => applyPreset(preset)} style={{
                            padding: "3px 8px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px",
                            background: form.preset === preset.name ? C.blueLight : C.white,
                            color:      form.preset === preset.name ? C.blueDark : C.inkMid,
                            border:     `1px solid ${form.preset === preset.name ? C.blueDark : C.line}`,
                            fontWeight: form.preset === preset.name ? 700 : 400,
                          }}>
                            {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>

              <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                Si la fuente no está en el catálogo, escribe libremente abajo. Quedará como <strong>Pendiente validar existencia</strong>.
              </div>

              <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
                <div style={{ fontFamily: T.mono, fontSize: "10px", fontWeight: 700, color: C.ink, marginBottom: 8 }}>Detalles de la fuente</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Nombre de fuente *</div>
                    <input type="text" value={form.sourceName} onChange={e => setForm(p => ({ ...p, sourceName: e.target.value }))} style={inputStyle} placeholder="Ej: SAG PEDIDOS — DOCPED" />
                  </div>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Proveedor</div>
                    <select value={form.provider} onChange={e => setForm(p => ({ ...p, provider: e.target.value, preset: "" }))} style={inputStyle}>
                      {Object.entries(PROVIDER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Rol</div>
                    <select value={form.sourceRole} onChange={e => setForm(p => ({ ...p, sourceRole: e.target.value }))} style={inputStyle}>
                      <option value="primary">Primaria</option>
                      <option value="secondary">Secundaria</option>
                      <option value="fallback">Fallback</option>
                      <option value="calculated">Calculada</option>
                      <option value="hybrid">Híbrida</option>
                    </select>
                  </div>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Tipo</div>
                    <select value={form.sourceType} onChange={e => setForm(p => ({ ...p, sourceType: e.target.value }))} style={inputStyle}>
                      <optgroup label="SAG — Tipo documento">
                        <option value="sag_document_type">sag_document_type (código fuente SAG)</option>
                        <option value="sag_table">sag_table (tabla confirmada por DBA)</option>
                        <option value="sag_view">sag_view (vista SAG)</option>
                        <option value="sag_query">sag_query (query SAG)</option>
                      </optgroup>
                      <optgroup label="Otros">
                        {["table","view","api","query","module","file","engine","custom","document_type"].map(v => <option key={v} value={v}>{v}</option>)}
                      </optgroup>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Descripción</div>
                  <textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} style={{ ...inputStyle, resize: "vertical" }} placeholder="Describe qué contiene esta fuente y cómo se usa..." />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Tabla</div>
                    <input type="text" value={form.tableName} onChange={e => setForm(p => ({ ...p, tableName: e.target.value }))} style={inputStyle} placeholder="Ej: DOCPED" />
                  </div>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Vista</div>
                    <input type="text" value={form.viewName} onChange={e => setForm(p => ({ ...p, viewName: e.target.value }))} style={inputStyle} placeholder="Ej: VW_PEDIDOS_DIA" />
                  </div>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>API / Endpoint</div>
                    <input type="text" value={form.endpoint} onChange={e => setForm(p => ({ ...p, endpoint: e.target.value }))} style={inputStyle} placeholder="Ej: /api/v8/AOS_Quotes" />
                  </div>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Módulo</div>
                    <input type="text" value={form.moduleName} onChange={e => setForm(p => ({ ...p, moduleName: e.target.value }))} style={inputStyle} placeholder="Ej: AOS_Quotes" />
                  </div>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Campos sugeridos (separados por coma)</div>
                  <input type="text" value={form.approvedFields} onChange={e => setForm(p => ({ ...p, approvedFields: e.target.value }))} style={inputStyle} placeholder="Ej: NIT, FECHA, VALOR_TOTAL" />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Filtros sugeridos (separados por coma)</div>
                  <input type="text" value={form.approvedFilters} onChange={e => setForm(p => ({ ...p, approvedFilters: e.target.value }))} style={inputStyle} placeholder="Ej: ESTADO=ACTIVO, EMPRESA=001" />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Frecuencia esperada</div>
                    <select value={form.expectedFrequency} onChange={e => setForm(p => ({ ...p, expectedFrequency: e.target.value }))} style={inputStyle}>
                      <option value="realtime">Tiempo real</option>
                      <option value="daily">Diario</option>
                      <option value="weekly">Semanal</option>
                      <option value="monthly">Mensual</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: T.mono, fontSize: "10px", color: C.inkLight, cursor: "pointer", paddingBottom: 6 }}>
                      <input type="checkbox" checked={form.sourceOfTruth} onChange={e => setForm(p => ({ ...p, sourceOfTruth: e.target.checked }))} />
                      Marcar como Source of Truth
                    </label>
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Notas de reunión</div>
                  <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={inputStyle} placeholder="Contexto, pendientes, bloqueadores..." />
                </div>

                {/* Validation status preview */}
                {(() => {
                  const hasLoc       = form.tableName || form.viewName || form.endpoint || form.moduleName;
                  const isSagReal    = form.preset.startsWith("sag_real_");
                  const isFree       = !form.preset && !hasLoc;
                  const status: KpiSourceValidationStatus = isSagReal
                    ? "suggested_from_csv"
                    : isFree
                    ? "pending_existence_validation"
                    : hasLoc
                    ? "assigned"
                    : "suggested";
                  return (
                    <div style={{ padding: "6px 10px", background: C.surface, borderRadius: 5, border: `1px solid ${C.line}`, marginBottom: 10 }}>
                      <span style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight }}>Estado que se asignará: </span>
                      <ValidationStatusBadge status={status} />
                      {isSagReal && <span style={{ fontFamily: T.mono, fontSize: "9px", color: "#1d4ed8", marginLeft: 6 }}>Fuente real del CSV SAG — tabla pendiente confirmar con DBA</span>}
                      {isFree    && <span style={{ fontFamily: T.mono, fontSize: "9px", color: "#92400e", marginLeft: 6 }}>Claude/Agentik deberá validar si existe</span>}
                    </div>
                  );
                })()}

                {error && <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.red, marginBottom: 8 }}>{error}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleAdd} disabled={isPending} style={{
                    padding: "7px 16px", borderRadius: 5, cursor: "pointer", fontFamily: T.mono, fontSize: "11px",
                    fontWeight: 700, background: C.blueDark, color: C.white, border: "none", opacity: isPending ? 0.6 : 1,
                  }}>
                    {isPending ? "Guardando…" : "Guardar fuente"}
                  </button>
                  <button onClick={() => { setForm(NEW_SOURCE_FORM_DEFAULT); setError(null); }} style={{
                    padding: "7px 12px", borderRadius: 5, cursor: "pointer", fontFamily: T.mono, fontSize: "11px",
                    background: "none", border: `1px solid ${C.line}`, color: C.inkLight,
                  }}>
                    Limpiar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: NOTAS REUNIÓN */}
          {tab === "notas" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontFamily: T.mono, fontSize: "11px", color: C.ink, marginBottom: 4 }}>Notas por fuente asignada</div>
              {rowSources.length === 0 && (
                <div style={{ fontFamily: T.mono, fontSize: "11px", color: C.inkFaint }}>No hay fuentes asignadas todavía.</div>
              )}
              {rowSources.map(src => (
                <NoteEditor key={src.id} src={src} orgSlug={orgSlug} kpiKey={row.entityKey} onSaved={onSourcesUpdated} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NoteEditor({ src, orgSlug, kpiKey, onSaved }: {
  src:      KpiSourceRecord;
  orgSlug:  string;
  kpiKey:   string;
  onSaved:  () => void;
}) {
  const [note,      setNote]      = useState(src.notes ?? "");
  const [isPending, startTransition] = useTransition();

  const handleSave = useCallback(() => {
    startTransition(async () => {
      await fetch(`/api/orgs/${orgSlug}/operational-map/kpi-sources`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: src.id, kpiKey, notes: note }),
      });
      onSaved();
    });
  }, [note, src.id, kpiKey, orgSlug, onSaved]);

  return (
    <div style={{ padding: "10px 12px", border: `1px solid ${C.line}`, borderRadius: 6 }}>
      <div style={{ fontFamily: T.mono, fontSize: "11px", fontWeight: 700, color: C.ink, marginBottom: 6 }}>{src.sourceName}</div>
      <textarea
        rows={3} value={note} onChange={e => setNote(e.target.value)}
        style={{ width: "100%", fontFamily: T.mono, fontSize: "11px", padding: "5px 7px", border: `1px solid ${C.line}`, borderRadius: 4, background: C.white, color: C.ink, outline: "none", boxSizing: "border-box", resize: "vertical" }}
        placeholder="Notas de la reunión para esta fuente..."
      />
      <button onClick={handleSave} disabled={isPending || note === src.notes} style={{
        marginTop: 6, padding: "5px 12px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "10px",
        fontWeight: 700, background: C.blueDark, color: C.white, border: "none", opacity: isPending ? 0.6 : 1,
      }}>
        {isPending ? "Guardando…" : "Guardar nota"}
      </button>
    </div>
  );
}

// ─── Full meeting row (Phases 5+6+8) ─────────────────────────────────────────

function MeetingRowFull({ row, orgSlug, rowSources, onUpdate, onSourcesUpdated }: {
  row:              OperationalConnectionAuditRow;
  orgSlug:          string;
  rowSources:       KpiSourceRecord[];
  onUpdate:         (u: KpiCertificationRecord) => void;
  onSourcesUpdated: () => void;
}) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [isPending,  startTransition] = useTransition();

  const sourceStatus    = getSourceStatus(rowSources);
  const hasPending      = rowSources.some(s => s.validationStatus === "pending_existence_validation");
  const hasReady        = rowSources.some(s => s.validationStatus === "ready_for_integration");
  const hasRuntime      = rowSources.some(s => s.validationStatus === "runtime_detected" || s.validationStatus === "connected_partial" || s.validationStatus === "snapshot_detected" || s.validationStatus === "used_by_agentik");
  const hasCsvHypothesis = rowSources.some(s => s.bootstrapBatchId);
  const primarySource   = rowSources.find(s => s.sourceOfTruth || s.sourceRole === "primary") ?? rowSources[0];

  const quickApprove = useCallback((action: KpiApprovalAction) => {
    startTransition(async () => {
      const res = await fetch(`/api/orgs/${orgSlug}/operational-map/connection-audit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kpiKey: row.entityKey, domain: row.domain, action }),
      });
      const d = await res.json();
      if (d.ok) onUpdate(d.certification);
    });
  }, [orgSlug, row.entityKey, row.domain, onUpdate]);

  return (
    <>
      <div style={{ borderBottom: `1px solid ${C.lineSubtle}`, opacity: isPending ? 0.6 : 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "16px 1.6fr 80px 120px 90px 60px 60px 110px", gap: S[2], padding: "7px 12px", alignItems: "center" }}>
          {/* Priority dot */}
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: PRIORITY_COLORS[row.priority] ?? C.inkLight }} />

          {/* KPI */}
          <div>
            <div style={{ fontFamily: T.mono, fontSize: "11px", fontWeight: 600, color: C.ink, lineHeight: 1.2 }}>{row.entityLabel}</div>
            <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, marginTop: 1 }}>{row.domainLabel ?? row.domain}</div>
          </div>

          {/* Health */}
          <div><HealthBadge health={row.connectionHealth} /></div>

          {/* Sources column — count + status badges */}
          <div style={{ cursor: "pointer" }} onClick={() => setShowDrawer(true)}>
            {rowSources.length === 0 ? (
              <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 4, background: C.redLight, color: C.red, fontFamily: T.mono, fontSize: "10px", fontWeight: 600 }}>
                Sin fuente
              </span>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <SourceStatusBadge sources={rowSources} />
                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                    {rowSources.length} fuente{rowSources.length !== 1 ? "s" : ""}
                  </span>
                  {hasPending && <span style={{ fontFamily: T.mono, fontSize: "9px", padding: "1px 5px", borderRadius: 3, background: "#fef3c7", color: "#92400e", fontWeight: 700 }}>⚠ Validar</span>}
                  {hasReady   && <span style={{ fontFamily: T.mono, fontSize: "9px", padding: "1px 5px", borderRadius: 3, background: "#d1fae5", color: "#065f46", fontWeight: 700 }}>⭐ Lista</span>}
                </div>
                {/* Runtime source chips — LINEAGE-01: show SAG code + name */}
                {hasRuntime && (() => {
                  const runtimeSrc = rowSources.find(s =>
                    s.validationStatus === "runtime_detected" ||
                    s.validationStatus === "connected_partial" ||
                    s.validationStatus === "snapshot_detected" ||
                    s.validationStatus === "used_by_agentik"
                  );
                  if (!runtimeSrc) return null;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const lineage = runtimeSrc.runtimeLineage as any ?? null;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const meetingPrimary: any = lineage?.primarySagSource ?? null;
                  const topGroup = meetingPrimary && !meetingPrimary.unresolved
                    ? null  // use primary display below
                    : lineage?.sourceCodeGroups?.[0] ?? null;
                  const statusColors: Record<string, { bg: string; color: string; label: string }> = {
                    runtime_detected:  { bg: "#f0fdf4", color: "#16a34a", label: "Activo" },
                    connected_partial: { bg: "#f0fdf4", color: "#16a34a", label: "Activo" },
                    snapshot_detected: { bg: "#f0f9ff", color: "#0284c7", label: "Snapshot" },
                    used_by_agentik:   { bg: "#faf5ff", color: "#7c3aed", label: "Agentik" },
                  };
                  const sc = statusColors[runtimeSrc.validationStatus] ?? statusColors.runtime_detected;
                  const rowCountStr = (runtimeSrc.runtimeRowCount ?? lineage?.rowCount ?? 0) > 999
                    ? `${Math.round((runtimeSrc.runtimeRowCount ?? lineage?.rowCount ?? 0) / 1000)}k`
                    : String(runtimeSrc.runtimeRowCount ?? lineage?.rowCount ?? 0);
                  // Primary SAG label: prefer resolved primarySagSource, fallback to topGroup, fallback to model name
                  const meetingLabel = meetingPrimary && !meetingPrimary.unresolved
                    ? `${meetingPrimary.code} · ${(meetingPrimary.sourceName as string).split(" ").slice(0,3).join(" ")}`
                    : topGroup
                      ? `${topGroup.code} · ${topGroup.catalogMatch?.nombreFuente?.split(" ").slice(0,3).join(" ") ?? runtimeSrc.moduleName ?? runtimeSrc.sourceName}`
                      : `${sc.label}: ${runtimeSrc.moduleName ?? runtimeSrc.sourceName}`;
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ display: "inline-block", padding: "1px 6px", borderRadius: 3, background: "#f0fdf4", color: "#15803d", fontFamily: T.mono, fontSize: "9px", fontWeight: 700, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {meetingLabel}
                      </span>
                      <span style={{ fontFamily: T.mono, fontSize: "9px", color: "#15803d", opacity: 0.75 }}>
                        {meetingPrimary && !meetingPrimary.unresolved ? "Fuente operacional principal" : "Sin clasificar"}
                      </span>
                      {rowCountStr !== "0" && (
                        <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>
                          {rowCountStr} filas{meetingPrimary && !meetingPrimary.unresolved && meetingPrimary.sourceType ? ` · ${meetingPrimary.sourceType === "OFICIAL" ? "Oficial" : meetingPrimary.sourceType}` : ""}
                        </span>
                      )}
                    </div>
                  );
                })()}
                {/* CSV hypothesis chips for bootstrap sources */}
                {!hasRuntime && hasCsvHypothesis && rowSources
                  .filter(s => s.bootstrapBatchId)
                  .slice(0, 1)
                  .map(s => {
                    const meta = s.bootstrapMetadata as { sagCode?: string } | null;
                    if (!meta?.sagCode) return null;
                    return (
                      <span key={s.id} style={{ display: "inline-block", padding: "1px 5px", borderRadius: 3, background: "#eff6ff", color: "#1d4ed8", fontFamily: T.mono, fontSize: "9px", fontWeight: 700, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        CSV: {meta.sagCode}
                      </span>
                    );
                  })}
                {!hasRuntime && !hasCsvHypothesis && primarySource?.tableName && (
                  <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {primarySource.tableName}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cert */}
          <div><CertBadge status={row.certificationStatus} /></div>

          {/* Business */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            {!row.businessApproved
              ? <button onClick={() => quickApprove("approve_business")} title="Aprobar negocio" style={{ padding: "3px 6px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: C.greenLight, color: C.green, border: `1px solid ${C.greenBorder}` }}>Neg</button>
              : <span style={{ fontFamily: T.mono, fontSize: "10px", color: C.green, fontWeight: 700 }}>✓</span>
            }
          </div>

          {/* SAG */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            {!row.sagApproved
              ? <button onClick={() => quickApprove("approve_sag")} title="Aprobar SAG" style={{ padding: "3px 6px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", background: "#fdf4ff", color: "#7c3aed", border: "1px solid #e9d5ff" }}>SAG</button>
              : <span style={{ fontFamily: T.mono, fontSize: "10px", color: "#7c3aed", fontWeight: 700 }}>✓</span>
            }
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button
              onClick={() => setShowDrawer(true)}
              style={{ padding: "3px 7px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", fontWeight: 700,
                background: rowSources.length === 0 ? C.amberLight : C.blueLight,
                color:      rowSources.length === 0 ? C.amberDark  : C.blueDark,
                border:     `1px solid ${rowSources.length === 0 ? C.amberBorder : C.blueBorder}`,
              }}>
              {rowSources.length === 0 ? "+ Mapeo" : `Mapeo (${rowSources.length})`}
            </button>
          </div>
        </div>
      </div>

      {showDrawer && (
        <MeetingSourceMappingDrawer
          row={row}
          orgSlug={orgSlug}
          rowSources={rowSources}
          onClose={() => setShowDrawer(false)}
          onSourcesUpdated={onSourcesUpdated}
        />
      )}
    </>
  );
}

// ─── Gap priority badge ───────────────────────────────────────────────────────

function GapPriority({ priority }: { priority: "critical" | "high" | "medium" }) {
  const styles = {
    critical: { bg: C.redLight,   color: C.red,      label: "Crítico" },
    high:     { bg: C.amberLight, color: C.amberDark, label: "Alto" },
    medium:   { bg: C.blueLight,  color: C.blue,     label: "Medio" },
  };
  const s = styles[priority];
  return (
    <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 4,
      background: s.bg, color: s.color, fontFamily: T.mono, fontSize: "10px", fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

// ─── New KPI modal ────────────────────────────────────────────────────────────

const DOMAIN_OPTIONS_FORM = [
  { value: "torre_control", label: "Torre de Control" },
  { value: "comercial", label: "Comercial" },
  { value: "cobranza", label: "Cobranza" },
  { value: "tesoreria", label: "Tesorería" },
  { value: "finanzas", label: "Finanzas" },
  { value: "logistica", label: "Logística" },
  { value: "produccion", label: "Producción" },
  { value: "inventario", label: "Inventario" },
  { value: "crm_pedidos", label: "CRM / Pedidos" },
];

function NewKpiModal({ orgSlug, onClose, onCreated }: {
  orgSlug: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    domain:        "torre_control",
    entityLabel:   "",
    kpiDefinition: "",
    priority:      "medium",
    frequency:     "daily",
    sourceOfTruth: "",
    notes:         "",
  });
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(() => {
    if (!form.entityLabel.trim() || !form.kpiDefinition.trim()) {
      setError("Nombre y definición son obligatorios.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/orgs/${orgSlug}/operational-map/kpi-definitions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        const data = await res.json();
        if (!data.ok) { setError(data.error ?? "Error al crear KPI"); return; }
        onCreated();
        onClose();
      } catch {
        setError("Error de red. Intenta de nuevo.");
      }
    });
  }, [form, orgSlug, onClose, onCreated]);

  const inputStyle: React.CSSProperties = {
    width: "100%", fontFamily: T.mono, fontSize: "11px", padding: "6px 8px",
    border: `1px solid ${C.line}`, borderRadius: 5, background: C.white, color: C.ink,
    outline: "none", boxSizing: "border-box",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.32)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 480, background: C.white, borderRadius: 10, border: `1px solid ${C.line}`, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.line}`, background: C.surface, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: T.mono, fontSize: "13px", fontWeight: 700, color: C.ink }}>+ Nuevo KPI</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkLight, fontSize: "18px", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Dominio *</div>
            <select value={form.domain} onChange={e => setForm(p => ({ ...p, domain: e.target.value }))} style={inputStyle}>
              {DOMAIN_OPTIONS_FORM.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Nombre del KPI *</div>
            <input type="text" value={form.entityLabel} onChange={e => setForm(p => ({ ...p, entityLabel: e.target.value }))}
              placeholder="Ej: Ventas del Día F1" style={inputStyle} />
          </div>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Definición operacional *</div>
            <textarea rows={3} value={form.kpiDefinition} onChange={e => setForm(p => ({ ...p, kpiDefinition: e.target.value }))}
              placeholder="Describe qué mide este KPI y cómo se calcula..." style={{ ...inputStyle, resize: "vertical" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Prioridad</div>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} style={inputStyle}>
                <option value="critical">Crítico</option>
                <option value="high">Alto</option>
                <option value="medium">Medio</option>
                <option value="low">Bajo</option>
              </select>
            </div>
            <div>
              <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Frecuencia</div>
              <select value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))} style={inputStyle}>
                <option value="realtime">Tiempo real</option>
                <option value="daily">Diario</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
              </select>
            </div>
          </div>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Fuente de verdad esperada</div>
            <input type="text" value={form.sourceOfTruth} onChange={e => setForm(p => ({ ...p, sourceOfTruth: e.target.value }))}
              placeholder="SAG / Banco / Agentik..." style={inputStyle} />
          </div>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginBottom: 3 }}>Notas iniciales</div>
            <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              placeholder="Contexto de la reunión, bloqueadores, etc." style={inputStyle} />
          </div>
          {error && <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.red }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
            <button onClick={handleSubmit} disabled={isPending} style={{
              padding: "8px 20px", borderRadius: 6, cursor: "pointer", fontFamily: T.mono,
              fontSize: "11px", fontWeight: 700, background: C.blueDark, color: C.white, border: "none",
              opacity: isPending ? 0.6 : 1,
            }}>
              {isPending ? "Creando…" : "Crear KPI"}
            </button>
            <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontFamily: T.mono, fontSize: "11px", background: "none", border: `1px solid ${C.line}`, color: C.inkLight }}>
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function OperationalConnectionAuditPanel({ audit: initialAudit, orgSlug, meetingMode, gapReport, kpiSources: initialKpiSources = [] }: Props) {
  const [audit,          setAudit]          = useState(initialAudit);
  const [kpiSources,     setKpiSources]     = useState<KpiSourceRecord[]>(initialKpiSources);
  const [domainFilter,   setDomainFilter]   = useState("");
  const [healthFilter,   setHealthFilter]   = useState("");
  const [certFilter,     setCertFilter]     = useState("");
  const [onlyIssues,     setOnlyIssues]     = useState(false);
  const [selectedRow,    setSelectedRow]    = useState<OperationalConnectionAuditRow | null>(null);
  const [showNewKpi,     setShowNewKpi]     = useState(false);
  // ── Meeting mode state ───────────────────────────────────────────────────
  const [meetingSearch,  setMeetingSearch]  = useState("");
  const [meetingFilter,  setMeetingFilter]  = useState<MeetingFilter>("all");
  const [activeTab,      setActiveTab]      = useState<"kpis" | "domains" | "production" | "gaps" | "meeting">(
    meetingMode ? "meeting" : "kpis"
  );

  // Build a per-KPI source map for O(1) lookup — keys normalized for safe lookups
  const sourceMap = useMemo(() => {
    const m = new Map<string, KpiSourceRecord[]>();
    for (const s of kpiSources) {
      const key = normalizeKpiKey(s.kpiKey);
      const list = m.get(key) ?? [];
      list.push(s);
      m.set(key, list);
    }
    return m;
  }, [kpiSources]);

  const handleSourcesUpdated = useCallback(() => {
    // Reload sources from API after mutations
    fetch(`/api/orgs/${orgSlug}/operational-map/kpi-sources`)
      .then(r => r.json())
      .then(d => { if (d.ok) setKpiSources(d.sources); })
      .catch(() => {});
  }, [orgSlug]);

  // Auto-refresh sources on mount: catches runtime-hydrated sources not yet in SSR snapshot
  // Also triggers lineage re-hydration when stale lineage detected (missing primarySagSource)
  useEffect(() => {
    handleSourcesUpdated();

    // Auto-trigger lineage re-hydration for SAG runtime sources with stale/null lineage
    const staleRuntimeSources = initialKpiSources.filter(s => {
      const isRuntime = s.validationStatus === "runtime_detected" || s.validationStatus === "connected_partial";
      const isSag = s.provider === "sag";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasLineage = !!(s.runtimeLineage as any)?.primarySagSource;
      return isRuntime && isSag && !hasLineage;
    });

    if (staleRuntimeSources.length > 0) {
      // Background: re-hydrate ALL runtime_detected rows, then refresh UI
      fetch(`/api/orgs/${orgSlug}/operational-map/lineage-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: true }),
      })
        .then(() => handleSourcesUpdated())
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Merge certification update into audit state
  const handleCertificationUpdate = useCallback((updated: KpiCertificationRecord) => {
    setAudit(prev => ({
      ...prev,
      rows: prev.rows.map(r =>
        r.entityKey === updated.kpiKey
          ? {
              ...r,
              certificationStatus: updated.certificationStatus,
              productionReady:     updated.productionReady,
              validatedBy:         updated.validatedBy,
              lastValidatedAt:     updated.lastValidatedAt,
              confidenceScore:     updated.confidenceScore,
              businessApproved:    updated.businessApproved,
              sagApproved:         updated.sagApproved,
            }
          : r
      ),
    }));
    if (selectedRow?.entityKey === updated.kpiKey) {
      setSelectedRow(prev => prev ? {
        ...prev,
        certificationStatus: updated.certificationStatus,
        productionReady:     updated.productionReady,
        validatedBy:         updated.validatedBy,
        lastValidatedAt:     updated.lastValidatedAt,
        confidenceScore:     updated.confidenceScore,
        businessApproved:    updated.businessApproved,
        sagApproved:         updated.sagApproved,
      } : prev);
    }
  }, [selectedRow]);

  const filteredRows = useMemo(() => {
    let rows = audit.rows;
    if (domainFilter)   rows = rows.filter(r => r.domain === domainFilter);
    if (healthFilter)   rows = rows.filter(r => r.connectionHealth === healthFilter);
    if (certFilter === "null") rows = rows.filter(r => !r.certificationStatus);
    else if (certFilter) rows = rows.filter(r => r.certificationStatus === certFilter);
    if (onlyIssues) rows = rows.filter(r =>
      r.flags.isMock || r.flags.isPartial || r.flags.isDisconnected || r.flags.isWrongSource
    );
    return rows;
  }, [audit.rows, domainFilter, healthFilter, certFilter, onlyIssues]);

  const productionReadyRows = useMemo(
    () => audit.rows.filter(r => r.productionReady || r.certificationStatus === "production_ready"),
    [audit.rows]
  );

  const certifiedRows = useMemo(
    () => audit.rows.filter(r => r.certificationStatus === "certified" || r.certificationStatus === "production_ready"),
    [audit.rows]
  );

  return (
    <div>
      {/* ── Health distribution strip ── */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "16px 0", padding: "8px 12px", background: C.surface, borderRadius: 7, border: `1px solid ${C.line}`, alignItems: "center" }}>
        {Object.entries(HEALTH_STYLES).map(([h, s]) => {
          const count = audit.rows.filter(r => r.connectionHealth === h).length;
          if (!count) return null;
          return (
            <div key={h} onClick={() => setHealthFilter(prev => prev === h ? "" : h)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 5, background: s.bg, cursor: "pointer", border: healthFilter === h ? `1px solid ${s.color}` : `1px solid transparent` }}>
              <span style={{ fontFamily: T.mono, fontSize: "14px", fontWeight: 700, color: s.color }}>{count}</span>
              <span style={{ fontFamily: T.mono, fontSize: "9px", color: s.color }}>{s.dot} {s.label}</span>
            </div>
          );
        })}
      </div>

      {/* ── Tabs + New KPI button ── */}
      <div style={{ display: "flex", gap: S[2], marginBottom: S[3], borderBottom: `1px solid ${C.line}`, alignItems: "flex-end" }}>
        {([
          ["kpis",       `KPIs (${filteredRows.length})`],
          ["domains",    `Dominios (${audit.byDomain.length})`],
          ["production", `Producción (${productionReadyRows.length})`],
          ["gaps",       `Brechas${gapReport ? ` (${gapReport.criticalGaps + gapReport.highGaps})` : ""}`],
          ["meeting",    "Modo Reunión"],
        ] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            background: "none", border: "none", cursor: "pointer", padding: "8px 4px",
            fontFamily: T.mono, fontSize: "11px",
            color: activeTab === tab ? C.blueDark : C.inkLight,
            fontWeight: activeTab === tab ? 700 : 400,
            borderBottom: activeTab === tab ? `2px solid ${C.blueDark}` : "2px solid transparent",
            marginBottom: -1,
          }}>{label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowNewKpi(true)}
          style={{
            padding: "6px 14px", borderRadius: 6, cursor: "pointer",
            fontFamily: T.mono, fontSize: "11px", fontWeight: 700,
            background: C.blueDark, color: C.white, border: "none", marginBottom: 4,
          }}
        >
          + Nuevo KPI
        </button>
      </div>

      {/* ── MEETING MODE tab ── */}
      {activeTab === "meeting" && (
        <MeetingModePanel
          audit={audit}
          orgSlug={orgSlug}
          sourceMap={sourceMap}
          onCertificationUpdate={handleCertificationUpdate}
          onSourcesUpdated={handleSourcesUpdated}
          search={meetingSearch}
          onSearchChange={setMeetingSearch}
          filter={meetingFilter}
          onFilterChange={setMeetingFilter}
        />
      )}

      {/* ── PRODUCTION tab ── */}
      {activeTab === "production" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          {productionReadyRows.length === 0 ? (
            <div style={{ padding: "24px", fontFamily: T.mono, fontSize: "11px", color: C.inkFaint, textAlign: "center" }}>
              Ningún KPI marcado como listo para producción todavía.
            </div>
          ) : productionReadyRows.map(row => (
            <div key={row.id} className="ag-kpi-card" style={{ cursor: "pointer" }} onClick={() => setSelectedRow(row)}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: "11px", fontWeight: 700, color: C.ink }}>{row.entityLabel}</div>
                  <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkFaint, marginTop: 2 }}>{row.domainLabel ?? row.domain}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <TrustGrade score={row.trustScore} grade={row.trustGrade} />
                  <span style={{ fontFamily: T.mono, fontSize: "10px", background: "#d1fae5", color: "#065f46", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>🟢 PRODUCCIÓN</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── DOMAINS tab ── */}
      {activeTab === "domains" && (
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          {audit.byDomain
            .sort((a, b) => a.readinessScore - b.readinessScore)
            .map(domain => {
              const color = domain.readinessScore >= 70 ? C.green : domain.readinessScore >= 40 ? C.amber : C.red;
              return (
                <div key={domain.domain} className="ag-kpi-card">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontFamily: T.mono, fontSize: "12px", fontWeight: 700, color: C.ink }}>{domain.label}</div>
                      {domain.topBlockingKpi && (
                        <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.redDark, marginTop: 2 }}>Top bloqueador: {domain.topBlockingKpi}</div>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontFamily: T.mono, fontSize: "20px", fontWeight: 700, color, lineHeight: 1 }}>{domain.readinessScore}%</div>
                      <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>{domain.totalKpis} KPIs</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", height: 5, borderRadius: 3, overflow: "hidden", gap: 1 }}>
                    {[
                      { h: "live", color: C.green }, { h: "partial", color: C.amber }, { h: "manual", color: "#7c3aed" },
                      { h: "mock", color: C.red }, { h: "disconnected", color: C.redDark }, { h: "pending", color: C.inkGhost },
                    ].map(({ h, color: hc }) => {
                      const count = domain.byHealth[h as keyof typeof domain.byHealth];
                      if (!count) return null;
                      return <div key={h} title={`${h}: ${count}`} style={{ flex: count, background: hc, minWidth: 2 }} />;
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                    {Object.entries(domain.byHealth).filter(([, n]) => n > 0).map(([h, n]) => (
                      <span key={h} style={{ fontFamily: T.mono, fontSize: "10px", color: HEALTH_STYLES[h as ConnectionHealth]?.color ?? C.inkLight }}>
                        {n} {HEALTH_STYLES[h as ConnectionHealth]?.label ?? h}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* ── KPIs tab ── */}
      {activeTab === "kpis" && (
        <>
          {/* Filters */}
          <div style={{ display: "flex", gap: S[2], flexWrap: "wrap", alignItems: "center", marginBottom: S[3], padding: "8px 12px", background: C.surface, borderRadius: 7, border: `1px solid ${C.line}` }}>
            <SelectFilter value={domainFilter} onChange={setDomainFilter} options={DOMAIN_OPTIONS} />
            <SelectFilter value={healthFilter} onChange={setHealthFilter} options={[
              { value: "", label: "Todos los estados" },
              ...Object.entries(HEALTH_STYLES).map(([v, s]) => ({ value: v, label: `${s.dot} ${s.label}` })),
            ]} />
            <SelectFilter value={certFilter} onChange={setCertFilter} options={CERT_STATUS_OPTIONS} />
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: T.mono, fontSize: "11px", color: C.inkLight, cursor: "pointer" }}>
              <input type="checkbox" checked={onlyIssues} onChange={e => setOnlyIssues(e.target.checked)} />
              Solo con problemas
            </label>
            {(domainFilter || healthFilter || certFilter || onlyIssues) && (
              <button onClick={() => { setDomainFilter(""); setHealthFilter(""); setCertFilter(""); setOnlyIssues(false); }}
                style={{ background: "none", border: `1px solid ${C.line}`, borderRadius: 5, fontFamily: T.mono, fontSize: "10px", color: C.inkLight, padding: "4px 10px", cursor: "pointer" }}>
                Limpiar
              </button>
            )}
          </div>

          {/* Table — Phase 6 columns */}
          <div className="ag-op-table">
            <div style={{ display: "grid", gridTemplateColumns: "16px 1.8fr 100px 70px 100px 70px 60px 60px 70px", gap: S[2], padding: "6px 12px", background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
              {["", "KPI", "Dominio", "Estado", "Certificación", "Trust", "Neg", "SAG", "Prioridad"].map(h => (
                <div key={h} style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, textTransform: "uppercase", fontWeight: 600 }}>{h}</div>
              ))}
            </div>

            {filteredRows.length === 0 && (
              <div style={{ padding: "24px", fontFamily: T.mono, fontSize: "11px", color: C.inkFaint, textAlign: "center" }}>
                No hay KPIs que coincidan con los filtros.
              </div>
            )}

            {filteredRows.map(row => (
              <div key={row.id} className="ag-op-row" onClick={() => setSelectedRow(row)} style={{
                display: "grid", gridTemplateColumns: "16px 1.8fr 100px 70px 100px 70px 60px 60px 70px",
                gap: S[2], padding: "7px 12px", cursor: "pointer", alignItems: "center",
                borderBottom: `1px solid ${C.lineSubtle}`,
              }}>
                {/* Priority dot */}
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: PRIORITY_COLORS[row.priority] ?? C.inkLight }} />

                {/* KPI label */}
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: "11px", color: C.ink, fontWeight: 600, lineHeight: 1.2 }}>{row.entityLabel}</div>
                  <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, marginTop: 1 }}>
                    {row.kpiDefinition.length > 55 ? row.kpiDefinition.substring(0, 55) + "…" : row.kpiDefinition}
                  </div>
                </div>

                {/* Domain */}
                <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight }}>{row.domainLabel ?? row.domain}</div>

                {/* Health */}
                <div><HealthBadge health={row.connectionHealth} /></div>

                {/* Cert */}
                <div><CertBadge status={row.certificationStatus} /></div>

                {/* Trust */}
                <div><TrustGrade score={row.trustScore} grade={row.trustGrade} /></div>

                {/* Business */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <ApprovalDot approved={row.businessApproved} label="Negocio" />
                </div>

                {/* SAG */}
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <ApprovalDot approved={row.sagApproved} label="SAG" />
                </div>

                {/* Priority */}
                <div style={{ fontFamily: T.mono, fontSize: "9px", color: PRIORITY_COLORS[row.priority], fontWeight: 700, textTransform: "uppercase" }}>
                  {row.priority}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── GAPS tab ── */}
      {activeTab === "gaps" && (
        <div>
          {!gapReport || gapReport.totalGaps === 0 ? (
            <div style={{ padding: "32px", fontFamily: T.mono, fontSize: "11px", color: C.inkFaint, textAlign: "center" }}>
              No se detectaron brechas críticas o altas. El catálogo esperado está cubierto.
            </div>
          ) : (
            <>
              {/* Summary strip */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[3], marginBottom: S[3] }}>
                {[
                  { label: "Total brechas", value: gapReport.totalGaps, color: C.ink },
                  { label: "Brechas críticas", value: gapReport.criticalGaps, color: gapReport.criticalGaps > 0 ? C.red : C.green },
                  { label: "Brechas altas", value: gapReport.highGaps, color: gapReport.highGaps > 0 ? C.amber : C.green },
                ].map(card => (
                  <div key={card.label} className="ag-kpi-card">
                    <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkFaint, marginBottom: S[1] }}>{card.label}</div>
                    <div style={{ fontFamily: T.mono, fontSize: "22px", fontWeight: 700, color: card.color, lineHeight: 1.2 }}>{card.value}</div>
                  </div>
                ))}
              </div>

              {/* Gap list by domain */}
              {Object.entries(gapReport.byDomain).map(([domain, gaps]) => (
                <div key={domain} style={{ marginBottom: S[4] }}>
                  <div style={{ fontFamily: T.mono, fontSize: "10px", fontWeight: 700, color: C.inkMid, textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px 12px", background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: "5px 5px 0 0" }}>
                    {gaps[0]?.domainLabel ?? domain} — {gaps.length} {gaps.length === 1 ? "brecha" : "brechas"}
                  </div>
                  {gaps.map((gap, i) => (
                    <div key={i} style={{ padding: "10px 14px", borderLeft: `1px solid ${C.line}`, borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.lineSubtle}`, background: i % 2 === 0 ? C.white : C.surface }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: T.mono, fontSize: "11px", fontWeight: 700, color: C.ink }}>{gap.missingLabel}</div>
                          <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkLight, marginTop: 3 }}>{gap.reason}</div>
                          {gap.possibleMatch && (
                            <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.blue, marginTop: 3 }}>
                              Posible coincidencia: "{gap.possibleMatch}"
                            </div>
                          )}
                          <div style={{ fontFamily: T.mono, fontSize: "10px", color: C.inkFaint, marginTop: 3 }}>
                            Fuente sugerida: {gap.suggestedSourceOfTruth}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                          <GapPriority priority={gap.priority} />
                          <button
                            onClick={() => setShowNewKpi(true)}
                            style={{ padding: "4px 10px", borderRadius: 4, cursor: "pointer", fontFamily: T.mono, fontSize: "9px", fontWeight: 600, background: C.blueLight, color: C.blueDark, border: `1px solid ${C.blueBorder}` }}
                          >
                            + Registrar
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ borderLeft: `1px solid ${C.line}`, borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`, borderRadius: "0 0 5px 5px", height: 3, background: "transparent" }} />
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Enterprise drawer ── */}
      {selectedRow && (
        <EnterpriseDrawer
          row={selectedRow}
          orgSlug={orgSlug}
          onClose={() => setSelectedRow(null)}
          onActionComplete={handleCertificationUpdate}
          rowSources={sourceMap.get(normalizeKpiKey(selectedRow.entityKey)) ?? []}
          onSourcesUpdated={handleSourcesUpdated}
        />
      )}

      {/* ── New KPI modal ── */}
      {showNewKpi && (
        <NewKpiModal
          orgSlug={orgSlug}
          onClose={() => setShowNewKpi(false)}
          onCreated={() => {
            // Reload page to reflect new KPI in audit
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
