/**
 * lib/ui/tokens.ts
 *
 * Agentik Enterprise — visual design tokens.
 *
 * Single source of truth for the enterprise tenant shell (app/(app)/**).
 * Used as JS constants in inline React styles throughout the enterprise shell.
 *
 * The public landing page uses Tailwind/shadcn independently — do not import
 * this file from public routes.
 *
 * Exports:
 *   C  — color palette
 *   T  — typography (font stacks + size/weight scales)
 *   S  — spacing scale (px numbers)
 *   R  — border-radius scale (px numbers)
 *   E  — elevation (box-shadow strings)
 *   panel, panelHeader, dataRow — pre-composed style objects
 */

// ── Colors ────────────────────────────────────────────────────────────────────

export const C = {
  // Neutrals
  ink:         "#0f0f1a",   // primary text — very slightly warmer than pure #111
  inkMid:      "#374151",   // secondary text
  inkLight:    "#6b7280",   // tertiary / metadata
  inkFaint:    "#9ca3af",   // placeholder / ghost
  inkGhost:    "#d1d5db",   // decorative dividers

  line:        "#e5e7eb",   // standard border / panel divider
  lineSubtle:  "#f0f2f4",   // inset / table-row separator
  surface:     "#f8f9fb",   // panel background
  surfaceAlt:  "#f2f4f7",   // panel header / row hover
  white:       "#ffffff",

  // Brand purple
  brand:       "#7c3aed",
  brandDark:   "#6d28d9",
  brandLight:  "#faf5ff",
  brandBorder: "#ede9fe",

  // Semantic — success
  green:       "#16a34a",
  greenLight:  "#f0fdf4",
  greenBorder: "#bbf7d0",
  greenDark:   "#14532d",

  // Semantic — warning
  amber:       "#d97706",
  amberDark:   "#92400e",
  amberLight:  "#fffbeb",
  amberBorder: "#fde68a",
  amberMid:    "#ca8a04",

  // Semantic — danger
  red:         "#dc2626",
  redDark:     "#991b1b",
  redLight:    "#fff0f0",
  redBorder:   "#fca5a5",

  // Semantic — info
  blue:        "#0369a1",
  blueDark:    "#1e40af",
  blueLight:   "#eff6ff",
  blueBorder:  "#bfdbfe",

  // Executive dark
  exec:        "#1e1e2e",
  execLight:   "#f0f0f8",

  // Sidebar
  sidebarBg:   "#fefeff",
  sidebarLine: "#eceef2",
} as const;

// ── Typography ─────────────────────────────────────────────────────────────────

export const T = {
  mono: `"JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace`,
  sans: `"Inter", system-ui, -apple-system, BlinkMacSystemFont, sans-serif`,

  /** Font sizes in px */
  sz: {
    "2xs":  9,
    xs:    10,
    sm:    11,
    base:  12,
    md:    13,
    lg:    14,
    xl:    16,
    "2xl": 20,
    "3xl": 24,
    "4xl": 28,
  } as const,

  /** Font weights */
  wt: {
    normal:   400,
    medium:   500,
    semibold: 600,
    bold:     700,
    black:    900,
  } as const,
} as const;

// ── Spacing (px) ──────────────────────────────────────────────────────────────

export const S = {
  0:   0,
  1:   4,
  2:   8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  8:  32,
  10: 40,
  12: 48,
} as const;

// ── Border radius (px) ────────────────────────────────────────────────────────

export const R = {
  xs:   3,
  sm:   4,
  md:   6,
  lg:   8,
  xl:  12,
  pill: 9999,
} as const;

// ── Elevation (box-shadow) ────────────────────────────────────────────────────

export const E = {
  none: "none",
  xs:   "0 1px 2px rgba(15,15,26,.04)",
  sm:   "0 1px 4px rgba(15,15,26,.06), 0 1px 2px rgba(15,15,26,.03)",
  md:   "0 2px 8px rgba(15,15,26,.08), 0 1px 3px rgba(15,15,26,.05)",
  lg:   "0 4px 16px rgba(15,15,26,.10), 0 2px 6px rgba(15,15,26,.06)",
} as const;

// ── Composite style objects ───────────────────────────────────────────────────
// Pre-cooked React style objects for the three most repeated layout patterns.
// Spread directly into `style` props.

/** Standard bordered card container */
export const panel = {
  border:       `1px solid ${C.line}`,
  borderRadius: R.md,
  overflow:     "hidden" as const,
  background:   C.white,
  boxShadow:    E.sm,
} satisfies Record<string, unknown>;

/** Standard panel header bar */
export const panelHeader = {
  padding:      `${S[2]}px ${S[4]}px`,
  borderBottom: `1px solid ${C.line}`,
  background:   C.surfaceAlt,
  display:      "flex"   as const,
  alignItems:   "center" as const,
  gap:          S[2],
} satisfies Record<string, unknown>;

/** Standard list row inside a panel */
export const dataRow = {
  padding:      `${S[2] - 1}px ${S[4]}px`,
  borderBottom: `1px solid ${C.lineSubtle}`,
  display:      "flex"   as const,
  alignItems:   "center" as const,
  gap:          S[2],
  fontSize:     T.sz.base,
} satisfies Record<string, unknown>;
