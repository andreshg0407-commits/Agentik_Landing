"use client";

/**
 * components/reconciliation/execution-observability-panel.tsx
 *
 * AGENTIK-RECON-EXECUTION-OBSERVABILITY-01
 * Execution Observability Panel
 *
 * Renders the full execution report from a rule engine run.
 * Two modes:
 *   detail  — Technical view: loader diagnostics, rule breakdown, pipeline metrics, narrative
 *   meeting — SAG Meeting Mode: compact readiness grid for all sources
 *
 * Props: raw data from the API response (RuleEngineResponse).
 * No state fetching — pure display component.
 *
 * Design rules:
 *   - T.mono for ALL data
 *   - ag-op-table / ag-op-row for tables
 *   - ag-op-status for status chips
 *   - C.* tokens for colors, S.* for spacing, R.* for radius
 */

import React, { useState } from "react";
import { C, S, T, R }      from "@/lib/ui/tokens";
import type {
  ExecutionReport,
  LoaderDiagnosticsReport,
  RuleBreakdownEntry,
  SourceReadinessEntry,
}                          from "@/lib/reconciliation/observability/execution-report";

// ── Readiness meta (client-safe) ───────────────────────────────────────────────

const READINESS_DISPLAY: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  available:               { label: "DISPONIBLE",       color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0", dot: "#22c55e" },
  pending_sag_validation:  { label: "VALIDACIÓN PUC",   color: "#92400e", bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b" },
  pending_integration:     { label: "PENDIENTE",         color: "#92400e", bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b" },
  requires_integration:    { label: "REQ. INTEGRACIÓN",  color: "#1e40af", bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6" },
  requires_upload:         { label: "REQ. ARCHIVO",      color: "#1e40af", bg: "#eff6ff", border: "#bfdbfe", dot: "#3b82f6" },
  requires_credential:     { label: "REQ. CREDENCIAL",   color: "#6b21a8", bg: "#faf5ff", border: "#e9d5ff", dot: "#a855f7" },
  unavailable:             { label: "NO DISPONIBLE",     color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb", dot: "#9ca3af" },
};

function readinessMeta(r: string) {
  return READINESS_DISPLAY[r] ?? READINESS_DISPLAY["unavailable"];
}

// ── Sub-component: section header ─────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{
      fontFamily: T.mono, fontSize: 9, fontWeight: 700,
      color: C.inkFaint, letterSpacing: "0.1em", textTransform: "uppercase",
      borderBottom: `1px solid ${C.lineSubtle}`, paddingBottom: S[1], marginBottom: S[3],
    }}>
      {title}
    </div>
  );
}

// ── Sub-component: loader card ────────────────────────────────────────────────

