"use client";

/**
 * components/marketing-studio/orchestrator/orchestrator-action-center.tsx
 *
 * MS-18 — Execution Actions: Action center panel
 *
 * Separates: safe / operational / destructive / pending_external actions.
 */

import { C, T, S, R }                     from "@/lib/ui/tokens";
import { OrchestratorActionButton }        from "./orchestrator-action-button";
import type { OrchestratorPlan }           from "@/lib/marketing-studio/orchestrator/orchestrator-types";
import type { OrchestratorActionResult }   from "@/lib/marketing-studio/orchestrator/orchestrator-actions";

interface Props {
  plan:       OrchestratorPlan;
  orgSlug:    string;
  onRefresh?: (result: OrchestratorActionResult) => void;
}

function ActionGroup({
  title,
  color,
  children,
}: {
  title:    string;
  color:    string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: S[4] }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        color,
        fontWeight:    700,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        marginBottom:  S[2],
        paddingBottom: S[1],
        borderBottom:  `1px solid ${C.lineSubtle}`,
      }}>
        {title}
      </div>
      <div className="ag-action-tray" style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
        {children}
      </div>
    </div>
  );
}

export function OrchestratorActionCenter({ plan, orgSlug, onRefresh }: Props) {
  const isRunning   = ["running", "partially_completed"].includes(plan.status);
  const isPaused    = plan.status === "paused";
  const isDraft     = plan.status === "draft";
  const isQueued    = plan.status === "queued";
  const isBlocked   = plan.status === "blocked";
  const isFailed    = plan.status === "failed";
  const isArchived  = plan.status === "archived";
  const isCompleted = plan.status === "completed";
  const isTerminal  = isArchived || isCompleted;

  const hasFailedStages = plan.stages.some(s => s.status === "failed");
  const hasBlockedStages = plan.stages.some(s => s.status === "blocked");

  const handleResult = (r: { success: boolean; message: string; executionJobId: string | null; newPlanStatus: string | null; newStageStatus: string | null; error?: { code: string; message: string } | null }) => {
    onRefresh?.(r as OrchestratorActionResult);
  };

  return (
    <div>
      {/* §1 Safe actions — always available */}
      <ActionGroup title="Diagnóstico" color={C.blue}>
        <OrchestratorActionButton
          orgSlug={orgSlug} actionType="refresh_health"
          planId={plan.id} label="Refrescar Health"
          variant="ghost" onSuccess={handleResult}
        />
        <OrchestratorActionButton
          orgSlug={orgSlug} actionType="rebuild_dependencies"
          planId={plan.id} label="Recalcular Deps"
          variant="ghost" onSuccess={handleResult}
        />
        {(isDraft || isQueued || isBlocked) && (
          <OrchestratorActionButton
            orgSlug={orgSlug} actionType="validate_plan"
            planId={plan.id} label="Validar Plan"
            variant="secondary" onSuccess={handleResult}
          />
        )}
      </ActionGroup>

      {/* §2 Operational actions */}
      {!isTerminal && (
        <ActionGroup title="Operaciones" color={C.blueDark}>
          {(isDraft || isQueued || isBlocked || isFailed) && (
            <OrchestratorActionButton
              orgSlug={orgSlug} actionType="run_plan"
              planId={plan.id} label="Ejecutar Plan"
              variant="primary" onSuccess={handleResult}
            />
          )}
          {isRunning && (
            <OrchestratorActionButton
              orgSlug={orgSlug} actionType="pause_plan"
              planId={plan.id} label="Pausar"
              variant="secondary" onSuccess={handleResult}
            />
          )}
          {isPaused && (
            <OrchestratorActionButton
              orgSlug={orgSlug} actionType="resume_plan"
              planId={plan.id} label="Reanudar"
              variant="primary" onSuccess={handleResult}
            />
          )}
          {(isFailed || hasFailedStages) && (
            <OrchestratorActionButton
              orgSlug={orgSlug} actionType="retry_plan"
              planId={plan.id} label="Reintentar Fallidos"
              variant="secondary" onSuccess={handleResult}
            />
          )}
        </ActionGroup>
      )}

      {/* §3 Integration actions */}
      {!isTerminal && (
        <ActionGroup title="Integraciones" color={C.green}>
          {plan.targetChannels.includes("shopify") && (
            <OrchestratorActionButton
              orgSlug={orgSlug} actionType="sync_shopify"
              planId={plan.id}
              payload={{ productId: plan.sourceEntityId }}
              label="Sync Shopify"
              variant="secondary" onSuccess={handleResult}
            />
          )}
          {plan.targetChannels.some(c => ["instagram","facebook","tiktok"].includes(c)) && (
            <OrchestratorActionButton
              orgSlug={orgSlug} actionType="publish_social"
              planId={plan.id}
              payload={{ channel: plan.targetChannels.find(c => ["instagram","facebook","tiktok"].includes(c)), entityId: plan.sourceEntityId }}
              label="Publicar Social"
              variant="secondary" onSuccess={handleResult}
            />
          )}
          {plan.targetChannels.includes("whatsapp") && (
            <OrchestratorActionButton
              orgSlug={orgSlug} actionType="prepare_whatsapp"
              planId={plan.id}
              payload={{ catalogId: plan.metadata.catalogId as string | null ?? null }}
              label="WhatsApp"
              variant="ghost" onSuccess={handleResult}
            />
          )}
          {plan.targetChannels.includes("catalog") && (
            <OrchestratorActionButton
              orgSlug={orgSlug} actionType="rebuild_catalog"
              planId={plan.id}
              payload={{ catalogId: plan.metadata.catalogId as string | null ?? null }}
              label="Rebuild Catálogo"
              variant="ghost" onSuccess={handleResult}
            />
          )}
        </ActionGroup>
      )}

      {/* §4 Destructive */}
      {!isArchived && (
        <ActionGroup title="Peligroso" color={C.red}>
          {!isRunning && !isCompleted && (
            <OrchestratorActionButton
              orgSlug={orgSlug} actionType="cancel_plan"
              planId={plan.id} label="Cancelar"
              variant="danger" onSuccess={handleResult}
            />
          )}
          {!isRunning && (
            <OrchestratorActionButton
              orgSlug={orgSlug} actionType="archive_plan"
              planId={plan.id} label="Archivar"
              variant="danger" onSuccess={handleResult}
            />
          )}
        </ActionGroup>
      )}

      {/* §5 Pending external note */}
      {(plan.targetChannels.includes("whatsapp") || plan.targetChannels.includes("ads")) && (
        <div style={{
          marginTop:    S[3],
          padding:      `${S[2]}px ${S[3]}px`,
          background:   C.amberLight,
          border:       `1px solid ${C.amberBorder}`,
          borderRadius: R.sm,
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber, fontWeight: 600 }}>
            pending_external
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amberDark, marginLeft: S[2] }}>
            WhatsApp/Ads requieren configuración externa antes de ejecutar
          </span>
        </div>
      )}
    </div>
  );
}
