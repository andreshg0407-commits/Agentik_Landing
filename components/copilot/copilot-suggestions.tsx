"use client";

/**
 * components/copilot/copilot-suggestions.tsx
 *
 * Contextual suggestions from the active agent in the right rail.
 */

import Link from "next/link";
import { C, T, S, R } from "@/lib/ui/tokens";
import type { CopilotSuggestion } from "@/types/copilot/copilot-types";

interface CopilotSuggestionsProps {
  suggestions: CopilotSuggestion[];
  agentName:   string;
  orgSlug:     string;
}

export function CopilotSuggestions({ suggestions, agentName, orgSlug }: CopilotSuggestionsProps) {
  if (suggestions.length === 0) return null;

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
        {agentName} sugiere
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
        {suggestions.map((s) => (
          <Link
            key={s.id}
            href={`/${orgSlug}/${s.href}`}
            style={{ textDecoration: "none" }}
          >
            <div
              style={{
                display:      "flex",
                alignItems:   "flex-start",
                gap:          S[2],
                padding:      `${S[2]}px ${S[3]}px`,
                borderRadius: R.md,
                border:       `1px solid ${C.line}`,
                background:   "transparent",
                cursor:       "pointer",
              }}
            >
              <span
                style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      "#004AAD",
                  marginTop:  1,
                }}
              >
                ↗
              </span>
              <span
                style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      C.ink,
                  flex:       1,
                }}
              >
                {s.text}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
