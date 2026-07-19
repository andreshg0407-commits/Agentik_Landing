/**
 * components/marketing-studio/shared/ms-drawer-footer.tsx
 *
 * MARKETING-STUDIO-UX-SYSTEM-03 — Drawer Footer
 *
 * Sticky action tray at the bottom of a drawer panel.
 * Supports primary CTA (blueDark gradient) and secondary/ghost actions.
 *
 * Usage:
 *   <MSDrawerFooter actions={[
 *     { label: "Abrir Foto Estudio", href: "/...", primary: true },
 *     { label: "Ver publicaciones", onClick: () => setTab("publicaciones") },
 *   ]} />
 *
 * Client Component — onClick handlers.
 */

"use client";

import Link from "next/link";
import { C, T, S, R }  from "@/lib/ui/tokens";
import { MS_CTA }       from "@/lib/marketing-studio/ms-design-system";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MSDrawerAction {
  label:    string;
  /** Navigate to URL — use Link */
  href?:    string;
  /** Client-side handler */
  onClick?: () => void;
  /** True → blueDark gradient CTA */
  primary?: boolean;
  /** Disabled state */
  disabled?: boolean;
}

export interface MSDrawerFooterProps {
  actions: MSDrawerAction[];
  style?:  React.CSSProperties;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function actionStyle(primary?: boolean, disabled?: boolean): React.CSSProperties {
  return {
    fontFamily:     T.mono,
    fontSize:       T.sz.sm,
    fontWeight:     T.wt.semibold,
    color:          disabled ? C.inkFaint : primary ? "#fff" : C.inkMid,
    background:     primary ? MS_CTA.primaryButtonBg : C.surface,
    border:         primary ? "none" : `1px solid ${C.line}`,
    borderRadius:   R.sm,
    padding:        "6px 12px",
    cursor:         disabled ? "not-allowed" : "pointer",
    opacity:        disabled ? 0.55 : 1,
    textDecoration: "none",
    boxShadow:      primary && !disabled ? MS_CTA.primaryBoxShadow : "none",
    letterSpacing:  "-0.01em",
    display:        "inline-flex",
    alignItems:     "center",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MSDrawerFooter({ actions, style }: MSDrawerFooterProps) {
  return (
    <div style={{
      padding:    `${S[3]}px ${S[5]}px`,
      borderTop:  `1px solid ${C.line}`,
      background: C.surface,
      display:    "flex",
      gap:        S[2],
      flexShrink: 0,
      flexWrap:   "wrap" as const,
      ...style,
    }}>
      {actions.map(action => {
        if (action.href && !action.disabled) {
          return (
            <Link
              key={action.label}
              href={action.href}
              style={actionStyle(action.primary, action.disabled)}
            >
              {action.label}
            </Link>
          );
        }
        return (
          <button
            key={action.label}
            onClick={action.onClick}
            disabled={action.disabled}
            style={actionStyle(action.primary, action.disabled)}
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
