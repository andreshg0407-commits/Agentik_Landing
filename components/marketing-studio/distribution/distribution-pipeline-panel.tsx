"use client";

/**
 * components/marketing-studio/distribution/distribution-pipeline-panel.tsx
 *
 * MS-14 — Active pipelines list with stage progress.
 */

import { C, T, S }           from "@/lib/ui/tokens";
import {
  getDistributionStatusLabel,
  getDistributionStatusVariant,
  getPipelineTypeLabel,
  formatDistributionDate,
} from "@/lib/marketing-studio/distribution/distribution-display";
import type { DistributionPipelineDTO } from "@/lib/marketing-studio/distribution/distribution-types";

interface Props {
  pipelines: DistributionPipelineDTO[];
  orgSlug:   string;
}

export function DistributionPipelinePanel({ pipelines }: Props) {
  if (pipelines.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px ${S[2]}px` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Sin pipelines activos
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
      {pipelines.slice(0, 8).map(pipeline => {
        const statusVariant = getDistributionStatusVariant(pipeline.status);
        const completedStages = pipeline.stages.filter(s => s.status === "published").length;
        const totalStages     = pipeline.stages.length;
        const progressPct     = totalStages > 0 ? (completedStages / totalStages) * 100 : 0;

        return (
          <div key={pipeline.id} style={{
            padding:      `${S[3]}px`,
            background:   C.white,
            border:       `1px solid ${C.line}`,
            borderRadius: 6,
            display:      "flex",
            flexDirection: "column",
            gap:          S[2],
          }}>
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz.sm,
                fontWeight: 600,
                color:      C.ink,
                flex:       1,
                overflow:   "hidden",
                textOverflow: "ellipsis",
                whiteSpace:   "nowrap",
              }}>
                {pipeline.name}
              </span>
              <span className={`ag-op-status ag-op-status--${statusVariant}`}>
                {getDistributionStatusLabel(pipeline.status)}
              </span>
            </div>

            {/* Type + channels */}
            <div style={{ display: "flex", gap: S[2], flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                {getPipelineTypeLabel(pipeline.pipelineType)}
              </span>
              <span style={{ color: C.inkGhost }}>·</span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                {pipeline.channels.join(", ")}
              </span>
            </div>

            {/* Stage progress */}
            {totalStages > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                    {completedStages}/{totalStages} etapas
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                    {Math.round(progressPct)}%
                  </span>
                </div>
                <div style={{ width: "100%", height: 4, background: C.lineSubtle, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    width:        `${progressPct}%`,
                    height:       "100%",
                    background:   pipeline.status === "failed" ? C.red : C.blueDark,
                    borderRadius: 2,
                    transition:   "width 0.3s ease",
                  }} />
                </div>
              </div>
            )}

            {/* Timestamp */}
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              Creado {formatDistributionDate(pipeline.createdAt)}
            </span>

            {/* Error */}
            {pipeline.lastError && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red, background: C.redLight, padding: "2px 6px", borderRadius: 4 }}>
                {pipeline.lastError.slice(0, 80)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
