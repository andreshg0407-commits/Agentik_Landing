"use client";

/**
 * components/runtime/runtime-agent-load.tsx
 * Per-agent action load panel for the Approval Center.
 * Sprint: AGENTIK-AGENT-APPROVAL-CENTER-01
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import type { AgentLoadSnapshot } from "@/lib/agent-runtime/action-envelope";

const AGENT_COLOR: Record<string, { dot: string; bg: string; border: string }> = {
  david_commercial: { dot: "#B45309", bg: "rgba(217,119,6,.06)",  border: "rgba(217,119,6,.16)"  },
  diego_finance:    { dot: C.green,   bg: "rgba(22,163,74,.06)",  border: "rgba(22,163,74,.16)"  },
  luca_marketing:   { dot: C.blueDark, bg: "rgba(0,74,173,.06)", border: "rgba(0,74,173,.16)"  },
  mila_collections: { dot: C.brand,   bg: "rgba(124,58,237,.06)", border: "rgba(124,58,237,.16)" },
};

interface StatCell {
  label: string;
  value: number;
  color: string;
}

interface Props {
  agentLoad: AgentLoadSnapshot[];
}

export function RuntimeAgentLoad({ agentLoad }: Props) {
  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: R.xl,
      overflow:     "hidden",
      boxShadow:    "0 1px 4px rgba(0,18,60,.06)",
    }}>
      {/* Header */}
      <div style={{
        padding:       `${S[3]}px ${S[4]}px`,
        borderBottom:  `1px solid ${C.line}`,
        background:    C.surface,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
          Carga por Agente
        </span>
      </div>

      {/* Agent rows */}
      <div>
        {agentLoad.map((ag, i) => {
          const theme = AGENT_COLOR[ag.agentId] ?? { dot: C.inkLight, bg: C.surface, border: C.line };
          const stats: StatCell[] = [
            { label: "Propuestas",  value: ag.proposed,        color: C.inkMid   },
            { label: "Pendientes",  value: ag.pendingApproval, color: ag.pendingApproval > 0 ? C.amber    : C.inkFaint },
            { label: "Aprobadas",   value: ag.approved,        color: ag.approved > 0       ? C.green    : C.inkFaint },
            { label: "Rechazadas",  value: ag.rejected,        color: ag.rejected > 0       ? C.red      : C.inkFaint },
            { label: "Fallidas",    value: ag.failed,          color: ag.failed > 0         ? C.redDark  : C.inkFaint },
          ];

          return (
            <div key={ag.agentId} style={{
              display:       "flex",
              alignItems:    "center",
              gap:           S[4],
              padding:       `${S[3]}px ${S[4]}px`,
              borderBottom:  i < agentLoad.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
              background:    ag.proposed > 0 ? theme.bg : "transparent",
            }}>
              {/* Agent identity */}
              <div style={{ display: "flex", alignItems: "center", gap: S[2], minWidth: 80 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: theme.dot, border: `1.5px solid ${theme.border}` }} />
                <span style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.semibold, color: C.ink }}>
                  {ag.label}
                </span>
              </div>

              {/* Stats */}
              <div style={{ display: "flex", gap: S[4], flex: 1 }}>
                {stats.map(stat => (
                  <div key={stat.label} style={{ textAlign: "center" as const }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.bold, color: stat.color }}>
                      {stat.value}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkGhost, letterSpacing: "0.04em" }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Active indicator */}
              {ag.pendingApproval > 0 && (
                <span style={{
                  fontFamily:   T.mono,
                  fontSize:     9,
                  color:        C.amber,
                  background:   C.amberLight,
                  border:       `1px solid ${C.amberBorder}`,
                  borderRadius: R.pill,
                  padding:      "1px 7px",
                  letterSpacing: "0.04em",
                }}>
                  ACTIVO
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
