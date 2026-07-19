"use client";

/**
 * components/copilot/copilot-active-work.tsx
 *
 * Agentik Copilot — Active Work
 * Sprint: AGENTIK-COPILOT-WORKSPACE-01
 *
 * Shows work the agent is currently executing: title, progress, priority, domain.
 * Progress bars are visual-only CSS. No timers. No polling. No animations.
 * Reads from CopilotViewModel.activeWork[].
 */

import { C, T, S, R }             from "@/lib/ui/tokens";
import type { ActiveWorkItem }    from "@/lib/copilot/viewmodel";
import { BASE_LANGUAGE }         from "@/lib/copilot/language";

// ── Priority colors ───────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<ActiveWorkItem["priority"], string> = {
  high:   C.amber,
  medium: C.blueDark,
  low:    C.inkFaint,
};

const STATUS_BAR: Record<ActiveWorkItem["status"], string> = {
  running:   C.blueDark,
  analyzing: C.blue,
  paused:    C.inkGhost,
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotActiveWorkProps {
  items:         ActiveWorkItem[];
  sectionLabel?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotActiveWork({
  items,
  sectionLabel = BASE_LANGUAGE["section_active_work"],
}: CopilotActiveWorkProps) {
  if (items.length === 0) return null;

  return (
    <div style={{ borderBottom: `1px solid ${C.line}` }}>
      {/* Section header */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:           S[2],
        padding:      `${S[2]}px ${S[5]}px`,
        borderBottom: `1px solid ${C.line}`,
        background:   C.surface,
      }}>
        {/* Pulsing activity indicator */}
        <div style={{
          width:        6,
          height:       6,
          borderRadius: "50%",
          background:   C.blueDark,
          boxShadow:    `0 0 0 2px rgba(0,74,173,.15)`,
          flexShrink:   0,
        }} />
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.semibold,
          color:         C.blueDark,
          textTransform: "uppercase" as const,
          letterSpacing: "0.07em",
          flex:          1,
        }}>
          {sectionLabel}
        </span>
        <span style={{
          fontFamily:   T.mono,
          fontSize:     T.sz["2xs"],
          fontWeight:   T.wt.semibold,
          color:        C.white,
          background:   C.blueDark,
          borderRadius: R.pill,
          padding:      "1px 6px",
        }}>
          {items.length}
        </span>
      </div>

      {/* Work items */}
      <div style={{ display: "flex", flexDirection: "column" as const }}>
        {items.map((item, i) => (
          <WorkItem
            key={item.id}
            item={item}
            isLast={i === items.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// ── Work item row ─────────────────────────────────────────────────────────────

function WorkItem({
  item,
  isLast,
}: {
  item:   ActiveWorkItem;
  isLast: boolean;
}) {
  const barColor = STATUS_BAR[item.status];
  const progress = Math.max(0, Math.min(100, item.progress));

  return (
    <div style={{
      padding:      `${S[3]}px ${S[5]}px`,
      borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
      background:   C.white,
    }}>
      {/* Title row */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:           S[2],
        marginBottom: S[2],
      }}>
        {/* Priority dot */}
        <span style={{
          width:        5,
          height:       5,
          borderRadius: "50%",
          background:   PRIORITY_DOT[item.priority],
          flexShrink:   0,
          display:      "inline-block",
        }} />
        {/* Title */}
        <span style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.base,
          fontWeight:  T.wt.medium,
          color:       C.ink,
          flex:        1,
          lineHeight:  1.4,
        }}>
          {item.title}
        </span>
        {/* Status label */}
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         barColor,
          background:    `${barColor}12`,
          border:        `1px solid ${barColor}30`,
          borderRadius:  R.pill,
          padding:       "1px 6px",
          flexShrink:    0,
          letterSpacing: "0.03em",
        }}>
          {item.statusLabel}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{
        height:       4,
        background:   C.lineSubtle,
        borderRadius: R.pill,
        overflow:     "hidden",
        marginBottom: S[1] + 2,
      }}>
        <div style={{
          height:       "100%",
          width:        `${progress}%`,
          background:   `linear-gradient(to right, ${barColor}cc, ${barColor})`,
          borderRadius: R.pill,
        }} />
      </div>

      {/* Progress + domain row */}
      <div style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        gap:             S[2],
      }}>
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      C.inkFaint,
          fontWeight: T.wt.semibold,
        }}>
          {progress}% completado
        </span>
        {item.domain && (
          <span style={{
            fontFamily:   T.mono,
            fontSize:     T.sz["2xs"],
            color:        C.inkFaint,
            background:   C.surface,
            border:       `1px solid ${C.line}`,
            borderRadius: R.sm,
            padding:      "1px 5px",
          }}>
            {item.domain}
          </span>
        )}
      </div>
    </div>
  );
}
