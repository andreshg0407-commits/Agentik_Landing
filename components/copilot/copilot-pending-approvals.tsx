"use client";

/**
 * components/copilot/copilot-pending-approvals.tsx
 *
 * Agentik Copilot — Pending Approvals
 * Sprint: AGENTIK-COPILOT-WORKSPACE-01
 *
 * Actions the agent wants to take but needs human authorization first.
 * Visual-only. Approve/reject buttons are disabled — prepared for future wiring.
 * Reads from CopilotViewModel.pendingApprovals[].
 */

import { C, T, S, R }                from "@/lib/ui/tokens";
import type { PendingApprovalItem }  from "@/lib/copilot/viewmodel";
import { BASE_LANGUAGE }             from "@/lib/copilot/language";

// ── Risk palette ──────────────────────────────────────────────────────────────

const RISK_STYLE: Record<PendingApprovalItem["risk"], { color: string; bg: string; border: string }> = {
  high:   { color: C.redDark,   bg: C.redLight,   border: C.redBorder   },
  medium: { color: C.amberDark, bg: C.amberLight, border: C.amberBorder },
  low:    { color: C.inkFaint,  bg: C.surface,    border: C.line        },
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotPendingApprovalsProps {
  items:         PendingApprovalItem[];
  sectionLabel?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotPendingApprovals({
  items,
  sectionLabel = BASE_LANGUAGE["section_pending_approvals"],
}: CopilotPendingApprovalsProps) {
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
        background:   C.amberLight,
      }}>
        <span style={{
          width:        6,
          height:       6,
          borderRadius: "50%",
          background:   C.amber,
          flexShrink:   0,
          display:      "inline-block",
        }} />
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.semibold,
          color:         C.amberDark,
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
          background:   C.amber,
          borderRadius: R.pill,
          padding:      "1px 6px",
        }}>
          {items.length}
        </span>
      </div>

      {/* Approval items */}
      <div style={{ display: "flex", flexDirection: "column" as const, background: C.white }}>
        {items.map((item, i) => (
          <ApprovalItem
            key={item.id}
            item={item}
            isLast={i === items.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// ── Approval item row ─────────────────────────────────────────────────────────

function ApprovalItem({
  item,
  isLast,
}: {
  item:   PendingApprovalItem;
  isLast: boolean;
}) {
  const rs = RISK_STYLE[item.risk];

  return (
    <div style={{
      padding:      `${S[3]}px ${S[5]}px`,
      borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
      borderLeft:   `2px solid ${C.amberBorder}`,
    }}>
      {/* Action + status row */}
      <div style={{
        display:      "flex",
        alignItems:   "flex-start",
        gap:           S[2],
        marginBottom: S[1] + 2,
      }}>
        <span style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.base,
          fontWeight:  T.wt.semibold,
          color:       C.ink,
          flex:        1,
          lineHeight:  1.4,
        }}>
          {item.action}
        </span>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          color:         C.amberDark,
          background:    C.amberLight,
          border:        `1px solid ${C.amberBorder}`,
          borderRadius:  R.pill,
          padding:       "1px 6px",
          flexShrink:    0,
          letterSpacing: "0.03em",
        }}>
          {item.statusLabel}
        </span>
      </div>

      {/* Impact */}
      <div style={{
        fontFamily:   T.sans,
        fontSize:     T.sz.base,
        color:        C.inkLight,
        lineHeight:   1.5,
        marginBottom: S[2],
      }}>
        {item.impact}
      </div>

      {/* Meta row: risk + domain + buttons */}
      <div style={{
        display:    "flex",
        alignItems: "center",
        gap:         S[2],
        flexWrap:   "wrap" as const,
      }}>
        <span style={{
          fontFamily:   T.mono,
          fontSize:     T.sz["2xs"],
          color:        rs.color,
          background:   rs.bg,
          border:       `1px solid ${rs.border}`,
          borderRadius: R.sm,
          padding:      "1px 5px",
        }}>
          Riesgo {item.riskLabel}
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
        <div style={{ marginLeft: "auto", display: "flex", gap: S[1] + 2 }}>
          <button disabled type="button" title="Próximamente" style={disabledBtnStyle(true)}>
            Aprobar
          </button>
          <button disabled type="button" title="Próximamente" style={disabledBtnStyle(false)}>
            Revisar
          </button>
        </div>
      </div>
    </div>
  );
}

function disabledBtnStyle(primary: boolean): React.CSSProperties {
  return {
    fontFamily:   T.mono,
    fontSize:     T.sz.xs,
    fontWeight:   primary ? T.wt.semibold : T.wt.normal,
    color:        primary ? C.white : C.inkLight,
    background:   primary ? C.green : "transparent",
    border:       primary ? "none" : `1px solid ${C.line}`,
    borderRadius: R.sm,
    padding:      `3px ${S[3]}px`,
    cursor:       "not-allowed" as const,
    opacity:      0.65,
    lineHeight:   1,
  };
}
