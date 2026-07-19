"use client";

/**
 * components/marketing-studio/campaigns/campaign-recommendations-panel.tsx
 *
 * MS-15 — Luca + Mila campaign intelligence panel.
 */

import { C, T, S }               from "@/lib/ui/tokens";
import {
  formatChannelLabel,
  formatContentType,
} from "@/lib/marketing-studio/campaigns/campaign-display";
import type { CampaignRecommendation } from "@/lib/marketing-studio/campaigns/campaign-types";

interface Props {
  lucaRecos: CampaignRecommendation[];
  milaRecos: CampaignRecommendation[];
}

const URGENCY_COLOR: Record<string, string> = {
  critical: "#dc2626",
  high:     "#d97706",
  medium:   "#6b7280",
  low:      "#9ca3af",
};

const URGENCY_LABEL: Record<string, string> = {
  critical: "Crítico",
  high:     "Alto",
  medium:   "Medio",
  low:      "Bajo",
};

const URGENCY_VARIANT: Record<string, string> = {
  critical: "critical",
  high:     "warning",
  medium:   "default",
  low:      "muted",
};

export function CampaignRecommendationsPanel({ lucaRecos, milaRecos }: Props) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[4] }}>
      <AgentRecoPanel
        agentName="Luca"
        agentColor="#004AAD"
        subtitle="Estrategia · Lanzamiento · Cadencia"
        recos={lucaRecos}
        emptyLabel="Sistema de contenido operativo"
      />
      <AgentRecoPanel
        agentName="Mila"
        agentColor="#7c2d92"
        subtitle="Contenido · Social Commerce · WhatsApp"
        recos={milaRecos}
        emptyLabel="Cobertura de contenido completa"
      />
    </div>
  );
}

function AgentRecoPanel({
  agentName,
  agentColor,
  subtitle,
  recos,
  emptyLabel,
}: {
  agentName:  string;
  agentColor: string;
  subtitle:   string;
  recos:      CampaignRecommendation[];
  emptyLabel: string;
}) {
  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: 8,
      overflow:     "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding:      `${S[3]}px ${S[4]}px`,
        borderBottom: `1px solid ${C.line}`,
        background:   C.surfaceAlt,
        display:      "flex",
        flexDirection:"column",
        gap:          S[1],
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
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
        </div>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
          {subtitle}
        </span>
      </div>

      {/* Recommendations */}
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
            <RecoRow
              key={reco.key}
              reco={reco}
              isLast={i === recos.length - 1}
            />
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
  reco:   CampaignRecommendation;
  isLast: boolean;
}) {
  const dotColor = URGENCY_COLOR[reco.urgency] ?? C.inkMid;

  return (
    <div style={{
      padding:       `${S[3]}px ${S[4]}px`,
      borderBottom:  isLast ? "none" : `1px solid ${C.lineSubtle}`,
      display:       "flex",
      flexDirection: "column",
      gap:           S[1],
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: S[2] }}>
        <span style={{
          width:        6,
          height:       6,
          borderRadius: "50%",
          background:   dotColor,
          marginTop:    5,
          flexShrink:   0,
          display:      "inline-block",
        }} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2], flexWrap: "wrap" }}>
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
                {formatChannelLabel(reco.channel)}
              </span>
            )}
            {reco.contentType && (
              <span style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                color:        C.inkMid,
                background:   C.surfaceAlt,
                padding:      "1px 5px",
                borderRadius: 3,
              }}>
                {formatContentType(reco.contentType)}
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
        <span className={`ag-op-status ag-op-status--${URGENCY_VARIANT[reco.urgency] ?? "default"}`} style={{ flexShrink: 0 }}>
          {URGENCY_LABEL[reco.urgency] ?? reco.urgency}
        </span>
      </div>
    </div>
  );
}
