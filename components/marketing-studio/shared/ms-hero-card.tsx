/**
 * components/marketing-studio/shared/ms-hero-card.tsx
 *
 * MARKETING-STUDIO-UX-SYSTEM-01 — Hero Status Card
 *
 * Prominent horizontal panel shown at the top of a module to communicate
 * connection state, readiness, or operational status.
 *
 * Replaces:
 *   - ConnectionStatusPanel (Shopify)
 *   - Custom connection panels in future channel modules
 *     (WhatsApp, Marketplace, Social Publishing)
 *
 * Visual:
 *   [dot] Title                               [CTA]
 *         Subtitle
 *         label: value  ·  label: value
 *
 * Server Component — no "use client" needed.
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import type { MSStatusVariant } from "./ms-status-badge";

const STATUS_COLORS: Record<MSStatusVariant, { dot: string; bg: string; border: string }> = {
  ok:       { dot: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  warning:  { dot: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  error:    { dot: "#dc2626", bg: "#fff0f0", border: "#fca5a5" },
  info:     { dot: "#004AAD", bg: "#eff6ff", border: "#bfdbfe" },
  archived: { dot: "#d97706", bg: "#fefce8", border: "#fde68a" },
  neutral:  { dot: "#9ca3af", bg: "#f8fafc", border: "#e2e8f0" },
};

export interface MSHeroCardProps {
  /** Semantic status — controls dot and card tint */
  status:    MSStatusVariant;
  /** Primary label — e.g. "Shopify · Conectado" */
  title:     string;
  /** Secondary line — e.g. shop domain or description */
  subtitle?: string;
  /** Optional metadata row — rendered as "label: value" items */
  meta?:     Array<{ label: string; value: string }>;
  /** Optional right-side CTA */
  cta?:      {
    label:    string;
    href:     string;
    variant?: "primary" | "secondary";
  };
  style?:    React.CSSProperties;
}

export function MSHeroCard({
  status, title, subtitle, meta, cta, style,
}: MSHeroCardProps) {
  const sc = STATUS_COLORS[status];

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:          S[4],
      padding:      `${S[3]}px ${S[4]}px`,
      background:   sc.bg,
      border:       `1px solid ${sc.border}`,
      borderRadius: R.md,
      flexWrap:     "wrap" as const,
      ...style,
    }}>
      {/* Left: dot + content */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: S[2], flex: 1, minWidth: 0 }}>
        <span style={{
          width: 9, height: 9, borderRadius: "50%",
          background: sc.dot, flexShrink: 0, marginTop: 3,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title */}
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.sm,
            fontWeight: T.wt.semibold, color: C.ink,
          }}>
            {title}
          </div>

          {/* Subtitle */}
          {subtitle && (
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.xs,
              color: C.inkLight, marginTop: 2,
            }}>
              {subtitle}
            </div>
          )}

          {/* Meta row */}
          {meta && meta.length > 0 && (
            <div style={{
              display:    "flex",
              gap:        S[3],
              marginTop:  S[1],
              flexWrap:   "wrap" as const,
            }}>
              {meta.map((m, i) => (
                <span key={i} style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                }}>
                  <span style={{ color: C.inkLight }}>{m.label}</span>
                  {" "}{m.value}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: CTA */}
      {cta && (
        <a
          href={cta.href}
          style={{
            display:        "inline-flex",
            alignItems:     "center",
            gap:            S[1],
            padding:        `${S[2]}px ${S[4]}px`,
            background:     cta.variant === "primary" ? C.blueDark : C.white,
            color:          cta.variant === "primary" ? "#fff"     : C.inkMid,
            border:         `1px solid ${cta.variant === "primary" ? C.blueDark : C.line}`,
            borderRadius:   R.md,
            fontFamily:     T.mono,
            fontSize:       T.sz.xs,
            fontWeight:     T.wt.medium,
            textDecoration: "none",
            flexShrink:     0,
            whiteSpace:     "nowrap" as const,
          }}
        >
          {cta.label}
        </a>
      )}
    </div>
  );
}
