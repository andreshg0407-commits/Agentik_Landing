"use client";

/**
 * components/marketing-studio/distribution/distribution-signals-panel.tsx
 *
 * MS-14 — Luca + Mila distribution recommendations panel.
 */

import { C, T, S }             from "@/lib/ui/tokens";
import {
  getUrgencyVariant,
  getUrgencyLabel,
  getChannelLabel,
} from "@/lib/marketing-studio/distribution/distribution-display";
import type { DistributionRecommendation } from "@/lib/marketing-studio/distribution/distribution-types";

interface Props {
  lucaRecos: DistributionRecommendation[];
  milaRecos: DistributionRecommendation[];
}

export function DistributionSignalsPanel({ lucaRecos, milaRecos }: Props) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[4] }}>
      <AgentPanel
        agentName="Luca"
        agentColor="#004AAD"
        recos={lucaRecos}
        emptyLabel="Sin señales comerciales activas"
      />
      <AgentPanel
        agentName="Mila"
        agentColor="#7c2d92"
        recos={milaRecos}
        emptyLabel="Sin señales de contenido activas"
      />
    </div>
  );
}

function AgentPanel({
  agentName,
  agentColor,
  recos,
  emptyLabel,
}: {
  agentName:  string;
  agentColor: string;
  recos:      DistributionRecommendation[];
  emptyLabel: string;
}) {
  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: 8,
      overflow:     "hidden",
    }}>
      {/* Agent header */}
      <div style={{
        padding:      `${S[3]}px ${S[4]}px`,
        borderBottom: `1px solid ${C.line}`,
        background:   C.surfaceAlt,
        display:      "flex",
        alignItems:   "center",
        gap:          S[2],
      }}>
        <span style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          fontWeight:   700,
          color:        agentColor,
          background:   `${agentColor}14`,
          padding:      "2px 8px",
          borderRadius: 12,
        }}>
          {agentName}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
          Inteligencia de distribución
        </span>
      </div>

      {/* Recos */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {recos.length === 0 ? (
          <div style={{ padding: `${S[4]}px`, display: "flex", alignItems: "center", gap: S[2] }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, display: "inline-block" }} />
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
              {emptyLabel}
            </span>
          </div>
        ) : (
          recos.map((reco, i) => (
            <RecoRow key={reco.key} reco={reco} isLast={i === recos.length - 1} />
          ))
        )}
      </div>
    </div>
  );
}

function RecoRow({
  reco,
  isLast,
}: {
  reco:   DistributionRecommendation;
  isLast: boolean;
}) {
  const urgencyVariant = getUrgencyVariant(reco.urgency);
  const urgencyColors: Record<string, string> = {
    critical: C.red,
    warning:  C.amber,
    default:  C.inkMid,
    muted:    C.inkLight,
  };
  const dotColor = urgencyColors[urgencyVariant] ?? C.inkMid;

  return (
    <div style={{
      padding:      `${S[3]}px ${S[4]}px`,
      borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
      display:      "flex",
      flexDirection: "column",
      gap:          S[1],
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: S[2] }}>
        <span style={{
          width:      6,
          height:     6,
          borderRadius: "50%",
          background: dotColor,
          marginTop:  5,
          flexShrink: 0,
          display:    "inline-block",
        }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>
              {reco.label}
            </span>
            {reco.affectedCount > 0 && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                ({reco.affectedCount})
              </span>
            )}
            {reco.channel && (
              <span style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                color:        C.inkMid,
                background:   C.surfaceAlt,
                padding:      "1px 5px",
                borderRadius: 3,
              }}>
                {getChannelLabel(reco.channel)}
              </span>
            )}
          </div>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
            {reco.detail}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: dotColor }}>
            → {reco.recommendedAction}
          </span>
        </div>
        <span className={`ag-op-status ag-op-status--${urgencyVariant}`} style={{ flexShrink: 0 }}>
          {getUrgencyLabel(reco.urgency)}
        </span>
      </div>
    </div>
  );
}
