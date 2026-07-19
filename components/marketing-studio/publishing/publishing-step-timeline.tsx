"use client";

/**
 * components/marketing-studio/publishing/publishing-step-timeline.tsx
 *
 * MS-17 — Publishing Center: Vertical step-by-step timeline for a plan.
 */

import { C, T, S }                      from "@/lib/ui/tokens";
import {
  getPublishingStatusVariant,
  getPublishingStatusLabel,
  getDestinationColor,
  getPublishingDestinationLabel,
  formatPublishingDate,
  formatScheduledCountdown,
} from "@/lib/marketing-studio/publishing/publishing-display";
import { isPendingExternalDestination } from "@/lib/marketing-studio/publishing/publishing-actions";
import type { PublishingPlanStep }      from "@/lib/marketing-studio/publishing/publishing-types";

interface Props { steps: PublishingPlanStep[] }

const STATUS_ICON: Record<string, string> = {
  published:  "✓",
  failed:     "✗",
  blocked:    "⊘",
  publishing: "▶",
  preparing:  "◌",
  queued:     "○",
  retrying:   "↺",
  planned:    "·",
  draft:      "·",
};

export function PublishingStepTimeline({ steps }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {steps.map((step, idx) => {
        const destColor  = getDestinationColor(step.destination);
        const icon       = STATUS_ICON[step.status] ?? "·";
        const isLast     = idx === steps.length - 1;
        const isPendExt  = isPendingExternalDestination(step.destination);
        const isBlocked  = step.isBlocked;
        const isFailed   = step.status === "failed";
        const isDone     = step.status === "published";
        const unresolvedDeps = step.dependencies.filter(d => !d.isResolved);

        return (
          <div key={step.id} className="ag-publishing-step" style={{
            display:    "grid",
            gridTemplateColumns: "24px 1fr",
            gap:        S[3],
            paddingBottom: isLast ? 0 : S[3],
          }}>
            {/* Icon + line */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{
                width:        20,
                height:       20,
                borderRadius: "50%",
                background:   isDone ? C.green : isFailed ? C.red : isBlocked ? C.amber : destColor,
                display:      "flex",
                alignItems:   "center",
                justifyContent: "center",
                flexShrink:   0,
              }}>
                <span style={{ fontFamily: T.mono, fontSize: 9, color: "#fff", fontWeight: 700 }}>{icon}</span>
              </div>
              {!isLast && (
                <div style={{
                  width:     1,
                  flexGrow:  1,
                  background: isDone ? C.green : C.lineSubtle,
                  marginTop: 2,
                }} />
              )}
            </div>

            {/* Content */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingBottom: isLast ? 0 : S[3] }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>
                    {getPublishingDestinationLabel(step.destination)}
                  </span>
                  {isPendExt && (
                    <span style={{ fontFamily: T.mono, fontSize: 9, color: C.amber }}>pending_external</span>
                  )}
                </div>
                <span className={`ag-op-status ag-op-status--${getPublishingStatusVariant(step.status)}`}>
                  {getPublishingStatusLabel(step.status)}
                </span>
              </div>

              {/* Schedule */}
              {step.scheduledAt && (
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: step.isOverdue ? C.red : C.inkLight }}>
                  {formatScheduledCountdown(step.scheduledAt)}
                </span>
              )}

              {/* Execution job */}
              {step.executionJobId && (
                <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                  job: {step.executionJobId.slice(-8)}
                </span>
              )}

              {/* Unresolved deps */}
              {unresolvedDeps.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
                  {unresolvedDeps.map((d, i) => (
                    <span key={i} style={{ fontFamily: T.mono, fontSize: 9, color: C.amber }}>
                      ○ {d.description}
                    </span>
                  ))}
                </div>
              )}

              {/* Error */}
              {step.lastError && (
                <span style={{
                  fontFamily:  T.mono,
                  fontSize:    T.sz.xs,
                  color:       C.red,
                  background:  C.redLight,
                  padding:     `2px ${S[2]}px`,
                  borderRadius: 3,
                }}>
                  {step.lastError}
                </span>
              )}

              {step.retryCount > 0 && (
                <span style={{ fontFamily: T.mono, fontSize: 9, color: C.amber }}>
                  {step.retryCount}× reintentado
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
