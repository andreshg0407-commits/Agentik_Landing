"use client";

/**
 * components/marketing-studio/social/social-live-activity.tsx
 *
 * MS-16 — Social Runtime: Live activity feed.
 */

import { C, T, S }               from "@/lib/ui/tokens";
import {
  getSocialChannelLabel,
  getSocialChannelColor,
  getSocialContentTypeLabel,
  getActivityTypeLabel,
  getActivityTypeColor,
  formatPublishedAt,
} from "@/lib/marketing-studio/social/social-display";
import type { SocialLiveActivity } from "@/lib/marketing-studio/social/social-types";

interface Props { activities: SocialLiveActivity[] }

const ACTIVITY_ICON: Record<string, string> = {
  started:           "▶",
  success:           "✓",
  failed:            "✗",
  retrying:          "↺",
  campaign_advanced: "◆",
};

export function SocialLiveActivity({ activities }: Props) {
  if (activities.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Sin actividad reciente
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {activities.map((act, idx) => {
        const typeColor    = getActivityTypeColor(act.type);
        const channelColor = getSocialChannelColor(act.channel);
        const icon         = ACTIVITY_ICON[act.type] ?? "·";
        const isLast       = idx === activities.length - 1;

        return (
          <div
            key={act.id}
            className="ag-social-activity-row"
            style={{
              display:       "grid",
              gridTemplateColumns: "20px 1fr auto",
              gap:            S[3],
              padding:        `${S[2]}px ${S[4]}px`,
              borderBottom:   isLast ? "none" : `1px solid ${C.lineSubtle}`,
              alignItems:     "flex-start",
            }}
          >
            {/* Type icon */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 2 }}>
              <span style={{
                fontFamily:  T.mono,
                fontSize:    T.sz.xs,
                fontWeight:  700,
                color:       typeColor,
                lineHeight:  1,
              }}>
                {icon}
              </span>
              {!isLast && (
                <div style={{ width: 1, flexGrow: 1, background: C.lineSubtle, marginTop: 4 }} />
              )}
            </div>

            {/* Content */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: typeColor, fontWeight: 600 }}>
                {getActivityTypeLabel(act.type)}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                {act.message}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                <span style={{
                  width: 6, height: 6,
                  borderRadius: "50%",
                  background: channelColor,
                  display: "inline-block",
                  flexShrink: 0,
                }} />
                <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkLight }}>
                  {getSocialChannelLabel(act.channel)} · {getSocialContentTypeLabel(act.contentType)}
                </span>
              </div>
            </div>

            {/* Timestamp */}
            <span style={{
              fontFamily:  T.mono,
              fontSize:    9,
              color:       C.inkFaint,
              whiteSpace:  "nowrap",
              paddingTop:  2,
            }}>
              {formatPublishedAt(act.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
