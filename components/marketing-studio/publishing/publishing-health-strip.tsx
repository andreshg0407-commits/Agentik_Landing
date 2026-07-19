"use client";

/**
 * components/marketing-studio/publishing/publishing-health-strip.tsx
 *
 * MS-17 — Publishing Center: Global KPI strip.
 */

import { C, T, S }                    from "@/lib/ui/tokens";
import {
  getPublishingHealthColor,
  getPublishingHealthLabel,
  getPublishingHealthVariant,
} from "@/lib/marketing-studio/publishing/publishing-display";
import type { PublishingHealthSummary } from "@/lib/marketing-studio/publishing/publishing-types";

interface Props { health: PublishingHealthSummary }

export function PublishingHealthStrip({ health }: Props) {
  const healthColor = getPublishingHealthColor(health.level);

  const kpis = [
    { label: "Planes activos",  value: health.activePlans,    color: health.activePlans > 0    ? C.blueDark : C.inkLight },
    { label: "Bloqueados",      value: health.blockedPlans,   color: health.blockedPlans > 0   ? C.red : C.green },
    { label: "Steps fallidos",  value: health.failedSteps,    color: health.failedSteps > 0    ? C.red : C.green },
    { label: "Vencidos",        value: health.overdueSteps,   color: health.overdueSteps > 0   ? C.red : C.green },
    { label: "Reintentando",    value: health.retryingSteps,  color: health.retryingSteps > 0  ? C.amber : C.green },
    { label: "Completados hoy", value: health.completedToday, color: health.completedToday > 0 ? C.green : C.inkLight },
  ];

  return (
    <div className="ag-publishing-health" style={{
      display:      "flex",
      alignItems:   "center",
      gap:          S[6],
      padding:      `${S[3]}px ${S[6]}px`,
      borderBottom: `1px solid ${C.line}`,
      background:   C.surfaceAlt,
      flexWrap:     "wrap",
    }}>
      {/* Health dot + label */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2], flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: healthColor, display: "inline-block" }} />
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: healthColor }}>
          {getPublishingHealthLabel(health.level)}
        </span>
      </div>

      <div style={{ width: 1, height: 20, background: C.line, flexShrink: 0 }} />

      {/* KPIs */}
      <div style={{ display: "flex", gap: S[5], flexWrap: "wrap" }}>
        {kpis.map(kpi => (
          <div key={kpi.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>{kpi.label}</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: kpi.color }}>
              {kpi.value}
            </span>
          </div>
        ))}
      </div>

      {/* Bottlenecks */}
      {health.bottlenecks.length > 0 && (
        <>
          <div style={{ width: 1, height: 20, background: C.line, flexShrink: 0 }} />
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          S[2],
            padding:      `${S[1]}px ${S[3]}px`,
            background:   C.redLight,
            borderRadius: 4,
            flexShrink:   0,
          }}>
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.red, fontWeight: 600 }}>
              ⚠ {health.bottlenecks[0]}
              {health.bottlenecks.length > 1 && ` +${health.bottlenecks.length - 1}`}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
