"use client";

/**
 * components/marketing-studio/luca/luca-insight-strip.tsx
 *
 * AGENTIK-MARKETING-UX-VALIDATION-01 — Luca Operating Layer
 *
 * Reusable strip of operational insight cards.
 * Luca is a director operativo de marketing — not a chatbot.
 * Insights are proactive, executive, and actionable.
 *
 * Usage:
 *   <LucaInsightStrip insights={[...]} />
 */

import { C, T, S, R } from "@/lib/ui/tokens";

// ── Types ─────────────────────────────────────────────────────────────────────

export type InsightType = "oportunidad" | "riesgo" | "alerta" | "recomendacion";
export type InsightAgent = "luca" | "mila";

export interface LucaInsight {
  id:       string;
  type:     InsightType;
  agent:    InsightAgent;
  title:    string;
  detail:   string;
  action?:  { label: string; href?: string; onClick?: () => void };
}

// ── Style maps ────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<InsightType, {
  label: string; dot: string; bg: string; border: string; textColor: string;
}> = {
  oportunidad: {
    label: "Oportunidad detectada",
    dot:       C.green,
    bg:        C.greenLight,
    border:    C.greenBorder,
    textColor: C.green,
  },
  riesgo: {
    label: "Riesgo detectado",
    dot:       C.red,
    bg:        C.redLight,
    border:    C.redBorder,
    textColor: C.red,
  },
  alerta: {
    label: "Alerta operativa",
    dot:       C.amber,
    bg:        C.amberLight,
    border:    C.amberBorder,
    textColor: C.amber,
  },
  recomendacion: {
    label: "Luca recomienda",
    dot:       C.blueDark,
    bg:        "#eff6ff",
    border:    "#bfdbfe",
    textColor: C.blueDark,
  },
};

const AGENT_LABEL: Record<InsightAgent, string> = {
  luca: "Luca",
  mila: "Mila",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function LucaInsightStrip({
  insights,
  title = "Luca · Inteligencia Operativa",
  compact = false,
}: {
  insights:  LucaInsight[];
  title?:    string;
  compact?:  boolean;
}) {
  if (insights.length === 0) return null;

  return (
    <div style={{ marginBottom: S[5] }}>
      {/* Header */}
      <div style={{
        display:       "flex",
        alignItems:    "center",
        gap:           S[2],
        marginBottom:  S[3],
      }}>
        <span style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.xs,
          fontWeight:  T.wt.bold,
          color:       C.blueDark,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}>
          {title}
        </span>
        <span style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.xs,
          color:       C.inkFaint,
          background:  C.surface,
          border:      `1px solid ${C.line}`,
          borderRadius: R.pill,
          padding:     `1px ${S[2]}px`,
        }}>
          {insights.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{
        display:   "flex",
        flexDirection: compact ? "row" : "column",
        gap:       S[2],
        overflowX: compact ? "auto" : undefined,
      }}>
        {insights.map(insight => {
          const cfg = TYPE_CONFIG[insight.type];
          return (
            <div
              key={insight.id}
              style={{
                display:      "flex",
                alignItems:   "flex-start",
                gap:          S[3],
                padding:      `${S[3]}px ${S[3]}px`,
                background:   cfg.bg,
                border:       `1px solid ${cfg.border}`,
                borderRadius: R.md,
                flexShrink:   compact ? 0 : undefined,
                minWidth:     compact ? 280 : undefined,
                maxWidth:     compact ? 320 : undefined,
              }}
            >
              {/* Left accent bar */}
              <span style={{
                width:        3,
                flexShrink:   0,
                alignSelf:    "stretch",
                background:   cfg.dot,
                borderRadius: R.pill,
              }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                {/* Type label */}
                <div style={{
                  fontFamily:    T.mono,
                  fontSize:      T.sz.xs,
                  color:         cfg.textColor,
                  fontWeight:    T.wt.bold,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom:  2,
                }}>
                  {cfg.label}
                </div>
                {/* Title */}
                <div style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.sm,
                  color:      C.ink,
                  fontWeight: T.wt.semibold,
                  marginBottom: 3,
                }}>
                  {insight.title}
                </div>
                {/* Detail */}
                <div style={{
                  fontFamily:  T.mono,
                  fontSize:    T.sz.xs,
                  color:       C.inkMid,
                  lineHeight:  1.5,
                  marginBottom: insight.action ? S[2] : 0,
                }}>
                  {insight.detail}
                </div>
                {/* Action */}
                {insight.action && (
                  insight.action.href ? (
                    <a
                      href={insight.action.href}
                      style={{
                        display:    "inline-block",
                        fontFamily: T.mono,
                        fontSize:   T.sz.xs,
                        fontWeight: T.wt.semibold,
                        color:      cfg.textColor,
                        textDecoration: "none",
                        borderBottom: `1px solid ${cfg.border}`,
                      }}
                    >
                      {insight.action.label} →
                    </a>
                  ) : (
                    <button
                      onClick={insight.action.onClick}
                      className="ag-action-ghost"
                      style={{ fontSize: T.sz.xs, padding: `2px ${S[2]}px` }}
                    >
                      {insight.action.label} →
                    </button>
                  )
                )}
              </div>

              {/* Agent badge */}
              <span style={{
                fontFamily:  T.mono,
                fontSize:    T.sz.xs,
                color:       cfg.textColor,
                fontWeight:  T.wt.bold,
                flexShrink:  0,
                alignSelf:   "flex-start",
                opacity:     0.8,
              }}>
                {AGENT_LABEL[insight.agent]}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
