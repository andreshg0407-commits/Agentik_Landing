"use client";

/**
 * components/operational-map/meeting-detail-toggle.tsx
 *
 * Collapses technical detail (KPI table + workbook) behind a toggle.
 * Collapsed by default so the meeting starts with the executive view only.
 *
 * Sprint: AGENTIK-OPS-SAG-MEETING-REFINEMENT-01
 */

import { useState }     from "react";
import { T, S, C, R }  from "@/lib/ui/tokens";

interface Props {
  children: React.ReactNode;
}

export function MeetingDetailToggle({ children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      {/* ── Toggle bar ── */}
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:        12,
        margin:     "28px 0 0",
      }}>
        <div style={{ flex: 1, height: 1, background: C.line }} />
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            display:       "inline-flex",
            alignItems:    "center",
            gap:           S[2],
            fontFamily:    T.mono,
            fontSize:      T.sz.xs,
            fontWeight:    600,
            color:         open ? C.inkMid : C.blueDark,
            background:    open ? C.surfaceAlt : "#eff6ff",
            border:        `1px solid ${open ? C.line : "#bfdbfe"}`,
            borderRadius:  R.md,
            padding:       `${S[2]}px ${S[4]}px`,
            cursor:        "pointer",
            letterSpacing: "0.03em",
            flexShrink:    0,
          }}
        >
          <span style={{ fontSize: "10px" }}>{open ? "▲" : "▼"}</span>
          {open ? "Ocultar detalle técnico" : "Ver detalle técnico"}
        </button>
        <div style={{ flex: 1, height: 1, background: C.line }} />
      </div>

      {/* ── Collapsible content ── */}
      {open && (
        <div style={{ marginTop: S[4] }}>
          {children}
        </div>
      )}
    </div>
  );
}
