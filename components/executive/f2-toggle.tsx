"use client";

/**
 * components/executive/f2-toggle.tsx
 *
 * Collapsible trigger for the F2 advanced analysis panel in Torre de Control.
 *
 * Renders a discrete "Ver composición avanzada" button that expands/collapses
 * whatever is passed as children (the server-rendered SourceMixPanel).
 *
 * Role gating is handled by the parent server component — this component is
 * only rendered when the user's role is allowed.
 *
 * Pure UI: no data, no queries, no business logic.
 */

import { useState } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";

export function F2Toggle({
  children,
  label,
}: {
  children: React.ReactNode;
  label?:   string;
}) {
  const [open, setOpen] = useState(false);
  const closedLabel = label ? label : "Ver composición avanzada · F1 / F2";
  const openLabel   = label ? `Ocultar: ${label}` : "Ocultar desglose de fuentes";

  return (
    <div style={{ marginBottom: S[6] }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          S[1] + 2,
          background:   open ? C.brandLight : "transparent",
          border:       `1px solid ${open ? C.brandBorder : C.line}`,
          borderRadius: R.sm,
          padding:      `${S[1] + 2}px ${S[3]}px`,
          fontSize:     T.sz.sm,
          color:        open ? C.brand : C.inkLight,
          cursor:       "pointer",
          fontFamily:   "monospace",
          fontWeight:   T.wt.semibold,
          marginBottom: open ? S[4] : 0,
        }}
      >
        <span style={{ fontSize: T.sz["2xs"], lineHeight: 1 }}>
          {open ? "▾" : "▸"}
        </span>
        {open ? openLabel : closedLabel}
      </button>

      {open && children}
    </div>
  );
}
