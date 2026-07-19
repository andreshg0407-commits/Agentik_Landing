"use client";

/**
 * components/marketing-studio/campaigns/campaign-channel-matrix.tsx
 *
 * MS-15 — Cross-channel coordination matrix.
 * Rows = campaigns, Columns = channels. Each cell shows readiness.
 */

import { C, T, S }               from "@/lib/ui/tokens";
import {
  formatChannelLabel,
  formatCampaignStatus,
  getCampaignStatusVariant,
} from "@/lib/marketing-studio/campaigns/campaign-display";
import type { CampaignEntity, ChannelType } from "@/lib/marketing-studio/campaigns/campaign-types";

const VISIBLE_CHANNELS: ChannelType[] = [
  "instagram", "tiktok", "facebook", "whatsapp", "shopify", "landing", "ads",
];

interface Props {
  campaigns: CampaignEntity[];
}

export function CampaignChannelMatrix({ campaigns }: Props) {
  const activeCampaigns = campaigns
    .filter(c => c.status !== "completed" && c.status !== "failed")
    .slice(0, 10);

  if (activeCampaigns.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Sin contenido para mostrar en la matriz de canales
        </span>
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <div className="ag-op-table" style={{ minWidth: 600 }}>
        {/* Header row */}
        <div className="ag-op-row" style={{ background: C.surfaceAlt }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, fontWeight: 600, minWidth: 140 }}>
            Contenido
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, fontWeight: 600, minWidth: 80 }}>
            Estado
          </span>
          {VISIBLE_CHANNELS.map(ch => (
            <span key={ch} style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              color:      C.inkLight,
              fontWeight: 600,
              textAlign:  "center",
              minWidth:   60,
            }}>
              {formatChannelLabel(ch)}
            </span>
          ))}
        </div>

        {activeCampaigns.map(campaign => (
          <div key={campaign.id} className="ag-op-row ag-campaign-row">
            {/* Campaign name */}
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.sm,
              fontWeight:   600,
              color:        C.ink,
              minWidth:     140,
              overflow:     "hidden",
              textOverflow: "ellipsis",
              whiteSpace:   "nowrap",
            }}>
              {campaign.name}
            </span>

            {/* Status */}
            <span className={`ag-op-status ag-op-status--${getCampaignStatusVariant(campaign.status)}`} style={{ minWidth: 80 }}>
              {formatCampaignStatus(campaign.status)}
            </span>

            {/* Channel cells */}
            {VISIBLE_CHANNELS.map(ch => (
              <ChannelCell
                key={ch}
                channel={ch}
                campaign={campaign}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChannelCell({
  channel,
  campaign,
}: {
  channel:  ChannelType;
  campaign: CampaignEntity;
}) {
  const isActive = (campaign.channels as string[]).includes(channel);

  if (!isActive) {
    return (
      <div className="ag-channel-cell" style={{
        minWidth:       60,
        textAlign:      "center",
        color:          C.inkGhost,
        fontFamily:     T.mono,
        fontSize:       T.sz.xs,
      }}>
        —
      </div>
    );
  }

  // Check content slots for this channel
  const slots       = campaign.contentSlots.filter(s => s.channel === channel);
  const readySlots  = slots.filter(s => s.isReady).length;
  const totalSlots  = slots.length;

  let cellStatus: "ready" | "partial" | "blocked" | "published" | "stale";

  if (campaign.status === "completed") {
    cellStatus = "published";
  } else if (totalSlots === 0) {
    cellStatus = "stale";
  } else if (readySlots === totalSlots) {
    cellStatus = "ready";
  } else if (readySlots > 0) {
    cellStatus = "partial";
  } else {
    cellStatus = "blocked";
  }

  const cellConfig: Record<typeof cellStatus, { bg: string; color: string; label: string }> = {
    ready:     { bg: C.greenLight,  color: C.green,   label: "✓" },
    partial:   { bg: C.amberLight,  color: C.amber,   label: `${readySlots}/${totalSlots}` },
    blocked:   { bg: C.redLight,    color: C.red,     label: "✗" },
    published: { bg: C.blueLight,   color: C.blueDark, label: "✓" },
    stale:     { bg: C.surfaceAlt,  color: C.inkLight, label: "—" },
  };

  const cfg = cellConfig[cellStatus];

  return (
    <div className="ag-channel-cell" style={{
      minWidth:       60,
      display:        "flex",
      justifyContent: "center",
      alignItems:     "center",
    }}>
      <span style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        fontWeight:   600,
        color:        cfg.color,
        background:   cfg.bg,
        padding:      "2px 6px",
        borderRadius: 3,
        minWidth:     28,
        textAlign:    "center",
      }}>
        {cfg.label}
      </span>
    </div>
  );
}
