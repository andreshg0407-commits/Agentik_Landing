/**
 * components/agentik/agent-execution-layer.tsx
 *
 * Sprint: AGENTIK-EXECUTION-LAYER-01
 *
 * Agentik Execution Layer — "qué está ocurriendo AHORA dentro del sistema operativo IA"
 *
 * 4 sections:
 *   1. Actividad operacional viva   — activeExecutions
 *   2. Incidentes activos           — incidents (if any)
 *   3. Ejecuciones recientes        — recentExecutions (compact timeline, max 5)
 *   4. Coordinación entre agentes   — coordination
 *
 * Server Component — pure display, zero client state.
 * Accepts any CopilotAgent — zero agent-specific hardcoding.
 */

import { C, T, S, R, E } from "@/lib/ui/tokens";
import type {
  CopilotAgent,
  AgentExecutionEvent,
  AgentCoordinationEvent,
  ExecutionState,
  ExecutionSeverity,
} from "@/lib/copilot/agents";

// ── Visual config ──────────────────────────────────────────────────────────────

const STATE_CFG: Record<ExecutionState, {
  dot:    string;
  badge:  string;
  bdg_bg: string;
  bdg_br: string;
  label:  string;
}> = {
  running:   { dot: "#2563eb", badge: "#1e3a8a", bdg_bg: "#eff6ff", bdg_br: "#bfdbfe", label: "EJECUTANDO"  },
  waiting:   { dot: "#d97706", badge: "#78350f", bdg_bg: "#fffbeb", bdg_br: "#fde68a", label: "EN ESPERA"   },
  completed: { dot: "#16a34a", badge: "#166534", bdg_bg: "#f0fdf4", bdg_br: "#bbf7d0", label: "COMPLETADO"  },
  degraded:  { dot: "#d97706", badge: "#78350f", bdg_bg: "#fffbeb", bdg_br: "#fde68a", label: "DEGRADADO"   },
  blocked:   { dot: "#dc2626", badge: "#7f1d1d", bdg_bg: "#fef2f2", bdg_br: "#fecaca", label: "BLOQUEADO"   },
};

