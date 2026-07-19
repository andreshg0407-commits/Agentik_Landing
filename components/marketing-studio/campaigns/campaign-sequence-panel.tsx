"use client";

/**
 * components/marketing-studio/campaigns/campaign-sequence-panel.tsx
 *
 * MS-15 — Launch sequence visualization: teaser → reveal → launch → …
 */

import { C, T, S }               from "@/lib/ui/tokens";
import {
  formatLaunchPhase,
  getLaunchPhaseVariant,
  formatChannelLabel,
  formatContentType,
} from "@/lib/marketing-studio/campaigns/campaign-display";
import type { CampaignSequence }  from "@/lib/marketing-studio/campaigns/campaign-types";

interface Props {
  sequences:    CampaignSequence[];
  campaignName: string;
}

export function CampaignSequencePanel({ sequences, campaignName }: Props) {
  if (sequences.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Sin secuencia de lanzamiento definida
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
        {campaignName}
      </span>

      {/* Sequence flow */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0, overflowX: "auto" }}>
        {sequences.map((seq, i) => {
          const variant     = getLaunchPhaseVariant(seq.phase);
          const isComplete  = seq.isComplete;
          const isLast      = i === sequences.length - 1;

          const nodeColor   = isComplete ? C.green : seq.missingSlots > 0 ? C.amber : C.inkLight;

          return (
            <div key={seq.phase} style={{ display: "flex", alignItems: "flex-start" }}>
              {/* Node */}
              <div className="ag-sequence-node" style={{
                display:       "flex",
                flexDirection: "column",
                alignItems:    "center",
                gap:           S[2],
                minWidth:      110,
              }}>
                {/* Circle */}
                <div style={{
                  width:        28,
                  height:       28,
                  borderRadius: "50%",
                  background:   isComplete ? C.greenLight : C.surfaceAlt,
                  border:       `2px solid ${nodeColor}`,
                  display:      "flex",
                  alignItems:   "center",
                  justifyContent: "center",
                  flexShrink:   0,
                }}>
                  {isComplete ? (
                    <span style={{ fontFamily: T.mono, fontSize: 11, color: C.green }}>✓</span>
                  ) : (
                    <span style={{ fontFamily: T.mono, fontSize: 11, color: C.inkLight }}>
                      {i + 1}
                    </span>
                  )}
                </div>

                {/* Phase label */}
                <span className={`ag-op-status ag-op-status--${variant}`}>
                  {formatLaunchPhase(seq.phase)}
                </span>

                {/* Timing */}
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, textAlign: "center" }}>
                  {seq.startOffset < 0 ? `${seq.startOffset}d` : seq.startOffset === 0 ? "Día 0" : `+${seq.startOffset}d`}
                </span>

                {/* Channels */}
                <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                  {seq.channels.slice(0, 3).map(ch => (
                    <span key={ch} style={{
                      fontFamily:   T.mono,
                      fontSize:     9,
                      color:        C.inkMid,
                      background:   C.surfaceAlt,
                      padding:      "1px 4px",
                      borderRadius: 2,
                    }}>
                      {formatChannelLabel(ch)}
                    </span>
                  ))}
                </div>

                {/* Missing slots */}
                {seq.missingSlots > 0 && (
                  <span style={{
                    fontFamily:   T.mono,
                    fontSize:     9,
                    color:        C.amber,
                    background:   C.amberLight,
                    padding:      "1px 4px",
                    borderRadius: 2,
                  }}>
                    {seq.missingSlots} faltan
                  </span>
                )}
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="ag-sequence-line" style={{
                  flex:          "0 0 20px",
                  height:        2,
                  background:    isComplete ? C.green : C.line,
                  marginTop:     13,
                  alignSelf:     "flex-start",
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
