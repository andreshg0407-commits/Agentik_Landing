/**
 * lib/ui/surfaces.ts
 *
 * Agentik Enterprise OS — Semantic Surface Objects for React inline styles.
 *
 * JS counterpart to the CSS surface classes in app/design-system.css §5.
 * Use these when surfaces need to be applied dynamically (conditional rendering,
 * computed variants, or wherever a CSS className is not sufficient).
 *
 * Prefer CSS classes (.ag-surface-*, .ag-kpi-card, etc.) for static surfaces —
 * they support hover/transitions that inline styles cannot express.
 *
 * Exports:
 *   Surface — 8 semantic surface style objects
 *   Shadow  — 5 elevation shadow strings (mirrors --ag-shadow-* tokens)
 *   Motion  — transition strings for hover/expand/fade patterns
 */

import { R } from "./tokens";

// ── Surface objects ───────────────────────────────────────────────────────────

export const Surface = {
  /** OS-level shell chrome — primary navigation rail */
  shell: {
    background: "linear-gradient(180deg, #001E4A 0%, #003A8A 100%)",
    color:      "#ffffff",
  },

  /** Main content canvas — page background */
  workspace: {
    background: "#ffffff",
  },

  /** Standard card or panel elevated above the canvas */
  elevated: {
    background: "var(--ag-grad-card, linear-gradient(135deg,#fff,#F7F9FF))",
    border:     "1px solid var(--ag-line, rgba(0,74,173,.12))",
    boxShadow:  "var(--ag-shadow-sm, 0 1px 4px rgba(0,74,173,.06))",
  },

  /** Modals, drawers, command palettes */
  floating: {
    background:   "#ffffff",
    border:       "1px solid var(--ag-line, rgba(0,74,173,.12))",
    boxShadow:    "var(--ag-shadow-floating, 0 8px 32px rgba(0,74,173,.14))",
    borderRadius: R.card,
  },

  /** Copilot panels, AI intelligence surfaces */
  ai: {
    background: "linear-gradient(135deg, #001E4A 0%, #003A8A 100%)",
    color:      "#ffffff",
  },

  /** Secondary backgrounds, sidebar tints, rail footers */
  subtle: {
    background: "var(--ag-brand-50, #EEF5FF)",
    border:     "1px solid var(--ag-line, rgba(0,74,173,.12))",
  },

  /** Critical alerts, error states */
  danger: {
    background: "#fff0f0",
    border:     "1px solid #fca5a5",
  },

  /** Operational data cards with a left brand accent bar */
  insight: {
    background:  "var(--ag-grad-card, linear-gradient(135deg,#fff,#F7F9FF))",
    border:      "1px solid var(--ag-line, rgba(0,74,173,.12))",
    borderLeft:  "4px solid #004AAD",
    boxShadow:   "var(--ag-shadow-sm, 0 1px 4px rgba(0,74,173,.06))",
  },
} as const satisfies Record<string, React.CSSProperties>;

// ── Shadow strings ────────────────────────────────────────────────────────────
// Use var() references so they pick up runtime CSS token values.

export const Shadow = {
  none:     "none",
  sm:       "var(--ag-shadow-sm,      0 1px 4px  rgba(0,74,173,.06), 0 1px 2px rgba(0,74,173,.03))",
  md:       "var(--ag-shadow-md,      0 2px 12px rgba(0,74,173,.10), 0 1px 4px rgba(0,74,173,.06))",
  focus:    "var(--ag-shadow-focus,   0 0 0 3px  rgba(0,74,173,.18))",
  floating: "var(--ag-shadow-floating,0 8px 32px rgba(0,74,173,.14), 0 2px 8px rgba(0,74,173,.08))",
} as const;

// ── Motion strings ────────────────────────────────────────────────────────────
// Pre-built transition values. Spread into style.transition where needed.

const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

export const Motion = {
  /** Hover lift — elevated cards (shadow + 1px translateY) */
  lift:   `box-shadow 150ms ${EASE}, transform 100ms ${EASE}`,
  /** Hover border/bg — list rows, nav items */
  border: `border-color 150ms ${EASE}, background 150ms ${EASE}`,
  /** Contextual fade — sidebar section transitions */
  fade:   `opacity 200ms ${EASE}`,
  /** Rail expand/collapse */
  rail:   `width 200ms ${EASE}, min-width 200ms ${EASE}, max-width 200ms ${EASE}`,
} as const;
