/**
 * components/agentik/agent-workflows-tab.tsx
 *
 * Workflows Tab — Operational Execution Layer
 *
 * Sprint: AGENTIK-AGENT-WORKFLOWS-01
 *
 * Four sections:
 *   1. Workflows activos      — routines running autonomously today
 *   2. Workflows supervisados — running but requiring human review
 *   3. Línea operacional      — compact execution path per active workflow
 *   4. Workflows disponibles  — draft routines not yet activated
 *
 * NOT n8n. NOT Zapier. NOT a job console.
 * "Diego no solo sabe cosas. Diego ejecuta rutinas operacionales."
 *
 * "use client" for step expansion state.
 */

"use client";

import { useState } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type {
  CopilotAgent,
  AgentWorkflow,
  AgentWorkflowTrigger,
  AgentWorkflowStatus,
} from "@/lib/copilot/agents";

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_VISIBLE = 3;

// ── Trigger config ─────────────────────────────────────────────────────────────

const TRIGGER_CFG: Record<AgentWorkflowTrigger, { label: string; short: string }> = {
  scheduled:  { label: "Programado",  short: "CRON" },
  event:      { label: "Evento",      short: "EVT"  },
  manual:     { label: "Manual",      short: "MNL"  },
  threshold:  { label: "Umbral",      short: "THR"  },
  agent:      { label: "Agente",      short: "AGT"  },
};

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<AgentWorkflowStatus, {
  label: string; dot: string; text: string; bg: string; bdr: string;
}> = {
  active: {
    label: "Activo",  dot: "#16a34a", text: "#166534", bg: "#f0fdf4", bdr: "#86efac",
  },
  supervised: {
    label: "Supervisado", dot: "#c2410c", text: "#7c2d12", bg: "#fff7ed", bdr: "#fdba74",
  },
  paused: {
    label: "Pausado", dot: "#94a3b8", text: "#475569", bg: "#f8fafc", bdr: "#e2e8f0",
  },
  degraded: {
    label: "Degradado", dot: "#2563eb", text: "#1e3a8a", bg: "#eff6ff", bdr: "#93c5fd",
  },
  draft: {
    label: "No activo", dot: "#94a3b8", text: "#64748b", bg: "#f8fafc", bdr: "#e2e8f0",
  },
};

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({
  label, count, badge, badgeDot, badgeText, badgeBg, badgeBdr,
}: {
  label: string; count: number; badge: string;
  badgeDot: string; badgeText: string; badgeBg: string; badgeBdr: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      justifyContent: "space-between", marginBottom: S[2] + 2,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
          color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.09em",
        }}>
          {label}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>
          {count}
        </span>
      </div>
      <span style={{
        fontFamily: T.mono, fontSize: "10px", fontWeight: T.wt.semibold,
        color: badgeText, background: badgeBg, border: `1px solid ${badgeBdr}`,
        borderRadius: R.pill, padding: "2px 9px", letterSpacing: "0.03em",
        lineHeight: 1.6, display: "inline-flex", alignItems: "center", gap: 5,
      }}>
        <span style={{
          width: 4, height: 4, borderRadius: "50%",
          background: badgeDot, display: "inline-block", flexShrink: 0,
        }} />
        {badge}
      </span>
    </div>
  );
}

// ── Expand toggle ──────────────────────────────────────────────────────────────

function ExpandToggle({ hidden, onToggle }: { hidden: number; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{
      width: "100%", marginTop: 4, padding: "6px 0",
      background: "transparent", border: "none",
      borderTop: `1px solid ${C.lineSubtle}`,
      fontFamily: T.mono, fontSize: T.sz["2xs"],
      fontWeight: T.wt.semibold, color: C.inkGhost,
      cursor: "pointer", textAlign: "center" as const, letterSpacing: "0.05em",
    }}>
      {hidden > 0 ? `→ ver ${hidden} más` : "↑ contraer"}
    </button>
  );
}

// ── Workflow card ──────────────────────────────────────────────────────────────

