"use client";

/**
 * components/marketing-studio/social/social-channel-grid.tsx
 *
 * MS-16 — Social Runtime: Channel health matrix.
 */

import { C, T, S }                from "@/lib/ui/tokens";
import {
  getSocialChannelLabel,
  getSocialHealthVariant,
  getSocialHealthLabel,
  getSocialChannelColor,
  formatPublishedAt,
} from "@/lib/marketing-studio/social/social-display";
import type { SocialChannelState } from "@/lib/marketing-studio/social/social-types";

interface Props { channelStates: SocialChannelState[] }

export function SocialChannelGrid({ channelStates }: Props) {
  return (
    <div className="ag-op-table">
      <div className="ag-op-row" style={{ background: C.surfaceAlt }}>
        {["Canal", "Auth", "En Cola", "Fallidos", "Reintentos", "Última pub.", "Salud"].map(h => (
          <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, fontWeight: 600 }}>
            {h}
          </span>
        ))}
      </div>

      {channelStates.map(ch => {
        const brandColor  = getSocialChannelColor(ch.channel);
        const healthVariant = getSocialHealthVariant(ch.healthLevel);
        const isOffline   = ch.healthLevel === "offline";
        const isBlocked   = ch.healthLevel === "blocked";

        return (
          <div key={ch.channel} className="ag-op-row ag-social-channel" style={{
            background: isOffline ? C.redLight : isBlocked ? "#fff8f0" : undefined,
          }}>
            {/* Channel */}
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: brandColor, display: "inline-block" }} />
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink }}>
                {getSocialChannelLabel(ch.channel)}
              </span>
            </div>

            {/* Auth */}
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        ch.isAuthValid ? C.green : C.red,
              fontWeight:   600,
            }}>
              {ch.isAuthValid ? "✓ Válida" : "✗ Inválida"}
            </span>

            {/* Queue */}
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>
              {ch.queuedCount}
            </span>

            {/* Failed */}
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz.sm,
              color:      ch.failedCount > 0 ? C.red : C.inkLight,
              fontWeight: ch.failedCount > 0 ? 600 : 400,
            }}>
              {ch.failedCount > 0 ? ch.failedCount : "—"}
            </span>

            {/* Retries */}
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz.sm,
              color:      ch.retriesCount > 0 ? C.amber : C.inkLight,
              fontWeight: ch.retriesCount > 0 ? 600 : 400,
            }}>
              {ch.retriesCount > 0 ? ch.retriesCount : "—"}
            </span>

            {/* Last published */}
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
              {formatPublishedAt(ch.lastPublishedAt)}
            </span>

            {/* Health */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className={`ag-op-status ag-op-status--${healthVariant}`}>
                {getSocialHealthLabel(ch.healthLevel)}
              </span>
              {ch.healthDetail && (
                <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkLight }}>
                  {ch.healthDetail}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
