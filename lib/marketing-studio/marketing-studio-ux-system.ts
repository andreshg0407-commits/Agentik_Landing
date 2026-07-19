/**
 * lib/marketing-studio/marketing-studio-ux-system.ts
 *
 * MARKETING-STUDIO-UX-SYSTEM-01 — Formal UX Registry
 *
 * Single source of truth for:
 *   1. Which shared components exist and what they replace
 *   2. Usage contracts for each component
 *   3. What is explicitly PROHIBITED inline
 *
 * No runtime code. Import types only.
 */

// ── Component registry ────────────────────────────────────────────────────────

/**
 * MSAgentSignal
 * Path: components/marketing-studio/shared/ms-agent-signal.tsx
 *
 * Use for: AI intelligence strips — Luca (dark variant), Mila (positive variant)
 * Replaces: all inline gradient "Luca · IA" / "Mila · CRM" div blocks
 * Server Component: yes
 *
 * Required props: text, agentLabel, variant
 * Optional:       sub, action.{label,href}, style
 *
 * Prohibited: define a new gradient strip with hardcoded colors
 */
export type MSAgentSignalContract = {
  component:  "MSAgentSignal";
  sourcePath: "components/marketing-studio/shared/ms-agent-signal.tsx";
  variants:   "dark" | "positive";
  replaces:   "inline agent signal strip divs in Biblioteca · Catálogos · Shopify · Hub";
};

/**
 * MSMetricStrip / MSMetricCard
 * Path: components/marketing-studio/shared/ms-metric-strip.tsx
 *
 * Use for: KPI summary rows — 2–4 key metrics at top of any module workspace
 * Replaces: AlertCard grid, IntelCard grid, preset summary cards in Catálogos
 * Server Component: yes
 *
 * MSMetricStrip accepts cards[] — renders 4-column CSS grid (wraps on mobile)
 * MSMetricCard: value (string|number), label, sub?, dot (accent color), variant?
 *
 * Prohibited: define a separate KPI card with a custom left-border accent
 */
export type MSMetricStripContract = {
  component:  "MSMetricStrip";
  sourcePath: "components/marketing-studio/shared/ms-metric-strip.tsx";
  maxCards:   4;
  replaces:   "AlertCard · IntelCard · preset summary cards";
};

/**
 * MSStatusBadge
 * Path: components/marketing-studio/shared/ms-status-badge.tsx
 *
 * Use for: any status pill in a table row, drawer, or card
 * Replaces: SyncHealthBadge (Shopify), CollectionRow inline pill, StatusBadge,
 *           StatusChip, colored `<span>` with status label
 * Server Component: yes
 *
 * Props: label, variant (MSStatusVariant), dot?, size?, style?
 *
 * Prohibited: render a status pill with hardcoded background/color combination
 */
export type MSStatusBadgeContract = {
  component:  "MSStatusBadge";
  sourcePath: "components/marketing-studio/shared/ms-status-badge.tsx";
  variants:   "ok" | "warning" | "error" | "info" | "archived" | "neutral";
  replaces:   "SyncHealthBadge · StatusBadge · StatusChip · inline colored spans";
};

/**
 * MSHeroCard
 * Path: components/marketing-studio/shared/ms-hero-card.tsx
 *
 * Use for: connection state / readiness banners at the top of channel modules
 * Replaces: ConnectionStatusPanel (Shopify), future WhatsApp/Marketplace panels
 * Server Component: yes
 *
 * Props: status (MSStatusVariant), title, subtitle?, meta[]?, cta?, style?
 *
 * Prohibited: define a custom "connection panel" with tinted background + dot
 */
export type MSHeroCardContract = {
  component:  "MSHeroCard";
  sourcePath: "components/marketing-studio/shared/ms-hero-card.tsx";
  replaces:   "ConnectionStatusPanel · custom channel connection panels";
};

