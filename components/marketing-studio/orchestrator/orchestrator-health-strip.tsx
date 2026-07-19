"use client";

/**
 * components/marketing-studio/orchestrator/orchestrator-health-strip.tsx
 *
 * MS-17 — Orchestrator Runtime: Health KPI strip
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import { getHealthColor, formatDurationMs } from "@/lib/marketing-studio/orchestrator/orchestrator-display";
import type { OrchestratorHealthSummary } from "@/lib/marketing-studio/orchestrator/orchestrator-types";

interface Props {
  health: OrchestratorHealthSummary;
}

function KpiCell({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 80 }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: 700, color: color ?? C.ink }}>
        {value}
      </span>
    </div>
  );
}

export function OrchestratorHealthStrip({ health }: Props) {
  const healthColor = getHealthColor(health.level);

  return (
    <div className="ag-orchestrator-health" style={{
      display:        "flex",
      alignItems:     "center",
      gap:            S[6],
      padding:        `${S[3]}px ${S[6]}px`,
      borderBottom:   `1px solid ${C.line}`,
      background:     C.white,
      flexWrap:       "wrap",
    }}>
      {/* Health dot + label */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2], borderRight: `1px solid ${C.line}`, paddingRight: S[5] }}>
        <div style={{
          width:        10,
          height:       10,
          borderRadius: R.pill,
          background:   healthColor,
          boxShadow:    `0 0 6px ${healthColor}`,
          flexShrink:   0,
        }} />
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: healthColor }}>
          {health.label}
        </span>
      </div>

      <KpiCell label="Activos"    value={health.activePlans} />
      <KpiCell label="Bloqueados" value={health.blockedPlans}
        color={health.blockedPlans > 0 ? C.amber : C.inkLight}
      />
      <KpiCell label="Fallidos"   value={health.failedPlans}
        color={health.failedPlans > 0 ? C.red : C.inkLight}
      />
      <KpiCell label="Completados hoy" value={health.completedToday}
        color={health.completedToday > 0 ? C.green : C.inkLight}
      />
      <KpiCell label="Tasa de éxito" value={`${health.successRate}%`}
        color={health.successRate >= 80 ? C.green : health.successRate >= 60 ? C.amber : C.red}
      />
      <KpiCell label="Presión retries" value={`${health.retryPressure}%`}
        color={health.retryPressure > 30 ? C.red : health.retryPressure > 10 ? C.amber : C.inkLight}
      />
      <KpiCell label="Tiempo promedio" value={formatDurationMs(health.avgCompletionMs)} />

      {/* Top blockers */}
      {health.topBlockers.length > 0 && (
        <div style={{
          marginLeft:   "auto",
          display:      "flex",
          alignItems:   "center",
          gap:          S[2],
          background:   C.redLight,
          border:       `1px solid ${C.redBorder}`,
          borderRadius: R.sm,
          padding:      `${S[1]}px ${S[3]}px`,
        }}>
          <span style={{ fontSize: 10, color: C.red }}>⚠</span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, fontWeight: 600 }}>
            {health.topBlockers[0]}
          </span>
        </div>
      )}
    </div>
  );
}
