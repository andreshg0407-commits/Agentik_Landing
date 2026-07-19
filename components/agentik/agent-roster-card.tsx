/**
 * components/agentik/agent-roster-card.tsx
 *
 * Agentik AI Executive Roster — Agent Strip Card
 *
 * Sprint: AGENTIK-AGENTS-ROSTER-FOUNDATION-02 (Horizontal Strip Redesign)
 *
 * Full-width horizontal strip. Three sections per card:
 *   A — Identity: circular avatar · name · specialty · state chip
 *   B — Data row: RUNTIME (bar) · MEMORIA · WORKFLOWS · INTEGRACIONES
 *   C — Foco Actual footer strip: focus sentence · "Ver workspace →"
 *
 * Server Component — no 'use client' required.
 */

import Image from "next/image";
import Link  from "next/link";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import type { CopilotAgent, AgentRuntimeState } from "@/lib/copilot/agents";

// ── State visual config ────────────────────────────────────────────────────────

interface StateConfig {
  label:      string;
  chipBg:     string;
  chipColor:  string;
  chipBorder: string;
  barFill:    number;   // 0–100
  barColor:   string;
  runtimeText: string;
  dimmed?:    boolean;
}

const STATE_CONFIG: Record<AgentRuntimeState, StateConfig> = {
  active: {
    label:       "ACTIVO",
    chipBg:      C.greenLight,
    chipColor:   C.green,
    chipBorder:  C.greenBorder,
    barFill:     95,
    barColor:    C.green,
    runtimeText: "Saludable",
  },
  syncing: {
    label:       "SINCRONIZANDO",
    chipBg:      C.blueLight,
    chipColor:   C.blueDark,
    chipBorder:  C.blueBorder,
    barFill:     65,
    barColor:    C.blueDark,
    runtimeText: "Sincronizando...",
  },
  degraded: {
    label:       "DEGRADADO",
    chipBg:      C.amberLight,
    chipColor:   C.amberDark,
    chipBorder:  C.amberBorder,
    barFill:     30,
    barColor:    C.amber,
    runtimeText: "Capacidades reducidas",
  },
  supervised: {
    label:       "SUPERVISADO",
    chipBg:      C.brandLight,
    chipColor:   C.brand,
    chipBorder:  C.brandBorder,
    barFill:     70,
    barColor:    C.brand,
    runtimeText: "Esperando aprobación",
  },
  offline: {
    label:       "OFFLINE",
    chipBg:      C.surface,
    chipColor:   C.inkLight,
    chipBorder:  C.line,
    barFill:     0,
    barColor:    C.inkGhost,
    runtimeText: "Desactivado",
    dimmed:      true,
  },
  learning: {
    label:       "APRENDIENDO",
    chipBg:      C.blueLight,
    chipColor:   C.blue,
    chipBorder:  C.blueBorder,
    barFill:     60,
    barColor:    C.blue,
    runtimeText: "Procesando datos",
  },
};

// ── Shared label style ─────────────────────────────────────────────────────────

const colLabel = {
  fontFamily:    T.mono,
  fontSize:      T.sz["2xs"],
  fontWeight:    T.wt.semibold,
  color:         C.inkFaint,
  textTransform: "uppercase" as const,
  letterSpacing: "0.07em",
  marginBottom:  4,
};

// ── Component ──────────────────────────────────────────────────────────────────

