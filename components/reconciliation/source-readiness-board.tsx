"use client";

/**
 * components/reconciliation/source-readiness-board.tsx
 *
 * AGENTIK-RECON-SOURCE-READINESS-BOARD-01 — Phase 2 + 3 + 4 + 5
 * Source Readiness Board — Estado de Integración Operacional.
 *
 * Features:
 *   - Summary strip: Fuentes listas / parciales / pendientes (Phase 3)
 *   - Three-section board: LISTAS / PARCIALES / PENDIENTES (Phase 2)
 *   - Each source card: name, provider, tier icon, loader name, readiness note
 *   - Meeting Mode: compact projection-ready view for SAG meetings (Phase 4)
 *   - No mocks — only sources present in the registry are shown (Phase 5)
 *
 * Props are derived server-side via buildSourceReadinessReport() and
 * passed as plain serializable objects. No client-side fetch needed.
 *
 * Design rules:
 *   - T.mono for ALL data
 *   - C.* tokens only — no raw hex
 *   - ag-op-row for source rows
 */

import React, { useState } from "react";
import { C, S, T, R } from "@/lib/ui/tokens";
import type {
  SourceReadinessEntry,
  SourceReadinessReport,
  BoardReadinessTier,
} from "@/lib/reconciliation/readiness/source-readiness";

// ── Tier display metadata ──────────────────────────────────────────────────────

const TIER_META: Record<BoardReadinessTier, {
  icon:       string;
  label:      string;
  color:      string;
  bgColor:    string;
  sectionBg:  string;
  accentLeft: string;
}> = {
  ready: {
    icon:       "✓",
    label:      "LISTA",
    color:      C.green,
    bgColor:    "#f0fdf4",
    sectionBg:  "#f0fdf4",
    accentLeft: C.green,
  },
  partial: {
    icon:       "◐",
    label:      "PARCIAL",
    color:      C.amber,
    bgColor:    "#fefce8",
    sectionBg:  "#fefce8",
    accentLeft: C.amber,
  },
  pending_integration: {
    icon:       "○",
    label:      "INTEGRACIÓN PENDIENTE",
    color:      C.blueDark,
    bgColor:    C.surface,
    sectionBg:  C.surface,
    accentLeft: C.blueDark,
  },
  requires_upload: {
    icon:       "↑",
    label:      "REQUIERE CARGA",
    color:      C.inkMid,
    bgColor:    C.surface,
    sectionBg:  C.surface,
    accentLeft: C.inkLight,
  },
  requires_credentials: {
    icon:       "⚿",
    label:      "REQUIERE CREDENCIALES",
    color:      C.inkMid,
    bgColor:    C.surface,
    sectionBg:  C.surface,
    accentLeft: C.inkLight,
  },
  not_available: {
    icon:       "○",
    label:      "NO DISPONIBLE",
    color:      C.inkGhost,
    bgColor:    C.surface,
    sectionBg:  C.surface,
    accentLeft: C.inkGhost,
  },
};

// ── Source Card ───────────────────────────────────────────────────────────────

