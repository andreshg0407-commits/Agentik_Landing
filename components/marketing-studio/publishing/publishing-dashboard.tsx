"use client";

/**
 * components/marketing-studio/publishing/publishing-dashboard.tsx
 *
 * MS-17 — Publishing Center: Main client composition layer.
 * Receives all data as serialized props from RSC page.
 */

import { useState }                       from "react";
import { WorkspaceSection }               from "@/components/shell/operational-primitives";
import { PublishingHealthStrip }          from "./publishing-health-strip";
import { PublishingPlanList }             from "./publishing-plan-list";
import { PublishingDestinationGrid }      from "./publishing-destination-grid";
import { PublishingBottlenecksPanel }     from "./publishing-bottlenecks-panel";
import { PublishingEventsFeed }           from "./publishing-events-feed";
import { PublishingDetailDrawer }         from "./publishing-detail-drawer";
import { C, T }                          from "@/lib/ui/tokens";
import type { PublishingRuntimeState, PublishingPlan } from "@/lib/marketing-studio/publishing/publishing-types";

interface Props {
  state:   PublishingRuntimeState;
  orgSlug: string;
}

type ActiveTab = "active" | "blocked" | "destinations" | "bottlenecks" | "events";

export function PublishingDashboard({ state, orgSlug }: Props) {
  const [activeTab,  setActiveTab]  = useState<ActiveTab>("active");
  const [selectedPlan, setSelectedPlan] = useState<PublishingPlan | null>(null);

  const blocked  = state.plans.filter(p => ["blocked","failed"].includes(p.status)).length;
  const eventCnt = state.recentEvents.length;
  const bCnt     = state.health.bottlenecks.length;

  const tabs: { id: ActiveTab; label: string; badge?: number }[] = [
    { id: "active",       label: "Planes Activos",    badge: state.activePlanIds.length },
    { id: "blocked",      label: "Bloqueados",        badge: blocked || undefined },
    { id: "destinations", label: "Destinos",          badge: state.health.destinationHealth.filter(d => d.healthLevel !== "healthy" && d.totalSteps > 0).length || undefined },
    { id: "bottlenecks",  label: "Cuellos de Botella",badge: bCnt || undefined },
    { id: "events",       label: "Eventos",           badge: eventCnt },
  ];

  return (
    <>
      <PublishingHealthStrip health={state.health} />

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
              borderBottom: activeTab === tab.id ? "2px solid #004AAD" : "2px solid transparent",
              borderRadius: 0,
              padding:      "10px 12px",
              marginBottom: -1,
            }}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span style={{
                marginLeft:   6,
                background:   (tab.id === "blocked" || tab.id === "bottlenecks") ? "var(--ag-red)" : "var(--ag-line-subtle)",
                color:        (tab.id === "blocked" || tab.id === "bottlenecks") ? "#fff" : "var(--ag-ink-mid)",
                fontFamily:   "var(--ag-mono)",
                fontSize:     9,
                fontWeight:   700,
                padding:      "1px 5px",
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
        {activeTab === "active" && (
          <WorkspaceSection title={`Planes Activos · ${state.activePlanIds.length}`}>
            <PublishingPlanList
              plans={state.plans}
              onSelect={setSelectedPlan}
              filter="Activos"
            />
          </WorkspaceSection>
        )}

        {activeTab === "blocked" && (
          <WorkspaceSection title={`Planes Bloqueados / Fallidos · ${blocked}`}>
            <PublishingPlanList
              plans={state.plans}
              onSelect={setSelectedPlan}
              filter="Fallidos"
            />
          </WorkspaceSection>
        )}

        {activeTab === "destinations" && (
          <WorkspaceSection title="Salud por Destino">
            <PublishingDestinationGrid destinationStates={state.destinationStates} />
          </WorkspaceSection>
        )}

        {activeTab === "bottlenecks" && (
          <WorkspaceSection title="Cuellos de Botella y Alertas">
            <PublishingBottlenecksPanel health={state.health} />
          </WorkspaceSection>
        )}

        {activeTab === "events" && (
          <WorkspaceSection title={`Eventos Recientes · ${state.recentEvents.length}`}>
            <PublishingEventsFeed events={state.recentEvents} />
          </WorkspaceSection>
        )}
      </div>

      {/* Detail drawer */}
      <PublishingDetailDrawer
        plan={selectedPlan}
        orgSlug={orgSlug}
        onClose={() => setSelectedPlan(null)}
      />
    </>
  );
}
