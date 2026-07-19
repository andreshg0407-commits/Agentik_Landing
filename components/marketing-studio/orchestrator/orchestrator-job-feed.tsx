"use client";

/**
 * components/marketing-studio/orchestrator/orchestrator-job-feed.tsx
 *
 * MS-17 — Orchestrator Runtime: Live job activity timeline
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import {
  ORCHESTRATOR_JOB_TYPE_LABEL,
  ORCHESTRATOR_STAGE_STATUS_LABEL,
  getStageStatusIcon,
  formatOrchestratorDate,
} from "@/lib/marketing-studio/orchestrator/orchestrator-display";
import type { OrchestratorPlan, OrchestratorJob } from "@/lib/marketing-studio/orchestrator/orchestrator-types";

interface Props {
  plans: OrchestratorPlan[];
}

interface FeedEntry {
  job:          OrchestratorJob;
  planId:       string;
  stageLabel:   string;
  occurredAt:   string;
}

function buildFeed(plans: OrchestratorPlan[]): FeedEntry[] {
  const entries: FeedEntry[] = [];
  for (const plan of plans) {
    for (const stage of plan.stages) {
      for (const job of stage.jobs) {
        const occurredAt = job.completedAt ?? job.failedAt ?? job.startedAt ?? null;
        if (!occurredAt) continue;
        entries.push({ job, planId: plan.id, stageLabel: stage.label, occurredAt });
      }
    }
  }
  return entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 50);
}

function FeedRow({ entry }: { entry: FeedEntry }) {
  const { job } = entry;

  const statusColor =
    job.status === "completed" ? C.green :
    job.status === "running"   ? C.blueDark :
    job.status === "failed"    ? C.red :
    job.status === "blocked"   ? C.red :
    job.status === "ready"     ? C.amber :
    C.inkFaint;

  return (
    <div className="ag-orchestrator-timeline" style={{
      display:        "grid",
      gridTemplateColumns: "20px 1fr auto",
      gap:            S[3],
      padding:        `${S[1] + 2}px ${S[4]}px`,
      borderBottom:   `1px solid ${C.lineSubtle}`,
      alignItems:     "center",
    }}>
      {/* Status icon */}
      <span style={{ fontFamily: T.mono, fontSize: T.sz.md, color: statusColor, textAlign: "center" }}>
        {getStageStatusIcon(job.status)}
      </span>

      {/* Description */}
      <div style={{ display: "flex", flexDirection: "column", gap: 1, overflow: "hidden" }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, fontWeight: 600 }}>
          {ORCHESTRATOR_JOB_TYPE_LABEL[job.type]}
          <span style={{ color: C.inkFaint, fontWeight: 400 }}> · {entry.stageLabel}</span>
        </span>
        <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 600, color: statusColor,
            background: `${statusColor}18`, borderRadius: R.xs, padding: "1px 4px",
          }}>
            {ORCHESTRATOR_STAGE_STATUS_LABEL[job.status]}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            plan {entry.planId.slice(0, 6)}…
          </span>
          {job.retryCount > 0 && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber, fontWeight: 700 }}>
              ↺ retry ×{job.retryCount}
            </span>
          )}
          {job.failReason && (
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red,
              maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {job.failReason}
            </span>
          )}
        </div>
      </div>

      {/* Timestamp */}
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, whiteSpace: "nowrap" }}>
        {formatOrchestratorDate(entry.occurredAt)}
      </span>
    </div>
  );
}

export function OrchestratorJobFeed({ plans }: Props) {
  const feed = buildFeed(plans);

  if (feed.length === 0) {
    return (
      <div style={{
        padding:    `${S[10]}px`,
        textAlign:  "center",
        fontFamily: T.mono,
        fontSize:   T.sz.sm,
        color:      C.inkFaint,
      }}>
        Sin actividad registrada
      </div>
    );
  }

  return (
    <div className="ag-op-table">
      <div className="ag-op-row" style={{
        display:    "grid",
        gridTemplateColumns: "20px 1fr auto",
        gap:        S[3],
        background: C.surfaceAlt,
        padding:    `${S[2]}px ${S[4]}px`,
      }}>
        {["", "Actividad", "Hora"].map((h, i) => (
          <span key={i} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {h}
          </span>
        ))}
      </div>
      {feed.map((entry, i) => (
        <FeedRow key={`${entry.job.id}-${i}`} entry={entry} />
      ))}
    </div>
  );
}
