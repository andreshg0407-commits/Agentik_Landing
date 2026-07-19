"use client";

/**
 * exception-workbench.tsx
 *
 * AGENTIK-RECON-EXCEPTIONS-01 — Exception Resolution Workbench
 *
 * Full exception review workspace for reconciliation operators.
 * Groups exceptions by type. Per-exception: resolution controls + audit notes.
 *
 * State model:
 *   resolutions:   ResolutionMap  — client-side optimistic (RECON-ENGINE-03 will persist)
 *   filter:        WorkbenchFilter
 *   expanded:      Set<string>    — which rows have detail open
 *   noteInputs:    Record<id,str> — in-progress note text per exception
 *
 * Design system:
 *   - C.* / T.* / S.* / R.* / E.* from lib/ui/tokens
 *   - ag-op-table / ag-op-row / ag-op-status from design-system.css
 *   - ag-action-* CSS classes for buttons
 *   - WorkspaceSection / EmptyOperationalState from operational-primitives
 */

import { useState, useCallback, useRef }         from "react";
import type { CSSProperties }                    from "react";
import { C, T, S, R, E, panel, panelHeader }    from "@/lib/ui/tokens";
import {
  WorkspaceSection,
  EmptyOperationalState,
}                                                from "@/components/shell/operational-primitives";
import type {
  WorkbenchException,
  WorkbenchExceptionType,
  WorkbenchSeverity,
  WorkbenchStatus,
  WorkbenchFilter,
  ExceptionResolution,
  ResolutionMap,
  ExceptionAction,
  WorkbenchNote,
}                                                from "@/lib/reconciliation/workbench-types";
import { DEFAULT_FILTER }                        from "@/lib/reconciliation/workbench-types";
import { countByType, countBySeverity }          from "@/lib/reconciliation/recon-to-workbench";

// ── Props ─────────────────────────────────────────────────────────────────────

interface ExceptionWorkbenchProps {
  exceptions:         WorkbenchException[];
  sourceALabel:       string;
  sourceBLabel:       string;
  /** ISO timestamp of the run that produced these exceptions. */
  runAt:              string;
  /**
   * When present, operator actions are persisted via API.
   * Both must be set together — if either is absent, actions remain client-side only.
   */
  orgSlug?:           string;
  sessionId?:         string;
  /** Initial resolution state hydrated from DB. Applied on first render. */
  initialResolutions?: ResolutionMap;
}

// ── Display config by exception type ─────────────────────────────────────────

const TYPE_CONFIG: Record<WorkbenchExceptionType, {
  label:       string;
  description: string;
  dotColor:    string;
  bgColor:     string;
  borderColor: string;
  textColor:   string;
}> = {
  probable_match: {
    label:       "Match Probable",
    description: "Alta probabilidad de ser el mismo documento — confirmar o rechazar la coincidencia.",
    dotColor:    C.brand,
    bgColor:     C.brandLight,
    borderColor: C.brandBorder,
    textColor:   C.brandDark,
  },
  duplicate: {
    label:       "Registros Duplicados",
    description: "La misma clave aparece múltiples veces en la misma fuente — solo el primero participó en el matching.",
    dotColor:    C.red,
    bgColor:     C.redLight,
    borderColor: C.redBorder,
    textColor:   C.redDark,
  },
  mismatch_amount: {
    label:       "Diferencia de Monto",
    description: "El documento existe en ambas fuentes pero los montos no coinciden dentro de la tolerancia.",
    dotColor:    C.amber,
    bgColor:     C.amberLight,
    borderColor: C.amberBorder,
    textColor:   C.amberDark,
  },
  only_in_b: {
    label:       "Solo en Fuente B",
    description: "Registros presentes únicamente en la fuente B — posibles pagos sin factura o cobros no registrados en A.",
    dotColor:    C.blue,
    bgColor:     C.blueLight,
    borderColor: C.blueBorder,
    textColor:   C.blue,
  },
  only_in_a: {
    label:       "Solo en Fuente A",
    description: "Registros presentes únicamente en la fuente A — posibles documentos pendientes de registro en B.",
    dotColor:    C.inkMid,
    bgColor:     C.surface,
    borderColor: C.line,
    textColor:   C.inkMid,
  },
};

const SEVERITY_CHIP: Record<WorkbenchSeverity, string> = {
  critical: "ag-op-status ag-op-status--critical",
  elevated: "ag-op-status ag-op-status--warning",
  watch:    "ag-op-status ag-op-status--pending",
  info:     "ag-op-status ag-op-status--info",
};

const SEVERITY_LABEL: Record<WorkbenchSeverity, string> = {
  critical: "Crítico",
  elevated: "Elevado",
  watch:    "Vigilar",
  info:     "Info",
};

