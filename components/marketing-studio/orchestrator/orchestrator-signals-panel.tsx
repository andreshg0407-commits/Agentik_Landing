"use client";

/**
 * components/marketing-studio/orchestrator/orchestrator-signals-panel.tsx
 *
 * MS-17 — Orchestrator Runtime: Luca + Mila operational intelligence panel
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import {
  getRecommendationSourceLabel,
  getRecommendationSourceColor,
} from "@/lib/marketing-studio/orchestrator/orchestrator-display";
import type { OrchestratorRecommendation } from "@/lib/marketing-studio/orchestrator/orchestrator-types";

interface Props {
  recommendations: OrchestratorRecommendation[];
}

function RecommendationCard({ rec }: { rec: OrchestratorRecommendation }) {
  const sourceColor = getRecommendationSourceColor(rec.source);
  const priorityColor = rec.priority === "high" ? C.red : rec.priority === "medium" ? C.amber : C.blue;

  return (
    <div className="ag-tcard" style={{
      border:       `1px solid ${C.line}`,
      borderLeft:   `3px solid ${sourceColor}`,
      borderRadius: R.md,
      background:   C.white,
      padding:      `${S[3]}px ${S[4]}px`,
      display:      "flex",
      flexDirection: "column",
      gap:           S[2],
    }}>
      {/* Source + priority */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: sourceColor, fontWeight: 700 }}>
          {getRecommendationSourceLabel(rec.source)}
        </span>
        <span style={{
          fontFamily:   T.mono, fontSize: T.sz["2xs"], fontWeight: 700,
          color:        priorityColor,
          background:   `${priorityColor}18`,
          borderRadius: R.xs, padding: "1px 5px",
        }}>
          {rec.priority.toUpperCase()}
        </span>
      </div>

      {/* Title */}
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700, color: C.ink, lineHeight: 1.4 }}>
        {rec.title}
      </span>

      {/* Description */}
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, lineHeight: 1.5 }}>
        {rec.description}
      </span>

      {/* Action */}
      {rec.action && (
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{
            fontFamily:   T.mono, fontSize: T.sz.xs, fontWeight: 600,
            color:        sourceColor, background: `${sourceColor}12`,
            borderRadius: R.xs, padding: `${S[1]}px ${S[2]}px`,
            border:       `1px solid ${sourceColor}30`,
            cursor:       "default",
          }}>
            → {rec.action}
          </span>
        </div>
      )}
    </div>
  );
}

export function OrchestratorSignalsPanel({ recommendations }: Props) {
  const luca = recommendations.filter(r => r.source === "luca");
  const mila = recommendations.filter(r => r.source === "mila");

  if (recommendations.length === 0) {
    return (
      <div style={{
        padding:      `${S[8]}px`,
        textAlign:    "center",
        fontFamily:   T.mono,
        fontSize:     T.sz.sm,
        color:        C.green,
        background:   C.greenLight,
        border:       `1px solid ${C.greenBorder}`,
        borderRadius: R.md,
      }}>
        ✓ Sin señales operativas pendientes
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[5], alignItems: "start" }}>
      {/* Luca column */}
      <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
        <div style={{
          fontFamily:    T.mono, fontSize: T.sz.xs, fontWeight: 700,
          color:         C.blueDark,
          borderBottom:  `2px solid ${C.blueDark}`,
          paddingBottom: S[2], marginBottom: S[1],
        }}>
          Luca · Análisis Comercial
          <span style={{ fontWeight: 400, color: C.inkLight, marginLeft: S[2] }}>
            {luca.length} señal{luca.length !== 1 ? "es" : ""}
          </span>
        </div>
        {luca.length > 0
          ? luca.map(r => <RecommendationCard key={r.id} rec={r} />)
          : (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              Sin señales comerciales activas
            </span>
          )
        }
      </div>

      {/* Mila column */}
      <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
        <div style={{
          fontFamily:    T.mono, fontSize: T.sz.xs, fontWeight: 700,
          color:         C.brand,
          borderBottom:  `2px solid ${C.brand}`,
          paddingBottom: S[2], marginBottom: S[1],
        }}>
          Mila · Inteligencia Creativa
          <span style={{ fontWeight: 400, color: C.inkLight, marginLeft: S[2] }}>
            {mila.length} señal{mila.length !== 1 ? "es" : ""}
          </span>
        </div>
        {mila.length > 0
          ? mila.map(r => <RecommendationCard key={r.id} rec={r} />)
          : (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              Sin señales creativas activas
            </span>
          )
        }
      </div>
    </div>
  );
}
