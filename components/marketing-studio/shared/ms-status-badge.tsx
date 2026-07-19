/**
 * components/marketing-studio/shared/ms-status-badge.tsx
 *
 * MARKETING-STUDIO-UX-SYSTEM-01 — Unified Status Badge
 *
 * THE single pill badge implementation for all Marketing Studio modules.
 * Replaces:
 *   - SyncHealthBadge (Shopify)
 *   - CollectionRow status pill (Shopify)
 *   - StatusBadge (product-shopify-panel)
 *   - StatusChip (product-detail-drawer)
 *   - Inline colored spans across Biblioteca, Catálogos
 *
 * Variants map to semantic meaning, never to arbitrary module colors.
 * Use this instead of hardcoding status colors inline.
 *
 * Server Component — no "use client" needed.
 */

import { C, T, S, R } from "@/lib/ui/tokens";

export type MSStatusVariant =
  | "ok"       // green — published, healthy, ready, connected
  | "warning"  // amber — partial, pending, expiring, outdated
  | "error"    // red   — failed, critical, blocked, disconnected
  | "info"     // blue  — draft, processing, scheduled
  | "archived" // neutral warm — archived, inactive
  | "neutral"; // grey  — unknown, no data

interface Palette {
  bg:     string;
  border: string;
  color:  string;
  dot:    string;
}

const PALETTE: Record<MSStatusVariant, Palette> = {
  ok: {
    bg:     "#f0fdf4",   // C.greenLight
    border: "#bbf7d0",   // C.greenBorder
    color:  "#16a34a",   // C.green
    dot:    "#16a34a",
  },
  warning: {
    bg:     "#fffbeb",   // C.amberLight
    border: "#fde68a",   // C.amberBorder
    color:  "#d97706",   // C.amber
    dot:    "#d97706",
  },
  error: {
    bg:     "#fff0f0",   // C.redLight
    border: "#fca5a5",   // C.redBorder
    color:  "#dc2626",   // C.red
    dot:    "#dc2626",
  },
  info: {
    bg:     "#eff6ff",
    border: "#bfdbfe",
    color:  "#004AAD",   // C.blueDark
    dot:    "#004AAD",
  },
  archived: {
    bg:     "#fefce8",
    border: "#fde68a",
    color:  "#92400e",
    dot:    "#d97706",
  },
  neutral: {
    bg:     "#f8fafc",   // C.surface
    border: "#e2e8f0",   // C.line
    color:  "#9ca3af",   // C.inkFaint
    dot:    "#9ca3af",
  },
};

export interface MSStatusBadgeProps {
  label:    string;
  variant:  MSStatusVariant;
  /** Show a colored dot indicator before the label */
  dot?:     boolean;
  /** "sm" = 9px text (default), "md" = 11px text */
  size?:    "sm" | "md";
  style?:   React.CSSProperties;
}

export function MSStatusBadge({
  label, variant, dot = true, size = "sm", style,
}: MSStatusBadgeProps) {
  const p    = PALETTE[variant];
  const fs   = size === "md" ? T.sz["2xs"] : "9px";

  return (
    <span style={{
      display:       "inline-flex",
      alignItems:    "center",
      gap:           4,
      padding:       `2px ${S[2]}px`,
      background:    p.bg,
      border:        `1px solid ${p.border}`,
      borderRadius:  R.pill,
      color:         p.color,
      fontFamily:    T.mono,
      fontSize:      fs,
      fontWeight:    T.wt.bold,
      letterSpacing: "0.04em",
      whiteSpace:    "nowrap" as const,
      ...style,
    }}>
      {dot && (
        <span style={{
          width:        5, height: 5, borderRadius: "50%",
          background:   p.dot, flexShrink: 0,
        }} />
      )}
      {label}
    </span>
  );
}
