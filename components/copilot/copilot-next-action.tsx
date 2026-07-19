"use client";

/**
 * components/copilot/copilot-next-action.tsx
 *
 * Agentik Copilot — Next Recommended Action
 * Sprint: AGENTIK-COPILOT-AGENT-OFFICE-01
 *
 * A highlighted block surfacing the single most important action.
 * Visual-only. No execution. No navigation. No handlers.
 * Buttons are disabled — prepared for future runtime wiring.
 */

import { C, T, S, R }  from "@/lib/ui/tokens";
import { BASE_LANGUAGE } from "@/lib/copilot/language";

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotNextActionProps {
  title:       string;
  description: string;
  priority:    "critical" | "high" | "medium" | "low";
  domain?:     string;
}

// ── Priority palette ──────────────────────────────────────────────────────────

const PRIORITY_STYLE: Record<CopilotNextActionProps["priority"], {
  bar:        string;
  label:      string;
  labelColor: string;
  bg:         string;
  badgeBorder:string;
}> = {
  critical: { bar: C.red,      label: "Crítica", labelColor: C.redDark,   bg: C.redLight,   badgeBorder: `${C.red}44`    },
  high:     { bar: C.amber,    label: "Alta",    labelColor: C.amberDark, bg: C.amberLight, badgeBorder: `${C.amber}44`  },
  medium:   { bar: C.blueDark, label: "Media",   labelColor: C.blue,      bg: C.blueLight,  badgeBorder: `${C.blue}44`   },
  low:      { bar: C.inkFaint, label: "Baja",    labelColor: C.inkFaint,  bg: C.surface,    badgeBorder: C.line          },
};

const DOMAIN_LABELS: Record<string, string> = {
  bancos:       "Bancos",
  cartera:      "Cartera",
  conciliacion: "Conciliación",
  pagos:        "Pagos",
  cierre:       "Cierre",
  tesoreria:    "Tesorería",
  planeacion:   "Planeación",
  clientes:     "Clientes",
  proveedores:  "Proveedores",
  inventario:   "Inventario",
  ventas:       "Ventas",
  compras:      "Compras",
  nomina:       "Nómina",
  fiscal:       "Fiscal",
  recaudos:     "Recaudos",
  productos:    "Productos",
  marketing:    "Marketing",
  produccion:   "Producción",
  tareas:       "Tareas",
  alertas:      "Alertas",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotNextAction({
  title,
  description,
  priority,
  domain,
}: CopilotNextActionProps) {
  const ps = PRIORITY_STYLE[priority];

  return (
    <div style={{
      padding:      `${S[4]}px ${S[5]}px`,
      background:   ps.bg,
      borderBottom: `1px solid ${C.line}`,
      borderLeft:   `3px solid ${ps.bar}`,
    }}>
      {/* Header row */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:           S[2],
        marginBottom: S[2],
        flexWrap:     "wrap" as const,
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          fontWeight:    T.wt.semibold,
          color:         ps.labelColor,
          letterSpacing: "0.10em",
          textTransform: "uppercase" as const,
        }}>
          {BASE_LANGUAGE["next_action_header"]}
        </span>
        <span style={{
          fontFamily:   T.mono,
          fontSize:     T.sz["2xs"],
          fontWeight:   T.wt.semibold,
          color:        ps.labelColor,
          background:   C.white,
          border:       `1px solid ${ps.badgeBorder}`,
          borderRadius: R.pill,
          padding:      "1px 6px",
        }}>
          {BASE_LANGUAGE["priority_label_prefix"]} {ps.label}
        </span>
        {domain && (
          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz["2xs"],
            color:       C.inkFaint,
            marginLeft:  "auto",
            letterSpacing:"0.03em",
          }}>
            {DOMAIN_LABELS[domain] ?? domain}
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.lg,
        fontWeight:   T.wt.semibold,
        color:        C.ink,
        lineHeight:   1.3,
        marginBottom: S[2],
      }}>
        {title}
      </div>

      {/* Description */}
      <div style={{
        fontFamily:   T.sans,
        fontSize:     T.sz.base,
        color:        C.inkMid,
        lineHeight:   1.55,
        marginBottom: S[4],
      }}>
        {description}
      </div>

      {/* Visual-only CTAs */}
      <div style={{ display: "flex", gap: S[2] }}>
        <button
          disabled
          type="button"
          title="Próximamente disponible"
          style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            fontWeight:   T.wt.semibold,
            color:        C.white,
            background:   C.blueDark,
            border:       "none",
            borderRadius: R.md,
            padding:      `${S[1] + 2}px ${S[4]}px`,
            cursor:       "not-allowed" as const,
            opacity:      0.72,
            lineHeight:   1,
          }}
        >
          Revisar ahora
        </button>
        <button
          disabled
          type="button"
          title="Próximamente disponible"
          style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.xs,
            fontWeight:   T.wt.normal,
            color:        C.inkLight,
            background:   "transparent",
            border:       `1px solid ${C.line}`,
            borderRadius: R.md,
            padding:      `${S[1] + 2}px ${S[4]}px`,
            cursor:       "not-allowed" as const,
            opacity:      0.72,
            lineHeight:   1,
          }}
        >
          Más tarde
        </button>
      </div>
    </div>
  );
}
