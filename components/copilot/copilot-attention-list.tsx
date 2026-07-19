"use client";

/**
 * components/copilot/copilot-attention-list.tsx
 *
 * Agentik Copilot — Attention List
 * Sprint: AGENTIK-COPILOT-PANEL-01
 *
 * Renders items requiring immediate attention.
 * Reads only from CopilotAttentionItem[] (ViewModel). No business logic.
 */

import { C, T, S, R }               from "@/lib/ui/tokens";
import type { CopilotAttentionItem } from "@/lib/copilot/viewmodel";

interface CopilotAttentionListProps {
  items:     CopilotAttentionItem[];
  maxItems?: number;
}

export function CopilotAttentionList({
  items,
  maxItems = 4,
}: CopilotAttentionListProps) {
  const visible = items.slice(0, maxItems);

  if (visible.length === 0) {
    return (
      <div style={{
        display:     "flex",
        alignItems:  "center",
        gap:          S[2],
        padding:     `${S[2]}px ${S[4]}px`,
        fontFamily:   T.mono,
        fontSize:     T.sz.base,
        color:        C.inkFaint,
      }}>
        <span style={{
          width:        5,
          height:       5,
          borderRadius: R.pill,
          background:   C.green,
          flexShrink:   0,
        }} />
        Sin elementos de atención en este contexto.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{
        display:       "flex",
        alignItems:    "center",
        gap:            S[2],
        padding:       `${S[2]}px ${S[4]}px`,
        borderBottom:  `1px solid ${C.line}`,
        background:    items.some(i => i.severity === "critical") ? C.redLight : C.amberLight,
      }}>
        <span style={{
          width:        6,
          height:       6,
          borderRadius: R.pill,
          background:   items.some(i => i.severity === "critical") ? C.red : C.amber,
          flexShrink:   0,
        }} />
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz.xs,
          fontWeight:    T.wt.semibold,
          color:         items.some(i => i.severity === "critical") ? C.redDark : C.amberDark,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
        }}>
          Necesita tu atención
        </span>
        <span style={{
          fontFamily:   T.mono,
          fontSize:     T.sz.xs,
          fontWeight:   T.wt.semibold,
          color:        C.white,
          background:   items.some(i => i.severity === "critical") ? C.red : C.amber,
          borderRadius: R.pill,
          padding:     "1px 6px",
        }}>
          {items.length}
        </span>
      </div>

      {/* Items */}
      {visible.map((item, i) => (
        <AttentionRow
          key={item.id}
          item={item}
          isLast={i === visible.length - 1}
        />
      ))}

      {items.length > maxItems && (
        <div style={{
          padding:   `${S[2]}px ${S[4]}px`,
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          color:      C.inkFaint,
          borderTop: `1px solid ${C.lineSubtle}`,
        }}>
          +{items.length - maxItems} elemento{items.length - maxItems > 1 ? "s" : ""} adicional{items.length - maxItems > 1 ? "es" : ""}
        </div>
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function AttentionRow({
  item,
  isLast,
}: {
  item:   CopilotAttentionItem;
  isLast: boolean;
}) {
  const isCritical = item.severity === "critical";

  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:           S[3],
      padding:      `${S[2]}px ${S[4]}px`,
      borderBottom: isLast ? "none" : `1px solid ${C.lineSubtle}`,
      background:   isCritical ? "#fff8f8" : C.white,
    }}>
      {/* Severity dot */}
      <span style={{
        width:        7,
        height:       7,
        borderRadius: R.pill,
        background:   isCritical ? C.red : C.amber,
        flexShrink:   0,
        marginTop:    4,
      }} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz.base,
          fontWeight: T.wt.medium,
          color:      isCritical ? C.redDark : C.ink,
          lineHeight: 1.4,
        }}>
          {item.title}
        </div>
        <div style={{
          fontFamily:          T.sans,
          fontSize:            T.sz.base,
          color:               C.inkLight,
          marginTop:            2,
          lineHeight:           1.5,
          overflow:            "hidden",
          display:             "-webkit-box",
          WebkitLineClamp:      2,
          WebkitBoxOrient:     "vertical" as const,
        }}>
          {item.description}
        </div>

        {/* Source tag */}
        <div style={{ marginTop: S[1] }}>
          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz.xs,
            color:       C.inkFaint,
            background:  C.surface,
            border:     `1px solid ${C.line}`,
            borderRadius: R.sm,
            padding:    "1px 5px",
          }}>
            {item.source === "insight" ? "Hallazgo" : "Recomendación"}
          </span>
        </div>
      </div>

      {/* Severity badge */}
      <span style={{
        fontFamily:    T.mono,
        fontSize:      T.sz.xs,
        fontWeight:    T.wt.semibold,
        color:         isCritical ? C.redDark : C.amberDark,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        flexShrink:    0,
      }}>
        {isCritical ? "Crítico" : "Alto"}
      </span>
    </div>
  );
}
