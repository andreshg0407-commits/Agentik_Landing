"use client";

/**
 * components/marketing-studio/campaigns/campaign-health-strip.tsx
 *
 * MS-15 — Campaign Center: global KPI strip.
 */

import { C, T, S }                    from "@/lib/ui/tokens";
import {
  resolveCampaignHealthColor,
  getCampaignHealthLabel,
  getLaunchPressureLabel,
  getLaunchPressureColor,
} from "@/lib/marketing-studio/campaigns/campaign-display";
import type { CampaignHealthSummary } from "@/lib/marketing-studio/campaigns/campaign-types";

interface Props {
  health: CampaignHealthSummary;
}

export function CampaignHealthStrip({ health }: Props) {
  const healthColor    = resolveCampaignHealthColor(health.level);
  const pressureColor  = getLaunchPressureColor(health.launchPressure);
  const pressureLabel  = getLaunchPressureLabel(health.launchPressure);

  const kpis = [
    { label: "Contenido activo",      value: String(health.activeCampaigns),   color: C.ink },
    { label: "Lanzamientos bloq.", value: String(health.blockedLaunches),      color: health.blockedLaunches > 0 ? C.red : C.green },
    { label: "Publicaciones venc.",value: String(health.overduePublications),  color: health.overduePublications > 0 ? C.red : C.green },
    { label: "Recursos faltantes",  value: String(health.missingAssets),        color: health.missingAssets > 0 ? C.amber : C.green },
    { label: "TikTok listo",       value: `${health.tiktokReadiness}%`,        color: health.tiktokReadiness >= 70 ? C.green : health.tiktokReadiness >= 40 ? C.amber : C.red },
    { label: "WhatsApp listo",     value: `${health.whatsappReadiness}%`,      color: health.whatsappReadiness >= 70 ? C.green : health.whatsappReadiness >= 40 ? C.amber : C.red },
    { label: "Sincron. Shopify",   value: `${health.shopifySync}%`,            color: health.shopifySync >= 70 ? C.green : health.shopifySync >= 40 ? C.amber : C.red },
  ];

  return (
    <div style={{
      display:         "flex",
      alignItems:      "center",
      gap:             S[6],
      padding:         `${S[3]}px ${S[6]}px`,
      borderBottom:    `1px solid ${C.line}`,
      background:      C.surfaceAlt,
      flexWrap:        "wrap",
    }}>
      {/* Health badge */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2], flexShrink: 0 }}>
        <span style={{
          width:        8,
          height:       8,
          borderRadius: "50%",
          background:   healthColor,
          flexShrink:   0,
          display:      "inline-block",
        }} />
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: healthColor }}>
          {getCampaignHealthLabel(health.level)}
        </span>
      </div>

      <div style={{ width: 1, height: 20, background: C.line, flexShrink: 0 }} />

      {/* Launch pressure */}
      <div style={{ display: "flex", alignItems: "center", gap: S[2], flexShrink: 0 }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>Presión:</span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: pressureColor }}>
          {pressureLabel}
        </span>
      </div>

      <div style={{ width: 1, height: 20, background: C.line, flexShrink: 0 }} />

      {/* KPIs */}
      <div style={{ display: "flex", gap: S[5], flexWrap: "wrap" }}>
        {kpis.map(kpi => (
          <div key={kpi.label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
              {kpi.label}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: kpi.color }}>
              {kpi.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
