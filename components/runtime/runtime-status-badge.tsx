"use client";

/**
 * components/runtime/runtime-status-badge.tsx
 * Semantic status badge for agent action lifecycle states.
 * Sprint: AGENTIK-AGENT-APPROVAL-CENTER-01
 */

import { C, T, R } from "@/lib/ui/tokens";
import type { ActionStatus } from "@/lib/agent-runtime/agent-types";

interface StatusConfig {
  label:  string;
  color:  string;
  bg:     string;
  border: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  suggested:        { label: "Sugerida",    color: C.inkLight,  bg: C.surface,    border: C.line        },
  pending_approval: { label: "Pendiente",   color: C.amber,     bg: C.amberLight, border: C.amberBorder },
  approved:         { label: "Aprobada",    color: C.blue,      bg: C.blueLight,  border: C.blueBorder  },
  executing:        { label: "Ejecutando",  color: C.blueDark,  bg: "rgba(0,74,173,.06)", border: "rgba(0,74,173,.20)" },
  executed:         { label: "Ejecutada",   color: C.green,     bg: C.greenLight, border: C.greenBorder },
  failed:           { label: "Fallida",     color: C.red,       bg: C.redLight,   border: C.redBorder   },
  rejected:         { label: "Rechazada",   color: C.redDark,   bg: C.redLight,   border: C.redBorder   },
  dismissed:        { label: "Descartada",  color: C.inkFaint,  bg: C.surface,    border: C.line        },
  expired:          { label: "Expirada",    color: C.inkLight,  bg: C.surfaceAlt, border: C.line        },
};

const FALLBACK: StatusConfig = {
  label: "Desconocido", color: C.inkFaint, bg: C.surface, border: C.line,
};

interface Props {
  status: ActionStatus | string;
  size?:  "sm" | "base";
}

export function RuntimeStatusBadge({ status, size = "base" }: Props) {
  const cfg = STATUS_MAP[status] ?? FALLBACK;
  const fs  = size === "sm" ? 9 : 10;

  return (
    <span style={{
      display:      "inline-flex",
      alignItems:   "center",
      fontFamily:   T.mono,
      fontSize:     fs,
      fontWeight:   T.wt.semibold,
      letterSpacing: "0.04em",
      color:        cfg.color,
      background:   cfg.bg,
      border:       `1px solid ${cfg.border}`,
      borderRadius: R.pill,
      padding:      "1px 8px",
      whiteSpace:   "nowrap" as const,
      lineHeight:   "1.6",
    }}>
      {cfg.label}
    </span>
  );
}
