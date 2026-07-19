"use client";

/**
 * components/copilot/copilot-agent-presence.tsx
 *
 * Agentik Copilot — Agent Presence
 * Sprint: AGENTIK-COPILOT-AGENT-OFFICE-01
 *
 * Compact status block that communicates the agent is alive and working.
 * Estado / Enfoque actual / Prioridad / Confianza / Última actualización.
 * All data derived from ViewModel — no timers, no real-time, no persistence.
 */

import { useState, useEffect }    from "react";
import { C, T, S, R }             from "@/lib/ui/tokens";
import type { CopilotAgentCard }  from "@/lib/copilot/viewmodel";
import type { CopilotSummary }    from "@/lib/copilot/viewmodel";

// ── Domain labels ─────────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  bancos:       "Bancos",
  cartera:      "Cartera",
  conciliacion: "Conciliación",
  pagos:        "Pagos",
  cierre:       "Cierre",
  tesoreria:    "Tesorería",
  planeacion:   "Planeación",
  clientes:     "Clientes",
  proveedores:  "Proveedores",
  inventario:   "Inventario",
  ventas:       "Ventas",
  compras:      "Compras",
  nomina:       "Nómina",
  fiscal:       "Fiscal",
  recaudos:     "Recaudos",
  productos:    "Productos",
  marketing:    "Marketing",
  produccion:   "Producción",
  tareas:       "Tareas",
  alertas:      "Alertas",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotAgentPresenceProps {
  leadAgent:   CopilotAgentCard;
  summary:     CopilotSummary;
  generatedAt: Date;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotAgentPresence({
  leadAgent,
  summary,
  generatedAt,
}: CopilotAgentPresenceProps) {
  // Derive presence fields from ViewModel
  const focusDomain      = summary.activeDomains[0];
  const focusLabel       = focusDomain ? (DOMAIN_LABELS[focusDomain] ?? focusDomain) : "General";
  const priority         = summary.attentionCount > 0 ? "Alta"
                         : summary.totalSuggestions > 3 ? "Media"
                         : "Normal";
  const priorityColor    = priority === "Alta"   ? C.amber
                         : priority === "Media"  ? C.blue
                         : C.inkFaint;
  const confidenceLabel  = summary.readiness === "ready"   ? "Alta"
                         : summary.readiness === "partial" ? "Media"
                         : "Baja";
  const confidenceColor  = summary.readiness === "ready"   ? C.green
                         : summary.readiness === "partial" ? C.amber
                         : C.inkFaint;
  // Defer locale formatting to post-mount — toLocaleTimeString("es-CO") differs
  // between Node.js server and browser, causing a hydration mismatch if rendered inline.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const timeStr = mounted
    ? generatedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <div style={{
      padding:   `${S[3]}px ${S[5]}px`,
      background: C.surface,
      borderTop: `1px solid ${C.line}`,
    }}>
      {/* Header */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:           S[2],
        marginBottom: S[3],
      }}>
        <div style={{
          width:        7,
          height:       7,
          borderRadius: "50%",
          background:   C.green,
          display:      "inline-block",
          flexShrink:   0,
          boxShadow:    `0 0 0 2px ${C.greenLight}`,
        }} />
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.semibold,
          color:         C.inkLight,
          textTransform: "uppercase" as const,
          letterSpacing: "0.07em",
          flex:          1,
        }}>
          Presencia · {leadAgent.agentName}
        </span>
      </div>

      {/* 2×2 grid */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 1fr",
        gap:                 `${S[2]}px ${S[4]}px`,
        marginBottom:        S[2],
      }}>
        <PresenceRow label="Estado"         value="Trabajando"     valueColor={C.green}          />
        <PresenceRow label="Enfoque actual"  value={focusLabel}     valueColor={C.ink}             />
        <PresenceRow label="Prioridad"       value={priority}       valueColor={priorityColor}     />
        <PresenceRow label="Confianza"       value={confidenceLabel} valueColor={confidenceColor}  />
      </div>

      {/* Timestamp footer */}
      <div style={{
        display:        "flex",
        justifyContent: "space-between",
        paddingTop:     S[2],
        borderTop:      `1px solid ${C.lineSubtle}`,
      }}>
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      C.inkGhost,
        }}>
          Última actualización
        </span>
        <span
          suppressHydrationWarning
          style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      C.inkFaint,
            fontWeight: T.wt.medium,
          }}
        >
          {timeStr}
        </span>
      </div>
    </div>
  );
}

// ── Row sub-component ─────────────────────────────────────────────────────────

function PresenceRow({
  label,
  value,
  valueColor,
}: {
  label:      string;
  value:      string;
  valueColor: string;
}) {
  return (
    <div>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        color:         C.inkGhost,
        letterSpacing: "0.05em",
        marginBottom:  2,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily:  T.mono,
        fontSize:    T.sz.xs,
        fontWeight:  T.wt.medium,
        color:       valueColor,
      }}>
        {value}
      </div>
    </div>
  );
}
