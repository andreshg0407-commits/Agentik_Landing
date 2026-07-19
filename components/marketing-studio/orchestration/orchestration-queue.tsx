"use client";

/**
 * components/marketing-studio/orchestration/orchestration-queue.tsx
 *
 * MS-12 — Active queue + failed jobs + retry queue panels.
 */

import { C, T, S, R, E } from "@/lib/ui/tokens";
import { EmptyOperationalState } from "@/components/shell/operational-primitives";
import { Panel, PanelHeader } from "@/components/shell/primitives";
import { OrchestrationJobCard } from "./orchestration-job-card";
import { ExecutionActionButton } from "./execution-action-button";
import type { OrchestrationJob } from "@/lib/marketing-studio/orchestration/orchestration-types";
import {
  formatNextRetry,
  JOB_TYPE_LABELS,
  JOB_STATUS_VARIANT,
  JOB_STATUS_LABELS,
} from "@/lib/marketing-studio/orchestration/orchestration-display";
import { formatJobAge } from "@/lib/marketing-studio/orchestration/orchestration-display";

interface ActiveQueueProps {
  jobs:     OrchestrationJob[];
  orgSlug?: string;
}

export function OrchestrationActiveQueue({ jobs, orgSlug }: ActiveQueueProps) {
  return (
    <Panel>
      <PanelHeader
        title={
          <div style={{ display: "flex", width: "100%", alignItems: "center", gap: S[2] }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>Cola Activa</span>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: jobs.length > 0 ? C.blue : C.inkFaint }}>
              {jobs.length} proceso{jobs.length !== 1 ? "s" : ""}
            </span>
            {orgSlug && jobs.length > 0 && (
              <span style={{ marginLeft: "auto" }}>
                <ExecutionActionButton
                  orgSlug={orgSlug}
                  action={{ type: "run", jobId: jobs[0]?.id ?? "" }}
                  label="Ejecutar siguiente"
                  variant="secondary"
                  size="xs"
                />
              </span>
            )}
          </div>
        }
      />

      {jobs.length === 0 ? (
        <EmptyOperationalState
          message="Cola vacía"
          detail="No hay procesos en ejecución o pendientes"
        />
      ) : (
        <div>
          {jobs.map(job => (
            <OrchestrationJobCard key={job.id} job={job} orgSlug={orgSlug} />
          ))}
        </div>
      )}
    </Panel>
  );
}

interface FailedQueueProps {
  jobs:     OrchestrationJob[];
  orgSlug?: string;
}

export function OrchestrationFailedQueue({ jobs, orgSlug }: FailedQueueProps) {
  if (jobs.length === 0) return null;

  return (
    <Panel>
      <PanelHeader
        urgent
        title={
          <div style={{ display: "flex", width: "100%", alignItems: "center" }}>
            <span>Procesos fallidos</span>
            <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz.xs }}>
              {jobs.length} fallido{jobs.length !== 1 ? "s" : ""}
            </span>
          </div>
        }
      />

      <div>
        {jobs.map(job => (
          <div key={job.id} className="ag-retry-card">
            <div>
              <div className="ag-retry-card__label">{JOB_TYPE_LABELS[job.type]}</div>
              {job.productName && (
                <div className="ag-retry-card__meta">
                  {job.productName}
                  {job.failureReason ? ` · ${job.failureReason.slice(0, 60)}` : ""}
                </div>
              )}
            </div>
            <div
              style={{
                display:       "flex",
                flexDirection: "column",
                alignItems:    "flex-end",
                gap:           2,
              }}
            >
              <span
                style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      C.amber,
                }}
              >
                ↺{job.retryCount} intentos
              </span>
              {orgSlug && (
                <ExecutionActionButton
                  orgSlug={orgSlug}
                  action={{ type: "retry", jobId: job.id }}
                  label="Reintentar"
                  variant="secondary"
                  size="xs"
                />
              )}
              <span
                style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      C.inkFaint,
                }}
              >
                {formatJobAge(job.completedAt ?? job.createdAt)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

interface RetryQueueProps {
  jobs:     OrchestrationJob[];
  orgSlug?: string;
}

export function OrchestrationRetryQueue({ jobs, orgSlug }: RetryQueueProps) {
  if (jobs.length === 0) return null;

  return (
    <Panel>
      <PanelHeader
        title={
          <div style={{ display: "flex", width: "100%", alignItems: "center" }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.amber }}>Cola de Reintentos</span>
            <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber }}>
              {jobs.length} programado{jobs.length !== 1 ? "s" : ""}
            </span>
          </div>
        }
      />

      <div>
        {jobs.map(job => (
          <div key={job.id} className="ag-orchestration-job">
            <div
              className="ag-orchestration-job__icon"
              style={{ color: C.amber }}
            >
              ↺
            </div>
            <div className="ag-orchestration-job__body">
              <div className="ag-orchestration-job__label">{JOB_TYPE_LABELS[job.type]}</div>
              <div className="ag-orchestration-job__meta">
                {job.productName ?? "—"}
                {" · "}
                Intento {job.retryCount + 1}
              </div>
            </div>
            <div className="ag-orchestration-job__aside">
              <span
                style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      C.amber,
                }}
              >
                {formatNextRetry(job.scheduledAt)}
              </span>
              {orgSlug && (
                <ExecutionActionButton
                  orgSlug={orgSlug}
                  action={{ type: "retry", jobId: job.id }}
                  label="Forzar"
                  variant="ghost"
                  size="xs"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
