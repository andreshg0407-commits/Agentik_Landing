"use client";

/**
 * components/marketing-studio/orchestrator/orchestrator-dependency-panel.tsx
 *
 * MS-17 — Orchestrator Runtime: Blocker/dependency panel
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import type { OrchestratorPlan, OrchestratorBlocker } from "@/lib/marketing-studio/orchestrator/orchestrator-types";

interface Props {
  plans: OrchestratorPlan[];
}

function BlockerRow({ blocker }: { blocker: OrchestratorBlocker & { planId: string } }) {
  const isError   = blocker.severity === "error";
  const isWarning = blocker.severity === "warning";

  const color = isError ? C.red : isWarning ? C.amber : C.blue;
  const bg    = isError ? C.redLight : isWarning ? C.amberLight : C.blueLight;
  const border = isError ? C.redBorder : isWarning ? C.amberBorder : C.blueBorder;

  return (
    <div className="ag-orchestrator-dependency" style={{
      display:        "grid",
      gridTemplateColumns: "80px 1fr auto",
      gap:            S[3],
      alignItems:     "start",
      padding:        `${S[2]}px ${S[4]}px`,
      borderBottom:   `1px solid ${C.lineSubtle}`,
      borderLeft:     `3px solid ${color}`,
    }}>
      {/* Severity */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{
          fontFamily:   T.mono, fontSize: T.sz["2xs"], fontWeight: 700,
          color, background: bg, border: `1px solid ${border}`,
          borderRadius: R.xs, padding: "1px 5px", textAlign: "center",
        }}>
          {blocker.severity.toUpperCase()}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkLight }}>
          {blocker.planId.slice(0, 6)}…
        </span>
      </div>

      {/* Description */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, fontWeight: 600 }}>
          {blocker.code}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, lineHeight: 1.4 }}>
          {blocker.description}
        </span>
      </div>

      {/* Auto-action hint */}
      {blocker.autoAction && (
        <span style={{
          fontFamily:   T.mono, fontSize: T.sz["2xs"], color: C.blueDark,
          background:   C.blueLight, border: `1px solid ${C.blueBorder}`,
          borderRadius: R.xs, padding: "2px 6px", whiteSpace: "nowrap", fontWeight: 600,
        }}>
          → {blocker.autoAction}
        </span>
      )}
    </div>
  );
}

export function OrchestratorDependencyPanel({ plans }: Props) {
  // Flatten all unresolved blockers across plans
  const allBlockers = plans.flatMap(p =>
    p.blockers
      .filter(b => !b.resolvedAt)
      .map(b => ({ ...b, planId: p.id }))
  );

  const errors   = allBlockers.filter(b => b.severity === "error");
  const warnings = allBlockers.filter(b => b.severity === "warning");
  const infos    = allBlockers.filter(b => b.severity === "info");

  if (allBlockers.length === 0) {
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
        ✓ Sin bloqueos ni dependencias pendientes
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
      {/* Summary chips */}
      <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
        {errors.length > 0 && (
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
            color: C.red, background: C.redLight, border: `1px solid ${C.redBorder}`,
            borderRadius: R.sm, padding: `${S[1]}px ${S[3]}px`,
          }}>
            {errors.length} error{errors.length > 1 ? "es" : ""}
          </span>
        )}
        {warnings.length > 0 && (
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
            color: C.amber, background: C.amberLight, border: `1px solid ${C.amberBorder}`,
            borderRadius: R.sm, padding: `${S[1]}px ${S[3]}px`,
          }}>
            {warnings.length} advertencia{warnings.length > 1 ? "s" : ""}
          </span>
        )}
        {infos.length > 0 && (
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700,
            color: C.blue, background: C.blueLight, border: `1px solid ${C.blueBorder}`,
            borderRadius: R.sm, padding: `${S[1]}px ${S[3]}px`,
          }}>
            {infos.length} info
          </span>
        )}
      </div>

      {/* Blocker table */}
      <div className="ag-op-table">
        <div className="ag-op-row" style={{
          display:    "grid",
          gridTemplateColumns: "80px 1fr auto",
          gap:        S[3],
          background: C.surfaceAlt,
          padding:    `${S[2]}px ${S[4]}px`,
        }}>
          {["Severidad", "Descripción", "Acción sugerida"].map((h, i) => (
            <span key={i} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {h}
            </span>
          ))}
        </div>
        {allBlockers.map(b => (
          <BlockerRow key={b.id} blocker={b} />
        ))}
      </div>
    </div>
  );
}
