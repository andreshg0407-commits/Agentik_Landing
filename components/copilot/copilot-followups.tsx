"use client";

/**
 * components/copilot/copilot-followups.tsx
 *
 * Agentik Copilot — Scheduled Followups
 * Sprint: AGENTIK-COPILOT-WORKSPACE-01
 *
 * Follow-up tasks the agent is tracking on the user's behalf.
 * Visual-only. No scheduling engine. No timers.
 * Reads from CopilotViewModel.followups[].
 */

import { C, T, S, R }        from "@/lib/ui/tokens";
import type { FollowupItem } from "@/lib/copilot/viewmodel";
import { BASE_LANGUAGE }     from "@/lib/copilot/language";

// ── Priority indicators ───────────────────────────────────────────────────────

const PRIORITY_STYLE: Record<FollowupItem["priority"], { dot: string; dueColor: string }> = {
  high:   { dot: C.amber,    dueColor: C.amberDark  },
  medium: { dot: C.blueDark, dueColor: C.blue       },
  low:    { dot: C.inkFaint, dueColor: C.inkFaint   },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotFollowupsProps {
  items:         FollowupItem[];
  sectionLabel?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotFollowups({
  items,
  sectionLabel = BASE_LANGUAGE["section_followups"],
}: CopilotFollowupsProps) {
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
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.semibold,
          color:         C.inkLight,
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
          color:        C.inkFaint,
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.pill,
          padding:      "1px 6px",
        }}>
          {items.length}
        </span>
      </div>

      {/* Followup items */}
      <div style={{ display: "flex", flexDirection: "column" as const, background: C.white }}>
        {items.map((item, i) => (
          <FollowupRow
            key={item.id}
            item={item}
            isLast={i === items.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// ── Followup row ──────────────────────────────────────────────────────────────

function FollowupRow({
  item,
  isLast,
}: {
  item:   FollowupItem;
  isLast: boolean;
}) {
  const ps = PRIORITY_STYLE[item.priority];

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:           S[3],
      padding:      `${S[2] + 2}px ${S[5]}px`,
      borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
    }}>
      {/* Priority dot */}
      <span style={{
        width:        6,
        height:       6,
        borderRadius: "50%",
        background:   ps.dot,
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

      {/* Domain chip */}
      {item.domain && (
        <span style={{
          fontFamily:   T.mono,
          fontSize:     T.sz["2xs"],
          color:        C.inkGhost,
          background:   C.surface,
          border:       `1px solid ${C.line}`,
          borderRadius: R.sm,
          padding:      "1px 5px",
          flexShrink:   0,
        }}>
          {item.domain}
        </span>
      )}

      {/* Due label */}
      <span style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        fontWeight:    T.wt.semibold,
        color:         ps.dueColor,
        background:    `${ps.dot}10`,
        border:        `1px solid ${ps.dot}30`,
        borderRadius:  R.pill,
        padding:       "1px 7px",
        flexShrink:    0,
        letterSpacing: "0.03em",
      }}>
        {item.due}
      </span>
    </div>
  );
}
