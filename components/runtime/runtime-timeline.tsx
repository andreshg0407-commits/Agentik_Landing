"use client";

/**
 * components/runtime/runtime-timeline.tsx
 * Operational event timeline for the Approval Center.
 * Sprint: AGENTIK-AGENT-APPROVAL-CENTER-01
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import type { RuntimeTimelineEvent } from "@/lib/agent-runtime/action-envelope";

// ── Event type config ─────────────────────────────────────────────────────────

interface EventConfig {
  dot:   string;
  label: string;
}

const EVENT_CONFIG: Record<string, EventConfig> = {
  "action.pending_approval": { dot: C.amber,   label: "Propuesta"  },
  "action.approved":         { dot: C.blue,    label: "Aprobada"   },
  "action.rejected":         { dot: C.red,     label: "Rechazada"  },
  "action.executing":        { dot: C.blueDark, label: "Ejecutando" },
  "action.executed":         { dot: C.green,   label: "Ejecutada"  },
  "action.failed":           { dot: C.red,     label: "Fallida"    },
  "action.dismissed":        { dot: C.inkGhost, label: "Descartada" },
  "action.expired":          { dot: C.inkGhost, label: "Expirada"  },
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function agentLabel(agentId: string): string {
  const map: Record<string, string> = {
    david_commercial: "David",
    diego_finance:    "Diego",
    luca_marketing:   "Luca",
    mila_collections: "Mila",
    agentik_copilot:  "Agentik",
  };
  return map[agentId] ?? agentId;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  events:  RuntimeTimelineEvent[];
  loading: boolean;
}

export function RuntimeTimeline({ events, loading }: Props) {
  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: R.xl,
      overflow:     "hidden",
      boxShadow:    "0 1px 4px rgba(0,18,60,.06)",
    }}>
      {/* Header */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        `${S[3]}px ${S[4]}px`,
        borderBottom:   `1px solid ${C.line}`,
        background:     C.surface,
      }}>
        <div>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            Timeline Operacional
          </span>
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginLeft: S[2] }}>
            Runtime events — sesión actual
          </span>
        </div>
        {events.length > 0 && (
          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, background: C.surfaceAlt, border: `1px solid ${C.line}`, borderRadius: R.pill, padding: "1px 8px" }}>
            {events.length} evento{events.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Events */}
      <div style={{ maxHeight: 320, overflowY: "auto" as const }}>
        {loading && events.length === 0 ? (
          <div style={{ padding: `${S[6]}px`, textAlign: "center" as const }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint }}>Cargando eventos…</span>
          </div>
        ) : events.length === 0 ? (
          <div style={{ padding: `${S[8]}px ${S[4]}px`, textAlign: "center" as const }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.base, color: C.inkMid, marginBottom: S[2] }}>Sin eventos</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              Los eventos aparecerán cuando los agentes propongan o resuelvan acciones.
            </div>
          </div>
        ) : (
          events.slice(0, 50).map((ev, i) => {
            const cfg = EVENT_CONFIG[ev.eventType] ?? { dot: C.inkGhost, label: ev.eventType };
            const isLast = i === Math.min(events.length, 50) - 1;
            return (
              <div key={ev.id} style={{
                display:     "flex",
                gap:         S[3],
                padding:     `${S[2]}px ${S[4]}px`,
                borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
                alignItems:  "flex-start",
              }}>
                {/* Dot + line */}
                <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", paddingTop: 4, flexShrink: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
                  {!isLast && (
                    <div style={{ width: 1, flex: 1, background: C.lineSubtle, marginTop: 3, minHeight: 12 }} />
                  )}
                </div>
                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 1 }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: cfg.dot, fontWeight: T.wt.semibold, letterSpacing: "0.04em" }}>
                      {cfg.label.toUpperCase()}
                    </span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                      {agentLabel(ev.agentId)} · {ev.moduleKey}
                    </span>
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginBottom: 1 }}>
                    {ev.summary}
                  </div>
                  {ev.actionId && (
                    <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkGhost }}>
                      action={ev.actionId.slice(0, 16)}…
                    </div>
                  )}
                </div>
                {/* Timestamp */}
                <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkGhost, flexShrink: 0, paddingTop: 4 }}>
                  {fmtTime(ev.timestamp)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