const SEV_CFG: Record<ExecutionSeverity, {
  bar:   string;
  bg:    string;
  bdr:   string;
}> = {
  normal:   { bar: "transparent", bg: "transparent", bdr: "transparent" },
  warning:  { bar: "#d97706",     bg: "#fffbeb",      bdr: "#fde68a"     },
  critical: { bar: "#dc2626",     bg: "#fef2f2",      bdr: "#fecaca"     },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ label, count }: { label: string; count?: number }) {
  return (
    <div style={{
      display:       "flex",
      alignItems:    "center",
      gap:           S[2],
      marginBottom:  S[3],
    }}>
      <span style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        fontWeight:    T.wt.semibold,
        letterSpacing: "0.09em",
        textTransform: "uppercase" as const,
        color:         C.inkFaint,
      }}>
        {label}
      </span>
      {count !== undefined && count > 0 && (
        <span style={{
          fontFamily:    T.mono,
          fontSize:      9,
          fontWeight:    T.wt.semibold,
          color:         C.inkGhost,
          background:    C.surface,
          border:        `1px solid ${C.line}`,
          borderRadius:  R.pill,
          padding:       "1px 6px",
          lineHeight:    1.5,
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

function StateDot({ state, pulse }: { state: ExecutionState; pulse?: boolean }) {
  const cfg = STATE_CFG[state];
  return (
    <span style={{
      display:      "inline-block",
      width:        7,
      height:       7,
      borderRadius: "50%",
      background:   cfg.dot,
      flexShrink:   0,
      marginTop:    1,
      opacity:      pulse ? 0.9 : 1,
    }} />
  );
}

function StateBadge({ state, compact }: { state: ExecutionState; compact?: boolean }) {
  const cfg = STATE_CFG[state];
  return (
    <span style={{
      fontFamily:    T.mono,
      fontSize:      compact ? 8 : 9,
      fontWeight:    T.wt.semibold,
      letterSpacing: "0.10em",
      color:         cfg.badge,
      background:    cfg.bdg_bg,
      border:        `1px solid ${cfg.bdg_br}`,
      borderRadius:  R.sm,
      padding:       compact ? "1px 4px" : "1px 5px",
      whiteSpace:    "nowrap" as const,
    }}>
      {cfg.label}
    </span>
  );
}

function SystemChip({ label }: { label: string }) {
  return (
    <span style={{
      fontFamily:    T.mono,
      fontSize:      9,
      color:         C.inkLight,
      background:    C.surface,
      border:        `1px solid ${C.line}`,
      borderRadius:  R.sm,
      padding:       "1px 5px",
      whiteSpace:    "nowrap" as const,
    }}>
      {label}
    </span>
  );
}

// ── Section 1: Actividad operacional viva ────────────────────────────────────

function ActiveExecutionCard({ event, accentColor }: {
  event:       AgentExecutionEvent;
  accentColor: string;
}) {
  const sev = SEV_CFG[event.severity];
  const hasAccent = event.severity !== "normal";

  return (
    <div style={{
      display:      "flex",
      gap:          S[3],
      padding:      `${S[3] + 1}px ${S[4]}px`,
      background:   hasAccent ? sev.bg : C.white,
      borderLeft:   `3px solid ${hasAccent ? sev.bar : accentColor}`,
      borderBottom: `1px solid ${C.lineSubtle}`,
      position:     "relative" as const,
    }}>
      {/* Dot column */}
      <div style={{ paddingTop: 3, flexShrink: 0 }}>
        <StateDot state={event.state} pulse />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title row */}
        <div style={{
          display:    "flex",
          alignItems: "center",
          gap:        S[2],
          flexWrap:   "wrap" as const,
          marginBottom: S[1],
        }}>
          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.sm,
            fontWeight:  T.wt.semibold,
            color:       C.ink,
            lineHeight:  1.35,
          }}>
            {event.title}
          </span>
          <StateBadge state={event.state} />
          {event.requiresAttention && (
            <span style={{
              fontFamily:    T.mono,
              fontSize:      9,
              fontWeight:    T.wt.semibold,
              letterSpacing: "0.08em",
              color:         "#92400e",
              background:    "#fffbeb",
              border:        "1px solid #fcd34d",
              borderRadius:  R.sm,
              padding:       "1px 5px",
            }}>
              REQUIERE ATENCIÓN
            </span>
          )}
        </div>

        {/* Description */}
        <p style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          color:        C.inkMid,
          lineHeight:   1.6,
          margin:       0,
          marginBottom: event.systems?.length ? S[2] : 0,
        }}>
          {event.description}
        </p>

        {/* Systems + timestamp */}
        {(event.systems?.length || event.workflow) && (
          <div style={{
            display:    "flex",
            alignItems: "center",
            gap:        S[1],
            flexWrap:   "wrap" as const,
            marginTop:  S[1] + 1,
          }}>
            {event.workflow && (
              <span style={{
                fontFamily:    T.mono,
                fontSize:      9,
                color:         accentColor,
                letterSpacing: "0.04em",
                opacity:       0.8,
              }}>
                {event.workflow}
              </span>
            )}
            {event.workflow && event.systems?.length && (
              <span style={{ color: C.inkGhost, fontSize: 9 }}>·</span>
            )}
            {event.systems?.map((s) => (
              <SystemChip key={s} label={s} />
            ))}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <span style={{
        fontFamily:    T.mono,
        fontSize:      9,
        color:         C.inkGhost,
        letterSpacing: "0.04em",
        flexShrink:    0,
        paddingTop:    3,
        whiteSpace:    "nowrap" as const,
      }}>
        {event.timestamp}
      </span>
    </div>
  );
}

// ── Section 2: Incidentes activos ─────────────────────────────────────────────

function IncidentCard({ event }: { event: AgentExecutionEvent }) {
  const sev = SEV_CFG[event.severity];
  const isCritical = event.severity === "critical";

  return (
    <div style={{
      display:      "flex",
      gap:          S[3],
      padding:      `${S[3]}px ${S[4]}px`,
      background:   sev.bg,
      borderLeft:   `3px solid ${sev.bar}`,
      borderBottom: `1px solid ${sev.bdr}`,
    }}>
      {/* Severity bar + dot */}
      <div style={{ paddingTop: 3, flexShrink: 0 }}>
        <StateDot state={event.state} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title */}
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          S[2],
          flexWrap:     "wrap" as const,
          marginBottom: S[1],
        }}>
          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.sm,
            fontWeight:  T.wt.semibold,
            color:       isCritical ? "#7f1d1d" : "#92400e",
            lineHeight:  1.35,
          }}>
            {event.title}
          </span>
          <StateBadge state={event.state} />
          {event.requiresAttention && (
            <span style={{
              fontFamily:    T.mono,
              fontSize:      9,
              fontWeight:    T.wt.semibold,
              letterSpacing: "0.08em",
              color:         isCritical ? "#7f1d1d" : "#92400e",
              background:    isCritical ? "#fef2f2" : "#fffbeb",
              border:        `1px solid ${isCritical ? "#fca5a5" : "#fcd34d"}`,
              borderRadius:  R.sm,
              padding:       "1px 5px",
            }}>
              ACCIÓN REQUERIDA
            </span>
          )}
        </div>

        {/* Description */}
        <p style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          color:        C.inkMid,
          lineHeight:   1.6,
          margin:       0,
          marginBottom: event.systems?.length || event.workflow ? S[2] : 0,
        }}>
          {event.description}
        </p>

        {/* Metadata */}
        {(event.systems?.length || event.workflow) && (
          <div style={{
            display:    "flex",
            alignItems: "center",
            gap:        S[1],
            flexWrap:   "wrap" as const,
            marginTop:  S[1],
          }}>
            {event.workflow && (
              <span style={{
                fontFamily:    T.mono,
                fontSize:      9,
                color:         isCritical ? "#991b1b" : "#b45309",
                letterSpacing: "0.04em",
                opacity:       0.75,
              }}>
                {event.workflow}
              </span>
            )}
            {event.systems?.map((s) => (
              <SystemChip key={s} label={s} />
            ))}
          </div>
        )}
      </div>

      <span style={{
        fontFamily:    T.mono,
        fontSize:      9,
        color:         C.inkGhost,
        letterSpacing: "0.04em",
        flexShrink:    0,
        paddingTop:    3,
        whiteSpace:    "nowrap" as const,
      }}>
        {event.timestamp}
      </span>
    </div>
  );
}

