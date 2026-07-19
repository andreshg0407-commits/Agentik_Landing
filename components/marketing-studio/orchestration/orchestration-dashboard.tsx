"use client";

/**
 * components/marketing-studio/orchestration/orchestration-dashboard.tsx
 *
 * MS-12 — Commerce Orchestration Center dashboard.
 *
 * Client-side composition layer — receives all data as serialized props
 * from the RSC page. No Prisma, no fetch.
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import { WorkspaceSection } from "@/components/shell/operational-primitives";
import { OrchestrationHealthStrip }    from "./orchestration-health-strip";
import { OrchestrationDestinationGrid } from "./orchestration-destination-grid";
import {
  OrchestrationActiveQueue,
  OrchestrationFailedQueue,
  OrchestrationRetryQueue,
} from "./orchestration-queue";
import {
  LucaSignalsPanel,
  MilaSignalsPanel,
  OrchestrationActionCenter,
} from "./orchestration-signals";
import { OrchestrationPropagationAlerts } from "./orchestration-propagation";
import type { OrchestrationState } from "@/lib/marketing-studio/orchestration/orchestration-types";
import type { LucaCommerceSignal, MilaCommerceSignal } from "@/lib/marketing-studio/commerce/luca-commerce";

interface Props {
  state:        OrchestrationState;
  lucaSignals:  LucaCommerceSignal[];
  milaSignals:  MilaCommerceSignal[];
  orgSlug?:     string;
}

export function OrchestrationDashboard({ state, lucaSignals, milaSignals, orgSlug }: Props) {
  const hasFailed   = state.failedJobs.length > 0;
  const hasRetrying = state.retryQueue.length > 0;
  const hasPropagation = state.propagationAlerts.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* 1. Global health strip */}
      <OrchestrationHealthStrip state={state} />

      {/* 2. Destination health matrix */}
      <WorkspaceSection title="Salud de Destinos">
        <OrchestrationDestinationGrid destinations={state.destinations} />
      </WorkspaceSection>

      {/* 3. Action center — critical items first */}
      {state.recommendations.length > 0 && (
        <WorkspaceSection title="Centro de Acción">
          <OrchestrationActionCenter actions={state.recommendations} />
        </WorkspaceSection>
      )}

      {/* 4. Active queue + Failed jobs side by side */}
      <WorkspaceSection title="Cola de Jobs">
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: hasFailed ? "1fr 1fr" : "1fr",
            gap:                 S[3],
            padding:             `0 ${S[4]}px ${S[4]}px`,
          }}
        >
          <OrchestrationActiveQueue jobs={state.activeJobs} orgSlug={orgSlug} />
          {hasFailed && <OrchestrationFailedQueue jobs={state.failedJobs} orgSlug={orgSlug} />}
        </div>
      </WorkspaceSection>

      {/* 5. Retry queue */}
      {hasRetrying && (
        <WorkspaceSection title="Reintentos Programados">
          <div style={{ padding: `0 ${S[4]}px ${S[4]}px` }}>
            <OrchestrationRetryQueue jobs={state.retryQueue} orgSlug={orgSlug} />
          </div>
        </WorkspaceSection>
      )}

      {/* 6. Propagation alerts */}
      {hasPropagation && (
        <WorkspaceSection title="Alertas de Propagación">
          <OrchestrationPropagationAlerts alerts={state.propagationAlerts} />
        </WorkspaceSection>
      )}

      {/* 7. Luca + Mila intelligence */}
      <WorkspaceSection title="Inteligencia Operativa">
        <div
          style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1fr",
            gap:                 S[3],
            padding:             `0 ${S[4]}px ${S[4]}px`,
          }}
        >
          <LucaSignalsPanel signals={lucaSignals} />
          <MilaSignalsPanel signals={milaSignals} />
        </div>
      </WorkspaceSection>

      {/* 8. Queue strip footer */}
      <div className="ag-queue-strip">
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginRight: S[2] }}>
          Sistema:
        </span>
        {state.queueStats.runningJobs > 0 && (
          <span className="ag-queue-strip__chip ag-queue-strip__chip--running">
            {state.queueStats.runningJobs} en ejecución
          </span>
        )}
        {state.queueStats.pendingJobs > 0 && (
          <span className="ag-queue-strip__chip ag-queue-strip__chip--pending">
            {state.queueStats.pendingJobs} pendientes
          </span>
        )}
        {state.queueStats.failedJobs > 0 && (
          <span className="ag-queue-strip__chip ag-queue-strip__chip--failed">
            {state.queueStats.failedJobs} fallidos
          </span>
        )}
        {state.queueStats.succeededJobs > 0 && (
          <span className="ag-queue-strip__chip ag-queue-strip__chip--succeeded">
            {state.queueStats.succeededJobs} completados
          </span>
        )}
        {state.publicationBacklog > 0 && (
          <span className="ag-queue-strip__chip ag-queue-strip__chip--pending">
            {state.publicationBacklog} por publicar
          </span>
        )}
        <span
          style={{
            marginLeft: "auto",
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      C.inkFaint,
          }}
        >
          {new Date(state.computedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
    </div>
  );
}
