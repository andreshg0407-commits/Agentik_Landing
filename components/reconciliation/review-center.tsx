"use client";

/**
 * components/reconciliation/review-center.tsx
 *
 * AGENTIK-RECON-REVIEW-CENTER-01 — Phase 4 + 5 + 6 + 7
 * Review Center — Bandeja operacional de revisión de conciliaciones.
 *
 * Features:
 *   - Lists ReconReviewItems grouped by status
 *   - Filters: verdict, status, score range, source pair
 *   - Item drawer: score, verdict, explanation, actions
 *   - Actions: approve, reject, manual_match, needs_sag_validation,
 *              needs_business_validation, needs_bank_support, add note
 *   - Audit trail per item
 *   - SAG Meeting Mode: grouped narrative view
 *   - Empty state: real, no mocks
 *
 * Design rules:
 *   - T.mono for ALL data
 *   - C.* tokens, no raw hex
 *   - ag-op-table / ag-op-row for tables
 *   - EmptyOperationalState pattern for empty state
 */

import React, { useCallback, useEffect, useState } from "react";
import { C, S, T, R, E } from "@/lib/ui/tokens";
import type { ReconReviewItemRow, ReviewCenterSummary } from "@/lib/reconciliation/review/review-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" }); }
  catch { return iso.slice(0, 10); }
}

// ── Verdict display metadata ───────────────────────────────────────────────────

const VERDICT_META: Record<string, { label: string; color: string; bgColor: string }> = {
  partial:        { label: "PARCIAL",       color: C.amber,    bgColor: "#fefce8" },
  mismatch:       { label: "DIFERENCIA",    color: C.red,      bgColor: "#fef2f2" },
  suspicious:     { label: "SOSPECHOSO",    color: "#7c3aed",  bgColor: "#f5f3ff" },
  pending_review: { label: "PENDIENTE",     color: C.blueDark, bgColor: "#eff6ff" },
  no_candidate:   { label: "SIN CONTRAPARTIDA", color: C.inkLight, bgColor: C.surface },
  reconciled:     { label: "CONCILIADO",    color: C.green,    bgColor: "#f0fdf4" },
};

function verdictMeta(verdict: string) {
  return VERDICT_META[verdict] ?? { label: verdict.toUpperCase(), color: C.inkLight, bgColor: C.surface };
}

// ── Status display metadata ───────────────────────────────────────────────────

const STATUS_META: Record<string, { label: string; color: string }> = {
  open:       { label: "ABIERTO",     color: C.blueDark },
  in_review:  { label: "EN REVISIÓN", color: C.amber    },
  escalated:  { label: "ESCALADO",    color: C.red      },
  resolved:   { label: "RESUELTO",    color: C.green    },
  dismissed:  { label: "DESCARTADO",  color: C.inkLight },
};

// ── Resolution labels ─────────────────────────────────────────────────────────

const RESOLUTION_LABELS: Record<string, string> = {
  approved:                   "Aprobado",
  rejected:                   "Rechazado",
  manual_match:               "Match manual",
  needs_sag_validation:       "Requiere SAG",
  needs_business_validation:  "Requiere negocio",
  needs_bank_support:         "Requiere banco",
};

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? C.green : score >= 50 ? C.amber : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
      <div style={{ flex: 1, height: 4, background: C.lineSubtle, borderRadius: R.pill, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: R.pill }} />
      </div>
      <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color, minWidth: 24, textAlign: "right" as const }}>
        {score}
      </span>
    </div>
  );
}

// ── Summary strip ─────────────────────────────────────────────────────────────

