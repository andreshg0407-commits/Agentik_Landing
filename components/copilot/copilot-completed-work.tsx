"use client";

/**
 * components/copilot/copilot-completed-work.tsx
 *
 * Agentik Copilot — Completed Work
 * Sprint: AGENTIK-COPILOT-WORKSPACE-01
 *
 * Shows recently completed tasks. Communicates the agent has been productive.
 * Reads from CopilotViewModel.completedWork[].
 */

import { C, T, S, R }              from "@/lib/ui/tokens";
import type { CompletedWorkItem }  from "@/lib/copilot/viewmodel";
import { BASE_LANGUAGE }           from "@/lib/copilot/language";

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotCompletedWorkProps {
  items:         CompletedWorkItem[];
  sectionLabel?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotCompletedWork({
  items,
  sectionLabel = BASE_LANGUAGE["section_completed_work"],
}: CopilotCompletedWorkProps) {
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
        background:   C.greenLight,
      }}>
        <span style={{
          width:        6,
          height:       6,
          borderRadius: "50%",
          background:   C.green,
          flexShrink:   0,
          display:      "inline-block",
        }} />
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.semibold,
          color:         C.greenDark,
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
          background:   C.green,
          borderRadius: R.pill,
          padding:      "1px 6px",
        }}>
          {items.length}
        </span>
      </div>

      {/* Completed items */}
      <div style={{ display: "flex", flexDirection: "column" as const, background: C.white }}>
        {items.map((item, i) => (
          <CompletedItem
            key={item.id}
            item={item}
            isLast={i === items.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// ── Completed item row ────────────────────────────────────────────────────────

function CompletedItem({
  item,
  isLast,
}: {
  item:   CompletedWorkItem;
  isLast: boolean;
}) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:           S[3],
      padding:      `${S[2] + 2}px ${S[5]}px`,
      borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
    }}>
      {/* Check mark */}
      <div style={{
        width:          18,
        height:         18,
        borderRadius:   "50%",
        background:     C.greenLight,
        border:         `1.5px solid ${C.greenBorder}`,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        flexShrink:     0,
        marginTop:      1,
      }}>
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      C.green,
          lineHeight: 1,
          fontWeight: T.wt.bold,
        }}>
          ✓
        </span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.base,
          fontWeight:  T.wt.medium,
          color:       C.ink,
          lineHeight:  1.4,
          marginBottom: 3,
        }}>
          {item.title}
        </div>
        <div style={{
          display:    "flex",
          alignItems: "center",
          gap:         S[2],
          flexWrap:   "wrap" as const,
        }}>
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      C.inkGhost,
          }}>
            {item.completedLabel}
          </span>
          {item.outcome && (
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz["2xs"],
              color:        C.greenDark,
              background:   C.greenLight,
              border:       `1px solid ${C.greenBorder}`,
              borderRadius: R.sm,
              padding:      "1px 5px",
            }}>
              {item.outcome}
            </span>
          )}
          {item.domain && (
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz["2xs"],
              color:        C.inkGhost,
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
    </div>
  );
}
