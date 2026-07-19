"use client";

/**
 * components/copilot/copilot-memory-timeline.tsx
 *
 * Agentik Copilot — Agent Memory Timeline
 * Sprint: AGENTIK-COPILOT-AGENT-OFFICE-01
 *
 * "Lo último que hice" — a short operational timeline derived deterministically
 * from CopilotSummary. No persistence. No DB. No real memory.
 * 4–6 events built from summary counts, active domains, and module context.
 */

import { C, T, S }                from "@/lib/ui/tokens";
import type { CopilotAgentCard }  from "@/lib/copilot/viewmodel";
import type { CopilotSummary }    from "@/lib/copilot/viewmodel";
import type { DomainId }          from "@/lib/copilot/knowledge/domain-registry";
import { BASE_LANGUAGE }          from "@/lib/copilot/language";

// ── Domain labels ─────────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<DomainId, string> = {
  ventas:       "ventas",
  clientes:     "clientes",
  productos:    "productos",
  inventario:   "inventario",
  compras:      "compras",
  cartera:      "cartera",
  pagos:        "pagos",
  recaudos:     "recaudos",
  bancos:       "bancos",
  marketing:    "marketing",
  produccion:   "producción",
  conciliacion: "conciliación",
  tareas:       "tareas",
  alertas:      "alertas",
};

// ── Timeline event types ───────────────────────────────────────────────────────

type EventType = "analysis" | "detection" | "preparation" | "update";

interface TimelineEvent {
  label: string;
  time:  string;
  type:  EventType;
}

const EVENT_DOT: Record<EventType, string> = {
  analysis:    C.blue,
  detection:   C.amber,
  preparation: C.green,
  update:      C.blueDark,
};

// ── Event builder ─────────────────────────────────────────────────────────────

function buildEvents(summary: CopilotSummary): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const moduleName = summary.module
    ? (summary.module.split("/").pop() ?? summary.module)
    : "módulo";

  // Event 1: module scan
  events.push({
    label: `Escaneé el módulo de ${moduleName}`,
    time:  "Hace 8 min",
    type:  "analysis",
  });

  // Event 2: top domain analysis
  const d0 = summary.activeDomains[0];
  if (d0) {
    events.push({
      label: `Analicé contexto de ${DOMAIN_LABELS[d0] ?? d0}`,
      time:  "Hace 6 min",
      type:  "analysis",
    });
  }

  // Event 3: attention detection
  if (summary.attentionCount > 0) {
    events.push({
      label: `Detecté ${summary.attentionCount} excepción${summary.attentionCount > 1 ? "es" : ""} para revisión`,
      time:  "Hace 5 min",
      type:  "detection",
    });
  }

  // Event 4: suggestions prepared
  if (summary.totalSuggestions > 0) {
    events.push({
      label: `Preparé ${summary.totalSuggestions} sugerencia${summary.totalSuggestions > 1 ? "s" : ""} de contexto`,
      time:  "Hace 4 min",
      type:  "preparation",
    });
  }

  // Event 5: opportunities found
  if (summary.opportunityCount > 0) {
    events.push({
      label: `Identifiqué ${summary.opportunityCount} oportunidad${summary.opportunityCount > 1 ? "es" : ""} de análisis`,
      time:  "Hace 3 min",
      type:  "preparation",
    });
  }

  // Event 6: second domain or priorities update
  const d1 = summary.activeDomains[1];
  if (d1 && events.length < 6) {
    events.push({
      label: `Revisé ${DOMAIN_LABELS[d1] ?? d1} y posición operativa`,
      time:  "Hace 2 min",
      type:  "analysis",
    });
  }

  // Always end with priorities update if there's room
  if (events.length < 6) {
    events.push({
      label: "Actualicé prioridades operativas",
      time:  "Hace 2 min",
      type:  "update",
    });
  }

  return events.slice(0, 6);
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotMemoryTimelineProps {
  leadAgent: CopilotAgentCard;
  summary:   CopilotSummary;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotMemoryTimeline({
  leadAgent,
  summary,
}: CopilotMemoryTimelineProps) {
  const events = buildEvents(summary);

  return (
    <div style={{ borderBottom: `1px solid ${C.line}` }}>
      {/* Section header */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:           S[2],
        padding:      `${S[2]}px ${S[5]}px`,
        borderBottom: `1px solid ${C.line}`,
        background:   C.surface,
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.semibold,
          color:         C.inkLight,
          textTransform: "uppercase" as const,
          letterSpacing: "0.07em",
          flex:          1,
        }}>
          {BASE_LANGUAGE["timeline_header"]}
        </span>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         C.inkGhost,
          letterSpacing: "0.03em",
        }}>
          {leadAgent.agentName} · {BASE_LANGUAGE["timeline_subtitle"]}
        </span>
      </div>

      {/* Timeline */}
      <div style={{ padding: `${S[3]}px ${S[5]}px ${S[3]}px` }}>
        {events.map((event, i) => (
          <div key={i} style={{
            display:       "flex",
            gap:            S[3],
            alignItems:    "flex-start",
            paddingBottom:  i < events.length - 1 ? S[2] : 0,
          }}>
            {/* Dot + connector */}
            <div style={{
              display:       "flex",
              flexDirection: "column" as const,
              alignItems:    "center",
              flexShrink:    0,
              gap:            2,
            }}>
              <div style={{
                width:        7,
                height:       7,
                borderRadius: "50%",
                background:   EVENT_DOT[event.type],
                marginTop:    3,
                flexShrink:   0,
              }} />
              {i < events.length - 1 && (
                <div style={{
                  width:      1,
                  height:     14,
                  background: C.lineSubtle,
                }} />
              )}
            </div>

            {/* Event label + time */}
            <div style={{
              flex:           1,
              minWidth:       0,
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              gap:             S[2],
            }}>
              <span style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                color:      C.inkMid,
                lineHeight: 1.4,
              }}>
                {event.label}
              </span>
              <span style={{
                fontFamily:    T.mono,
                fontSize:      T.sz["2xs"],
                color:         C.inkGhost,
                flexShrink:    0,
                letterSpacing: "0.03em",
              }}>
                {event.time}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
