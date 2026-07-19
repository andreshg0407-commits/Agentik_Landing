/**
 * components/agentik/agent-capabilities-tab.tsx
 *
 * Capacidades Tab — Operational Execution Intelligence
 *
 * Sprint: AGENTIK-AGENT-CAPABILITIES-01
 * Refined: AGENTIK-CAPABILITIES-REFINEMENT-01
 *
 * Three sections:
 *   1. Capacidades activas    — what the agent executes right now
 *   2. Capacidades degradadas — limited and why, operational consequence visible
 *   3. Expansiones disponibles — strategic expansions, not a marketplace
 *
 * Generic — driven entirely by agent.capabilitySystem.
 */

"use client";

import { useState } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type {
  CopilotAgent,
  AgentCapabilityDef,
  AgentCapabilityExpansion,
  AutonomyLevel,
  ExpansionReadiness,
} from "@/lib/copilot/agents";

// ── Constants ──────────────────────────────────────────────────────────────────

const DEFAULT_VISIBLE = 4;

// ── Autonomy — enterprise trust system ────────────────────────────────────────
// Cold institutional colors. NOT alert-style. NOT saturated.

const AUTONOMY: Record<AutonomyLevel, {
  label: string;
  dot:   string;
  bg:    string;
  bdr:   string;
  text:  string;
}> = {
  autonoma: {
    label: "Autónoma",
    dot:   "#16a34a",
    bg:    "#f0fdf4",
    bdr:   "#86efac",
    text:  "#166534",
  },
  "semi-autonoma": {
    label: "Semi-autónoma",
    dot:   "#2563eb",
    bg:    "#eff6ff",
    bdr:   "#93c5fd",
    text:  "#1e3a8a",
  },
  supervisada: {
    label: "Supervisada",
    dot:   "#c2410c",
    bg:    "#fff7ed",
    bdr:   "#fdba74",
    text:  "#7c2d12",
  },
  observacion: {
    label: "Observación",
    dot:   "#94a3b8",
    bg:    "#f8fafc",
    bdr:   "#cbd5e1",
    text:  "#475569",
  },
};

// ── Readiness — institutional states ──────────────────────────────────────────

const READINESS: Record<ExpansionReadiness, {
  label: string;
  dot:   string;
  text:  string;
  bg:    string;
  bdr:   string;
}> = {
  "disponible": {
    label: "Disponible",
    dot:   "#16a34a",
    text:  "#166534",
    bg:    "#f0fdf4",
    bdr:   "#86efac",
  },
  "parcialmente-disponible": {
    label: "Parcialmente disponible",
    dot:   "#2563eb",
    text:  "#1e3a8a",
    bg:    "#eff6ff",
    bdr:   "#93c5fd",
  },
  "requiere-configuracion": {
    label: "Requiere configuración",
    dot:   "#94a3b8",
    text:  "#64748b",
    bg:    "#f8fafc",
    bdr:   "#e2e8f0",
  },
};

// ── Section header ─────────────────────────────────────────────────────────────

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
      {/* Section label */}
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

      {/* Status badge with dot */}
      <span style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        fontWeight:    T.wt.medium,
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
          width:        5,
          height:       5,
          borderRadius: "50%",
          background:   badgeDot,
          display:      "inline-block",
          flexShrink:   0,
        }} />
        {badge}
      </span>
    </div>
  );
}

// ── Expand toggle ──────────────────────────────────────────────────────────────

function ExpandToggle({ hidden, onToggle }: { hidden: number; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width:         "100%",
        marginTop:     4,
        padding:       `6px 0`,
        background:    "transparent",
        border:        "none",
        borderTop:     `1px solid ${C.lineSubtle}`,
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        fontWeight:    T.wt.semibold,
        color:         C.inkGhost,
        cursor:        "pointer",
        textAlign:     "center" as const,
        letterSpacing: "0.05em",
      }}
    >
      {hidden > 0 ? `→ ver ${hidden} más` : "↑ contraer"}
    </button>
  );
}

// ── Capability row ─────────────────────────────────────────────────────────────

