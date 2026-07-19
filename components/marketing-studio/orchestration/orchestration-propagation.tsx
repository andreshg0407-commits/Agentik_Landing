"use client";

/**
 * components/marketing-studio/orchestration/orchestration-propagation.tsx
 *
 * MS-12 — Propagation impact alerts panel.
 */

import { C, T, S } from "@/lib/ui/tokens";
import { Panel, PanelHeader } from "@/components/shell/primitives";
import type { PropagationImpact } from "@/lib/marketing-studio/orchestration/orchestration-types";
import { PROPAGATION_CHANGE_TYPE } from "@/lib/marketing-studio/orchestration/orchestration-types";
import { JOB_TYPE_LABELS } from "@/lib/marketing-studio/orchestration/orchestration-display";

const CHANGE_TYPE_LABELS: Record<string, string> = {
  [PROPAGATION_CHANGE_TYPE.PRICE]:        "Precio",
  [PROPAGATION_CHANGE_TYPE.AVAILABILITY]: "Disponibilidad",
  [PROPAGATION_CHANGE_TYPE.VARIANTS]:     "Variantes",
  [PROPAGATION_CHANGE_TYPE.METADATA]:     "Metadatos",
  [PROPAGATION_CHANGE_TYPE.CATEGORY]:     "Categoría",
  [PROPAGATION_CHANGE_TYPE.ASSETS]:       "Recursos",
  [PROPAGATION_CHANGE_TYPE.READINESS]:    "Estado de preparación",
};

const SEVERITY_ICONS: Record<string, string> = {
  blocking: "!",
  warning:  "~",
  info:     "i",
};

interface Props {
  alerts: PropagationImpact[];
}

export function OrchestrationPropagationAlerts({ alerts }: Props) {
  if (alerts.length === 0) return null;

  const sorted = [...alerts].sort((a, b) => {
    const order: Record<string, number> = { blocking: 3, warning: 2, info: 1 };
    return (order[b.severity] ?? 0) - (order[a.severity] ?? 0);
  });

  return (
    <Panel>
      <PanelHeader
        title={
          <div style={{ display: "flex", width: "100%", alignItems: "center" }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>
              Alertas de Propagación
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      C.inkLight,
              }}
            >
              {sorted.length}
            </span>
          </div>
        }
      />

      {sorted.map((alert, i) => (
        <div
          key={`${alert.changeType}_${i}`}
          className={`ag-propagation-alert ag-propagation-alert--${alert.severity}`}
        >
          <div className="ag-propagation-alert__badge">
            {SEVERITY_ICONS[alert.severity] ?? "·"}
          </div>
          <div>
            <div className="ag-propagation-alert__label">
              {CHANGE_TYPE_LABELS[alert.changeType] ?? alert.changeType}
              {" · "}
              {alert.affectedProductIds.length} producto{alert.affectedProductIds.length !== 1 ? "s" : ""}
            </div>
            <div className="ag-propagation-alert__channels">
              Canales afectados: {alert.affectedDestinations.join(", ")}
            </div>
            <div
              style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      C.inkLight,
                marginTop:  2,
              }}
            >
              {alert.description}
            </div>
            {alert.jobsRequired.length > 0 && (
              <div
                style={{
                  display:   "flex",
                  gap:       S[1],
                  marginTop: S[1],
                  flexWrap:  "wrap",
                }}
              >
                {alert.jobsRequired.map(jt => (
                  <span
                    key={jt}
                    style={{
                      fontFamily:  T.mono,
                      fontSize:    T.sz["2xs"],
                      color:       C.inkMid,
                      background:  C.surfaceAlt,
                      padding:     `1px ${S[1]}px`,
                      borderRadius: 3,
                      border:      `1px solid ${C.line}`,
                    }}
                  >
                    {JOB_TYPE_LABELS[jt]}
                  </span>
                ))}
              </div>
            )}
          </div>
          <span className={`ag-op-status ag-op-status--${alert.severity === "blocking" ? "critical" : alert.severity === "warning" ? "warning" : "info"}`}
            style={{ fontSize: T.sz.xs, alignSelf: "flex-start" }}
          >
            {alert.severity}
          </span>
        </div>
      ))}
    </Panel>
  );
}
