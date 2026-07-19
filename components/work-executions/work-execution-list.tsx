"use client";

/**
 * components/work-executions/work-execution-list.tsx
 *
 * Agentik — Ejecuciones List
 * Sprint: AGENTIK-WORK-EXECUTION-OBSERVABILITY-01
 *
 * Filterable list of execution cards. Each card is clickable.
 */

import { useState }   from "react";
import { C, T, S, R } from "@/lib/ui/tokens";
import type { WorkExecutionCard } from "@/lib/work/live/viewmodel/work-execution-viewmodel";

// ── Status visual config ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { dot: string; text: string }> = {
  COMPLETED: { dot: C.green,    text: C.green    },
  FAILED:    { dot: C.red,      text: C.red      },
  RUNNING:   { dot: C.amber,    text: C.amber    },
  PENDING:   { dot: C.inkLight, text: C.inkLight },
  QUEUED:    { dot: C.inkLight, text: C.inkLight },
  CANCELLED: { dot: C.inkFaint, text: C.inkFaint },
};

// ── Filter tabs ───────────────────────────────────────────────────────────────

type FilterKey = "all" | "RUNNING" | "COMPLETED" | "FAILED" | "PENDING" | "CANCELLED";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",       label: "Todas"       },
  { key: "RUNNING",   label: "En curso"    },
  { key: "COMPLETED", label: "Completadas" },
  { key: "FAILED",    label: "Fallidas"    },
  { key: "PENDING",   label: "Pendientes"  },
  { key: "CANCELLED", label: "Canceladas"  },
];

// ── Card ──────────────────────────────────────────────────────────────────────

function ExecutionCard({
  card,
  onClick,
}: {
  card:    WorkExecutionCard;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  const sc = STATUS_CONFIG[card.status] ?? STATUS_CONFIG.PENDING;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background:   hov ? C.surfaceAlt : C.white,
        border:       `1px solid ${card.status === "FAILED" ? C.redBorder : C.line}`,
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
      {/* Status bar */}
      <div style={{
        width:        3,
        alignSelf:    "stretch",
        borderRadius: R.pill,
        background:   sc.dot,
        flexShrink:   0,
        minHeight:    40,
      }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Top row: executor label + status badge */}
        <div style={{
          display:        "flex",
          alignItems:     "flex-start",
          justifyContent: "space-between",
          gap:            S[3],
          marginBottom:   S[1],
        }}>
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz.md,
            fontWeight: T.wt.semibold,
            color:      C.ink,
          }}>
            {card.executorLabel}
            {!card.isLive && (
              <span style={{
                marginLeft:   S[2],
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                color:        C.inkFaint,
                background:   C.surface,
                border:       `1px solid ${C.line}`,
                borderRadius: R.pill,
                padding:      `1px 6px`,
                fontWeight:   T.wt.normal,
              }}>
                stub
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: S[2], alignItems: "center", flexShrink: 0 }}>
            {card.retryOfExecutionId && (
              <span style={{
                fontFamily:   T.mono,
                fontSize:     T.sz.xs,
                fontWeight:   T.wt.semibold,
                color:        C.amberDark,
                background:   C.amberLight,
                border:       `1px solid ${C.amberBorder}`,
                borderRadius: R.pill,
                padding:      `1px ${S[2]}px`,
              }}>
                Reintento #{card.retryAttempt}
              </span>
            )}
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              fontWeight:   T.wt.semibold,
              color:        sc.text,
              background:   card.status === "FAILED"    ? C.redLight   :
                            card.status === "COMPLETED" ? C.greenLight :
                            card.status === "RUNNING"   ? C.amberLight :
                            C.surface,
              border:       `1px solid ${
                card.status === "FAILED"    ? C.redBorder   :
                card.status === "COMPLETED" ? C.greenBorder :
                card.status === "RUNNING"   ? C.amberBorder :
                C.line
              }`,
              borderRadius: R.pill,
              padding:      `1px ${S[2]}px`,
            }}>
              ● {card.statusLabel}
            </span>
          </div>
        </div>

        {/* Message */}
        {card.message && (
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            color:        C.inkMid,
            marginBottom: S[2],
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
          }}>
            {card.message}
          </div>
        )}

        {/* Retry origin */}
        {card.retryOfExecutionId && (
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            color:        C.inkFaint,
            marginBottom: S[1],
          }}>
            Reintento de ejecución anterior
          </div>
        )}

        {/* Approval origin */}
        {card.approvalTitle && card.approvalTitle !== "—" && (
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            color:        C.inkMid,
            marginBottom: S[2],
          }}>
            Origen:{" "}
            <span style={{ color: C.ink, fontWeight: T.wt.medium }}>
              {card.approvalTitle}
            </span>
          </div>
        )}

        {/* Meta row */}
        <div style={{
          display:    "flex",
          gap:        S[4],
          alignItems: "center",
          flexWrap:   "wrap",
          marginTop:  S[1],
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
            {card.triggerLabel}
          </span>

          {card.durationLabel && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
              {card.durationLabel}
            </span>
          )}

          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            {card.module}
          </span>

          {card.actionTypeLabel && (
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              fontWeight:   T.wt.medium,
              color:        C.blueDark,
              background:   C.blueLight,
              border:       `1px solid ${C.blueBorder}`,
              borderRadius: R.pill,
              padding:      `1px 6px`,
            }}>
              {card.actionTypeLabel}
            </span>
          )}

          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      C.inkFaint,
            marginLeft: "auto",
          }}>
            {new Date(card.createdAt).toLocaleDateString("es-MX", {
              day:   "2-digit",
              month: "short",
              hour:  "2-digit",
              minute: "2-digit",
            })}
          </span>

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

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  cards:           WorkExecutionCard[];
  onSelectExecution: (card: WorkExecutionCard) => void;
}

// ── Main list ─────────────────────────────────────────────────────────────────

export function WorkExecutionList({ cards, onSelectExecution }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const filtered =
    activeFilter === "all"
      ? cards
      : activeFilter === "PENDING"
        ? cards.filter(c => c.status === "PENDING" || c.status === "QUEUED")
        : cards.filter(c => c.status === activeFilter);

  return (
    <div>
      {/* Filter tabs */}
      <div style={{
        display:       "flex",
        gap:           S[1],
        marginBottom:  S[4],
        borderBottom:  `1px solid ${C.line}`,
        paddingBottom: S[2],
        flexWrap:      "wrap",
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

      {/* Cards or empty */}
      {filtered.length === 0 ? (
        <div style={{
          padding:    `${S[10]}px`,
          textAlign:  "center",
          fontFamily: T.mono,
          fontSize:   T.sz.md,
          color:      C.inkFaint,
        }}>
          Sin ejecuciones en esta categoría.
        </div>
      ) : (
        filtered.map(card => (
          <ExecutionCard
            key={card.id}
            card={card}
            onClick={() => onSelectExecution(card)}
          />
        ))
      )}
    </div>
  );
}
