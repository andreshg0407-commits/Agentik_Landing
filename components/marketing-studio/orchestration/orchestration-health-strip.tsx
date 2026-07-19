"use client";

/**
 * components/marketing-studio/orchestration/orchestration-health-strip.tsx
 *
 * MS-12 — Global system health banner for the Orchestration Center.
 * Shows overall health level + queue stats as a compact strip.
 */

import { C, T, S } from "@/lib/ui/tokens";
import type { OrchestrationState } from "@/lib/marketing-studio/orchestration/orchestration-types";
import { SYSTEM_HEALTH_LABELS, SYSTEM_HEALTH_VARIANT } from "@/lib/marketing-studio/orchestration/orchestration-display";

interface Props {
  state: Pick<OrchestrationState, "systemHealth" | "systemHealthLabel" | "queueStats" | "webhookPending" | "publicationBacklog" | "syncBacklog">;
}

export function OrchestrationHealthStrip({ state }: Props) {
  const { systemHealth, systemHealthLabel, queueStats, webhookPending, publicationBacklog, syncBacklog } = state;

  const chips: Array<{ label: string; value: number; chipVariant: string }> = [
    { label: "Activos",     value: queueStats.runningJobs,  chipVariant: "running"   },
    { label: "Pendientes",  value: queueStats.pendingJobs,  chipVariant: "pending"   },
    { label: "Fallidos",    value: queueStats.failedJobs,   chipVariant: "failed"    },
    { label: "Pub. pendiente", value: publicationBacklog,    chipVariant: "pending"   },
    { label: "Dif. sincron.", value: syncBacklog,            chipVariant: "pending"   },
    { label: "Aut. pendiente", value: webhookPending,        chipVariant: webhookPending > 5 ? "failed" : "neutral" },
  ].filter(c => c.value > 0);

  return (
    <div
      className={`ag-orchestration-health ag-orchestration-health--${systemHealth}`}
      role="status"
      aria-label={`Sistema: ${SYSTEM_HEALTH_LABELS[systemHealth]}`}
    >
      <span className="ag-orchestration-health__indicator" aria-hidden="true" />
      <span className="ag-orchestration-health__label" style={{ fontFamily: T.mono }}>
        {SYSTEM_HEALTH_LABELS[systemHealth]}
      </span>
      <span
        className="ag-op-status"
        style={{
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          padding: `${S[0]}px ${S[1]}px`,
        }}
      >
        {/* variant badge */}
        <span className={`ag-op-status ag-op-status--${SYSTEM_HEALTH_VARIANT[systemHealth]}`}>
          {systemHealth.toUpperCase()}
        </span>
      </span>
      <span
        className="ag-orchestration-health__detail"
        style={{ fontFamily: T.mono, fontSize: T.sz.sm }}
      >
        {systemHealthLabel}
      </span>

      {chips.length > 0 && (
        <div className="ag-queue-strip" style={{ marginLeft: "auto", border: "none", padding: 0, background: "transparent" }}>
          {chips.map(chip => (
            <span
              key={chip.label}
              className={`ag-queue-strip__chip ag-queue-strip__chip--${chip.chipVariant}`}
            >
              <span>{chip.value}</span>
              <span style={{ fontWeight: 400 }}>{chip.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
