"use client";

/**
 * components/marketing-studio/campaigns/campaign-detail-drawer.tsx
 *
 * MS-15 — Deep operational drawer for a single campaign.
 * 12 sections: summary, readiness, calendar, sequence, channels,
 * missing assets, variant coverage, cadence, distribution, Luca, Mila, actions.
 */

import { useState }              from "react";
import { C, T, S }               from "@/lib/ui/tokens";

import {
  formatCampaignType,
  formatCampaignStatus,
  getCampaignStatusVariant,
  getCampaignReadinessVariant,
  getCampaignReadinessLabel,
  getReadinessScoreColor,
  formatLaunchWindow,
  formatChannelLabel,
  formatContentType,
  formatLaunchPhase,
} from "@/lib/marketing-studio/campaigns/campaign-display";
import { CampaignSequencePanel } from "./campaign-sequence-panel";
import type { CampaignEntity, CampaignRecommendation } from "@/lib/marketing-studio/campaigns/campaign-types";

interface Props {
  campaign:  CampaignEntity | null;
  lucaRecos: CampaignRecommendation[];
  milaRecos: CampaignRecommendation[];
  onClose:   () => void;
}

export function CampaignDetailDrawer({ campaign, lucaRecos, milaRecos, onClose }: Props) {
  if (!campaign) return null;

  const campaignLucaRecos = lucaRecos.filter(r => r.campaignId === campaign.id);
  const campaignMilaRecos = milaRecos.filter(r => r.campaignId === campaign.id);
  const missingSlots      = campaign.contentSlots.filter(s => !s.isReady);
  const readySlots        = campaign.contentSlots.filter(s => s.isReady);
  const readinessColor    = getReadinessScoreColor(campaign.readinessScore);

  return (
    <div style={{
      position:   "fixed",
      right:      0,
      top:        0,
      height:     "100vh",
      width:      420,
      background: C.white,
      borderLeft: `1px solid ${C.line}`,
      display:    "flex",
      flexDirection: "column",
      zIndex:     50,
      overflow:   "hidden",
    }}>
      {/* Drawer header */}
      <div style={{
        padding:      `${S[4]}px`,
        borderBottom: `1px solid ${C.line}`,
        display:      "flex",
        alignItems:   "center",
        gap:          S[3],
        background:   C.surfaceAlt,
        flexShrink:   0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
            <span className={`ag-op-status ag-op-status--${getCampaignStatusVariant(campaign.status)}`}>
              {formatCampaignStatus(campaign.status)}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
              {formatCampaignType(campaign.type)}
            </span>
          </div>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: 700, color: C.ink, display: "block" }}>
            {campaign.name}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border:     "none",
            cursor:     "pointer",
            color:      C.inkLight,
            fontFamily: T.mono,
            fontSize:   T.sz.lg,
            lineHeight: 1,
            padding:    S[1],
          }}
        >
          ×
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 0 }}>

        {/* §1 + §2 — Summary + Readiness */}
        <DrawerSection title="Preparación">
          <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
            <div style={{ display: "flex", alignItems: "center", gap: S[3] }}>
              <div style={{ flex: 1, height: 6, background: C.lineSubtle, borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  width:        `${campaign.readinessScore}%`,
                  height:       "100%",
                  background:   readinessColor,
                  borderRadius: 3,
                }} />
              </div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: readinessColor, minWidth: 36 }}>
                {campaign.readinessScore}%
              </span>
              <span className={`ag-op-status ag-op-status--${getCampaignReadinessVariant(campaign.readinessLevel)}`}>
                {getCampaignReadinessLabel(campaign.readinessLevel)}
              </span>
            </div>
            <div style={{ display: "flex", gap: S[4] }}>
              <KV label="Lanzamiento" value={formatLaunchWindow(campaign.startDate)} />
              <KV label="Productos"   value={String(campaign.productIds.length)} />
              <KV label="Assets listos" value={`${readySlots.length}/${campaign.contentSlots.length}`} />
            </div>
          </div>
        </DrawerSection>

        {/* §3 — Channels */}
        <DrawerSection title="Canales">
          <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
            {campaign.channels.map(ch => {
              const channelSlots  = campaign.contentSlots.filter(s => s.channel === ch);
              const channelReady  = channelSlots.filter(s => s.isReady).length;
              const isReady       = channelReady === channelSlots.length && channelSlots.length > 0;
              return (
                <div key={ch} style={{
                  padding:      `${S[2]}px ${S[3]}px`,
                  background:   isReady ? C.greenLight : C.amberLight,
                  border:       `1px solid ${isReady ? C.greenBorder : C.amberBorder}`,
                  borderRadius: 6,
                  display:      "flex",
                  flexDirection:"column",
                  alignItems:   "center",
                  gap:          2,
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>
                    {formatChannelLabel(ch)}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: isReady ? C.green : C.amber }}>
                    {channelSlots.length > 0 ? `${channelReady}/${channelSlots.length}` : "Sin slots"}
                  </span>
                </div>
              );
            })}
          </div>
        </DrawerSection>

        {/* §4 — Launch sequence */}
        {campaign.sequences.length > 0 && (
          <DrawerSection title="Secuencia de Lanzamiento">
            <CampaignSequencePanel
              sequences={campaign.sequences}
              campaignName={campaign.name}
            />
          </DrawerSection>
        )}

        {/* §5 — Missing assets */}
        {missingSlots.length > 0 && (
          <DrawerSection title={`Assets Faltantes (${missingSlots.length})`}>
            <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
              {missingSlots.slice(0, 8).map((slot, i) => (
                <div key={`${slot.id}-${i}`} style={{
                  display:     "flex",
                  gap:         S[2],
                  alignItems:  "center",
                  padding:     `${S[1]}px ${S[2]}px`,
                  background:  C.amberLight,
                  borderRadius: 3,
                  borderLeft:  `2px solid ${C.amber}`,
                }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amberDark, fontWeight: 600 }}>
                    {formatChannelLabel(slot.channel)}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                    {formatContentType(slot.contentType)}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginLeft: "auto" }}>
                    {formatLaunchPhase(slot.phase)}
                  </span>
                </div>
              ))}
              {missingSlots.length > 8 && (
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                  +{missingSlots.length - 8} más
                </span>
              )}
            </div>
          </DrawerSection>
        )}

        {/* §6 + §7 — Luca + Mila (campaign-specific) */}
        {(campaignLucaRecos.length > 0 || campaignMilaRecos.length > 0) && (
          <DrawerSection title="Señales de Inteligencia">
            {[...campaignLucaRecos, ...campaignMilaRecos].map(reco => (
              <div key={reco.key} style={{
                padding:      `${S[2]}px`,
                borderBottom: `1px solid ${C.lineSubtle}`,
                display:      "flex",
                flexDirection:"column",
                gap:          2,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  <span style={{
                    fontFamily:   T.mono,
                    fontSize:     T.sz.xs,
                    fontWeight:   700,
                    color:        reco.agentLabel === "Luca" ? "#004AAD" : "#7c2d92",
                    background:   reco.agentLabel === "Luca" ? "#eff6ff" : "#faf5ff",
                    padding:      "1px 5px",
                    borderRadius: 3,
                  }}>
                    {reco.agentLabel}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink }}>
                    {reco.label}
                  </span>
                </div>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkLight }}>
                  → {reco.recommendedAction}
                </span>
              </div>
            ))}
          </DrawerSection>
        )}

        {/* §8 — Action tray */}
        <DrawerSection title="Acciones">
          <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
            <button className="ag-action-secondary" style={{ fontFamily: T.mono, fontSize: T.sz.xs }}>
              Ver productos
            </button>
            <button className="ag-action-secondary" style={{ fontFamily: T.mono, fontSize: T.sz.xs }}>
              Ver pipeline
            </button>
            <button className="ag-action-ghost" style={{ fontFamily: T.mono, fontSize: T.sz.xs }}>
              Exportar plan
            </button>
          </div>
        </DrawerSection>
      </div>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      padding:      `${S[4]}px`,
      borderBottom: `1px solid ${C.lineSubtle}`,
    }}>
      <span style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        fontWeight:   600,
        color:        C.inkLight,
        textTransform:"uppercase",
        letterSpacing:"0.05em",
        display:      "block",
        marginBottom: S[3],
      }}>
        {title}
      </span>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontFamily: T.mono, fontSize: 10, color: C.inkLight }}>{label}</span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>{value}</span>
    </div>
  );
}