function WorkflowCard({
  wf,
  accentColor,
  supervised = false,
}: {
  wf:          AgentWorkflow;
  accentColor: string;
  supervised?: boolean;
}) {
  const [stepsOpen, setStepsOpen] = useState(false);
  const st      = STATUS_CFG[wf.status];
  const trigger = TRIGGER_CFG[wf.trigger];
  const borderColor = supervised ? "#c2410c" : accentColor;

  return (
    <div style={{
      display:      "flex",
      gap:          S[3],
      padding:      `11px ${S[3]}px`,
      borderLeft:   `2px solid ${borderColor}${supervised ? "80" : "55"}`,
      background:   supervised ? "rgba(194,65,12,0.03)" : `${accentColor}04`,
      borderRadius: `0 ${R.xs}px ${R.xs}px 0`,
      marginBottom: 6,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Row 1: name + status + trigger */}
        <div style={{
          display: "flex", alignItems: "center", gap: S[2],
          flexWrap: "wrap" as const, marginBottom: 5,
        }}>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.sm,
            fontWeight: T.wt.semibold, color: C.ink, lineHeight: 1.2,
          }}>
            {wf.name}
          </span>

          {/* Status */}
          <span style={{
            fontFamily: T.mono, fontSize: "10px", fontWeight: T.wt.semibold,
            color: st.text, background: st.bg, border: `1px solid ${st.bdr}`,
            borderRadius: R.pill, padding: "1px 7px", letterSpacing: "0.04em",
            lineHeight: 1.7, display: "inline-flex", alignItems: "center",
            gap: 4, whiteSpace: "nowrap" as const,
          }}>
            <span style={{
              width: 4, height: 4, borderRadius: "50%",
              background: st.dot, display: "inline-block", flexShrink: 0,
            }} />
            {st.label}
          </span>

          {/* Trigger type */}
          <span style={{
            fontFamily: T.mono, fontSize: "10px", fontWeight: T.wt.semibold,
            color: C.inkFaint, background: C.white,
            border: `1px solid ${C.line}`, borderRadius: R.xs,
            padding: "1px 6px", lineHeight: 1.7, letterSpacing: "0.05em",
            whiteSpace: "nowrap" as const,
          }}>
            {trigger.short}
          </span>
        </div>

        {/* Row 2: description */}
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs,
          color: C.inkMid, lineHeight: 1.5, marginBottom: 6,
        }}>
          {wf.description}
        </div>

        {/* Row 3: supervision note for supervised */}
        {supervised && wf.supervisionRequired && (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: "#92400e",
            lineHeight: 1.5, marginBottom: 7,
            borderLeft: "2px solid #fdba74", paddingLeft: 8,
            background: "rgba(253,186,116,0.08)",
            borderRadius: `0 ${R.xs}px ${R.xs}px 0`, padding: "4px 8px",
          }}>
            {wf.supervisionRequired}
          </div>
        )}

        {/* Row 4: metadata strip — cadence + last run + next run */}
        <div style={{
          display: "flex", flexWrap: "wrap" as const,
          gap: "2px 14px", marginBottom: 6, alignItems: "center",
        }}>
          {[
            `${trigger.label} · ${wf.cadence}`,
            `Última ejecución · ${wf.lastRun}`,
            wf.nextRun ? `Próxima · ${wf.nextRun}` : null,
          ].filter(Boolean).map(item => (
            <span key={item as string} style={{
              fontFamily: T.mono, fontSize: "10px",
              color: C.inkFaint, lineHeight: 1.6,
            }}>
              {item}
            </span>
          ))}
        </div>

        {/* Row 5: operational impact */}
        <div style={{
          fontFamily: T.mono, fontSize: "10px",
          color: supervised ? "#b45309" : C.inkMid,
          fontStyle: "italic", lineHeight: 1.5, marginBottom: 7,
          letterSpacing: "0.01em",
        }}>
          ◆ {wf.operationalImpact}
        </div>

        {/* Row 6: systems + produces chips */}
        <div style={{
          display: "flex", flexWrap: "wrap" as const,
          gap: 4, alignItems: "center", marginBottom: stepsOpen ? 10 : 0,
        }}>
          <span style={{
            fontFamily: T.mono, fontSize: "10px", color: C.inkGhost,
            textTransform: "uppercase" as const, letterSpacing: "0.07em", marginRight: 2,
          }}>
            Toca
          </span>
          {wf.touchedSystems.map(s => (
            <span key={s} style={{
              fontFamily: T.mono, fontSize: "10px", color: C.inkMid,
              background: C.white, border: `1px solid ${C.line}`,
              borderRadius: R.xs, padding: "0px 5px", lineHeight: 1.7,
            }}>
              {s}
            </span>
          ))}

          <span style={{
            width: 1, height: 10, background: C.lineSubtle,
            margin: "0 4px", flexShrink: 0,
          }} />

          <span style={{
            fontFamily: T.mono, fontSize: "10px", color: C.inkGhost,
            textTransform: "uppercase" as const, letterSpacing: "0.07em", marginRight: 2,
          }}>
            Produce
          </span>
          {wf.produces.map(p => (
            <span key={p} style={{
              fontFamily: T.mono, fontSize: "10px",
              color: accentColor, background: `${accentColor}0C`,
              border: `1px solid ${accentColor}20`,
              borderRadius: R.xs, padding: "0px 5px", lineHeight: 1.7,
            }}>
              {p}
            </span>
          ))}
        </div>

        {/* Steps — collapsible */}
        {wf.steps.length > 0 && (
          <>
            <button
              onClick={() => setStepsOpen(v => !v)}
              style={{
                background: "transparent", border: "none",
                fontFamily: T.mono, fontSize: "10px",
                color: `${accentColor}80`, cursor: "pointer",
                padding: "4px 0 0", letterSpacing: "0.04em",
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <span style={{ fontSize: "8px" }}>{stepsOpen ? "▲" : "▼"}</span>
              {stepsOpen ? "Ocultar pasos" : `Ver ${wf.steps.length} pasos de ejecución`}
            </button>

            {stepsOpen && (
              <div style={{
                marginTop: 8,
                paddingLeft: S[2],
                borderLeft: `1px solid ${accentColor}25`,
                display: "flex",
                flexDirection: "column" as const,
                gap: 6,
              }}>
                {wf.steps.map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    {/* Step number */}
                    <div style={{
                      width: 16, height: 16, borderRadius: "50%",
                      background: `${accentColor}10`, border: `1px solid ${accentColor}20`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, marginTop: 1,
                    }}>
                      <span style={{
                        fontFamily: T.mono, fontSize: "8px",
                        fontWeight: T.wt.black, color: accentColor, lineHeight: 1,
                      }}>
                        {i + 1}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6,
                        marginBottom: 2, flexWrap: "wrap" as const,
                      }}>
                        <span style={{
                          fontFamily: T.mono, fontSize: "10px",
                          fontWeight: T.wt.semibold, color: C.ink,
                        }}>
                          {step.title}
                        </span>
                        {step.system && (
                          <span style={{
                            fontFamily: T.mono, fontSize: "9px",
                            color: `${accentColor}70`, background: `${accentColor}08`,
                            border: `1px solid ${accentColor}15`,
                            borderRadius: R.xs, padding: "0px 4px", lineHeight: 1.7,
                          }}>
                            {step.system}
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontFamily: T.mono, fontSize: "10px",
                        color: C.inkFaint, lineHeight: 1.5,
                      }}>
                        {step.description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}

// ── Execution path strip ───────────────────────────────────────────────────────

function ExecutionPathStrip({
  wf,
  accentColor,
}: {
  wf:          AgentWorkflow;
  accentColor: string;
}) {
  const trigger = TRIGGER_CFG[wf.trigger];

  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        6,
      padding:    `7px ${S[3]}px`,
      borderBottom: `1px solid ${C.lineSubtle}`,
      flexWrap:   "wrap" as const,
    }}>
      {/* Trigger pill */}
      <span style={{
        fontFamily:    T.mono,
        fontSize:      "9px",
        fontWeight:    T.wt.black,
        color:         accentColor,
        background:    `${accentColor}0C`,
        border:        `1px solid ${accentColor}20`,
        borderRadius:  R.xs,
        padding:       "1px 6px",
        letterSpacing: "0.06em",
        lineHeight:    1.7,
        whiteSpace:    "nowrap" as const,
        flexShrink:    0,
      }}>
        {trigger.short}
      </span>

      {/* Connector */}
      <span style={{
        fontFamily: T.mono, fontSize: "10px",
        color: C.inkGhost, flexShrink: 0,
      }}>→</span>

      {/* Workflow name */}
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs,
        fontWeight: T.wt.semibold, color: C.ink,
        whiteSpace: "nowrap" as const, flexShrink: 0,
      }}>
        {wf.name}
      </span>

      {/* Connector */}
      <span style={{
        fontFamily: T.mono, fontSize: "10px",
        color: C.inkGhost, flexShrink: 0,
      }}>→</span>

      {/* Systems (compact) */}
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" as const }}>
        {wf.touchedSystems.slice(0, 3).map(s => (
          <span key={s} style={{
            fontFamily: T.mono, fontSize: "9px",
            color: C.inkMid, background: C.white,
            border: `1px solid ${C.line}`, borderRadius: R.xs,
            padding: "0px 5px", lineHeight: 1.7,
          }}>
            {s}
          </span>
        ))}
        {wf.touchedSystems.length > 3 && (
          <span style={{
            fontFamily: T.mono, fontSize: "9px",
            color: C.inkGhost, lineHeight: 1.7,
          }}>
            +{wf.touchedSystems.length - 3}
          </span>
        )}
      </div>

      {/* Connector */}
      <span style={{
        fontFamily: T.mono, fontSize: "10px",
        color: C.inkGhost, flexShrink: 0,
      }}>→</span>

      {/* First output */}
      <span style={{
        fontFamily: T.mono, fontSize: "9px",
        color: accentColor, background: `${accentColor}0C`,
        border: `1px solid ${accentColor}20`,
        borderRadius: R.xs, padding: "0px 5px", lineHeight: 1.7,
        whiteSpace: "nowrap" as const, flexShrink: 0,
      }}>
        {wf.produces[0]}
      </span>

      {/* Cadence — far right */}
      <span style={{
        fontFamily: T.mono, fontSize: "10px",
        color: C.inkGhost, marginLeft: "auto",
        whiteSpace: "nowrap" as const, flexShrink: 0,
      }}>
        {wf.cadence}
      </span>
    </div>
  );
}