const STATUS_CHIP: Record<WorkbenchStatus, string> = {
  open:          "ag-op-status ag-op-status--pending",
  under_review:  "ag-op-status ag-op-status--warning",
  resolved:      "ag-op-status ag-op-status--ok",
  ignored:       "ag-op-status ag-op-status--pending",
};

const STATUS_LABEL: Record<WorkbenchStatus, string> = {
  open:          "Pendiente",
  under_review:  "En revisión",
  resolved:      "Resuelto",
  ignored:       "Ignorado",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function noteId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function initResolution(): ExceptionResolution {
  return { status: "open", resolution: null, notes: [], resolvedBy: null, resolvedAt: null };
}

function getResolution(map: ResolutionMap, id: string): ExceptionResolution {
  return map[id] ?? initResolution();
}

function applyExceptionAction(
  map:         ResolutionMap,
  id:          string,
  action:      ExceptionAction,
): ResolutionMap {
  const current = getResolution(map, id);
  switch (action.type) {
    case "resolve":
      return {
        ...map,
        [id]: {
          ...current,
          status:     "resolved",
          resolution: action.resolution,
          resolvedBy: "operator",
          resolvedAt: new Date().toISOString(),
        },
      };
    case "ignore":
      return {
        ...map,
        [id]: {
          ...current,
          status:     "ignored",
          resolution: action.reason ?? null,
        },
      };
    case "set_reviewing":
      return { ...map, [id]: { ...current, status: "under_review" } };
    case "reopen":
      return { ...map, [id]: { ...current, status: "open", resolution: null, resolvedBy: null, resolvedAt: null } };
    case "add_note": {
      const note: WorkbenchNote = {
        id:        noteId(),
        text:      action.text,
        author:    action.author,
        createdAt: new Date().toISOString(),
      };
      return { ...map, [id]: { ...current, notes: [...current.notes, note] } };
    }
  }
}

function filterExceptions(
  exceptions:  WorkbenchException[],
  filter:      WorkbenchFilter,
  resolutions: ResolutionMap,
): WorkbenchException[] {
  return exceptions.filter(ex => {
    const status = getResolution(resolutions, ex.id).status;
    if (filter.types.length > 0      && !filter.types.includes(ex.type))           return false;
    if (filter.severities.length > 0 && !filter.severities.includes(ex.severity))  return false;
    if (filter.statuses.length > 0   && !filter.statuses.includes(status))          return false;
    if (filter.searchText) {
      const q = filter.searchText.toLowerCase();
      if (!ex.label.toLowerCase().includes(q) && !ex.recordKey.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

// ── Exception summary bar ─────────────────────────────────────────────────────

function SummaryBar({
  exceptions,
  resolutions,
}: {
  exceptions:  WorkbenchException[];
  resolutions: ResolutionMap;
}) {
  const byType     = countByType(exceptions);
  const bySeverity = countBySeverity(exceptions);

  const open       = exceptions.filter(e => getResolution(resolutions, e.id).status === "open").length;
  const reviewing  = exceptions.filter(e => getResolution(resolutions, e.id).status === "under_review").length;
  const resolved   = exceptions.filter(e => getResolution(resolutions, e.id).status === "resolved").length;
  const ignored    = exceptions.filter(e => getResolution(resolutions, e.id).status === "ignored").length;

  const kpiBox = (label: string, value: number, valueColor: string, bg: string, border: string): React.ReactNode => (
    <div style={{
      padding:      `${S[2]+2}px ${S[3]+2}px`,
      border:       `1px solid ${border}`,
      borderRadius: R.md,
      background:   bg,
      boxShadow:    E.xs,
      minWidth:     80,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: valueColor, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
        {value}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", gap: S[2]+2, flexWrap: "wrap", marginBottom: S[5] }}>
      {/* Total */}
      {kpiBox("Total", exceptions.length, C.ink, C.white, C.line)}

      {/* Critical / Elevated */}
      {bySeverity.critical > 0 && kpiBox("Crítico",  bySeverity.critical,  C.red,      C.redLight,   C.redBorder)}
      {bySeverity.elevated > 0 && kpiBox("Elevado",  bySeverity.elevated,  C.amber,    C.amberLight, C.amberBorder)}
      {bySeverity.watch    > 0 && kpiBox("Vigilar",  bySeverity.watch,     C.amberDark, C.amberLight, C.amberBorder)}

      {/* Type breakdown */}
      {byType.duplicate       > 0 && kpiBox("Duplicados",     byType.duplicate,       C.redDark,    C.redLight,   C.redBorder)}
      {byType.mismatch_amount > 0 && kpiBox("Dif. monto",     byType.mismatch_amount, C.amberDark,  C.amberLight, C.amberBorder)}
      {byType.only_in_b       > 0 && kpiBox("Solo en B",      byType.only_in_b,       C.blue,       C.blueLight,  C.blueBorder)}
      {byType.only_in_a       > 0 && kpiBox("Solo en A",      byType.only_in_a,       C.inkMid,     C.surface,    C.line)}

      {/* Status progress */}
      <div style={{ flex: 1, minWidth: 220, padding: `${S[2]+2}px ${S[3]+2}px`, border: `1px solid ${C.line}`, borderRadius: R.md, background: C.white, boxShadow: E.xs, display: "flex", gap: S[4], alignItems: "center" }}>
        {[
          { label: "Pendiente",    val: open,      color: C.inkGhost },
          { label: "En revisión",  val: reviewing, color: C.amber    },
          { label: "Resuelto",     val: resolved,  color: C.green    },
          { label: "Ignorado",     val: ignored,   color: C.inkFaint },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ textAlign: "center" as const }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color, fontVariantNumeric: "tabular-nums" }}>{val}</div>
          </div>
        ))}
        {/* Progress bar */}
        {exceptions.length > 0 && (
          <div style={{ flex: 1, height: 4, borderRadius: R.pill, background: C.lineSubtle, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${((resolved + ignored) / exceptions.length) * 100}%`, background: C.green, borderRadius: R.pill, transition: "width 0.4s ease" }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Filter bar ─────────────────────────────────────────────────────────────────

function FilterBar({
  filter,
  exceptions,
  resolutions,
  onChange,
}: {
  filter:      WorkbenchFilter;
  exceptions:  WorkbenchException[];
  resolutions: ResolutionMap;
  onChange:    (f: WorkbenchFilter) => void;
}) {
  const all = filterExceptions(exceptions, DEFAULT_FILTER, resolutions).length;

  function chip(
    label:    string,
    active:   boolean,
    count:    number,
    onClick:  () => void,
    color?:   string,
  ) {
    return (
      <button
        key={label}
        onClick={onClick}
        style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    active ? T.wt.bold : T.wt.normal,
          padding:       "4px 10px",
          borderRadius:  R.pill,
          border:        `1px solid ${active ? (color ?? C.blueDark) : C.line}`,
          background:    active ? (color ?? C.blueDark) : C.white,
          color:         active ? C.white : C.inkLight,
          cursor:        "pointer",
          display:       "inline-flex",
          alignItems:    "center",
          gap:           5,
          transition:    "all 0.15s",
          whiteSpace:    "nowrap",
        }}
      >
        {label}
        {count > 0 && (
          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz["2xs"],
            fontWeight:  T.wt.bold,
            background:  active ? "rgba(255,255,255,0.25)" : C.lineSubtle,
            borderRadius: R.pill,
            padding:     "0 5px",
            lineHeight:  "16px",
          }}>
            {count}
          </span>
        )}
      </button>
    );
  }

  const allActive    = filter.statuses.length === 2 && filter.statuses.includes("open") && filter.statuses.includes("under_review");
  const showResolved = filter.statuses.includes("resolved") || filter.statuses.includes("ignored");

  return (
    <div style={{ display: "flex", gap: S[2], flexWrap: "wrap", alignItems: "center", marginBottom: S[5], padding: `${S[2]}px ${S[3]}px`, background: C.surface, borderRadius: R.md, border: `1px solid ${C.line}` }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, fontWeight: T.wt.bold, whiteSpace: "nowrap" }}>
        Filtros:
      </span>

      {/* Status quick filters */}
      {chip(
        "Pendientes",
        allActive,
        filterExceptions(exceptions, { ...DEFAULT_FILTER, statuses: ["open", "under_review"] }, resolutions).length,
        () => onChange({ ...filter, statuses: ["open", "under_review"] }),
      )}
      {chip(
        "Mostrar todos",
        filter.statuses.length === 0,
        all,
        () => onChange({ ...filter, statuses: [] }),
      )}
      {chip(
        "Solo críticos",
        filter.severities.length === 1 && filter.severities[0] === "critical",
        filterExceptions(exceptions, { ...DEFAULT_FILTER, statuses: [], severities: ["critical"] }, resolutions).length,
        () => onChange({ ...filter, statuses: [], severities: filter.severities[0] === "critical" ? [] : ["critical"] }),
        C.red,
      )}

      <div style={{ width: 1, height: 16, background: C.line }} />

      {/* Type filters */}
      {(["mismatch_amount", "duplicate", "only_in_b", "only_in_a"] as WorkbenchExceptionType[]).map(type => {
        const count = filterExceptions(exceptions, { ...DEFAULT_FILTER, statuses: [], types: [type] }, resolutions).length;
        if (count === 0) return null;
        const cfg   = TYPE_CONFIG[type];
        const active = filter.types.includes(type);
        return chip(
          cfg.label,
          active,
          count,
          () => onChange({ ...filter, types: active ? filter.types.filter(t => t !== type) : [...filter.types, type] }),
          cfg.dotColor,
        );
      })}

      {/* Clear */}
      {(filter.types.length > 0 || filter.severities.length > 0 || !allActive) && (
        <button
          onClick={() => onChange(DEFAULT_FILTER)}
          className="ag-action-ghost"
        >
          Limpiar filtros
        </button>
      )}

      {/* Search */}
      <input
        type="text"
        placeholder="Buscar por clave o descripción..."
        value={filter.searchText}
        onChange={e => onChange({ ...filter, searchText: e.target.value })}
        style={{
          marginLeft:   "auto",
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          padding:      "4px 10px",
          borderRadius: R.sm,
          border:       `1px solid ${C.line}`,
          background:   C.white,
          color:        C.ink,
          outline:      "none",
          width:        180,
        }}
      />
    </div>
  );
}

// ── Exception row ─────────────────────────────────────────────────────────────

function ExceptionRow({
  ex,
  resolution,
  sourceALabel,
  sourceBLabel,
  expanded,
  noteInput,
  saving,
  error,
  onAction,
  onToggleExpand,
  onNoteChange,
}: {
  ex:            WorkbenchException;
  resolution:    ExceptionResolution;
  sourceALabel:  string;
  sourceBLabel:  string;
  expanded:      boolean;
  noteInput:     string;
  saving:        boolean;
  error:         string | null;
  onAction:      (action: ExceptionAction) => void;
  onToggleExpand: () => void;
  onNoteChange:  (text: string) => void;
}) {
  const cfg        = TYPE_CONFIG[ex.type];
  const isResolved = resolution.status === "resolved" || resolution.status === "ignored";

  // Amount display based on type
  const amountDisplay = () => {
    if (ex.type === "mismatch_amount") {
      return (
        <div style={{ display: "flex", gap: S[2], alignItems: "center", flexWrap: "wrap" as const }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>A:</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.inkMid, fontVariantNumeric: "tabular-nums" }}>
            {ex.amountA != null ? fmtCOP(ex.amountA) : "—"}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>B:</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.inkMid, fontVariantNumeric: "tabular-nums" }}>
            {ex.amountB != null ? fmtCOP(ex.amountB) : "—"}
          </span>
          {ex.amountDelta != null && (
            <span style={{
              fontFamily:         T.mono,
              fontSize:           T.sz.sm,
              fontWeight:         T.wt.bold,
              fontVariantNumeric: "tabular-nums",
              color:              Math.abs(ex.amountDelta) < 1 ? C.green
                                : ex.severity === "critical" ? C.red
                                : C.amber,
              background:         ex.severity === "critical" ? C.redLight : C.amberLight,
              border:             `1px solid ${ex.severity === "critical" ? C.redBorder : C.amberBorder}`,
              borderRadius:       R.xs,
              padding:            "2px 6px",
            }}>
              {ex.amountDelta >= 0 ? "+" : ""}{fmtCOP(ex.amountDelta)}
              {ex.amountDeltaPct != null && ` (${ex.amountDeltaPct >= 0 ? "+" : ""}${ex.amountDeltaPct.toFixed(1)}%)`}
            </span>
          )}
        </div>
      );
    }
    if (ex.type === "only_in_a") {
      return (
        <span style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.inkMid, fontVariantNumeric: "tabular-nums" }}>
          {ex.amountA != null ? fmtCOP(ex.amountA) : "—"}
        </span>
      );
    }
    if (ex.type === "only_in_b") {
      return (
        <span style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.inkMid, fontVariantNumeric: "tabular-nums" }}>
          {ex.amountB != null ? fmtCOP(ex.amountB) : "—"}
        </span>
      );
    }
    if (ex.type === "duplicate") {
      const total = (ex.amountA ?? 0) + (ex.amountB ?? 0);
      return (
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.redDark, fontVariantNumeric: "tabular-nums" }}>
            {fmtCOP(total)} total
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            {ex.rowsA + ex.rowsB} filas duplicadas
          </span>
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      {/* Main row */}
      <div
        className={`ag-op-row${isResolved ? " ag-op-row--passive" : ""}`}
        style={{
          display:      "grid",
          gridTemplateColumns: "8px 1fr auto auto auto",
          gap:          S[3],
          padding:      `${S[2]+2}px ${S[4]}px`,
          borderBottom: expanded ? "none" : `1px solid ${C.lineSubtle}`,
          alignItems:   "center",
          opacity:      isResolved ? 0.65 : 1,
        }}
      >
        {/* Severity dot */}
        <div style={{
          width:        8,
          height:       8,
          borderRadius: "50%",
          background:   ex.severity === "critical" ? C.red
                       : ex.severity === "elevated" ? C.amber
                       : ex.severity === "watch"    ? C.amber
                       : C.inkGhost,
          flexShrink:   0,
        }} />

        {/* Label + key */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 2 }}>
            <span className={SEVERITY_CHIP[ex.severity]} style={{ fontSize: T.sz["2xs"] }}>
              {SEVERITY_LABEL[ex.severity]}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {ex.label}
            </span>
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
            {ex.recordKey}
          </div>
          {/* Amounts inline */}
          <div style={{ marginTop: 3 }}>
            {amountDisplay()}
          </div>
        </div>

        {/* Status chip */}
        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className={STATUS_CHIP[resolution.status]}>{STATUS_LABEL[resolution.status]}</span>
            {saving && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                guardando…
              </span>
            )}
          </div>
          {resolution.notes.length > 0 && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
              {resolution.notes.length} nota{resolution.notes.length !== 1 ? "s" : ""}
            </span>
          )}
          {error && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>
              {error}
            </span>
          )}
        </div>

        {/* Action tray */}
        <div className="ag-action-tray">
          {resolution.status === "open" && (
            <>
              <button className="ag-action-secondary" disabled={saving} onClick={() => onAction({ type: "set_reviewing" })}>
                En revisión
              </button>
              <button className="ag-action-ghost" disabled={saving} onClick={() => onAction({ type: "ignore" })}>
                Ignorar
              </button>
            </>
          )}
          {resolution.status === "under_review" && (
            <>
              <button className="ag-action-primary" disabled={saving} onClick={() => onAction({ type: "resolve", resolution: "Revisado y confirmado por operador" })}>
                Resolver
              </button>
              <button className="ag-action-ghost" disabled={saving} onClick={() => onAction({ type: "ignore" })}>
                Ignorar
              </button>
            </>
          )}
          {(resolution.status === "resolved" || resolution.status === "ignored") && (
            <button className="ag-action-ghost" disabled={saving} onClick={() => onAction({ type: "reopen" })}>
              Reabrir
            </button>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={onToggleExpand}
          className="ag-action-ghost"
          style={{ fontSize: T.sz.base, padding: "2px 4px", color: C.inkFaint }}
          title={expanded ? "Colapsar detalle" : "Ver detalle y notas"}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{
          borderBottom:   `1px solid ${C.lineSubtle}`,
          background:     C.surface,
          padding:        `${S[3]}px ${S[4]}px ${S[3]}px ${S[4]+16}px`,
        }}>
          {/* Reasons */}
          <div style={{ marginBottom: S[3] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: S[1]+2 }}>
              Diagnóstico
            </div>
            {ex.reasons.map((reason, i) => (
              <div key={i} style={{ display: "flex", gap: S[2], marginBottom: 3 }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost, flexShrink: 0 }}>·</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, lineHeight: 1.5 }}>{reason}</span>
              </div>
            ))}
          </div>

          {/* Resolution history */}
          {resolution.resolution && (
            <div style={{ marginBottom: S[3], padding: `${S[1]+2}px ${S[3]}px`, background: C.greenLight, border: `1px solid ${C.greenBorder}`, borderRadius: R.sm }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.greenDark }}>Resolución: </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.greenDark }}>{resolution.resolution}</span>
              {resolution.resolvedAt && (
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.green, marginLeft: S[2] }}>
                  · {new Date(resolution.resolvedAt).toLocaleString("es-CO")}
                </span>
              )}
            </div>
          )}

          {/* Existing notes */}
          {resolution.notes.length > 0 && (
            <div style={{ marginBottom: S[3] }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: S[1]+2 }}>
                Notas de auditoría
              </div>
              {resolution.notes.map(note => (
                <div key={note.id} style={{
                  marginBottom: S[1]+2,
                  padding:      `${S[1]+2}px ${S[3]}px`,
                  background:   C.white,
                  border:       `1px solid ${C.line}`,
                  borderRadius: R.sm,
                  borderLeft:   `3px solid ${C.blueDark}`,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, marginBottom: 2 }}>{note.text}</div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                    {note.author} · {new Date(note.createdAt).toLocaleString("es-CO")}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add note */}
          <div style={{ display: "flex", gap: S[2], alignItems: "flex-start" }}>
            <textarea
              value={noteInput}
              onChange={e => onNoteChange(e.target.value)}
              placeholder="Agregar nota de auditoría..."
              rows={2}
              style={{
                flex:         1,
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                padding:      `${S[1]+2}px ${S[2]+2}px`,
                border:       `1px solid ${C.line}`,
                borderRadius: R.sm,
                background:   C.white,
                color:        C.ink,
                resize:       "vertical" as const,
                outline:      "none",
              }}
            />
            <button
              className="ag-action-secondary"
              disabled={!noteInput.trim()}
              onClick={() => {
                if (noteInput.trim()) {
                  onAction({ type: "add_note", text: noteInput.trim(), author: "operador" });
                  onNoteChange("");
                }
              }}
            >
              Agregar nota
            </button>
          </div>

          {/* Resolve with custom note */}
          {(resolution.status === "open" || resolution.status === "under_review") && (
            <div style={{ marginTop: S[2], display: "flex", gap: S[2] }}>
              <button
                className="ag-action-primary"
                onClick={() => onAction({ type: "resolve", resolution: noteInput.trim() || "Revisado y aceptado" })}
              >
                Marcar como resuelto
              </button>
              <button
                className="ag-action-danger"
                onClick={() => onAction({ type: "ignore", reason: noteInput.trim() || undefined })}
              >
                Ignorar excepción
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Exception group panel ─────────────────────────────────────────────────────

function ExceptionGroupPanel({
  type,
  exceptions,
  resolutions,
  sourceALabel,
  sourceBLabel,
  expanded,
  noteInputs,
  savingIds,
  errorIds,
  onAction,
  onToggleExpand,
  onNoteChange,
}: {
  type:          WorkbenchExceptionType;
  exceptions:    WorkbenchException[];
  resolutions:   ResolutionMap;
  sourceALabel:  string;
  sourceBLabel:  string;
  expanded:      Set<string>;
  noteInputs:    Record<string, string>;
  savingIds:     Set<string>;
  errorIds:      Record<string, string>;
  onAction:      (id: string, action: ExceptionAction) => void;
  onToggleExpand: (id: string) => void;
  onNoteChange:  (id: string, text: string) => void;
}) {
  if (exceptions.length === 0) return null;

  const cfg         = TYPE_CONFIG[type];
  const openCount   = exceptions.filter(e => getResolution(resolutions, e.id).status === "open").length;
  const doneCount   = exceptions.filter(e => {
    const s = getResolution(resolutions, e.id).status;
    return s === "resolved" || s === "ignored";
  }).length;

  return (
    <WorkspaceSection
      title={cfg.label}
      subtitle={`${exceptions.length} ${exceptions.length === 1 ? "excepción" : "excepciones"} · ${openCount} pendiente${openCount !== 1 ? "s" : ""}`}
    >
      {/* Type description */}
      <div style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.sm,
        color:        cfg.textColor,
        background:   cfg.bgColor,
        border:       `1px solid ${cfg.borderColor}`,
        borderRadius: R.sm,
        padding:      `${S[1]+2}px ${S[3]}px`,
        marginBottom: S[3],
        borderLeft:   `3px solid ${cfg.dotColor}`,
      }}>
        {cfg.description}
      </div>

      {/* Progress indicator */}
      {doneCount > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[3] }}>
          <div style={{ flex: 1, height: 3, background: C.lineSubtle, borderRadius: R.pill, overflow: "hidden" }}>
            <div style={{
              height:     "100%",
              width:      `${(doneCount / exceptions.length) * 100}%`,
              background: C.green,
              borderRadius: R.pill,
              transition: "width 0.3s ease",
            }} />
          </div>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, whiteSpace: "nowrap" as const }}>
            {doneCount}/{exceptions.length} revisadas
          </span>
        </div>
      )}

      {/* Column headers */}
      <div className="ag-op-table">
        <div className="ag-op-table-head" style={{
          display:             "grid",
          gridTemplateColumns: "8px 1fr auto auto auto",
          gap:                 S[3],
          padding:             `5px ${S[4]}px`,
          alignItems:          "center",
        }}>
          <div />
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Excepción
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Estado
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Acciones
          </div>
          <div />
        </div>

        {exceptions.map(ex => (
          <ExceptionRow
            key={ex.id}
            ex={ex}
            resolution={getResolution(resolutions, ex.id)}
            sourceALabel={sourceALabel}
            sourceBLabel={sourceBLabel}
            expanded={expanded.has(ex.id)}
            noteInput={noteInputs[ex.id] ?? ""}
            saving={savingIds.has(ex.id)}
            error={errorIds[ex.id] ?? null}
            onAction={action => onAction(ex.id, action)}
            onToggleExpand={() => onToggleExpand(ex.id)}
            onNoteChange={text => onNoteChange(ex.id, text)}
          />
        ))}
      </div>
    </WorkspaceSection>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiPatchException(
  orgSlug:     string,
  exceptionId: string,
  action:      ExceptionAction,
): Promise<void> {
  if (action.type === "add_note") {
    const res = await fetch(
      `/api/orgs/${orgSlug}/reconciliation/exceptions/${exceptionId}/notes`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message: action.text }),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Error al guardar nota (${res.status})`);
    }
    return;
  }

  const payload: Record<string, unknown> = { action: action.type };
  if (action.type === "resolve")  payload["resolution"] = action.resolution;
  if (action.type === "ignore" && action.reason) payload["resolution"] = action.reason;

  const res = await fetch(
    `/api/orgs/${orgSlug}/reconciliation/exceptions/${exceptionId}`,
    {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Error al guardar (${res.status})`);
  }
}

export default function ExceptionWorkbench({
  exceptions,
  sourceALabel,
  sourceBLabel,
  runAt,
  orgSlug,
  sessionId: _sessionId,
  initialResolutions,
}: ExceptionWorkbenchProps) {
  const [resolutions, setResolutions] = useState<ResolutionMap>(initialResolutions ?? {});
  const [filter, setFilter]           = useState<WorkbenchFilter>(DEFAULT_FILTER);
  const [expanded, setExpanded]       = useState<Set<string>>(new Set());
  const [noteInputs, setNoteInputs]   = useState<Record<string, string>>({});
  const [savingIds, setSavingIds]     = useState<Set<string>>(new Set());
  const [errorIds, setErrorIds]       = useState<Record<string, string>>({});

  // Ref stays in sync with state — used to read current per-id value synchronously
  // before the optimistic update is applied, enabling safe per-id rollback.
  const resolutionsRef = useRef<ResolutionMap>(initialResolutions ?? {});
  resolutionsRef.current = resolutions;

  const canPersist = Boolean(orgSlug);

  const handleAction = useCallback(async (id: string, action: ExceptionAction) => {
    // Find persistedId for this exception (present if DB-backed)
    const ex          = exceptions.find(e => e.id === id);
    const persistedId = ex?.persistedId;

    // Capture per-id snapshot BEFORE the optimistic update.
    // Per-id rollback avoids reverting concurrent actions on OTHER exceptions
    // when this specific action fails. Global snapshot rollback would be wrong
    // if two exceptions are saving simultaneously.
    const snapshotForId = resolutionsRef.current[id];

    // Optimistic update — apply immediately
    setResolutions(prev => applyExceptionAction(prev, id, action));
    if (action.type === "resolve" || action.type === "ignore") {
      setNoteInputs(prev => ({ ...prev, [id]: "" }));
    }
    // Clear previous error for this id
    setErrorIds(prev => { const n = { ...prev }; delete n[id]; return n; });

    // Persist if we have the required context
    if (canPersist && orgSlug && persistedId) {
      setSavingIds(prev => new Set(prev).add(id));
      try {
        await apiPatchException(orgSlug, persistedId, action);
      } catch (err) {
        // Per-id rollback: restore only this exception's previous state.
        // Other exceptions' in-flight optimistic updates are unaffected.
        const msg = err instanceof Error ? err.message : "Error al guardar";
        const fallback: ExceptionResolution = snapshotForId ?? initResolution();
        setResolutions(prev => ({ ...prev, [id]: fallback }));
        setErrorIds(prev => ({ ...prev, [id]: msg }));
      } finally {
        setSavingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      }
    }
  }, [canPersist, orgSlug, exceptions]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleNoteChange = useCallback((id: string, text: string) => {
    setNoteInputs(prev => ({ ...prev, [id]: text }));
  }, []);

  if (exceptions.length === 0) {
    return (
      <WorkspaceSection title="Mesa de excepciones">
        <EmptyOperationalState
          message="Sin excepciones detectadas"
          detail="Todos los registros cuadraron dentro de la tolerancia para este período."
        />
      </WorkspaceSection>
    );
  }

  const filtered = filterExceptions(exceptions, filter, resolutions);

  // Group filtered exceptions by type (in display priority order)
  const byType = {
    probable_match:  filtered.filter(e => e.type === "probable_match"),
    duplicate:       filtered.filter(e => e.type === "duplicate"),
    mismatch_amount: filtered.filter(e => e.type === "mismatch_amount"),
    only_in_b:       filtered.filter(e => e.type === "only_in_b"),
    only_in_a:       filtered.filter(e => e.type === "only_in_a"),
  };

  const totalOpen = exceptions.filter(e => getResolution(resolutions, e.id).status === "open").length;
  const totalDone = exceptions.filter(e => {
    const s = getResolution(resolutions, e.id).status;
    return s === "resolved" || s === "ignored";
  }).length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[4], paddingBottom: S[3], borderBottom: `1px solid ${C.lineSubtle}` }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
            Mesa de excepciones
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
            {exceptions.length} excepciones · {sourceALabel} vs {sourceBLabel} · {new Date(runAt).toLocaleString("es-CO")}
          </div>
        </div>
        {totalDone === exceptions.length && exceptions.length > 0 && (
          <span className="ag-op-status ag-op-status--ok" style={{ fontSize: T.sz.base }}>
            Todas revisadas
          </span>
        )}
        {totalOpen > 0 && (
          <div style={{ display: "flex", gap: S[2] }}>
            <button
              className="ag-action-secondary"
              onClick={() => {
                const openIds = exceptions.filter(e => getResolution(resolutions, e.id).status === "open").map(e => e.id);
                setResolutions(prev => {
                  let next = { ...prev };
                  for (const id of openIds) {
                    next = applyExceptionAction(next, id, { type: "set_reviewing" });
                  }
                  return next;
                });
              }}
            >
              Marcar todas en revisión ({totalOpen})
            </button>
          </div>
        )}
      </div>

      {/* Summary KPI bar */}
      <SummaryBar exceptions={exceptions} resolutions={resolutions} />

      {/* Filter bar */}
      <FilterBar
        filter={filter}
        exceptions={exceptions}
        resolutions={resolutions}
        onChange={setFilter}
      />

      {/* Persistence indicator */}
      <div style={{
        fontFamily:   T.mono,
        fontSize:     T.sz["2xs"],
        color:        C.inkFaint,
        background:   C.surface,
        border:       `1px solid ${C.line}`,
        borderRadius: R.xs,
        padding:      "4px 10px",
        marginBottom: S[4],
        display:      "inline-flex",
        alignItems:   "center",
        gap:          S[1]+2,
      }}>
        {canPersist ? (
          <>
            <span style={{ color: C.green }}>●</span>
            Cambios guardados en base de datos · historial de auditoría activo
          </>
        ) : (
          <>
            <span style={{ color: C.inkGhost }}>●</span>
            Vista de solo lectura · abre desde una sesión para guardar cambios
          </>
        )}
      </div>

      {/* Exception panels by type */}
      {filtered.length === 0 ? (
        <EmptyOperationalState
          message="Sin excepciones para los filtros seleccionados"
          detail="Ajusta los filtros para ver más excepciones."
          action={{ label: "Limpiar filtros", onClick: () => setFilter(DEFAULT_FILTER) }}
        />
      ) : (
        <>
          <ExceptionGroupPanel
            type="probable_match"
            exceptions={byType.probable_match}
            resolutions={resolutions}
            sourceALabel={sourceALabel}
            sourceBLabel={sourceBLabel}
            expanded={expanded}
            noteInputs={noteInputs}
            savingIds={savingIds}
            errorIds={errorIds}
            onAction={handleAction}
            onToggleExpand={handleToggleExpand}
            onNoteChange={handleNoteChange}
          />
          <ExceptionGroupPanel
            type="duplicate"
            exceptions={byType.duplicate}
            resolutions={resolutions}
            sourceALabel={sourceALabel}
            sourceBLabel={sourceBLabel}
            expanded={expanded}
            noteInputs={noteInputs}
            savingIds={savingIds}
            errorIds={errorIds}
            onAction={handleAction}
            onToggleExpand={handleToggleExpand}
            onNoteChange={handleNoteChange}
          />
          <ExceptionGroupPanel
            type="mismatch_amount"
            exceptions={byType.mismatch_amount}
            resolutions={resolutions}
            sourceALabel={sourceALabel}
            sourceBLabel={sourceBLabel}
            expanded={expanded}
            noteInputs={noteInputs}
            savingIds={savingIds}
            errorIds={errorIds}
            onAction={handleAction}
            onToggleExpand={handleToggleExpand}
            onNoteChange={handleNoteChange}
          />
          <ExceptionGroupPanel
            type="only_in_b"
            exceptions={byType.only_in_b}
            resolutions={resolutions}
            sourceALabel={sourceALabel}
            sourceBLabel={sourceBLabel}
            expanded={expanded}
            noteInputs={noteInputs}
            savingIds={savingIds}
            errorIds={errorIds}
            onAction={handleAction}
            onToggleExpand={handleToggleExpand}
            onNoteChange={handleNoteChange}
          />
          <ExceptionGroupPanel
            type="only_in_a"
            exceptions={byType.only_in_a}
            resolutions={resolutions}
            sourceALabel={sourceALabel}
            sourceBLabel={sourceBLabel}
            expanded={expanded}
            noteInputs={noteInputs}
            savingIds={savingIds}
            errorIds={errorIds}
            onAction={handleAction}
            onToggleExpand={handleToggleExpand}
            onNoteChange={handleNoteChange}
          />
        </>
      )}
    </div>
  );
}
