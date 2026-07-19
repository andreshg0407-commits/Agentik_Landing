"use client";

/**
 * components/marketing-studio/social/social-health-strip.tsx
 *
 * MS-16 — Social Runtime: global KPI strip.
 */

import { C, T, S }             from "@/lib/ui/tokens";
import {
  getSocialHealthColor,
  getSocialHealthLabel,
  getRetryPressureLabel,
  getRetryPressureColor,
} from "@/lib/marketing-studio/social/social-display";
import type { SocialHealthSummary } from "@/lib/marketing-studio/social/social-types";

interface Props { health: SocialHealthSummary }

export function SocialHealthStrip({ health }: Props) {
  const healthColor   = getSocialHealthColor(health.level);
  const pressureColor = getRetryPressureColor(health.retryPressure);

  const kpis = [
    { label: "En cola",       value: String(health.queuedCount),    color: C.ink },
    { label: "Publicando",    value: String(health.liveNow),        color: health.liveNow > 0 ? C.blueDark : C.inkLight },
    { label: "Fallidos",      value: String(health.failedCount),    color: health.failedCount > 0 ? C.red : C.green },
    { label: "Reintentos",    value: String(health.retryingCount),  color: health.retryingCount > 0 ? C.amber : C.green },
    { label: "Vencidos",      value: String(health.overdueCount),   color: health.overdueCount > 0 ? C.red : C.green },
    { label: "Con campaña",   value: String(health.campaignLinked), color: C.ink },
  ];

  return (
    <div className="ag-social-health" style={{
      display:      "flex",
      alignItems:   "center",
      gap:          S[6],
      padding:      `${S[3]}px ${S[6]}px`,
      borderBottom: `1px solid ${C.line}`,
      background:   C.surfaceAlt,
      flexWrap:     "wrap",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[2], flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: healthColor, display: "inline-block" }} />
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: healthColor }}>
          {getSocialHealthLabel(health.level)}
        </span>
      </div>
      <div style={{ width: 1, height: 20, background: C.line, flexShrink: 0 }} />
      <div style={{ display: "flex", alignItems: "center", gap: S[2], flexShrink: 0 }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>Presión retries:</span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: pressureColor }}>
          {getRetryPressureLabel(health.retryPressure)}
        </span>
      </div>
      <div style={{ width: 1, height: 20, background: C.line, flexShrink: 0 }} />
      <div style={{ display: "flex", gap: S[5], flexWrap: "wrap" }}>
        {kpis.map(kpi => (
          <div key={kpi.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>{kpi.label}</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: kpi.color }}>{kpi.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
