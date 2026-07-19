"use client";

/**
 * components/operational-map/core-kpi-certification-panel.tsx
 *
 * Core KPI Certification Panel — 10 KPIs Núcleo.
 *
 * Enterprise governance table for the 10 certified core KPIs.
 * Replaces the workbook rows for these KPIs with a dedicated
 * governance-first view showing:
 *   - KPI label + domain
 *   - Dependency type (SAG / Agentik / Híbrido / ...)
 *   - Criticality level
 *   - Formula status
 *   - Certification status
 *   - AI copilot readiness
 *   - DBA pending count
 *
 * Clicking a row opens the governance drawer (fetches from DB).
 * "Sembrar base" button bootstraps all 10 presets to DB.
 *
 * Sprint: AGENTIK-OPS-CERTIFICATION-CORE-10KPIS-01
 */

import { useState, useCallback }     from "react";
import { C, T, S, R }               from "@/lib/ui/tokens";
import type { CoreKpiGovernancePreset } from "@/lib/operational-map/certification/core-kpi-governance-presets";
import {
  CERT_STATUS_DISPLAY,
  FORMULA_STATUS_DISPLAY,
}                                    from "@/lib/operational-map/certification/core-kpi-governance-presets";
import type { KpiGovernanceRecord }  from "@/lib/operational-map/certification/operational-kpi-governance-types";
import {
  DEPENDENCY_TYPE_LABELS,
  CRITICALITY_LABELS,
  GOVERNANCE_TIMELINE_STAGES,
}                                    from "@/lib/operational-map/certification/operational-kpi-governance-types";
import { LineageView }               from "@/components/operational-map/lineage-view";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  presets:      CoreKpiGovernancePreset[];
  orgSlug:      string;
  meetingMode?: boolean;
}

// ─── Micro badge ──────────────────────────────────────────────────────────────

function MBadge({ text, style }: { text: string; style: React.CSSProperties }) {
  return (
    <span style={{
      display:      "inline-block",
      fontFamily:   T.mono,
      fontSize:     9,
      fontWeight:   600,
      padding:      `2px 6px`,
      borderRadius: R.sm,
      letterSpacing: "0.04em",
      lineHeight:   1.35,
      wordBreak:    "break-word",
      overflowWrap: "break-word",
      ...style,
    }}>
      {text}
    </span>
  );
}

// ─── Dependency badge styles ──────────────────────────────────────────────────

