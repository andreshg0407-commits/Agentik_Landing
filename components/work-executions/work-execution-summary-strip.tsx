"use client";

/**
 * components/work-executions/work-execution-summary-strip.tsx
 *
 * Agentik — Ejecuciones Summary Strip
 * Sprint: AGENTIK-WORK-EXECUTION-OBSERVABILITY-01
 */

import { C, T, S } from "@/lib/ui/tokens";
import type { WorkExecutionSummary } from "@/lib/work/live/viewmodel/work-execution-viewmodel";

interface Props {
  summary: WorkExecutionSummary;
}

interface KpiItem {
  label:   string;
  value:   string | number;
  accent?: string;
}

function formatDurationLabel(ms: number): string {
  if (ms === 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

export function WorkExecutionSummaryStrip({ summary }: Props) {
  const kpis: KpiItem[] = [
    { label: "Total",        value: summary.total },
    { label: "Completadas",  value: summary.completed,  accent: summary.completed > 0 ? C.green     : undefined },
    { label: "Fallidas",     value: summary.failed,     accent: summary.failed    > 0 ? C.red       : undefined },
    { label: "En curso",     value: summary.running,    accent: summary.running   > 0 ? C.amber     : undefined },
    { label: "Reintentos",   value: summary.retries,    accent: summary.retries   > 0 ? C.amberDark : undefined },
    { label: "Duración prom", value: formatDurationLabel(summary.averageDurationMs) },
  ];

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "repeat(6, 1fr)",
      gap:                 S[3],
      marginBottom:        S[6],
    }}>
      {kpis.map(kpi => (
        <div key={kpi.label} className="ag-kpi-card" style={{ padding: `${S[4]}px ${S[4]}px` }}>
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz["2xl"],
            fontWeight:   T.wt.bold,
            color:        kpi.accent ?? C.ink,
            lineHeight:   1,
            marginBottom: S[1],
          }}>
            {kpi.value}
          </div>
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz.xs,
            color:         C.inkLight,
            fontWeight:    T.wt.medium,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
          }}>
            {kpi.label}
          </div>
        </div>
      ))}
    </div>
  );
}
