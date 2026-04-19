/**
 * components/shell/fiscal-window-selector.tsx
 *
 * Fiscal window selector — server component (no "use client" needed).
 *
 * Renders a compact pill-row of mode links. The active mode is highlighted.
 * Clicking a link navigates to the same page with ?window=<mode>.
 *
 * Usage:
 *   <FiscalWindowSelector
 *     currentMode="current_and_prior"
 *     baseHref="/castillitos/collections"
 *     defaultMode="current_and_prior"
 *   />
 */

import Link from "next/link";
import {
  FISCAL_WINDOW_MODES,
  FISCAL_WINDOW_SHORT_LABELS,
  FISCAL_WINDOW_PARAM,
  type FiscalWindowMode,
} from "@/lib/finance/fiscal-window";

// ── Props ─────────────────────────────────────────────────────────────────────

interface FiscalWindowSelectorProps {
  /** Active mode — typically parsed from searchParams */
  currentMode:  FiscalWindowMode;
  /** Base page URL without query params, e.g. "/castillitos/collections" */
  baseHref:     string;
  /** The mode that is the "natural default" for this page — gets a subtle indicator */
  defaultMode?: FiscalWindowMode;
}

// ── Style helpers ─────────────────────────────────────────────────────────────

const ACTIVE_STYLE: React.CSSProperties = {
  fontFamily:   "monospace",
  fontSize:     11,
  fontWeight:   700,
  padding:      "3px 10px",
  borderRadius: 4,
  textDecoration: "none",
  border:       "1px solid",
  cursor:       "default",
  // colors set inline per mode
};

const INACTIVE_STYLE: React.CSSProperties = {
  ...ACTIVE_STYLE,
  cursor: "pointer",
};

const MODE_COLORS: Record<FiscalWindowMode, { active: string; border: string; bg: string }> = {
  current_year:      { active: "#7c3aed", border: "#ddd6fe", bg: "#f5f3ff" },
  current_and_prior: { active: "#1e40af", border: "#bfdbfe", bg: "#eff6ff" },
  trailing_12:       { active: "#065f46", border: "#6ee7b7", bg: "#ecfdf5" },
  full_history:      { active: "#374151", border: "#e5e7eb", bg: "#f9fafb" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export function FiscalWindowSelector({
  currentMode,
  baseHref,
  defaultMode,
}: FiscalWindowSelectorProps) {
  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        5,
      flexWrap:   "wrap",
    }}>
      <span style={{
        fontFamily:    "monospace",
        fontSize:      10,
        fontWeight:    700,
        color:         "#9ca3af",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginRight:   4,
      }}>
        Ventana fiscal:
      </span>

      {FISCAL_WINDOW_MODES.map(mode => {
        const isActive  = mode === currentMode;
        const isDefault = mode === defaultMode;
        const colors    = MODE_COLORS[mode];
        const label     = FISCAL_WINDOW_SHORT_LABELS[mode];

        const href = `${baseHref}?${FISCAL_WINDOW_PARAM}=${mode}`;

        const style: React.CSSProperties = isActive
          ? {
              ...ACTIVE_STYLE,
              color:      colors.active,
              background: colors.bg,
              borderColor: colors.active,
            }
          : {
              ...INACTIVE_STYLE,
              color:      "#6b7280",
              background: "#fff",
              borderColor: "#e5e7eb",
            };

        return isActive ? (
          <span key={mode} style={style}>
            {label}
            {isDefault && (
              <span style={{ fontSize: 9, color: colors.active, marginLeft: 4, opacity: 0.7 }}>
                ●
              </span>
            )}
          </span>
        ) : (
          <Link key={mode} href={href} style={style}>
            {label}
            {isDefault && (
              <span style={{ fontSize: 9, color: "#9ca3af", marginLeft: 4 }}>
                ●
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
