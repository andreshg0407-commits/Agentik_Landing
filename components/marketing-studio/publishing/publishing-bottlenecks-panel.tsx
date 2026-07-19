"use client";

/**
 * components/marketing-studio/publishing/publishing-bottlenecks-panel.tsx
 *
 * MS-17 — Publishing Center: Bottleneck + stuck plan detection.
 */

import { C, T, S }                  from "@/lib/ui/tokens";
import type { PublishingHealthSummary } from "@/lib/marketing-studio/publishing/publishing-types";

interface Props { health: PublishingHealthSummary }

export function PublishingBottlenecksPanel({ health }: Props) {
  const hasIssues = health.bottlenecks.length > 0 || health.blockedPlans > 0 || health.failedSteps > 0;

  if (!hasIssues) {
    return (
      <div style={{ padding: `${S[4]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green }}>
          Sin cuellos de botella detectados
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {/* Summary chips */}
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
        {health.blockedPlans > 0 && (
          <span className="ag-op-status ag-op-status--critical">
            {health.blockedPlans} plan(s) bloqueados
          </span>
        )}
        {health.failedSteps > 0 && (
          <span className="ag-op-status ag-op-status--critical">
            {health.failedSteps} steps fallidos
          </span>
        )}
        {health.overdueSteps > 0 && (
          <span className="ag-op-status ag-op-status--warning">
            {health.overdueSteps} steps vencidos
          </span>
        )}
        {health.retryingSteps > 0 && (
          <span className="ag-op-status ag-op-status--retry-scheduled">
            {health.retryingSteps} reintentando
          </span>
        )}
      </div>

      {/* Bottleneck list */}
      {health.bottlenecks.map((b, i) => (
        <div key={i} className="ag-publishing-blocker" style={{
          display:      "flex",
          alignItems:   "flex-start",
          gap:          S[3],
          padding:      `${S[3]}px`,
          background:   C.redLight,
          borderRadius: 4,
          border:       `1px solid ${C.redLight}`,
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, fontWeight: 700, flexShrink: 0 }}>
            ⚠
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red }}>
            {b}
          </span>
        </div>
      ))}

      {/* Destination health problems */}
      {health.destinationHealth
        .filter(d => d.healthLevel !== "healthy" && d.totalSteps > 0)
        .map(d => (
          <div key={d.destination} style={{
            display:       "flex",
            alignItems:    "center",
            justifyContent:"space-between",
            padding:       `${S[2]}px ${S[3]}px`,
            background:    C.surfaceAlt,
            borderRadius:  4,
            border:        `1px solid ${C.line}`,
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, fontWeight: 600 }}>
              {d.destination}
            </span>
            <div style={{ display: "flex", gap: S[2] }}>
              {d.failedSteps > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red }}>
                  {d.failedSteps} fallidos
                </span>
              )}
              {d.blockedSteps > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber }}>
                  {d.blockedSteps} bloqueados
                </span>
              )}
            </div>
          </div>
        ))
      }
    </div>
  );
}
