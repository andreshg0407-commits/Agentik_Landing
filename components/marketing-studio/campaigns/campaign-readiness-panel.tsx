"use client";

/**
 * components/marketing-studio/campaigns/campaign-readiness-panel.tsx
 *
 * MS-15 — Deep readiness diagnostics across all campaigns.
 */

import { C, T, S }               from "@/lib/ui/tokens";
import {
  getCampaignReadinessVariant,
  getCampaignReadinessLabel,
  getReadinessScoreColor,
  formatLaunchWindow,
} from "@/lib/marketing-studio/campaigns/campaign-display";
import type { CampaignEntity }   from "@/lib/marketing-studio/campaigns/campaign-types";

interface Props {
  campaigns: CampaignEntity[];
}

export function CampaignReadinessPanel({ campaigns }: Props) {
  const sorted = [...campaigns]
    .filter(c => c.status !== "completed" && c.status !== "failed")
    .sort((a, b) => a.readinessScore - b.readinessScore)
    .slice(0, 8);

  if (sorted.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green }}>
          Todo el contenido activo tiene una preparación aceptable
        </span>
      </div>
    );
  }

  return (
    <div className="ag-op-table">
      <div className="ag-op-row" style={{ background: C.surfaceAlt }}>
        {["Contenido", "Preparación", "Nivel", "Publicación", "Bloqueadores"].map(h => (
          <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, fontWeight: 600 }}>
            {h}
          </span>
        ))}
      </div>

      {sorted.map(campaign => {
        const scoreColor = getReadinessScoreColor(campaign.readinessScore);
        const missingCount = campaign.contentSlots.filter(s => !s.isReady).length;
        const hasBlocker   = campaign.readinessLevel === "blocked";

        return (
          <div key={campaign.id} className="ag-op-row" style={{
            background: hasBlocker ? C.redLight : undefined,
          }}>
            {/* Name */}
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.sm,
              fontWeight:   600,
              color:        C.ink,
              overflow:     "hidden",
              textOverflow: "ellipsis",
              whiteSpace:   "nowrap",
              maxWidth:     160,
            }}>
              {campaign.name}
            </span>

            {/* Score bar */}
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <div style={{ width: 60, height: 5, background: C.lineSubtle, borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  width:        `${campaign.readinessScore}%`,
                  height:       "100%",
                  background:   scoreColor,
                  borderRadius: 3,
                }} />
              </div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: scoreColor, minWidth: 32 }}>
                {campaign.readinessScore}%
              </span>
            </div>

            {/* Level */}
            <span className={`ag-op-status ag-op-status--${getCampaignReadinessVariant(campaign.readinessLevel)}`}>
              {getCampaignReadinessLabel(campaign.readinessLevel)}
            </span>

            {/* Launch */}
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
              {formatLaunchWindow(campaign.startDate)}
            </span>

            {/* Blockers */}
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              color:      missingCount > 0 ? C.amber : C.green,
              fontWeight: missingCount > 0 ? 600 : 400,
            }}>
              {missingCount > 0 ? `${missingCount} assets` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
