"use client";

/**
 * components/marketing-studio/distribution/distribution-coverage-grid.tsx
 *
 * MS-14 — Channel coverage matrix.
 * One row per channel with coverage bar, health, last published date.
 */

import { C, T, S }           from "@/lib/ui/tokens";
import {
  getChannelLabel,
  formatCoveragePct,
  getCoverageVariant,
  formatDistributionDate,
  getHealthLabel,
  getHealthVariant,
} from "@/lib/marketing-studio/distribution/distribution-display";
import type { ChannelCoverageItem } from "@/lib/marketing-studio/distribution/distribution-types";

interface Props {
  channelCoverage: ChannelCoverageItem[];
  orgSlug:         string;
}

const variantColor: Record<string, string> = {
  ok:       C.green,
  warning:  C.amber,
  critical: C.red,
  default:  C.inkLight,
};

export function DistributionCoverageGrid({ channelCoverage }: Props) {
  // Only show channels with products, or all if none has products yet
  const active = channelCoverage.filter(c => c.totalProducts > 0);
  const rows   = active.length > 0 ? active : channelCoverage.slice(0, 6);

  if (rows.length === 0) {
    return (
      <div className="ag-empty-state" style={{ padding: `${S[6]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
          Sin productos registrados para distribución
        </span>
      </div>
    );
  }

  return (
    <div className="ag-op-table">
      {/* Header */}
      <div className="ag-op-row" style={{ background: C.surfaceAlt }}>
        {["Canal", "Cobertura", "Cubiertos", "Faltantes", "Salud", "Última publicación"].map(h => (
          <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, fontWeight: 600 }}>
            {h}
          </span>
        ))}
      </div>

      {rows.map(item => {
        const coverageVariant = getCoverageVariant(item.coveragePct);
        const healthVariant   = getHealthVariant(item.healthLevel);
        const coverageColor   = variantColor[coverageVariant] ?? C.inkLight;
        const healthColor     = variantColor[healthVariant]   ?? C.inkLight;

        return (
          <div key={item.channel} className="ag-op-row">
            {/* Canal */}
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>
              {getChannelLabel(item.channel)}
            </span>

            {/* Coverage bar */}
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <div style={{
                width:        80,
                height:       6,
                background:   C.lineSubtle,
                borderRadius: 3,
                overflow:     "hidden",
              }}>
                <div style={{
                  width:        `${Math.min(item.coveragePct, 100)}%`,
                  height:       "100%",
                  background:   coverageColor,
                  borderRadius: 3,
                  transition:   "width 0.3s ease",
                }} />
              </div>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: coverageColor, fontWeight: 600, minWidth: 36 }}>
                {formatCoveragePct(item.coveragePct)}
              </span>
            </div>

            {/* Covered */}
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>
              {item.covered}
            </span>

            {/* Missing */}
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: item.missing > 0 ? C.amber : C.inkLight }}>
              {item.missing > 0 ? item.missing : "—"}
            </span>

            {/* Health */}
            <span className={`ag-op-status ag-op-status--${healthVariant}`}>
              {getHealthLabel(item.healthLevel)}
            </span>

            {/* Last published */}
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
              {formatDistributionDate(item.lastPublishedAt)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
