/**
 * components/shell/primitives.tsx
 *
 * Agentik Enterprise — shared presentational primitives for the tenant shell.
 *
 * These are purely visual components with no data-fetching, no state, and no
 * business logic. They unify the recurring layout patterns found across the
 * enterprise shell (dashboard, executive, finance, agentik, etc.).
 *
 * Exports:
 *   Panel         — bordered card with optional urgency tint
 *   PanelHeader   — panel title bar with icon, title, badge slot, and CTA slot
 *   Badge         — inline semantic chip (variant: brand | success | warning | danger | info | neutral | dark)
 *   SectionLabel  — uppercase micro-label used above groups of content
 *   EmptyState    — graceful empty / loading placeholder inside a panel
 *   KpiCard       — single metric card with dot indicator and sublabel
 *
 * Usage:
 *   import { Panel, PanelHeader, Badge, KpiCard } from "@/components/shell/primitives";
 */

import Link from "next/link";
import { C, T, S, R, E } from "@/lib/ui/tokens";

// ── Types ─────────────────────────────────────────────────────────────────────

type BadgeVariant =
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "dark";

// ── Badge ─────────────────────────────────────────────────────────────────────

const BADGE_STYLES: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
  brand:   { bg: C.brandBorder, color: C.brand,     border: C.brandBorder },
  success: { bg: C.greenLight,  color: C.green,     border: C.greenBorder },
  warning: { bg: C.amberLight,  color: C.amber,     border: C.amberBorder },
  danger:  { bg: C.redLight,    color: C.red,       border: C.redBorder   },
  info:    { bg: C.blueLight,   color: C.blue,      border: C.blueBorder  },
  neutral: { bg: C.surfaceAlt,  color: C.inkLight,  border: C.line        },
  dark:    { bg: C.exec,        color: C.white,     border: C.exec        },
};

export function Badge({
  children,
  variant = "neutral",
  size    = "sm",
}: {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?:    "xs" | "sm";
}) {
  const sty = BADGE_STYLES[variant];
  const fs  = size === "xs" ? T.sz["2xs"] : T.sz.xs;
  return (
    <span style={{
      fontSize:    fs,
      fontWeight:  T.wt.bold,
      padding:     size === "xs" ? "1px 5px" : "2px 8px",
      borderRadius: R.pill,
      background:  sty.bg,
      color:       sty.color,
      border:      `1px solid ${sty.border}`,
      letterSpacing: "0.04em",
      textTransform: "uppercase" as const,
      whiteSpace:  "nowrap" as const,
      flexShrink:  0,
    }}>
      {children}
    </span>
  );
}

// ── SectionLabel ──────────────────────────────────────────────────────────────

export function SectionLabel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?:   React.CSSProperties;
}) {
  return (
    <div style={{
      fontSize:      T.sz["2xs"],
      fontWeight:    T.wt.bold,
      color:         C.inkFaint,
      textTransform: "uppercase" as const,
      letterSpacing: "0.08em",
      marginBottom:  S[2],
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function Panel({
  children,
  urgent,
  style,
}: {
  children: React.ReactNode;
  urgent?:  boolean;
  style?:   React.CSSProperties;
}) {
  return (
    <div style={{
      border:       urgent ? `1.5px solid ${C.redBorder}` : `1px solid ${C.line}`,
      borderRadius: R.md,
      overflow:     "hidden",
      background:   urgent ? C.redLight : C.white,
      boxShadow:    E.sm,
      marginBottom: S[5],
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── PanelHeader ───────────────────────────────────────────────────────────────

export function PanelHeader({
  title,
  badge,
  cta,
  urgent,
  icon,
}: {
  title:   React.ReactNode;
  badge?:  React.ReactNode;
  cta?:    { label: string; href: string };
  urgent?: boolean;
  icon?:   string;
}) {
  return (
    <div style={{
      padding:      `${S[2]}px ${S[4]}px`,
      borderBottom: `1px solid ${urgent ? C.redBorder : C.line}`,
      background:   urgent ? "#fff4f4" : C.surfaceAlt,
      display:      "flex",
      alignItems:   "center",
      gap:          S[2],
    }}>
      {icon && <span style={{ fontSize: T.sz.md }}>{icon}</span>}
      <span style={{
        fontWeight: T.wt.bold,
        fontSize:   T.sz.md,
        color:      urgent ? C.red : C.ink,
      }}>
        {title}
      </span>
      {badge}
      {cta && (
        <Link href={cta.href} style={{
          marginLeft:     "auto",
          fontSize:       T.sz.xs,
          color:          C.brand,
          fontWeight:     T.wt.bold,
          textDecoration: "none",
        }}>
          {cta.label}
        </Link>
      )}
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────

export function EmptyState({ message }: { message: string }) {
  return (
    <div style={{
      padding:    `${S[4]}px ${S[4]}px`,
      fontSize:   T.sz.base,
      color:      C.inkFaint,
      background: C.surface,
      textAlign:  "center" as const,
    }}>
      {message}
    </div>
  );
}

// ── KpiCard ───────────────────────────────────────────────────────────────────

export function KpiCard({
  label,
  value,
  sublabel,
  dotColor,
  urgent,
  href,
  empty,
}: {
  label:     string;
  value:     string | number;
  sublabel?: string;
  dotColor?: string;
  urgent?:   boolean;
  href?:     string;
  empty?:    boolean;
}) {
  const dot   = dotColor ?? (urgent ? C.red : C.inkGhost);
  const vColor = empty ? C.inkGhost : urgent ? C.red : C.ink;

  const inner = (
    <div style={{
      border:       urgent ? `1.5px solid ${C.redBorder}` : `1px solid ${C.line}`,
      borderRadius: R.md,
      padding:      `${S[3]}px ${S[4]}px`,
      background:   urgent ? "#fff8f8" : C.surface,
      boxShadow:    E.xs,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: S[1] + 2, marginBottom: S[1] }}>
        <div style={{
          width: 7, height: 7, borderRadius: R.pill, background: dot, flexShrink: 0,
        }} />
        <span style={{
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.bold,
          color:         C.inkLight,
          textTransform: "uppercase" as const,
          letterSpacing: "0.05em",
        }}>
          {label}
        </span>
      </div>
      <div style={{
        fontSize:      empty ? T.sz.xl : T.sz["3xl"],
        fontWeight:    T.wt.black,
        color:         vColor,
        letterSpacing: "-0.02em",
        lineHeight:    1.1,
      }}>
        {value}
      </div>
      {sublabel && (
        <div style={{
          fontSize:   T.sz.xs,
          color:      urgent ? C.red : C.inkFaint,
          fontWeight: urgent ? T.wt.semibold : T.wt.normal,
          marginTop:  S[1],
        }}>
          {sublabel}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none", display: "block" }}>
        {inner}
      </Link>
    );
  }
  return inner;
}
