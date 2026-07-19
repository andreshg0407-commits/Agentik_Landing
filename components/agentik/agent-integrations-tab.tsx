/**
 * components/agentik/agent-integrations-tab.tsx
 *
 * Integraciones Tab — Operational Connectivity Intelligence
 *
 * Sprint: AGENTIK-AGENT-INTEGRATIONS-01
 *
 * Four sections:
 *   1. Integraciones activas      — live systems feeding the agent
 *   2. Integraciones degradadas   — limited connections + business consequences
 *   3. Capacidades desbloqueadas  — relational map: integration → capability
 *   4. Expansiones disponibles    — strategic connectivity not yet active
 *
 * Generic — driven entirely by agent.integrationSystem.
 * NOT a marketplace. NOT a DevOps dashboard. NOT Zapier.
 * Sensación: "Diego opera gracias a estas conexiones."
 */

"use client";

import { useState } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type {
  CopilotAgent,
  AgentIntegrationDef,
  AgentIntegrationExpansion,
  IntegrationStatus,
  IntegrationReadiness,
} from "@/lib/copilot/agents";

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_VISIBLE = 4;

// ── Status visual config ───────────────────────────────────────────────────────

const STATUS_CFG: Record<IntegrationStatus, {
  label:  string;
  dot:    string;
  text:   string;
  bg:     string;
  bdr:    string;
}> = {
  active: {
    label: "Activa",
    dot:   "#16a34a",
    text:  "#166534",
    bg:    "#f0fdf4",
    bdr:   "#86efac",
  },
  syncing: {
    label: "Sincronizando",
    dot:   "#2563eb",
    text:  "#1e3a8a",
    bg:    "#eff6ff",
    bdr:   "#93c5fd",
  },
  partial: {
    label: "Parcial",
    dot:   "#c2410c",
    text:  "#7c2d12",
    bg:    "#fff7ed",
    bdr:   "#fdba74",
  },
  observacion: {
    label: "Observación",
    dot:   "#94a3b8",
    text:  "#475569",
    bg:    "#f8fafc",
    bdr:   "#e2e8f0",
  },
  offline: {
    label: "Desconectada",
    dot:   "#ef4444",
    text:  "#991b1b",
    bg:    "#fef2f2",
    bdr:   "#fca5a5",
  },
};

// ── Readiness config ───────────────────────────────────────────────────────────

const READINESS_CFG: Record<IntegrationReadiness, {
  label: string;
  dot:   string;
  text:  string;
  bg:    string;
  bdr:   string;
}> = {
  disponible: {
    label: "Disponible",
    dot:   "#16a34a",
    text:  "#166534",
    bg:    "#f0fdf4",
    bdr:   "#86efac",
  },
  "requiere-configuracion": {
    label: "Requiere configuración",
    dot:   "#94a3b8",
    text:  "#64748b",
    bg:    "#f8fafc",
    bdr:   "#e2e8f0",
  },
  enterprise: {
    label: "Enterprise",
    dot:   "#7c3aed",
    text:  "#5b21b6",
    bg:    "#f5f3ff",
    bdr:   "#c4b5fd",
  },
  beta: {
    label: "Beta",
    dot:   "#c2410c",
    text:  "#7c2d12",
    bg:    "#fff7ed",
    bdr:   "#fdba74",
  },
};

// ── Auth + env labels ──────────────────────────────────────────────────────────

const AUTH_LABEL: Record<string, string> = {
  oauth2:           "OAuth 2.0",
  "api-key":        "API Key",
  webhook:          "Webhook",
  "service-account":"Service Account",
  basic:            "Basic Auth",
  none:             "Sin auth",
};

const ENV_LABEL: Record<string, string> = {
  produccion: "Producción",
  sandbox:    "Sandbox",
};

// ── Section header (shared with capabilities tab pattern) ──────────────────────

