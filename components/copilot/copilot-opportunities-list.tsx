"use client";

/**
 * components/copilot/copilot-opportunities-list.tsx
 *
 * Agentik Copilot — Opportunities List
 * Sprint: AGENTIK-COPILOT-PANEL-01
 *
 * Renders identified opportunities from CopilotOpportunityItem[].
 * Reads only from ViewModel. No business logic.
 */

import { C, T, S, R }                 from "@/lib/ui/tokens";
import type { CopilotOpportunityItem } from "@/lib/copilot/viewmodel";

interface CopilotOpportunitiesListProps {
  opportunities: CopilotOpportunityItem[];
  maxItems?:     number;
}

export function CopilotOpportunitiesList({
  opportunities,
  maxItems = 4,
}: CopilotOpportunitiesListProps) {
  const visible = opportunities.slice(0, maxItems);

  if (visible.length === 0) {
    return (
      <div style={{
        padding:    `${S[3]}px ${S[4]}px`,
        fontFamily:  T.mono,
        fontSize:    T.sz.base,
        color:       C.inkFaint,
        textAlign:  "center",
      }}>
        Sin oportunidades identificadas para este contexto.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        display:       "flex",
        alignItems:    "center",
        gap:            S[2],
        padding:       `${S[2]}px ${S[4]}px`,
        borderBottom:  `1px solid ${C.line}`,
        background:    C.greenLight,
      }}>
        <span style={{
          width:        6,
          height:       6,
          borderRadius: R.pill,
          background:   C.green,
          flexShrink:   0,
        }} />
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.semibold,
          color:         C.greenDark,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
        }}>
          Oportunidades
        </span>
        <span style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          fontWeight:   T.wt.semibold,
          color:        C.white,
          background:   C.green,
          borderRadius: R.pill,
          padding:     "1px 6px",
        }}>
          {opportunities.length}
        </span>
      </div>

      {/* Items */}
      {visible.map((opp, i) => (
        <OpportunityRow
          key={opp.id}
          opportunity={opp}
          isLast={i === visible.length - 1}
        />
      ))}

      {opportunities.length > maxItems && (
        <div style={{
          padding:   `${S[2]}px ${S[4]}px`,
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkFaint,
          borderTop: `1px solid ${C.lineSubtle}`,
        }}>
          +{opportunities.length - maxItems} oportunidad{opportunities.length - maxItems > 1 ? "es" : ""} adicional{opportunities.length - maxItems > 1 ? "es" : ""}
        </div>
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function OpportunityRow({
  opportunity,
  isLast,
}: {
  opportunity: CopilotOpportunityItem;
  isLast:      boolean;
}) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:           S[3],
      padding:      `${S[2]}px ${S[4]}px`,
      borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
    }}>
      {/* Growth indicator */}
      <span style={{
        fontFamily:  T.mono,
        fontSize:    T.sz.sm,
        color:       C.green,
        flexShrink:  0,
        marginTop:   2,
        lineHeight:  1,
      }}>
        ↑
      </span>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz.base,
          fontWeight: T.wt.medium,
          color:      C.ink,
          lineHeight: 1.4,
        }}>
          {opportunity.title}
        </div>
        <div style={{
          fontFamily:          T.sans,
          fontSize:            T.sz.base,
          color:               C.inkLight,
          marginTop:            2,
          lineHeight:           1.5,
          overflow:            "hidden",
          display:             "-webkit-box",
          WebkitLineClamp:      2,
          WebkitBoxOrient:     "vertical" as const,
        }}>
          {opportunity.description}
        </div>

        {/* Source tag */}
        <div style={{ marginTop: S[1] }}>
          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.xs,
            color:       C.greenDark,
            background:  C.greenLight,
            border:     `1px solid ${C.greenBorder}`,
            borderRadius: R.sm,
            padding:    "1px 5px",
          }}>
            {opportunity.source === "insight" ? "Hallazgo" : "Recomendación"}
          </span>
        </div>
      </div>
    </div>
  );
}
