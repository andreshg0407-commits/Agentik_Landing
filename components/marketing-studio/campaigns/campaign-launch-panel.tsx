"use client";

/**
 * components/marketing-studio/campaigns/campaign-launch-panel.tsx
 *
 * MS-15 — Upcoming launches with readiness, blockers, countdown.
 */

import { C, T, S }               from "@/lib/ui/tokens";
import {
  getCampaignReadinessVariant,
  getCampaignReadinessLabel,
  getReadinessScoreColor,
  formatLaunchWindow,
  formatChannelLabel,
  getCampaignPriorityVariant,
  formatCampaignPriority,
} from "@/lib/marketing-studio/campaigns/campaign-display";
import type { CampaignEntity, CampaignLaunchWindow } from "@/lib/marketing-studio/campaigns/campaign-types";

interface Props {
  campaigns:     CampaignEntity[];
  launchWindows: CampaignLaunchWindow[];
}

export function CampaignLaunchPanel({ campaigns, launchWindows }: Props) {
  const upcomingCampaigns = campaigns
    .filter(c => c.status !== "completed" && c.status !== "failed")
    .sort((a, b) => {
      // Prioritize by readiness problems first
      if (a.readinessLevel === "blocked" && b.readinessLevel !== "blocked") return -1;
      if (b.readinessLevel === "blocked" && a.readinessLevel !== "blocked") return 1;
      // Then by start date
      const aD = a.startDate ?? "9999";
      const bD = b.startDate ?? "9999";
      return aD.localeCompare(bD);
    })
    .slice(0, 6);

  if (upcomingCampaigns.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Sin lanzamientos próximos
        </span>
      </div>
    );
  }

  const windowMap = new Map(launchWindows.map(w => [w.campaignId, w]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
      {upcomingCampaigns.map(campaign => {
        const window = windowMap.get(campaign.id);
        const readinessColor = getReadinessScoreColor(campaign.readinessScore);
        const isBlocked   = campaign.readinessLevel === "blocked";
        const isOverdue   = window?.isOverdue ?? false;

        return (
          <div key={campaign.id} className="ag-campaign-row" style={{
            padding:       `${S[3]}px`,
            background:    isBlocked ? C.redLight : isOverdue ? C.amberLight : C.white,
            border:        `1px solid ${isBlocked ? C.redBorder : isOverdue ? C.amberBorder : C.line}`,
            borderRadius:  6,
            display:       "flex",
            flexDirection: "column",
            gap:           S[2],
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <span style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.sm,
                fontWeight:   600,
                color:        C.ink,
                flex:         1,
                overflow:     "hidden",
                textOverflow: "ellipsis",
                whiteSpace:   "nowrap",
              }}>
                {campaign.name}
              </span>
              <span className={`ag-op-status ag-op-status--${getCampaignPriorityVariant(campaign.priority)}`}>
                {formatCampaignPriority(campaign.priority)}
              </span>
            </div>

            {/* Readiness score bar */}
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <div style={{ flex: 1, height: 4, background: C.lineSubtle, borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  width:        `${campaign.readinessScore}%`,
                  height:       "100%",
                  background:   readinessColor,
                  borderRadius: 2,
                  transition:   "width 0.3s ease",
                }} />
              </div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: readinessColor, fontWeight: 600, minWidth: 32 }}>
                {campaign.readinessScore}%
              </span>
              <span className={`ag-op-status ag-op-status--${getCampaignReadinessVariant(campaign.readinessLevel)}`}>
                {getCampaignReadinessLabel(campaign.readinessLevel)}
              </span>
            </div>

            {/* Channels */}
            <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
              {campaign.channels.map(ch => (
                <span key={ch} style={{
                  fontFamily:   T.mono,
                  fontSize:     T.sz.xs,
                  color:        C.inkMid,
                  background:   C.surfaceAlt,
                  padding:      "1px 5px",
                  borderRadius: 3,
                }}>
                  {formatChannelLabel(ch)}
                </span>
              ))}
            </div>

            {/* Launch timing */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      isOverdue ? C.red : C.inkLight,
                fontWeight: isOverdue ? 600 : 400,
              }}>
                {window ? formatLaunchWindow(window.startsAt) : (campaign.startDate ? formatLaunchWindow(campaign.startDate) : "Sin fecha")}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                {campaign.productIds.length} prod.
              </span>
            </div>

            {/* Missing content slots count */}
            {campaign.contentSlots.filter(s => !s.isReady).length > 0 && (
              <span style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                color:        C.amber,
                background:   C.amberLight,
                padding:      "2px 6px",
                borderRadius: 3,
              }}>
                {campaign.contentSlots.filter(s => !s.isReady).length} assets faltantes
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
