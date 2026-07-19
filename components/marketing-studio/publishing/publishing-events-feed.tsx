"use client";

/**
 * components/marketing-studio/publishing/publishing-events-feed.tsx
 *
 * MS-17 — Publishing Center: Live event log feed.
 */

import { C, T, S }                      from "@/lib/ui/tokens";
import {
  getPublishingEventLabel,
  getPublishingEventColor,
  formatPublishingDate,
} from "@/lib/marketing-studio/publishing/publishing-display";
import type { PublishingEventRecord }    from "@/lib/marketing-studio/publishing/publishing-types";

interface Props { events: PublishingEventRecord[] }

export function PublishingEventsFeed({ events }: Props) {
  if (events.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Sin eventos recientes
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {events.map((ev, idx) => {
        const color  = getPublishingEventColor(ev.eventType);
        const isLast = idx === events.length - 1;

        return (
          <div key={ev.id} className="ag-publishing-event" style={{
            display:       "grid",
            gridTemplateColumns: "16px 1fr auto",
            gap:           S[3],
            padding:       `${S[2]}px ${S[3]}px`,
            borderBottom:  isLast ? "none" : `1px solid ${C.lineSubtle}`,
            alignItems:    "flex-start",
          }}>
            <span style={{ fontFamily: T.mono, fontSize: 9, color, fontWeight: 700, paddingTop: 2 }}>●</span>

            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color, fontWeight: 600 }}>
                {getPublishingEventLabel(ev.eventType)}
              </span>
              {ev.planId && (
                <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                  plan: {ev.planId.slice(-8)}{ev.stepId ? ` · step: ${ev.stepId.slice(-8)}` : ""}
                </span>
              )}
            </div>

            <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, paddingTop: 2, whiteSpace: "nowrap" }}>
              {formatPublishingDate(ev.occurredAt)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
