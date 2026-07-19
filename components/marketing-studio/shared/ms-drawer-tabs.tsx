/**
 * components/marketing-studio/shared/ms-drawer-tabs.tsx
 *
 * MARKETING-STUDIO-UX-SYSTEM-03 — Drawer Tab Navigation
 *
 * Horizontal tab bar for switching between sections of an entity ficha.
 * Active tab has C.blueDark underline. Inactive tabs are muted.
 *
 * Usage:
 *   <MSDrawerTabs tabs={TABS} active={activeTab} onChange={setActiveTab} />
 *
 * Client Component — click handler.
 */

"use client";

import { C, T, S } from "@/lib/ui/tokens";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MSDrawerTab {
  id:      string;
  label:   string;
  /** Optional count badge shown next to label */
  count?:  number;
}

export interface MSDrawerTabsProps {
  tabs:     MSDrawerTab[];
  active:   string;
  onChange: (id: string) => void;
  style?:   React.CSSProperties;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MSDrawerTabs({ tabs, active, onChange, style }: MSDrawerTabsProps) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "stretch",
      borderBottom: `1px solid ${C.line}`,
      background:   C.surface,
      flexShrink:   0,
      overflowX:    "auto" as const,
      ...style,
    }}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              fontFamily:    T.mono,
              fontSize:      T.sz.xs,
              fontWeight:    isActive ? T.wt.semibold : T.wt.normal,
              color:         isActive ? C.blueDark : C.inkLight,
              background:    "none",
              border:        "none",
              borderBottom:  isActive
                ? `2px solid ${C.blueDark}`
                : "2px solid transparent",
              cursor:        "pointer",
              padding:       `${S[2]}px ${S[4]}px 9px`,
              letterSpacing: "0.01em",
              whiteSpace:    "nowrap" as const,
              transition:    "color 0.1s, border-color 0.1s",
              flexShrink:    0,
              display:       "inline-flex",
              alignItems:    "center",
              gap:           5,
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span style={{
                display:        "inline-flex",
                alignItems:     "center",
                justifyContent: "center",
                minWidth:       14,
                height:         13,
                padding:        "0 3px",
                background:     isActive ? C.blueDark : C.surfaceAlt,
                color:          isActive ? "#fff"     : C.inkFaint,
                borderRadius:   9999,
                fontSize:       8,
                fontWeight:     T.wt.bold,
                fontFamily:     T.mono,
              }}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
