"use client";

/**
 * components/marketing-studio/social/social-queue-panel.tsx
 *
 * MS-16 — Social Runtime: Operational queue table.
 */

import { C, T, S }               from "@/lib/ui/tokens";
import {
  getSocialChannelLabel,
  getSocialStatusLabel,
  getSocialStatusVariant,
  getSocialPriorityLabel,
  getSocialPriorityVariant,
  getSocialContentTypeLabel,
  getSocialChannelColor,
  formatScheduledAt,
} from "@/lib/marketing-studio/social/social-display";
import type { SocialQueueItem }  from "@/lib/marketing-studio/social/social-types";

interface Props {
  queue:   SocialQueueItem[];
  orgSlug: string;
}

export function SocialQueuePanel({ queue }: Props) {
  if (queue.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Sin publicaciones en cola
        </span>
      </div>
    );
  }

  return (
    <div className="ag-op-table">
      <div className="ag-op-row" style={{ background: C.surfaceAlt }}>
        {["Canal", "Tipo", "Contenido", "Programado", "Estado", "Prioridad", "Reintentos", "Preparación"].map(h => (
          <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, fontWeight: 600 }}>
            {h}
          </span>
        ))}
      </div>

      {queue.slice(0, 20).map(item => {
        const channelColor = getSocialChannelColor(item.channel);
        const isBlocked    = item.blockers.length > 0;

        return (
          <div
            key={item.publicationId}
            className="ag-op-row ag-social-row"
            style={{ background: isBlocked ? C.redLight : item.isOverdue ? C.amberLight : undefined }}
          >
            {/* Channel */}
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: channelColor, display: "inline-block" }} />
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>
                {getSocialChannelLabel(item.channel)}
              </span>
            </div>

            {/* Content type */}
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
              {getSocialContentTypeLabel(item.contentType)}
            </span>

            {/* Campaign */}
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        item.campaignName ? C.blueDark : C.inkFaint,
              overflow:     "hidden",
              textOverflow: "ellipsis",
              whiteSpace:   "nowrap",
              maxWidth:     120,
            }}>
              {item.campaignName ?? "—"}
            </span>

            {/* Scheduled */}
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              color:      item.isOverdue ? C.red : C.inkLight,
              fontWeight: item.isOverdue ? 600 : 400,
            }}>
              {formatScheduledAt(item.scheduledAt)}
            </span>

            {/* Status */}
            <span className={`ag-op-status ag-op-status--${getSocialStatusVariant(item.status)}`}>
              {getSocialStatusLabel(item.status)}
            </span>

            {/* Priority */}
            <span className={`ag-op-status ag-op-status--${getSocialPriorityVariant(item.priority)}`}>
              {getSocialPriorityLabel(item.priority)}
            </span>

            {/* Retries */}
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              color:      item.retryCount > 0 ? C.amber : C.inkLight,
              fontWeight: item.retryCount > 0 ? 600 : 400,
            }}>
              {item.retryCount > 0 ? `${item.retryCount}×` : "—"}
            </span>

            {/* Readiness score */}
            <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
              <div style={{ width: 40, height: 4, background: C.lineSubtle, borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  width:        `${item.readinessScore}%`,
                  height:       "100%",
                  background:   item.readinessScore >= 70 ? C.green : item.readinessScore >= 40 ? C.amber : C.red,
                  borderRadius: 2,
                }} />
              </div>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid }}>{item.readinessScore}%</span>
            </div>
          </div>
        );
      })}

      {queue.length > 20 && (
        <div className="ag-op-row">
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
            +{queue.length - 20} en cola
          </span>
        </div>
      )}
    </div>
  );
}
