"use client";

/**
 * components/marketing-studio/publishing/publishing-destination-grid.tsx
 *
 * MS-17 — Publishing Center: Health matrix per destination.
 */

import { C, T, S }                     from "@/lib/ui/tokens";
import {
  getPublishingDestinationLabel,
  getDestinationColor,
  getPublishingHealthVariant,
  formatPublishingDate,
} from "@/lib/marketing-studio/publishing/publishing-display";
import type { PublishingDestinationState } from "@/lib/marketing-studio/publishing/publishing-types";

interface Props { destinationStates: PublishingDestinationState[] }

export function PublishingDestinationGrid({ destinationStates }: Props) {
  const active = destinationStates.filter(d => d.totalSteps > 0);

  if (active.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Sin actividad de publicación en ningún destino
        </span>
      </div>
    );
  }

  return (
    <div className="ag-op-table">
      <div className="ag-op-row" style={{ background: C.surfaceAlt }}>
        {["Destino", "Total", "Pub.", "Fallidos", "Bloqueados", "Pendientes", "Última pub.", "Salud"].map(h => (
          <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, fontWeight: 600 }}>
            {h}
          </span>
        ))}
      </div>

      {active.map(dest => {
        const brandColor = getDestinationColor(dest.destination);
        const variant    = getPublishingHealthVariant(dest.healthLevel);

        return (
          <div key={dest.destination} className="ag-op-row ag-publishing-destination" style={{
            background: dest.healthLevel === "blocked" ? C.redLight
                      : dest.healthLevel === "degraded" ? "#fffbeb"
                      : undefined,
          }}>
            {/* Destination */}
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: brandColor, display: "inline-block" }} />
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink }}>
                {getPublishingDestinationLabel(dest.destination)}
              </span>
            </div>

            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>{dest.totalSteps}</span>

            <span style={{
              fontFamily: T.mono, fontSize: T.sz.sm,
              color:      dest.publishedSteps > 0 ? C.green : C.inkLight,
              fontWeight: dest.publishedSteps > 0 ? 600 : 400,
            }}>
              {dest.publishedSteps > 0 ? dest.publishedSteps : "—"}
            </span>

            <span style={{
              fontFamily: T.mono, fontSize: T.sz.sm,
              color:      dest.failedSteps > 0 ? C.red : C.inkLight,
              fontWeight: dest.failedSteps > 0 ? 600 : 400,
            }}>
              {dest.failedSteps > 0 ? dest.failedSteps : "—"}
            </span>

            <span style={{
              fontFamily: T.mono, fontSize: T.sz.sm,
              color:      dest.blockedSteps > 0 ? C.amber : C.inkLight,
              fontWeight: dest.blockedSteps > 0 ? 600 : 400,
            }}>
              {dest.blockedSteps > 0 ? dest.blockedSteps : "—"}
            </span>

            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
              {dest.pendingSteps}
            </span>

            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
              {formatPublishingDate(dest.lastPublishedAt)}
            </span>

            <span className={`ag-op-status ag-op-status--${variant}`}>
              {dest.healthLevel}
            </span>
          </div>
        );
      })}
    </div>
  );
}
