"use client";

/**
 * components/marketing-studio/distribution/distribution-dashboard.tsx
 *
 * MS-14 — Distribution Center: client composition layer.
 * Receives all data as serialized props from the RSC page. No Prisma, no fetch.
 */

import { C, T, S }             from "@/lib/ui/tokens";
import { WorkspaceSection }    from "@/components/shell/operational-primitives";
import { DistributionHealthStrip }   from "./distribution-health-strip";
import { DistributionCoverageGrid }  from "./distribution-coverage-grid";
import { DistributionPipelinePanel } from "./distribution-pipeline-panel";
import { DistributionSchedulePanel } from "./distribution-schedule-panel";
import { DistributionVariantGaps }   from "./distribution-variant-gaps";
import { DistributionSignalsPanel }  from "./distribution-signals-panel";
import type { DistributionState }    from "@/lib/marketing-studio/distribution/distribution-types";

interface Props {
  state:    DistributionState;
  orgSlug:  string;
}

export function DistributionDashboard({ state, orgSlug }: Props) {
  const hasActivePipelines = state.activePipelines.length > 0;
  const hasScheduledDrops  = state.scheduledDrops.length > 0;
  const hasVariantGaps     = state.variantGaps.length > 0;
  const hasIntelligence    = state.lucaRecos.length > 0 || state.milaRecos.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* 1. Health strip */}
      <DistributionHealthStrip state={state} />

      {/* 2. Channel coverage matrix */}
      <WorkspaceSection title="Cobertura por Canal">
        <DistributionCoverageGrid
          channelCoverage={state.channelCoverage}
          orgSlug={orgSlug}
        />
      </WorkspaceSection>

      {/* 3. Active pipelines + scheduled drops (side by side) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: S[4],
        padding: `0 ${S[6]}px ${S[4]}px`,
      }}>
        <WorkspaceSection title={`Pipelines Activos (${state.activePipelines.length})`}>
          <DistributionPipelinePanel
            pipelines={state.activePipelines}
            orgSlug={orgSlug}
          />
        </WorkspaceSection>

        <WorkspaceSection title={`Drops Programados (${state.scheduledDrops.length})`}>
          <DistributionSchedulePanel
            schedules={state.scheduledDrops}
            orgSlug={orgSlug}
          />
        </WorkspaceSection>
      </div>

      {/* 4. Variant gaps */}
      {hasVariantGaps && (
        <WorkspaceSection title="Gaps de Variantes">
          <DistributionVariantGaps gaps={state.variantGaps} />
        </WorkspaceSection>
      )}

      {/* 5. Intelligence — Luca + Mila */}
      {hasIntelligence && (
        <WorkspaceSection title="Inteligencia de Distribución">
          <DistributionSignalsPanel
            lucaRecos={state.lucaRecos}
            milaRecos={state.milaRecos}
          />
        </WorkspaceSection>
      )}
    </div>
  );
}
