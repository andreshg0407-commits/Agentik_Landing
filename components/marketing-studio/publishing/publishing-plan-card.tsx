"use client";

/**
 * components/marketing-studio/publishing/publishing-plan-card.tsx
 *
 * MS-17 — Publishing Center: Single plan card.
 */

import { C, T, S }                   from "@/lib/ui/tokens";
import {
  getPublishingStatusVariant,
  getPublishingStatusLabel,
  getPublishingPriorityVariant,
  getPublishingPriorityLabel,
  getPublishingTriggerLabel,
  getDestinationColor,
  getProgressColor,
  formatPublishingDate,
  formatScheduledCountdown,
} from "@/lib/marketing-studio/publishing/publishing-display";
import type { PublishingPlan } from "@/lib/marketing-studio/publishing/publishing-types";

interface Props {
  plan:     PublishingPlan;
  onSelect: (plan: PublishingPlan) => void;
}

export function PublishingPlanCard({ plan, onSelect }: Props) {
  const isBlocked  = plan.status === "blocked";
  const isFailed   = plan.status === "failed";
  const isActive   = ["publishing","preparing","queued"].includes(plan.status);

  const destinations = [...new Set(plan.steps.map(s => s.destination))];
  const failedSteps  = plan.steps.filter(s => s.status === "failed").length;
  const doneSteps    = plan.steps.filter(s => s.status === "published").length;

  return (
    <div
      className="ag-publishing-plan"
      onClick={() => onSelect(plan)}
      style={{
        border:     `1px solid ${isBlocked ? C.red : isFailed ? C.redLight : C.line}`,
        borderRadius: 6,
        overflow:   "hidden",
        cursor:     "pointer",
        background: isBlocked ? "#fff5f5" : isFailed ? C.redLight : C.surface,
        transition: "box-shadow 0.15s ease",
      }}
    >
      {/* Header */}
      <div style={{
        display:         "flex",
        alignItems:      "center",
        justifyContent:  "space-between",
        padding:         `${S[3]}px ${S[4]}px`,
        background:      C.surfaceAlt,
        borderBottom:    `1px solid ${C.lineSubtle}`,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            {isActive && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.blueDark, display: "inline-block" }} />
            )}
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
              {getPublishingTriggerLabel(plan.trigger)}
            </span>
          </div>
          <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
            {plan.id.slice(-8)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span className={`ag-op-status ag-op-status--${getPublishingPriorityVariant(plan.priority)}`}>
            {getPublishingPriorityLabel(plan.priority)}
          </span>
          <span className={`ag-op-status ag-op-status--${getPublishingStatusVariant(plan.status)}`}>
            {getPublishingStatusLabel(plan.status)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: C.lineSubtle }}>
        <div style={{
          height:     "100%",
          width:      `${plan.progress}%`,
          background: getProgressColor(plan.progress),
          transition: "width 0.3s ease",
        }} />
      </div>

      {/* Body */}
      <div style={{ padding: `${S[3]}px ${S[4]}px`, display: "flex", flexDirection: "column", gap: S[2] }}>
        {/* Destinations */}
        <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
          {destinations.map(dest => {
            const stepStatus = plan.steps.find(s => s.destination === dest)?.status ?? "draft";
            const dotColor   = stepStatus === "published" ? "#16a34a"
                             : stepStatus === "failed"    ? "#dc2626"
                             : stepStatus === "blocked"   ? "#dc2626"
                             : getDestinationColor(dest);
            return (
              <div key={dest} style={{
                display:      "flex",
                alignItems:   "center",
                gap:          4,
                padding:      "2px 8px",
                background:   C.surfaceAlt,
                borderRadius: 4,
                border:       `1px solid ${C.lineSubtle}`,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
                <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid }}>{dest}</span>
              </div>
            );
          })}
        </div>

        {/* Step progress + alerts */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
            {doneSteps}/{plan.steps.length} steps · {plan.progress}%
          </span>
          <div style={{ display: "flex", gap: S[2] }}>
            {failedSteps > 0 && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, fontWeight: 600 }}>
                {failedSteps} ✗
              </span>
            )}
            {plan.scheduledAt && (
              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                {formatScheduledCountdown(plan.scheduledAt)}
              </span>
            )}
          </div>
        </div>

        {/* Context IDs */}
        <div style={{ display: "flex", gap: S[4] }}>
          {plan.productId && (
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
              producto: {plan.productId.slice(-6)}
            </span>
          )}
          {plan.campaignId && (
            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
              Contenido vinculado
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
