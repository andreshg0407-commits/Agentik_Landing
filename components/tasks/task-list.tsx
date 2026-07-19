"use client";

/**
 * components/tasks/task-list.tsx
 *
 * Agentik — Task Inbox List
 * Sprint: AGENTIK-TASK-INBOX-01
 *
 * Renders a filterable list of task cards. Each card is clickable to open the detail drawer.
 */

import { useState }          from "react";
import { C, T, S, R }        from "@/lib/ui/tokens";
import type {
  TaskInboxCard,
  TaskInboxFilter,
} from "@/lib/tasks/viewmodel/task-inbox-viewmodel";

// ── Priority colors ────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: C.redLight,   text: C.red,       border: C.redBorder   },
  high:     { bg: C.amberLight, text: C.amberDark,  border: C.amberBorder },
  medium:   { bg: C.blueLight,  text: C.blueDark,   border: C.blueBorder  },
  low:      { bg: C.surface,    text: C.inkLight,   border: C.line        },
};

const STATUS_COLORS: Record<string, string> = {
  open:        C.blue,
  in_progress: C.amber,
  waiting:     C.inkLight,
  blocked:     C.red,
  completed:   C.green,
  cancelled:   C.inkFaint,
};

// ── Filter tabs ────────────────────────────────────────────────────────────────

const FILTERS: { key: TaskInboxFilter; label: string }[] = [
  { key: "all",         label: "Todas"     },
  { key: "open",        label: "Pendientes"},
  { key: "in_progress", label: "En proceso"},
  { key: "completed",   label: "Completadas"},
  { key: "cancelled",   label: "Canceladas" },
];

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  cards:            TaskInboxCard[];
  onSelectTask:     (card: TaskInboxCard) => void;
}

// ── Card component ─────────────────────────────────────────────────────────────

function TaskCard({ card, onClick }: { card: TaskInboxCard; onClick: () => void }) {
  const pColor = PRIORITY_COLORS[card.priority] ?? PRIORITY_COLORS.low;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:   hovered ? C.surfaceAlt : C.white,
        border:       `1px solid ${hovered ? C.line : C.line}`,
        borderRadius: R.lg,
        padding:      `${S[4]}px ${S[5]}px`,
        cursor:       "pointer",
        transition:   "background 0.1s",
        marginBottom: S[2],
        display:      "flex",
        gap:          S[4],
        alignItems:   "flex-start",
      }}
    >
      {/* Priority indicator */}
      <div style={{
        width:        3,
        alignSelf:    "stretch",
        borderRadius: R.pill,
        background:   pColor.text,
        flexShrink:   0,
        minHeight:    40,
      }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title row */}
        <div style={{
          display:        "flex",
          alignItems:     "flex-start",
          justifyContent: "space-between",
          gap:            S[3],
          marginBottom:   S[1],
        }}>
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.md,
            fontWeight:   T.wt.semibold,
            color:        C.ink,
            lineHeight:   1.4,
          }}>
            {card.title}
          </div>
          <div style={{ display: "flex", gap: S[2], flexShrink: 0, alignItems: "center" }}>
            {/* Overdue badge */}
            {card.isOverdue && (
              <span style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                fontWeight:   T.wt.semibold,
                color:        C.red,
                background:   C.redLight,
                border:       `1px solid ${C.redBorder}`,
                borderRadius: R.pill,
                padding:      `1px ${S[2]}px`,
              }}>
                Vencida
              </span>
            )}
            {/* Priority badge */}
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              fontWeight:   T.wt.medium,
              color:        pColor.text,
              background:   pColor.bg,
              border:       `1px solid ${pColor.border}`,
              borderRadius: R.pill,
              padding:      `1px ${S[2]}px`,
            }}>
              {card.priorityLabel}
            </span>
          </div>
        </div>

        {/* Description */}
        {card.description && (
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            color:        C.inkMid,
            marginBottom: S[2],
            lineHeight:   1.5,
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
          }}>
            {card.description}
          </div>
        )}

        {/* Meta row */}
        <div style={{
          display:    "flex",
          gap:        S[4],
          alignItems: "center",
          flexWrap:   "wrap",
        }}>
          {/* Status */}
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      STATUS_COLORS[card.status] ?? C.inkLight,
            fontWeight: T.wt.medium,
          }}>
            ● {card.statusLabel}
          </span>

          {/* Owner */}
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
            {card.ownerLabel}
          </span>

          {/* Module */}
          {card.module && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              {card.module}
            </span>
          )}

          {/* Date */}
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginLeft: "auto" }}>
            {new Date(card.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
          </span>

          {/* CTA */}
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      C.blueDark,
            fontWeight: T.wt.medium,
          }}>
            Ver detalle →
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main list ─────────────────────────────────────────────────────────────────

export function TaskList({ cards, onSelectTask }: Props) {
  const [activeFilter, setActiveFilter] = useState<TaskInboxFilter>("all");

  const filtered = activeFilter === "all"
    ? cards
    : cards.filter(c => c.status === activeFilter);

  return (
    <div>
      {/* Filter tabs */}
      <div style={{
        display:      "flex",
        gap:          S[1],
        marginBottom: S[4],
        borderBottom: `1px solid ${C.line}`,
        paddingBottom: S[2],
      }}>
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.sm,
              fontWeight:   activeFilter === f.key ? T.wt.semibold : T.wt.normal,
              color:        activeFilter === f.key ? C.blueDark : C.inkLight,
              background:   activeFilter === f.key ? C.blueLight : "transparent",
              border:       activeFilter === f.key ? `1px solid ${C.blueBorder}` : "1px solid transparent",
              borderRadius: R.md,
              padding:      `${S[1]}px ${S[3]}px`,
              cursor:       "pointer",
            }}
          >
            {f.label}
            {f.key === "all" && (
              <span style={{ marginLeft: S[1], color: C.inkFaint }}>{cards.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Card list */}
      {filtered.length === 0 ? (
        <div style={{
          padding:      `${S[10]}px`,
          textAlign:    "center",
          fontFamily:   T.mono,
          fontSize:     T.sz.md,
          color:        C.inkFaint,
        }}>
          Sin tareas en esta categoría.
        </div>
      ) : (
        filtered.map(card => (
          <TaskCard key={card.id} card={card} onClick={() => onSelectTask(card)} />
        ))
      )}
    </div>
  );
}