/**
 * MSFilterBar
 * Path: components/marketing-studio/shared/ms-filter-bar.tsx
 *
 * Use for: filter chip rows + optional search box above any entity list
 * Replaces: inline chip rows in Biblioteca, Catálogos, Shopify product search
 * Client Component: yes (requires "use client" in parent or inline)
 *
 * Props: groups[], selected, onChange, searchPlaceholder?, searchValue?,
 *        onSearchChange?, style?
 *
 * Prohibited: define a new row of filter `<button>` chips for a module
 */
export type MSFilterBarContract = {
  component:  "MSFilterBar";
  sourcePath: "components/marketing-studio/shared/ms-filter-bar.tsx";
  replaces:   "inline chip filter rows in Biblioteca · Catálogos · Shopify";
  isClient:   true;
};

// ── Layout rules ──────────────────────────────────────────────────────────────

/**
 * Every Marketing Studio page MUST follow this layer order:
 *
 *  1. OperationalWorkspaceHeader   — breadcrumbs + title + status
 *  2. MSHeroCard                   — connection / readiness (if channel module)
 *  3. MSMetricStrip                — KPI summary (2–4 cards, if data available)
 *  4. MSFilterBar                  — filters + search (if filterable entity list)
 *  5. Primary workspace section    — entity grid / list / table
 *  6. MSAgentSignal row            — Luca + Mila intelligence strips
 *  7. Footer / legend              — system tag + color legend
 *
 * Layers 2, 3, 4, 6 are optional depending on module type.
 * Layers MUST NOT be reordered.
 */
export type MSPageLayerOrder = [
  "OperationalWorkspaceHeader",
  "MSHeroCard?",
  "MSMetricStrip?",
  "MSFilterBar?",
  "PrimaryWorkspace",
  "MSAgentSignal?",
  "Footer?",
];

// ── Right rail governance ─────────────────────────────────────────────────────

/**
 * Copilot / Agent signals in the canvas:
 *
 *   ALLOWED in canvas:  MSAgentSignal — deterministic operational signals only.
 *                       Fixed text computed from real data. Never streaming.
 *
 *   PROHIBITED in canvas: DiegoSlot, CopilotSlot, ag-copilot-zone,
 *                         ag-ai-strip, COPILOT_INSIGHTS, AI gradient panels,
 *                         "AGENTIK IA" headings, streaming chat UI.
 *
 *   RIGHT RAIL ONLY: All interactive copilot, all live agent reasoning,
 *                    all streaming responses, all approval prompts.
 */
export type MSRightRailGovernance = {
  canvasAllowed:    "MSAgentSignal";
  canvasProhibited: "DiegoSlot | CopilotSlot | ag-copilot-zone | streaming UI";
  rightRailOnly:    "interactive copilot | live reasoning | approvals | streaming";
};

// ── Prohibited patterns ───────────────────────────────────────────────────────

/**
 * These patterns are PERMANENTLY PROHIBITED in any Marketing Studio page:
 *
 *  - Raw hex color for status (use MSStatusBadge variant instead)
 *  - Custom left-border KPI card (use MSMetricCard instead)
 *  - Inline gradient strip for agent signal (use MSAgentSignal instead)
 *  - Custom tinted connection panel (use MSHeroCard instead)
 *  - Per-page chip filter row (use MSFilterBar instead)
 *  - More than 4 cards in a single MSMetricStrip
 *  - AlertCard, IntelCard, SignalStrip, SyncHealthBadge local definitions
 *  - C.brand (#7c3aed) for any Marketing Studio action — use C.blueDark
 *  - MS_PALETTE domain colors used outside ms-design-system.ts consumers
 */
export type MSProhibitedPatterns =
  | "raw hex status color"
  | "custom left-border KPI card"
  | "inline gradient agent strip"
  | "custom tinted connection panel"
  | "per-page chip filter row"
  | "AlertCard | IntelCard | SignalStrip | SyncHealthBadge"
  | "C.brand in MS actions"
  | "5+ cards in MSMetricStrip";
