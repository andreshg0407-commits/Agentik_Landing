"use client";

/**
 * components/reconciliation/execution-timeline.tsx
 *
 * AGENTIK-RECON-SESSION-PERSISTENCE-01 — Phase 4 + 5 + 7
 * Execution Timeline + Comparison
 *
 * Shows a historical list of ReconExecution records.
 * Each row: date, sources, records, matchRate, score, status.
 *
 * When 2+ executions exist, shows a comparison delta between
 * the most recent and its predecessor (no AI — pure math).
 *
 * Empty state: "Sin ejecuciones previas."
 *
 * Props: executions loaded server-side and passed as props.
 * Live refresh: re-fetches after a new run completes.
 *
 * Design rules:
 *   - T.mono for ALL data
 *   - ag-op-table / ag-op-row for tables
 *   - C.* tokens, no Tailwind color classes
 */

import React, { useCallback, useEffect, useState } from "react";
import { C, S, T, R }  from "@/lib/ui/tokens";
import type { ReconExecutionRow } from "@/lib/reconciliation/executions/execution-repository";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso.slice(0, 10); }
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000)  return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function deltaSign(n: number): string {
  if (n > 0)  return `+${n}`;
  if (n < 0)  return `${n}`;
  return "=";
}

function deltaColor(n: number, higherIsBetter = true): string {
  if (n === 0) return C.inkFaint;
  return (n > 0) === higherIsBetter ? C.green : C.red;
}

// ── Comparison strip (Phase 5) ────────────────────────────────────────────────

