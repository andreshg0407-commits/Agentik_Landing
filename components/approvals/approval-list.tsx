"use client";

/**
 * components/approvals/approval-list.tsx
 *
 * Agentik — Approval Inbox List
 * Sprint: AGENTIK-APPROVAL-INBOX-01
 *
 * Filterable list of approval cards. Each card is clickable to open the detail drawer.
 */

import { useState }     from "react";
import { C, T, S, R }   from "@/lib/ui/tokens";
import type {
  ApprovalInboxCard,
} from "@/lib/approvals/viewmodel/approval-inbox-viewmodel";
import type { ApprovalStatus } from "@/lib/approvals/approval-types";

// ── Priority visual styles ────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, { bar: string; badge: string; text: string; border: string }> = {
  CRITICAL: { bar: C.red,      badge: C.redLight,   text: C.red,      border: C.redBorder   },
  HIGH:     { bar: C.amber,    badge: C.amberLight,  text: C.amberDark, border: C.amberBorder },
  MEDIUM:   { bar: C.blueDark, badge: C.blueLight,   text: C.blueDark,  border: C.blueBorder  },
  LOW:      { bar: C.inkFaint, badge: C.surface,     text: C.inkLight,  border: C.line        },
};

const STATUS_COLOR: Record<ApprovalStatus, string> = {
  PENDING:   C.amber,
  APPROVED:  C.green,
  REJECTED:  C.red,
  CANCELLED: C.inkFaint,
  EXPIRED:   C.inkLight,
};

// ── Filter tabs ───────────────────────────────────────────────────────────────

type FilterKey = "all" | ApprovalStatus;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",       label: "Todas"     },
  { key: "PENDING",   label: "Pendientes"},
  { key: "APPROVED",  label: "Aprobadas" },
  { key: "REJECTED",  label: "Rechazadas"},
  { key: "CANCELLED", label: "Canceladas"},
  { key: "EXPIRED",   label: "Expiradas" },
];

// ── Card component ────────────────────────────────────────────────────────────

function ApprovalCard({ card, onClick }: { card: ApprovalInboxCard; onClick: () => void }) {
  const pColor  = PRIORITY_COLORS[card.priority] ?? PRIORITY_COLORS.LOW;
  const [hov, setHov] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background:   hov ? C.surfaceAlt : C.white,
        border:       `1px solid ${C.line}`,
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
      {/* Priority bar */}
      <div style={{
        width:        3,
        alignSelf:    "stretch",
        borderRadius: R.pill,
        background:   pColor.bar,
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
            fontFamily: T.mono,
            fontSize:   T.sz.md,
            fontWeight: T.wt.semibold,
            color:      C.ink,
            lineHeight: 1.4,
          }}>
            {card.title}
          </div>
          <div style={{ display: "flex", gap: S[2], flexShrink: 0, alignItems: "center" }}>
            {card.isExpired && (
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
            <span style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              fontWeight:   T.wt.medium,
              color:        pColor.text,
              background:   pColor.badge,
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
            overflow:     "hidden",
            textOverflow: "ellipsis",
            whiteSpace:   "nowrap",
          }}>
            {card.description}
          </div>
        )}

        {/* Impact if exists */}
        {card.impactSummary && (
          <div style={{
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            color:        C.inkMid,
            marginBottom: S[2],
          }}>
            Impacto: <strong style={{ color: C.ink }}>{card.impactSummary}</strong>
          </div>
        )}

        {/* Meta row */}
        <div style={{
          display:    "flex",
          gap:        S[4],
          alignItems: "center",
          flexWrap:   "wrap",
        }}>
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz.xs,
            color:      STATUS_COLOR[card.status] ?? C.inkLight,
            fontWeight: T.wt.medium,
          }}>
            ● {card.statusLabel}
          </span>

          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
            {card.requestorLabel}
          </span>

          <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
            → {card.approverLabel}
          </span>

          {card.module && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
              {card.module}
            </span>
          )}

          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.xs,
            color:       C.inkFaint,
            marginLeft:  "auto",
          }}>
            {new Date(card.createdAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
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
  cards:            ApprovalInboxCard[];
  onSelectApproval: (card: ApprovalInboxCard) => void;
}

// ── Main list ─────────────────────────────────────────────────────────────────

export function ApprovalList({ cards, onSelectApproval }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const filtered = activeFilter === "all"
    ? cards
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

      {/* Card list or empty */}
      {filtered.length === 0 ? (
        <div style={{
          padding:    `${S[10]}px`,
          textAlign:  "center",
          fontFamily: T.mono,
          fontSize:   T.sz.md,
          color:      C.inkFaint,
        }}>
          Sin aprobaciones en esta categoría.
        </div>
      ) : (
        filtered.map(card => (
          <ApprovalCard
            key={card.id}
            card={card}
            onClick={() => onSelectApproval(card)}
          />
        ))
      )}
    </div>
  );
}
