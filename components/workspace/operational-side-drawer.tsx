"use client";

/**
 * OperationalSideDrawer
 *
 * Reusable right-side enterprise drawer for operational workspaces.
 * Pure shell — accepts children as content slot.
 * Caller controls title, severity badge, and content.
 *
 * Pattern: parent manages open/close state + which context to show.
 * This component only owns the visual presentation layer.
 */

import { useEffect } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";

export type DrawerSeverity = "info" | "watch" | "warning" | "critical";

const SEV_COLOR: Record<DrawerSeverity, string> = {
  critical: C.red,
  warning:  C.amber,
  watch:    C.blue,
  info:     C.inkFaint,
};
const SEV_LBL: Record<DrawerSeverity, string> = {
  critical: "CRÍTICO",
  warning:  "ATENCIÓN",
  watch:    "EN REVISIÓN",
  info:     "INFO",
};

export type DrawerSize = "default" | "wide" | "extra-wide" | "full";

const SIZE_WIDTH: Record<DrawerSize, number | string> = {
  default:      420,
  wide:         680,
  "extra-wide": "min(78vw, 1360px)",
  full:         "min(960px, 92vw)",
};

export function OperationalSideDrawer({
  open,
  onClose,
  title,
  subtitle,
  statusLabel,
  severity = "info",
  size = "default",
  children,
}: {
  open:         boolean;
  onClose:      () => void;
  title:        string;
  subtitle?:    string;
  statusLabel?: string;
  severity?:    DrawerSeverity;
  size?:        DrawerSize;
  children:     React.ReactNode;
}) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Block background scroll when drawer is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const accentColor = SEV_COLOR[severity];
  const label       = statusLabel ?? SEV_LBL[severity];

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position:      "fixed",
          inset:         0,
          background:    "rgba(15,15,26,0.20)",
          zIndex:        200,
          opacity:       open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition:    "opacity 0.22s ease",
        }}
      />

      {/* ── Drawer panel ── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position:    "fixed",
          top:         0,
          right:       0,
          height:      "100vh",
          width:       SIZE_WIDTH[size],
          maxWidth:    "96vw",
          background:  C.white,
          /* directional shadow — not in E.* tokens by design */
          boxShadow:   "-6px 0 32px rgba(15,15,26,0.10), -1px 0 4px rgba(15,15,26,0.06)",
          borderLeft:  `1px solid ${C.lineSubtle}`,
          zIndex:      201,
          display:     "flex",
          flexDirection: "column" as const,
          transform:   open ? "translateX(0)" : "translateX(100%)",
          transition:  "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
          overflow:    "hidden",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding:      `${S[5]}px ${S[5]}px ${S[4]}px`,
          borderBottom: `1px solid ${C.lineSubtle}`,
          background:   C.surface,
          flexShrink:   0,
          borderTop:    `3px solid ${accentColor}`,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: S[3] }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              {/* Severity badge */}
              <div style={{ marginBottom: S[2] }}>
                <span style={{
                  display:       "inline-block",
                  fontFamily:    T.mono,
                  fontSize:      T.sz["2xs"],
                  fontWeight:    700,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.08em",
                  color:         accentColor,
                  padding:       `2px ${S[2]}px`,
                  border:        `1px solid ${accentColor}`,
                  borderRadius:  R.sm,
                }}>
                  {label}
                </span>
              </div>

              <div style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: 700, color: C.ink, lineHeight: 1.3 }}>
                {title}
              </div>

              {subtitle && (
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: S[1], lineHeight: 1.5 }}>
                  {subtitle}
                </div>
              )}
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              aria-label="Cerrar panel"
              style={{
                background:   "none",
                border:       `1px solid ${C.lineSubtle}`,
                cursor:       "pointer",
                color:        C.inkFaint,
                fontFamily:   T.mono,
                fontSize:     T.sz.base,
                lineHeight:   1,
                padding:      `${S[1] + 2}px ${S[2]}px`,
                flexShrink:   0,
                borderRadius: R.sm,
                transition:   "color 0.15s, background 0.15s",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div style={{ flex: 1, overflowY: "auto" as const, padding: S[5] }}>
          {children}
        </div>
      </div>
    </>
  );
}
