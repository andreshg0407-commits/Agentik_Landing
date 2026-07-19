/**
 * components/marketing-studio/library/channel-badge.tsx
 *
 * MS-04A.1 — Biblioteca Channel Badge System
 *
 * Reusable channel identification badges for the Biblioteca and all
 * downstream surfaces: Approvals, Catalogs, Shopify, Mila, Luca, Pauta IA.
 *
 * ── RULES ─────────────────────────────────────────────────────────────────────
 *   - Server component — no state, no client hooks
 *   - Uses .ag-channel-badge CSS class (design-system.css §MS)
 *   - Colors from CHANNEL_CONFIG via asset-visual-tokens.ts
 *   - Enterprise-sober: short labels, no logos, no icons
 *
 * ── USAGE ─────────────────────────────────────────────────────────────────────
 *   <ChannelBadge channel="shopify" />
 *   <ChannelBadge channel="whatsapp" size="lg" />
 *   <ChannelBadgeGroup channels={["shopify", "whatsapp", "catalog"]} max={4} />
 */

import type { ReactNode }       from "react";
import { resolveChannelConfig } from "@/lib/marketing-studio/library/ui/asset-visual-tokens";

// ── Single badge ───────────────────────────────────────────────────────────────

interface ChannelBadgeProps {
  channel: string;
  /** "sm" (default) = 9px abbr label · "lg" = full label */
  size?:   "sm" | "lg";
  style?:  React.CSSProperties;
}

export function ChannelBadge({ channel, size = "sm", style }: ChannelBadgeProps) {
  const cfg = resolveChannelConfig(channel);

  return (
    <span
      className="ag-channel-badge"
      style={{
        color:      cfg.color,
        background: cfg.surface,
        borderColor: cfg.border,
        ...style,
      }}
    >
      {size === "lg" ? cfg.label : cfg.abbr}
    </span>
  );
}

// ── Badge group ────────────────────────────────────────────────────────────────

interface ChannelBadgeGroupProps {
  channels:  string[];
  /** Max badges to show before "+N more" overflow indicator. Default: 4. */
  max?:      number;
  size?:     "sm" | "lg";
  gap?:      number;
  children?: ReactNode; // optional extra slot (e.g. action button)
}

export function ChannelBadgeGroup({
  channels,
  max     = 4,
  size    = "sm",
  gap     = 3,
  children,
}: ChannelBadgeGroupProps) {
  const visible  = channels.slice(0, max);
  const overflow = channels.length - max;

  return (
    <div style={{ display: "flex", alignItems: "center", gap, flexWrap: "wrap" }}>
      {visible.map(ch => (
        <ChannelBadge key={ch} channel={ch} size={size} />
      ))}
      {overflow > 0 && (
        <span style={{
          fontFamily:    "var(--ag-mono, 'JetBrains Mono', monospace)",
          fontSize:      9,
          fontWeight:    600,
          color:         "var(--ag-ink-faint, #9ca3af)",
          letterSpacing: "0.02em",
        }}>
          +{overflow}
        </span>
      )}
      {children}
    </div>
  );
}
