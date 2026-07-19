"use client";

/**
 * components/copilot/copilot-agent-status.tsx
 *
 * Agentik Copilot — Agent Status Bar
 * Sprint: AGENTIK-COPILOT-AGENT-OFFICE-01
 *
 * Communicates operational status of the agent: what they're working on,
 * last activity, and next objective. No React state. No timers. No API calls.
 * Content derived entirely from CopilotViewModel slices.
 */

import { C, T, S, R }             from "@/lib/ui/tokens";
import type { CopilotAgentCard }  from "@/lib/copilot/viewmodel";
import type { CopilotSummary }    from "@/lib/copilot/viewmodel";
import { BASE_LANGUAGE }          from "@/lib/copilot/language";

// ── Domain labels (local) ─────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  bancos:       "bancos",
  cartera:      "cartera",
  conciliacion: "conciliaciones",
  pagos:        "pagos",
  cierre:       "cierre",
  tesoreria:    "tesorería",
  planeacion:   "planeación",
  clientes:     "clientes",
  proveedores:  "proveedores",
  inventario:   "inventario",
  ventas:       "ventas",
  compras:      "compras",
  nomina:       "nómina",
  fiscal:       "fiscal",
  recaudos:     "recaudos",
  productos:    "productos",
  marketing:    "marketing",
  produccion:   "producción",
  tareas:       "tareas",
  alertas:      "alertas",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildActivityLine(summary: CopilotSummary): string {
  const top = summary.activeDomains.slice(0, 3).map(d => DOMAIN_LABELS[d] ?? d);
  if (top.length === 0) return "Analizando el contexto operativo activo.";
  if (top.length === 1) return `Analizando ${top[0]} en el contexto actual.`;
  const last    = top[top.length - 1];
  const rest    = top.slice(0, -1).join(", ");
  return `Analizando ${rest} y ${last} en el contexto actual.`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotAgentStatusProps {
  leadAgent:            CopilotAgentCard;
  summary:              CopilotSummary;
  nextObjectiveTitle?:  string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotAgentStatus({
  leadAgent,
  summary,
  nextObjectiveTitle,
}: CopilotAgentStatusProps) {
  const activityLine = buildActivityLine(summary);

  return (
    <div style={{
      display:      "flex",
      gap:           S[4],
      alignItems:   "flex-start",
      padding:      `${S[3]}px ${S[5]}px`,
      background:   C.white,
      borderBottom: `1px solid ${C.line}`,
    }}>
      {/* Status thread indicator */}
      <div style={{
        display:        "flex",
        flexDirection:  "column" as const,
        alignItems:     "center",
        gap:             3,
        flexShrink:     0,
        paddingTop:     4,
      }}>
        {/* Live dot */}
        <div style={{
          width:        10,
          height:       10,
          borderRadius: "50%",
          background:   C.green,
          boxShadow:    `0 0 0 3px ${C.greenLight}`,
          flexShrink:   0,
        }} />
        {/* Thread line */}
        <div style={{
          width:      1,
          flex:       1,
          minHeight:  28,
          background: `linear-gradient(to bottom, ${C.green}50, transparent)`,
        }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Status label */}
        <div style={{
          display:      "flex",
          alignItems:   "center",
          gap:           S[2],
          marginBottom: S[1] + 2,
        }}>
          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.sm,
            fontWeight:  T.wt.semibold,
            color:       C.green,
          }}>
            {leadAgent.agentName} {BASE_LANGUAGE["agent_working"]}
          </span>
          <span style={{
            fontFamily:   T.mono,
            fontSize:     T.sz["2xs"],
            color:        C.inkGhost,
            background:   C.surface,
            border:       `1px solid ${C.line}`,
            borderRadius: R.pill,
            padding:      "1px 6px",
          }}>
            {BASE_LANGUAGE["agent_in_progress_badge"]}
          </span>
        </div>

        {/* Activity description */}
        <div style={{
          fontFamily:   T.sans,
          fontSize:     T.sz.base,
          color:        C.inkMid,
          lineHeight:   1.55,
          marginBottom: S[3],
        }}>
          {activityLine}
        </div>

        {/* Meta row: last update + next objective */}
        <div style={{
          display:  "flex",
          gap:       S[5],
          flexWrap: "wrap" as const,
        }}>
          <MetaField label={BASE_LANGUAGE["last_update_label"]} value={BASE_LANGUAGE["last_update_value"]} />
          {nextObjectiveTitle && (
            <MetaField label={BASE_LANGUAGE["next_objective_label"]} value={nextObjectiveTitle} truncate />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Meta field ────────────────────────────────────────────────────────────────

function MetaField({
  label,
  value,
  truncate = false,
}: {
  label:     string;
  value:     string;
  truncate?: boolean;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        color:         C.inkGhost,
        letterSpacing: "0.06em",
        textTransform: "uppercase" as const,
        marginBottom:  2,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        color:        C.inkFaint,
        fontWeight:   T.wt.medium,
        ...(truncate ? {
          overflow:     "hidden",
          textOverflow: "ellipsis",
          whiteSpace:   "nowrap" as const,
          maxWidth:     180,
        } : {}),
      }}>
        {value}
      </div>
    </div>
  );
}
