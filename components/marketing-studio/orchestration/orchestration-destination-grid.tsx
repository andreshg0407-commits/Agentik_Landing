"use client";

/**
 * components/marketing-studio/orchestration/orchestration-destination-grid.tsx
 *
 * MS-12 — Destination health matrix.
 * Shows per-channel operational status, active/failed job counts, synced products.
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import type { DestinationHealth } from "@/lib/marketing-studio/orchestration/orchestration-types";
import { DEST_HEALTH_LABELS } from "@/lib/marketing-studio/orchestration/orchestration-display";

interface Props {
  destinations: DestinationHealth[];
}

export function OrchestrationDestinationGrid({ destinations }: Props) {
  if (destinations.length === 0) return null;

  return (
    <div
      style={{
        display:               "grid",
        gridTemplateColumns:   `repeat(${Math.min(destinations.length, 5)}, 1fr)`,
        gap:                   S[2],
        padding:               `${S[3]}px ${S[4]}px`,
      }}
    >
      {destinations.map(dest => (
        <div
          key={dest.channel}
          className={`ag-destination-health ag-destination-health--${dest.healthLevel}`}
        >
          <div className="ag-destination-health__name">{dest.label}</div>
          <div className="ag-destination-health__status">{DEST_HEALTH_LABELS[dest.healthLevel]}</div>

          {dest.errorSummary && (
            <div
              style={{
                fontSize:   T.sz.xs,
                fontFamily: T.mono,
                color:      C.red,
                marginTop:  S[1],
              }}
            >
              {dest.errorSummary}
            </div>
          )}

          <div className="ag-destination-health__metrics">
            {dest.syncedProducts > 0 && (
              <span className="ag-destination-health__metric">
                {dest.syncedProducts}/{dest.totalProducts} sync
              </span>
            )}
            {dest.activeJobs > 0 && (
              <span
                className="ag-destination-health__metric"
                style={{ color: C.blue }}
              >
                {dest.activeJobs} activo{dest.activeJobs > 1 ? "s" : ""}
              </span>
            )}
            {dest.failedJobs > 0 && (
              <span
                className="ag-destination-health__metric"
                style={{ color: C.red }}
              >
                {dest.failedJobs} fallido{dest.failedJobs > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