function SummaryStrip({ summary }: { summary: ReviewCenterSummary }) {
  const tiles = [
    { l: "ABIERTOS",     v: summary.open,      c: C.blueDark },
    { l: "EN REVISIÓN",  v: summary.in_review,  c: C.amber    },
    { l: "ESCALADOS",    v: summary.escalated,  c: C.red      },
    { l: "RESUELTOS",    v: summary.resolved,   c: C.green    },
    { l: "TOTAL",        v: summary.total,      c: C.ink      },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiles.length}, 1fr)`, gap: S[2], marginBottom: S[3] }}>
      {tiles.map(t => (
        <div key={t.l} style={{ background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.md, padding: `${S[2]}px ${S[3]}px` }}>
          <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.07em" }}>{t.l}</div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: 700, color: t.c, marginTop: 2 }}>{t.v}</div>
        </div>
      ))}
    </div>
  );
}

// ── SAG Meeting mode view ─────────────────────────────────────────────────────

function SagMeetingView({ items }: { items: ReconReviewItemRow[] }) {
  const needsSag      = items.filter(i => i.resolution === "needs_sag_validation" || i.verdict === "no_candidate");
  const needsBusiness = items.filter(i => i.resolution === "needs_business_validation");
  const mismatch      = items.filter(i => i.verdict === "mismatch" && !needsSag.includes(i));
  const suspicious    = items.filter(i => i.verdict === "suspicious");

  const groups = [
    { label: "Requieren validación SAG",             items: needsSag,      color: C.blueDark, icon: "⬡" },
    { label: "Sin contrapartida en fuente B",        items: items.filter(i => i.verdict === "no_candidate"), color: C.inkLight, icon: "○" },
    { label: "Diferencias de valor o documento",     items: mismatch,      color: C.red,      icon: "△" },
    { label: "Marcados como sospechosos",            items: suspicious,    color: "#7c3aed",  icon: "◈" },
    { label: "Requieren validación de negocio",      items: needsBusiness, color: C.amber,    icon: "◎" },
  ].filter(g => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <div style={{ padding: `${S[6]}px 0`, textAlign: "center" as const }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Sin casos pendientes para reunión SAG.</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
      {groups.map(g => (
        <div key={g.label} style={{ background: C.surface, border: `1px solid ${C.lineSubtle}`, borderLeft: `3px solid ${g.color}`, borderRadius: R.md, padding: S[3] }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[2] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: g.color }}>
              {g.icon} {g.label}
            </div>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>{g.items.length} caso{g.items.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
            {g.items.slice(0, 5).map(item => (
              <div key={item.id} style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid, display: "flex", gap: S[2] }}>
                <span style={{ color: C.inkFaint, flexShrink: 0 }}>{item.recordAKey}</span>
                <span style={{ color: C.inkGhost }}>→</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, flex: 1 }}>{item.headline}</span>
              </div>
            ))}
            {g.items.length > 5 && (
              <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, fontStyle: "italic" }}>
                +{g.items.length - 5} más…
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Review Item Drawer ────────────────────────────────────────────────────────

interface ReviewDrawerProps {
  item:    ReconReviewItemRow;
  orgSlug: string;
  onClose: () => void;
  onUpdated: (updated: ReconReviewItemRow) => void;
}

function ReviewItemDrawer({ item, orgSlug, onClose, onUpdated }: ReviewDrawerProps) {
  const [note, setNote]         = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const vm   = verdictMeta(item.verdict);
  const smeta = STATUS_META[item.status] ?? { label: item.status, color: C.inkLight };

  async function dispatch(action: "set_status" | "resolve", payload: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/reconciliation/review/${item.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ action, ...payload, actor: "operator", note: note || undefined }),
      });
      const data = await res.json() as { item?: ReconReviewItemRow; error?: string };
      if (data.error) { setError(data.error); return; }
      if (data.item)  onUpdated(data.item);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  const actions: Array<{ label: string; resolution?: string; status?: string; color: string }> = [
    { label: "Aprobar match",              resolution: "approved",                  color: C.green    },
    { label: "Rechazar match",             resolution: "rejected",                  color: C.red      },
    { label: "Match manual",               resolution: "manual_match",              color: C.blueDark },
    { label: "Solicitar validación SAG",   resolution: "needs_sag_validation",      color: "#7c3aed"  },
    { label: "Solicitar validación negocio", resolution: "needs_business_validation", color: C.amber  },
    { label: "Escalar a banco",            resolution: "needs_bank_support",         color: C.red      },
    { label: "Marcar en revisión",         status: "in_review",                     color: C.amber    },
    { label: "Escalar",                    status: "escalated",                     color: C.red      },
    { label: "Descartar",                  status: "dismissed",                     color: C.inkLight },
  ];

  // explanation from backend (if available — stored as JSON on creation)
  const explanation = item as unknown as { explanationJson?: { reasons?: string[]; rulesPassed?: number; rulesEvaluated?: number } };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", justifyContent: "flex-end" }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.18)" }}
      />

      {/* Panel */}
      <div style={{
        position: "relative", width: 440, background: C.white,
        boxShadow: E.lg, display: "flex", flexDirection: "column" as const,
        overflowY: "auto", zIndex: 1,
      }}>
        {/* Header */}
        <div style={{ padding: `${S[4]}px`, borderBottom: `1px solid ${C.lineSubtle}`, background: C.surface }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: S[3] }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
                <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: vm.color, background: vm.bgColor, border: `1px solid ${vm.color}30`, borderRadius: R.sm, padding: `2px ${S[2]}px` }}>
                  {vm.label}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: 9, color: smeta.color, fontWeight: 700 }}>
                  {smeta.label}
                </span>
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: 600, lineHeight: 1.35 }}>
                {item.headline}
              </div>
            </div>
            <button onClick={onClose} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, background: "none", border: "none", cursor: "pointer", padding: S[1], flexShrink: 0 }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: S[4], display: "flex", flexDirection: "column" as const, gap: S[3] }}>

          {/* Score */}
          <div style={{ background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.md, padding: S[3] }}>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: S[1] }}>SCORE DE MATCH</div>
            <ScoreBar score={item.score} />
          </div>

          {/* Record keys */}
          <div style={{ background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.md, padding: S[3] }}>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: S[2] }}>REGISTROS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginBottom: 2 }}>FUENTE A · {item.sourceAType}</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{item.recordAKey}</div>
              </div>
              <div>
                <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginBottom: 2 }}>FUENTE B · {item.sourceBType}</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: item.recordBKey ? C.ink : C.inkGhost, fontWeight: item.recordBKey ? 600 : 400, fontStyle: item.recordBKey ? "normal" : "italic" }}>
                  {item.recordBKey ?? "Sin contrapartida"}
                </div>
              </div>
            </div>
          </div>

          {/* Explanation / reasons */}
          {explanation.explanationJson?.reasons && explanation.explanationJson.reasons.length > 0 && (
            <div style={{ background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.md, padding: S[3] }}>
              <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: S[2] }}>
                RAZONES · {explanation.explanationJson.rulesPassed ?? "?"}/{explanation.explanationJson.rulesEvaluated ?? "?"} REGLAS PASADAS
              </div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
                {explanation.explanationJson.reasons.map((r, i) => (
                  <div key={i} style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid, display: "flex", gap: S[1], alignItems: "flex-start" }}>
                    <span style={{ color: C.inkGhost, flexShrink: 0 }}>·</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Execution context */}
          <div style={{ background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.md, padding: S[3] }}>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: S[2] }}>CONTEXTO</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: `${S[1]}px ${S[3]}px`, alignItems: "baseline" }}>
              {[
                ["Ejecución",    item.executionId.slice(-12)],
                ["Sesión",       item.sessionId ?? "—"],
                ["Creado",       fmtDate(item.createdAt)],
                ...(item.resolution ? [["Resolución", RESOLUTION_LABELS[item.resolution] ?? item.resolution]] : []),
              ].map(([k, v]) => (
                <React.Fragment key={String(k)}>
                  <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkGhost, textTransform: "uppercase" as const }}>{k}</span>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid }}>{String(v)}</span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Review note input */}
          {item.status !== "resolved" && item.status !== "dismissed" && (
            <div>
              <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: S[1] }}>NOTA DE REVISIÓN (opcional)</div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Agrega contexto o justificación…"
                rows={2}
                style={{
                  width: "100%", boxSizing: "border-box" as const,
                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
                  background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.sm,
                  padding: `${S[2]}px ${S[2]}px`, resize: "vertical" as const, outline: "none",
                }}
              />
            </div>
          )}

          {/* Existing note */}
          {item.reviewNote && (
            <div style={{ background: "#fffbeb", border: `1px solid ${C.amber}30`, borderRadius: R.sm, padding: S[2] }}>
              <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginBottom: 2 }}>NOTA EXISTENTE</div>
              <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid }}>{item.reviewNote}</div>
            </div>
          )}

          {error && (
            <div style={{ fontFamily: T.mono, fontSize: 9, color: C.red, background: "#fef2f2", border: `1px solid ${C.red}30`, borderRadius: R.sm, padding: S[2] }}>
              {error}
            </div>
          )}

          {/* Actions — only when not terminal */}
          {item.status !== "resolved" && item.status !== "dismissed" && (
            <div>
              <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: S[2] }}>ACCIONES</div>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: S[1] }}>
                {actions.map(a => (
                  <button
                    key={a.label}
                    disabled={loading}
                    onClick={() => {
                      if (a.resolution) void dispatch("resolve",     { resolution: a.resolution });
                      else if (a.status) void dispatch("set_status", { status: a.status });
                    }}
                    style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, color: a.color,
                      background: `${a.color}08`, border: `1px solid ${a.color}30`,
                      borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`,
                      cursor: loading ? "not-allowed" : "pointer",
                      textAlign: "left" as const, opacity: loading ? 0.5 : 1,
                      transition: "background 0.1s",
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Terminal state notice */}
          {(item.status === "resolved" || item.status === "dismissed") && (
            <div style={{
              background: item.status === "resolved" ? "#f0fdf4" : C.surface,
              border: `1px solid ${item.status === "resolved" ? C.green : C.lineSubtle}`,
              borderRadius: R.md, padding: S[3],
            }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: item.status === "resolved" ? C.green : C.inkLight, fontWeight: 700 }}>
                {item.status === "resolved" ? "✓ Resuelto" : "Descartado"}
                {item.resolution && ` · ${RESOLUTION_LABELS[item.resolution] ?? item.resolution}`}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Filters strip ─────────────────────────────────────────────────────────────

interface Filters {
  status:  string;
  verdict: string;
  minScore: string;
}

function FiltersStrip({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const statusOptions  = [["", "Todos los estados"], ["open", "Abiertos"], ["in_review", "En revisión"], ["escalated", "Escalados"], ["resolved", "Resueltos"], ["dismissed", "Descartados"]];
  const verdictOptions = [["", "Todos los veredictos"], ["partial", "Parcial"], ["mismatch", "Diferencia"], ["suspicious", "Sospechoso"], ["pending_review", "Pendiente"], ["no_candidate", "Sin contrapartida"]];

  const selectStyle: React.CSSProperties = {
    fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
    background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.sm,
    padding: `${S[1]}px ${S[2]}px`, cursor: "pointer", outline: "none",
  };

  return (
    <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" as const, marginBottom: S[3], alignItems: "center" }}>
      <select value={filters.status} onChange={e => onChange({ ...filters, status: e.target.value })} style={selectStyle}>
        {statusOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select value={filters.verdict} onChange={e => onChange({ ...filters, verdict: e.target.value })} style={selectStyle}>
        {verdictOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
        <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>Score ≥</span>
        <input
          type="number" min={0} max={100} value={filters.minScore}
          onChange={e => onChange({ ...filters, minScore: e.target.value })}
          style={{ ...selectStyle, width: 56 }}
        />
      </div>
    </div>
  );
}

// ── Review Item Row ───────────────────────────────────────────────────────────

function ReviewRow({ item, onClick }: { item: ReconReviewItemRow; onClick: () => void }) {
  const vm    = verdictMeta(item.verdict);
  const smeta = STATUS_META[item.status] ?? { label: item.status.toUpperCase(), color: C.inkLight };

  return (
    <div
      className="ag-op-row"
      onClick={onClick}
      style={{
        display: "grid",
        gridTemplateColumns: "80px 1fr 100px 80px 80px",
        gap: S[2], alignItems: "center",
        padding: `${S[2]}px ${S[3]}px`,
        borderBottom: `1px solid ${C.lineSubtle}`,
        borderLeft: `3px solid ${vm.color}`,
        cursor: "pointer", transition: "background 0.1s",
      }}
    >
      {/* Key */}
      <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
        {item.recordAKey}
      </div>

      {/* Headline */}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
          {item.headline}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginTop: 1 }}>
          {fmtDate(item.createdAt)} · {item.sourceAType} ↔ {item.sourceBType}
        </div>
      </div>

      {/* Verdict */}
      <div style={{ textAlign: "center" as const }}>
        <span style={{
          fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: vm.color,
          background: vm.bgColor, border: `1px solid ${vm.color}25`,
          borderRadius: R.sm, padding: `1px ${S[1]}px`,
        }}>
          {vm.label}
        </span>
      </div>

      {/* Score */}
      <div>
        <ScoreBar score={item.score} />
      </div>

      {/* Status */}
      <div style={{ textAlign: "right" as const }}>
        <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: smeta.color }}>
          {smeta.label}
        </span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ReviewCenterProps {
  orgSlug:           string;
  sourceAType?:      string;
  sourceBType?:      string;
  /** Pass executionReport.executionId to auto-filter and trigger refresh */
  latestExecutionId?: string;
}

export function ReviewCenter({
  orgSlug,
  sourceAType,
  sourceBType,
  latestExecutionId,
}: ReviewCenterProps) {
  const [items,    setItems]    = useState<ReconReviewItemRow[]>([]);
  const [summary,  setSummary]  = useState<ReviewCenterSummary | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [selected, setSelected] = useState<ReconReviewItemRow | null>(null);
  const [mode,     setMode]     = useState<"list" | "sag">("list");

  const [filters, setFilters] = useState<Filters>({ status: "open", verdict: "", minScore: "" });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ summary: "true", limit: "100" });
      if (sourceAType) params.set("sourceAType", sourceAType);
      if (sourceBType) params.set("sourceBType", sourceBType);
      // Don't filter by executionId — show full history; filter by latestExecutionId optionally
      const res  = await fetch(`/api/orgs/${orgSlug}/reconciliation/review?${params}`);
      const data = await res.json() as { items?: ReconReviewItemRow[]; summary?: ReviewCenterSummary };
      setItems(data.items ?? []);
      if (data.summary) setSummary(data.summary);
    } catch {
      setError("Error al cargar el centro de revisión.");
    } finally {
      setLoading(false);
    }
  }, [orgSlug, sourceAType, sourceBType]);

  useEffect(() => { void fetchItems(); }, [fetchItems, latestExecutionId]);

  function handleUpdated(updated: ReconReviewItemRow) {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    setSelected(updated);
    // refresh summary
    void fetchItems();
  }

  // Apply client-side filters
  const filtered = items.filter(item => {
    if (filters.status  && item.status  !== filters.status)  return false;
    if (filters.verdict && item.verdict !== filters.verdict)  return false;
    if (filters.minScore && item.score  < parseInt(filters.minScore, 10)) return false;
    return true;
  });

  if (loading && items.length === 0) {
    return (
      <div style={{ padding: `${S[6]}px 0`, textAlign: "center" as const }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Cargando centro de revisión…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: S[3], background: "#fef2f2", border: `1px solid #fecaca`, borderRadius: R.sm, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div style={{ padding: `${S[6]}px 0`, textAlign: "center" as const }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Sin casos de revisión.</div>
        <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginTop: S[1] }}>
          Ejecuta el motor de reglas para generar casos. Solo se crean items para resultados parciales, diferencias o sospechosos.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Summary strip */}
      {summary && <SummaryStrip summary={summary} />}

      {/* Mode toggle */}
      <div style={{ display: "flex", gap: S[1], marginBottom: S[3] }}>
        {(["list", "sag"] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              fontFamily: T.mono, fontSize: 9, fontWeight: mode === m ? 700 : 400,
              color: mode === m ? C.white : C.inkMid,
              background: mode === m ? C.blueDark : C.surface,
              border: `1px solid ${mode === m ? C.blueDark : C.line}`,
              borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
            }}
          >
            {m === "list" ? "BANDEJA" : "VISTA SAG"}
          </button>
        ))}
        <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginLeft: "auto", alignSelf: "center" }}>
          {filtered.length} de {items.length} item{items.length !== 1 ? "s" : ""}
          {loading && " · actualizando…"}
        </span>
      </div>

      {mode === "sag" ? (
        <SagMeetingView items={filtered} />
      ) : (
        <>
          <FiltersStrip filters={filters} onChange={setFilters} />

          {filtered.length === 0 ? (
            <div style={{ padding: `${S[5]}px 0`, textAlign: "center" as const }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Sin items con los filtros actuales.</div>
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 100px 80px 80px", gap: S[2], paddingBottom: S[1], paddingLeft: S[3], borderBottom: `1px solid ${C.line}` }}>
                {["CLAVE", "TITULAR", "VEREDICTO", "SCORE", "ESTADO"].map(h => (
                  <span key={h} style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{h}</span>
                ))}
              </div>

              {filtered.map(item => (
                <ReviewRow key={item.id} item={item} onClick={() => setSelected(item)} />
              ))}
            </>
          )}
        </>
      )}

      {/* Item drawer */}
      {selected && (
        <ReviewItemDrawer
          item={selected}
          orgSlug={orgSlug}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
        />
      )}
    </>
  );
}
