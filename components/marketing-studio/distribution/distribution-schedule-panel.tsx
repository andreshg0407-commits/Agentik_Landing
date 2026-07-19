"use client";

/**
 * components/marketing-studio/distribution/distribution-schedule-panel.tsx
 *
 * MS-14 — Scheduled drops list.
 */

import { C, T, S }            from "@/lib/ui/tokens";
import {
  getChannelLabel,
  formatScheduledDate,
  getDistributionStatusLabel,
  getDistributionStatusVariant,
} from "@/lib/marketing-studio/distribution/distribution-display";
import type { DistributionScheduleDTO } from "@/lib/marketing-studio/distribution/distribution-types";

interface Props {
  schedules: DistributionScheduleDTO[];
  orgSlug:   string;
}

export function DistributionSchedulePanel({ schedules }: Props) {
  if (schedules.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px ${S[2]}px` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Sin drops programados
        </span>
      </div>
    );
  }

  // Sort: overdue first, then by scheduledAt asc
  const now    = new Date();
  const sorted = [...schedules].sort((a, b) => {
    const aMs = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Infinity;
    const bMs = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Infinity;
    return aMs - bMs;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
      {sorted.slice(0, 8).map(schedule => {
        const isOverdue = schedule.scheduledAt
          ? new Date(schedule.scheduledAt) < now
          : false;
        const statusVariant = isOverdue ? "critical" : getDistributionStatusVariant(schedule.status);

        return (
          <div key={schedule.id} style={{
            padding:       `${S[3]}px`,
            background:    isOverdue ? C.redLight : C.white,
            border:        `1px solid ${isOverdue ? C.redBorder : C.line}`,
            borderRadius:  6,
            display:       "flex",
            flexDirection: "column",
            gap:           S[1],
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz.sm,
                fontWeight: 600,
                color:      C.ink,
                flex:       1,
                overflow:   "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {schedule.label}
              </span>
              <span className={`ag-op-status ag-op-status--${statusVariant}`}>
                {isOverdue ? "Vencido" : getDistributionStatusLabel(schedule.status)}
              </span>
            </div>

            <div style={{ display: "flex", gap: S[3], alignItems: "center" }}>
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      C.inkMid,
                background: C.surfaceAlt,
                padding:    "2px 6px",
                borderRadius: 3,
              }}>
                {getChannelLabel(schedule.channel)}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: isOverdue ? C.red : C.inkLight }}>
                {formatScheduledDate(schedule.scheduledAt)}
              </span>
            </div>

            {schedule.productIds.length > 0 && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                {schedule.productIds.length} producto{schedule.productIds.length > 1 ? "s" : ""}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
