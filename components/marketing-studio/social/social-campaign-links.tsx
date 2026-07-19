"use client";

/**
 * components/marketing-studio/social/social-campaign-links.tsx
 *
 * MS-16 — Social Runtime: Campaign ↔ publications ↔ channels visualization.
 */

import { C, T, S }                from "@/lib/ui/tokens";
import {
  getSocialChannelLabel,
  getSocialChannelColor,
  getSocialStatusVariant,
  getSocialStatusLabel,
  getSocialContentTypeLabel,
} from "@/lib/marketing-studio/social/social-display";
import type { SocialPublication } from "@/lib/marketing-studio/social/social-types";

interface Props { publications: SocialPublication[] }

interface CampaignGroup {
  campaignId:   string;
  campaignName: string;
  launchPhase:  string;
  pubs:         SocialPublication[];
}

function groupByCampaign(pubs: SocialPublication[]): CampaignGroup[] {
  const linked = pubs.filter(p => p.campaignLink !== null);
  const map    = new Map<string, CampaignGroup>();

  for (const p of linked) {
    const link = p.campaignLink!;
    if (!map.has(link.campaignId)) {
      map.set(link.campaignId, {
        campaignId:   link.campaignId,
        campaignName: link.campaignName,
        launchPhase:  link.launchPhase,
        pubs:         [],
      });
    }
    map.get(link.campaignId)!.pubs.push(p);
  }

  return Array.from(map.values()).sort((a, b) => b.pubs.length - a.pubs.length);
}

export function SocialCampaignLinks({ publications }: Props) {
  const groups = groupByCampaign(publications);

  if (groups.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Sin publicaciones vinculadas a contenido
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {groups.map(group => {
        const channelSet = Array.from(new Set(group.pubs.map(p => p.channel)));
        const published  = group.pubs.filter(p => p.status === "published").length;
        const failed     = group.pubs.filter(p => p.status === "failed").length;
        const progress   = group.pubs.length > 0 ? Math.round((published / group.pubs.length) * 100) : 0;

        return (
          <div key={group.campaignId} style={{
            border:       `1px solid ${C.line}`,
            borderRadius: 6,
            overflow:     "hidden",
          }}>
            {/* Campaign header */}
            <div style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              padding:        `${S[3]}px ${S[4]}px`,
              background:     C.surfaceAlt,
              borderBottom:   `1px solid ${C.line}`,
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink }}>
                  {group.campaignName}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                  Fase: {group.launchPhase}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
                {/* Channel dots */}
                <div style={{ display: "flex", gap: S[1] }}>
                  {channelSet.map(ch => (
                    <span
                      key={ch}
                      title={getSocialChannelLabel(ch)}
                      style={{
                        width:        8,
                        height:       8,
                        borderRadius: "50%",
                        background:   getSocialChannelColor(ch),
                        display:      "inline-block",
                      }}
                    />
                  ))}
                </div>
                {/* Progress */}
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                  {published}/{group.pubs.length} pub.
                </span>
                {failed > 0 && (
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, fontWeight: 600 }}>
                    {failed} ✗
                  </span>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: C.lineSubtle }}>
              <div style={{
                height:     "100%",
                width:      `${progress}%`,
                background: failed > 0 ? C.amber : C.green,
                transition: "width 0.3s ease",
              }} />
            </div>

            {/* Publications list */}
            <div style={{ padding: `${S[2]}px 0` }}>
              {group.pubs.map(pub => (
                <div key={pub.id} style={{
                  display:       "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap:           S[3],
                  padding:       `${S[1]}px ${S[4]}px`,
                  alignItems:    "center",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                    <span style={{
                      width: 5, height: 5,
                      borderRadius: "50%",
                      background: getSocialChannelColor(pub.channel),
                      display: "inline-block",
                      flexShrink: 0,
                    }} />
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                      {getSocialChannelLabel(pub.channel)} · {getSocialContentTypeLabel(pub.contentType)}
                    </span>
                  </div>
                  <span className={`ag-op-status ag-op-status--${getSocialStatusVariant(pub.status)}`}>
                    {getSocialStatusLabel(pub.status)}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
                    {pub.campaignLink?.channelRole ?? ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
