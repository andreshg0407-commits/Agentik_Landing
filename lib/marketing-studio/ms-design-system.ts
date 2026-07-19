/**
 * lib/marketing-studio/ms-design-system.ts
 *
 * Marketing Studio Design System — single source of truth.
 * Lock: MARKETING-STUDIO-DESIGN-SYSTEM-LOCK-01
 *
 * All Marketing Studio screens MUST import from here instead of duplicating
 * color hex values, shadow formulas, or dimension constants.
 *
 * Do NOT add Tailwind classes, raw hex values, or inline magic numbers to MS
 * components. Use the exported constants and helpers below.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Semantic color system:
 *   Product  → Blue   (#004AAD)  — Foto de producto, catálogo, ecommerce
 *   Social   → Purple (#7c3aed)  — Redes sociales, feed, historias
 *   Video    → Orange (#c2410c)  — Video corto, reels, TikTok
 *   Design   → Green  (#166534)  — Plantillas, banners, catálogos
 *
 * These four colors are FIXED. Do not introduce a fifth domain color.
 * New content types must map to one of these four.
 * ──────────────────────────────────────────────────────────────────────────────
 */

// ── Color Palette ─────────────────────────────────────────────────────────────

export const MS_PALETTE = {
  /** Foto de producto, catálogo, ecommerce, Shopify, CRM */
  product: {
    primary:      "#004AAD",
    iconBg:       "#e8f1ff",
    cardBg:       "linear-gradient(135deg, #fdfdff 0%, #f5f8ff 100%)",
    heroGradient: "linear-gradient(145deg, #edf4ff 0%, #d6e8ff 55%, #bfdbfe 100%)",
    selectedBg:   "linear-gradient(145deg, #e8f1ff55 0%, #e8f1ff22 60%, white 100%)",
    label:        "Producto",
    badgeLabel:   "Ecommerce",
  },
  /** Redes sociales: feed, historias, reels, anuncios */
  social: {
    primary:      "#7c3aed",
    iconBg:       "#f3e8ff",
    cardBg:       "linear-gradient(135deg, #fefcff 0%, #f9f5ff 100%)",
    heroGradient: "linear-gradient(145deg, #f5f0ff 0%, #e9dffd 55%, #d8c8fa 100%)",
    selectedBg:   "linear-gradient(145deg, #f3e8ff55 0%, #f3e8ff22 60%, white 100%)",
    label:        "Redes",
    badgeLabel:   "Redes sociales",
  },
  /** Video corto: reels, TikTok, shorts, campañas */
  video: {
    primary:      "#c2410c",
    iconBg:       "#fff7ed",
    cardBg:       "linear-gradient(135deg, #fffefb 0%, #fff8f2 100%)",
    heroGradient: "linear-gradient(145deg, #fff7f0 0%, #feebd8 55%, #fdd5aa 100%)",
    selectedBg:   "linear-gradient(145deg, #fff7ed55 0%, #fff7ed22 60%, white 100%)",
    label:        "Video",
    badgeLabel:   "Video",
  },
  /** Plantillas, banners, catálogos, carruseles, diseño */
  design: {
    primary:      "#166534",
    iconBg:       "#f0fdf4",
    cardBg:       "linear-gradient(135deg, #fbfffc 0%, #f4fdf6 100%)",
    heroGradient: "linear-gradient(145deg, #f0fdf4 0%, #d8f8e2 55%, #b8f0cc 100%)",
    selectedBg:   "linear-gradient(145deg, #f0fdf455 0%, #f0fdf422 60%, white 100%)",
    label:        "Diseño",
    badgeLabel:   "Diseño",
  },
} as const;

export type MsPaletteKey = keyof typeof MS_PALETTE;
export type MsPaletteEntry = (typeof MS_PALETTE)[MsPaletteKey];

// ── App Icon Capsule ──────────────────────────────────────────────────────────
// Every Marketing Studio action card shows an icon inside an elevated capsule.
// This is the "app icon" metaphor: white background, rounded corners, depth.
// Do not use floating icons without this container.

export const MS_APP_ICON = {
  /** Width and height of the capsule in px */
  size:         56 as const,
  /** border-radius of the capsule */
  borderRadius: 16 as const,
  /** Lucide icon size prop */
  iconSize:     28 as const,
  /** Lucide icon strokeWidth */
  strokeWidth:  1.6 as const,
} as const;

// ── Intent Card Dimensions ────────────────────────────────────────────────────
// All selection cards (intent, type, format, channel, template) share these dims.
// Grid is always 2 columns on desktop, 1 on mobile.

export const MS_CARD = {
  /** Fixed height — do not increase */
  height:       166 as const,
  /** Matches R.xl from lib/ui/tokens */
  borderRadius: 12 as const,
  /** Top/sides/bottom padding */
  padding:      "12px 12px 10px" as const,
  /** Grid gap between cards */
  gap:          12 as const,
} as const;

// ── Shadow System ─────────────────────────────────────────────────────────────
// All shadow values are generated from the domain's primary color.
// Import MS_SHADOWS and call the helper with the domain primary color.
//
// Example:
//   import { MS_PALETTE, MS_SHADOWS } from "@/lib/marketing-studio/ms-design-system";
//   const shadow = MS_SHADOWS.cardHover(MS_PALETTE.product.primary);