function ComparisonStrip({ current, prev }: { current: ReconExecutionRow; prev: ReconExecutionRow }) {
  const deltaMatch    = current.matchRate      - prev.matchRate;
  const deltaScore    = current.avgScore       - prev.avgScore;
  const deltaRecon    = current.pairsReconciled - prev.pairsReconciled;
  const deltaMismatch = current.pairsMismatch  - prev.pairsMismatch;

  const trend = deltaMatch > 2 || deltaScore > 3 ? "improved"
    : deltaMatch < -2 || deltaScore < -3         ? "degraded"
    : "stable";

  const trendColor = trend === "improved" ? C.green : trend === "degraded" ? C.red : C.inkFaint;
  const trendLabel = trend === "improved" ? "▲ MEJORA" : trend === "degraded" ? "▼ BAJA" : "≈ ESTABLE";

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.lineSubtle}`,
      borderLeft: `3px solid ${trendColor}`,
      borderRadius: R.md, padding: S[3], marginBottom: S[3],
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[2] }}>
        <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          COMPARACIÓN vs EJECUCIÓN ANTERIOR
        </div>
        <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: trendColor }}>{trendLabel}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
        {[
          { l: "TASA MATCH",    v: `${deltaSign(deltaMatch)}%`,    c: deltaColor(deltaMatch)    },
          { l: "SCORE PROM.",   v: deltaSign(deltaScore),          c: deltaColor(deltaScore)    },
          { l: "CONCILIADOS",   v: deltaSign(deltaRecon),          c: deltaColor(deltaRecon)    },
          { l: "DIFERENCIAS",   v: deltaSign(deltaMismatch),       c: deltaColor(deltaMismatch, false) },
        ].map(item => (
          <div key={item.l} style={{ background: C.surfaceAlt, borderRadius: R.xs, padding: `${S[1]}px ${S[2]}px` }}>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase" }}>{item.l}</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: item.c }}>{item.v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: S[2], fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>
        Anterior: {formatDate(prev.createdAt)} · {prev.pairsReconciled} conciliados · {prev.matchRate}% match
      </div>
    </div>
  );
}

// ── Timeline row ─────────────────────────────────────────────────────────────

function ExecutionRow({ exec, isLatest }: { exec: ReconExecutionRow; isLatest: boolean }) {
  const matchColor = exec.matchRate >= 80 ? C.green : exec.matchRate >= 60 ? C.amber : C.red;
  const statusColor = exec.status === "completed" ? C.green : exec.status === "failed" ? C.red : C.amber;

  return (
    <div
      className="ag-op-row"
      style={{
        display: "grid", gridTemplateColumns: "90px 1fr 70px 70px 70px 60px",
        gap: S[2], alignItems: "center", padding: `${S[2]}px 0`,
        borderBottom: `1px solid ${C.lineSubtle}`,
        background: isLatest ? C.blueLight : "transparent",
        borderLeft: isLatest ? `3px solid ${C.blueDark}` : "3px solid transparent",
        paddingLeft: isLatest ? S[2] : 0,
      }}
    >
      {/* Date */}
      <div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink, fontWeight: isLatest ? 700 : 400 }}>
          {formatDate(exec.createdAt)}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>
          {formatDuration(exec.durationMs)}
        </div>
      </div>

      {/* Sources */}
      <div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {exec.sourceALabel} ↔ {exec.sourceBLabel}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>
          {exec.period} · {exec.recordsA.toLocaleString("es-CO")} / {exec.recordsB.toLocaleString("es-CO")} reg.
        </div>
      </div>

      {/* Match rate */}
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: matchColor }}>
          {exec.matchRate}%
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>match</div>
      </div>

      {/* Reconciled */}
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.green }}>
          {exec.pairsReconciled.toLocaleString("es-CO")}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>concil.</div>
      </div>

      {/* Avg score */}
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: exec.avgScore >= 85 ? C.green : exec.avgScore >= 60 ? C.amber : C.red }}>
          {exec.avgScore}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>score</div>
      </div>

      {/* Status */}
      <div style={{ textAlign: "right" }}>
        <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: statusColor }}>
          {exec.status.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ExecutionTimelineProps {
  orgSlug:              string;
  sourceAType?:         string;
  sourceBType?:         string;
  /** Pass the latest executionReport.executionId to trigger a refresh */
  latestExecutionId?:   string;
}

export function ExecutionTimeline({
  orgSlug,
  sourceAType,
  sourceBType,
  latestExecutionId,
}: ExecutionTimelineProps) {
  const [executions, setExecutions] = useState<ReconExecutionRow[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const fetchExecutions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (sourceAType) params.set("sourceAType", sourceAType);
      if (sourceBType) params.set("sourceBType", sourceBType);
      const res  = await fetch(`/api/orgs/${orgSlug}/reconciliation/executions?${params}`);
      const data = await res.json() as { executions?: ReconExecutionRow[] };
      setExecutions(data.executions ?? []);
    } catch {
      setError("Error al cargar historial de ejecuciones.");
    } finally {
      setLoading(false);
    }
  }, [orgSlug, sourceAType, sourceBType]);

  // Initial load + refresh when a new execution completes
  useEffect(() => { void fetchExecutions(); }, [fetchExecutions, latestExecutionId]);

  if (loading && executions.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px 0`, textAlign: "center" }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Cargando historial…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: S[3], background: "#fef2f2", border: "1px solid #fecaca", borderRadius: R.sm, fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>
        {error}
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px 0`, textAlign: "center" }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Sin ejecuciones previas.</div>
        <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginTop: 4 }}>
          Ejecuta el motor de reglas para comenzar a construir historial.
        </div>
      </div>
    );
  }

  const [latest, prev] = executions;

  return (
    <div>
      {/* Comparison strip — only when 2+ executions */}
      {executions.length >= 2 && latest && prev && (
        <ComparisonStrip current={latest} prev={prev} />
      )}

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 70px 70px 70px 60px", gap: S[2], paddingBottom: S[1], borderBottom: `1px solid ${C.line}` }}>
        {["FECHA", "FUENTES", "MATCH", "CONCIL.", "SCORE", "ESTADO"].map(h => (
          <span key={h} style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: h !== "FECHA" && h !== "FUENTES" ? "right" : "left" }}>{h}</span>
        ))}
      </div>

      {/* Rows */}
      {executions.map((exec, i) => (
        <ExecutionRow key={exec.id} exec={exec} isLatest={i === 0} />
      ))}

      {/* Footer */}
      <div style={{ paddingTop: S[2], fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textAlign: "right" }}>
        {executions.length} ejecución{executions.length !== 1 ? "es" : ""} registrada{executions.length !== 1 ? "s" : ""}{" "}
        {loading && "· actualizando…"}
      </div>
    </div>
  );
}
