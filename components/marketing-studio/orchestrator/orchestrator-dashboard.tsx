"use client";

/**
 * components/marketing-studio/orchestrator/orchestrator-dashboard.tsx
 *
 * MS-17 — Orchestrator Runtime: Main composition dashboard
 *
 * 7 tabs: Cola / Bloqueados / Pipeline / Dependencias / Actividad / Señales / Archivados
 */

import { useState }                          from "react";
import { WorkspaceSection }                  from "@/components/shell/operational-primitives";
import { OrchestratorHealthStrip }           from "./orchestrator-health-strip";
import { OrchestratorPlanQueue }             from "./orchestrator-plan-queue";
import { OrchestratorStageGraph }            from "./orchestrator-stage-graph";
import { OrchestratorDependencyPanel }       from "./orchestrator-dependency-panel";
import { OrchestratorJobFeed }               from "./orchestrator-job-feed";
import { OrchestratorSignalsPanel }          from "./orchestrator-signals-panel";
import { OrchestratorDetailDrawer }          from "./orchestrator-detail-drawer";
import { OrchestratorActionButton }          from "./orchestrator-action-button";
import { C, T, S }                           from "@/lib/ui/tokens";
import type {
  OrchestratorRuntimeState,
  OrchestratorPlan,
} from "@/lib/marketing-studio/orchestrator/orchestrator-types";

interface Props {
  state:   OrchestratorRuntimeState;
  orgSlug: string;
}

type ActiveTab = "queue" | "blocked" | "pipeline" | "dependencies" | "activity" | "signals" | "archived";

export function OrchestratorDashboard({ state, orgSlug }: Props) {
  const [activeTab,    setActiveTab]    = useState<ActiveTab>("queue");
  const [selectedPlan, setSelectedPlan] = useState<OrchestratorPlan | null>(null);

  const blocked  = state.plans.filter(p => p.status === "blocked" || p.status === "failed").length;
  const bCnt     = state.plans.reduce((sum, p) => sum + p.blockers.filter(b => !b.resolvedAt).length, 0);
  const archived = state.plans.filter(p => p.status === "archived").length;
  const highRecs = state.recommendations.filter(r => r.priority === "high").length;

  // The selected plan for pipeline/detail view
  const pipelinePlan = selectedPlan ?? state.plans.find(p =>
    ["running","queued","validating","partially_completed"].includes(p.status)
  ) ?? state.plans[0] ?? null;

  const tabs: { id: ActiveTab; label: string; badge?: number }[] = [
    { id: "queue",        label: "Cola",          badge: state.activePlanIds.length },
    { id: "blocked",      label: "Bloqueados",    badge: blocked || undefined },
    { id: "pipeline",     label: "Pipeline",      badge: undefined },
    { id: "dependencies", label: "Dependencias",  badge: bCnt || undefined },
    { id: "activity",     label: "Actividad",     badge: undefined },
    { id: "signals",      label: "Señales IA",    badge: highRecs || undefined },
    { id: "archived",     label: "Archivados",    badge: archived || undefined },
  ];

  return (
    <>
      <div style={{ position: "relative" }}>
        <OrchestratorHealthStrip health={state.health} />
        <div style={{ position: "absolute", top: "50%", right: 24, transform: "translateY(-50%)" }}>
          <OrchestratorActionButton
            orgSlug={orgSlug}
            actionType="refresh_health"
            planId={null}
            label="↻ Refresh"
            variant="ghost"
          />
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display:      "flex",
        borderBottom: `1px solid ${C.line}`,
        background:   C.surfaceAlt,
        padding:      "0 24px",
        gap:          4,
        overflowX:    "auto",
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
              whiteSpace:   "nowrap",
            }}
          >
            {tab.label}
            {tab.badge != null && tab.badge > 0 && (
              <span style={{
                marginLeft:   6,
                background:   (tab.id === "blocked" || tab.id === "dependencies") ? "var(--ag-red)" : "var(--ag-line-subtle)",
                color:        (tab.id === "blocked" || tab.id === "dependencies") ? "#fff" : "var(--ag-ink-mid)",
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

        {activeTab === "queue" && (
          <WorkspaceSection title={`Cola de Ejecución · ${state.plans.filter(p => !["archived","completed"].includes(p.status)).length} planes`}>
            <OrchestratorPlanQueue
              plans={state.plans.filter(p => p.status !== "archived")}
              onSelect={p => { setSelectedPlan(p); setActiveTab("pipeline"); }}
              orgSlug={orgSlug}
              filter="all"
            />
          </WorkspaceSection>
        )}

        {activeTab === "blocked" && (
          <WorkspaceSection title={`Bloqueados y Fallidos · ${blocked}`}>
            <OrchestratorPlanQueue
              plans={state.plans.filter(p => ["blocked","failed","partially_completed"].includes(p.status))}
              onSelect={setSelectedPlan}
              orgSlug={orgSlug}
              filter="all"
            />
          </WorkspaceSection>
        )}

        {activeTab === "pipeline" && (
          <WorkspaceSection title={pipelinePlan
            ? `Pipeline · ${pipelinePlan.id.slice(0, 8)}…`
            : "Pipeline"
          }>
            {pipelinePlan ? (
              <div style={{ display: "flex", flexDirection: "column", gap: S[5] }}>
                <OrchestratorStageGraph plan={pipelinePlan} />
                <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" }}>
                  {state.plans.slice(0, 8).map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPlan(p)}
                      className={p.id === pipelinePlan.id ? "ag-action-primary" : "ag-action-ghost"}
                      style={{ fontSize: 10 }}
                    >
                      {p.id.slice(0, 8)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ padding: `${S[8]}px`, textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint }}>
                Sin planes para visualizar
              </div>
            )}
          </WorkspaceSection>
        )}

        {activeTab === "dependencies" && (
          <WorkspaceSection title={`Dependencias y Bloqueos · ${bCnt} pendientes`}>
            <OrchestratorDependencyPanel
              plans={state.plans.filter(p => p.status !== "archived")}
            />
          </WorkspaceSection>
        )}

        {activeTab === "activity" && (
          <WorkspaceSection title="Actividad de Jobs">
            <OrchestratorJobFeed plans={state.plans} />
          </WorkspaceSection>
        )}

        {activeTab === "signals" && (
          <WorkspaceSection title={`Señales Operacionales · ${state.recommendations.length} señales`}>
            <OrchestratorSignalsPanel recommendations={state.recommendations} />
          </WorkspaceSection>
        )}

        {activeTab === "archived" && (
          <WorkspaceSection title={`Archivados · ${archived}`}>
            <OrchestratorPlanQueue
              plans={state.plans.filter(p => p.status === "archived")}
              onSelect={setSelectedPlan}
              orgSlug={orgSlug}
              filter="all"
            />
          </WorkspaceSection>
        )}
      </div>

      {/* Detail drawer */}
      <OrchestratorDetailDrawer
        plan={selectedPlan}
        recommendations={state.recommendations}
        orgSlug={orgSlug}
        onClose={() => setSelectedPlan(null)}
      />
    </>
  );
}
