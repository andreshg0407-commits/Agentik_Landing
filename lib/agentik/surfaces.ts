/**
 * lib/agentik/surfaces.ts
 *
 * AGENTIK-CORE-STABILIZATION-01
 *
 * Agentik Surface System — unified surface variants for all workspace components.
 * Replaces ad-hoc background/border/shadow combos across Memory, Capabilities,
 * Integrations, Personality, Workflows, Execution Layer, and Rails.
 *
 * Usage:
 *   import { SURFACE, type SurfaceKey } from "@/lib/agentik/surfaces";
 *   <div style={{ ...SURFACE.operational }}>...</div>
 *
 *   Or for element-specific overrides:
 *   <div style={{ background: SURFACE.elevated.background, borderRadius: SURFACE.elevated.radius }}>
 */

import { R, E } from "@/lib/ui/tokens";

// ── Surface key ───────────────────────────────────────────────────────────────

export type SurfaceKey =
  | "base"        // Standard card — white, subtle border, micro-shadow
  | "elevated"    // Floating card — white, stronger border, soft shadow
  | "operational" // Live state surface — near-white with blue cast, data density
  | "warning"     // Caution surface — amber tint, amber border
  | "critical"    // Urgent surface — red tint, red border
  | "muted"       // De-emphasized — light gray, very subtle
  | "soft"        // Gentle surface — cream white, no border, soft feel
  | "rail";       // Rail / strip surface — blue-gray surface layer

// ── Surface definition ────────────────────────────────────────────────────────

export interface SurfaceDef {
  background: string;
  border:     string;
  shadow:     string;
  radius:     number | string;
  // Padding density helpers — not applied automatically, use as reference
  paddingX:   number;
  paddingY:   number;
}

// ── Surface registry ──────────────────────────────────────────────────────────

export const SURFACE: Record<SurfaceKey, SurfaceDef> = {

  base: {
    background: "#ffffff",
    border:     "1px solid rgba(0,74,173,.10)",
    shadow:     E.xs,
    radius:     R.card,
    paddingX:   16,
    paddingY:   12,
  },

  elevated: {
    background: "#ffffff",
    border:     "1px solid rgba(0,74,173,.14)",
    shadow:     E.md,
    radius:     R.card,
    paddingX:   20,
    paddingY:   16,
  },

  operational: {
    background: "#F4F7FF",
    border:     "1px solid #DDE6F7",
    shadow:     "none",
    radius:     R.md,
    paddingX:   16,
    paddingY:   10,
  },

  warning: {
    background: "#fffbeb",
    border:     "1px solid #fde68a",
    shadow:     "none",
    radius:     R.md,
    paddingX:   16,
    paddingY:   12,
  },

  critical: {
    background: "#fef2f2",
    border:     "1px solid #fecaca",
    shadow:     "none",
    radius:     R.md,
    paddingX:   16,
    paddingY:   12,
  },

  muted: {
    background: "#F8FAFC",
    border:     "1px solid rgba(0,0,0,.06)",
    shadow:     "none",
    radius:     R.md,
    paddingX:   12,
    paddingY:   8,
  },

  soft: {
    background: "#FAFBFD",
    border:     "none",
    shadow:     "none",
    radius:     R.card,
    paddingX:   16,
    paddingY:   12,
  },

  rail: {
    background: "#F0F4FA",
    border:     "1px solid rgba(0,74,173,.08)",
    shadow:     "none",
    radius:     R.sm,
    paddingX:   12,
    paddingY:   6,
  },

};

// ── Card header surface (shared section-header pattern) ───────────────────────

export const CARD_HEADER: React.CSSProperties = {
  background:   "#F8FAFC",
  borderBottom: "1px solid rgba(0,74,173,.07)",
  padding:      "7px 16px",
};

// ── Left-bar accent (shared section accent stripe) ────────────────────────────

export function accentStripe(color: string, height: number = 14): React.CSSProperties {
  return {
    width:        3,
    height,
    background:   color,
    borderRadius: 2,
    display:      "inline-block",
    flexShrink:   0,
    opacity:      0.6,
  };
}
