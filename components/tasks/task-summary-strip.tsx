"use client";

/**
 * components/tasks/task-summary-strip.tsx
 *
 * Agentik — Task Inbox Summary Strip
 * Sprint: AGENTIK-TASK-INBOX-01
 *
 * Operational KPI strip for the task inbox: totals, open, in-progress, completed, critical, overdue.
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import type { TaskInboxSummary } from "@/lib/tasks/viewmodel/task-inbox-viewmodel";

interface Props {
  summary: TaskInboxSummary;
}

interface KpiItem {
  label: string;
  value: number;
  accent?: string;
}

export function TaskSummaryStrip({ summary }: Props) {
  const kpis: KpiItem[] = [
    { label: "Total",      value: summary.total },
    { label: "Pendientes", value: summary.open },
    { label: "En proceso", value: summary.inProgress, accent: C.blue },
    { label: "Completadas",value: summary.completed,  accent: C.green },
    { label: "Críticas",   value: summary.critical,   accent: C.red },
    { label: "Vencidas",   value: summary.overdue,    accent: C.amber },
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
            fontFamily: T.mono,
            fontSize:   T.sz["2xl"],
            fontWeight: T.wt.bold,
            color:      kpi.accent ?? C.ink,
            lineHeight: 1,
            marginBottom: S[1],
          }}>
            {kpi.value}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      C.inkLight,
            fontWeight: T.wt.medium,
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
