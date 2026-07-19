"use client";

/**
 * components/marketing-studio/orchestrator/orchestrator-stage-graph.tsx
 *
 * MS-17 — Orchestrator Runtime: Pipeline stage graph (horizontal flow)
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import {
  getStageStatusIcon,
  getStageStatusVariant,
  ORCHESTRATOR_STAGE_STATUS_LABEL,
  ORCHESTRATOR_JOB_TYPE_LABEL,
} from "@/lib/marketing-studio/orchestrator/orchestrator-display";
import type { OrchestratorPlan, OrchestratorStage } from "@/lib/marketing-studio/orchestrator/orchestrator-types";

interface Props {
  plan: OrchestratorPlan;
}

function StageNode({ stage, isLast }: { stage: OrchestratorStage; isLast: boolean }) {
  const variant = getStageStatusVariant(stage.status);
  const icon    = getStageStatusIcon(stage.status);

  const nodeColor =
    stage.status === "completed" ? C.green :
    stage.status === "running"   ? C.blueDark :
    stage.status === "blocked"   ? C.red :
    stage.status === "failed"    ? C.red :
    stage.status === "ready"     ? C.amber :
    C.inkFaint;

  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div className="ag-orchestrator-stage" style={{
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        gap:           S[1],
        minWidth:      80,
      }}>
        {/* Circle */}
        <div style={{
          width:        36,
          height:       36,
          borderRadius: R.pill,
          border:       `2px solid ${nodeColor}`,
          background:   stage.status === "completed" ? C.greenLight
                       : stage.status === "running"  ? C.blueLight
                       : stage.status === "failed"   ? C.redLight
                       : stage.status === "blocked"  ? C.redLight
                       : C.surfaceAlt,
          display:      "flex",
          alignItems:   "center",
          justifyContent: "center",
          fontFamily:   T.mono,
          fontSize:     T.sz.md,
          color:        nodeColor,
          fontWeight:   700,
          transition:   "all 0.2s ease",
        }}>
          {icon}
        </div>

        {/* Label */}
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      nodeColor,
          fontWeight: stage.status === "running" ? 700 : 500,
          textAlign:  "center",
          maxWidth:   76,
          lineHeight: 1.3,
        }}>
          {ORCHESTRATOR_JOB_TYPE_LABEL[stage.type]}
        </span>

        {/* Status chip */}
        <span style={{
          fontFamily:   T.mono,
          fontSize:     8,
          color:        nodeColor,
          background:   `${nodeColor}18`,
          borderRadius: R.xs,
          padding:      "1px 4px",
          fontWeight:   600,
        }}>
          {ORCHESTRATOR_STAGE_STATUS_LABEL[stage.status]}
        </span>
      </div>

      {/* Connector arrow */}
      {!isLast && (
        <div style={{
          width:        28,
          height:       2,
          background:   nodeColor === C.inkFaint ? C.lineSubtle : `${nodeColor}40`,
          position:     "relative",
          flexShrink:   0,
          marginBottom: 28,
        }}>
          <span style={{
            position:   "absolute",
            right:      -4,
            top:        -5,
            fontFamily: T.mono,
            fontSize:   9,
            color:      nodeColor === C.inkFaint ? C.lineSubtle : `${nodeColor}80`,
          }}>
            ›
          </span>
        </div>
      )}
    </div>
  );
}

export function OrchestratorStageGraph({ plan }: Props) {
  const sorted = [...plan.stages].sort((a, b) => a.order - b.order);

  if (sorted.length === 0) {
    return (
      <div style={{ padding: `${S[5]}px`, fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, textAlign: "center" }}>
        Sin stages configurados
      </div>
    );
  }

  return (
    <div className="ag-orchestrator-graph" style={{
      padding:    `${S[4]}px ${S[6]}px`,
      overflowX:  "auto",
      background: C.white,
      border:     `1px solid ${C.line}`,
      borderRadius: R.md,
    }}>
      {/* Plan type + progress bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: S[4] }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, fontWeight: 600 }}>
          Pipeline · {plan.completedStages}/{plan.totalStages} stages
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <div style={{ width: 120, height: 4, background: C.lineSubtle, borderRadius: R.pill, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width:  `${plan.progress}%`,
              background: plan.progress >= 80 ? C.green : plan.progress >= 40 ? C.amber : C.red,
              transition: "width 0.3s ease",
            }} />
          </div>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, fontWeight: 700 }}>
            {plan.progress}%
          </span>
        </div>
      </div>

      {/* Stage nodes */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
        {sorted.map((stage, i) => (
          <StageNode key={stage.id} stage={stage} isLast={i === sorted.length - 1} />
        ))}
      </div>
    </div>
  );
}
