/**
 * components/agentik/agent-personality-tab.tsx
 *
 * Personalidad Tab — Operational Behavioral Model
 *
 * Sprint: AGENTIK-AGENT-PERSONALITY-01
 *
 * Five sections:
 *   1. Perfil operacional     — autonomy level, primary objective, escalation summary
 *   2. Prioridades            — ordered operational priorities
 *   3. Reglas de decisión     — governance constitution with severity
 *   4. Acciones prohibidas    — hard governance boundaries
 *   5. Estilo de comunicación — tone, behaviors, escalation style
 *
 * NOT a chat profile. NOT a settings panel. NOT a chatbot card.
 * "Entiendo cómo este agente piensa y opera dentro de la empresa."
 *
 * Server Component — no interactivity required.
 */

import { C, T, S, R, E } from "@/lib/ui/tokens";
import type { CopilotAgent, AgentAutonomyLevel, AgentDecisionRule } from "@/lib/copilot/agents";

// ── Autonomy visual config ─────────────────────────────────────────────────────

const AUTONOMY_CFG: Record<AgentAutonomyLevel, {
  label:       string;
  description: string;
  dot:         string;
  text:        string;
  bg:          string;
  bdr:         string;
  barFill:     number;
  barColor:    string;
}> = {
  supervisado: {
    label:       "Supervisado",
    description: "Todas las acciones requieren aprobación humana antes de ejecutarse.",
    dot:         "#94a3b8",
    text:        "#475569",
    bg:          "#f8fafc",
    bdr:         "#cbd5e1",
    barFill:     25,
    barColor:    "#94a3b8",
  },
  "semi-autonomo": {
    label:       "Semi-autónomo",
    description: "Opera de forma autónoma. Escala decisiones ambiguas o de alto riesgo a humanos.",
    dot:         "#2563eb",
    text:        "#1e3a8a",
    bg:          "#eff6ff",
    bdr:         "#93c5fd",
    barFill:     65,
    barColor:    "#2563eb",
  },
  autonomo: {
    label:       "Autónomo",
    description: "Completamente auto-dirigido dentro de los límites operacionales definidos.",
    dot:         "#16a34a",
    text:        "#166534",
    bg:          "#f0fdf4",
    bdr:         "#86efac",
    barFill:     90,
    barColor:    "#16a34a",
  },
  critico: {
    label:       "Modo crítico",
    description: "Opera en ruta crítica. Cualquier fallo activa escalamiento inmediato.",
    dot:         "#dc2626",
    text:        "#991b1b",
    bg:          "#fef2f2",
    bdr:         "#fca5a5",
    barFill:     100,
    barColor:    "#dc2626",
  },
};

// ── Severity visual config ─────────────────────────────────────────────────────

const SEVERITY_CFG = {
  normal: {
    label: "Normal",
    text:  "#475569",
    bg:    "#f8fafc",
    bdr:   "#e2e8f0",
    dot:   "#94a3b8",
  },
  high: {
    label: "Alto",
    text:  "#7c2d12",
    bg:    "#fff7ed",
    bdr:   "#fdba74",
    dot:   "#c2410c",
  },
  critical: {
    label: "Crítico",
    text:  "#991b1b",
    bg:    "#fef2f2",
    bdr:   "#fca5a5",
    dot:   "#dc2626",
  },
};

// ── Shared primitives ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily:    T.mono,
      fontSize:      T.sz["2xs"],
      fontWeight:    T.wt.semibold,
      color:         C.inkFaint,
      textTransform: "uppercase" as const,
      letterSpacing: "0.09em",
      marginBottom:  S[2] + 2,
    }}>
      {children}
    </div>
  );
}