export const MS_SHADOWS = {
  /** Resting card shadow — no color param needed */
  card: [
    "0 1px 3px rgba(0,0,0,0.05)",
    "0 4px 12px rgba(0,0,0,0.05)",
    "inset 0 1px 0 rgba(255,255,255,0.8)",
  ].join(", "),

  /** Hover elevation — pass domain primary color */
  cardHover: (color: string): string => [
    `0 8px 28px ${color}14`,
    "0 2px 8px rgba(0,0,0,0.07)",
    "inset 0 1px 0 rgba(255,255,255,0.9)",
  ].join(", "),

  /** Selected state — pass domain primary color */
  cardSelected: (color: string): string => [
    `0 0 0 3px ${color}22`,
    `0 8px 28px ${color}1c`,
    "0 2px 6px rgba(0,0,0,0.06)",
    "inset 0 1px 0 rgba(255,255,255,0.9)",
  ].join(", "),

  /** App icon capsule — pass domain primary color */
  appIcon: (color: string): string => [
    `0 4px 16px ${color}22`,
    "0 1px 4px rgba(0,0,0,0.08)",
    "inset 0 1px 1px rgba(255,255,255,1)",
    "inset 0 -1px 2px rgba(0,0,0,0.04)",
  ].join(", "),
} as const;

// ── Stepper Standards ─────────────────────────────────────────────────────────
// Reference implementation: foto-estudio/new/wizard.tsx → Stepper component.
// When building a new multi-step MS flow, copy the Stepper component from that
// file. Do NOT build a custom stepper.
//
// Visual rules:
//   Active step:   44×44 badge, gradient blue→purple, step number, glow ring
//   Complete step: 34×34 badge, solid #004AAD, ✓
//   Inactive step: 34×34 badge, #f0f2f6, domain icon (16px, strokeWidth 1.8)
//   Connector:     1.5px dashed, #dde1ea → #004AAD55 when complete
//   Card wrapper:  white, 1px border C.line, R.xl, E.sm

export const MS_STEPPER = {
  activeBadgeSize:    44 as const,
  inactiveBadgeSize:  34 as const,
  activeBg:           "linear-gradient(135deg, #004AAD 0%, #6d28d9 100%)" as const,
  completeBg:         "#004AAD" as const,
  inactiveBg:         "#f0f2f6" as const,
  inactiveIconColor:  "#8b93a5" as const,
  inactiveIconSize:   16 as const,
  connectorColor:     "#dde1ea" as const,
  connectorColorDone: "#004AAD55" as const,
  glowRing:           "0 0 0 4px rgba(0,74,173,0.15), 0 4px 14px rgba(0,74,173,0.22)" as const,
} as const;

// ── CTA Bar ───────────────────────────────────────────────────────────────────
// Standard bottom action bar pattern used by all MS selection steps.
// Left side: hint text. Right side: gradient primary button.

export const MS_CTA = {
  primaryButtonBg: "linear-gradient(135deg, #004AAD 0%, #1e40af 100%)" as const,
  primaryBoxShadow: "0 2px 10px rgba(0,74,173,0.28)" as const,
} as const;

// ── Typography Standards ──────────────────────────────────────────────────────
// Marketing Studio uses T.mono throughout (matches rest of enterprise OS).
// Font size hierarchy for cards:
//   Heading:     24px, fontWeight black, letterSpacing -0.03em
//   Card title:  T.sz.sm (14px), fontWeight black, letterSpacing -0.02em
//   Description: T.sz["2xs"] (11px), color C.inkMid
//   Tag label:   9px, fontWeight semibold
//   Badge:       9px, fontWeight bold, letterSpacing 0.08em, uppercase

export const MS_TYPOGRAPHY = {
  headingSize:    "24px" as const,
  cardTitleSize:  "14px" as const,    // T.sz.sm
  descSize:       "11px" as const,    // T.sz["2xs"]
  tagSize:        "9px" as const,
  badgeSize:      "9px" as const,
  badgeTracking:  "0.08em" as const,
} as const;

// ── Surface Standards ─────────────────────────────────────────────────────────
// Visual language: marketing surfaces are SLIGHTLY more creative than Agentik Core.
// Rules:
//   - Cards feel like app tiles, not admin rows
//   - Icons live inside elevated capsules, not floating inline
//   - Colors are ALWAYS domain-semantic (product/social/video/design)
//   - Gradients are ALWAYS very soft (5–10% tint on white)
//   - No raw hex values outside this file
//   - No Tailwind color classes inside MS components

// ── Agent Signal Strip ─────────────────────────────────────────────────────────
// Standard intelligence strip shared by ALL Marketing Studio modules.
// Two variants:
//   "dark"     → Luca / primary AI signal (deep blue gradient)
//   "positive" → Mila / commerce positive signal (green tint)
// Component: components/marketing-studio/shared/ms-agent-signal.tsx