// ── Section 3: Ejecuciones recientes (compact timeline) ───────────────────────

function RecentExecutionRow({ event, isLast }: {
  event:  AgentExecutionEvent;
  isLast: boolean;
}) {
  const cfg = STATE_CFG[event.state];

  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:          S[2],
      padding:      `6px ${S[4]}px`,
      borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
    }}>
      {/* Timestamp */}
      <span style={{
        fontFamily:    T.mono,
        fontSize:      8,
        color:         C.inkGhost,
        letterSpacing: "0.05em",
        minWidth:      34,
        flexShrink:    0,
        paddingTop:    3,
        lineHeight:    1,
      }}>
        {event.timestamp}
      </span>

      {/* Dot */}
      <div style={{ paddingTop: 5, flexShrink: 0 }}>
        <span style={{
          display:      "inline-block",
          width:        5,
          height:       5,
          borderRadius: "50%",
          background:   cfg.dot,
          opacity:      0.8,
        }} />
      </div>

      {/* Title + description */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.xs,
          fontWeight:  T.wt.medium,
          color:       event.severity === "normal" ? C.ink : (event.severity === "critical" ? "#7f1d1d" : "#92400e"),
          lineHeight:  1.35,
          display:     "block",
        }}>
          {event.title}
        </span>
        <span style={{
          fontFamily:  T.mono,
          fontSize:    9,
          color:       C.inkLight,
          lineHeight:  1.5,
          display:     "block",
          marginTop:   1,
        }}>
          {event.description}
        </span>
      </div>

      {/* State dot + compact badge */}
      <StateBadge state={event.state} compact />
    </div>
  );
}

// ── Section 4: Coordinación entre agentes ─────────────────────────────────────

function CoordinationRow({ event, isLast }: {
  event:  AgentCoordinationEvent;
  isLast: boolean;
}) {
  return (
    <div style={{
      display:      "flex",
      flexDirection: "column" as const,
      gap:          4,
      padding:      `${S[3]}px ${S[4]}px`,
      borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
    }}>
      {/* Handoff header: AgentA → AgentB · timestamp */}
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:        S[1],
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.semibold,
          color:         C.blueDark,
          lineHeight:    1,
          letterSpacing: "0.02em",
        }}>
          {event.fromAgent}
        </span>
        <span style={{
          fontFamily:  T.mono,
          fontSize:    10,
          color:       C.inkGhost,
          lineHeight:  1,
          margin:      "0 1px",
        }}>
          →
        </span>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.semibold,
          color:         C.ink,
          lineHeight:    1,
          letterSpacing: "0.02em",
        }}>
          {event.toAgent}
        </span>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      9,
          color:         C.inkGhost,
          letterSpacing: "0.04em",
          marginLeft:    "auto",
          whiteSpace:    "nowrap" as const,
        }}>
          {event.timestamp}
        </span>
      </div>

      {/* Description */}
      <span style={{
        fontFamily:  T.mono,
        fontSize:    T.sz.xs,
        color:       C.inkMid,
        lineHeight:  1.55,
      }}>
        {event.description}
      </span>
    </div>
  );
}

// ── Card wrapper ───────────────────────────────────────────────────────────────

function ExecutionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: R.card,
      overflow:     "hidden",
      boxShadow:    E.xs,
    }}>
      {children}
    </div>
  );
}

