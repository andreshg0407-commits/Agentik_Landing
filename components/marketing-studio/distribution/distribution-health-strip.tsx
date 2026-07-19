"use client";

/**
 * components/marketing-studio/distribution/distribution-health-strip.tsx
 *
 * MS-14 — Global health strip for Distribution Center.
 */

import { C, T, S }          from "@/lib/ui/tokens";
import {
  getHealthVariant,
  getHealthLabel,
} from "@/lib/marketing-studio/distribution/distribution-display";
import type { DistributionState } from "@/lib/marketing-studio/distribution/distribution-types";

interface Props {
  state: DistributionState;
}

export function DistributionHealthStrip({ state }: Props) {
  const { health, channelCoverage, variantGaps } = state;

  const variant = getHealthVariant(health.level);
  const label   = getHealthLabel(health.level);

  const variantColor: Record<string, string> = {
    ok:      C.green,
    warning: C.amber,
    critical: C.red,
    default: C.inkLight,
  };
  const color = variantColor[variant] ?? C.inkLight;

  const activeChannels = channelCoverage.filter(c => c.totalProducts > 0);
  const avgCoverage =
    activeChannels.length > 0
      ? activeChannels.reduce((s, c) => s + c.coveragePct, 0) / activeChannels.length
      : 0;

  const kpis = [
    { label: "Cobertura promedio",   value: `${Math.round(avgCoverage)}%`,           color: avgCoverage >= 80 ? C.green : avgCoverage >= 50 ? C.amber : C.red },
    { label: "Flujos activos",       value: String(state.activePipelines.length),    color: C.ink },
    { label: "Drops programados",    value: String(state.scheduledDrops.length),     color: C.ink },
    { label: "Variantes faltantes",  value: String(health.missingVariantCount),      color: health.missingVariantCount > 0 ? C.amber : C.green },
    { label: "Flujos fallidos",      value: String(health.failedPipelineCount),      color: health.failedPipelineCount > 0 ? C.red : C.green },
  ];

  return (
    <div style={{
      display:         "flex",
      alignItems:      "center",
      gap:             S[6],
      padding:         `${S[3]}px ${S[6]}px`,
      borderBottom:    `1px solid ${C.line}`,
      background:      C.surfaceAlt,
    }}>
      {/* Health badge */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2], flexShrink: 0 }}>
        <span style={{
          width:        8,
          height:       8,
          borderRadius: "50%",
          background:   color,
          flexShrink:   0,
          display:      "inline-block",
        }} />
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color }}>
          {label}
        </span>
      </div>

      <div style={{ width: 1, height: 20, background: C.line, flexShrink: 0 }} />

      {/* KPIs */}
      <div style={{ display: "flex", gap: S[6], flexWrap: "wrap" }}>
        {kpis.map(kpi => (
          <div key={kpi.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
              {kpi.label}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: kpi.color }}>
              {kpi.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