function SectionHeader({
  label,
  count,
  badge,
  badgeDot,
  badgeText,
  badgeBg,
  badgeBdr,
}: {
  label:     string;
  count:     number;
  badge:     string;
  badgeDot:  string;
  badgeText: string;
  badgeBg:   string;
  badgeBdr:  string;
}) {
  return (
    <div style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      marginBottom:   S[2] + 2,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          fontWeight:    T.wt.semibold,
          color:         C.inkFaint,
          textTransform: "uppercase" as const,
          letterSpacing: "0.09em",
        }}>
          {label}
        </span>
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      C.inkGhost,
        }}>
          {count}
        </span>
      </div>
      <span style={{
        fontFamily:    T.mono,
        fontSize:      "10px",
        fontWeight:    T.wt.semibold,
        color:         badgeText,
        background:    badgeBg,
        border:        `1px solid ${badgeBdr}`,
        borderRadius:  R.pill,
        padding:       "2px 9px",
        letterSpacing: "0.03em",
        lineHeight:    1.6,
        display:       "inline-flex",
        alignItems:    "center",
        gap:           5,
      }}>
        <span style={{
          width: 4, height: 4,
          borderRadius: "50%",
          background: badgeDot,
          display: "inline-block", flexShrink: 0,
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
      cursor: "pointer", textAlign: "center" as const,
      letterSpacing: "0.05em",
    }}>
      {hidden > 0 ? `→ ver ${hidden} más` : "↑ contraer"}
    </button>
  );
}

// ── Integration icon circle ────────────────────────────────────────────────────

function IntegrationIcon({
  abbrev,
  accentColor,
  status,
}: {
  abbrev:      string;
  accentColor: string;
  status:      IntegrationStatus;
}) {
  const isActive = status === "active" || status === "syncing";
  return (
    <div style={{
      width:          36,
      height:         36,
      borderRadius:   R.sm,
      background:     isActive ? `${accentColor}12` : "#f1f5f9",
      border:         `1px solid ${isActive ? `${accentColor}22` : "#e2e8f0"}`,
      display:        "flex",
      alignItems:     "center",
      justifyContent: "center",
      flexShrink:     0,
    }}>
      <span style={{
        fontFamily:    T.mono,
        fontSize:      "9px",
        fontWeight:    T.wt.black,
        color:         isActive ? accentColor : "#94a3b8",
        letterSpacing: "0.04em",
        lineHeight:    1,
      }}>
        {abbrev}
      </span>
    </div>
  );
}

// ── Active integration card ────────────────────────────────────────────────────

