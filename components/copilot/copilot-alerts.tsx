"use client";

/**
 * components/copilot/copilot-alerts.tsx
 *
 * Operational alerts section in the right rail.
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import type { CopilotAlert } from "@/types/copilot/copilot-types";

interface CopilotAlertsProps {
  alerts: CopilotAlert[];
}

const LEVEL_COLOR: Record<string, string> = {
  critical: "#ef4444",
  warning:  "#f59e0b",
  info:     "#3b82f6",
};

const LEVEL_BG: Record<string, string> = {
  critical: "rgba(239,68,68,0.08)",
  warning:  "rgba(245,158,11,0.08)",
  info:     "rgba(59,130,246,0.08)",
};

export function CopilotAlerts({ alerts }: CopilotAlertsProps) {
  if (alerts.length === 0) return null;

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
        Alertas
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
        {alerts.map((alert) => (
          <div
            key={alert.id}
            style={{
              padding:      `${S[2]}px ${S[3]}px`,
              borderRadius: R.md,
              background:   LEVEL_BG[alert.level] ?? "transparent",
              borderLeft:   `3px solid ${LEVEL_COLOR[alert.level] ?? C.line}`,
            }}
          >
            <div
              style={{
                fontFamily: T.mono,
                fontSize:   T.sz.xs,
                fontWeight: 600,
                color:      LEVEL_COLOR[alert.level] ?? C.ink,
              }}
            >
              {alert.title}
            </div>
            {alert.meta && (
              <div
                style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      C.inkLight,
                  marginTop:  2,
                }}
              >
                {alert.meta}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
