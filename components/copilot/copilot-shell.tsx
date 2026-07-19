"use client";

/**
 * components/copilot/copilot-shell.tsx
 *
 * Agentik Copilot Core V2 — Right Rail Shell
 * Sprint: AGENTIK-COPILOT-CORE-02
 *
 * Registry-driven, context-aware copilot rail.
 * Composes all copilot sub-components into a scrollable rail.
 *
 * NOT a chat. NO input. Copilot is the transversal intelligence layer.
 */

import { C, T, S } from "@/lib/ui/tokens";
import type { CopilotCoreRuntime } from "@/types/copilot/copilot-types";
import { CopilotAgentCard }        from "@/components/copilot/copilot-agent-card";
import { CopilotAlerts }           from "@/components/copilot/copilot-alerts";
import { CopilotTasks }            from "@/components/copilot/copilot-tasks";
import { CopilotSuggestions }      from "@/components/copilot/copilot-suggestions";
import { CopilotQuickActions }     from "@/components/copilot/copilot-quick-actions";
import { CopilotContextCards }     from "@/components/copilot/copilot-context-cards";
import { CopilotOperationalState } from "@/components/copilot/copilot-operational-state";
import { resolveAgentQuickActions } from "@/lib/copilot/copilot-agent-registry";

interface CopilotShellProps {
  runtime: CopilotCoreRuntime;
}

export function CopilotShell({ runtime }: CopilotShellProps) {
  const { state, context, tasks, alerts, suggestions, cards } = runtime;
  const { activeAgent, orgSlug } = context;

  const quickActions = resolveAgentQuickActions(activeAgent, orgSlug);

  return (
    <div
      style={{
        display:       "flex",
        flexDirection: "column",
        height:        "100%",
        overflow:      "hidden",
        background:    C.surface,
      }}
    >
      {/* Rail header */}
      <div
        style={{
          padding:      `${S[3]}px ${S[4]}px ${S[2]}px`,
          borderBottom: `1px solid ${C.line}`,
        }}
      >
        <div
          style={{
            fontFamily:    T.mono,
            fontSize:      T.sz.xs,
            color:         C.inkLight,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Agentik Copilot
        </div>
      </div>

      {/* Agent identity */}
      <CopilotAgentCard agent={activeAgent} state={state} />

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>

        {/* Degraded / loading / no-context state */}
        <CopilotOperationalState state={state} agent={activeAgent.name} />

        {/* Context cards — domain KPIs */}
        <CopilotContextCards cards={cards} />

        {/* Divider */}
        {cards.length > 0 && (alerts.length > 0 || tasks.length > 0) && (
          <div style={{ height: 1, background: C.line, margin: `0 ${S[4]}px` }} />
        )}

        {/* Alerts */}
        <CopilotAlerts alerts={alerts} />

        {/* Tasks */}
        <CopilotTasks tasks={tasks} orgSlug={orgSlug} />

        {/* Divider */}
        {(tasks.length > 0 || alerts.length > 0) && suggestions.length > 0 && (
          <div style={{ height: 1, background: C.line, margin: `0 ${S[4]}px` }} />
        )}

        {/* Suggestions */}
        <CopilotSuggestions
          suggestions={suggestions}
          agentName={activeAgent.name}
          orgSlug={orgSlug}
        />

        {/* Quick actions */}
        <div style={{ height: 1, background: C.line, margin: `0 ${S[4]}px` }} />
        <CopilotQuickActions
          actions={quickActions}
          accentColor={activeAgent.accentColor}
        />

        {/* Footer */}
        <div style={{ padding: `${S[3]}px ${S[4]}px ${S[4]}px`, marginTop: S[2] }}>
          <div
            style={{
              padding:      `${S[2]}px ${S[3]}px`,
              borderRadius: 8,
              border:       `1px solid ${C.line}`,
              background:   "transparent",
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        C.inkLight,
              textAlign:    "center",
            }}
          >
            Consultar a {activeAgent.name}…
          </div>
        </div>
      </div>
    </div>
  );
}
