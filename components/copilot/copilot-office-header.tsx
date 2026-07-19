"use client";

/**
 * components/copilot/copilot-office-header.tsx
 *
 * Agentik Copilot — Agent Office Header
 * Sprint: AGENTIK-COPILOT-EXPERIENCE-01
 *
 * The identity and presence block for the Agent Office.
 * Communicates who the agent is, what they're working on, and current status.
 * Reads only from CopilotViewModel slices — no runtime, no engine.
 */

import { useState }              from "react";
import { C, T, S, R }            from "@/lib/ui/tokens";
import type { CopilotAgentCard } from "@/lib/copilot/viewmodel";
import type { CopilotSummary }   from "@/lib/copilot/viewmodel";
import type { DomainId }         from "@/lib/copilot/knowledge/domain-registry";

// ── Domain labels ─────────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<DomainId, string> = {
  ventas:       "Ventas",
  clientes:     "Clientes",
  productos:    "Productos",
  inventario:   "Inventario",
  compras:      "Compras",
  cartera:      "Cartera",
  pagos:        "Pagos",
  recaudos:     "Recaudos",
  bancos:       "Bancos",
  marketing:    "Marketing",
  produccion:   "Producción",
  conciliacion: "Conciliación",
  tareas:       "Tareas",
  alertas:      "Alertas",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotOfficeHeaderProps {
  leadAgent:     CopilotAgentCard;
  supportAgents: CopilotAgentCard[];
  summary:       CopilotSummary;
  module:        string;
  isPreview?:    boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotOfficeHeader({
  leadAgent,
  supportAgents,
  summary,
  module,
  isPreview = false,
}: CopilotOfficeHeaderProps) {
  const [imgFailed, setImgFailed] = useState(false);

  // Build contextual description from active domains
  const topDomains    = summary.activeDomains.slice(0, 3);
  const domainLabels  = topDomains.map(d => DOMAIN_LABELS[d] ?? d).join(", ");
  const contextLine   = domainLabels
    ? `Estoy revisando ${domainLabels.toLowerCase()} en este contexto.`
    : "Estoy revisando el contexto actual del módulo.";

  const hasAttention  = summary.attentionCount > 0;
  const statusLine    = hasAttention
    ? `${summary.attentionCount} tema${summary.attentionCount > 1 ? "s" : ""} requiere${summary.attentionCount > 1 ? "n" : ""} atención`
    : "Sin alertas activas en este contexto";

  const initials = leadAgent.agentName.slice(0, 2).toUpperCase();

  return (
    <div style={{
      background:   "linear-gradient(160deg, #001535 0%, #002460 60%, #002E7A 100%)",
      padding:      `${S[5]}px ${S[5]}px ${S[4]}px`,
      position:     "relative" as const,
      overflow:     "hidden",
    }}>
      {/* Radial glow */}
      <div style={{
        position:      "absolute" as const,
        inset:         0,
        background:    "radial-gradient(ellipse at 90% 40%, rgba(0,74,173,.22) 0%, transparent 65%)",
        pointerEvents: "none" as const,
      }} />

      {/* Top row: module + status pill */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        marginBottom:   S[4],
        position:       "relative" as const,
        zIndex:         1,
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         "rgba(148,163,184,.50)",
          letterSpacing: "0.10em",
          textTransform: "uppercase" as const,
        }}>
          {module || "Contexto activo"}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          {isPreview && (
            <span style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              color:         C.amberDark,
              background:    "rgba(217,119,6,.18)",
              border:        "1px solid rgba(217,119,6,.30)",
              borderRadius:  R.pill,
              padding:       "2px 7px",
              letterSpacing: "0.04em",
            }}>
              Preview
            </span>
          )}
          <div style={{
            display:      "flex",
            alignItems:   "center",
            gap:           4,
            background:   "rgba(255,255,255,.06)",
            border:       "1px solid rgba(255,255,255,.10)",
            borderRadius: R.pill,
            padding:      "3px 8px",
          }}>
            <span style={{
              width:        5,
              height:       5,
              borderRadius: "50%",
              background:   hasAttention ? "#f59e0b" : "#22c55e",
              display:      "inline-block",
              flexShrink:   0,
            }} />
            <span style={{
              fontFamily:    T.mono,
              fontSize:      T.sz["2xs"],
              color:         "rgba(148,163,184,.80)",
              letterSpacing: "0.04em",
            }}>
              {statusLine}
            </span>
          </div>
        </div>
      </div>

      {/* Agent identity row */}
      <div style={{
        display:    "flex",
        alignItems: "flex-start",
        gap:         S[4],
        position:   "relative" as const,
        zIndex:     1,
      }}>
        {/* Avatar */}
        <div style={{
          width:          52,
          height:         52,
          borderRadius:   "50%",
          overflow:       "hidden",
          border:         "2px solid rgba(0,74,173,.50)",
          flexShrink:     0,
          background:     "linear-gradient(135deg, #004AAD 0%, #002460 100%)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          position:       "relative" as const,
        }}>
          {!imgFailed && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/agents/${leadAgent.agentId}.png`}
              alt={leadAgent.agentName}
              width={52}
              height={52}
              onError={() => setImgFailed(true)}
              style={{
                position:      "absolute" as const,
                inset:         0,
                width:         "100%",
                height:        "100%",
                objectFit:     "cover",
                objectPosition:"top center",
                display:       "block",
              }}
            />
          )}
          {imgFailed && (
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xl,
              fontWeight: T.wt.bold,
              color:      "#fff",
              lineHeight: 1,
            }}>
              {initials}
            </span>
          )}
        </div>

        {/* Name + role + context */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz["2xl"],
            fontWeight:   T.wt.bold,
            color:        "rgba(235,238,246,.96)",
            lineHeight:   1.1,
            marginBottom: 3,
          }}>
            {leadAgent.agentName}
          </div>
          <div style={{
            fontFamily:    T.mono,
            fontSize:      T.sz.sm,
            fontWeight:    T.wt.medium,
            color:         "rgba(148,163,184,.70)",
            letterSpacing: "0.04em",
            marginBottom:  S[2],
          }}>
            {leadAgent.role}
          </div>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      "rgba(148,163,184,.52)",
            lineHeight: 1.5,
          }}>
            {contextLine}
          </div>
        </div>
      </div>

      {/* Domain chips + support agents strip */}
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:         S[2],
        marginTop:  S[4],
        paddingTop: S[3],
        borderTop:  "1px solid rgba(255,255,255,.07)",
        position:   "relative" as const,
        zIndex:     1,
        flexWrap:   "wrap" as const,
      }}>
        {summary.activeDomains.slice(0, 4).map(d => (
          <span key={d} style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            color:         "rgba(148,163,184,.70)",
            background:    "rgba(255,255,255,.06)",
            border:        "1px solid rgba(255,255,255,.10)",
            borderRadius:  R.pill,
            padding:       "2px 7px",
            letterSpacing: "0.04em",
          }}>
            {DOMAIN_LABELS[d] ?? d}
          </span>
        ))}

        {supportAgents.length > 0 && (
          <>
            <span style={{ color: "rgba(255,255,255,.15)", fontSize: T.sz.base }}>·</span>
            {supportAgents.slice(0, 2).map(agent => (
              <span key={agent.agentId} style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                color:         "rgba(148,163,184,.45)",
                letterSpacing: "0.03em",
              }}>
                {agent.agentName}
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