function CapabilityRow({
  cap,
  accentColor,
  degraded = false,
}: {
  cap:         AgentCapabilityDef;
  accentColor: string;
  degraded?:   boolean;
}) {
  const autonomy    = AUTONOMY[cap.autonomy];
  const borderColor = degraded ? "#c2410c" : accentColor;

  return (
    <div style={{
      display:      "flex",
      gap:          S[3],
      padding:      `10px ${S[3]}px`,
      borderLeft:   `2px solid ${borderColor}${degraded ? "90" : "60"}`,
      background:   degraded ? "rgba(194,65,12,0.03)" : `${accentColor}04`,
      borderRadius: `0 ${R.xs}px ${R.xs}px 0`,
      marginBottom: 6,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* ─ Row 1: name + autonomy badge ─ */}
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
            {cap.name}
          </span>

          <span style={{
            fontFamily:    T.mono,
            fontSize:      "10px",
            fontWeight:    T.wt.semibold,
            color:         autonomy.text,
            background:    autonomy.bg,
            border:        `1px solid ${autonomy.bdr}`,
            borderRadius:  R.pill,
            padding:       "1px 7px",
            letterSpacing: "0.04em",
            lineHeight:    1.7,
            whiteSpace:    "nowrap" as const,
            display:       "inline-flex",
            alignItems:    "center",
            gap:           4,
          }}>
            <span style={{
              width:        4,
              height:       4,
              borderRadius: "50%",
              background:   autonomy.dot,
              display:      "inline-block",
              flexShrink:   0,
            }} />
            {autonomy.label}
          </span>
        </div>

        {/* ─ Row 2: description ─ */}
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          color:        C.inkMid,
          lineHeight:   1.5,
          marginBottom: degraded ? 6 : 5,
        }}>
          {cap.description}
        </div>

        {/* ─ Row 3 (degraded only): operational consequence ─ */}
        {degraded && cap.degradationReason && (
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            color:        "#92400e",
            lineHeight:   1.5,
            marginBottom: 6,
            borderLeft:   "2px solid #fdba74",
            paddingLeft:  8,
            background:   "rgba(253,186,116,0.08)",
            borderRadius: `0 ${R.xs}px ${R.xs}px 0`,
            padding:      `4px 8px`,
          }}>
            {cap.degradationReason}
          </div>
        )}

        {/* ─ Row 4: operational impact ─ */}
        <div style={{
          fontFamily:   T.mono,
          fontSize:     "10px",
          color:        degraded ? "#b45309" : C.inkMid,
          fontStyle:    "italic",
          lineHeight:   1.5,
          marginBottom: 6,
          letterSpacing:"0.01em",
        }}>
          ◆ {cap.operationalImpact}
        </div>

        {/* ─ Row 5: deps + workflows metadata ─ */}
        <div style={{
          display:    "flex",
          flexWrap:   "wrap" as const,
          gap:        4,
          alignItems: "center",
        }}>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      "10px",
            color:         C.inkGhost,
            textTransform: "uppercase" as const,
            letterSpacing: "0.07em",
            marginRight:   1,
          }}>
            Deps
          </span>
          {cap.dependencies.map(dep => (
            <span key={dep} style={{
              fontFamily:   T.mono,
              fontSize:     "10px",
              color:        C.inkMid,
              background:   C.white,
              border:       `1px solid ${C.line}`,
              borderRadius: R.xs,
              padding:      "0px 5px",
              lineHeight:   1.7,
            }}>
              {dep}
            </span>
          ))}

          {cap.workflows.length > 0 && (
            <>
              <span style={{
                width:      1,
                height:     10,
                background: C.lineSubtle,
                margin:     "0 3px",
                flexShrink: 0,
              }} />
              <span style={{
                fontFamily:    T.mono,
                fontSize:      "10px",
                color:         C.inkGhost,
                textTransform: "uppercase" as const,
                letterSpacing: "0.07em",
                marginRight:   1,
              }}>
                Flujos
              </span>
              {cap.workflows.map(wf => (
                <span key={wf} style={{
                  fontFamily:   T.mono,
                  fontSize:     "10px",
                  color:        accentColor,
                  background:   `${accentColor}0C`,
                  border:       `1px solid ${accentColor}20`,
                  borderRadius: R.xs,
                  padding:      "0px 5px",
                  lineHeight:   1.7,
                }}>
                  {wf}
                </span>
              ))}
            </>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Expansion card ─────────────────────────────────────────────────────────────

function ExpansionCard({
  exp,
  accentColor,
  index,
}: {
  exp:         AgentCapabilityExpansion;
  accentColor: string;
  index:       number;
}) {
  const readiness = READINESS[exp.readiness];
  const isReady   = exp.readiness !== "requiere-configuracion";

  return (
    <div style={{
      /* Solid, elevated — NOT dashed/placeholder */
      background:   "linear-gradient(180deg, #ffffff 0%, #fafbfd 100%)",
      border:       `1px solid #e8edf5`,
      borderRadius: R.card,
      boxShadow:    `0 1px 3px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,74,173,0.025)`,
      padding:      `${S[3]}px ${S[3]}px ${S[2]}px`,
      display:      "flex",
      flexDirection:"column" as const,
      gap:          10,
      /* Subtle accent top stripe for strategic feel */
      borderTop:    `2px solid ${accentColor}25`,
    }}>

      {/* ─ Header: index + name + readiness ─ */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: S[2] }}>
        <div>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      "10px",
            fontWeight:    T.wt.semibold,
            color:         `${accentColor}80`,
            letterSpacing: "0.1em",
            textTransform: "uppercase" as const,
            marginBottom:  2,
            display:       "block",
          }}>
            EXP {String(index + 1).padStart(2, "0")}
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

        {/* Readiness state — dot + label */}
        <span style={{
          fontFamily:    T.mono,
          fontSize:      "10px",
          fontWeight:    T.wt.semibold,
          color:         readiness.text,
          background:    readiness.bg,
          border:        `1px solid ${readiness.bdr}`,
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
            width:        4,
            height:       4,
            borderRadius: "50%",
            background:   readiness.dot,
            display:      "inline-block",
            flexShrink:   0,
          }} />
          {readiness.label}
        </span>
      </div>

      {/* ─ Unlocks — strategic capability description ─ */}
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

      {/* ─ Impact chips ─ */}
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

      {/* ─ Requirements ─ */}
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
              fontFamily: T.mono,
              fontSize:   "10px",
              color:      C.inkMid,
              lineHeight: 1.5,
              display:    "flex",
              alignItems: "flex-start",
              gap:        5,
            }}>
              <span style={{ color: C.inkGhost, flexShrink: 0 }}>—</span>
              {req}
            </div>
          ))}
        </div>
      </div>

      {/* ─ CTA — strategic action, intentional styling, not-yet-active ─ */}
      <div style={{
        borderTop:  `1px solid #eef1f7`,
        paddingTop: 8,
        marginTop:  2,
        display:    "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <span
          style={{
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
          }}
        >
          Incorporar capacidad →
        </span>

        {/* Subtle readiness indicator text */}
        {!isReady && (
          <span style={{
            fontFamily: T.mono,
            fontSize:   "10px",
            color:      C.inkGhost,
            fontStyle:  "italic",
          }}>
            Configuración requerida
          </span>
        )}
      </div>

    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function AgentCapabilitiesTab({ agent }: { agent: CopilotAgent }) {
  const { capabilities, available } = agent.capabilitySystem;

  const active   = capabilities.filter(c => c.status === "active");
  const degraded = capabilities.filter(c => c.status === "degraded" || c.status === "partial");

  const [activeExpanded,   setActiveExpanded]   = useState(false);
  const [degradedExpanded, setDegradedExpanded] = useState(false);

  const visibleActive   = activeExpanded   ? active   : active.slice(0, DEFAULT_VISIBLE);
  const visibleDegraded = degradedExpanded ? degraded : degraded.slice(0, DEFAULT_VISIBLE);

  const hiddenActive   = active.length   - visibleActive.length;
  const hiddenDegraded = degraded.length - visibleDegraded.length;

  return (
    <div style={{ display: "flex", flexDirection: "column" as const, gap: S[5] }}>

      {/* ══ Section 1 — Capacidades activas ════════════════════════════════════ */}
      <div>
        <SectionHeader
          label="Capacidades activas"
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
          {visibleActive.map(cap => (
            <CapabilityRow
              key={cap.id}
              cap={cap}
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

      {/* ══ Section 2 — Capacidades degradadas ═════════════════════════════════ */}
      {degraded.length > 0 && (
        <div>
          <SectionHeader
            label="Capacidades degradadas"
            count={degraded.length}
            badge="Capacidad reducida"
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
            {visibleDegraded.map(cap => (
              <CapabilityRow
                key={cap.id}
                cap={cap}
                accentColor={agent.accentColor}
                degraded
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

      {/* ══ Section 3 — Expansiones disponibles ════════════════════════════════ */}
      {available.length > 0 && (
        <div>
          <SectionHeader
            label="Expansiones disponibles"
            count={available.length}
            badge="No activas"
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