function ActiveIntegrationCard({
  intg,
  accentColor,
}: {
  intg:        AgentIntegrationDef;
  accentColor: string;
}) {
  const st = STATUS_CFG[intg.status];

  return (
    <div style={{
      display:      "flex",
      gap:          S[3],
      padding:      `10px ${S[3]}px`,
      borderLeft:   `2px solid ${accentColor}50`,
      background:   `${accentColor}03`,
      borderRadius: `0 ${R.xs}px ${R.xs}px 0`,
      marginBottom: 6,
    }}>
      <IntegrationIcon abbrev={intg.abbrev} accentColor={accentColor} status={intg.status} />

      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Row 1: name + status badge */}
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:          S[2],
          flexWrap:     "wrap" as const,
          marginBottom: 5,
        }}>
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz.sm,
            fontWeight: T.wt.semibold,
            color:      C.ink,
            lineHeight: 1.2,
          }}>
            {intg.name}
          </span>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      "10px",
            fontWeight:    T.wt.semibold,
            color:         st.text,
            background:    st.bg,
            border:        `1px solid ${st.bdr}`,
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
              background: st.dot, display: "inline-block", flexShrink: 0,
            }} />
            {st.label}
          </span>
        </div>

        {/* Row 2: metadata strip */}
        <div style={{
          display:      "flex",
          flexWrap:     "wrap" as const,
          gap:          "2px 12px",
          marginBottom: 6,
          alignItems:   "center",
        }}>
          {[
            `Última sync · ${intg.lastSync}`,
            `${AUTH_LABEL[intg.auth]} · ${ENV_LABEL[intg.env]}`,
            intg.latency !== "N/A" ? `Latencia · ${intg.latency}` : null,
          ].filter(Boolean).map(item => (
            <span key={item as string} style={{
              fontFamily: T.mono,
              fontSize:   "10px",
              color:      C.inkFaint,
              lineHeight: 1.6,
            }}>
              {item}
            </span>
          ))}
        </div>

        {/* Row 3: status context */}
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          color:        C.inkMid,
          lineHeight:   1.5,
          marginBottom: 7,
          fontStyle:    "italic",
        }}>
          {intg.statusContext}
        </div>

        {/* Row 4: operational scope chips */}
        <div style={{
          display:      "flex",
          flexWrap:     "wrap" as const,
          gap:          4,
          alignItems:   "center",
          marginBottom: 6,
        }}>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      "10px",
            color:         C.inkGhost,
            textTransform: "uppercase" as const,
            letterSpacing: "0.07em",
            marginRight:   2,
          }}>
            Scope
          </span>
          {intg.operationalScope.map(s => (
            <span key={s} style={{
              fontFamily:   T.mono,
              fontSize:     "10px",
              color:        accentColor,
              background:   `${accentColor}0C`,
              border:       `1px solid ${accentColor}20`,
              borderRadius: R.xs,
              padding:      "0px 5px",
              lineHeight:   1.7,
            }}>
              {s}
            </span>
          ))}
        </div>

        {/* Row 5: unlocks mini-list */}
        {intg.unlocksCapabilities.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4, alignItems: "center" }}>
            <span style={{
              fontFamily:    T.mono,
              fontSize:      "10px",
              color:         C.inkGhost,
              textTransform: "uppercase" as const,
              letterSpacing: "0.07em",
              marginRight:   2,
            }}>
              Desbloquea
            </span>
            {intg.unlocksCapabilities.map(cap => (
              <span key={cap} style={{
                fontFamily:   T.mono,
                fontSize:     "10px",
                color:        C.inkMid,
                background:   C.white,
                border:       `1px solid ${C.line}`,
                borderRadius: R.xs,
                padding:      "0px 5px",
                lineHeight:   1.7,
              }}>
                {cap}
              </span>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

// ── Degraded integration card ──────────────────────────────────────────────────

function DegradedIntegrationCard({
  intg,
  accentColor,
}: {
  intg:        AgentIntegrationDef;
  accentColor: string;
}) {
  const st = STATUS_CFG[intg.status];

  return (
    <div style={{
      display:      "flex",
      gap:          S[3],
      padding:      `10px ${S[3]}px`,
      borderLeft:   `2px solid ${intg.status === "offline" ? "#ef444490" : "#c2410c90"}`,
      background:   intg.status === "offline" ? "rgba(239,68,68,0.03)" : "rgba(194,65,12,0.03)",
      borderRadius: `0 ${R.xs}px ${R.xs}px 0`,
      marginBottom: 6,
    }}>
      <IntegrationIcon abbrev={intg.abbrev} accentColor={accentColor} status={intg.status} />

      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Row 1: name + status */}
        <div style={{
          display: "flex", alignItems: "center", gap: S[2],
          flexWrap: "wrap" as const, marginBottom: 5,
        }}>
          <span style={{
            fontFamily: T.mono, fontSize: T.sz.sm,
            fontWeight: T.wt.semibold, color: C.ink, lineHeight: 1.2,
          }}>
            {intg.name}
          </span>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      "10px",
            fontWeight:    T.wt.semibold,
            color:         st.text,
            background:    st.bg,
            border:        `1px solid ${st.bdr}`,
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
              background: st.dot, display: "inline-block", flexShrink: 0,
            }} />
            {st.label}
          </span>
        </div>

        {/* Row 2: status context */}
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs,
          color: C.inkMid, lineHeight: 1.5, marginBottom: 6,
        }}>
          {intg.statusContext}
        </div>

        {/* Row 3: business consequence — CRITICAL */}
        {intg.degradationImpact && (
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            color:        intg.status === "offline" ? "#991b1b" : "#92400e",
            lineHeight:   1.5,
            marginBottom: 7,
            borderLeft:   `2px solid ${intg.status === "offline" ? "#fca5a5" : "#fdba74"}`,
            paddingLeft:  8,
            background:   intg.status === "offline" ? "rgba(252,165,165,0.08)" : "rgba(253,186,116,0.08)",
            borderRadius: `0 ${R.xs}px ${R.xs}px 0`,
            padding:      "4px 8px",
          }}>
            {intg.degradationImpact}
          </div>
        )}

        {/* Row 4: scope chips (compact) */}
        <div style={{
          display: "flex", flexWrap: "wrap" as const, gap: 4,
          alignItems: "center", marginBottom: intg.suggestedActions?.length ? 7 : 0,
        }}>
          <span style={{
            fontFamily: T.mono, fontSize: "10px",
            color: C.inkGhost, textTransform: "uppercase" as const,
            letterSpacing: "0.07em", marginRight: 2,
          }}>
            Scope
          </span>
          {intg.operationalScope.map(s => (
            <span key={s} style={{
              fontFamily: T.mono, fontSize: "10px",
              color: C.inkFaint, background: C.surface,
              border: `1px solid ${C.lineSubtle}`, borderRadius: R.xs,
              padding: "0px 5px", lineHeight: 1.7,
            }}>
              {s}
            </span>
          ))}
        </div>

        {/* Row 5: suggested actions */}
        {intg.suggestedActions && intg.suggestedActions.length > 0 && (
          <div>
            <div style={{
              fontFamily: T.mono, fontSize: "10px",
              color: C.inkGhost, textTransform: "uppercase" as const,
              letterSpacing: "0.08em", marginBottom: 4,
            }}>
              Acciones sugeridas
            </div>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
              {intg.suggestedActions.map(action => (
                <div key={action} style={{
                  fontFamily: T.mono, fontSize: "10px",
                  color: C.inkMid, lineHeight: 1.5,
                  display: "flex", alignItems: "flex-start", gap: 5,
                }}>
                  <span style={{ color: C.inkGhost, flexShrink: 0 }}>→</span>
                  {action}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ── Unlocked capabilities relational map ──────────────────────────────────────

function UnlockedCapabilitiesMap({
  integrations,
  accentColor,
}: {
  integrations: AgentIntegrationDef[];
  accentColor:  string;
}) {
  // Only show integrations that actually unlock something and are active/syncing
  const active = integrations.filter(
    i => (i.status === "active" || i.status === "syncing") && i.unlocksCapabilities.length > 0
  );

  if (active.length === 0) return null;

  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
      gap:                 S[2] + 2,
    }}>
      {active.map(intg => (
        <div key={intg.id} style={{
          background:   "linear-gradient(180deg, #ffffff 0%, #fafbfd 100%)",
          border:       `1px solid #e8edf5`,
          borderRadius: R.card,
          borderTop:    `2px solid ${accentColor}20`,
          padding:      `${S[2]}px ${S[3]}px`,
          boxShadow:    "0 1px 2px rgba(0,0,0,0.03)",
        }}>
          {/* Source integration */}
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:          6,
            marginBottom: 8,
          }}>
            <div style={{
              width: 20, height: 20,
              borderRadius: 4,
              background: `${accentColor}10`,
              border: `1px solid ${accentColor}18`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <span style={{
                fontFamily: T.mono, fontSize: "7px",
                fontWeight: T.wt.black,
                color: accentColor, letterSpacing: "0.02em",
              }}>
                {intg.abbrev.slice(0, 3)}
              </span>
            </div>
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              fontWeight: T.wt.semibold,
              color:      C.inkMid,
            }}>
              {intg.name}
            </span>
          </div>

          {/* Arrow connector */}
          <div style={{
            fontFamily:   T.mono,
            fontSize:     "10px",
            color:        `${accentColor}60`,
            marginBottom: 6,
            paddingLeft:  2,
          }}>
            ↓
          </div>

          {/* Target capabilities */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 4 }}>
            {intg.unlocksCapabilities.map(cap => (
              <div key={cap} style={{
                fontFamily:  T.mono,
                fontSize:    "10px",
                fontWeight:  T.wt.semibold,
                color:       accentColor,
                background:  `${accentColor}08`,
                border:      `1px solid ${accentColor}18`,
                borderRadius: R.xs,
                padding:     "2px 7px",
                lineHeight:  1.6,
              }}>
                {cap}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Expansion card ─────────────────────────────────────────────────────────────

function ExpansionCard({
  exp,
  accentColor,
  index,
}: {
  exp:         AgentIntegrationExpansion;
  accentColor: string;
  index:       number;
}) {
  const rd      = READINESS_CFG[exp.readiness];
  const isReady = exp.readiness !== "requiere-configuracion" && exp.readiness !== "enterprise";

  return (
    <div style={{
      background:   "linear-gradient(180deg, #ffffff 0%, #fafbfd 100%)",
      border:       "1px solid #e8edf5",
      borderRadius: R.card,
      borderTop:    `2px solid ${accentColor}25`,
      boxShadow:    "0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,74,173,0.025)",
      padding:      `${S[3]}px ${S[3]}px ${S[2]}px`,
      display:      "flex",
      flexDirection:"column" as const,
      gap:          10,
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "flex-start",
        justifyContent: "space-between", gap: S[2],
      }}>
        <div>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      "10px",
            fontWeight:    T.wt.semibold,
            color:         `${accentColor}70`,
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            marginBottom:  2,
            display:       "block",
          }}>
            INT {String(index + 1).padStart(2, "0")}
          </span>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.sm,
            fontWeight: T.wt.semibold,
            color:      C.ink,
            lineHeight: 1.25,
          }}>
            {exp.name}
          </div>
        </div>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      "10px",
          fontWeight:    T.wt.semibold,
          color:         rd.text,
          background:    rd.bg,
          border:        `1px solid ${rd.bdr}`,
          borderRadius:  R.pill,
          padding:       "2px 8px",
          letterSpacing: "0.03em",
          lineHeight:    1.6,
          whiteSpace:    "nowrap" as const,
          flexShrink:    0,
          display:       "inline-flex",
          alignItems:    "center",
          gap:           4,
        }}>
          <span style={{
            width: 4, height: 4, borderRadius: "50%",
            background: rd.dot, display: "inline-block", flexShrink: 0,
          }} />
          {rd.label}
        </span>
      </div>

      {/* Unlocks */}
      <div style={{
        fontFamily:  T.mono,
        fontSize:    T.sz.xs,
        color:       C.inkMid,
        lineHeight:  1.55,
        borderLeft:  `2px solid ${accentColor}28`,
        paddingLeft: S[2],
      }}>
        {exp.unlocks}
      </div>

      {/* Impact chips */}
      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 4 }}>
        {exp.impact.map(item => (
          <span key={item} style={{
            fontFamily:   T.mono,
            fontSize:     "10px",
            color:        accentColor,
            background:   `${accentColor}09`,
            border:       `1px solid ${accentColor}1C`,
            borderRadius: R.pill,
            padding:      "1px 7px",
            lineHeight:   1.7,
          }}>
            {item}
          </span>
        ))}
      </div>

      {/* Requirements */}
      <div>
        <div style={{
          fontFamily:    T.mono,
          fontSize:      "10px",
          color:         C.inkGhost,
          textTransform: "uppercase" as const,
          letterSpacing: "0.08em",
          marginBottom:  4,
        }}>
          Requisitos
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 3 }}>
          {exp.requirements.map(req => (
            <div key={req} style={{
              fontFamily: T.mono, fontSize: "10px",
              color: C.inkMid, lineHeight: 1.5,
              display: "flex", alignItems: "flex-start", gap: 5,
            }}>
              <span style={{ color: C.inkGhost, flexShrink: 0 }}>—</span>
              {req}
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{
        borderTop:      "1px solid #eef1f7",
        paddingTop:     8,
        marginTop:      2,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      "10px",
          fontWeight:    T.wt.semibold,
          color:         isReady ? accentColor : "#94a3b8",
          background:    isReady ? `${accentColor}08` : "transparent",
          border:        `1px solid ${isReady ? `${accentColor}28` : "#e2e8f0"}`,
          borderRadius:  R.pill,
          padding:       "3px 11px",
          letterSpacing: "0.04em",
          lineHeight:    1.6,
          opacity:       isReady ? 1 : 0.65,
          cursor:        "default",
          pointerEvents: "none" as const,
          userSelect:    "none" as const,
        }}>
          Conectar integración →
        </span>
        {!isReady && (
          <span style={{
            fontFamily: T.mono, fontSize: "10px",
            color: C.inkGhost, fontStyle: "italic",
          }}>
            {exp.readiness === "enterprise" ? "Plan enterprise" : "Configuración requerida"}
          </span>
        )}
      </div>

    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AgentIntegrationsTab({ agent }: { agent: CopilotAgent }) {
  const { integrations, available } = agent.integrationSystem;

  const active   = integrations.filter(i => i.status === "active" || i.status === "syncing");
  const degraded = integrations.filter(
    i => i.status === "partial" || i.status === "offline" || i.status === "observacion"
  );

  const [activeExpanded,   setActiveExpanded]   = useState(false);
  const [degradedExpanded, setDegradedExpanded] = useState(false);

  const visibleActive   = activeExpanded   ? active   : active.slice(0, DEFAULT_VISIBLE);
  const visibleDegraded = degradedExpanded ? degraded : degraded.slice(0, DEFAULT_VISIBLE);

  const hiddenActive   = active.length   - visibleActive.length;
  const hiddenDegraded = degraded.length - visibleDegraded.length;

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[5] }}>

      {/* ══ Section 1 — Integraciones activas ══════════════════════════════════ */}
      <div>
        <SectionHeader
          label="Integraciones activas"
          count={active.length}
          badge="Operativas"
          badgeDot="#16a34a"
          badgeText="#166534"
          badgeBg="#f0fdf4"
          badgeBdr="#86efac"
        />
        <div style={{
          background:   C.surface,
          border:       `1px solid ${C.lineSubtle}`,
          borderRadius: R.card,
          padding:      `${S[2]}px ${S[2]}px 2px`,
          boxShadow:    E.sm,
        }}>
          {visibleActive.map(intg => (
            <ActiveIntegrationCard
              key={intg.id}
              intg={intg}
              accentColor={agent.accentColor}
            />
          ))}
          {(hiddenActive > 0 || activeExpanded) && (
            <ExpandToggle
              hidden={hiddenActive}
              onToggle={() => setActiveExpanded(v => !v)}
            />
          )}
        </div>
      </div>

      {/* ══ Section 2 — Integraciones degradadas ═══════════════════════════════ */}
      {degraded.length > 0 && (
        <div>
          <SectionHeader
            label="Integraciones degradadas"
            count={degraded.length}
            badge="Atención requerida"
            badgeDot="#c2410c"
            badgeText="#7c2d12"
            badgeBg="#fff7ed"
            badgeBdr="#fdba74"
          />
          <div style={{
            background:   "#fffcf9",
            border:       `1px solid #fde68a`,
            borderRadius: R.card,
            padding:      `${S[2]}px ${S[2]}px 2px`,
          }}>
            {visibleDegraded.map(intg => (
              <DegradedIntegrationCard
                key={intg.id}
                intg={intg}
                accentColor={agent.accentColor}
              />
            ))}
            {(hiddenDegraded > 0 || degradedExpanded) && (
              <ExpandToggle
                hidden={hiddenDegraded}
                onToggle={() => setDegradedExpanded(v => !v)}
              />
            )}
          </div>
        </div>
      )}

      {/* ══ Section 3 — Capacidades desbloqueadas ══════════════════════════════ */}
      <div>
        <SectionHeader
          label="Capacidades desbloqueadas"
          count={active.filter(i => i.unlocksCapabilities.length > 0).length}
          badge="Mapa relacional"
          badgeDot={agent.accentColor}
          badgeText={agent.accentColor}
          badgeBg={`${agent.accentColor}0C`}
          badgeBdr={`${agent.accentColor}28`}
        />
        <UnlockedCapabilitiesMap
          integrations={integrations}
          accentColor={agent.accentColor}
        />
      </div>

      {/* ══ Section 4 — Expansiones disponibles ════════════════════════════════ */}
      {available.length > 0 && (
        <div>
          <SectionHeader
            label="Expansiones disponibles"
            count={available.length}
            badge="No conectadas"
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
            {available.map((exp, i) => (
              <ExpansionCard
                key={exp.name}
                exp={exp}
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