export function AgentRosterCard({
  agent,
  orgSlug,
}: {
  agent:   CopilotAgent;
  orgSlug: string;
}) {
  const st        = STATE_CONFIG[agent.runtimeState];
  const isOffline = agent.runtimeState === "offline";

  return (
    <div style={{
      background:    C.white,
      border:        `1px solid ${C.line}`,
      borderRadius:  R.card,
      boxShadow:     E.sm,
      overflow:      "hidden",
      opacity:       st.dimmed ? 0.6 : 1,
      display:       "flex",
      flexDirection: "column" as const,
      /* Subtle left accent stripe via box-shadow — preserves full border radius */
      borderLeft:    `3px solid ${agent.accentColor}`,
    }}>

      {/* ── SECTION A — Identity ──────────────────────────────────────────────── */}
      <div style={{
        display:     "flex",
        alignItems:  "center",
        gap:         S[4],
        padding:     `${S[4]}px ${S[5]}px`,
        paddingBottom: S[3],
      }}>

        {/* Avatar — 64px circular */}
        {agent.photo ? (
          <div style={{
            width:        64,
            height:       64,
            borderRadius: "50%",
            overflow:     "hidden",
            flexShrink:   0,
            border:       `2px solid ${agent.accentColor}30`,
            boxShadow:    `0 0 0 3px ${agent.accentColor}12, 0 2px 8px rgba(0,0,0,0.10)`,
          }}>
            <Image
              src={agent.photo}
              alt={agent.name}
              width={64}
              height={64}
              style={{ objectFit: "cover", objectPosition: "top center", display: "block" }}
            />
          </div>
        ) : (
          <div style={{
            width:          64,
            height:         64,
            borderRadius:   "50%",
            flexShrink:     0,
            background:     `linear-gradient(135deg, ${agent.accentColor}EE 0%, ${agent.accentColor}88 100%)`,
            border:         `2px solid ${agent.accentColor}30`,
            boxShadow:      `0 0 0 3px ${agent.accentColor}12, 0 2px 8px rgba(0,0,0,0.10)`,
            display:        "flex",
            alignItems:     "center",
            justifyContent: "center",
          }}>
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz["2xl"],
              fontWeight: T.wt.black,
              color:      C.white,
              lineHeight: 1,
            }}>
              {agent.avatar}
            </span>
          </div>
        )}

        {/* Name + specialty + scope — takes remaining space */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            fontWeight:    T.wt.semibold,
            color:         agent.accentColor,
            letterSpacing: "0.07em",
            textTransform: "uppercase" as const,
            marginBottom:  2,
          }}>
            {agent.specialty}
          </div>
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xl,
            fontWeight:   T.wt.bold,
            color:        C.ink,
            lineHeight:   1.1,
            marginBottom: 3,
          }}>
            {agent.name}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      C.inkLight,
          }}>
            {agent.operationalScope.join(" · ")}
          </div>
        </div>

        {/* State chip — right-aligned */}
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          fontWeight:    T.wt.semibold,
          color:         st.chipColor,
          background:    st.chipBg,
          border:        `1px solid ${st.chipBorder}`,
          borderRadius:  R.pill,
          padding:       "3px 10px",
          letterSpacing: "0.06em",
          flexShrink:    0,
          lineHeight:    1.6,
          whiteSpace:    "nowrap" as const,
          alignSelf:     "flex-start",
        }}>
          {st.label}
        </span>

      </div>

      {/* ── SECTION B — 4-column data row ────────────────────────────────────── */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 1fr 1fr 2fr",
        gap:                 0,
        padding:             `${S[3]}px ${S[5]}px`,
        borderTop:           `1px solid ${C.lineSubtle}`,
        borderBottom:        `1px solid ${C.lineSubtle}`,
        background:          C.surface,
      }}>

        {/* RUNTIME */}
        <div style={{ padding: `${S[1]}px ${S[3]}px ${S[1]}px 0`, borderRight: `1px solid ${C.lineSubtle}` }}>
          <div style={colLabel}>Runtime</div>
          <div style={{
            height:       5,
            background:   C.lineSubtle,
            borderRadius: R.pill,
            overflow:     "hidden",
            marginBottom: 4,
          }}>
            <div style={{
              width:        `${st.barFill}%`,
              height:       "100%",
              background:   st.barColor,
              borderRadius: R.pill,
            }} />
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      st.barColor,
            fontWeight: T.wt.semibold,
          }}>
            {st.runtimeText}
          </div>
        </div>

        {/* MEMORIA */}
        <div style={{ padding: `${S[1]}px ${S[3]}px`, borderRight: `1px solid ${C.lineSubtle}` }}>
          <div style={colLabel}>Memoria</div>
          <div style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.lg,
            fontWeight:  T.wt.bold,
            color:       agent.memoryCount > 0 ? C.ink : C.inkGhost,
            lineHeight:  1.1,
            marginBottom: 2,
          }}>
            {agent.memoryCount}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      C.inkFaint,
          }}>
            {agent.memoryCount > 0 ? "patrones" : "sin datos"}
          </div>
        </div>

        {/* WORKFLOWS */}
        <div style={{ padding: `${S[1]}px ${S[3]}px`, borderRight: `1px solid ${C.lineSubtle}` }}>
          <div style={colLabel}>Workflows</div>
          <div style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.lg,
            fontWeight:  T.wt.bold,
            color:       agent.workflowCount > 0 ? C.ink : C.inkGhost,
            lineHeight:  1.1,
            marginBottom: 2,
          }}>
            {agent.workflowCount}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      C.inkFaint,
          }}>
            {agent.workflowCount > 0 ? "activos" : "sin flujos"}
          </div>
        </div>

        {/* INTEGRACIONES */}
        <div style={{ padding: `${S[1]}px 0 ${S[1]}px ${S[3]}px` }}>
          <div style={colLabel}>Integraciones</div>
          <div style={{
            display:    "flex",
            flexWrap:   "wrap" as const,
            gap:        4,
            alignItems: "center",
          }}>
            {agent.integrations.map(intg => (
              <span key={intg} style={{
                fontFamily:   T.mono,
                fontSize:     T.sz["2xs"],
                color:        C.inkMid,
                background:   C.white,
                border:       `1px solid ${C.line}`,
                borderRadius: R.xs,
                padding:      "1px 7px",
                lineHeight:   1.6,
              }}>
                {intg}
              </span>
            ))}
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz["2xs"],
              color:      C.inkFaint,
            }}>
              {agent.integrations.length} activa{agent.integrations.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

      </div>

      {/* ── SECTION C — Foco Actual footer ───────────────────────────────────── */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        gap:            S[4],
        padding:        `${S[2] + 2}px ${S[5]}px`,
        background:     C.surface,
      }}>

        {/* Foco label + sentence */}
        <div style={{
          display:    "flex",
          alignItems: "baseline",
          gap:        S[2],
          flex:       1,
          minWidth:   0,
        }}>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            fontWeight:    T.wt.semibold,
            color:         agent.accentColor,
            letterSpacing: "0.07em",
            textTransform: "uppercase" as const,
            flexShrink:    0,
          }}>
            Foco Actual
          </span>
          <span style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            color:        C.inkLight,
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap" as const,
          }}>
            {agent.currentFocus}
          </span>
        </div>

        {/* CTA */}
        {isOffline ? (
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      C.inkGhost,
            flexShrink: 0,
          }}>
            Desactivado
          </span>
        ) : (
          <Link
            href={`/${orgSlug}/agentik/agentes/${agent.id}`}
            style={{
              fontFamily:     T.mono,
              fontSize:       T.sz.xs,
              fontWeight:     T.wt.semibold,
              color:          agent.accentColor,
              textDecoration: "none",
              display:        "inline-flex",
              alignItems:     "center",
              gap:            4,
              flexShrink:     0,
              whiteSpace:     "nowrap" as const,
            }}
          >
            Ver workspace
            <span style={{ fontSize: "0.85em" }}>→</span>
          </Link>
        )}

      </div>

    </div>
  );
}
