"use client";

/**
 * components/marketing-studio/library/world-tab-bar.tsx
 *
 * MARKETING-LIBRARY-INVENTORY-TRUTH-02A — World Tab Navigation
 *
 * Tabs: Todas | Castillitos | Latin Kids | Importación | Sin clasificar
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import {
  type WorldCode,
  ALL_WORLDS,
  WORLD_LABELS,
  WORLD_ACCENT,
  type WorldCounts,
} from "@/lib/marketing-studio/library/world-classification";

interface WorldTabBarProps {
  active:      WorldCode | "todas";
  onSelect:    (world: WorldCode | "todas") => void;
  counts:      WorldCounts;
  snapshotAt:  string | null;
}

const TABS: Array<{ id: WorldCode | "todas"; label: string }> = [
  { id: "todas",          label: "Todas" },
  ...ALL_WORLDS.map(w => ({ id: w, label: WORLD_LABELS[w] })),
];

export function WorldTabBar({ active, onSelect, counts, snapshotAt }: WorldTabBarProps) {
  function getCount(id: WorldCode | "todas"): number {
    if (id === "todas") return counts.total;
    return counts[id];
  }

  function getAccent(id: WorldCode | "todas"): string {
    if (id === "todas") return C.blueDark;
    return WORLD_ACCENT[id];
  }

  return (
    <div style={{ marginBottom: S[4] }}>
      <div style={{
        display: "flex", alignItems: "center", gap: S[1],
        borderBottom: `1px solid ${C.line}`,
      }}>
        {TABS.map(tab => {
          const isActive = active === tab.id;
          const accent = getAccent(tab.id);
          const count = getCount(tab.id);
          const isAdmin = tab.id === "sin_clasificar";

          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              style={{
                fontFamily:    T.mono,
                fontSize:      T.sz.xs,
                fontWeight:    isActive ? T.wt.bold : T.wt.semibold,
                color:         isActive ? accent : C.inkMid,
                background:    "none",
                border:        "none",
                borderBottom:  isActive ? `2px solid ${accent}` : "2px solid transparent",
                padding:       `${S[2]}px ${S[3]}px`,
                cursor:        "pointer",
                transition:    "color .1s, border-color .1s",
                opacity:       isAdmin && count === 0 ? 0.5 : 1,
                whiteSpace:    "nowrap" as const,
              }}
            >
              {tab.label}
              <span style={{
                marginLeft:    4,
                fontFamily:    T.mono,
                fontSize:      9,
                fontWeight:    T.wt.bold,
                color:         isActive ? accent : C.inkFaint,
                fontVariantNumeric: "tabular-nums",
              }}>
                {count}
              </span>
            </button>
          );
        })}

        {/* Snapshot timestamp */}
        {snapshotAt && (
          <div style={{
            marginLeft: "auto",
            fontFamily: T.mono,
            fontSize:   9,
            color:      C.inkGhost,
            whiteSpace: "nowrap" as const,
          }}>
            Inventario · {new Date(snapshotAt).toLocaleDateString("es-CO", {
              day: "2-digit", month: "short", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </div>
        )}
      </div>
    </div>
  );
}
