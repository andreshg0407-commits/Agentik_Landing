"use client";

/**
 * components/copilot/copilot-quick-actions.tsx
 *
 * Agent-specific quick navigation actions in the right rail.
 */

import Link from "next/link";
import { C, T, S, R } from "@/lib/ui/tokens";
import type { CopilotQuickAction } from "@/types/copilot/copilot-types";

interface CopilotQuickActionsProps {
  actions:     CopilotQuickAction[];
  accentColor: string;
}

export function CopilotQuickActions({ actions, accentColor }: CopilotQuickActionsProps) {
  if (actions.length === 0) return null;

  return (
    <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
      <div
        style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          color:         C.inkLight,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom:  S[2],
        }}
      >
        Acceso rápido
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: S[2] }}>
        {actions.map((action) => (
          <Link
            key={action.id}
            href={action.href}
            style={{ textDecoration: "none" }}
          >
            <span
              style={{
                display:      "inline-flex",
                alignItems:   "center",
                gap:          S[1],
                padding:      `${S[1]}px ${S[3]}px`,
                borderRadius: R.pill,
                border:       `1px solid ${accentColor}30`,
                background:   `${accentColor}08`,
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                color:        accentColor,
                cursor:       "pointer",
                whiteSpace:   "nowrap",
              }}
            >
              {action.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