const DEP_STYLE: Record<string, React.CSSProperties> = {
  SAG_ONLY:     { background: "#dbeafe", color: "#1e40af", border: "1px solid #93c5fd" },
  AGENTIK_ONLY: { background: "#dcfce7", color: "#14532d", border: "1px solid #86efac" },
  HYBRID:       { background: "#e0e7ff", color: "#3730a3", border: "1px solid #a5b4fc" },
  CRM:          { background: "#fae8ff", color: "#6b21a8", border: "1px solid #d8b4fe" },
  MANUAL:       { background: "#fef9c3", color: "#713f12", border: "1px solid #fde047" },
  EXTERNAL:     { background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1" },
};

const CRIT_STYLE: Record<string, React.CSSProperties> = {
  CRITICAL:      { background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" },
  OPERATIONAL:   { background: "#dbeafe", color: "#1e40af", border: "1px solid #93c5fd" },
  INFORMATIONAL: { background: "#f1f5f9", color: "#475569", border: "1px solid #cbd5e1" },
  EXPERIMENTAL:  { background: "#fae8ff", color: "#6b21a8", border: "1px solid #d8b4fe" },
};

// ─── Governance drawer (right panel) ─────────────────────────────────────────

type DrawerTab = "overview" | "formula" | "fuentes" | "timeline" | "lineage";

function GovernanceDrawer({
  preset,
  orgSlug,
  onClose,
}: {
  preset:   CoreKpiGovernancePreset;
  orgSlug:  string;
  onClose:  () => void;
}) {
  const [tab,      setTab]      = useState<DrawerTab>("overview");
  const [govData,  setGovData]  = useState<KpiGovernanceRecord | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [loaded,   setLoaded]   = useState(false);

  // Lazy-load governance DB record on first tab switch to formula/fuentes/timeline
  const ensureLoaded = useCallback(async () => {
    if (loaded) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/operational-map/kpi-governance/${preset.kpiKey}`);
      const data = await res.json();
      if (data?.ok) setGovData(data.record as KpiGovernanceRecord);
    } catch {}
    setLoading(false);
    setLoaded(true);
  }, [loaded, orgSlug, preset.kpiKey]);

  const switchTab = async (t: DrawerTab) => {
    setTab(t);
    if (t !== "overview") await ensureLoaded();
  };

  const certStyle = CERT_STATUS_DISPLAY[preset.certificationStatus];
  const fmtStyle  = FORMULA_STATUS_DISPLAY[preset.formulaStatus];

  const handlePatch = async (fields: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetch(`/api/orgs/${orgSlug}/operational-map/kpi-governance/${preset.kpiKey}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(fields),
      });
      // Reload
      const res  = await fetch(`/api/orgs/${orgSlug}/operational-map/kpi-governance/${preset.kpiKey}`);
      const data = await res.json();
      if (data?.ok) setGovData(data.record as KpiGovernanceRecord);
    } catch {}
    setSaving(false);
  };

  const tabs: { key: DrawerTab; label: string }[] = [
    { key: "overview",  label: "KPI" },
    { key: "formula",   label: "Fórmula" },
    { key: "fuentes",   label: "Fuentes" },
    { key: "lineage",   label: "Vista Ops" },
    { key: "timeline",  label: "Timeline" },
  ];

  return (
    <div style={{
      position:      "fixed",
      right:         0,
      top:           0,
      bottom:        0,
      width:         500,
      background:    C.surface,
      borderLeft:    `1px solid ${C.line}`,
      boxShadow:     "-4px 0 32px rgba(0,0,0,0.12)",
      zIndex:        200,
      display:       "flex",
      flexDirection: "column",
      overflow:      "hidden",
    }}>

      {/* ── Header ── */}
      <div style={{
        padding:      `${S[4]}px`,
        borderBottom: `1px solid ${C.line}`,
        flexShrink:   0,
        background:   C.surface,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: S[3] }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Badge row */}
            <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const, marginBottom: S[2] }}>
              <MBadge text={DEPENDENCY_TYPE_LABELS[preset.dependencyType] ?? preset.dependencyType} style={DEP_STYLE[preset.dependencyType] ?? DEP_STYLE["EXTERNAL"]} />
              <MBadge text={CRITICALITY_LABELS[preset.criticality] ?? preset.criticality} style={CRIT_STYLE[preset.criticality] ?? CRIT_STYLE["INFORMATIONAL"]} />
              <MBadge text={certStyle.label} style={{ background: certStyle.bg, color: certStyle.color, border: `1px solid ${certStyle.border}` }} />
              {preset.aiReadinessActive && (
                <MBadge text="IA activa" style={{ background: "#dcfce7", color: "#14532d", border: "1px solid #86efac" }} />
              )}
            </div>
            {/* Title */}
            <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: 700, color: C.ink }}>
              {preset.entityLabel}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
              {preset.domain.replace(/_/g, " ")} · {preset.frequency} · {preset.priority}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ fontFamily: T.mono, fontSize: 20, color: C.inkFaint, background: "none", border: "none", cursor: "pointer", lineHeight: 1, flexShrink: 0 }}
          >×</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", marginTop: S[3], borderBottom: `1px solid ${C.line}` }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                fontWeight:   tab === t.key ? 700 : T.wt.normal,
                color:        tab === t.key ? C.blueDark : C.inkMid,
                background:   "none",
                border:       "none",
                borderBottom: tab === t.key ? `2px solid ${C.blueDark}` : "2px solid transparent",
                cursor:       "pointer",
                padding:      `${S[2]}px ${S[3]}px`,
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: `${S[4]}px` }}>

        {/* ── TAB: KPI Overview ── */}
        {tab === "overview" && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>

            {/* Definición negocio */}
            <Section label="Definición de negocio">
              <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.6, margin: 0 }}>
                {preset.businessDefinition}
              </p>
            </Section>

            {/* Owners */}
            <Section label="Ownership operacional">
              <OwnerRow label="Negocio"  value={preset.ownerBusiness} />
              <OwnerRow label="Técnico"  value={preset.ownerTechnical} />
              <OwnerRow label="SAG DBA"  value={preset.ownerSag} />
            </Section>

            {/* Pending DBA items */}
            {preset.dbaPendingItems.length > 0 && (
              <Section label={`Pendientes DBA (${preset.dbaPendingItems.length})`}>
                <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                  {preset.dbaPendingItems.map((item, i) => (
                    <div key={i} style={{
                      display:      "flex",
                      gap:          S[2],
                      fontFamily:   T.mono,
                      fontSize:     T.sz.xs,
                      color:        C.inkMid,
                      padding:      `${S[2]}px`,
                      background:   "#fffbeb",
                      border:       "1px solid #fde68a",
                      borderRadius: R.sm,
                    }}>
                      <span style={{ color: "#92400e", flexShrink: 0 }}>▸</span>
                      {item}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* AI Copilot readiness */}
            <Section label="Copilot / IA">
              <div style={{
                background:   preset.aiReadinessActive ? "#f0fdf4" : C.surfaceAlt,
                border:       `1px solid ${preset.aiReadinessActive ? "#bbf7d0" : C.line}`,
                borderRadius: R.md,
                padding:      `${S[3]}px`,
              }}>
                <div style={{ display: "flex", gap: S[2], alignItems: "center", marginBottom: S[2] }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: preset.aiReadinessActive ? "#166534" : C.inkMid }}>
                    {preset.aiReadinessActive ? "Interpretación IA disponible" : "Interpretación IA — pendiente"}
                  </span>
                </div>
                <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, margin: 0, lineHeight: 1.5 }}>
                  {preset.aiCopilotReadiness}
                </p>
              </div>
            </Section>
          </div>
        )}

        {/* ── TAB: Fórmula ── */}
        {tab === "formula" && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>

            {/* Formula expression */}
            <Section label="Expresión de fórmula">
              <div style={{ display: "flex", gap: S[2], alignItems: "center", marginBottom: S[2] }}>
                <MBadge text={fmtStyle.label} style={{ color: fmtStyle.color, background: `${fmtStyle.color}18`, border: `1px solid ${fmtStyle.color}40` }} />
              </div>
              <code style={{
                display:      "block",
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                background:   "#0f172a",
                color:        "#e2e8f0",
                borderRadius: R.md,
                padding:      `${S[3]}px`,
                lineHeight:   1.7,
                whiteSpace:   "pre-wrap" as const,
              }}>
                {preset.formulaExpression}
              </code>
            </Section>

            {/* Formula description */}
            <Section label="Descripción operacional">
              <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.6, margin: 0 }}>
                {preset.formulaDescription}
              </p>
            </Section>

            {/* SAG vs Agentik split */}
            <Section label="Separación SAG / Agentik">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
                <ContribBlock
                  title="SAG provee"
                  color="#1e40af"
                  bg="#eff6ff"
                  border="#bfdbfe"
                  items={preset.sagContributions}
                />
                <ContribBlock
                  title="Agentik calcula"
                  color="#14532d"
                  bg="#f0fdf4"
                  border="#bbf7d0"
                  items={preset.agentikContributions}
                />
              </div>
            </Section>

            {/* DB formula if available */}
            {loading && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontStyle: "italic" }}>
                Cargando definición desde BD...
              </div>
            )}
            {govData?.formula.formulaExpression && govData.formula.formulaExpression !== preset.formulaExpression && (
              <Section label="Fórmula personalizada (BD)">
                <code style={{
                  display:    "block",
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  background: "#0f172a",
                  color:      "#a5b4fc",
                  borderRadius: R.md,
                  padding:    `${S[3]}px`,
                  lineHeight: 1.7,
                }}>
                  {govData.formula.formulaExpression}
                </code>
              </Section>
            )}

            {/* Classification selectors */}
            <Section label="Clasificación operacional">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[3] }}>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, marginBottom: S[1], letterSpacing: "0.06em" }}>
                    TIPO DEPENDENCIA
                  </div>
                  <select
                    defaultValue={preset.dependencyType}
                    onChange={e => handlePatch({ dependencyType: e.target.value })}
                    disabled={saving}
                    style={{ width: "100%", fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`, border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.surface, color: C.ink }}
                  >
                    <option value="SAG_ONLY">SAG_ONLY</option>
                    <option value="AGENTIK_ONLY">AGENTIK_ONLY</option>
                    <option value="HYBRID">HYBRID</option>
                    <option value="CRM">CRM</option>
                    <option value="MANUAL">MANUAL</option>
                    <option value="EXTERNAL">EXTERNAL</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint, marginBottom: S[1], letterSpacing: "0.06em" }}>
                    CRITICIDAD
                  </div>
                  <select
                    defaultValue={preset.criticality}
                    onChange={e => handlePatch({ criticality: e.target.value })}
                    disabled={saving}
                    style={{ width: "100%", fontFamily: T.mono, fontSize: T.sz.xs, padding: `${S[1]}px ${S[2]}px`, border: `1px solid ${C.line}`, borderRadius: R.sm, background: C.surface, color: C.ink }}
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="OPERATIONAL">OPERATIONAL</option>
                    <option value="INFORMATIONAL">INFORMATIONAL</option>
                    <option value="EXPERIMENTAL">EXPERIMENTAL</option>
                  </select>
                </div>
              </div>
            </Section>
          </div>
        )}

        {/* ── TAB: Fuentes ── */}
        {tab === "fuentes" && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
            {loading && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontStyle: "italic" }}>
                Cargando fuentes desde BD...
              </div>
            )}

            {/* SAG contributions as source cards */}
            <Section label="Fuentes SAG esperadas">
              <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                {preset.sagContributions.map((item, i) => (
                  <div key={i} style={{
                    fontFamily:   T.mono,
                    fontSize:     T.sz.xs,
                    color:        C.ink,
                    background:   "#f0f9ff",
                    border:       "1px solid #bae6fd",
                    borderLeft:   "3px solid #0284c7",
                    borderRadius: R.sm,
                    padding:      `${S[2]}px ${S[3]}px`,
                    lineHeight:   1.5,
                  }}>
                    {item}
                  </div>
                ))}
              </div>
            </Section>

            {/* Agentik contributions */}
            <Section label="Capa Agentik">
              <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                {preset.agentikContributions.map((item, i) => (
                  <div key={i} style={{
                    fontFamily:   T.mono,
                    fontSize:     T.sz.xs,
                    color:        C.ink,
                    background:   "#f0fdf4",
                    border:       "1px solid #bbf7d0",
                    borderLeft:   "3px solid #16a34a",
                    borderRadius: R.sm,
                    padding:      `${S[2]}px ${S[3]}px`,
                    lineHeight:   1.5,
                  }}>
                    {item}
                  </div>
                ))}
              </div>
            </Section>

            {/* DB sources if available */}
            {!loading && govData?.sources && govData.sources.length > 0 && (
              <Section label={`Fuentes registradas en BD (${govData.sources.length})`}>
                <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                  {govData.sources.map(src => (
                    <div key={src.id} style={{
                      background:   C.surface,
                      border:       `1px solid ${src.sourceOfTruth ? "#bbf7d0" : C.line}`,
                      borderLeft:   src.sourceOfTruth ? "3px solid #16a34a" : `3px solid ${C.line}`,
                      borderRadius: R.md,
                      padding:      `${S[2]}px ${S[3]}px`,
                    }}>
                      <div style={{ display: "flex", gap: S[2], alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink }}>{src.sourceName}</span>
                        {src.sourceOfTruth && <MBadge text="SOT Oficial" style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }} />}
                        {src.sagValidated    && <MBadge text="DBA ✓"     style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }} />}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>
                        {src.provider} · {src.sourceType} · confianza: {src.confidenceScore}%
                      </div>
                      {src.tableName && (
                        <code style={{ fontFamily: T.mono, fontSize: 10, color: "#0369a1", background: "#f0f9ff", borderRadius: R.sm, padding: `1px 4px` }}>
                          {src.tableName}
                        </code>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}
            {!loading && (!govData?.sources || govData.sources.length === 0) && (
              <div style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                color:        C.inkFaint,
                background:   C.surfaceAlt,
                border:       `1px dashed ${C.line}`,
                borderRadius: R.md,
                padding:      `${S[3]}px`,
                fontStyle:    "italic",
              }}>
                Sin fuentes registradas en BD. Usa el bootstrap o agrega fuentes manualmente en la reunión.
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Vista Operacional (lineage) ── */}
        {tab === "lineage" && (
          <LineageView kpiKey={preset.kpiKey} entityLabel={preset.entityLabel} />
        )}

        {/* ── TAB: Timeline ── */}
        {tab === "timeline" && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>

            {/* Governance stages */}
            <Section label="Etapas de certificación">
              <div style={{ display: "flex", gap: 0, overflowX: "auto", paddingBottom: S[2] }}>
                {GOVERNANCE_TIMELINE_STAGES.map((stage, idx) => {
                  const dbStages  = govData?.governanceStages ?? [];
                  const dbStage   = dbStages.find(s => s.key === stage.key);
                  const status    = dbStage?.status ?? "pending";

                  return (
                    <div key={stage.key} style={{ display: "flex", alignItems: "flex-start", flexShrink: 0 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: S[1] }}>
                        <div style={{
                          width:      28, height: 28, borderRadius: "50%",
                          background: status === "done" ? "#166534" : status === "blocked" ? "#991b1b" : C.surfaceAlt,
                          border:     `2px solid ${status === "done" ? "#bbf7d0" : status === "blocked" ? "#fca5a5" : C.line}`,
                          display:    "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: T.mono, fontSize: T.sz.xs, flexShrink: 0,
                          color:      status === "done" || status === "blocked" ? "#fff" : C.inkFaint,
                        }}>
                          {status === "done" ? "✓" : status === "blocked" ? "✕" : idx + 1}
                        </div>
                        <div style={{
                          fontFamily: T.mono, fontSize: 9, textAlign: "center" as const,
                          color:      status === "done" ? "#166534" : status === "blocked" ? "#991b1b" : C.inkFaint,
                          maxWidth:   72, lineHeight: 1.3,
                        }}>
                          {stage.label}
                        </div>
                      </div>
                      {idx < GOVERNANCE_TIMELINE_STAGES.length - 1 && (
                        <div style={{ width: 20, height: 2, background: status === "done" ? "#bbf7d0" : C.lineSubtle, marginTop: 13, flexShrink: 0 }} />
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* Certification current state */}
            <Section label="Estado actual">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
                <StatusCell label="Certificación" value={CERT_STATUS_DISPLAY[preset.certificationStatus].label} color={CERT_STATUS_DISPLAY[preset.certificationStatus].color} />
                <StatusCell label="Fórmula" value={FORMULA_STATUS_DISPLAY[preset.formulaStatus].label} color={FORMULA_STATUS_DISPLAY[preset.formulaStatus].color} />
                <StatusCell label="Negocio" value={govData?.businessApproved ? "Aprobado ✓" : "Pendiente"} color={govData?.businessApproved ? "#166534" : C.inkFaint} />
                <StatusCell label="SAG DBA" value={govData?.sagApproved ? "Aprobado ✓" : "Pendiente"} color={govData?.sagApproved ? "#166534" : C.inkFaint} />
              </div>
            </Section>

            {/* Event log */}
            {loading && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontStyle: "italic" }}>
                Cargando historial...
              </div>
            )}
            {!loading && govData?.timeline && govData.timeline.length > 0 && (
              <Section label={`Historial (${govData.timeline.length} eventos)`}>
                <div>
                  {govData.timeline.map((e, i) => (
                    <div key={e.id} style={{
                      display:      "flex",
                      gap:          S[3],
                      padding:      `${S[2]}px 0`,
                      borderBottom: i < govData.timeline.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.blueDark, marginTop: 4, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{e.description}</div>
                        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>
                          {e.actorName ?? e.actorId}{e.actorRole && ` · ${e.actorRole}`}
                          {" · "}{new Date(e.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}
            {!loading && (!govData?.timeline || govData.timeline.length === 0) && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontStyle: "italic" }}>
                Sin eventos registrados. Ejecuta "Sembrar presets" para inicializar el historial.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      10,
        color:         C.inkFaint,
        letterSpacing: "0.07em",
        marginBottom:  S[2],
        textTransform: "uppercase" as const,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function OwnerRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: S[2], marginBottom: S[1] }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, minWidth: 64 }}>{label}</span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{value}</span>
    </div>
  );
}

function ContribBlock({ title, color, bg, border, items }: {
  title: string; color: string; bg: string; border: string; items: string[];
}) {
  return (
    <div style={{
      background:   bg,
      border:       `1px solid ${border}`,
      borderRadius: R.md,
      padding:      `${S[3]}px`,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color, marginBottom: S[2] }}>
        {title}
      </div>
      {items.map((item, i) => (
        <div key={i} style={{ fontFamily: T.mono, fontSize: 10, color: C.inkMid, marginBottom: 3, lineHeight: 1.4 }}>
          · {item}
        </div>
      ))}
    </div>
  );
}

function StatusCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: C.surfaceAlt, borderRadius: R.sm, padding: `${S[2]}px` }}>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkFaint }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function CoreKpiCertificationPanel({ presets, orgSlug, meetingMode = false }: Props) {
  const [selected,       setSelected]       = useState<CoreKpiGovernancePreset | null>(null);
  const [bootstrapping,  setBootstrapping]  = useState(false);
  const [bootstrapDone,  setBootstrapDone]  = useState(false);
  const [bootstrapMsg,   setBootstrapMsg]   = useState("");

  const handleBootstrap = async () => {
    setBootstrapping(true);
    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/operational-map/kpi-governance/bootstrap-core`, {
        method: "POST",
      });
      const data = await res.json();
      setBootstrapDone(true);
      setBootstrapMsg(data.message ?? "Presets sembrados");
    } catch {
      setBootstrapMsg("Error al sembrar presets");
    }
    setBootstrapping(false);
  };

  const critCount     = presets.filter(p => p.criticality === "CRITICAL").length;
  const blockedCount  = presets.filter(p => p.certificationStatus === "blocked").length;
  const validatedCount = presets.filter(p =>
    ["technical_validated", "business_validated", "sag_validated", "certified", "production_ready"].includes(p.certificationStatus)
  ).length;
  const reviewCount  = presets.filter(p => p.certificationStatus === "reviewing").length;
  const pendingCount = presets.filter(p => p.certificationStatus === "draft").length;

  return (
    <div>
      {/* ── Section header ── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   S[3],
        paddingBottom:  S[3],
        borderBottom:   `1px solid ${C.line}`,
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: 700, color: C.ink }}>
            Núcleo de Certificación Operacional
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
            {presets.length} KPIs revisados · {critCount} críticos · {validatedCount} validados · {blockedCount} requieren acceso
          </div>
        </div>

        <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
          {bootstrapDone && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: "#166534" }}>✓ {bootstrapMsg}</span>
          )}
          <button
            className="ag-action-ghost"
            onClick={handleBootstrap}
            disabled={bootstrapping}
            style={{ fontSize: T.sz.xs }}
          >
            {bootstrapping ? "Sembrando..." : "↓ Sembrar presets"}
          </button>
        </div>
      </div>

      {/* ── FASE 3 — Executive KPI summary strip ── */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap:                 S[2],
        marginBottom:        S[4],
      }}>
        {[
          { icon: "✅", label: "Validados",              value: validatedCount, color: "#166534", bg: "#f0fdf4", border: "#bbf7d0" },
          { icon: "🟡", label: "Requieren validación",   value: reviewCount,    color: "#92400e", bg: "#fffbeb", border: "#fde68a" },
          { icon: "🔴", label: "Requieren acceso",       value: blockedCount,   color: "#991b1b", bg: "#fee2e2", border: "#fca5a5" },
          { icon: "⚪", label: "Pendientes de revisión", value: pendingCount,   color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" },
        ].map(tile => (
          <div key={tile.label} style={{
            background:   tile.bg,
            border:       `1px solid ${tile.border}`,
            borderRadius: R.md,
            padding:      `${S[2]}px ${S[3]}px`,
            minHeight:    72,
            display:      "flex",
            flexDirection: "column" as const,
            justifyContent: "space-between",
            minWidth:     0,
          }}>
            <div style={{ fontFamily: T.mono, fontSize: 9, color: tile.color, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {tile.icon} {tile.label}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: "22px", fontWeight: 700, color: tile.color, lineHeight: 1, marginTop: S[1] }}>
              {tile.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── FASE 4 — Bloqueador principal ── */}
      {blockedCount > 0 && (
        <div style={{
          background:   "#fef2f2",
          border:       "1.5px solid #fca5a5",
          borderLeft:   "4px solid #dc2626",
          borderRadius: R.md,
          padding:      `${S[3]}px ${S[4]}px`,
          marginBottom: S[4],
          display:      "flex",
          gap:          S[3],
          alignItems:   "flex-start",
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: "#dc2626", flexShrink: 0, marginTop: 1 }}>▲</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: "#991b1b", marginBottom: S[1] }}>
              Bloqueador principal detectado · Histórico de pagos y recaudos
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: "#991b1b", marginBottom: S[2], lineHeight: 1.45 }}>
              <strong>Impacto:</strong> Impide conciliación histórica completa entre ventas y recaudos.
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: "#7f1d1d", lineHeight: 1.45 }}>
              <strong>Acción requerida:</strong> Definir método oficial de extracción histórica con SAG.
            </div>
          </div>
          <span style={{
            fontFamily: T.mono, fontSize: 8, fontWeight: 700,
            color: "#991b1b", background: "#fee2e2",
            border: "1px solid #fca5a5", borderRadius: R.sm,
            padding: `2px ${S[2]}px`, whiteSpace: "nowrap" as const, flexShrink: 0,
          }}>
            {blockedCount} KPI{blockedCount !== 1 ? "s" : ""} bloqueado{blockedCount !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* ── KPI governance table ── */}
      <div className="ag-op-table">
        {/* Header */}
        <div style={{
          display:             "grid",
          gridTemplateColumns: meetingMode ? "2fr 120px 95px 155px 160px" : "2fr 120px 95px 155px 160px 36px",
          gap:                 S[3],
          padding:             `${S[2]}px ${S[4]}px`,
          background:          C.surfaceAlt,
          borderBottom:        `1px solid ${C.line}`,
          fontFamily:          T.mono,
          fontSize:            8,
          color:               C.inkFaint,
          letterSpacing:       "0.09em",
          textTransform:       "uppercase" as const,
        }}>
          <span>KPI</span>
          <span>Fuente</span>
          <span>Criticidad</span>
          <span>Estado</span>
          <span>Validación requerida</span>
          {!meetingMode && <span>IA</span>}
        </div>

        {presets.map(preset => {
          const certStyle = CERT_STATUS_DISPLAY[preset.certificationStatus];
          const fmtStyle  = FORMULA_STATUS_DISPLAY[preset.formulaStatus];

          return (
            <div
              key={preset.kpiKey}
              className="ag-op-row"
              onClick={() => setSelected(preset)}
              style={{
                display:             "grid",
                gridTemplateColumns: meetingMode ? "2fr 120px 95px 155px 160px" : "2fr 120px 95px 155px 160px 36px",
                gap:                 S[3],
                padding:             `${S[3]}px ${S[4]}px`,
                borderBottom:        `1px solid ${C.lineSubtle}`,
                cursor:              "pointer",
                alignItems:          "flex-start",
              }}
            >
              {/* KPI name + domain */}
              <div style={{ minWidth: 0, paddingTop: 2 }}>
                <div style={{
                  fontFamily:   T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink,
                  overflow:     "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
                  marginBottom: 2,
                }}>
                  {preset.entityLabel}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, lineHeight: 1.3 }}>
                  {preset.domain.replace(/_/g, " ")}
                </div>
              </div>

              {/* Dependency type */}
              <div style={{ minWidth: 0 }}>
                <MBadge
                  text={DEPENDENCY_TYPE_LABELS[preset.dependencyType] ?? preset.dependencyType}
                  style={DEP_STYLE[preset.dependencyType] ?? DEP_STYLE["EXTERNAL"]}
                />
              </div>

              {/* Criticality */}
              <div style={{ minWidth: 0 }}>
                <MBadge
                  text={CRITICALITY_LABELS[preset.criticality] ?? preset.criticality}
                  style={CRIT_STYLE[preset.criticality] ?? CRIT_STYLE["INFORMATIONAL"]}
                />
              </div>

              {/* Certification status */}
              <div style={{ minWidth: 0 }}>
                <MBadge
                  text={certStyle.label}
                  style={{ background: certStyle.bg, color: certStyle.color, border: `1px solid ${certStyle.border}` }}
                />
              </div>

              {/* Formula status */}
              <div style={{ minWidth: 0 }}>
                <MBadge
                  text={fmtStyle.label}
                  style={{ color: fmtStyle.color, background: `${fmtStyle.color}14`, border: `1px solid ${fmtStyle.color}40` }}
                />
              </div>

              {/* AI readiness — hidden in meeting mode */}
              {!meetingMode && (
                <div style={{ paddingTop: 3, textAlign: "center" as const }}>
                  <span style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz.sm,
                    color:      preset.aiReadinessActive ? "#166534" : C.inkGhost,
                  }}>
                    {preset.aiReadinessActive ? "●" : "○"}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Drawer overlay ── */}
      {selected && (
        <>
          <div
            onClick={() => setSelected(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 199 }}
          />
          <GovernanceDrawer
            preset={selected}
            orgSlug={orgSlug}
            onClose={() => setSelected(null)}
          />
        </>
      )}
    </div>
  );
}
