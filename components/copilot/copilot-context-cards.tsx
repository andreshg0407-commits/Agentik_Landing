"use client";

/**
 * components/copilot/copilot-context-cards.tsx
 *
 * Domain context cards — KPIs, statuses, and alerts derived from active module.
 */

import Link from "next/link";
import { C, T, S, R } from "@/lib/ui/tokens";
import type { CopilotContextCard } from "@/types/copilot/copilot-types";

interface CopilotContextCardsProps {
  cards: CopilotContextCard[];
}

export function CopilotContextCards({ cards }: CopilotContextCardsProps) {
  if (cards.length === 0) return null;

  return (
    <div style={{ padding: `${S[3]}px ${S[4]}px` }}>
      <div
        style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          color:         C.inkLight,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom:  S[2],
        }}
      >
        Contexto actual
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
        {cards.map((card) => {
          const isUrgent = card.urgent;
          const inner = (
            <div
              style={{
                padding:      `${S[2]}px ${S[3]}px`,
                borderRadius: R.md,
                border:       `1px solid ${isUrgent ? "rgba(239,68,68,0.3)" : C.line}`,
                background:   isUrgent ? "rgba(239,68,68,0.05)" : C.surface,
              }}
            >
              <div
                style={{
                  fontFamily: T.mono,
                  fontSize:   T.sz.xs,
                  color:      C.inkLight,
                }}
              >
                {card.titulo}
              </div>
              {card.valor && (
                <div
                  style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz.sm,
                    fontWeight: 700,
                    color:      isUrgent ? "#ef4444" : C.ink,
                    marginTop:  2,
                  }}
                >
                  {card.valor}
                </div>
              )}
              {card.meta && (
                <div
                  style={{
                    fontFamily: T.mono,
                    fontSize:   T.sz.xs,
                    color:      C.inkLight,
                    marginTop:  2,
                  }}
                >
                  {card.meta}
                </div>
              )}
            </div>
          );

          return card.href ? (
            <Link key={card.id} href={card.href} style={{ textDecoration: "none" }}>
              {inner}
            </Link>
          ) : (
            <div key={card.id}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}
