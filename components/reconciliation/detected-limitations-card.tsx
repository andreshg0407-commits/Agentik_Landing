"use client";

/**
 * components/reconciliation/detected-limitations-card.tsx
 *
 * AGENTIK-RECON-DETECTED-LIMITATIONS-01 — Phase 2 + 3 + 5
 * Detected Operational Limitations Card
 *
 * Shows real limitations derived from the source readiness report.
 * Designed for executive and SAG meeting use:
 *   - Critical issues highlighted first (Phase 3: payments historical blocker)
 *   - Each item: source, status, impact, required action, SAG meeting question
 *   - Clean state when no limitations exist (Phase 5)
 *
 * Design rules:
 *   - T.mono for ALL data
 *   - C.* tokens only
 *   - Projectable — usable in screen-share context
 */

import React, { useState } from "react";
import { C, S, T, R } from "@/lib/ui/tokens";
import type {
  DetectedLimitation,
  DetectedLimitationsReport,
  LimitationSeverity,
} from "@/lib/reconciliation/readiness/detected-limitations";

// ── Severity display ──────────────────────────────────────────────────────────

const SEVERITY_META: Record<LimitationSeverity, {
  icon:       string;
  label:      string;
  color:      string;
  bgColor:    string;
  borderLeft: string;
}> = {
  critical: {
    icon:       "▲",
    label:      "CRÍTICO",
    color:      C.red,
    bgColor:    "#fef2f2",
    borderLeft: C.red,
  },
  warning: {
    icon:       "△",
    label:      "ATENCIÓN",
    color:      C.amber,
    bgColor:    "#fefce8",
    borderLeft: C.amber,
  },
  info: {
    icon:       "◦",
    label:      "INFO",
    color:      C.inkMid,
    bgColor:    C.surface,
    borderLeft: C.inkLight,
  },
};

// ── Status label map ──────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  pending_sag_validation: "Pendiente validación SAG",
  requires_integration:   "Requiere integración",
  requires_upload:        "Requiere carga de archivo",
  requires_credential:    "Requiere credenciales",
  unavailable:            "No disponible",
};

// ── Single limitation row ─────────────────────────────────────────────────────

function LimitationRow({
  lim,
  expanded,
  onToggle,
}: {
  lim:      DetectedLimitation;
  expanded: boolean;
  onToggle: () => void;
}) {
  const meta = SEVERITY_META[lim.severity];

  return (
    <div style={{
      borderBottom:  `1px solid ${C.lineSubtle}`,
      borderLeft:    `3px solid ${meta.borderLeft}`,
      background:    lim.isPriority ? meta.bgColor : "transparent",
    }}>
      {/* Header row — always visible */}
      <div
        className="ag-op-row"
        onClick={onToggle}
        style={{
          display:    "grid",
          gridTemplateColumns: "20px 1fr auto auto",
          gap:        S[3],
          alignItems: "center",
          padding:    `${S[2]}px ${S[3]}px`,
          cursor:     "pointer",
        }}
      >
        {/* Severity icon */}
        <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: meta.color }}>
          {meta.icon}
        </span>

        {/* Source + status */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: S[2], flexWrap: "wrap" as const }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink }}>
              {lim.sourceLabel}
            </span>
            {lim.isPriority && (
              <span style={{
                fontFamily: T.mono, fontSize: 7, fontWeight: 700, color: meta.color,
                background: `${meta.color}15`, border: `1px solid ${meta.color}30`,
                borderRadius: R.sm, padding: `1px 5px`, textTransform: "uppercase" as const,
              }}>
                PRIORIDAD
              </span>
            )}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginTop: 1 }}>
            {STATUS_LABEL[lim.status] ?? lim.status} · {lim.provider}
          </div>
        </div>

        {/* Severity badge */}
        <span style={{
          fontFamily: T.mono, fontSize: 8, fontWeight: 700,
          color: meta.color, background: `${meta.color}12`,
          border: `1px solid ${meta.color}30`, borderRadius: R.sm,
          padding: `1px ${S[2]}px`, whiteSpace: "nowrap" as const,
        }}>
          {meta.label}
        </span>

        {/* Expand toggle */}
        <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={{ padding: `0 ${S[3]}px ${S[3]}px ${S[3]}px`, display: "flex", flexDirection: "column" as const, gap: S[2] }}>

          {/* Impact */}
          <div style={{ background: `${meta.color}08`, border: `1px solid ${meta.color}20`, borderRadius: R.sm, padding: S[2] }}>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 3 }}>IMPACTO OPERACIONAL</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, lineHeight: 1.4 }}>{lim.impact}</div>
          </div>

          {/* Required action */}
          <div style={{ background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.sm, padding: S[2] }}>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 3 }}>ACCIÓN REQUERIDA</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, lineHeight: 1.4 }}>{lim.requiredAction}</div>
          </div>

          {/* SAG meeting question */}
          <div style={{ background: "#eff6ff", border: `1px solid ${C.blueBorder}`, borderRadius: R.sm, padding: S[2] }}>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: C.blueDark, textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: 3 }}>PREGUNTA PARA SAG</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark, lineHeight: 1.4, fontStyle: "italic" }}>
              "{lim.meetingQuestion}"
            </div>
          </div>

          {lim.isHistoricalBlocker && (
            <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
              <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: C.red }}>▲</span>
              <span style={{ fontFamily: T.mono, fontSize: 8, color: C.red }}>Bloquea conciliación histórica completa</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Clean state ───────────────────────────────────────────────────────────────

