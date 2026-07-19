/**
 * components/marketing-studio/shared/ms-drawer-section.tsx
 *
 * MARKETING-STUDIO-UX-SYSTEM-03 — Drawer Section
 *
 * Canonical content section inside a drawer scroll body.
 * Renders a small uppercase section heading with an optional
 * right-aligned action link, followed by children.
 *
 * Usage:
 *   <MSDrawerSection title="Assets" action={{ label: "Subir", href: "/..." }}>
 *     {children}
 *   </MSDrawerSection>
 *
 * Server Component — no "use client" needed.
 */

import { C, T, S } from "@/lib/ui/tokens";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MSDrawerSectionProps {
  title:    string;
  /** Optional action link rendered right of title */
  action?:  { label: string; href: string };
  children: React.ReactNode;
  style?:   React.CSSProperties;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MSDrawerSection({ title, action, children, style }: MSDrawerSectionProps) {
  return (
    <div style={{
      display:       "flex",
      flexDirection: "column" as const,
      gap:           S[3],
      ...style,
    }}>
      {/* Section heading row */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
      }}>
        <div style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          fontWeight:    T.wt.semibold,
          color:         C.inkLight,
          letterSpacing: "0.06em",
          textTransform: "uppercase" as const,
        }}>
          {title}
        </div>

        {action && (
          <a
            href={action.href}
            style={{
              fontFamily:     T.mono,
              fontSize:       T.sz["2xs"],
              color:          C.blueDark,
              textDecoration: "none",
              letterSpacing:  "0.02em",
            }}
          >
            {action.label} →
          </a>
        )}
      </div>

      {/* Content */}
      {children}
    </div>
  );
}