function LoaderCard({ diag, role }: { diag: LoaderDiagnosticsReport; role: "A" | "B" }) {
  const meta     = readinessMeta(diag.readiness);
  const roleColor = role === "A" ? C.blueDark : C.blue;
  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: C.surface, border: `1px solid ${C.lineSubtle}`,
      borderTop: `2px solid ${roleColor}`,
      borderRadius: R.md, padding: S[3],
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[1], marginBottom: S[2] }}>
        <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: roleColor, background: `${roleColor}18`, border: `1px solid ${roleColor}40`, padding: "1px 5px", borderRadius: R.xs }}>
          FUENTE {role}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`, padding: "1px 5px", borderRadius: R.xs }}>
          {meta.label}
        </span>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
        {diag.sourceLabel}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[2] }}>
        {diag.loaderUsed}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        <div style={{ background: C.surfaceAlt, borderRadius: R.xs, padding: `${S[1]}px ${S[2]}px` }}>
          <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase" }}>REGISTROS</div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: diag.recordsLoaded > 0 ? C.green : C.inkFaint }}>
            {diag.recordsLoaded.toLocaleString("es-CO")}
          </div>
        </div>
        <div style={{ background: C.surfaceAlt, borderRadius: R.xs, padding: `${S[1]}px ${S[2]}px` }}>
          <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase" }}>CARGA</div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink }}>
            {diag.loadTimeMs} ms
          </div>
        </div>
      </div>
      {diag.isEmpty && diag.emptyReason && (
        <div style={{ marginTop: S[2], fontFamily: T.mono, fontSize: 8, color: C.amberDark, fontStyle: "italic", lineHeight: 1.4 }}>
          {diag.emptyReason}
        </div>
      )}
      <div style={{ marginTop: S[2], fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>
        v{diag.normalizationVersion}
      </div>
    </div>
  );
}

// ── Sub-component: rule breakdown table ──────────────────────────────────────

function RuleBreakdownTable({ rules }: { rules: RuleBreakdownEntry[] }) {
  if (rules.length === 0) {
    return (
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, fontStyle: "italic", padding: `${S[2]}px 0` }}>
        Sin reglas evaluadas.
      </div>
    );
  }
  return (
    <div className="ag-op-table" style={{ fontSize: T.sz["2xs"] }}>
      <div className="ag-op-row" style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 60px 60px 60px", gap: 4, paddingBottom: S[1] }}>
        <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase" }}>REGLA</span>
        <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase", textAlign: "right" }}>EVAL.</span>
        <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase", textAlign: "right" }}>OK</span>
        <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase", textAlign: "right" }}>PARC.</span>
        <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase", textAlign: "right" }}>FALLO</span>
        <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase", textAlign: "right" }}>TASA</span>
      </div>
      {rules.map((r) => {
        const rateColor = r.passRate >= 85 ? C.green : r.passRate >= 60 ? C.amber : C.red;
        return (
          <div
            key={r.ruleId}
            className="ag-op-row"
            style={{ display: "grid", gridTemplateColumns: "1fr 60px 60px 60px 60px 60px", gap: 4, alignItems: "center", padding: `3px 0` }}
          >
            <div>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ruleLabel}</div>
              <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>{r.group}</div>
            </div>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid, textAlign: "right" }}>{r.evaluated}</span>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.green, fontWeight: 700, textAlign: "right" }}>{r.passed}</span>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.amber, textAlign: "right" }}>{r.partial}</span>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.red, textAlign: "right" }}>{r.failed}</span>
            <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: rateColor, textAlign: "right" }}>{r.passRate}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Sub-component: meeting mode (Phase 8) ────────────────────────────────────

function MeetingModeView({ allSources }: { allSources: SourceReadinessEntry[] }) {
  const available  = allSources.filter(s => s.isAvailable);
  const partial    = allSources.filter(s => !s.isAvailable && s.requiresAction);
  const blocked    = allSources.filter(s => !s.isAvailable && !s.requiresAction);

  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, lineHeight: 1.5, marginBottom: S[3] }}>
        Estado actual de todas las fuentes de conciliación registradas en Agentik.
      </div>

      {/* Available */}
      {available.length > 0 && (
        <div style={{ marginBottom: S[4] }}>
          <div style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: S[2] }}>
            ● DISPONIBLES AHORA ({available.length})
          </div>
          {available.map(s => (
            <div key={s.sourceType} style={{ display: "flex", alignItems: "center", gap: S[2], padding: `${S[1]}px 0`, borderBottom: `1px solid ${C.lineSubtle}` }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: R.pill, background: "#22c55e", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: C.ink }}>{s.sourceLabel}</span>
                <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginLeft: S[2] }}>{s.provider}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Partial / requires action */}
      {partial.length > 0 && (
        <div style={{ marginBottom: S[4] }}>
          <div style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: S[2] }}>
            ◑ REQUIEREN ACCIÓN ({partial.length})
          </div>
          {partial.map(s => {
            const meta = readinessMeta(s.readiness);
            return (
              <div key={s.sourceType} style={{ padding: `${S[2]}px ${S[3]}px`, marginBottom: 4, background: meta.bg, border: `1px solid ${meta.border}`, borderLeft: `3px solid ${meta.dot}`, borderRadius: R.sm }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: C.ink }}>{s.sourceLabel}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                </div>
                <div style={{ fontFamily: T.mono, fontSize: 8, color: meta.color, lineHeight: 1.4 }}>
                  {s.actionLabel ?? s.readinessNote}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Blocked / unavailable */}
      {blocked.length > 0 && (
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: S[2] }}>
            ○ NO DISPONIBLES ({blocked.length})
          </div>
          {blocked.map(s => (
            <div key={s.sourceType} style={{ display: "flex", alignItems: "center", gap: S[2], padding: `${S[1]}px 0`, borderBottom: `1px solid ${C.lineSubtle}`, opacity: 0.7 }}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: R.pill, background: "#9ca3af", flexShrink: 0 }} />
              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>{s.sourceLabel}</span>
              <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginLeft: "auto" }}>{s.provider}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface ExecutionObservabilityPanelProps {
  report:       ExecutionReport;
  pairResults:  Array<{
    recordAKey:     string;
    verdictLabel:   string;
    verdict:        string;
    score:          number;
    headline:       string;
    rulesPassed:    number;
    rulesEvaluated: number;
  }>;
}

const VERDICT_COLOR: Record<string, string> = {
  reconciled:     C.green,
  partial:        C.amber,
  pending_review: C.amber,
  mismatch:       C.inkFaint,
  suspicious:     C.red,
};

export function ExecutionObservabilityPanel({
  report,
  pairResults,
}: ExecutionObservabilityPanelProps) {
  const [mode, setMode] = useState<"detail" | "meeting">("detail");

  const hasRules    = report.rules.ruleBreakdown.length > 0;
  const evaluated   = pairResults.filter(p => p.rulesEvaluated > 0);

  return (
    <div style={{ marginTop: S[4] }}>

      {/* ── Header + mode toggle ─────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[3], paddingBottom: S[2], borderBottom: `1px solid ${C.lineSubtle}` }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            RESULTADO EJECUCIÓN · {report.period}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginTop: 2 }}>
            {new Date(report.timestamp).toLocaleString("es-CO")} · {report.durationMs} ms
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setMode("detail")}
            style={{
              fontFamily: T.mono, fontSize: 8, fontWeight: 700, cursor: "pointer",
              padding: "3px 8px", borderRadius: R.sm, border: "1px solid",
              borderColor: mode === "detail" ? C.blueDark : C.line,
              color:       mode === "detail" ? C.blueDark : C.inkFaint,
              background:  mode === "detail" ? C.blueLight : "transparent",
            }}
          >
            TÉCNICO
          </button>
          <button
            onClick={() => setMode("meeting")}
            style={{
              fontFamily: T.mono, fontSize: 8, fontWeight: 700, cursor: "pointer",
              padding: "3px 8px", borderRadius: R.sm, border: "1px solid",
              borderColor: mode === "meeting" ? C.blueDark : C.line,
              color:       mode === "meeting" ? C.blueDark : C.inkFaint,
              background:  mode === "meeting" ? C.blueLight : "transparent",
            }}
          >
            VISTA SAG
          </button>
        </div>
      </div>

      {/* ── Meeting mode ────────────────────────────────────────────────────── */}
      {mode === "meeting" && (
        <MeetingModeView allSources={report.allSources} />
      )}

      {/* ── Detail mode ─────────────────────────────────────────────────────── */}
      {mode === "detail" && (
        <>
          {/* Narrative (Phase 5) */}
          {report.narrative.lines.length > 0 && (
            <div style={{ background: C.blueLight, border: `1px solid ${C.blueBorder}`, borderLeft: `3px solid ${C.blueDark}`, borderRadius: R.md, padding: S[3], marginBottom: S[4] }}>
              {report.narrative.lines.map((line, i) => (
                <div key={i} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.ink, lineHeight: 1.6, marginBottom: i < report.narrative.lines.length - 1 ? 4 : 0 }}>
                  {line}
                </div>
              ))}
              {report.narrative.warnings.map((w, i) => (
                <div key={`w${i}`} style={{ fontFamily: T.mono, fontSize: 8, color: C.amberDark, marginTop: S[1] }}>⚠ {w}</div>
              ))}
            </div>
          )}

          {/* Loader diagnostics (Phase 1+2) */}
          <div style={{ marginBottom: S[4] }}>
            <SectionHeader title="Diagnóstico de Carga" />
            <div style={{ display: "flex", gap: S[2] }}>
              <LoaderCard diag={report.loaderA} role="A" />
              <LoaderCard diag={report.loaderB} role="B" />
            </div>
          </div>

          {/* Match pipeline (Phase 4) */}
          <div style={{ marginBottom: S[4] }}>
            <SectionHeader title="Motor de Matching" />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
              {[
                { l: "EVALUADOS",    v: report.pipeline.pairsEvaluated,   c: C.ink      },
                { l: "CONCILIADOS",  v: report.pipeline.pairsReconciled,   c: C.green    },
                { l: "PARCIALES",    v: report.pipeline.pairsPartial,      c: C.amber    },
                { l: "NO COINCIDE",  v: report.pipeline.pairsMismatch,     c: C.inkFaint },
                { l: "SOSPECHOSOS",  v: report.pipeline.pairsSuspicious,   c: C.red      },
                { l: "REVISIÓN",     v: report.pipeline.pairsPending,      c: C.amber    },
                { l: "SIN PAREJA",   v: report.pipeline.pairsNoCandidate,  c: C.inkFaint },
                { l: "TASA MATCH",   v: `${report.pipeline.matchRate}%`,   c: report.pipeline.matchRate >= 80 ? C.green : report.pipeline.matchRate >= 60 ? C.amber : C.red },
              ].map(item => (
                <div key={item.l} style={{ background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.sm, padding: `${S[2]}px ${S[2]}px ${S[1]}px` }}>
                  <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, letterSpacing: "0.06em", textTransform: "uppercase" }}>{item.l}</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: item.c, lineHeight: 1.3 }}>{item.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Score distribution */}
          {report.rules.totalRulesEnabled > 0 && (
            <div style={{ marginBottom: S[4] }}>
              <SectionHeader title="Distribución de Score" />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                {[
                  { l: "SCORE PROM.", v: `${report.rules.avgScore}/100`, c: report.rules.avgScore >= 85 ? C.green : report.rules.avgScore >= 60 ? C.amber : C.red },
                  { l: "MÁXIMO",      v: `${report.rules.maxScore}/100`, c: C.green },
                  { l: "MÍNIMO",      v: `${report.rules.minScore}/100`, c: C.inkFaint },
                  { l: "ALTA CONF.",  v: report.rules.scoreDistribution.high,   c: C.green },
                ].map(item => (
                  <div key={item.l} style={{ background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.sm, padding: `${S[2]}px ${S[2]}px ${S[1]}px` }}>
                    <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, letterSpacing: "0.06em", textTransform: "uppercase" }}>{item.l}</div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: item.c, lineHeight: 1.3 }}>{item.v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rule breakdown (Phase 3) */}
          {hasRules && (
            <div style={{ marginBottom: S[4] }}>
              <SectionHeader title={`Reglas Ejecutadas (${report.rules.ruleBreakdown.length})`} />
              <RuleBreakdownTable rules={report.rules.ruleBreakdown} />
            </div>
          )}

          {/* Top pair results */}
          {evaluated.length > 0 && (
            <div style={{ marginBottom: S[3] }}>
              <SectionHeader title={`Pares Evaluados (top ${Math.min(evaluated.length, 5)} de ${evaluated.length})`} />
              {evaluated.slice(0, 5).map((p, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: 4, padding: `${S[2]}px ${S[3]}px`,
                    background: C.surface, border: `1px solid ${C.lineSubtle}`,
                    borderLeft: `3px solid ${VERDICT_COLOR[p.verdict] ?? C.inkFaint}`,
                    borderRadius: R.sm,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "55%" }}>
                      {p.recordAKey}
                    </span>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: VERDICT_COLOR[p.verdict] ?? C.inkFaint }}>{p.verdictLabel}</span>
                      <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>{p.score}/100</span>
                    </div>
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginTop: 2, lineHeight: 1.4 }}>{p.headline}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