export const MS_SIGNAL = {
  dark: {
    background:   "linear-gradient(135deg, #001E4A 0%, #003A8A 100%)",
    borderColor:  "#002866",
    textPrimary:  "rgba(255,255,255,.90)",
    textSub:      "rgba(255,255,255,.45)",
    dot:          "rgba(255,255,255,.50)",
    agentLabel:   "rgba(255,255,255,.35)",
    actionBg:     "rgba(255,255,255,.10)",
    actionBorder: "rgba(255,255,255,.20)",
    actionColor:  "rgba(255,255,255,.80)",
  },
  positive: {
    background:   "#f0fdf4",    // C.greenLight
    borderColor:  "#bbf7d0",    // C.greenBorder
    textPrimary:  "#14532d",    // C.greenDark
    textSub:      "#6b7280",    // C.inkLight
    dot:          "#22c55e",    // C.green
    agentLabel:   "#22c55e",
    actionBg:     "#dcfce7",
    actionBorder: "#86efac",
    actionColor:  "#14532d",
  },
} as const;

// ── Metric Card ────────────────────────────────────────────────────────────────
// Unified KPI metric card used across Biblioteca, Catalogos, Shopify.
// Replaces: IntelCard (Biblioteca), AlertCard (Shopify), preset summary (Catalogos).
// Grid: 4 columns (display:grid, repeat(4,1fr), gap S[3]), marginBottom S[5].

export const MS_METRIC_CARD = {
  padding:      "12px 16px",
  borderRadius: 8,
  valueSize:    "24px",    // T.sz["2xl"]
  labelSize:    "12px",    // T.sz.xs
  subSize:      "11px",    // T.sz["2xs"]
  accentWidth:  3,
} as const;

// ── Section Label ──────────────────────────────────────────────────────────────
// Standard section title above content groups. Use with C.inkFaint color.

export const MS_SECTION = {
  fontSize:      "11px",
  fontWeight:    700,
  letterSpacing: "0.06em",
  textTransform: "uppercase" as const,
} as const;

// ── Empty State ────────────────────────────────────────────────────────────────
// Standard empty container. Use with C.surface background + C.line border.

export const MS_EMPTY = {
  padding:      "48px 24px",
  borderRadius: 8,
  textAlign:    "center" as const,
} as const;

// ── Module Card (Hub) ──────────────────────────────────────────────────────────
// Hub module grid cards — app tile feel with domain color accent.
// Grid: 3 columns. Component: render inline in hub page using MS_PALETTE domain.

export const MS_MODULE_CARD = {
  borderRadius:      12,
  padding:           "16px",
  accentBarWidth:    3,
  iconCapsuleSize:   40,
  iconCapsuleRadius: 10,
} as const;

// ── UX Governance Rules (MARKETING-STUDIO-UX-SYSTEM-01) ───────────────────────
//
// Enforced patterns — every new MS module MUST follow these:
//
// 1. INTELLIGENCE STRIP
//    Component: components/marketing-studio/shared/ms-agent-signal.tsx
//    - Luca signals: variant="dark"
//    - Mila signals: variant="positive"
//    - Never duplicate inline markup
//    - Never render agent signals inside Panel+PanelHeader boxes
//    - Agent signals belong in a flex row, not a 2-col grid of panels
//
// 2. KPI / METRIC CARDS
//    Component: components/marketing-studio/shared/ms-metric-strip.tsx
//    - Always 4 cards max per strip
//    - Left accent bar = semantic dot color
//    - Never use ag-kpi-card class + inline styles mix
//    - Never create a local IntelCard / AlertCard / MetricCard variant
//
// 3. MODULE CARDS (Hub)
//    Tokens: MS_MODULE_CARD + MS_PALETTE[domain]
//    - Every card must declare a domain: MsPaletteKey
//    - Accent bar = domain.primary color
//    - Icon capsule = MS_MODULE_CARD.iconCapsuleSize with domain.iconBg gradient
//    - CTA text = domain.primary color
//    - No raw emoji icons without a capsule container
//
// 4. SHADOWS
//    - Resting: MS_SHADOWS.card (not E.xs / E.sm directly)
//    - App icon: MS_SHADOWS.appIcon(primaryColor)
//    - Hover: MS_SHADOWS.cardHover(primaryColor)
//
// 5. EMPTY STATES
//    - Use MS_EMPTY dimensions
//    - Title: T.sz.sm, T.wt.bold, C.inkMid
//    - Description: T.sz.xs, C.inkFaint, maxWidth 380
//    - CTA: inline-block, C.blueDark bg, C.white text
//
// 6. DOMAIN COLORS (immutable)
//    product = #004AAD (Shopify, Foto Estudio, Conexiones, Catálogo)
//    social  = #7c3aed (Redes, Publicaciones, Feed)
//    video   = #c2410c (Pauta, Campañas, TikTok)
//    design  = #166534 (Biblioteca, Analítica, Catálogos, Plantillas)
//
// Future modules checklist:
//    WhatsApp Commerce      → domain: "product" | "design"
//    Marketplace Publishing → domain: "product"
//    Social Publishing      → domain: "social"
//    Catalog Intelligence   → domain: "design"
