"use client";

/**
 * components/copilot/copilot-summary-strip.tsx
 *
 * Agentik Copilot — Summary Strip
 * Sprint: AGENTIK-COPILOT-PANEL-01
 *
 * Renders a horizontal strip with quick-read Copilot context stats.
 * Reads only from CopilotSummary (ViewModel). No business logic.
 */

import { C, T, S, R }          from "@/lib/ui/tokens";
import type { CopilotSummary } from "@/lib/copilot/viewmodel";

interface CopilotSummaryStripProps {
  summary: CopilotSummary;
}

interface StatItem {
  label: string;
  value: number | string;
  accent?: string;
}

export function CopilotSummaryStrip({ summary }: CopilotSummaryStripProps) {
  const stats: StatItem[] = [
    {
      label:  "Dominios",
      value:   summary.activeDomains.length,
      accent:  C.blueDark,
    },
    {
      label:  "Sugerencias",
      value:   summary.totalSuggestions,
      accent:  summary.totalSuggestions > 0 ? C.blueDark : C.inkFaint,
    },
    {
      label:  "Insights",
      value:   summary.totalInsights,
      accent:  summary.totalInsights > 0 ? C.inkMid : C.inkFaint,
    },
    {
      label:  "Atención",
      value:   summary.attentionCount,
      accent:  summary.attentionCount > 0 ? C.red : C.inkFaint,
    },
    {
      label:  "Oportunidades",
      value:   summary.opportunityCount,
      accent:  summary.opportunityCount > 0 ? C.green : C.inkFaint,
    },
  ];

  return (
    <div style={{
      display:       "flex",
      alignItems:    "stretch",
      gap:            0,
      padding:       `${S[2]}px ${S[4]}px`,
      borderBottom:  `1px solid ${C.line}`,
      background:     C.surface,
      overflowX:     "auto",
    }}>
      {stats.map((stat, i) => (
        <div key={stat.label} style={{
          display:        "flex",
          flexDirection:  "column",
          alignItems:     "center",
          gap:             2,
          padding:        `${S[1]}px ${S[3]}px`,
          borderRight:    i < stats.length - 1 ? `1px solid ${C.line}` : "none",
          minWidth:        56,
        }}>
          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.md,
            fontWeight:  T.wt.semibold,
            color:       stat.accent ?? C.ink,
            lineHeight:  1,
          }}>
            {stat.value}
          </span>
          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.xs,
            color:       C.inkFaint,
            whiteSpace:  "nowrap",
          }}>
            {stat.label}
          </span>
        </div>
      ))}

      {/* Readiness pill */}
      <div style={{
        marginLeft:  "auto",
        display:     "flex",
        alignItems:  "center",
        paddingLeft:  S[3],
      }}>
        <ReadinessPill readiness={summary.readiness} label={summary.readinessLabel} />
      </div>
    </div>
  );
}

// ── Readiness pill ────────────────────────────────────────────────────────────

function ReadinessPill({
  readiness,
  label,
}: {
  readiness: CopilotSummary["readiness"];
  label:     string;
}) {
  const style: Record<string, { bg: string; border: string; text: string; dot: string }> = {
    ready:   { bg: C.greenLight,  border: C.greenBorder,  text: C.green,    dot: C.green  },
    partial: { bg: C.blueLight,   border: C.blueBorder,   text: C.blueDark, dot: C.blueDark },
    empty:   { bg: C.surface,     border: C.line,         text: C.inkFaint, dot: C.inkFaint },
    blocked: { bg: C.amberLight,  border: C.amberBorder,  text: C.amberDark,dot: C.amber  },
  };
  const s = style[readiness] ?? style.empty;

  return (
    <span style={{
      display:      "inline-flex",
      alignItems:   "center",
      gap:           4,
      background:    s.bg,
      border:       `1px solid ${s.border}`,
      borderRadius:  R.pill,
      padding:      "3px 8px",
      fontFamily:    T.mono,
      fontSize:      T.sz.xs,
      fontWeight:    T.wt.medium,
      color:         s.text,
    }}>
      <span style={{
        width:        5,
        height:       5,
        borderRadius: R.pill,
        background:   s.dot,
        flexShrink:   0,
      }} />
      {label}
    </span>
  );
}
