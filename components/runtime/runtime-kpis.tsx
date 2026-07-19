"use client";

/**
 * components/runtime/runtime-kpis.tsx
 * KPI strip for the Approval Center executive layer.
 * Sprint: AGENTIK-AGENT-APPROVAL-CENTER-01
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import type { RuntimeMetrics } from "@/lib/agent-runtime/action-envelope";

interface KpiCell {
  label:   string;
  value:   string | number;
  color:   string;
  accent?: string;
}

function fmtMs(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 60_000)  return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60_000)}min`;
}

interface Props {
  metrics: RuntimeMetrics;
  loading: boolean;
}

export function RuntimeKpis({ metrics, loading }: Props) {
  const cells: KpiCell[] = [
    {
      label:  "Pendientes",
      value:  loading ? "—" : metrics.pendingApproval,
      color:  metrics.pendingApproval > 0 ? C.amber : C.inkLight,
      accent: metrics.pendingApproval > 0 ? C.amberBorder : C.line,
    },
    {
      label: "Aprobadas hoy",
      value: loading ? "—" : metrics.approvedToday,
      color: C.green,
      accent: C.greenBorder,
    },
    {
      label: "Rechazadas hoy",
      value: loading ? "—" : metrics.rejectedToday,
      color: metrics.rejectedToday > 0 ? C.red : C.inkLight,
      accent: metrics.rejectedToday > 0 ? C.redBorder : C.line,
    },
    {
      label: "Ejecutando",
      value: loading ? "—" : metrics.executing,
      color: C.blueDark,
      accent: C.blueBorder,
    },
    {
      label: "Fallidas",
      value: loading ? "—" : metrics.failed,
      color: metrics.failed > 0 ? C.red : C.inkLight,
      accent: metrics.failed > 0 ? C.redBorder : C.line,
    },
    {
      label: "T. prom. aprobación",
      value: loading ? "—" : fmtMs(metrics.avgApprovalMs),
      color: C.inkMid,
      accent: C.line,
    },
  ];

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "repeat(6, 1fr)",
      gap:                 S[3],
      marginBottom:        S[5],
    }}>
      {cells.map(cell => (
        <div key={cell.label} style={{
          background:   C.white,
          border:       `1px solid ${cell.accent ?? C.line}`,
          borderRadius: R.xl,
          padding:      `${S[3]}px ${S[4]}px`,
          boxShadow:    "0 1px 3px rgba(0,18,60,.05)",
        }}>
          <div style={{
            fontFamily:  T.mono,
            fontSize:    T.sz["2xs"],
            color:       C.inkFaint,
            letterSpacing: "0.05em",
            textTransform: "uppercase" as const,
            marginBottom: S[1],
          }}>
            {cell.label}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xl"],
            fontWeight: T.wt.bold,
            color:      cell.color,
            lineHeight: 1.1,
          }}>
            {cell.value}
          </div>
        </div>
      ))}
    </div>
  );
}