function RuleRow({ rule, accentColor }: { rule: AgentDecisionRule; accentColor: string }) {
  const sev = SEVERITY_CFG[rule.severity ?? "normal"];

  return (
    <div style={{
      display:      "flex",
      gap:          S[3],
      padding:      `9px ${S[3]}px`,
      borderLeft:   `2px solid ${rule.severity === "critical" ? "#fca5a5" : rule.severity === "high" ? "#fdba74" : C.lineSubtle}`,
      background:   rule.severity === "critical" ? "rgba(252,165,165,0.05)" : rule.severity === "high" ? "rgba(253,186,116,0.05)" : "transparent",
      borderRadius: `0 ${R.xs}px ${R.xs}px 0`,
      marginBottom: 5,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          S[2],
          flexWrap:     "wrap" as const,
          marginBottom: 4,
        }}>
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            fontWeight: T.wt.semibold,
            color:      C.ink,
            lineHeight: 1.3,
          }}>
            {rule.title}
          </span>

          {rule.severity && rule.severity !== "normal" && (
            <span style={{
              fontFamily:    T.mono,
              fontSize:      "10px",
              fontWeight:    T.wt.semibold,
              color:         sev.text,
              background:    sev.bg,
              border:        `1px solid ${sev.bdr}`,
              borderRadius:  R.pill,
              padding:       "1px 7px",
              letterSpacing: "0.04em",
              lineHeight:    1.7,
              display:       "inline-flex",
              alignItems:    "center",
              gap:           4,
              whiteSpace:    "nowrap" as const,
            }}>
              <span style={{
                width: 4, height: 4, borderRadius: "50%",
                background: sev.dot, display: "inline-block", flexShrink: 0,
              }} />
              {sev.label}
            </span>
          )}
        </div>

        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkMid,
          lineHeight: 1.55,
        }}>
          {rule.description}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AgentPersonalityTab({ agent }: { agent: CopilotAgent }) {
  const beh     = agent.operationalBehavior;
  const autonomy = AUTONOMY_CFG[beh.autonomy];

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[5] }}>

      {/* ══ Section 1 — Perfil operacional ═════════════════════════════════════ */}
      <div>
        <SectionLabel>Perfil operacional</SectionLabel>

        <div style={{
          background:   "linear-gradient(180deg, #ffffff 0%, #fafbfd 100%)",
          border:       `1px solid ${C.lineSubtle}`,
          borderRadius: R.card,
          borderTop:    `3px solid ${agent.accentColor}`,
          padding:      `${S[4]}px ${S[4]}px ${S[3]}px`,
          boxShadow:    E.sm,
        }}>
          {/* Autonomy row */}
          <div style={{
            display:        "flex",
            alignItems:     "flex-start",
            justifyContent: "space-between",
            gap:            S[4],
            marginBottom:   S[4],
            flexWrap:       "wrap" as const,
          }}>
            {/* Left: label + description */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 4 }}>
                <span style={{
                  fontFamily:    T.mono,
                  fontSize:      T.sz["2xs"],
                  color:         C.inkFaint,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.08em",
                }}>
                  Autonomía operacional
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                {/* Autonomy badge */}
                <span style={{
                  fontFamily:    T.mono,
                  fontSize:      T.sz.xs,
                  fontWeight:    T.wt.semibold,
                  color:         autonomy.text,
                  background:    autonomy.bg,
                  border:        `1px solid ${autonomy.bdr}`,
                  borderRadius:  R.pill,
                  padding:       "3px 12px",
                  letterSpacing: "0.04em",
                  lineHeight:    1.6,
                  display:       "inline-flex",
                  alignItems:    "center",
                  gap:           6,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: autonomy.dot, display: "inline-block", flexShrink: 0,
                  }} />
                  {autonomy.label}
                </span>
              </div>
            </div>

            {/* Right: autonomy spectrum bar */}
            <div style={{ minWidth: 160, flexShrink: 0 }}>
              <div style={{
                fontFamily:    T.mono,
                fontSize:      "10px",
                color:         C.inkFaint,
                textTransform: "uppercase" as const,
                letterSpacing: "0.07em",
                marginBottom:  5,
                display:       "flex",
                justifyContent:"space-between",
              }}>
                <span>Supervisado</span>
                <span>Autónomo</span>
              </div>
              <div style={{
                height:       5,
                background:   C.lineSubtle,
                borderRadius: R.pill,
                overflow:     "hidden",
              }}>
                <div style={{
                  width:        `${autonomy.barFill}%`,
                  height:       "100%",
                  background:   autonomy.barColor,
                  borderRadius: R.pill,
                  transition:   "width 0.4s ease",
                }} />
              </div>
            </div>
          </div>

          {/* Autonomy description */}
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            color:        C.inkLight,
            lineHeight:   1.55,
            marginBottom: S[4],
            paddingLeft:  S[1],
            borderLeft:   `2px solid ${agent.accentColor}30`,
          }}>
            {autonomy.description}
          </div>

          {/* Primary objective */}
          <div style={{ marginBottom: S[3] }}>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      "10px",
              color:         C.inkFaint,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              marginBottom:  5,
            }}>
              Objetivo primario
            </div>
            <div style={{
              fontFamily: T.mono,
              fontSize:   T.sz.sm,
              fontWeight: T.wt.semibold,
              color:      C.ink,
              lineHeight: 1.55,
            }}>
              {beh.primaryObjective}
            </div>
          </div>

          {/* Escalation style */}
          <div style={{
            background:   C.surface,
            border:       `1px solid ${C.lineSubtle}`,
            borderRadius: R.xs,
            padding:      `${S[2]}px ${S[3]}px`,
          }}>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      "10px",
              color:         C.inkFaint,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              marginBottom:  4,
            }}>
              Política de escalamiento
            </div>
            <div style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              color:      C.inkMid,
              lineHeight: 1.55,
            }}>
              {beh.communication.escalationStyle}
            </div>
          </div>
        </div>
      </div>

      {/* ══ Section 2 — Prioridades operacionales ══════════════════════════════ */}
      <div>
        <SectionLabel>Prioridades operacionales</SectionLabel>

        <div style={{
          background:   C.surface,
          border:       `1px solid ${C.lineSubtle}`,
          borderRadius: R.card,
          padding:      `${S[2]}px ${S[2]}px 2px`,
          boxShadow:    E.sm,
        }}>
          {beh.operationalPriorities.map((priority, i) => (
            <div key={i} style={{
              display:      "flex",
              alignItems:   "flex-start",
              gap:          S[3],
              padding:      `9px ${S[3]}px`,
              borderBottom: i < beh.operationalPriorities.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
            }}>
              {/* Priority number */}
              <div style={{
                width:          22,
                height:         22,
                borderRadius:   R.xs,
                background:     i === 0 ? `${agent.accentColor}12` : C.white,
                border:         `1px solid ${i === 0 ? `${agent.accentColor}25` : C.line}`,
                display:        "flex",
                alignItems:     "center",
                justifyContent: "center",
                flexShrink:     0,
                marginTop:      1,
              }}>
                <span style={{
                  fontFamily: T.mono,
                  fontSize:   "10px",
                  fontWeight: T.wt.black,
                  color:      i === 0 ? agent.accentColor : C.inkFaint,
                  lineHeight: 1,
                }}>
                  {i + 1}
                </span>
              </div>

              {/* Priority text */}
              <div style={{ flex: 1 }}>
                <span style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  fontWeight: i === 0 ? T.wt.semibold : T.wt.normal,
                  color:      i === 0 ? C.ink : C.inkMid,
                  lineHeight: 1.5,
                }}>
                  {priority}
                </span>
              </div>

              {/* P1 badge */}
              {i === 0 && (
                <span style={{
                  fontFamily:    T.mono,
                  fontSize:      "10px",
                  fontWeight:    T.wt.semibold,
                  color:         agent.accentColor,
                  background:    `${agent.accentColor}0C`,
                  border:        `1px solid ${agent.accentColor}22`,
                  borderRadius:  R.pill,
                  padding:       "1px 7px",
                  letterSpacing: "0.04em",
                  lineHeight:    1.7,
                  whiteSpace:    "nowrap" as const,
                  flexShrink:    0,
                }}>
                  Máxima prioridad
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ══ Section 3 — Reglas de decisión ═════════════════════════════════════ */}
      <div>
        <div style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          marginBottom:   S[2] + 2,
        }}>
          <SectionLabel>Reglas de decisión</SectionLabel>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      "10px",
            color:         C.inkFaint,
            letterSpacing: "0.04em",
          }}>
            Marco de gobierno interno — {beh.decisionRules.length} reglas
          </span>
        </div>

        <div style={{
          background:   C.surface,
          border:       `1px solid ${C.lineSubtle}`,
          borderRadius: R.card,
          padding:      `${S[2]}px ${S[2]}px 2px`,
          boxShadow:    E.sm,
        }}>
          {beh.decisionRules.map((rule, i) => (
            <RuleRow key={i} rule={rule} accentColor={agent.accentColor} />
          ))}
        </div>
      </div>

      {/* ══ Section 4 — Acciones prohibidas ════════════════════════════════════ */}
      <div>
        <SectionLabel>Acciones prohibidas</SectionLabel>

        <div style={{
          background:   "#fffcf9",
          border:       `1px solid #fde68a`,
          borderRadius: R.card,
          padding:      `${S[2]}px ${S[3]}px`,
        }}>
          <div style={{
            fontFamily:   T.mono,
            fontSize:     "10px",
            color:        "#92400e",
            textTransform:"uppercase" as const,
            letterSpacing:"0.08em",
            marginBottom: S[2],
          }}>
            Límites de gobernanza — Nunca ejecutar
          </div>

          <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
            {beh.forbiddenActions.map((action, i) => (
              <div key={i} style={{
                display:    "flex",
                alignItems: "flex-start",
                gap:        10,
                padding:    `6px ${S[2]}px`,
                background: "rgba(253,186,116,0.06)",
                border:     `1px solid rgba(253,186,116,0.3)`,
                borderRadius: R.xs,
              }}>
                {/* Prohibition indicator */}
                <div style={{
                  width:          16,
                  height:         16,
                  borderRadius:   "50%",
                  background:     "#fff7ed",
                  border:         "1px solid #fdba74",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  flexShrink:     0,
                  marginTop:      1,
                }}>
                  <span style={{
                    fontFamily: T.mono,
                    fontSize:   "8px",
                    fontWeight: T.wt.black,
                    color:      "#c2410c",
                    lineHeight: 1,
                  }}>
                    ✕
                  </span>
                </div>

                <span style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      "#7c2d12",
                  lineHeight: 1.5,
                }}>
                  {action}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ Section 5 — Estilo de comunicación ═════════════════════════════════ */}
      <div>
        <SectionLabel>Estilo de comunicación</SectionLabel>

        <div style={{
          background:   "linear-gradient(180deg, #ffffff 0%, #fafbfd 100%)",
          border:       `1px solid ${C.lineSubtle}`,
          borderRadius: R.card,
          padding:      `${S[3]}px ${S[4]}px`,
          boxShadow:    E.sm,
          display:      "flex",
          flexDirection:"column" as const,
          gap:          S[3],
        }}>
          {/* Tone */}
          <div>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      "10px",
              color:         C.inkFaint,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              marginBottom:  5,
            }}>
              Tono
            </div>
            <div style={{
              fontFamily:  T.mono,
              fontSize:    T.sz.sm,
              fontWeight:  T.wt.semibold,
              color:       C.ink,
              lineHeight:  1.45,
              borderLeft:  `2px solid ${agent.accentColor}40`,
              paddingLeft: S[2],
            }}>
              {beh.communication.tone}
            </div>
          </div>

          {/* Behaviors */}
          <div>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      "10px",
              color:         C.inkFaint,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              marginBottom:  8,
            }}>
              Comportamiento
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
              {beh.communication.behavior.map((b, i) => (
                <div key={i} style={{
                  display:    "flex",
                  alignItems: "flex-start",
                  gap:        8,
                }}>
                  <span style={{
                    width:        5,
                    height:       5,
                    borderRadius: "50%",
                    background:   `${agent.accentColor}60`,
                    display:      "inline-block",
                    flexShrink:   0,
                    marginTop:    5,
                  }} />
                  <span style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz.xs,
                    color:      C.inkMid,
                    lineHeight: 1.55,
                  }}>
                    {b}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Escalation triggers summary */}
          <div style={{
            background:   C.surface,
            border:       `1px solid ${C.lineSubtle}`,
            borderRadius: R.xs,
            padding:      `${S[2]}px ${S[3]}px`,
          }}>
            <div style={{
              fontFamily:    T.mono,
              fontSize:      "10px",
              color:         C.inkFaint,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              marginBottom:  8,
            }}>
              Triggers de escalamiento — {beh.escalationTriggers.length} condiciones
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 5 }}>
              {beh.escalationTriggers.map((trigger, i) => (
                <div key={i} style={{
                  fontFamily:  T.mono,
                  fontSize:    "10px",
                  color:       C.inkMid,
                  lineHeight:  1.5,
                  display:     "flex",
                  alignItems:  "flex-start",
                  gap:         6,
                }}>
                  <span style={{ color: C.inkGhost, flexShrink: 0 }}>→</span>
                  {trigger}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
