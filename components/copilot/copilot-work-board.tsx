"use client";

/**
 * components/copilot/copilot-work-board.tsx
 *
 * Agentik Copilot — Mesa de Trabajo (Work Board V2)
 * Sprint: AGENTIK-COPILOT-AGENT-OFFICE-01
 *
 * Three-column operational board: Pendientes | En progreso | Completado.
 * The board communicates work state, not data categories.
 *
 * Column mapping (from ViewModel):
 *   Pendientes   — attentionItems + critical/high suggestions (unresolved)
 *   En progreso  — medium suggestions (agent currently analyzing)
 *   Completado   — insights (things the agent has already processed)
 *
 * No execution. No DB. Items labeled with status badges.
 */

import { C, T, S, R }               from "@/lib/ui/tokens";
import type {
  CopilotAttentionItem,
  CopilotSuggestionCard,
  CopilotInsightCard,
} from "@/lib/copilot/viewmodel";
import { BASE_LANGUAGE }            from "@/lib/copilot/language";

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotWorkBoardProps {
  attentionItems: CopilotAttentionItem[];
  suggestions:    CopilotSuggestionCard[];
  insights:       CopilotInsightCard[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotWorkBoard({
  attentionItems,
  suggestions,
  insights,
}: CopilotWorkBoardProps) {
  // Pendientes: all attention items + critical/high suggestions
  const pendingItems = [
    ...attentionItems.slice(0, 2).map(a => ({
      id:         a.id,
      title:      a.title,
      badge:      a.severity === "critical" ? BASE_LANGUAGE["board_badge_critical"] : BASE_LANGUAGE["board_badge_attention"],
      badgeColor: a.severity === "critical" ? C.redDark   : C.amberDark,
      badgeBg:    a.severity === "critical" ? C.redLight  : C.amberLight,
    })),
    ...suggestions
      .filter(s => s.priority === "critical" || s.priority === "high")
      .slice(0, 2)
      .map(s => ({
        id:         s.id,
        title:      s.title,
        badge:      BASE_LANGUAGE["board_badge_pending"],
        badgeColor: C.amberDark,
        badgeBg:    C.amberLight,
      })),
  ].slice(0, 3);

  // En progreso: medium suggestions
  const inProgressItems = suggestions
    .filter(s => s.priority === "medium")
    .slice(0, 3)
    .map(s => ({
      id:         s.id,
      title:      s.title,
      badge:      BASE_LANGUAGE["board_badge_analyzing"],
      badgeColor: C.blue,
      badgeBg:    C.blueLight,
    }));

  // Completado: insights (already processed by the agent)
  const completedItems = insights.slice(0, 3).map(ins => ({
    id:         ins.id,
    title:      ins.title,
    badge:      BASE_LANGUAGE["board_badge_reviewed"],
    badgeColor: C.greenDark,
    badgeBg:    C.greenLight,
  }));

  return (
    <div style={{
      background:   C.surface,
      borderBottom: `1px solid ${C.line}`,
      padding:      `${S[3]}px ${S[4]}px`,
    }}>
      {/* Board label */}
      <div style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        fontWeight:    T.wt.semibold,
        color:         C.inkGhost,
        letterSpacing: "0.10em",
        textTransform: "uppercase" as const,
        marginBottom:  S[3],
      }}>
        {BASE_LANGUAGE["board_label"]}
      </div>

      {/* 3-column grid */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap:                 S[3],
        alignItems:          "start",
      }}>
        <BoardColumn
          title={BASE_LANGUAGE["board_pending_column"]}
          dotColor={attentionItems.some(i => i.severity === "critical") ? C.red : C.amber}
          items={pendingItems}
          emptyText={BASE_LANGUAGE["board_empty_pending"]}
        />
        <BoardColumn
          title={BASE_LANGUAGE["board_in_progress_column"]}
          dotColor={C.blueDark}
          items={inProgressItems}
          emptyText={BASE_LANGUAGE["board_empty_in_progress"]}
          showProgress
        />
        <BoardColumn
          title={BASE_LANGUAGE["board_completed_column"]}
          dotColor={C.green}
          items={completedItems}
          emptyText={BASE_LANGUAGE["board_empty_completed"]}
        />
      </div>
    </div>
  );
}

// ── Board Column ──────────────────────────────────────────────────────────────

interface BoardItemData {
  id:         string;
  title:      string;
  badge:      string;
  badgeColor: string;
  badgeBg:    string;
}

function BoardColumn({
  title,
  dotColor,
  items,
  emptyText,
  showProgress = false,
}: {
  title:         string;
  dotColor:      string;
  items:         BoardItemData[];
  emptyText:     string;
  showProgress?: boolean;
}) {
  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: R.lg,
      overflow:     "hidden",
    }}>
      {/* Column header */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:           6,
        padding:      `${S[2]}px ${S[3]}px`,
        borderBottom: `1px solid ${C.line}`,
        background:   C.surface,
      }}>
        <span style={{
          width:        5,
          height:       5,
          borderRadius: "50%",
          background:   dotColor,
          flexShrink:   0,
          display:      "inline-block",
        }} />
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.semibold,
          color:         C.inkMid,
          textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
          flex:          1,
        }}>
          {title}
        </span>
        {items.length > 0 && (
          <span style={{
            fontFamily:   T.mono,
            fontSize:     T.sz["2xs"],
            fontWeight:   T.wt.semibold,
            color:        C.white,
            background:   dotColor,
            borderRadius: R.pill,
            padding:      "1px 5px",
          }}>
            {items.length}
          </span>
        )}
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <div style={{
          padding:    `${S[3]}px`,
          fontFamily:  T.mono,
          fontSize:    T.sz.xs,
          color:       C.inkGhost,
          textAlign:  "center",
        }}>
          {emptyText}
        </div>
      ) : (
        <div>
          {items.map((item, i) => (
            <div key={item.id} style={{
              padding:      `${S[2]}px ${S[3]}px`,
              borderBottom: i < items.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
              position:     "relative" as const,
            }}>
              {/* Progress bar for "En progreso" */}
              {showProgress && (
                <div style={{
                  position: "absolute" as const,
                  bottom:   0,
                  left:     0,
                  height:   2,
                  width:    `${40 + (i * 20)}%`,
                  background: `linear-gradient(to right, ${C.blueDark}60, ${C.blue}30)`,
                }} />
              )}
              {/* Title */}
              <div style={{
                fontFamily:      T.mono,
                fontSize:        T.sz.xs,
                fontWeight:      T.wt.medium,
                color:           C.ink,
                lineHeight:      1.4,
                marginBottom:    4,
                overflow:        "hidden",
                display:         "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical" as const,
              }}>
                {item.title}
              </div>
              {/* Status badge */}
              <span style={{
                fontFamily:   T.mono,
                fontSize:     T.sz["2xs"],
                color:        item.badgeColor,
                background:   item.badgeBg,
                border:       `1px solid ${item.badgeColor}33`,
                borderRadius: R.sm,
                padding:      "1px 5px",
                display:      "inline-block",
              }}>
                {item.badge}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
