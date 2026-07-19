"use client";

/**
 * components/marketing-studio/orchestration/orchestration-signals.tsx
 *
 * MS-12 — Luca + Mila signal panels for the Orchestration Center.
 */

import { C, T, S } from "@/lib/ui/tokens";
import { EmptyOperationalState } from "@/components/shell/operational-primitives";
import { Panel, PanelHeader } from "@/components/shell/primitives";
import type { LucaCommerceSignal, MilaCommerceSignal } from "@/lib/marketing-studio/commerce/luca-commerce";
import { URGENCY_LABELS } from "@/lib/marketing-studio/orchestration/orchestration-display";
import type { OrchestrationRecommendedAction } from "@/lib/marketing-studio/orchestration/orchestration-types";
import { ACTION_TYPE_LABELS, URGENCY_VARIANT } from "@/lib/marketing-studio/orchestration/orchestration-display";

// ── Signal row ─────────────────────────────────────────────────────────────────

interface SignalRowProps {
  label:              string;
  detail:             string;
  urgency:            string;
  affectedCount?:     number;
  agentLabel:         string;
  recommendedAction?: string;
}

function SignalRow({ label, detail, urgency, affectedCount, agentLabel, recommendedAction }: SignalRowProps) {
  return (
    <div className={`ag-operation-signal ag-operation-signal--${urgency}`}>
      <div className="ag-operation-signal__urgency-bar" aria-hidden="true" />
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
          <span className="ag-operation-signal__label">{label}</span>
          {affectedCount !== undefined && (
            <span
              style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      C.inkFaint,
              }}
            >
              · {affectedCount}
            </span>
          )}
        </div>
        <div className="ag-operation-signal__detail">{detail}</div>
        {recommendedAction && (
          <div className="ag-operation-signal__action">
            → {recommendedAction}
          </div>
        )}
        <div
          style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      C.inkGhost,
            marginTop:  2,
          }}
        >
          {agentLabel}
        </div>
      </div>
    </div>
  );
}

// ── Luca signals panel ─────────────────────────────────────────────────────────

interface LucaSignalsPanelProps {
  signals: LucaCommerceSignal[];
}

export function LucaSignalsPanel({ signals }: LucaSignalsPanelProps) {
  const sorted = [...signals].sort((a, b) => {
    const order: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return (order[b.urgency] ?? 0) - (order[a.urgency] ?? 0);
  });

  return (
    <Panel>
      <PanelHeader
        title={
          <div style={{ display: "flex", width: "100%", alignItems: "center" }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>Luca · Recomendaciones operativas</span>
            {sorted.length > 0 && (
              <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>{sorted.length}</span>
            )}
          </div>
        }
      />

      {sorted.length === 0 ? (
        <EmptyOperationalState
          message="Sin señales activas"
          detail="Luca no detecta oportunidades ni problemas en este momento"
        />
      ) : (
        sorted.map(signal => (
          <SignalRow
            key={signal.key}
            label={signal.label}
            detail={signal.detail}
            urgency={signal.urgency}
            affectedCount={signal.affectedCount}
            agentLabel={signal.agentLabel}
            recommendedAction={signal.recommendedAction}
          />
        ))
      )}
    </Panel>
  );
}

// ── Mila signals panel ─────────────────────────────────────────────────────────

interface MilaSignalsPanelProps {
  signals: MilaCommerceSignal[];
}

export function MilaSignalsPanel({ signals }: MilaSignalsPanelProps) {
  const sorted = [...signals].sort((a, b) => {
    const order: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
    return (order[b.urgency] ?? 0) - (order[a.urgency] ?? 0);
  });

  return (
    <Panel>
      <PanelHeader
        title={
          <div style={{ display: "flex", width: "100%", alignItems: "center" }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>Mila · Alertas de comercio</span>
            {sorted.length > 0 && (
              <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>{sorted.length}</span>
            )}
          </div>
        }
      />

      {sorted.length === 0 ? (
        <EmptyOperationalState
          message="Sin alertas comerciales"
          detail="Mila no detecta problemas de comercio en este momento"
        />
      ) : (
        sorted.map(signal => (
          <SignalRow
            key={signal.key}
            label={signal.label}
            detail={signal.detail}
            urgency={signal.urgency}
            agentLabel={signal.agentLabel}
          />
        ))
      )}
    </Panel>
  );
}

// ── Action center panel ────────────────────────────────────────────────────────

interface ActionCenterProps {
  actions: OrchestrationRecommendedAction[];
}

export function OrchestrationActionCenter({ actions }: ActionCenterProps) {
  if (actions.length === 0) return null;

  return (
    <Panel>
      <PanelHeader
        title={
          <div style={{ display: "flex", width: "100%", alignItems: "center" }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 600, color: C.ink }}>Centro de Acción</span>
            <span style={{ marginLeft: "auto", fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
              {actions.length} acción{actions.length !== 1 ? "es" : ""}
            </span>
          </div>
        }
      />

      {actions.map(action => (
        <div key={action.key} className="ag-orchestration-job">
          <div
            className="ag-orchestration-job__icon"
            style={{
              background:
                action.urgency === "critical" ? C.redLight :
                action.urgency === "high"     ? C.amberLight :
                C.surfaceAlt,
              color:
                action.urgency === "critical" ? C.red :
                action.urgency === "high"     ? C.amber :
                C.inkMid,
            }}
          >
            {action.actionType === "publish" ? "↑" :
             action.actionType === "sync"    ? "↔" :
             action.actionType === "retry"   ? "↺" :
             action.actionType === "rebuild" ? "▦" : "•"}
          </div>

          <div className="ag-orchestration-job__body">
            <div className="ag-orchestration-job__label">{action.label}</div>
            <div className="ag-orchestration-job__meta">{action.detail}</div>
          </div>

          <div className="ag-orchestration-job__aside">
            <span className={`ag-op-status ag-op-status--${URGENCY_VARIANT[action.urgency] ?? "neutral"}`}
              style={{ fontSize: T.sz.xs }}
            >
              {URGENCY_LABELS[action.urgency] ?? action.urgency}
            </span>
            {action.affectedCount > 0 && (
              <span
                style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      C.inkFaint,
                }}
              >
                ×{action.affectedCount}
              </span>
            )}
          </div>
        </div>
      ))}
    </Panel>
  );
}
