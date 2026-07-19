/**
 * lib/copilot/profiles/copilot-executive-style.ts
 *
 * Agentik — Copilot Tenant Profiles — Executive Style
 * Sprint: AGENTIK-COPILOT-TENANT-PROFILES-01
 *
 * Defines the four executive communication styles available to a Copilot profile.
 * Each style shapes how the Copilot frames its responses and what it prioritizes.
 *
 * Pure domain. No Prisma. No server-only. No React.
 */

// ── Type ──────────────────────────────────────────────────────────────────────

/**
 * ANALYTICAL   — metrics, analysis, indicators, data-driven insight.
 * OPERATIONAL  — tasks, actions, follow-up, execution cadence.
 * STRATEGIC    — opportunities, risks, priorities, long-horizon thinking.
 * COACH        — accompaniment, guidance, recommendations, development.
 */
export type ExecutiveStyle =
  | "ANALYTICAL"
  | "OPERATIONAL"
  | "STRATEGIC"
  | "COACH";

// ── Style metadata ────────────────────────────────────────────────────────────

export interface ExecutiveStyleMeta {
  style:       ExecutiveStyle;
  label:       string;
  description: string;
  keywords:    string[];
}

export const EXECUTIVE_STYLE_META: Record<ExecutiveStyle, ExecutiveStyleMeta> = {
  ANALYTICAL: {
    style:       "ANALYTICAL",
    label:       "Analítico",
    description: "Orientado a métricas, análisis e indicadores de desempeño.",
    keywords:    ["métricas", "análisis", "indicadores", "datos", "tendencias"],
  },
  OPERATIONAL: {
    style:       "OPERATIONAL",
    label:       "Operativo",
    description: "Orientado a tareas concretas, acciones y seguimiento de ejecución.",
    keywords:    ["tareas", "acciones", "seguimiento", "ejecución", "operación"],
  },
  STRATEGIC: {
    style:       "STRATEGIC",
    label:       "Estratégico",
    description: "Orientado a oportunidades, riesgos y prioridades de largo plazo.",
    keywords:    ["oportunidades", "riesgos", "prioridades", "visión", "estrategia"],
  },
  COACH: {
    style:       "COACH",
    label:       "Coach",
    description: "Orientado al acompañamiento, orientación y recomendaciones personalizadas.",
    keywords:    ["acompañamiento", "orientación", "recomendaciones", "desarrollo", "apoyo"],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isValidExecutiveStyle(value: unknown): value is ExecutiveStyle {
  return (
    value === "ANALYTICAL" ||
    value === "OPERATIONAL" ||
    value === "STRATEGIC"  ||
    value === "COACH"
  );
}

export function getExecutiveStyleMeta(style: ExecutiveStyle): ExecutiveStyleMeta {
  return EXECUTIVE_STYLE_META[style];
}

/** All valid executive styles, ordered for display. */
export const ALL_EXECUTIVE_STYLES: ExecutiveStyle[] = [
  "ANALYTICAL",
  "OPERATIONAL",
  "STRATEGIC",
  "COACH",
];
