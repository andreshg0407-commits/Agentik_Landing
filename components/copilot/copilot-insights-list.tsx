"use client";

/**
 * components/copilot/copilot-insights-list.tsx
 *
 * Agentik Copilot — Insights List
 * Sprint: AGENTIK-COPILOT-PANEL-01
 *
 * Renders top insights from CopilotInsightCard[].
 * Reads only from ViewModel. No business logic.
 */

import { C, T, S, R }             from "@/lib/ui/tokens";
import type { CopilotInsightCard } from "@/lib/copilot/viewmodel";
import type { InsightSeverity, InsightType } from "@/lib/copilot/insights/insight-types";
import { BASE_LANGUAGE }           from "@/lib/copilot/language";

// ── Severity palette ──────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<InsightSeverity, {
  bg: string; border: string; dot: string; text: string; label: string;
}> = {
  critical: { bg: C.redLight,   border: C.redBorder,   dot: C.red,      text: C.redDark,   label: "Crítico"    },
  high:     { bg: C.amberLight, border: C.amberBorder, dot: C.amber,    text: C.amberDark, label: "Alto"       },
  medium:   { bg: C.blueLight,  border: C.blueBorder,  dot: C.blueDark, text: C.blue,      label: "Medio"      },
  low:      { bg: C.surface,    border: C.line,        dot: C.inkFaint, text: C.inkLight,  label: "Bajo"       },
  info:     { bg: C.surface,    border: C.line,        dot: C.inkFaint, text: C.inkFaint,  label: "Info"       },
};

const TYPE_LABELS: Record<InsightType, string> = {
  observation:  "Observación",
  anomaly:      "Anomalía",
  opportunity:  "Oportunidad",
  risk:         "Riesgo",
  trend:        "Tendencia",
  alert:        "Alerta",
  explanation:  "Contexto",
  summary:      "Resumen",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotInsightsListProps {
  insights:     CopilotInsightCard[];
  maxItems?:    number;
  sectionLabel?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotInsightsList({
  insights,
  maxItems = 4,
  sectionLabel = BASE_LANGUAGE["section_insights"],
}: CopilotInsightsListProps) {
  const visible = insights.slice(0, maxItems);

  if (visible.length === 0) {
    return (
      <div style={{
        padding:    `${S[4]}px`,
        fontFamily:  T.mono,
        fontSize:    T.sz.base,
        color:       C.inkFaint,
        textAlign:  "center",
      }}>
        {BASE_LANGUAGE["insights_empty"]}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Section header */}
      <div style={{
        display:       "flex",
        alignItems:    "center",
        gap:            S[2],
        padding:       `${S[2]}px ${S[4]}px`,
        borderBottom:  `1px solid ${C.line}`,
        background:    C.surface,
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.semibold,
          color:         C.inkMid,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
        }}>
          {sectionLabel}
        </span>
        <span style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          fontWeight:   T.wt.semibold,
          color:        C.white,
          background:   C.inkMid,
          borderRadius: R.pill,
          padding:     "1px 6px",
        }}>
          {insights.length}
        </span>
      </div>

      {/* Items */}
      {visible.map((insight, i) => (
        <InsightRow
          key={insight.id}
          insight={insight}
          isLast={i === visible.length - 1}
        />
      ))}

      {insights.length > maxItems && (
        <div style={{
          padding:   `${S[2]}px ${S[4]}px`,
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkFaint,
          borderTop: `1px solid ${C.lineSubtle}`,
        }}>
          +{insights.length - maxItems} {BASE_LANGUAGE["insights_overflow"]}
        </div>
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function InsightRow({
  insight,
  isLast,
}: {
  insight: CopilotInsightCard;
  isLast:  boolean;
}) {
  const ss = SEVERITY_STYLE[insight.severity];

  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:           S[3],
      padding:      `${S[2]}px ${S[4]}px`,
      borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
    }}>
      {/* Severity dot */}
      <span style={{
        width:        6,
        height:       6,
        borderRadius: R.pill,
        background:   ss.dot,
        flexShrink:   0,
        marginTop:    4,
      }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz.base,
          fontWeight: T.wt.medium,
          color:      C.ink,
          lineHeight: 1.4,
        }}>
          {insight.title}
        </div>
        <div style={{
          fontFamily:          T.sans,
          fontSize:            T.sz.base,
          color:               C.inkLight,
          marginTop:           2,
          lineHeight:          1.5,
          overflow:            "hidden",
          display:             "-webkit-box",
          WebkitLineClamp:     2,
          WebkitBoxOrient:     "vertical" as const,
        }}>
          {insight.description}
        </div>

        {/* Meta row */}
        <div style={{
          display:    "flex",
          flexWrap:   "wrap",
          alignItems: "center",
          gap:         4,
          marginTop:   S[1],
        }}>
          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.xs,
            color:       ss.text,
            background:  ss.bg,
            border:     `1px solid ${ss.border}`,
            borderRadius: R.sm,
            padding:    "1px 5px",
          }}>
            {TYPE_LABELS[insight.type]}
          </span>
          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.xs,
            color:       C.inkLight,
            background:  C.surface,
            border:     `1px solid ${C.line}`,
            borderRadius: R.sm,
            padding:    "1px 5px",
          }}>
            Confianza: {insight.confidenceLabel}
          </span>
          {(insight.relatedSuggestionIds?.length ?? 0) > 0 && (
            <span style={{
              fontFamily:  T.mono,
              fontSize:    T.sz.xs,
              color:       C.blueDark,
              background:  C.blueLight,
              border:     `1px solid ${C.blueBorder}`,
              borderRadius: R.sm,
              padding:    "1px 5px",
            }}>
              ↗ {BASE_LANGUAGE["insights_related"]}
            </span>
          )}
        </div>
      </div>

      {/* Severity label */}
      <span style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        fontWeight:    T.wt.medium,
        color:         ss.text,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        flexShrink:    0,
      }}>
        {ss.label}
      </span>
    </div>
  );
}
