"use client";

/**
 * components/copilot/copilot-truth-badge.tsx
 *
 * Copilot Core — Truth State Badge
 * Sprint: COPILOT-CONVERSATIONAL-RUNTIME-01C
 *
 * Visual indicator for VERIFIED / PARTIAL / DATA_UNVERIFIED.
 */

import { C, T, R } from "@/lib/ui/tokens";

type TruthState = "VERIFIED" | "PARTIAL" | "DATA_UNVERIFIED";

const TRUTH_CONFIG: Record<TruthState, { label: string; color: string; bg: string; border: string }> = {
  VERIFIED: {
    label:  "Verificado",
    color:  C.green,
    bg:     C.greenLight,
    border: C.greenBorder ?? C.green,
  },
  PARTIAL: {
    label:  "Parcial",
    color:  C.amberDark,
    bg:     C.amberLight,
    border: C.amberBorder,
  },
  DATA_UNVERIFIED: {
    label:  "Sin verificar",
    color:  C.inkFaint,
    bg:     C.surfaceAlt,
    border: C.line,
  },
};

interface CopilotTruthBadgeProps {
  truthState: TruthState;
}

export function CopilotTruthBadge({ truthState }: CopilotTruthBadgeProps) {
  const config = TRUTH_CONFIG[truthState];

  return (
    <span
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:            3,
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        fontWeight:    T.wt.medium,
        color:         config.color,
        background:    config.bg,
        border:        `1px solid ${config.border}`,
        borderRadius:  R.pill,
        padding:       "1px 6px",
        lineHeight:    1.4,
        letterSpacing: "0.02em",
      }}
    >
      <span
        style={{
          width:        5,
          height:       5,
          borderRadius: "50%",
          background:   config.color,
          flexShrink:   0,
        }}
      />
      {config.label}
    </span>
  );
}
