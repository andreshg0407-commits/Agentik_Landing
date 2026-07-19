/**
 * components/marketing-studio/shared/ms-filter-bar.tsx
 *
 * MARKETING-STUDIO-UX-SYSTEM-01 — Unified Filter Bar
 *
 * THE single filter/chip/search pattern for all Marketing Studio modules.
 * Replaces:
 *   - Inline chip rows in Biblioteca (status + category filters)
 *   - Inline chip rows in Catálogos (builder filters)
 *   - Inline filter row in Shopify (product search)
 *
 * Client Component — required for click state.
 */

"use client";

import { useState }         from "react";
import { C, T, S, R }       from "@/lib/ui/tokens";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MSFilterChip {
  /** Unique key used as filter value */
  key:    string;
  /** Display label */
  label:  string;
  /** Optional count badge */
  count?: number;
}

export interface MSFilterBarProps {
  /** Chip groups — each group filters on its own axis */
  groups:          MSFilterGroup[];
  /** Controlled selected state: { [groupKey]: chipKey } */
  selected:        Record<string, string>;
  /** Fires when user picks a chip (groupKey, chipKey) */
  onChange:        (groupKey: string, chipKey: string) => void;
  /** Optional search box placeholder */
  searchPlaceholder?: string;
  /** Controlled search value */
  searchValue?:    string;
  /** Fires on every search keystroke */
  onSearchChange?: (value: string) => void;
  style?:          React.CSSProperties;
}

export interface MSFilterGroup {
  key:    string;
  chips:  MSFilterChip[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MSFilterBar({
  groups,
  selected,
  onChange,
  searchPlaceholder = "Buscar…",
  searchValue,
  onSearchChange,
  style,
}: MSFilterBarProps) {
  const [localSearch, setLocalSearch] = useState(searchValue ?? "");
  const search = searchValue !== undefined ? searchValue : localSearch;

  function handleSearch(v: string) {
    setLocalSearch(v);
    onSearchChange?.(v);
  }

  return (
    <div style={{
      display:    "flex",
      alignItems: "center",
      gap:        S[3],
      flexWrap:   "wrap" as const,
      ...style,
    }}>

      {/* Chip groups */}
      {groups.map(group => (
        <div key={group.key} style={{ display: "flex", alignItems: "center", gap: S[1] }}>
          {group.chips.map(chip => {
            const active = selected[group.key] === chip.key;
            return (
              <button
                key={chip.key}
                onClick={() => onChange(group.key, chip.key)}
                style={{
                  display:       "inline-flex",
                  alignItems:    "center",
                  gap:           S[1],
                  padding:       `${S[1]}px ${S[3]}px`,
                  background:    active ? C.blueDark : C.white,
                  color:         active ? "#fff"     : C.inkMid,
                  border:        `1px solid ${active ? C.blueDark : C.line}`,
                  borderRadius:  R.pill,
                  fontFamily:    T.mono,
                  fontSize:      "10px",
                  fontWeight:    active ? "700" : "500",
                  letterSpacing: "0.03em",
                  cursor:        "pointer",
                  transition:    "all 120ms ease",
                  flexShrink:    0,
                  whiteSpace:    "nowrap" as const,
                }}
              >
                {chip.label}
                {chip.count !== undefined && (
                  <span style={{
                    display:      "inline-flex",
                    alignItems:   "center",
                    justifyContent: "center",
                    minWidth:     16,
                    height:       14,
                    padding:      "0 4px",
                    background:   active ? "rgba(255,255,255,.20)" : C.surface,
                    borderRadius: R.pill,
                    fontFamily:   T.mono,
                    fontSize:     "9px",
                    fontWeight:   "700",
                    color:        active ? "rgba(255,255,255,.85)" : C.inkFaint,
                  }}>
                    {chip.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}

      {/* Search box */}
      {onSearchChange !== undefined || searchValue !== undefined ? (
        <input
          type="text"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder={searchPlaceholder}
          style={{
            flex:        1,
            minWidth:    160,
            maxWidth:    280,
            padding:     `${S[1]}px ${S[3]}px`,
            background:  C.white,
            border:      `1px solid ${C.line}`,
            borderRadius: R.md,
            fontFamily:  T.mono,
            fontSize:    T.sz.xs,
            color:       C.ink,
            outline:     "none",
          }}
        />
      ) : null}
    </div>
  );
}
