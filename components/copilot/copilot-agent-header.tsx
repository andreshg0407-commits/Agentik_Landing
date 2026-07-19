"use client";

/**
 * components/copilot/copilot-agent-header.tsx
 *
 * Agentik Copilot — Agent Header
 * Sprint: AGENTIK-COPILOT-PANEL-01
 *
 * Displays the lead agent identity, role, active domains, and support agents.
 * Reads only from CopilotAgentCard (ViewModel layer). No direct runtime access.
 */

import Image                        from "next/image";
import { C, T, S, R }              from "@/lib/ui/tokens";
import type { CopilotAgentCard }    from "@/lib/copilot/viewmodel";
import type { AgentTone }           from "@/lib/copilot/knowledge/agent-definition";
import type { DomainId }            from "@/lib/copilot/knowledge/domain-registry";

// ── Domain display labels ─────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<DomainId, string> = {
  ventas:        "Ventas",
  clientes:      "Clientes",
  productos:     "Productos",
  inventario:    "Inventario",
  compras:       "Compras",
  cartera:       "Cartera",
  pagos:         "Pagos",
  recaudos:      "Recaudos",
  bancos:        "Bancos",
  marketing:     "Marketing",
  produccion:    "Producción",
  conciliacion:  "Conciliación",
  tareas:        "Tareas",
  alertas:       "Alertas",
};

// ── Tone → accent color ───────────────────────────────────────────────────────

const TONE_ACCENT: Record<AgentTone, string> = {
  analitico:  C.blueDark,
  ejecutivo:  C.titleDeep,
  comercial:  C.green,
  tecnico:    C.inkMid,
  operativo:  C.amber,
  creativo:   C.brand,
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotAgentHeaderProps {
  leadAgent:     CopilotAgentCard;
  supportAgents: CopilotAgentCard[];
  activeDomains: DomainId[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotAgentHeader({
  leadAgent,
  supportAgents,
  activeDomains,
}: CopilotAgentHeaderProps) {
  const accent  = TONE_ACCENT[leadAgent.tone] ?? C.blueDark;
  const initials = leadAgent.agentName.slice(0, 2).toUpperCase();

  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:           S[3],
      padding:      `${S[3]}px ${S[4]}px`,
      borderBottom: `1px solid ${C.line}`,
    }}>
      {/* Avatar */}
      <div style={{
        position:     "relative",
        width:         36,
        height:        36,
        borderRadius:  R.pill,
        overflow:      "hidden",
        flexShrink:    0,
        border:       `2px solid ${accent}`,
        background:    C.surface,
        display:       "flex",
        alignItems:    "center",
        justifyContent:"center",
      }}>
        <Image
          src={`/agents/${leadAgent.agentId}.png`}
          alt={leadAgent.agentName}
          fill
          style={{ objectFit: "cover" }}
          onError={() => {/* falls back to initials via parent background */}}
        />
        {/* Initials fallback (shown when image fails) */}
        <span style={{
          position:    "absolute",
          fontFamily:  T.mono,
          fontSize:    T.sz.sm,
          fontWeight:  T.wt.semibold,
          color:       accent,
          lineHeight:  1,
          userSelect:  "none",
        }}>
          {initials}
        </span>
      </div>

      {/* Identity block */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Agent name + status dot */}
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.md,
            fontWeight:  T.wt.semibold,
            color:       C.ink,
          }}>
            {leadAgent.agentName}
          </span>
          <span style={{
            width:        5,
            height:       5,
            borderRadius: R.pill,
            background:   C.green,
            flexShrink:   0,
          }} />
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      C.green,
          }}>
            Activo
          </span>
        </div>

        {/* Role */}
        <div style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          color:        C.inkLight,
          marginTop:     2,
          whiteSpace:   "nowrap",
          overflow:     "hidden",
          textOverflow: "ellipsis",
        }}>
          {leadAgent.role}
        </div>

        {/* Active domains */}
        {activeDomains.length > 0 && (
          <div style={{
            display:    "flex",
            flexWrap:   "wrap",
            gap:         4,
            marginTop:   S[2],
          }}>
            {activeDomains.map(d => (
              <span key={d} style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                color:        C.blueDark,
                background:   C.blueLight,
                border:      `1px solid ${C.blueBorder}`,
                borderRadius:  R.sm,
                padding:      "2px 6px",
              }}>
                {DOMAIN_LABELS[d] ?? d}
              </span>
            ))}
          </div>
        )}

        {/* Support agents */}
        {supportAgents.length > 0 && (
          <div style={{
            display:    "flex",
            alignItems: "center",
            gap:         S[1],
            marginTop:   S[2],
          }}>
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              color:      C.inkFaint,
            }}>
              Soporte:
            </span>
            {supportAgents.slice(0, 3).map((a, i) => (
              <span key={a.agentId} style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      C.inkLight,
              }}>
                {a.agentName}{i < Math.min(supportAgents.length, 3) - 1 ? " ·" : ""}
              </span>
            ))}
            {supportAgents.length > 3 && (
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      C.inkFaint,
              }}>
                +{supportAgents.length - 3}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Accent bar */}
      <div style={{
        width:        3,
        height:        32,
        borderRadius:  R.sm,
        background:    accent,
        flexShrink:    0,
        alignSelf:     "center",
      }} />
    </div>
  );
}
