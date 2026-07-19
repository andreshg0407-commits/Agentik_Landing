"use client";

/**
 * components/copilot/copilot-suggestions-list.tsx
 *
 * Agentik Copilot — Suggestions List
 * Sprint: AGENTIK-COPILOT-PANEL-01
 *
 * Renders top suggestions from CopilotSuggestionCard[].
 * Actions are visual-only ("Próximamente"). No execution.
 */

import { C, T, S, R }                from "@/lib/ui/tokens";
import type { CopilotSuggestionCard } from "@/lib/copilot/viewmodel";
import type { SuggestionPriority }    from "@/lib/copilot/suggestions/suggestion-types";
import { BASE_LANGUAGE }              from "@/lib/copilot/language";

// ── Priority palette ──────────────────────────────────────────────────────────

const PRIORITY_STYLE: Record<SuggestionPriority, {
  dot: string; text: string; label: string;
}> = {
  critical: { dot: C.red,      text: C.redDark,    label: "Crítica"  },
  high:     { dot: C.amber,    text: C.amberDark,  label: "Alta"     },
  medium:   { dot: C.blueDark, text: C.blue,       label: "Media"    },
  low:      { dot: C.inkFaint, text: C.inkFaint,   label: "Baja"     },
};

const CATEGORY_LABELS: Record<CopilotSuggestionCard["category"], string> = {
  analysis:    "Análisis",
  review:      "Revisión",
  alert:       "Alerta",
  action:      "Acción",
  opportunity: "Oportunidad",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface CopilotSuggestionsListProps {
  suggestions:  CopilotSuggestionCard[];
  maxItems?:    number;
  sectionLabel?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CopilotSuggestionsList({
  suggestions,
  maxItems = 5,
  sectionLabel = BASE_LANGUAGE["section_suggestions"],
}: CopilotSuggestionsListProps) {
  const visible = suggestions.slice(0, maxItems);

  if (visible.length === 0) {
    return (
      <EmptySection label={BASE_LANGUAGE["suggestions_empty"]} />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Section header */}
      <SectionHeader label={sectionLabel} count={suggestions.length} />

      {/* Items */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {visible.map((s, i) => (
          <SuggestionRow
            key={s.id}
            suggestion={s}
            isLast={i === visible.length - 1}
          />
        ))}
      </div>

      {/* Overflow indicator */}
      {suggestions.length > maxItems && (
        <OverflowRow count={suggestions.length - maxItems} />
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function SuggestionRow({
  suggestion,
  isLast,
}: {
  suggestion: CopilotSuggestionCard;
  isLast:     boolean;
}) {
  const ps = PRIORITY_STYLE[suggestion.priority];

  return (
    <div style={{
      display:       "flex",
      alignItems:    "flex-start",
      gap:            S[3],
      padding:       `${S[2]}px ${S[4]}px`,
      borderBottom:  isLast ? "none" : `1px solid ${C.lineSubtle}`,
    }}>
      {/* Priority dot */}
      <span style={{
        width:        6,
        height:       6,
        borderRadius: R.pill,
        background:   ps.dot,
        flexShrink:   0,
        marginTop:    4,
      }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.base,
          fontWeight:  T.wt.medium,
          color:       C.ink,
          lineHeight:  1.4,
        }}>
          {suggestion.title}
        </div>
        <div style={{
          fontFamily:   T.sans,
          fontSize:     T.sz.base,
          color:        C.inkLight,
          marginTop:     2,
          lineHeight:    1.5,
          overflow:     "hidden",
          display:      "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
        }}>
          {suggestion.description}
        </div>

        {/* Meta tags */}
        <div style={{
          display:    "flex",
          flexWrap:   "wrap",
          alignItems: "center",
          gap:         4,
          marginTop:   S[1],
        }}>
          {/* Category */}
          <MetaChip
            label={CATEGORY_LABELS[suggestion.category] ?? suggestion.category}
            color={C.inkLight}
          />
          {/* Risk level */}
          {suggestion.riskLabel !== "Bajo" && (
            <MetaChip
              label={`Riesgo ${suggestion.riskLabel}`}
              color={suggestion.riskLabel === "Alto" ? C.red : C.amberDark}
            />
          )}
          {/* Confirmation required */}
          {suggestion.requiresConfirmation && (
            <MetaChip label="Requiere confirmación" color={C.amber} />
          )}
        </div>
      </div>

      {/* Priority label + coming soon */}
      <div style={{
        display:       "flex",
        flexDirection: "column",
        alignItems:    "flex-end",
        gap:            4,
        flexShrink:    0,
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.medium,
          color:         ps.text,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>
          {ps.label}
        </span>
        <span style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.xs,
          color:       C.inkFaint,
          border:     `1px solid ${C.line}`,
          borderRadius: R.sm,
          padding:    "1px 6px",
        }}>
          Próximamente
        </span>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function MetaChip({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontFamily:  T.mono,
      fontSize:    T.sz.xs,
      color,
      background:  C.surface,
      border:     `1px solid ${C.line}`,
      borderRadius: R.sm,
      padding:    "1px 5px",
    }}>
      {label}
    </span>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
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
        color:         C.blueDark,
        textTransform: "uppercase",
        letterSpacing: "0.07em",
      }}>
        {label}
      </span>
      <CountBadge count={count} />
      <span style={{
        fontFamily: T.mono,
        fontSize:   T.sz["2xs"],
        color:      C.inkGhost,
        marginLeft: "auto",
        letterSpacing: "0.03em",
      }}>
        {BASE_LANGUAGE["suggestions_context_note"]}
      </span>
    </div>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span style={{
      fontFamily:   T.mono,
      fontSize:     T.sz.xs,
      fontWeight:   T.wt.semibold,
      color:        C.white,
      background:   C.blueDark,
      borderRadius: R.pill,
      padding:     "1px 6px",
      minWidth:     18,
      textAlign:   "center",
    }}>
      {count}
    </span>
  );
}

function OverflowRow({ count }: { count: number }) {
  return (
    <div style={{
      padding:    `${S[2]}px ${S[4]}px`,
      fontFamily:  T.mono,
      fontSize:    T.sz.xs,
      color:       C.inkFaint,
      borderTop:  `1px solid ${C.lineSubtle}`,
    }}>
      +{count} {BASE_LANGUAGE["suggestions_overflow"]}
    </div>
  );
}

function EmptySection({ label }: { label: string }) {
  return (
    <div style={{
      padding:    `${S[4]}px`,
      fontFamily:  T.mono,
      fontSize:    T.sz.base,
      color:       C.inkFaint,
      textAlign:  "center",
    }}>
      {label}
    </div>
  );
}