// ── Available workflow card ────────────────────────────────────────────────────

function AvailableWorkflowCard({
  wf,
  accentColor,
  index,
}: {
  wf:          AgentWorkflow;
  accentColor: string;
  index:       number;
}) {
  return (
    <div style={{
      background:    "linear-gradient(180deg, #ffffff 0%, #fafbfd 100%)",
      border:        "1px solid #e8edf5",
      borderRadius:  R.card,
      borderTop:     `2px solid ${accentColor}25`,
      boxShadow:     "0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,74,173,0.025)",
      padding:       `${S[3]}px ${S[3]}px ${S[2]}px`,
      display:       "flex",
      flexDirection: "column" as const,
      gap:           10,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: S[2] }}>
        <div>
          <span style={{
            fontFamily: T.mono, fontSize: "10px", fontWeight: T.wt.semibold,
            color: `${accentColor}70`, letterSpacing: "0.1em",
            textTransform: "uppercase" as const, marginBottom: 2, display: "block",
          }}>
            WF {String(index + 1).padStart(2, "0")}
          </span>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.sm,
            fontWeight: T.wt.semibold, color: C.ink, lineHeight: 1.25,
          }}>
            {wf.name}
          </div>
        </div>

        {/* Trigger type */}
        <span style={{
          fontFamily: T.mono, fontSize: "10px", fontWeight: T.wt.semibold,
          color: "#64748b", background: "#f8fafc",
          border: "1px solid #e2e8f0", borderRadius: R.pill,
          padding: "2px 8px", letterSpacing: "0.03em", lineHeight: 1.6,
          whiteSpace: "nowrap" as const, flexShrink: 0,
          display: "inline-flex", alignItems: "center", gap: 4,
        }}>
          <span style={{
            width: 4, height: 4, borderRadius: "50%",
            background: "#94a3b8", display: "inline-block", flexShrink: 0,
          }} />
          {TRIGGER_CFG[wf.trigger].label}
        </span>
      </div>

      {/* Description */}
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
        lineHeight: 1.55, borderLeft: `2px solid ${accentColor}28`, paddingLeft: S[2],
      }}>
        {wf.description}
      </div>

      {/* Impact */}
      <div style={{
        fontFamily: T.mono, fontSize: "10px",
        color: C.inkMid, fontStyle: "italic", lineHeight: 1.5,
        letterSpacing: "0.01em",
      }}>
        ◆ {wf.operationalImpact}
      </div>

      {/* Systems + produces */}
      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4, alignItems: "center" }}>
        <span style={{
          fontFamily: T.mono, fontSize: "10px", color: C.inkGhost,
          textTransform: "uppercase" as const, letterSpacing: "0.07em", marginRight: 2,
        }}>
          Requiere
        </span>
        {wf.touchedSystems.map(s => (
          <span key={s} style={{
            fontFamily: T.mono, fontSize: "10px", color: C.inkFaint,
            background: C.surface, border: `1px solid ${C.lineSubtle}`,
            borderRadius: R.xs, padding: "0px 5px", lineHeight: 1.7,
          }}>
            {s}
          </span>
        ))}
      </div>

      {/* Supervision / requirements */}
      {wf.supervisionRequired && (
        <div>
          <div style={{
            fontFamily: T.mono, fontSize: "10px", color: C.inkGhost,
            textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 4,
          }}>
            Condiciones de activación
          </div>
          <div style={{
            fontFamily: T.mono, fontSize: "10px",
            color: C.inkMid, lineHeight: 1.5,
            display: "flex", alignItems: "flex-start", gap: 5,
          }}>
            <span style={{ color: C.inkGhost, flexShrink: 0 }}>—</span>
            {wf.supervisionRequired}
          </div>
        </div>
      )}

      {/* CTA */}
      <div style={{
        borderTop: "1px solid #eef1f7", paddingTop: 8, marginTop: 2,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily: T.mono, fontSize: "10px", fontWeight: T.wt.semibold,
          color: "#94a3b8", background: "transparent",
          border: "1px solid #e2e8f0", borderRadius: R.pill,
          padding: "3px 11px", letterSpacing: "0.04em", lineHeight: 1.6,
          opacity: 0.65, cursor: "default",
          pointerEvents: "none" as const, userSelect: "none" as const,
        }}>
          Incorporar workflow →
        </span>
        <span style={{
          fontFamily: T.mono, fontSize: "10px",
          color: C.inkGhost, fontStyle: "italic",
        }}>
          No activo
        </span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AgentWorkflowsTab({ agent }: { agent: CopilotAgent }) {
  const { active, supervised, available } = agent.workflowSystem;

  const [activeExpanded,     setActiveExpanded]     = useState(false);
  const [supervisedExpanded, setSupervisedExpanded] = useState(false);

  const visibleActive     = activeExpanded     ? active     : active.slice(0, DEFAULT_VISIBLE);
  const visibleSupervised = supervisedExpanded ? supervised : supervised.slice(0, DEFAULT_VISIBLE);

  const hiddenActive     = active.length     - visibleActive.length;
  const hiddenSupervised = supervised.length - visibleSupervised.length;

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[5] }}>

      {/* ══ Section 1 — Workflows activos ══════════════════════════════════════ */}
      <div>
        <SectionHeader
          label="Workflows activos"
          count={active.length}
          badge="En ejecución"
          badgeDot="#16a34a"
          badgeText="#166534"
          badgeBg="#f0fdf4"
          badgeBdr="#86efac"
        />
        <div style={{
          background: C.surface, border: `1px solid ${C.lineSubtle}`,
          borderRadius: R.card, padding: `${S[2]}px ${S[2]}px 2px`,
          boxShadow: E.sm,
        }}>
          {visibleActive.map(wf => (
            <WorkflowCard key={wf.id} wf={wf} accentColor={agent.accentColor} />
          ))}
          {(hiddenActive > 0 || activeExpanded) && (
            <ExpandToggle hidden={hiddenActive} onToggle={() => setActiveExpanded(v => !v)} />
          )}
        </div>
      </div>

      {/* ══ Section 2 — Workflows supervisados ═════════════════════════════════ */}
      {supervised.length > 0 && (
        <div>
          <SectionHeader
            label="Workflows supervisados"
            count={supervised.length}
            badge="Requiere aprobación"
            badgeDot="#c2410c"
            badgeText="#7c2d12"
            badgeBg="#fff7ed"
            badgeBdr="#fdba74"
          />
          <div style={{
            background: "#fffcf9", border: `1px solid #fde68a`,
            borderRadius: R.card, padding: `${S[2]}px ${S[2]}px 2px`,
          }}>
            {visibleSupervised.map(wf => (
              <WorkflowCard key={wf.id} wf={wf} accentColor={agent.accentColor} supervised />
            ))}
            {(hiddenSupervised > 0 || supervisedExpanded) && (
              <ExpandToggle hidden={hiddenSupervised} onToggle={() => setSupervisedExpanded(v => !v)} />
            )}
          </div>
        </div>
      )}

      {/* ══ Section 3 — Línea operacional / Execution path ═════════════════════ */}
      <div>
        <SectionHeader
          label="Línea operacional"
          count={active.length}
          badge="Flujo vivo"
          badgeDot={agent.accentColor}
          badgeText={agent.accentColor}
          badgeBg={`${agent.accentColor}0C`}
          badgeBdr={`${agent.accentColor}28`}
        />
        <div style={{
          background:   "linear-gradient(180deg, #ffffff 0%, #fafbfd 100%)",
          border:       `1px solid ${C.lineSubtle}`,
          borderRadius: R.card,
          overflow:     "hidden",
          boxShadow:    E.sm,
        }}>
          {/* Header row */}
          <div style={{
            display:    "flex",
            gap:        20,
            padding:    `6px ${S[3]}px`,
            background: C.surface,
            borderBottom: `1px solid ${C.lineSubtle}`,
          }}>
            {["Trigger", "Rutina", "Sistemas", "Output", "Cadencia"].map(col => (
              <span key={col} style={{
                fontFamily: T.mono, fontSize: "10px",
                fontWeight: T.wt.semibold, color: C.inkGhost,
                textTransform: "uppercase" as const, letterSpacing: "0.08em",
              }}>
                {col}
              </span>
            ))}
          </div>

          {/* Execution path rows */}
          {active.map((wf, i) => (
            <ExecutionPathStrip
              key={wf.id}
              wf={wf}
              accentColor={agent.accentColor}
            />
          ))}
        </div>
      </div>

      {/* ══ Section 4 — Workflows disponibles ══════════════════════════════════ */}
      {available.length > 0 && (
        <div>
          <SectionHeader
            label="Workflows disponibles"
            count={available.length}
            badge="No activos"
            badgeDot="#94a3b8"
            badgeText="#475569"
            badgeBg="#f8fafc"
            badgeBdr="#e2e8f0"
          />
          <div style={{
            display:             "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))",
            gap:                 S[3],
          }}>
            {available.map((wf, i) => (
              <AvailableWorkflowCard
                key={wf.id}
                wf={wf}
                accentColor={agent.accentColor}
                index={i}
              />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
