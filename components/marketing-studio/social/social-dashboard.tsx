"use client";

/**
 * components/marketing-studio/social/social-dashboard.tsx
 *
 * MS-16 — Social Runtime: main client composition layer.
 * Receives all data as serialized props from RSC page.
 */

import { useState }                    from "react";
import { WorkspaceSection }            from "@/components/shell/operational-primitives";
import { SocialHealthStrip }           from "./social-health-strip";
import { SocialChannelGrid }           from "./social-channel-grid";
import { SocialQueuePanel }            from "./social-queue-panel";
import { SocialLiveActivity }          from "./social-live-activity";
import { SocialFailuresPanel }         from "./social-failures-panel";
import { SocialCampaignLinks }         from "./social-campaign-links";
import { SocialDetailDrawer }          from "./social-detail-drawer";
import type { SocialRuntimeState, SocialPublication } from "@/lib/marketing-studio/social/social-types";

interface Props {
  state:   SocialRuntimeState;
  orgSlug: string;
}

type ActiveTab = "queue" | "channels" | "activity" | "failures" | "campaigns";

export function SocialDashboard({ state, orgSlug: _orgSlug }: Props) {
  const [activeTab, setActiveTab]               = useState<ActiveTab>("queue");
  const [selectedPub, setSelectedPub]           = useState<SocialPublication | null>(null);

  const tabs: { id: ActiveTab; label: string; badge?: number }[] = [
    { id: "queue",     label: "Cola",          badge: state.queue.length },
    { id: "channels",  label: "Canales",        badge: state.channelStates.filter(c => c.healthLevel !== "healthy").length || undefined },
    { id: "activity",  label: "Actividad",      badge: state.recentActivity.length },
    { id: "failures",  label: "Fallos",         badge: state.failedByType.reduce((s, g) => s + g.count, 0) || undefined },
    { id: "campaigns", label: "Contenido",       badge: state.publications.filter(p => p.campaignLink !== null).length || undefined },
  ];

  return (
    <>
      {/* Health strip */}
      <SocialHealthStrip health={state.health} />

      {/* Tab bar */}
      <div style={{
        display:      "flex",
        borderBottom: "1px solid var(--ag-line)",
        background:   "var(--ag-surface-alt)",
        padding:      "0 24px",
        gap:          4,
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={activeTab === tab.id ? "ag-action-ghost ag-tab--active" : "ag-action-ghost"}
            style={{
              position:    "relative",
              borderBottom: activeTab === tab.id ? "2px solid #004AAD" : "2px solid transparent",
              borderRadius: 0,
              padding:     "10px 12px",
              marginBottom: -1,
            }}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span style={{
                marginLeft:  6,
                background:  tab.id === "failures" ? "var(--ag-red)" : "var(--ag-line-subtle)",
                color:       tab.id === "failures" ? "#fff" : "var(--ag-ink-mid)",
                fontFamily:  "var(--ag-mono)",
                fontSize:    9,
                fontWeight:  700,
                padding:     "1px 5px",
                borderRadius: 8,
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ padding: "24px 24px 48px" }}>

        {activeTab === "queue" && (
          <WorkspaceSection title={`Cola de Publicación · ${state.queue.length} items`}>
            <SocialQueuePanel queue={state.queue} orgSlug={_orgSlug} />
          </WorkspaceSection>
        )}

        {activeTab === "channels" && (
          <WorkspaceSection title="Salud por Canal">
            <SocialChannelGrid channelStates={state.channelStates} />
          </WorkspaceSection>
        )}

        {activeTab === "activity" && (
          <WorkspaceSection title="Actividad en Tiempo Real">
            <SocialLiveActivity activities={state.recentActivity} />
          </WorkspaceSection>
        )}

        {activeTab === "failures" && (
          <WorkspaceSection title="Análisis de Fallos">
            <SocialFailuresPanel failedByType={state.failedByType} />
          </WorkspaceSection>
        )}

        {activeTab === "campaigns" && (
          <WorkspaceSection title="Publicaciones Vinculadas a Contenido">
            <SocialCampaignLinks publications={state.publications} />
          </WorkspaceSection>
        )}
      </div>

      {/* Detail drawer */}
      <SocialDetailDrawer
        publication={selectedPub}
        onClose={() => setSelectedPub(null)}
      />
    </>
  );
}
