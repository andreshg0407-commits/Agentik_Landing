"use client";

/**
 * components/marketing-studio/campaigns/campaign-content-gaps.tsx
 *
 * MS-15 — Missing content types grouped by campaign + channel.
 */

import { C, T, S }               from "@/lib/ui/tokens";
import {
  formatContentType,
  formatChannelLabel,
} from "@/lib/marketing-studio/campaigns/campaign-display";
import type { CampaignEntity }   from "@/lib/marketing-studio/campaigns/campaign-types";

interface Props {
  campaigns: CampaignEntity[];
}

interface GapRow {
  campaignName: string;
  channel:      string;
  contentType:  string;
  phase:        string;
}

export function CampaignContentGaps({ campaigns }: Props) {
  // Collect all unready slots across active campaigns
  const gaps: GapRow[] = [];
  for (const campaign of campaigns) {
    if (campaign.status === "completed" || campaign.status === "failed") continue;
    for (const slot of campaign.contentSlots) {
      if (!slot.isReady) {
        gaps.push({
          campaignName: campaign.name,
          channel:      slot.channel,
          contentType:  slot.contentType,
          phase:        slot.phase,
        });
      }
    }
  }

  if (gaps.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green }}>
          Sin recursos faltantes — todo el contenido tiene sus recursos listos
        </span>
      </div>
    );
  }

  // Group by contentType for summary
  const byType: Record<string, number> = {};
  for (const g of gaps) {
    byType[g.contentType] = (byType[g.contentType] ?? 0) + 1;
  }
  const sortedTypes = Object.entries(byType).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {/* Summary chips */}
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
        {sortedTypes.map(([type, count]) => (
          <div key={type} style={{
            display:      "flex",
            alignItems:   "center",
            gap:          S[1],
            background:   C.amberLight,
            border:       `1px solid ${C.amberBorder}`,
            borderRadius: 4,
            padding:      "3px 8px",
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amberDark, fontWeight: 600 }}>
              {count}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amberDark }}>
              {formatContentType(type)}
            </span>
          </div>
        ))}
      </div>

      {/* Gap table */}
      <div className="ag-op-table">
        <div className="ag-op-row" style={{ background: C.surfaceAlt }}>
          {["Contenido", "Canal", "Tipo de recurso", "Fase"].map(h => (
            <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, fontWeight: 600 }}>
              {h}
            </span>
          ))}
        </div>

        {gaps.slice(0, 15).map((gap, i) => (
          <div key={`${gap.campaignName}-${gap.channel}-${gap.contentType}-${i}`} className="ag-op-row">
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.sm,
              color:        C.ink,
              overflow:     "hidden",
              textOverflow: "ellipsis",
              whiteSpace:   "nowrap",
            }}>
              {gap.campaignName}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
              {formatChannelLabel(gap.channel)}
            </span>
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.sm,
              color:        C.amber,
              fontWeight:   600,
            }}>
              {formatContentType(gap.contentType)}
            </span>
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        C.inkLight,
              background:   C.surfaceAlt,
              padding:      "1px 5px",
              borderRadius: 3,
            }}>
              {gap.phase}
            </span>
          </div>
        ))}

        {gaps.length > 15 && (
          <div className="ag-op-row">
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
              +{gaps.length - 15} gaps adicionales
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
