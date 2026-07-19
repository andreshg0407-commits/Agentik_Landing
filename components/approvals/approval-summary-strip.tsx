"use client";

/**
 * components/approvals/approval-summary-strip.tsx
 *
 * Agentik — Approval Inbox Summary Strip
 * Sprint: AGENTIK-APPROVAL-INBOX-01
 *
 * Operational KPI strip for the approval inbox.
 */

import { C, T, S } from "@/lib/ui/tokens";
import type { ApprovalInboxSummary } from "@/lib/approvals/viewmodel/approval-inbox-viewmodel";

interface Props {
  summary: ApprovalInboxSummary;
}

interface KpiItem {
  label:  string;
  value:  number;
  accent?: string;
}

export function ApprovalSummaryStrip({ summary }: Props) {
  const kpis: KpiItem[] = [
    { label: "Total",      value: summary.total },
    { label: "Pendientes", value: summary.pending,   accent: summary.pending   > 0 ? C.amber  : undefined },
    { label: "Aprobadas",  value: summary.approved,  accent: summary.approved  > 0 ? C.green  : undefined },
    { label: "Rechazadas", value: summary.rejected,  accent: summary.rejected  > 0 ? C.red    : undefined },
    { label: "Críticas",   value: summary.critical,  accent: summary.critical  > 0 ? C.red    : undefined },
    { label: "Vencidas",   value: summary.overdue,   accent: summary.overdue   > 0 ? C.amber  : undefined },
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
