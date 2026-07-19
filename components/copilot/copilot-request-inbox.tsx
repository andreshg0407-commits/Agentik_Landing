"use client";

/**
 * components/copilot/copilot-request-inbox.tsx
 *
 * Agentik Copilot — Request Inbox
 * Sprint: AGENTIK-COPILOT-WORKSPACE-01
 *
 * Request history: actions the user has asked the agent to perform.
 * Prepares the structural ground for future chat integration.
 * Visual-only. Reads from CopilotViewModel.requestInbox[].
 */

import { C, T, S, R }              from "@/lib/ui/tokens";
import type { RequestInboxItem }   from "@/lib/copilot/viewmodel";
import { BASE_LANGUAGE }           from "@/lib/copilot/language";

// ── Status palette ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<RequestInboxItem["status"], {
  color:   string;
  bg:      string;
  border:  string;
}> = {
  completed:   { color: C.greenDark, bg: C.greenLight,  border: C.greenBorder  },
  in_progress: { color: C.blue,      bg: C.blueLight,   border: C.blueBorder   },
  pending:     { color: C.inkFaint,  bg: C.surface,     border: C.line         },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotRequestInboxProps {
  items:         RequestInboxItem[];
  sectionLabel?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotRequestInbox({
  items,
  sectionLabel = BASE_LANGUAGE["section_request_inbox"],
}: CopilotRequestInboxProps) {
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
          color:        C.inkFaint,
          background:   C.white,
          border:       `1px solid ${C.line}`,
          borderRadius: R.pill,
          padding:      "1px 6px",
        }}>
          {items.length}
        </span>
      </div>

      {/* Request items */}
      <div style={{ display: "flex", flexDirection: "column" as const, background: C.white }}>
        {items.map((item, i) => (
          <RequestRow
            key={item.id}
            item={item}
            isLast={i === items.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// ── Request row ───────────────────────────────────────────────────────────────

function RequestRow({
  item,
  isLast,
}: {
  item:   RequestInboxItem;
  isLast: boolean;
}) {
  const ss = STATUS_STYLE[item.status];

  return (
    <div style={{
      display:      "flex",
      alignItems:   "center",
      gap:           S[3],
      padding:      `${S[2] + 2}px ${S[5]}px`,
      borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
    }}>
      {/* Request text */}
      <span style={{
        fontFamily:  T.mono,
        fontSize:    T.sz.base,
        fontWeight:  T.wt.medium,
        color:       C.ink,
        flex:        1,
        lineHeight:  1.4,
      }}>
        {item.request}
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

      {/* Status badge */}
      <span style={{
        fontFamily:   T.mono,
        fontSize:     T.sz["2xs"],
        fontWeight:   T.wt.semibold,
        color:        ss.color,
        background:   ss.bg,
        border:       `1px solid ${ss.border}`,
        borderRadius: R.pill,
        padding:      "1px 7px",
        flexShrink:   0,
        letterSpacing:"0.03em",
      }}>
        {item.statusLabel}
      </span>
    </div>
  );
}
