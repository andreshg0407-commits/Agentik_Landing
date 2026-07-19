"use client";

/**
 * components/copilot/diego-slot.tsx
 *
 * Diego CFO Copilot — Financial Module Slot.
 *
 * Renders Diego's executive intelligence inside a financial workspace.
 * NOT a chat widget. NOT a floating panel. NOT decorative.
 *
 * Shows:
 *   - Executive headline (real operational state)
 *   - Top priorities (max 3, severity-colored)
 *   - Data confidence + graph integrity status
 *   - Data state badge (REAL / PARTIAL / STALE / MISSING)
 *
 * Rules:
 *   - All colors from C.* tokens. No raw hex. No Tailwind colors.
 *   - T.mono for ALL operational data.
 *   - If dataState = MISSING → no false assertions.
 *   - If cashConfidence = LOW → strip says "sin trazabilidad completa".
 *
 * Sprint: AGENTIK-DIEGO-COPILOT-01
 */

import type { CSSProperties } from "react";
import { C, T, S, R }        from "@/lib/ui/tokens";
import type {
  DiegoSummarySerial,
  DiegoSeverity,
  DiegoDataState,
  DiegoEvidenceTraceSerial,
} from "@/lib/copilot/diego/diego-types";

// ── Severity palette ───────────────────────────────────────────────────────────

const SEV_DOT: Record<DiegoSeverity, string> = {
  critical: C.red,
  high:     C.amber,
  medium:   C.blue,
  low:      C.inkFaint,
};

const SEV_LABEL: Record<DiegoSeverity, string> = {
  critical: "Crítico",
  high:     "Elevado",
  medium:   "Vigilancia",
  low:      "Informativo",
};

// ── Data state badge ──────────────────────────────────────────────────────────

const STATE_STYLE: Record<DiegoDataState, { bg: string; text: string; label: string }> = {
  REAL:    { bg: `${C.green}12`,    text: C.green,    label: "REAL"    },
  PARTIAL: { bg: `${C.amber}12`,    text: C.amberDark, label: "PARCIAL" },
  STALE:   { bg: `${C.blue}0E`,     text: C.blue,     label: "STALE"   },
  MISSING: { bg: `${C.inkFaint}12`, text: C.inkLight, label: "SIN DATOS" },
  BROKEN:  { bg: `${C.red}12`,      text: C.red,      label: "ERROR"   },
};

// ── Confidence level color ────────────────────────────────────────────────────

const CONF_COLOR: Record<"HIGH" | "MEDIUM" | "LOW", string> = {
  HIGH:   C.green,
  MEDIUM: C.amber,
  LOW:    C.red,
};

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: CSSProperties = {
  border:       `1px solid ${C.line}`,
  borderLeft:   `3px solid ${C.blueDark}`,
  borderRadius: R.md,
  background:   C.white,
  marginBottom: S[5],
  overflow:     "hidden",
};

const headerStyle: CSSProperties = {
  display:        "flex",
  alignItems:     "center",
  justifyContent: "space-between",
  padding:        `${S[2] + 2}px ${S[4]}px`,
  background:     C.surface,
  borderBottom:   `1px solid ${C.lineSubtle}`,
};

const agentLabelStyle: CSSProperties = {
  fontFamily:    T.mono,
  fontSize:      T.sz["2xs"],
  fontWeight:    700,
  color:         C.blueDark,
  letterSpacing: "0.10em",
  textTransform: "uppercase" as const,
};

const headlineStyle: CSSProperties = {
  fontFamily:  T.mono,
  fontSize:    T.sz.sm,
  fontWeight:  600,
  color:       C.ink,
  lineHeight:  1.4,
  padding:     `${S[3]}px ${S[4]}px`,
};

const bodyStyle: CSSProperties = {
  padding: `0 ${S[4]}px ${S[3]}px`,
};

const metaRowStyle: CSSProperties = {
  display:         "flex",
  alignItems:      "center",
  gap:             S[3],
  padding:         `${S[2]}px ${S[4]}px`,
  borderTop:       `1px solid ${C.lineSubtle}`,
  background:      C.surface,
  flexWrap:        "wrap" as const,
};

// ── Subcomponents ─────────────────────────────────────────────────────────────

function PriorityRow({ reason, severity, action }: {
  reason:   string;
  severity: DiegoSeverity;
  action:   string;
}) {
  return (
    <div style={{
      display:      "flex",
      alignItems:   "flex-start",
      gap:          S[2],
      paddingBottom: S[2],
    }}>
      <span style={{
        width:        6,
        height:       6,
        borderRadius: "50%",
        background:   SEV_DOT[severity],
        flexShrink:   0,
        marginTop:    5,
      }} />
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz.xs,
          fontWeight: 600,
          color:      C.inkMid,
          lineHeight: 1.4,
        }}>
          {reason}
        </div>
        <div style={{
          fontFamily: T.mono,
          fontSize:   T.sz["2xs"],
          color:      C.inkFaint,
          marginTop:  2,
        }}>
          {action}
        </div>
      </div>
      <span style={{
        fontFamily:    T.mono,
        fontSize:      T.sz["2xs"],
        color:         SEV_DOT[severity],
        fontWeight:    700,
        flexShrink:    0,
        letterSpacing: "0.04em",
      }}>
        {SEV_LABEL[severity]}
      </span>
    </div>
  );
}

// ── Evidence trace helpers ────────────────────────────────────────────────────

