/**
 * components/marketing-studio/shared/ms-drawer.tsx
 *
 * MARKETING-STUDIO-UX-SYSTEM-03 — Drawer Shell
 *
 * The canonical slide-over panel for all Marketing Studio entity fichas.
 * Provides overlay + 480 px fixed-right panel with scroll lock.
 *
 * Usage:
 *   <MSDrawer onClose={close}>
 *     <MSDrawerHeader ... />
 *     <MSDrawerHero ... />
 *     <MSDrawerTabs ... />
 *     <div style={{ flex:1, overflowY:"auto", padding: S[5] }}>
 *       <MSDrawerSection title="..."> ... </MSDrawerSection>
 *     </div>
 *     <MSDrawerFooter actions={[...]} />
 *   </MSDrawer>
 *
 * Client Component — overlay click handler.
 */

"use client";

import { C, E } from "@/lib/ui/tokens";

export interface MSDrawerProps {
  onClose:     () => void;
  /**
   * Panel width — accepts a CSS value string (e.g. "clamp(520px,42vw,680px)")
   * or a plain pixel number.
   * Default: responsive clamp that fills ~42 vw on desktop and goes full-screen
   * on mobile (maxWidth: 100vw handles the cap).
   */
  width?:      string | number;
  /**
   * Base z-index for the backdrop. Panel uses zIndexBase + 1.
   * Default 800 — above navigation rails, below modals (1000+).
   */
  zIndexBase?: number;
  children:    React.ReactNode;
}

const DRAWER_SHADOW =
  "-8px 0 60px rgba(0,74,173,.18), -2px 0 16px rgba(0,74,173,.10), 0 0 0 1px rgba(0,0,0,.06)";

export function MSDrawer({
  onClose,
  width      = "clamp(520px, 42vw, 680px)",
  zIndexBase = 800,
  children,
}: MSDrawerProps) {
  return (
    <>
      {/* Backdrop — blur + dim, separates workspace from drawer */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position:       "fixed",
          inset:          0,
          background:     "rgba(0,0,0,0.40)",
          backdropFilter: "blur(3px)",
          zIndex:         zIndexBase,
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position:      "fixed",
          top:           0,
          right:         0,
          bottom:        0,
          width:         width as string,   // CSS string or px value
          maxWidth:      "100vw",           // full-screen on mobile
          height:        "100vh",
          background:    C.white,
          borderLeft:    `1px solid ${C.line}`,
          boxShadow:     DRAWER_SHADOW,
          zIndex:        zIndexBase + 1,
          display:       "flex",
          flexDirection: "column",
          overflow:      "hidden",
        }}
      >
        {children}
      </div>
    </>
  );
}
