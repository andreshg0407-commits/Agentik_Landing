"use client";

/**
 * components/marketing-studio/campaigns/campaign-calendar-view.tsx
 *
 * MS-15 — Campaign Center: Editorial calendar.
 * Weekly view with campaign grouping, channel visibility, launch markers.
 */

import { C, T, S }               from "@/lib/ui/tokens";
import {
  formatChannelLabel,
  formatContentType,
  getCampaignPriorityVariant,
  getLaunchPhaseVariant,
} from "@/lib/marketing-studio/campaigns/campaign-display";
import type { CalendarDay }      from "@/lib/marketing-studio/campaigns/campaign-calendar";
import type { CampaignLaunchWindow } from "@/lib/marketing-studio/campaigns/campaign-types";

interface Props {
  days:          CalendarDay[];
  launchWindows: CampaignLaunchWindow[];
}

const CHANNEL_COLOR: Record<string, string> = {
  instagram: "#E1306C",
  tiktok:    "#000000",
  facebook:  "#1877F2",
  whatsapp:  "#25D366",
  shopify:   "#96BF48",
  landing:   "#004AAD",
  ads:       "#FBBC05",
  email:     "#374151",
};

export function CampaignCalendarView({ days, launchWindows }: Props) {
  if (days.length === 0) {
    return (
      <div style={{ padding: `${S[6]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Sin eventos en el período seleccionado
        </span>
      </div>
    );
  }

  // Build a set of launch dates for markers
  const launchDates = new Set(
    launchWindows.flatMap(w => {
      if (!w.startsAt) return [];
      return [w.startsAt.split("T")[0]];
    }),
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Day columns */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: `repeat(${Math.min(days.length, 7)}, 1fr)`,
        gap:                 2,
        overflowX:           "auto",
      }}>
        {days.slice(0, 7).map(day => {
          const isLaunchDay = launchDates.has(day.date);

          return (
            <div key={day.date} style={{
              display:       "flex",
              flexDirection: "column",
              minWidth:      120,
              border:        `1px solid ${day.hasConflict ? C.redBorder : day.isToday ? C.blueBorder : C.line}`,
              borderRadius:  6,
              overflow:      "hidden",
              background:    day.isToday ? C.blueLight : C.white,
            }}>
              {/* Day header */}
              <div style={{
                padding:         `${S[2]}px ${S[3]}px`,
                background:      day.isToday ? C.blueDark : day.isWeekend ? C.surfaceAlt : C.white,
                borderBottom:    `1px solid ${C.line}`,
                display:         "flex",
                alignItems:      "center",
                justifyContent:  "space-between",
              }}>
                <span style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  fontWeight: 600,
                  color:      day.isToday ? C.white : C.ink,
                }}>
                  {day.dayLabel}
                </span>
                {isLaunchDay && (
                  <span className="ag-launch-marker" style={{
                    fontFamily:   T.mono,
                    fontSize:     T.sz.xs,
                    background:   "#7c3aed",
                    color:        C.white,
                    padding:      "1px 5px",
                    borderRadius: 3,
                  }}>
                    🚀
                  </span>
                )}
                {day.hasConflict && (
                  <span style={{
                    fontFamily:   T.mono,
                    fontSize:     T.sz.xs,
                    color:        C.red,
                    fontWeight:   700,
                  }}>!</span>
                )}
              </div>

              {/* Events */}
              <div style={{ padding: S[2], display: "flex", flexDirection: "column", gap: 2, minHeight: 80 }}>
                {day.events.length === 0 ? (
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkGhost, padding: S[1] }}>
                    Sin slots
                  </span>
                ) : (
                  day.events.slice(0, 4).map(ev => (
                    <div key={ev.id} style={{
                      display:       "flex",
                      alignItems:    "center",
                      gap:           4,
                      padding:       "2px 4px",
                      borderRadius:  3,
                      background:    ev.isReady ? C.greenLight : C.amberLight,
                      borderLeft:    `2px solid ${CHANNEL_COLOR[ev.channel] ?? C.inkLight}`,
                    }}>
                      <span style={{
                        width:        5,
                        height:       5,
                        borderRadius: "50%",
                        background:   ev.isReady ? C.green : C.amber,
                        flexShrink:   0,
                        display:      "inline-block",
                      }} />
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <span style={{
                          fontFamily:   T.mono,
                          fontSize:     9,
                          color:        C.ink,
                          display:      "block",
                          overflow:     "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace:   "nowrap",
                        }}>
                          {formatContentType(ev.contentType)}
                        </span>
                        <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkLight }}>
                          {formatChannelLabel(ev.channel)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
                {day.events.length > 4 && (
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkLight }}>
                    +{day.events.length - 4} más
                  </span>
                )}
              </div>

              {/* Day footer */}
              {day.totalSlots > 0 && (
                <div style={{
                  padding:      `${S[1]}px ${S[2]}px`,
                  borderTop:    `1px solid ${C.lineSubtle}`,
                  background:   C.surfaceAlt,
                  display:      "flex",
                  gap:          S[2],
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.green }}>
                    {day.readySlots}✓
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.amber }}>
                    {day.totalSlots - day.readySlots}⏳
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: S[4], padding: `${S[3]}px 0`, flexWrap: "wrap" }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>Canales:</span>
        {Object.entries(CHANNEL_COLOR).map(([ch, color]) => (
          <div key={ch} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }} />
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
              {formatChannelLabel(ch)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
