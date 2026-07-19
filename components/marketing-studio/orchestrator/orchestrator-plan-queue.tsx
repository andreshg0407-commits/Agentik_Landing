"use client";

/**
 * components/marketing-studio/orchestrator/orchestrator-plan-queue.tsx
 *
 * MS-17 — Orchestrator Runtime: Plan queue table
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import {
  getOrchestratorStatusVariant,
  ORCHESTRATOR_STATUS_LABEL,
  ORCHESTRATOR_PLAN_TYPE_LABEL,
  getPlanTypeIcon,
  getChannelColor,
  getProgressColor,
  formatCountdown,
  formatOrchestratorDate,
} from "@/lib/marketing-studio/orchestrator/orchestrator-display";
import { OrchestratorActionButton }  from "./orchestrator-action-button";
import type {
  OrchestratorPlan,
  OrchestratorStatus,
} from "@/lib/marketing-studio/orchestrator/orchestrator-types";

interface Props {
  plans:    OrchestratorPlan[];
  onSelect: (plan: OrchestratorPlan) => void;
  orgSlug?: string;
  filter?:  OrchestratorStatus | "all";
}

const FILTER_GROUPS: { id: OrchestratorStatus | "all"; label: string }[] = [
  { id: "all",               label: "Todos" },
  { id: "running",           label: "Ejecutando" },
  { id: "queued",            label: "En Cola" },
  { id: "blocked",           label: "Bloqueados" },
  { id: "partially_completed", label: "Parciales" },
  { id: "completed",         label: "Completados" },
  { id: "failed",            label: "Fallidos" },
];

export function OrchestratorPlanQueue({ plans, onSelect, orgSlug, filter = "all" }: Props) {
  const filtered = filter === "all"
    ? plans
    : plans.filter(p => p.status === filter);

  if (filtered.length === 0) {
    return (
      <div style={{
        padding:    `${S[10]}px`,
        textAlign:  "center",
        fontFamily: T.mono,
        fontSize:   T.sz.sm,
        color:      C.inkFaint,
      }}>
        No hay planes en esta categoría
      </div>
    );
  }

  return (
    <div className="ag-op-table">
      {/* Header */}
      <div className="ag-op-row" style={{
        display:    "grid",
        gridTemplateColumns: "28px 1fr 120px 80px 80px 60px 90px 90px",
        gap:        S[3],
        background: C.surfaceAlt,
        padding:    `${S[2]}px ${S[4]}px`,
      }}>
        {["", "Plan", "Tipo", "Canales", "Progreso", "Retries", "Programado", "Acción"].map((h, i) => (
          <span key={i} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {h}
          </span>
        ))}
      </div>

      {/* Rows */}
      {filtered.map(plan => (
        <PlanRow key={plan.id} plan={plan} onSelect={onSelect} orgSlug={orgSlug} />
      ))}
    </div>
  );
}

function PlanRow({ plan, onSelect, orgSlug }: { plan: OrchestratorPlan; onSelect: (p: OrchestratorPlan) => void; orgSlug?: string }) {
  const blockerCount = plan.blockers.filter(b => b.severity === "error" && !b.resolvedAt).length;

  return (
    <div
      className="ag-op-row ag-orchestrator-row"
      style={{
        display:    "grid",
        gridTemplateColumns: "28px 1fr 120px 80px 80px 60px 90px 90px",
        gap:        S[3],
        padding:    `${S[2]}px ${S[4]}px`,
        alignItems: "center",
      }}
    >
      {/* Type icon */}
      <span style={{ fontFamily: T.mono, fontSize: T.sz.md, color: C.inkLight }}>
        {getPlanTypeIcon(plan.type)}
      </span>

      {/* Plan id + status + blockers */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span className={`ag-op-status ag-op-status--${getOrchestratorStatusVariant(plan.status)}`}>
            {ORCHESTRATOR_STATUS_LABEL[plan.status]}
          </span>
          {blockerCount > 0 && (
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 700,
              background: C.redLight, color: C.red, borderRadius: R.xs, padding: "1px 5px",
            }}>
              {blockerCount} bloqueo{blockerCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
          {plan.id.slice(0, 8)}…
        </span>
      </div>

      {/* Type */}
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
        {ORCHESTRATOR_PLAN_TYPE_LABEL[plan.type]}
      </span>

      {/* Channels */}
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {plan.targetChannels.slice(0, 5).map(ch => (
          <span key={ch} title={ch} style={{
            width: 8, height: 8, borderRadius: R.pill,
            background: getChannelColor(ch),
            display: "inline-block",
          }} />
        ))}
        {plan.targetChannels.length > 5 && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
            +{plan.targetChannels.length - 5}
          </span>
        )}
      </div>

      {/* Progress */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ height: 4, background: C.lineSubtle, borderRadius: R.pill, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${plan.progress}%`,
            background: getProgressColor(plan.progress),
            transition: "width 0.3s ease",
          }} />
        </div>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>
          {plan.progress}%
        </span>
      </div>

      {/* Retries */}
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs,
        color: plan.retryCount > 0 ? C.amber : C.inkLight,
        fontWeight: plan.retryCount > 0 ? 700 : 400,
      }}>
        {plan.retryCount > 0 ? `↺ ${plan.retryCount}` : "—"}
      </span>

      {/* Scheduled */}
      <span onClick={() => onSelect(plan)} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, cursor: "pointer" }}>
        {plan.scheduledAt ? formatCountdown(plan.scheduledAt) : formatOrchestratorDate(plan.createdAt)}
      </span>

      {/* Quick action */}
      <div onClick={e => e.stopPropagation()}>
        {orgSlug && ["draft","queued","blocked","failed"].includes(plan.status) && (
          <OrchestratorActionButton
            orgSlug={orgSlug} actionType="run_plan"
            planId={plan.id} label="▶ Run"
            variant="ghost"
          />
        )}
        {orgSlug && plan.status === "running" && (
          <OrchestratorActionButton
            orgSlug={orgSlug} actionType="pause_plan"
            planId={plan.id} label="⏸ Pause"
            variant="ghost"
          />
        )}
        {!orgSlug && (
          <button onClick={() => onSelect(plan)} className="ag-action-ghost" style={{ fontSize: 10 }}>
            Ver
          </button>
        )}
      </div>
    </div>
  );
}