const TRACE_STATE_COLOR: Record<DiegoDataState, string> = {
  REAL:    C.green,
  PARTIAL: C.amberDark,
  STALE:   C.blue,
  MISSING: C.inkFaint,
  BROKEN:  C.red,
};

function formatSyncAge(syncAt: string | null): string {
  if (!syncAt) return "sin fecha";
  const diffMs  = Date.now() - new Date(syncAt).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60)  return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24)    return `hace ${hours}h`;
  return `hace ${Math.floor(hours / 24)}d`;
}

function EvidenceTraceLine({ trace }: { trace: DiegoEvidenceTraceSerial }) {
  const color = TRACE_STATE_COLOR[trace.state];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[2], flexWrap: "wrap" as const }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: 600, color: C.inkMid }}>
        {trace.source}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color, fontWeight: 700 }}>
        {trace.state}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
        · {Math.round(trace.confidence * 100)}%
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
        · {formatSyncAge(trace.syncAt)}
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DiegoSlotProps {
  summary: DiegoSummarySerial;
}

export function DiegoSlot({ summary }: DiegoSlotProps) {
  const stateStyle = STATE_STYLE[summary.dataState];
  const confColor  = CONF_COLOR[summary.cashConfidenceLevel];

  const hasPriorities  = summary.topPriorities.length > 0;
  const hasBlockers    = summary.blockingIssues.length > 0;

  return (
    <div style={containerStyle}>
      {/* ── Header ── */}
      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          <span style={{
            width:        6,
            height:       6,
            borderRadius: "50%",
            background:   C.blueDark,
            flexShrink:   0,
          }} />
          <span style={agentLabelStyle}>Diego · CFO Operativo</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
          {/* Data state badge */}
          <span style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            fontWeight:    700,
            color:         stateStyle.text,
            background:    stateStyle.bg,
            padding:       `1px ${S[2]}px`,
            borderRadius:  R.sm,
            letterSpacing: "0.06em",
          }}>
            {stateStyle.label}
          </span>

          {/* Signal count */}
          {summary.signalCount > 0 && (
            <span style={{
              fontFamily: T.mono,
              fontSize:   T.sz["2xs"],
              color:      C.inkFaint,
            }}>
              {summary.signalCount} señal{summary.signalCount !== 1 ? "es" : ""}
            </span>
          )}
        </div>
      </div>

      {/* ── Executive headline ── */}
      <div style={headlineStyle}>
        {summary.executiveHeadline}
      </div>

      {/* ── Top priorities ── */}
      {hasPriorities && (
        <div style={bodyStyle}>
          {summary.topPriorities.map((p, i) => (
            <PriorityRow
              key={i}
              reason={p.reason}
              severity={p.severity}
              action={p.recommendedAction}
            />
          ))}
        </div>
      )}

      {/* ── Meta strip ── */}
      <div style={metaRowStyle}>
        {/* Graph integrity */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            color:         C.inkFaint,
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
          }}>
            Integridad
          </span>
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            fontWeight: 600,
            color:      summary.graphIssueCount > 0 ? C.red : C.green,
          }}>
            {summary.graphIssueCount === 0 ? "Sin alertas" : `${summary.graphIssueCount} alerta${summary.graphIssueCount > 1 ? "s" : ""}`}
          </span>
        </div>

        <span style={{ width: 1, height: 28, background: C.lineSubtle, flexShrink: 0 }} />

        {/* Confidence */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            color:         C.inkFaint,
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
          }}>
            Confianza
          </span>
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            fontWeight: 700,
            color:      confColor,
          }}>
            {summary.cashConfidenceLevel}
          </span>
        </div>

        <span style={{ width: 1, height: 28, background: C.lineSubtle, flexShrink: 0 }} />

        {/* Unresolved */}
        <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            color:         C.inkFaint,
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
          }}>
            Sin resolver
          </span>
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            fontWeight: 600,
            color:      summary.unresolvedCount > 10 ? C.amber : C.inkMid,
          }}>
            {summary.unresolvedCount}
          </span>
        </div>

        {/* Recommended focus — right-aligned */}
        {!hasBlockers && (
          <span style={{
            fontFamily: T.mono,
            fontSize:   T.sz["2xs"],
            color:      C.inkFaint,
            marginLeft: "auto",
            maxWidth:   220,
            textAlign:  "right" as const,
          }}>
            {summary.recommendedFocus}
          </span>
        )}
      </div>

      {/* ── Evidence trace (FASE 5) — only when present ── */}
      {summary.evidenceTrace.length > 0 && (
        <div style={{
          padding:    `${S[2]}px ${S[4]}px`,
          borderTop:  `1px solid ${C.lineSubtle}`,
          display:    "flex",
          flexDirection: "column" as const,
          gap:        S[1],
        }}>
          <span style={{
            fontFamily:    T.mono,
            fontSize:      T.sz["2xs"],
            color:         C.inkFaint,
            textTransform: "uppercase" as const,
            letterSpacing: "0.08em",
            marginBottom:  S[1],
          }}>
            Basado en
          </span>
          {summary.evidenceTrace
            .filter(e => e.count > 0 || e.state !== "MISSING")
            .slice(0, 5)
            .map((e, i) => <EvidenceTraceLine key={i} trace={e} />)
          }
          {summary.overallConfidencePct > 0 && (
            <span style={{
              fontFamily:  T.mono,
              fontSize:    T.sz["2xs"],
              color:       C.inkFaint,
              marginTop:   S[1],
            }}>
              Confianza global: {summary.overallConfidencePct}%
            </span>
          )}
        </div>
      )}
    </div>
  );
}
