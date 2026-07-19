"use client";

/**
 * components/marketing-studio/distribution/distribution-variant-gaps.tsx
 *
 * MS-14 — Variant gaps table: shows which required variant purposes are missing.
 */

import { C, T, S }               from "@/lib/ui/tokens";
import {
  getChannelLabel,
  getVariantPurposeLabel,
} from "@/lib/marketing-studio/distribution/distribution-display";
import type { VariantGapSummary } from "@/lib/marketing-studio/distribution/distribution-types";

interface Props {
  gaps: VariantGapSummary[];
}

export function DistributionVariantGaps({ gaps }: Props) {
  if (gaps.length === 0) {
    return (
      <div style={{ padding: `${S[4]}px 0` }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green }}>
          Sin gaps de variantes — cobertura completa
        </span>
      </div>
    );
  }

  const top = gaps.slice(0, 12);

  return (
    <div className="ag-op-table">
      {/* Header */}
      <div className="ag-op-row" style={{ background: C.surfaceAlt }}>
        {["Canal", "Propósito", "Obligatorio", "Faltantes", "Impacto"].map(h => (
          <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, fontWeight: 600 }}>
            {h}
          </span>
        ))}
      </div>

      {top.map((gap, i) => {
        const severityColor = gap.missingCount >= 10 ? C.red : gap.missingCount >= 5 ? C.amber : C.inkMid;

        return (
          <div key={`${gap.channel}-${gap.purpose}-${i}`} className="ag-op-row">
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>
              {getChannelLabel(gap.channel)}
            </span>

            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
              {getVariantPurposeLabel(gap.purpose)}
            </span>

            <span className={`ag-op-status ag-op-status--${gap.required ? "warning" : "default"}`}>
              {gap.required ? "Sí" : "No"}
            </span>

            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: severityColor }}>
              {gap.missingCount}
            </span>

            {/* Impact bar */}
            <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
              <div style={{ width: 60, height: 4, background: C.lineSubtle, borderRadius: 2, overflow: "hidden" }}>
                <div style={{
                  width:        `${Math.min((gap.missingCount / 20) * 100, 100)}%`,
                  height:       "100%",
                  background:   severityColor,
                  borderRadius: 2,
                }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
