/**
 * components/marketing-studio/shared/ms-metric-strip.tsx
 *
 * MARKETING-STUDIO-UX-SYSTEM-01 — Shared Metric Card & Strip
 *
 * THE single implementation of the KPI metric row used across all
 * Marketing Studio modules. Replaces:
 *   - IntelCard (Biblioteca)
 *   - AlertCard (Shopify)
 *   - Preset summary cards (Catálogos)
 *
 * Layout: 4-column grid, white cards with left accent bar.
 * MSMetricStrip renders the grid; MSMetricCard renders a single cell.
 */

import { MS_SHADOWS, MS_METRIC_CARD } from "@/lib/marketing-studio/ms-design-system";
import { C, T, S, R }                  from "@/lib/ui/tokens";

export interface MSMetricCardProps {
  value:    string | number;
  label:    string;
  sub?:     string;
  /** Left accent bar color */
  dot:      string;
  /** Optional semantic color override for the value number */
  variant?: "neutral" | "ok" | "warning" | "critical";
}

export function MSMetricCard({ value, label, sub, dot, variant = "neutral" }: MSMetricCardProps) {
  const valueColor =
    variant === "critical" ? C.red   :
    variant === "warning"  ? C.amber :
    variant === "ok"       ? C.green :
    C.ink;

  return (
    <div style={{
      background:   C.white,
      border:       `1px solid ${C.line}`,
      borderRadius: MS_METRIC_CARD.borderRadius,
      padding:      MS_METRIC_CARD.padding,
      boxShadow:    MS_SHADOWS.card,
      position:     "relative" as const,
      overflow:     "hidden" as const,
    }}>
      {/* Left accent bar */}
      <div style={{
        position:     "absolute" as const,
        left:         0, top: 0, bottom: 0,
        width:        MS_METRIC_CARD.accentWidth,
        background:   dot,
        borderRadius: `${R.md}px 0 0 ${R.md}px`,
      }} />

      {/* Value */}
      <div style={{
        fontFamily:         T.mono,
        fontSize:           MS_METRIC_CARD.valueSize,
        fontWeight:         T.wt.bold,
        color:              valueColor,
        lineHeight:         1,
        fontVariantNumeric: "tabular-nums",
        marginBottom:       S[1],
      }}>
        {value}
      </div>

      {/* Label */}
      <div style={{
        fontFamily:  T.mono,
        fontSize:    MS_METRIC_CARD.labelSize,
        fontWeight:  T.wt.semibold,
        color:       C.inkMid,
        marginBottom: sub ? 2 : 0,
      }}>
        {label}
      </div>

      {/* Sub */}
      {sub && (
        <div style={{
          fontFamily: T.mono,
          fontSize:   MS_METRIC_CARD.subSize,
          color:      C.inkFaint,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── MSMetricStrip ─────────────────────────────────────────────────────────────

export function MSMetricStrip({ cards }: { cards: MSMetricCardProps[] }) {
  const cols = Math.min(cards.length, 4);
  return (
    <div style={{
      display:             "grid",
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap:                 S[3],
      marginBottom:        S[5],
    }}>
      {cards.map(card => (
        <MSMetricCard key={card.label} {...card} />
      ))}
    </div>
  );
}
