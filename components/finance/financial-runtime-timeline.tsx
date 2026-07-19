"use client";

/**
 * components/finance/financial-runtime-timeline.tsx
 *
 * FASE 7 — Financial Runtime Timeline
 *
 * Ultra-minimal operational timeline. Shows recent FinancialRuntimeEvents
 * in chronological order — newest first.
 *
 * Design rules:
 *   - T.mono for ALL text. No prose.
 *   - No cards. No charts. No heavy layouts.
 *   - Severity dot + age + title + summary. That's it.
 *   - Colors from C.* tokens only.
 *   - Empty state: no text, just nothing rendered.
 *
 * Sprint: AGENTIK-FINANCIAL-LIVE-ORCHESTRATION-01
 */

import type { CSSProperties } from "react";
import { C, T, S, R }        from "@/lib/ui/tokens";
import type { FinancialRuntimeEventType, FinancialRuntimeSeverity } from "@/lib/finance/runtime-events";

// ── Props ──────────────────────────────────────────────────────────────────────

export interface FinancialTimelineEvent {
  id:         string;
  type:       FinancialRuntimeEventType;
  severity:   FinancialRuntimeSeverity;
  title:      string;
  summary:    string;
  ageMinutes: number;
  source?:    string;
  confidence?: number;
  previousConfidence?: number;
}

interface FinancialRuntimeTimelineProps {
  events:       FinancialTimelineEvent[];
  /** Maximum events to render. Default: 8. */
  maxEvents?:   number;
  /** Compact mode removes summary line. Default: false. */
  compact?:     boolean;
}

// ── Severity palette ──────────────────────────────────────────────────────────

const SEV_COLOR: Record<FinancialRuntimeSeverity, string> = {
  critical: C.red,
  warning:  C.amber,
  info:     C.blue,
};

// ── Event type labels ─────────────────────────────────────────────────────────

const TYPE_LABEL: Partial<Record<FinancialRuntimeEventType, string>> = {
  RECON_BREAK:     "conciliación",
  LOW_CONFIDENCE:  "confianza",
  STALE_SOURCE:    "fuente stale",
  CLOSE_BLOCKER:   "cierre",
  BANK_UNMATCHED:  "banco",
  LIQUIDITY_RISK:  "liquidez",
  DIAN_STALE:      "DIAN",
  SYNC_RESTORED:   "recuperación",
  GRAPH_DEGRADED:  "grafo",
  GRAPH_RECOVERED: "grafo",
};

// ── Age formatter ─────────────────────────────────────────────────────────────

function formatAge(minutes: number): string {
  if (minutes < 1)  return "ahora";
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)   return `hace ${hours}h`;
  return `hace ${Math.floor(hours / 24)}d`;
}

// ── Confidence delta ──────────────────────────────────────────────────────────

function ConfidenceDelta({
  confidence,
  previousConfidence,
}: {
  confidence:         number | undefined;
  previousConfidence: number | undefined;
}) {
  if (confidence === undefined || previousConfidence === undefined) return null;
  const prev = Math.round(previousConfidence * 100);
  const curr = Math.round(confidence         * 100);
  const delta = curr - prev;
  const color = delta >= 0 ? C.green : C.red;
  return (
    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color, fontWeight: 700 }}>
      {delta >= 0 ? "+" : ""}{delta}%
    </span>
  );
}

// ── Timeline row ──────────────────────────────────────────────────────────────

function TimelineRow({
  event,
  compact,
}: {
  event:   FinancialTimelineEvent;
  compact: boolean;
}) {
  const sevColor = SEV_COLOR[event.severity];
  const typeTag  = TYPE_LABEL[event.type] ?? event.type.toLowerCase();

  return (
    <div style={{
      display:   "flex",
      gap:       S[3],
      alignItems: "flex-start",
      paddingBottom: S[2],
    }}>
      {/* Timeline line + dot */}
      <div style={{
        display:        "flex",
        flexDirection:  "column" as const,
        alignItems:     "center",
        flexShrink:     0,
        paddingTop:     3,
      }}>
        <span style={{
          width:        7,
          height:       7,
          borderRadius: "50%",
          background:   sevColor,
          flexShrink:   0,
        }} />
      </div>

      {/* Content */}
      <div style={{ minWidth: 0, flex: 1 }}>
        {/* Top row: age + type tag */}
        <div style={{
          display:     "flex",
          alignItems:  "center",
          gap:         S[2],
          marginBottom: 2,
        }}>
          <span style={{
            fontFamily:  T.mono,
            fontSize:    T.sz["2xs"],
            color:       C.inkFaint,
            flexShrink:  0,
          }}>
            {formatAge(event.ageMinutes)}
          </span>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            color:         sevColor,
            fontWeight:    700,
            letterSpacing: "0.05em",
            textTransform: "uppercase" as const,
          }}>
            {typeTag}
          </span>
          <ConfidenceDelta
            confidence={event.confidence}
            previousConfidence={event.previousConfidence}
          />
        </div>

        {/* Title */}
        <div style={{
          fontFamily:  T.mono,
          fontSize:    T.sz.xs,
          fontWeight:  600,
          color:       C.inkMid,
          lineHeight:  1.35,
        }}>
          {event.title}
        </div>

        {/* Summary — hidden in compact mode */}
        {!compact && event.summary && (
          <div style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      C.inkFaint,
            lineHeight: 1.4,
            marginTop:  2,
          }}>
            {event.summary}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FinancialRuntimeTimeline({
  events,
  maxEvents = 8,
  compact   = false,
}: FinancialRuntimeTimelineProps) {
  const visible = events.slice(0, maxEvents);

  if (visible.length === 0) return null;

  return (
    <div style={{
      border:       `1px solid ${C.lineSubtle}`,
      borderRadius: R.md,
      background:   C.white,
      overflow:     "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding:        `${S[2] + 1}px ${S[4]}px`,
        background:     C.surface,
        borderBottom:   `1px solid ${C.lineSubtle}`,
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
      }}>
        <span style={{
          fontFamily:    T.mono,
          fontSize:      T.sz["2xs"],
          fontWeight:    700,
          color:         C.inkMid,
          textTransform: "uppercase" as const,
          letterSpacing: "0.10em",
        }}>
          Timeline Operativo
        </span>
        <span style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      C.inkFaint,
        }}>
          {visible.length} evento{visible.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Event list */}
      <div style={{
        padding: `${S[3]}px ${S[4]}px`,
        display: "flex",
        flexDirection: "column" as const,
      }}>
        {visible.map((event, i) => (
          <TimelineRow key={event.id ?? i} event={event} compact={compact} />
        ))}
      </div>
    </div>
  );
}