function SourceCard({ entry, compact }: { entry: SourceReadinessEntry; compact?: boolean }) {
  const meta = TIER_META[entry.tier];

  return (
    <div
      className="ag-op-row"
      style={{
        display:       "flex",
        alignItems:    compact ? "center" : "flex-start",
        gap:           S[3],
        padding:       compact ? `${S[2]}px ${S[3]}px` : `${S[2]}px ${S[3]}px`,
        borderBottom:  `1px solid ${C.lineSubtle}`,
        borderLeft:    `3px solid ${meta.accentLeft}`,
        background:    "transparent",
      }}
    >
      {/* Tier icon */}
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: 700,
        color: meta.color, flexShrink: 0, width: 16, textAlign: "center" as const,
        marginTop: compact ? 0 : 1,
      }}>
        {meta.icon}
      </span>

      {/* Label block */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 600, color: C.ink }}>
          {entry.label}
        </div>
        {!compact && (
          <>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginTop: 1 }}>
              {entry.provider}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
              {entry.readinessNote}
            </div>
          </>
        )}
        {compact && (
          <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>
            {entry.provider}
          </div>
        )}
      </div>

      {/* Loader name + tier badge — right side */}
      <div style={{ flexShrink: 0, textAlign: "right" as const, display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 2 }}>
        <span style={{
          fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: meta.color,
          background: meta.bgColor, border: `1px solid ${meta.color}30`,
          borderRadius: R.sm, padding: `1px ${S[1]}px`,
        }}>
          {meta.label}
        </span>
        {!compact && (
          <span style={{ fontFamily: T.mono, fontSize: 7, color: C.inkGhost }}>
            {entry.loaderName.replace(/Loader\(.*\)/, "Loader").replace("SagOrdersSales", "SagOrdersSales")}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Section block ─────────────────────────────────────────────────────────────

function SectionBlock({
  title, count, entries, compact, accentColor,
}: {
  title:       string;
  count:       number;
  entries:     SourceReadinessEntry[];
  compact?:    boolean;
  accentColor: string;
}) {
  if (entries.length === 0) return null;

  return (
    <div style={{
      background: C.white,
      border: `1px solid ${C.lineSubtle}`,
      borderTop: `2px solid ${accentColor}`,
      borderRadius: R.md,
      overflow: "hidden",
    }}>
      {/* Section header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: `${S[2]}px ${S[3]}px`,
        borderBottom: `1px solid ${C.lineSubtle}`,
        background: C.surface,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: accentColor, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
          {title}
        </span>
        <span style={{
          fontFamily: T.mono, fontSize: 9, fontWeight: 700,
          color: accentColor, background: `${accentColor}12`,
          border: `1px solid ${accentColor}30`, borderRadius: R.pill,
          padding: `1px 6px`,
        }}>
          {count}
        </span>
      </div>

      {/* Source rows */}
      <div>
        {entries.map(entry => (
          <SourceCard key={entry.sourceType} entry={entry} compact={compact} />
        ))}
      </div>
    </div>
  );
}

// ── Summary Strip (Phase 3) ───────────────────────────────────────────────────

function SummaryStrip({ report }: { report: SourceReadinessReport }) {
  const tiles = [
    { label: "Fuentes listas",     value: report.readyCount,   color: C.green,    icon: "✓" },
    { label: "Fuentes parciales",  value: report.partialCount, color: C.amber,    icon: "◐" },
    { label: "Fuentes pendientes", value: report.pendingCount, color: C.inkLight, icon: "○" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2], marginBottom: S[3] }}>
      {tiles.map(t => (
        <div key={t.label} style={{
          background: C.surface, border: `1px solid ${C.lineSubtle}`,
          borderLeft: `3px solid ${t.color}`,
          borderRadius: R.md, padding: `${S[2]}px ${S[3]}px`,
          display: "flex", alignItems: "center", gap: S[2],
        }}>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: 700, color: t.color, lineHeight: 1 }}>
            {t.icon} {t.value}
          </span>
          <span style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>
            {t.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Meeting Mode (Phase 4) ────────────────────────────────────────────────────

function MeetingModeView({ report }: { report: SourceReadinessReport }) {
  return (
    <div>
      {/* Header */}
      <div style={{
        background: C.blueDark, borderRadius: R.md,
        padding: `${S[3]}px ${S[4]}px`, marginBottom: S[3],
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: 700, color: C.white, letterSpacing: "0.06em" }}>
            ESTADO DE INTEGRACIÓN OPERACIONAL
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: "#93c5fd", marginTop: 2 }}>
            Agentik · Conciliación · {report.totalCount} fuentes registradas
          </div>
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 9, color: "#93c5fd" }}>
          ✓ {report.readyCount} · ◐ {report.partialCount} · ○ {report.pendingCount}
        </div>
      </div>

      {/* Three column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: S[2] }}>

        {/* LISTAS */}
        <div style={{ background: "#f0fdf4", border: `1px solid ${C.green}30`, borderRadius: R.md, overflow: "hidden" }}>
          <div style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.green}20`, background: `${C.green}10` }}>
            <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: C.green, textTransform: "uppercase" as const }}>
              ✓ LISTAS — {report.readyCount}
            </span>
          </div>
          {report.ready.length === 0 ? (
            <div style={{ padding: S[3], fontFamily: T.mono, fontSize: 9, color: C.inkFaint, fontStyle: "italic" }}>Ninguna</div>
          ) : report.ready.map(e => (
            <div key={e.sourceType} style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.green}15` }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: 600 }}>{e.shortLabel}</div>
              <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>{e.provider}</div>
            </div>
          ))}
        </div>

        {/* PARCIALES */}
        <div style={{ background: "#fefce8", border: `1px solid ${C.amber}30`, borderRadius: R.md, overflow: "hidden" }}>
          <div style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.amber}20`, background: `${C.amber}10` }}>
            <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: C.amber, textTransform: "uppercase" as const }}>
              ◐ PARCIALES — {report.partialCount}
            </span>
          </div>
          {report.partial.length === 0 ? (
            <div style={{ padding: S[3], fontFamily: T.mono, fontSize: 9, color: C.inkFaint, fontStyle: "italic" }}>Ninguna</div>
          ) : report.partial.map(e => (
            <div key={e.sourceType} style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.amber}15` }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: 600 }}>{e.shortLabel}</div>
              <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                {e.readinessNote}
              </div>
            </div>
          ))}
        </div>

        {/* PENDIENTES */}
        <div style={{ background: C.surface, border: `1px solid ${C.lineSubtle}`, borderRadius: R.md, overflow: "hidden" }}>
          <div style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}`, background: C.surfaceAlt }}>
            <span style={{ fontFamily: T.mono, fontSize: 8, fontWeight: 700, color: C.inkLight, textTransform: "uppercase" as const }}>
              ○ PENDIENTES — {report.pendingCount}
            </span>
          </div>
          {report.pending.length === 0 ? (
            <div style={{ padding: S[3], fontFamily: T.mono, fontSize: 9, color: C.green, fontStyle: "italic" }}>Todas operacionales ✓</div>
          ) : report.pending.map(e => (
            <div key={e.sourceType} style={{ padding: `${S[2]}px ${S[3]}px`, borderBottom: `1px solid ${C.lineSubtle}` }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, fontWeight: 600 }}>{e.shortLabel}</div>
              <div style={{ fontFamily: T.mono, fontSize: 8, color: C.inkFaint }}>
                {TIER_META[e.tier].label}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface SourceReadinessBoardProps {
  report: SourceReadinessReport;
}

export function SourceReadinessBoard({ report }: SourceReadinessBoardProps) {
  const [mode, setMode] = useState<"board" | "meeting">("board");

  return (
    <div>
      {/* Mode toggle */}
      <div style={{ display: "flex", gap: S[1], marginBottom: S[3], alignItems: "center" }}>
        {(["board", "meeting"] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              fontFamily: T.mono, fontSize: 9, fontWeight: mode === m ? 700 : 400,
              color:      mode === m ? C.white : C.inkMid,
              background: mode === m ? C.blueDark : C.surface,
              border:     `1px solid ${mode === m ? C.blueDark : C.line}`,
              borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
            }}
          >
            {m === "board" ? "DETALLE" : "VISTA SAG"}
          </button>
        ))}
      </div>

      {mode === "meeting" ? (
        <MeetingModeView report={report} />
      ) : (
        <>
          {/* Summary strip (Phase 3) */}
          <SummaryStrip report={report} />

          {/* Three sections */}
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
            <SectionBlock
              title="LISTAS"
              count={report.readyCount}
              entries={report.ready}
              accentColor={C.green}
            />
            <SectionBlock
              title="PARCIALES"
              count={report.partialCount}
              entries={report.partial}
              accentColor={C.amber}
            />
            <SectionBlock
              title="PENDIENTES"
              count={report.pendingCount}
              entries={report.pending}
              accentColor={C.inkLight}
            />
          </div>
        </>
      )}
    </div>
  );
}
