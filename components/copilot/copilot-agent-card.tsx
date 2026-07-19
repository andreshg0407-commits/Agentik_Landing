"use client";

/**
 * components/copilot/copilot-agent-card.tsx
 *
 * Active agent identity card in the right rail header.
 * Shows avatar, name, role, accent, and operational state.
 */

import Image from "next/image";
import { C, T, S, R } from "@/lib/ui/tokens";
import type { CopilotAgentDef } from "@/types/copilot/copilot-types";

interface CopilotAgentCardProps {
  agent:   CopilotAgentDef;
  state?:  "ready" | "loading" | "degraded" | "no_context";
}

const STATE_LABELS: Record<string, string> = {
  ready:      "Activo",
  loading:    "Sincronizando",
  degraded:   "Degradado",
  no_context: "En espera",
};

const STATE_COLOR: Record<string, string> = {
  ready:      "#10b981",
  loading:    "#f59e0b",
  degraded:   "#ef4444",
  no_context: C.inkLight,
};

export function CopilotAgentCard({ agent, state = "ready" }: CopilotAgentCardProps) {
  return (
    <div
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[3],
        padding:      `${S[3]}px ${S[4]}px`,
        borderBottom: `1px solid ${C.line}`,
      }}
    >
      {/* Avatar */}
      <div
        style={{
          position:     "relative",
          width:        40,
          height:       40,
          borderRadius: R.pill,
          overflow:     "hidden",
          flexShrink:   0,
          border:       `2px solid ${agent.accentColor}`,
        }}
      >
        <Image
          src={agent.avatar}
          alt={agent.name}
          fill
          style={{ objectFit: "cover" }}
        />
      </div>

      {/* Identity */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display:    "flex",
            alignItems: "center",
            gap:        S[2],
          }}
        >
          <span
            style={{
              fontFamily: T.mono,
              fontSize:   T.sz.sm,
              fontWeight: 600,
              color:      C.ink,
            }}
          >
            {agent.name}
          </span>
          {/* Status dot */}
          <span
            style={{
              width:        6,
              height:       6,
              borderRadius: R.pill,
              background:   STATE_COLOR[state] ?? C.inkLight,
              flexShrink:   0,
            }}
          />
          <span
            style={{
              fontFamily: T.mono,
              fontSize:   T.sz.xs,
              color:      STATE_COLOR[state] ?? C.inkLight,
            }}
          >
            {STATE_LABELS[state] ?? state}
          </span>
        </div>
        <div
          style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            color:        C.inkLight,
            marginTop:    2,
            whiteSpace:   "nowrap",
            overflow:     "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {agent.role}
        </div>
      </div>

      {/* Accent bar */}
      <div
        style={{
          width:        3,
          height:       32,
          borderRadius: R.sm,
          background:   agent.accentColor,
          flexShrink:   0,
        }}
      />
    </div>
  );
}
