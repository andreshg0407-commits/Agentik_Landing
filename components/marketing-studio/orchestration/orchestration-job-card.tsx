"use client";

/**
 * components/marketing-studio/orchestration/orchestration-job-card.tsx
 *
 * MS-12 — Single job card for the active queue and failed job list.
 */

import { C, T, S } from "@/lib/ui/tokens";
import type { OrchestrationJob } from "@/lib/marketing-studio/orchestration/orchestration-types";
import { ORCHESTRATION_JOB_STATUS } from "@/lib/marketing-studio/orchestration/orchestration-types";
import {
  JOB_TYPE_LABELS,
  JOB_TYPE_ICONS,
  JOB_STATUS_LABELS,
  JOB_STATUS_VARIANT,
  formatJobAge,
} from "@/lib/marketing-studio/orchestration/orchestration-display";
import { ExecutionActionButton } from "./execution-action-button";

interface Props {
  job:      OrchestrationJob;
  compact?: boolean;
  orgSlug?: string;
}

export function OrchestrationJobCard({ job, compact = false, orgSlug }: Props) {
  const statusVariant = JOB_STATUS_VARIANT[job.status];
  const icon          = JOB_TYPE_ICONS[job.type];
  const label         = JOB_TYPE_LABELS[job.type];
  const age           = formatJobAge(job.startedAt ?? job.createdAt);
  const isFailed      = job.status === ORCHESTRATION_JOB_STATUS.FAILED;
  const isPending     = job.status === ORCHESTRATION_JOB_STATUS.PENDING;

  return (
    <div className="ag-orchestration-job">
      {/* Icon */}
      <div className="ag-orchestration-job__icon" aria-hidden="true">
        {icon}
      </div>

      {/* Body */}
      <div className="ag-orchestration-job__body">
        <div className="ag-orchestration-job__label">{label}</div>
        <div className="ag-orchestration-job__meta">
          {job.productName && (
            <span style={{ color: C.inkMid }}>
              {job.productName}
              {" · "}
            </span>
          )}
          {job.affectedDestinations.join(", ")}
          {job.failureReason && !compact && (
            <span style={{ color: C.red }}>
              {" · "}
              {job.failureReason.slice(0, 80)}
            </span>
          )}
        </div>
      </div>

      {/* Aside */}
      <div className="ag-orchestration-job__aside">
        {job.retryCount > 0 && (
          <span
            style={{
              fontSize:   T.sz.xs,
              fontFamily: T.mono,
              color:      C.amber,
              marginRight: S[1],
            }}
          >
            ↺{job.retryCount}
          </span>
        )}
        <span className={`ag-op-status ag-op-status--${statusVariant}`}
          style={{ fontSize: T.sz.xs }}
        >
          {JOB_STATUS_LABELS[job.status]}
        </span>
        {orgSlug && isFailed && (
          <ExecutionActionButton
            orgSlug={orgSlug}
            action={{ type: "retry", jobId: job.id }}
            label="Reintentar"
            variant="secondary"
            size="xs"
          />
        )}
        {orgSlug && isPending && (
          <ExecutionActionButton
            orgSlug={orgSlug}
            action={{ type: "run", jobId: job.id }}
            label="Ejecutar"
            variant="secondary"
            size="xs"
          />
        )}
        <span
          style={{
            fontSize:   T.sz.xs,
            fontFamily: T.mono,
            color:      C.inkFaint,
            minWidth:   "32px",
            textAlign:  "right",
          }}
        >
          {age}
        </span>
      </div>
    </div>
  );
}
