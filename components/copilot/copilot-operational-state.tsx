"use client";

/**
 * components/copilot/copilot-operational-state.tsx
 *
 * Empty / no-context / degraded state display for the copilot rail.
 */

import { C, T, S } from "@/lib/ui/tokens";
import type { CopilotCoreRuntimeState } from "@/types/copilot/copilot-types";

interface CopilotOperationalStateProps {
  state: CopilotCoreRuntimeState;
  agent: string;
}

const STATE_MESSAGES: Record<CopilotCoreRuntimeState, { title: string; body: string }> = {
  ready:      { title: "", body: "" },
  loading:    { title: "Sincronizando",  body: "Obteniendo contexto operativo..." },
  degraded:   { title: "Modo degradado", body: "Algunos datos no están disponibles." },
  no_context: { title: "Sin contexto",   body: "Navega a un módulo para activar la inteligencia contextual." },
};

export function CopilotOperationalState({ state, agent }: CopilotOperationalStateProps) {
  if (state === "ready") return null;
  const msg = STATE_MESSAGES[state];

  return (
    <div
      style={{
        padding:   `${S[4]}px ${S[4]}px`,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          fontWeight: 600,
          color:      state === "degraded" ? "#f59e0b" : C.inkLight,
        }}
      >
        {msg.title}
      </div>
      <div
        style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkLight,
          marginTop:  S[1],
        }}
      >
        {msg.body}
      </div>
    </div>
  );
}