function CardHeader({ label, count, accentColor }: {
  label:       string;
  count?:      number;
  accentColor: string;
}) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          S[2],
      padding:      `${S[2] + 1}px ${S[4]}px`,
      background:   "#F8FAFC",
      borderBottom: `1px solid ${C.lineSubtle}`,
    }}>
      <span style={{
        width:        3,
        height:       14,
        background:   accentColor,
        borderRadius: 2,
        display:      "inline-block",
        flexShrink:   0,
        opacity:      0.6,
      }} />
      <span style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        fontWeight:    T.wt.semibold,
        letterSpacing: "0.09em",
        textTransform: "uppercase" as const,
        color:         C.inkFaint,
      }}>
        {label}
      </span>
      {count !== undefined && (
        <span style={{
          fontFamily:    T.mono,
          fontSize:      9,
          color:         C.inkGhost,
          background:    C.surface,
          border:        `1px solid ${C.line}`,
          borderRadius:  R.pill,
          padding:       "1px 6px",
          lineHeight:    1.5,
          marginLeft:    "auto",
        }}>
          {count}
        </span>
      )}
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────────

export function AgentExecutionLayer({ agent }: { agent: CopilotAgent }) {
  const { activeExecutions, recentExecutions, incidents, coordination } =
    agent.executionSystem;

  const visibleRecent = recentExecutions.slice(0, 5);
  const hasIncidents  = incidents.length > 0;

  return (
    <div style={{
      display:       "flex",
      flexDirection: "column" as const,
      gap:           S[4],
      marginTop:     S[5],
    }}>
      {/* ── Section header ─────────────────────────────────────────────────── */}
      <div style={{
        display:       "flex",
        alignItems:    "center",
        gap:           S[2],
        paddingBottom: S[2],
        borderBottom:  `1px solid ${C.lineSubtle}`,
      }}>
        <span style={{
          width:        3,
          height:       16,
          background:   agent.accentColor,
          borderRadius: 2,
          display:      "inline-block",
          opacity:      0.55,
        }} />
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          fontWeight:    T.wt.semibold,
          letterSpacing: "0.09em",
          textTransform: "uppercase" as const,
          color:         C.inkFaint,
        }}>
          Pulso operacional
        </span>
        {/* Live pulse indicator */}
        <div style={{
          display:    "flex",
          alignItems: "center",
          gap:        S[1],
          marginLeft: "auto",
        }}>
          <span style={{
            display:      "inline-block",
            width:        6,
            height:       6,
            borderRadius: "50%",
            background:   activeExecutions.length > 0 ? "#16a34a" : C.inkGhost,
          }} />
          <span style={{
            fontFamily:    T.mono,
            fontSize:      9,
            color:         activeExecutions.length > 0 ? "#166534" : C.inkGhost,
            letterSpacing: "0.06em",
          }}>
            {activeExecutions.length > 0 ? `${activeExecutions.length} operación${activeExecutions.length > 1 ? "es" : ""} activa${activeExecutions.length > 1 ? "s" : ""}` : "Sin ejecuciones activas"}
          </span>
        </div>
      </div>

      {/* ── 1. Actividad operacional viva ─────────────────────────────────── */}
      {activeExecutions.length > 0 && (
        <ExecutionCard>
          <CardHeader
            label="Actividad operacional viva"
            count={activeExecutions.length}
            accentColor={agent.accentColor}
          />
          {activeExecutions.map((event, i) => (
            <ActiveExecutionCard
              key={event.id}
              event={event}
              accentColor={agent.accentColor}
            />
          ))}
        </ExecutionCard>
      )}

      {/* ── 2. Incidentes activos ─────────────────────────────────────────── */}
      {hasIncidents && (
        <ExecutionCard>
          <CardHeader
            label="Incidentes activos"
            count={incidents.length}
            accentColor="#d97706"
          />
          {incidents.map((event, i) => (
            <IncidentCard
              key={event.id}
              event={event}
            />
          ))}
        </ExecutionCard>
      )}

      {/* ── 3 + 4 side-by-side on wide screens, stacked on narrow ─────────── */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "7fr 5fr",
        gap:                 S[4],
      }}>
        {/* ── 3. Ejecuciones recientes ─────────────────────────────────────── */}
        <ExecutionCard>
          <CardHeader
            label="Ejecuciones recientes"
            count={visibleRecent.length}
            accentColor={agent.accentColor}
          />
          {visibleRecent.map((event, i) => (
            <RecentExecutionRow
              key={event.id}
              event={event}
              isLast={i === visibleRecent.length - 1}
            />
          ))}
        </ExecutionCard>

        {/* ── 4. Coordinación entre agentes ────────────────────────────────── */}
        <ExecutionCard>
          <CardHeader
            label="Coordinación entre agentes"
            count={coordination.length}
            accentColor={agent.accentColor}
          />
          {coordination.length === 0 ? (
            <div style={{
              padding:   `${S[6]}px ${S[4]}px`,
              textAlign: "center" as const,
            }}>
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      C.inkGhost,
              }}>
                Sin coordinación reciente
              </span>
            </div>
          ) : (
            coordination.map((event, i) => (
              <CoordinationRow
                key={i}
                event={event}
                isLast={i === coordination.length - 1}
              />
            ))
          )}
        </ExecutionCard>
      </div>
    </div>
  );
}