function CleanState() {
  return (
    <div style={{ padding: `${S[4]}px ${S[3]}px`, display: "flex", alignItems: "center", gap: S[3] }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green, fontWeight: 700 }}>✓</span>
      <div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green, fontWeight: 600 }}>
          Sin limitaciones críticas detectadas
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginTop: 2 }}>
          No se detectan limitaciones operacionales críticas en las fuentes registradas.
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DetectedLimitationsCardProps {
  report: DetectedLimitationsReport;
}

export function DetectedLimitationsCard({ report }: DetectedLimitationsCardProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Auto-expand critical and priority items on first render
    return new Set(
      report.limitations
        .filter(l => l.severity === "critical" || l.isPriority)
        .map(l => l.sourceId),
    );
  });

  function toggle(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const criticalCount  = report.critical.length;
  const warningCount   = report.warnings.length;
  const infoCount      = report.info.length;

  return (
    <div style={{
      background: C.white,
      border:     `1.5px solid ${report.hasCritical ? C.red : report.warnings.length > 0 ? C.amber : C.lineSubtle}`,
      borderTop:  `3px solid ${report.hasCritical ? C.red : report.warnings.length > 0 ? C.amber : C.lineSubtle}`,
      borderRadius: R.lg,
      overflow:   "hidden",
    }}>

      {/* Card header */}
      <div style={{
        padding:       `${S[3]}px ${S[4]}px`,
        background:    report.hasCritical ? "#fef2f2" : report.warnings.length > 0 ? "#fefce8" : C.surface,
        borderBottom:  `1px solid ${C.lineSubtle}`,
        display:       "flex",
        alignItems:    "center",
        justifyContent: "space-between",
        gap:           S[3],
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.ink, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
            LIMITACIONES OPERACIONALES DETECTADAS
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginTop: 3 }}>
            {report.hasLimitations
              ? "Agentik detectó fuentes que limitan conciliación histórica completa."
              : "Sin limitaciones activas en las fuentes registradas."}
          </div>
        </div>

        {/* Severity counters */}
        {report.hasLimitations && (
          <div style={{ display: "flex", gap: S[2], flexShrink: 0, alignItems: "center" }}>
            {criticalCount > 0 && (
              <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: C.red, background: "#fef2f2", border: `1px solid ${C.red}30`, borderRadius: R.sm, padding: `2px ${S[2]}px` }}>
                ▲ {criticalCount} crítico{criticalCount !== 1 ? "s" : ""}
              </span>
            )}
            {warningCount > 0 && (
              <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: C.amber, background: "#fefce8", border: `1px solid ${C.amber}30`, borderRadius: R.sm, padding: `2px ${S[2]}px` }}>
                △ {warningCount} atención
              </span>
            )}
            {infoCount > 0 && (
              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkMid, background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.sm, padding: `2px ${S[2]}px` }}>
                ◦ {infoCount} info
              </span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {!report.hasLimitations ? (
        <CleanState />
      ) : (
        <div>
          {report.limitations.map(lim => (
            <LimitationRow
              key={lim.sourceId}
              lim={lim}
              expanded={expandedIds.has(lim.sourceId)}
              onToggle={() => toggle(lim.sourceId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
