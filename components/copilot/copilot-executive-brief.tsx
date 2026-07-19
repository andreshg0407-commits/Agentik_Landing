"use client";

/**
 * components/copilot/copilot-executive-brief.tsx
 *
 * Agentik Copilot — Executive Brief
 * Sprint: AGENTIK-COPILOT-EXPERIENCE-01
 *
 * A deterministic, contextual message from the agent to the user.
 * No LLM. No database. No live data.
 * Built from CopilotSummary + CopilotAgentCard — pure ViewModel projection.
 *
 * Also renders visual-only CTAs (disabled buttons prepared for future wiring).
 */

import { C, T, S, R }             from "@/lib/ui/tokens";
import type { CopilotAgentCard }  from "@/lib/copilot/viewmodel";
import type { CopilotSummary }    from "@/lib/copilot/viewmodel";

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotExecutiveBriefProps {
  leadAgent: CopilotAgentCard;
  summary:   CopilotSummary;
}

// ── Deterministic brief builder ────────────────────────────────────────────────

function buildBriefMessage(summary: CopilotSummary): string {
  const parts: string[] = [];

  if (summary.attentionCount > 0) {
    parts.push(
      `${summary.attentionCount} tema${summary.attentionCount > 1 ? "s" : ""} que requiere${summary.attentionCount > 1 ? "n" : ""} atención`
    );
  }
  if (summary.totalSuggestions > 0) {
    parts.push(
      `${summary.totalSuggestions} sugerencia${summary.totalSuggestions > 1 ? "s" : ""} disponible${summary.totalSuggestions > 1 ? "s" : ""}`
    );
  }
  if (summary.opportunityCount > 0) {
    parts.push(
      `${summary.opportunityCount} oportunidad${summary.opportunityCount > 1 ? "es" : ""} para revisar`
    );
  }

  const moduleName = summary.module
    ? summary.module.replace(/\//g, " › ")
    : "este módulo";

  if (parts.length === 0) {
    return `Revisé el contexto de ${moduleName}. Todo en orden, no hay elementos que requieran acción inmediata.`;
  }

  const partsText = parts.join(", ");
  return `Revisé el contexto de ${moduleName} y encontré ${partsText}.`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotExecutiveBrief({
  leadAgent,
  summary,
}: CopilotExecutiveBriefProps) {
  const briefMessage = buildBriefMessage(summary);

  return (
    <div style={{
      padding:      `${S[4]}px ${S[5]}px`,
      background:   C.white,
      borderBottom: `1px solid ${C.line}`,
    }}>
      <div style={{
        display:    "flex",
        gap:         S[3],
        alignItems: "flex-start",
      }}>
        {/* Mini agent avatar */}
        <div style={{
          width:          28,
          height:         28,
          borderRadius:   "50%",
          background:     "linear-gradient(135deg, #004AAD 0%, #002460 100%)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          flexShrink:     0,
          marginTop:      2,
        }}>
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz.sm,
            fontWeight: T.wt.bold,
            color:      "#fff",
            lineHeight: 1,
          }}>
            {leadAgent.agentName.slice(0, 1)}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Agent name */}
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            fontWeight:   T.wt.semibold,
            color:        C.blueDark,
            marginBottom: 4,
            letterSpacing:"0.03em",
          }}>
            {leadAgent.agentName}
          </div>

          {/* Brief message */}
          <div style={{
            fontFamily:   T.sans,
            fontSize:     T.sz.md,
            color:        C.ink,
            lineHeight:   1.6,
            marginBottom: S[4],
          }}>
            {briefMessage}
          </div>

          {/* Visual-only CTAs */}
          <div style={{
            display:  "flex",
            flexWrap: "wrap" as const,
            gap:       S[2],
          }}>
            <ActionButton label="Revisar prioridad principal" primary />
            <ActionButton label="Ver sugerencias" />
            <ActionButton label="Hablar con el agente" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Action button (visual-only, disabled) ─────────────────────────────────────

function ActionButton({ label, primary = false }: { label: string; primary?: boolean }) {
  return (
    <button
      disabled
      type="button"
      title="Próximamente disponible"
      style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        fontWeight:   primary ? T.wt.semibold : T.wt.normal,
        color:        primary ? C.white : C.inkLight,
        background:   primary ? C.blueDark : C.surface,
        border:       primary ? `1px solid ${C.blueDark}` : `1px solid ${C.line}`,
        borderRadius: R.md,
        padding:      `${S[1] + 1}px ${S[3]}px`,
        cursor:       "not-allowed" as const,
        opacity:      0.72,
        lineHeight:   1,
        flexShrink:   0,
      }}
    >
      {label}
    </button>
  );
}
