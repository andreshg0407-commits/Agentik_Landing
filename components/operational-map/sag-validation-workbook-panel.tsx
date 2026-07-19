"use client";

/**
 * components/operational-map/sag-validation-workbook-panel.tsx
 *
 * SAG Validation Workbook — Operational Workspace Panel.
 *
 * Enterprise-grade internal instrument for SAG × Agentik × Negocio meetings.
 * Not a dashboard. Not a report. A live, filterable, actionable workbook.
 *
 * Features:
 *   - Filter by domain / priority / answer state
 *   - Compact table with ag-op-table / ag-op-row patterns
 *   - Meeting mode: keyboard-navigable, quick-answer, copy-question, resolve
 *   - Blocker rail: pinned critical blockers always visible
 *   - Source-of-truth badges: SAG / Agentik / CRM / Banco
 *   - Export buttons: CSV, checklist, markdown
 *
 * Sprint: AGENTIK-SAG-VALIDATION-WORKBOOK-01
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { C, T, S, R }                               from "@/lib/ui/tokens";
import type {
  ValidationWorkbook,
  ValidationWorkbookRow,
  ValidationBlockerLevel,
}                                                    from "@/lib/operational-map/workbook/operational-validation-workbook-types";
import type { OperationalDomainKey }                from "@/lib/operational-map/operational-source-map";
import { OPERATIONAL_SOURCE_MAP }                   from "@/lib/operational-map/operational-source-map";
import type { KpiGovernanceRecord }                 from "@/lib/operational-map/certification/operational-kpi-governance-types";
import {
  DEPENDENCY_TYPE_LABELS,
  CRITICALITY_LABELS,
  SOURCE_PRIORITY_LABELS,
}                                                    from "@/lib/operational-map/certification/operational-kpi-governance-types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  workbook:    ValidationWorkbook;
  orgSlug:     string;
  meetingMode?: boolean;
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

const PRIORITY_STYLE: Record<string, React.CSSProperties> = {
  critical: { background: "#fee2e2", color: "#b91c1c", border: "1px solid #fca5a5" },
  high:     { background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa" },
  medium:   { background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" },
  low:      { background: C.surfaceAlt, color: C.inkMid, border: `1px solid ${C.line}` },
};

const BLOCKER_STYLE: Record<ValidationBlockerLevel, React.CSSProperties | null> = {
  critical: { background: "#fee2e2", color: "#991b1b" },
  high:     { background: "#fff7ed", color: "#9a3412" },
  medium:   { background: C.amberLight, color: "#92400e" },
  none:     null,
};

const SOT_STYLE: Record<string, React.CSSProperties> = {
  SAG:         { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" },
  Agentik:     { background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" },
  CRM:         { background: "#fdf4ff", color: "#7e22ce", border: "1px solid #e9d5ff" },
  Banco:       { background: "#f0f9ff", color: "#0369a1", border: "1px solid #bae6fd" },
  "SAG+Agentik": { background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe" },
};

const ANSWER_STYLE: Record<string, React.CSSProperties> = {
  pending:        { color: C.inkMid, opacity: 0.6 },
  answered:       { color: "#16a34a" },
  blocked:        { color: "#dc2626" },
  not_applicable: { color: C.inkFaint },
};

function Badge({ text, style }: { text: string; style: React.CSSProperties }) {
  return (
    <span style={{
      display:      "inline-block",
      fontFamily:   T.mono,
      fontSize:     T.sz["2xs"],
      fontWeight:   600,
      padding:      `1px ${S[2]}px`,
      borderRadius: R.sm,
      letterSpacing: "0.04em",
      ...style,
    }}>
      {text}
    </span>
  );
}

// ─── Governance drawer types ──────────────────────────────────────────────────

type DrawerTab = "resumen" | "formula" | "fuentes" | "timeline";

// ─── Governance field label ───────────────────────────────────────────────────

function FieldLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontFamily:    T.mono,
      fontSize:      T.sz["2xs"],
      color:         C.inkFaint,
      letterSpacing: "0.08em",
      marginBottom:  S[2],
      textTransform: "uppercase" as const,
    }}>
      {text}
    </div>
  );
}

// ─── Dependency type badge ────────────────────────────────────────────────────

const DEP_TYPE_STYLE: Record<string, React.CSSProperties> = {
  SAG_ONLY:     { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" },
  AGENTIK_ONLY: { background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" },
  HYBRID:       { background: "#eef2ff", color: "#3730a3", border: "1px solid #c7d2fe" },
  CRM:          { background: "#fdf4ff", color: "#7e22ce", border: "1px solid #e9d5ff" },
  MANUAL:       { background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" },
  EXTERNAL:     { background: C.surfaceAlt, color: C.inkMid, border: `1px solid ${C.line}` },
};

// ─── Criticality badge ────────────────────────────────────────────────────────

const CRITICALITY_STYLE: Record<string, React.CSSProperties> = {
  CRITICAL:      { background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" },
  OPERATIONAL:   { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" },
  INFORMATIONAL: { background: C.surfaceAlt, color: C.inkMid, border: `1px solid ${C.line}` },
  EXPERIMENTAL:  { background: "#fdf4ff", color: "#7e22ce", border: "1px solid #e9d5ff" },
};

// ─── Source priority badge ────────────────────────────────────────────────────

const SOURCE_PRIORITY_STYLE: Record<string, React.CSSProperties> = {
  PRIMARY:     { background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" },
  SECONDARY:   { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" },
  ENRICHMENT:  { background: "#eef2ff", color: "#3730a3", border: "1px solid #c7d2fe" },
  VALIDATION:  { background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" },
  FALLBACK:    { background: C.surfaceAlt, color: C.inkMid, border: `1px solid ${C.line}` },
};

// ─── Pending placeholder ──────────────────────────────────────────────────────

function PendingPlaceholder({ label }: { label?: string }) {
  return (
    <div style={{
      fontFamily:   T.mono,
      fontSize:     T.sz.xs,
      color:        C.inkFaint,
      background:   C.surfaceAlt,
      border:       `1px dashed ${C.line}`,
      borderRadius: R.md,
      padding:      `${S[2]}px ${S[3]}px`,
      fontStyle:    "italic",
    }}>
      {label ?? "Sin definir — pendiente de validación"}
    </div>
  );
}

// ─── Formula block ────────────────────────────────────────────────────────────

function FormulaBlock({
  formulaExpression,
  formulaDescription,
  businessDefinition,
  onSave,
  saving,
}: {
  formulaExpression:  string | null;
  formulaDescription: string | null;
  businessDefinition: string | null;
  onSave: (fields: { formulaExpression?: string; formulaDescription?: string; businessDefinition?: string }) => void;
  saving: boolean;
}) {
  const [expr,  setExpr]  = useState(formulaExpression  ?? "");
  const [desc,  setDesc]  = useState(formulaDescription ?? "");
  const [bdef,  setBdef]  = useState(businessDefinition ?? "");
  const [dirty, setDirty] = useState(false);

  const handleChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setter(e.target.value);
    setDirty(true);
  };

  const handleSave = () => {
    onSave({ formulaExpression: expr, formulaDescription: desc, businessDefinition: bdef });
    setDirty(false);
  };

  const textareaBase: React.CSSProperties = {
    width:        "100%",
    fontFamily:   T.mono,
    fontSize:     T.sz.xs,
    background:   "#0f172a",
    color:        "#e2e8f0",
    border:       `1px solid #334155`,
    borderRadius: R.md,
    padding:      `${S[3]}px`,
    resize:       "vertical" as const,
    boxSizing:    "border-box" as const,
    lineHeight:   1.6,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      <div>
        <FieldLabel text="Expresión de fórmula" />
        <textarea
          value={expr}
          onChange={handleChange(setExpr)}
          placeholder="ej: stock_disponible / venta_promedio_30d"
          rows={3}
          style={textareaBase}
        />
      </div>
      <div>
        <FieldLabel text="Descripción operacional" />
        <textarea
          value={desc}
          onChange={handleChange(setDesc)}
          placeholder="Descripción en lenguaje natural de qué mide esta fórmula..."
          rows={3}
          style={{ ...textareaBase, background: C.surfaceAlt, color: C.ink, border: `1px solid ${C.line}` }}
        />
      </div>
      <div>
        <FieldLabel text="Definición de negocio" />
        <textarea
          value={bdef}
          onChange={handleChange(setBdef)}
          placeholder="Qué significa este KPI para el negocio, cuándo es bueno, cuándo es malo..."
          rows={3}
          style={{ ...textareaBase, background: C.surfaceAlt, color: C.ink, border: `1px solid ${C.line}` }}
        />
      </div>
      {dirty && (
        <div style={{ display: "flex", gap: S[2] }}>
          <button
            className="ag-action-primary"
            onClick={handleSave}
            disabled={saving}
            style={{ fontSize: T.sz.xs }}
          >
            {saving ? "Guardando..." : "Guardar fórmula"}
          </button>
          <button
            className="ag-action-ghost"
            onClick={() => { setExpr(formulaExpression ?? ""); setDesc(formulaDescription ?? ""); setBdef(businessDefinition ?? ""); setDirty(false); }}
            style={{ fontSize: T.sz.xs }}
          >
            Descartar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Governance timeline ──────────────────────────────────────────────────────

function GovernanceTimeline({ stages }: { stages: KpiGovernanceRecord["governanceStages"] }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 0, overflowX: "auto", paddingBottom: S[2] }}>
      {stages.map((stage, idx) => (
        <div key={stage.key} style={{ display: "flex", alignItems: "flex-start", flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: S[1] }}>
            <div style={{
              width:        28,
              height:       28,
              borderRadius: "50%",
              background:   stage.status === "done" ? "#166534" : stage.status === "blocked" ? "#991b1b" : C.surfaceAlt,
              border:       `2px solid ${stage.status === "done" ? "#bbf7d0" : stage.status === "blocked" ? "#fca5a5" : C.line}`,
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        stage.status === "done" ? "#fff" : stage.status === "blocked" ? "#fff" : C.inkFaint,
              flexShrink:   0,
            }}>
              {stage.status === "done" ? "✓" : stage.status === "blocked" ? "✕" : idx + 1}
            </div>
            <div style={{
              fontFamily:  T.mono,
              fontSize:    9,
              color:       stage.status === "done" ? "#166534" : stage.status === "blocked" ? "#991b1b" : C.inkFaint,
              whiteSpace:  "nowrap",
              textAlign:   "center" as const,
              maxWidth:    80,
              lineHeight:  1.3,
            }}>
              {stage.label}
            </div>
          </div>
          {idx < stages.length - 1 && (
            <div style={{
              width:        24,
              height:       2,
              background:   stage.status === "done" ? "#bbf7d0" : C.lineSubtle,
              marginTop:    13,
              flexShrink:   0,
            }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Row detail drawer ────────────────────────────────────────────────────────

function RowDetailPanel({
  row,
  orgSlug,
  onClose,
  onAnswer,
  meetingMode,
}: {
  row:         ValidationWorkbookRow;
  orgSlug:     string;
  onClose:     () => void;
  onAnswer:    (id: string, answer: string) => void;
  meetingMode: boolean;
}) {
  const [activeTab,  setActiveTab]  = useState<DrawerTab>("resumen");
  const [answer,     setAnswer]     = useState(row.answer ?? "");
  const [governance, setGovernance] = useState<KpiGovernanceRecord | null>(null);
  const [govLoading, setGovLoading] = useState(false);
  const [saving,     setSaving]     = useState(false);

  // Load governance record when drawer opens
  useEffect(() => {
    setGovLoading(true);
    setGovernance(null);
    fetch(`/api/orgs/${orgSlug}/operational-map/kpi-governance/${row.entityKey}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.ok && data.record) setGovernance(data.record as KpiGovernanceRecord);
      })
      .catch(() => {})
      .finally(() => setGovLoading(false));
  }, [row.entityKey, orgSlug]);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(row.validationQuestion);
  }, [row.validationQuestion]);

  const handleGovernanceSave = useCallback(async (fields: Partial<KpiGovernanceRecord["formula"] & {
    dependencyType?: string;
    criticality?: string;
    sagContributions?: string[];
    agentikContributions?: string[];
  }>) => {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/orgs/${orgSlug}/operational-map/kpi-governance/${row.entityKey}`,
        {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(fields),
        },
      );
      if (res.ok) {
        // Reload governance data
        const reload = await fetch(`/api/orgs/${orgSlug}/operational-map/kpi-governance/${row.entityKey}`);
        const data   = await reload.json();
        if (data?.ok && data.record) setGovernance(data.record as KpiGovernanceRecord);
      }
    } catch {}
    setSaving(false);
  }, [row.entityKey, orgSlug]);

  const tabs: { key: DrawerTab; label: string }[] = [
    { key: "resumen",  label: "Resumen" },
    { key: "formula",  label: "Fórmula" },
    { key: "fuentes",  label: "Fuentes" },
    { key: "timeline", label: "Timeline" },
  ];

  return (
    <div style={{
      position:     "fixed",
      right:        0,
      top:          0,
      bottom:       0,
      width:        480,
      background:   C.surface,
      borderLeft:   `1px solid ${C.line}`,
      boxShadow:    "-4px 0 24px rgba(0,0,0,0.10)",
      zIndex:       100,
      display:      "flex",
      flexDirection: "column",
      overflow:     "hidden",
    }}>
      {/* ── Header ── */}
      <div style={{
        padding:       `${S[4]}px`,
        borderBottom:  `1px solid ${C.lineSubtle}`,
        flexShrink:    0,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: S[2] }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Badges row */}
            <div style={{ display: "flex", alignItems: "center", gap: S[2], flexWrap: "wrap" as const, marginBottom: S[2] }}>
              <Badge text={row.priority.toUpperCase()} style={PRIORITY_STYLE[row.priority]} />
              <Badge text={row.sourceOfTruth} style={SOT_STYLE[row.sourceOfTruth] ?? SOT_STYLE["SAG"]} />
              {governance?.dependencyType && (
                <Badge
                  text={DEPENDENCY_TYPE_LABELS[governance.dependencyType as keyof typeof DEPENDENCY_TYPE_LABELS] ?? governance.dependencyType}
                  style={DEP_TYPE_STYLE[governance.dependencyType] ?? DEP_TYPE_STYLE["EXTERNAL"]}
                />
              )}
              {governance?.criticality && (
                <Badge
                  text={CRITICALITY_LABELS[governance.criticality as keyof typeof CRITICALITY_LABELS] ?? governance.criticality}
                  style={CRITICALITY_STYLE[governance.criticality] ?? CRITICALITY_STYLE["INFORMATIONAL"]}
                />
              )}
              {row.blockerLevel !== "none" && (
                <Badge
                  text={row.blockerLevel === "critical" ? "BLOQUEADOR" : "RIESGO"}
                  style={BLOCKER_STYLE[row.blockerLevel]!}
                />
              )}
              {/* Official SOT badge */}
              {governance?.sources.some(s => s.sourceOfTruth) && (
                <Badge
                  text="Source of Truth ✓"
                  style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}
                />
              )}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink }}>
              {row.entityLabel}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
              {row.domainLabel}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ fontFamily: T.mono, fontSize: T.sz.xl, color: C.inkFaint, background: "none", border: "none", cursor: "pointer", lineHeight: 1, flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0, marginTop: S[3], borderBottom: `1px solid ${C.line}` }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                fontFamily:    T.mono,
                fontSize:      T.sz.xs,
                fontWeight:    activeTab === tab.key ? 700 : T.wt.normal,
                color:         activeTab === tab.key ? C.blueDark : C.inkMid,
                background:    "none",
                border:        "none",
                borderBottom:  activeTab === tab.key ? `2px solid ${C.blueDark}` : "2px solid transparent",
                cursor:        "pointer",
                padding:       `${S[2]}px ${S[3]}px`,
                marginBottom:  -1,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: `${S[4]}px` }}>

        {/* ── TAB: Resumen ── */}
        {activeTab === "resumen" && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>

            {/* Validation question */}
            <div>
              <FieldLabel text="Pregunta de validación" />
              <div style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.sm,
                color:        C.ink,
                background:   C.surfaceAlt,
                border:       `1px solid ${C.line}`,
                borderRadius: R.md,
                padding:      `${S[3]}px`,
                lineHeight:   1.6,
              }}>
                {row.validationQuestion}
              </div>
              {meetingMode && (
                <button className="ag-action-ghost" onClick={handleCopy} style={{ marginTop: S[2], fontSize: T.sz.xs }}>
                  ↗ Copiar pregunta
                </button>
              )}
            </div>

            {/* SAG candidates */}
            {(row.sagTableCandidate || row.sagFieldCandidates.length > 0) && (
              <div>
                <FieldLabel text="Tabla / Vista SAG candidata" />
                <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                  {row.sagTableCandidate && (
                    <div style={{ display: "flex", gap: S[3], alignItems: "center" }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, minWidth: 60 }}>Tabla</span>
                      <code style={{ fontFamily: T.mono, fontSize: T.sz.xs, background: "#f0f9ff", color: "#0369a1", borderRadius: R.sm, padding: `2px ${S[2]}px` }}>
                        {row.sagTableCandidate}
                      </code>
                      <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, fontStyle: "italic" }}>pendiente DBA</span>
                    </div>
                  )}
                  {row.sagFieldCandidates.length > 0 && (
                    <div style={{ display: "flex", gap: S[3], alignItems: "flex-start" }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, minWidth: 60 }}>Campos</span>
                      <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" as const }}>
                        {row.sagFieldCandidates.map(f => (
                          <code key={f} style={{ fontFamily: T.mono, fontSize: T.sz.xs, background: "#eff6ff", color: "#1d4ed8", borderRadius: R.sm, padding: `1px ${S[2]}px` }}>
                            {f}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                  {row.sagSqlHint && (
                    <code style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], background: "#0f172a", color: "#94a3b8", borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, display: "block", lineHeight: 1.5 }}>
                      {row.sagSqlHint}
                    </code>
                  )}
                </div>
              </div>
            )}

            {/* Notas DBA */}
            <div>
              <FieldLabel text="Notas DBA" />
              {governance?.sources.some(s => s.notes) ? (
                <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
                  {governance.sources.filter(s => s.notes).map(s => (
                    <div key={s.id} style={{
                      fontFamily:   T.mono,
                      fontSize:     T.sz.xs,
                      color:        C.ink,
                      background:   "#fffbeb",
                      border:       "1px solid #fde68a",
                      borderRadius: R.sm,
                      padding:      `${S[2]}px ${S[3]}px`,
                    }}>
                      <span style={{ fontWeight: 700 }}>{s.sourceName}:</span> {s.notes}
                    </div>
                  ))}
                </div>
              ) : (
                <PendingPlaceholder label="Sin notas DBA registradas" />
              )}
            </div>

            {/* Operational impact */}
            <div>
              <FieldLabel text="Impacto operacional" />
              <div style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      row.blockerLevel === "critical" ? "#b91c1c" : C.inkMid,
                lineHeight: 1.5,
              }}>
                {row.operationalImpact}
              </div>
            </div>

            {/* Consumed by */}
            {row.consumedBy.length > 0 && (
              <div>
                <FieldLabel text="Consume este dato" />
                <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[1] }}>
                  {row.consumedBy.map(k => (
                    <Badge key={k} text={OPERATIONAL_SOURCE_MAP.find(d => d.key === k)?.label ?? k} style={{ background: C.surfaceAlt, color: C.inkMid, border: `1px solid ${C.line}` }} />
                  ))}
                </div>
              </div>
            )}

            {/* Scores */}
            <div>
              <FieldLabel text="Scoring reunión" />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>
                {[
                  ["Criticidad", row.scores.operationalCriticalityScore],
                  ["Dependencia", row.scores.implementationDependencyScore],
                  ["Prioridad", row.scores.meetingPriorityScore],
                ].map(([label, val]) => (
                  <div key={label as string} style={{ background: C.surfaceAlt, borderRadius: R.md, padding: `${S[2]}px`, textAlign: "center" as const }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>{label}</div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: 700, color: C.ink }}>{val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Answer input */}
            <div>
              <FieldLabel text="Respuesta" />
              <textarea
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                placeholder="Registrar respuesta de SAG..."
                rows={3}
                style={{
                  width:        "100%",
                  fontFamily:   T.mono,
                  fontSize:     T.sz.xs,
                  background:   C.surfaceAlt,
                  border:       `1px solid ${C.line}`,
                  borderRadius: R.md,
                  padding:      `${S[2]}px ${S[3]}px`,
                  color:        C.ink,
                  resize:       "vertical" as const,
                  boxSizing:    "border-box" as const,
                }}
              />
              <div style={{ display: "flex", gap: S[2], marginTop: S[2] }}>
                <button
                  className="ag-action-primary"
                  onClick={() => onAnswer(row.id, answer)}
                  disabled={!answer.trim()}
                  style={{ fontSize: T.sz.xs }}
                >
                  ✓ Marcar respondida
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: Fórmula ── */}
        {activeTab === "formula" && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>

            {/* Dependency + Criticality selectors */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
              <div>
                <FieldLabel text="Tipo de dependencia" />
                {govLoading ? (
                  <PendingPlaceholder label="Cargando..." />
                ) : (
                  <select
                    value={governance?.dependencyType ?? ""}
                    onChange={e => handleGovernanceSave({ dependencyType: e.target.value as never })}
                    style={{
                      width:        "100%",
                      fontFamily:   T.mono,
                      fontSize:     T.sz.xs,
                      padding:      `${S[2]}px ${S[3]}px`,
                      border:       `1px solid ${C.line}`,
                      borderRadius: R.md,
                      background:   C.surface,
                      color:        C.ink,
                    }}
                  >
                    <option value="">— Sin clasificar —</option>
                    <option value="SAG_ONLY">SAG_ONLY — Solo SAG</option>
                    <option value="AGENTIK_ONLY">AGENTIK_ONLY — Solo Agentik</option>
                    <option value="HYBRID">HYBRID — SAG + Agentik</option>
                    <option value="CRM">CRM — CRM</option>
                    <option value="MANUAL">MANUAL — Entrada manual</option>
                    <option value="EXTERNAL">EXTERNAL — Sistema externo</option>
                  </select>
                )}
              </div>
              <div>
                <FieldLabel text="Criticidad" />
                {govLoading ? (
                  <PendingPlaceholder label="Cargando..." />
                ) : (
                  <select
                    value={governance?.criticality ?? ""}
                    onChange={e => handleGovernanceSave({ criticality: e.target.value as never })}
                    style={{
                      width:        "100%",
                      fontFamily:   T.mono,
                      fontSize:     T.sz.xs,
                      padding:      `${S[2]}px ${S[3]}px`,
                      border:       `1px solid ${C.line}`,
                      borderRadius: R.md,
                      background:   C.surface,
                      color:        C.ink,
                    }}
                  >
                    <option value="">— Sin clasificar —</option>
                    <option value="CRITICAL">CRITICAL — Bloquea operación</option>
                    <option value="OPERATIONAL">OPERATIONAL — Operación diaria</option>
                    <option value="INFORMATIONAL">INFORMATIONAL — Analítica</option>
                    <option value="EXPERIMENTAL">EXPERIMENTAL — En evaluación</option>
                  </select>
                )}
              </div>
            </div>

            {/* Formula expression */}
            {govLoading ? (
              <PendingPlaceholder label="Cargando datos de gobernanza..." />
            ) : (
              <FormulaBlock
                formulaExpression={governance?.formula.formulaExpression ?? null}
                formulaDescription={governance?.formula.formulaDescription ?? null}
                businessDefinition={governance?.formula.businessDefinition ?? null}
                onSave={handleGovernanceSave}
                saving={saving}
              />
            )}

            {/* SAG vs Agentik separation */}
            <div style={{
              background:   C.surfaceAlt,
              border:       `1px solid ${C.line}`,
              borderRadius: R.md,
              padding:      `${S[3]}px`,
            }}>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      T.sz.xs,
                fontWeight:    700,
                color:         C.ink,
                marginBottom:  S[3],
                letterSpacing: "0.04em",
              }}>
                Separación SAG / Agentik
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: "#1d4ed8", marginBottom: S[2] }}>
                    SAG provee
                  </div>
                  {governance?.sagContributions && governance.sagContributions.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
                      {governance.sagContributions.map((item, i) => (
                        <div key={i} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                          · {item}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontStyle: "italic" }}>
                      Sin definir
                    </div>
                  )}
                </div>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: "#166534", marginBottom: S[2] }}>
                    Agentik calcula
                  </div>
                  {governance?.agentikContributions && governance.agentikContributions.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
                      {governance.agentikContributions.map((item, i) => (
                        <div key={i} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                          · {item}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontStyle: "italic" }}>
                      Sin definir
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: Fuentes ── */}
        {activeTab === "fuentes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
            {govLoading && <PendingPlaceholder label="Cargando fuentes..." />}
            {!govLoading && (!governance?.sources || governance.sources.length === 0) && (
              <PendingPlaceholder label="Sin fuentes registradas para este KPI" />
            )}
            {!govLoading && governance?.sources.map(source => (
              <div
                key={source.id}
                style={{
                  background:   C.surface,
                  border:       `1px solid ${source.sourceOfTruth ? "#bbf7d0" : C.line}`,
                  borderLeft:   source.sourceOfTruth ? "3px solid #16a34a" : `3px solid ${C.line}`,
                  borderRadius: R.md,
                  padding:      `${S[3]}px`,
                }}
              >
                {/* Source header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[2] }}>
                  <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink }}>
                      {source.sourceName}
                    </span>
                    {source.sourceOfTruth && (
                      <Badge text="SOT Oficial" style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }} />
                    )}
                    {source.sourceTruthPriority && (
                      <Badge
                        text={SOURCE_PRIORITY_LABELS[source.sourceTruthPriority as keyof typeof SOURCE_PRIORITY_LABELS] ?? source.sourceTruthPriority}
                        style={SOURCE_PRIORITY_STYLE[source.sourceTruthPriority] ?? SOURCE_PRIORITY_STYLE["FALLBACK"]}
                      />
                    )}
                  </div>
                  <div style={{ display: "flex", gap: S[1] }}>
                    {source.sagValidated && <Badge text="DBA ✓" style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }} />}
                    {source.businessValidated && <Badge text="Negocio ✓" style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }} />}
                  </div>
                </div>

                {/* Source details */}
                <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
                  <div style={{ display: "flex", gap: S[2] }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, minWidth: 70 }}>Proveedor</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{source.provider} · {source.sourceType}</span>
                  </div>
                  {source.tableName && (
                    <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, minWidth: 70 }}>Tabla SAG</span>
                      <code style={{ fontFamily: T.mono, fontSize: T.sz.xs, background: "#f0f9ff", color: "#0369a1", borderRadius: R.sm, padding: `1px ${S[2]}px` }}>
                        {source.tableName}
                      </code>
                    </div>
                  )}
                  {source.approvedQuery && (
                    <div>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, display: "block", marginBottom: S[1] }}>Query aprobada</span>
                      <code style={{ fontFamily: T.mono, fontSize: 10, background: "#0f172a", color: "#94a3b8", borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, display: "block", lineHeight: 1.5 }}>
                        {source.approvedQuery}
                      </code>
                    </div>
                  )}
                  {source.sourceContribution && (
                    <div style={{ display: "flex", gap: S[2] }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, minWidth: 70 }}>Aporta</span>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{source.sourceContribution}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: S[2] }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, minWidth: 70 }}>Estado</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{source.validationStatus}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>— confianza: {source.confidenceScore}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── TAB: Timeline ── */}
        {activeTab === "timeline" && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>

            {/* Governance stages compact timeline */}
            {!govLoading && governance?.governanceStages && (
              <div>
                <FieldLabel text="Etapas de certificación" />
                <GovernanceTimeline stages={governance.governanceStages} />
              </div>
            )}

            {/* Certification status */}
            {!govLoading && governance && (
              <div>
                <FieldLabel text="Estado de certificación" />
                <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
                  <Badge
                    text={governance.certificationStatus ?? "draft"}
                    style={{ background: C.surfaceAlt, color: C.inkMid, border: `1px solid ${C.line}` }}
                  />
                  {governance.businessApproved && <Badge text="Negocio ✓" style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }} />}
                  {governance.sagApproved       && <Badge text="SAG DBA ✓" style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }} />}
                  {governance.productionReady   && <Badge text="Producción" style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }} />}
                </div>
              </div>
            )}

            {/* Event log */}
            <div>
              <FieldLabel text="Historial de eventos" />
              {govLoading && <PendingPlaceholder label="Cargando timeline..." />}
              {!govLoading && (!governance?.timeline || governance.timeline.length === 0) && (
                <PendingPlaceholder label="Sin eventos registrados" />
              )}
              {!govLoading && governance?.timeline && governance.timeline.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {governance.timeline.map((event, idx) => (
                    <div key={event.id} style={{
                      display:        "flex",
                      gap:            S[3],
                      padding:        `${S[2]}px 0`,
                      borderBottom:   idx < governance.timeline.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.blueDark, marginTop: 5, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, marginBottom: 2 }}>
                          {event.description}
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>
                          {event.actorName ?? event.actorId}
                          {event.actorRole && ` · ${event.actorRole}`}
                          {" · "}{new Date(event.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main workbook panel ──────────────────────────────────────────────────────

export function SagValidationWorkbookPanel({ workbook, orgSlug, meetingMode: initialMeetingMode = false }: Props) {
  const [filterDomain,   setFilterDomain]   = useState<OperationalDomainKey | "all">("all");
  const [filterPriority, setFilterPriority] = useState<"all" | "critical" | "high" | "medium" | "low">("all");
  const [filterState,    setFilterState]    = useState<"all" | "pending" | "answered" | "blocked">("pending");
  const [meetingMode,    setMeetingMode]    = useState(initialMeetingMode);
  const [selectedRow,    setSelectedRow]    = useState<ValidationWorkbookRow | null>(null);
  const [answers,        setAnswers]        = useState<Record<string, string>>({});

  // Keyboard navigation in meeting mode
  useEffect(() => {
    if (!meetingMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedRow(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [meetingMode]);

  const filteredRows = useMemo(() => {
    return workbook.rows.filter(row => {
      if (filterDomain !== "all" && row.domain !== filterDomain) return false;
      if (filterPriority !== "all" && row.priority !== filterPriority) return false;
      if (filterState !== "all" && row.answerState !== filterState) return false;
      return true;
    });
  }, [workbook.rows, filterDomain, filterPriority, filterState]);

  const handleAnswer = useCallback((id: string, answer: string) => {
    setAnswers(prev => ({ ...prev, [id]: answer }));
    setSelectedRow(null);
  }, []);

  const s = workbook.executiveSummary;

  const domainOptions = useMemo(() =>
    Array.from(new Set(workbook.rows.map(r => r.domain))).map(k => ({
      key:   k,
      label: OPERATIONAL_SOURCE_MAP.find(d => d.key === k)?.label ?? k,
    })), [workbook.rows]);

  return (
    <div style={{ position: "relative" }}>

      {/* ── Stats strip ── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        gap:            S[3],
        padding:        `${S[3]}px 0`,
        marginBottom:   S[4],
        borderBottom:   `1px solid ${C.lineSubtle}`,
        flexWrap:       "wrap" as const,
      }}>
        {[
          { label: "Entidades", value: s.totalEntities },
          { label: "Preguntas", value: s.totalQuestions },
          { label: "Pendientes", value: s.byAnswerState.pending },
          { label: "Bloq. críticos", value: s.criticalBlockers, warn: s.criticalBlockers > 0 },
          { label: "Readiness", value: `${s.readinessScore}%`, good: s.readinessScore >= 80 },
        ].map(item => (
          <div key={item.label} className="ag-kpi-card" style={{ padding: `${S[2]}px ${S[3]}px`, minWidth: 90 }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{item.label}</div>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.base, fontWeight: 700,
              color: "warn" in item && item.warn ? "#b91c1c" : "good" in item && item.good ? "#15803d" : C.ink,
            }}>
              {item.value}
            </div>
          </div>
        ))}

        <div style={{ marginLeft: "auto", display: "flex", gap: S[2] }}>
          <button
            className={meetingMode ? "ag-action-primary" : "ag-action-ghost"}
            onClick={() => setMeetingMode(m => !m)}
            style={{ fontSize: T.sz.xs }}
          >
            {meetingMode ? "🎙 Reunión activa" : "Modo reunión"}
          </button>
          <a
            href={`/api/orgs/${orgSlug}/operational-map/workbook?format=checklist_csv`}
            download="agentik-sag-checklist.csv"
            className="ag-action-ghost"
            style={{ fontSize: T.sz.xs, textDecoration: "none" }}
          >
            ↓ Checklist CSV
          </a>
          <a
            href={`/api/orgs/${orgSlug}/operational-map/workbook?format=checklist_md`}
            download="agentik-sag-checklist.md"
            className="ag-action-ghost"
            style={{ fontSize: T.sz.xs, textDecoration: "none" }}
          >
            ↓ Markdown
          </a>
        </div>
      </div>

      {/* ── Critical blockers rail ── */}
      {workbook.blockers.filter(b => b.blockerLevel === "critical").length > 0 && (
        <div style={{
          background:   "#fee2e2",
          border:       "1px solid #fca5a5",
          borderRadius: R.lg,
          padding:      `${S[3]}px ${S[4]}px`,
          marginBottom: S[4],
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: "#b91c1c", marginBottom: S[2] }}>
            🚨 BLOQUEADORES CRÍTICOS — sin resolver bloquean operación
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
            {workbook.blockers.filter(b => b.blockerLevel === "critical").map(b => (
              <div key={b.id} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: "#7f1d1d" }}>
                <strong>{b.domainLabel} › {b.entityLabel}:</strong> {b.reason}
                {b.degradedFlows.length > 0 && (
                  <span style={{ color: "#991b1b" }}> → afecta: {b.degradedFlows.join(", ")}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{
        display:      "flex",
        gap:          S[3],
        marginBottom: S[4],
        flexWrap:     "wrap" as const,
        alignItems:   "center",
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>Filtrar:</div>

        <select
          value={filterDomain}
          onChange={e => setFilterDomain(e.target.value as OperationalDomainKey | "all")}
          style={{ fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`, border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.surface, color: C.ink }}
        >
          <option value="all">Todos los dominios</option>
          {domainOptions.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>

        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value as typeof filterPriority)}
          style={{ fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`, border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.surface, color: C.ink }}
        >
          <option value="all">Toda prioridad</option>
          <option value="critical">Crítica</option>
          <option value="high">Alta</option>
          <option value="medium">Media</option>
          <option value="low">Baja</option>
        </select>

        <select
          value={filterState}
          onChange={e => setFilterState(e.target.value as typeof filterState)}
          style={{ fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`, border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.surface, color: C.ink }}
        >
          <option value="all">Todos los estados</option>
          <option value="pending">Pendientes</option>
          <option value="answered">Respondidas</option>
          <option value="blocked">Bloqueadas</option>
        </select>

        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginLeft: "auto" }}>
          {filteredRows.length} filas
        </div>
      </div>

      {/* ── Table ── */}
      <div className="ag-op-table">
        {/* Header */}
        <div style={{
          display:       "grid",
          gridTemplateColumns: meetingMode
            ? "80px 160px 1fr 80px 80px"
            : "80px 140px 160px 1fr 80px 80px 80px",
          gap:           S[3],
          padding:       `${S[2]}px ${S[3]}px`,
          background:    C.surfaceAlt,
          borderBottom:  `1px solid ${C.line}`,
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         C.inkFaint,
          letterSpacing: "0.08em",
        }}>
          <span>PRIORIDAD</span>
          <span>DOMINIO</span>
          {!meetingMode && <span>ENTIDAD</span>}
          <span>PREGUNTA</span>
          {!meetingMode && <span>TABLA SAG</span>}
          <span>SOT</span>
          <span>ESTADO</span>
        </div>

        {filteredRows.length === 0 ? (
          <div style={{ padding: `${S[6]}px`, textAlign: "center" as const, fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint }}>
            Sin filas para los filtros actuales
          </div>
        ) : (
          filteredRows.map(row => {
            const isAnswered = row.id in answers || row.answerState === "answered";
            return (
              <div
                key={row.id}
                className="ag-op-row"
                onClick={() => setSelectedRow(row)}
                style={{
                  display:       "grid",
                  gridTemplateColumns: meetingMode
                    ? "80px 160px 1fr 80px 80px"
                    : "80px 140px 160px 1fr 80px 80px 80px",
                  gap:           S[3],
                  padding:       `${S[2]}px ${S[3]}px`,
                  borderBottom:  `1px solid ${C.lineSubtle}`,
                  cursor:        "pointer",
                  background:    isAnswered ? "#f0fdf4" : row.blockerLevel === "critical" ? "#fff5f5" : C.surface,
                  opacity:       isAnswered ? 0.7 : 1,
                  alignItems:    "center",
                }}
              >
                <span>
                  <Badge text={row.priority} style={{ ...PRIORITY_STYLE[row.priority], fontSize: T.sz["2xs"] }} />
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                  {row.domainLabel}
                </span>
                {!meetingMode && (
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: 600 }}>
                    {row.entityLabel}
                    {row.blockerLevel !== "none" && (
                      <span style={{ marginLeft: S[1], fontSize: T.sz["2xs"], color: "#dc2626" }}>🚨</span>
                    )}
                  </span>
                )}
                <span style={{
                  fontFamily:    T.mono,
                  fontSize:      T.sz.xs,
                  color:         C.ink,
                  overflow:      "hidden",
                  textOverflow:  "ellipsis",
                  whiteSpace:    "nowrap" as const,
                }}>
                  {meetingMode && <strong>{row.entityLabel}: </strong>}
                  {row.validationQuestion}
                </span>
                {!meetingMode && (
                  <span>
                    <code style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], background: "#eff6ff", color: "#1d4ed8", borderRadius: R.sm, padding: `1px ${S[1]}px` }}>
                      {row.sagTableCandidate ?? "?"}
                    </code>
                  </span>
                )}
                <span>
                  <Badge text={row.sourceOfTruth} style={{ ...SOT_STYLE[row.sourceOfTruth] ?? SOT_STYLE["SAG"], fontSize: T.sz["2xs"] }} />
                </span>
                <span style={{ ...ANSWER_STYLE[isAnswered ? "answered" : row.answerState], fontFamily: T.mono, fontSize: T.sz["2xs"] }}>
                  {isAnswered ? "✅" : row.answerState === "blocked" ? "🚫" : "⬜"}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* ── Detail drawer ── */}
      {selectedRow && (
        <>
          <div
            onClick={() => setSelectedRow(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.2)", zIndex: 99 }}
          />
          <RowDetailPanel
            row={selectedRow}
            orgSlug={orgSlug}
            onClose={() => setSelectedRow(null)}
            onAnswer={handleAnswer}
            meetingMode={meetingMode}
          />
        </>
      )}
    </div>
  );
}
