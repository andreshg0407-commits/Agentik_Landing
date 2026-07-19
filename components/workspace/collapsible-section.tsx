"use client";

/**
 * CollapsibleSection
 *
 * Enterprise collapsible section for operational workspaces.
 * Uses ReactNode slot pattern — children are Server Component output,
 * this component only owns the expand/collapse state.
 *
 * Pattern: Server Component renders data → passes as ReactNode children →
 * this Client Component handles interaction.
 */

import { useState } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";

export function CollapsibleSection({
  title,
  meta,
  accent,
  defaultOpen = true,
  detailLabel,
  children,
}: {
  title:         string;
  meta?:         string;
  accent?:       string;
  defaultOpen?:  boolean;
  detailLabel?:  string;
  children:      React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section style={{ marginBottom: S[8] }}>
      {/* ── Header strip — always visible ── */}
      <button
        onClick={() => setOpen(prev => !prev)}
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          width:          "100%",
          textAlign:      "left",
          padding:        `${S[4]}px ${S[4]}px`,
          background:     C.surface,
          border:         `1px solid ${C.lineSubtle}`,
          ...(accent ? { borderLeft: `3px solid ${accent}` } : {}),
          borderRadius:   R.md,
          cursor:         "pointer",
          marginBottom:   open ? S[4] : 0,
          transition:     "background 0.15s, margin-bottom 0.2s",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            {accent && (
              <span style={{
                display:      "inline-block",
                width:        3,
                height:       12,
                borderRadius: R.pill,
                background:   accent,
                flexShrink:   0,
              }} />
            )}
            <span style={{
              fontFamily:    T.mono,
              fontSize:      T.sz.xs,
              fontWeight:    700,
              color:         open ? C.inkMid : C.inkLight,
              textTransform: "uppercase" as const,
              letterSpacing: "0.08em",
              transition:    "color 0.15s",
            }}>
              {title}
            </span>
          </div>
          {meta && (
            <span style={{
              fontFamily:  T.mono,
              fontSize:    T.sz.xs,
              color:       C.inkFaint,
              paddingLeft: accent ? S[2] + 3 : 0,
            }}>
              {meta}
            </span>
          )}
        </div>

        {/* Right: optional detail label + collapse arrow */}
        <div style={{ display: "flex", alignItems: "center", gap: S[2], flexShrink: 0, marginLeft: S[3] }}>
          {detailLabel && (
            <span style={{
              fontFamily:    T.mono,
              fontSize:      T.sz.xs,
              color:         open ? C.inkLight : C.inkFaint,
              letterSpacing: "0.02em",
              transition:    "color 0.15s",
              whiteSpace:    "nowrap" as const,
            }}>
              {detailLabel} ▸
            </span>
          )}
          <span style={{
            color:      C.inkFaint,
            fontSize:   9,
            display:    "inline-block",
            transition: "transform 0.2s ease",
            transform:  open ? "rotate(90deg)" : "rotate(0deg)",
            flexShrink: 0,
            lineHeight: 1,
          }}>
            ▶
          </span>
        </div>
      </button>

      {/* ── Content — smooth height collapse ── */}
      <div style={{
        overflow:   "hidden",
        maxHeight:  open ? "9999px" : "0px",
        transition: open
          ? "max-height 0.35s ease"
          : "max-height 0.2s ease",
      }}>
        {children}
      </div>
    </section>
  );
}
