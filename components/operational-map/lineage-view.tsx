"use client";

/**
 * components/operational-map/lineage-view.tsx
 *
 * Shared operational lineage renderer.
 *
 * Renders the multi-source consolidation view for any KPI:
 *   CONSOLIDADO → FUENTE_1 | FUENTE_2 | TIENDAS | WEB | AGENTIK
 *
 * Consumed by:
 *   - core-kpi-certification-panel.tsx     (governance drawer, "Vista Ops" tab)
 *   - operational-connection-audit-panel.tsx (meeting drawer, "Vista Operacional" tab)
 *
 * Data source:
 *   - CORE_KPI_LINEAGES for the 10 core KPIs (pre-computed)
 *   - buildKpiConsolidationLineage() for any other KPI (dynamic, from SAG catalog)
 *
 * Sprint: AGENTIK-OPS-MEETING-LINEAGE-RENDER-01
 */

import { C, T, S, R } from "@/lib/ui/tokens";
import {
  CORE_KPI_LINEAGES,
  buildKpiConsolidationLineage,
  type KpiConsolidationLineage,
  type LineageSourceEntry,
} from "@/lib/operational-map/multisource/kpi-consolidation-lineage";
import {
  VIEW_TYPE_META,
  VIEW_TYPE_ORDER,
  type OperationalViewType,
} from "@/lib/operational-map/multisource/operational-source-classifier";

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontFamily:    T.mono,
      fontSize:      10,
      color:         C.inkFaint,
      letterSpacing: "0.07em",
      marginBottom:  S[2],
      textTransform: "uppercase" as const,
    }}>
      {text}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface LineageViewProps {
  kpiKey:       string;
  entityLabel?: string;
  /** Compact mode: tighter spacing for meeting panels */
  compact?:     boolean;
}

export function LineageView({ kpiKey, entityLabel, compact = false }: LineageViewProps) {
  const lineage: KpiConsolidationLineage =
    CORE_KPI_LINEAGES[kpiKey] ??
    buildKpiConsolidationLineage(kpiKey, entityLabel ?? kpiKey);

  // Group sources by viewType
  const grouped: Partial<Record<OperationalViewType, LineageSourceEntry[]>> = {};
  for (const src of lineage.sources) {
    if (!grouped[src.viewType]) grouped[src.viewType] = [];
    grouped[src.viewType]!.push(src);
  }

  const orderedViews = VIEW_TYPE_ORDER.filter(v => v !== "consolidated" && grouped[v] && grouped[v]!.length > 0);
  const totalSources = lineage.sources.filter(s => s.codigoFuente !== "AGENTIK").length;
  const gap = compact ? S[2] : S[3];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? S[3] : S[4] }}>

      {/* ── CONSOLIDADO header ── */}
      <div style={{
        background:   VIEW_TYPE_META.consolidated.bg,
        border:       `1px solid ${VIEW_TYPE_META.consolidated.border}`,
        borderLeft:   `4px solid ${VIEW_TYPE_META.consolidated.color}`,
        borderRadius: R.md,
        padding:      `${compact ? S[2] : S[3]}px`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 4 }}>
          <span style={{
            fontFamily:  T.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
            color:       VIEW_TYPE_META.consolidated.color,
            background:  VIEW_TYPE_META.consolidated.border,
            padding:     "1px 5px", borderRadius: R.sm, flexShrink: 0,
          }}>
            CONSOLIDADO
          </span>
          <span style={{ fontFamily: T.mono, fontSize: compact ? 11 : T.sz.xs, fontWeight: 700, color: VIEW_TYPE_META.consolidated.color }}>
            {lineage.entityLabel}
          </span>
        </div>
        <div style={{ fontFamily: T.mono, fontSize: 10, color: C.inkMid }}>
          {totalSources > 0
            ? `${totalSources} fuente(s) SAG · ${orderedViews.length} vista(s) · cómputo Agentik`
            : "Sin fuentes SAG mapeadas — requiere validación"}
        </div>
        {!compact && (
          <div style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginTop: 3 }}>
            {VIEW_TYPE_META.consolidated.description}
          </div>
        )}
      </div>

      {/* ── Lineage tree ── */}
      {orderedViews.map(viewType => {
        const meta    = VIEW_TYPE_META[viewType];
        const sources = grouped[viewType]!;

        return (
          <div key={viewType}>
            {/* View header */}
            <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
              <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0 }}>
                <div style={{ width: 2, height: compact ? 8 : 12, background: C.line }} />
                <div style={{ width: compact ? 8 : 12, height: 2, background: C.line }} />
              </div>
              <span style={{
                fontFamily:  T.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                color:       meta.color, background: meta.bg,
                border:      `1px solid ${meta.border}`,
                padding:     "1px 5px", borderRadius: R.sm, flexShrink: 0,
              }}>
                {meta.tag}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: compact ? 11 : T.sz.xs, fontWeight: 700, color: meta.color }}>
                {meta.label}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: 9, color: C.inkFaint, marginLeft: "auto" }}>
                {sources.length}
              </span>
            </div>

            {/* Source rows */}
            <div style={{ marginLeft: compact ? 16 : 22, display: "flex", flexDirection: "column", gap: compact ? 3 : S[1] }}>
              {sources.map((src, i) => (
                <div key={`${src.codigoFuente}-${i}`} style={{
                  display:      "flex",
                  alignItems:   "flex-start",
                  gap:          S[2],
                  padding:      `${compact ? 4 : S[2]}px ${compact ? 6 : S[2]}px`,
                  background:   meta.bg,
                  border:       `1px solid ${meta.border}`,
                  borderLeft:   `3px solid ${meta.color}`,
                  borderRadius: R.sm,
                }}>
                  {/* Code */}
                  <span style={{
                    fontFamily:  T.mono, fontSize: compact ? 10 : 9, fontWeight: 700,
                    color:       meta.color, letterSpacing: "0.04em",
                    minWidth:    compact ? 24 : 28, flexShrink: 0,
                  }}>
                    {src.codigoFuente}
                  </span>
                  {/* Name + pending */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: T.mono, fontSize: compact ? 10 : T.sz.xs, color: C.ink, lineHeight: 1.3 }}>
                      {src.nombreFuente}
                    </div>
                    {src.tablaSagConfirmada && src.tablaSagConfirmada !== "runtime_agentik" && (
                      <code style={{
                        fontFamily: T.mono, fontSize: 9, color: "#0369a1",
                        background: "#f0f9ff", borderRadius: R.sm, padding: "1px 4px",
                      }}>
                        {src.tablaSagConfirmada}
                      </code>
                    )}
                    {src.pendingNote && (
                      <div style={{ fontFamily: T.mono, fontSize: 9, color: "#92400e", fontStyle: "italic", marginTop: 1 }}>
                        ⚠ {src.pendingNote}
                      </div>
                    )}
                  </div>
                  {/* Impact badges */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                    {src.impactaVentas && (
                      <span style={{ fontFamily: T.mono, fontSize: 9, color: "#166534", background: "#dcfce7", borderRadius: R.sm, padding: "1px 4px" }}>
                        VTA
                      </span>
                    )}
                    {src.impactaCobros && (
                      <span style={{ fontFamily: T.mono, fontSize: 9, color: "#1e40af", background: "#dbeafe", borderRadius: R.sm, padding: "1px 4px" }}>
                        COB
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* ── Agentik compute layer ── */}
      {grouped["consolidated"] && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
            <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", flexShrink: 0 }}>
              <div style={{ width: 2, height: compact ? 8 : 12, background: C.line }} />
              <div style={{ width: compact ? 8 : 12, height: 2, background: C.line }} />
            </div>
            <span style={{
              fontFamily:  T.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
              color:       VIEW_TYPE_META.consolidated.color, background: VIEW_TYPE_META.consolidated.bg,
              border:      `1px solid ${VIEW_TYPE_META.consolidated.border}`,
              padding:     "1px 5px", borderRadius: R.sm,
            }}>
              AGENTIK
            </span>
            <span style={{ fontFamily: T.mono, fontSize: compact ? 11 : T.sz.xs, fontWeight: 700, color: VIEW_TYPE_META.consolidated.color }}>
              Cómputo Agentik
            </span>
          </div>
          <div style={{
            marginLeft:   compact ? 16 : 22,
            fontFamily:   T.mono, fontSize: compact ? 10 : T.sz.xs, color: C.inkMid,
            background:   VIEW_TYPE_META.consolidated.bg,
            border:       `1px solid ${VIEW_TYPE_META.consolidated.border}`,
            borderLeft:   `3px solid ${VIEW_TYPE_META.consolidated.color}`,
            borderRadius: R.sm,
            padding:      `${compact ? 4 : S[2]}px ${compact ? 6 : S[3]}px`,
            lineHeight:   1.5,
          }}>
            Consolidación ejecutiva + normalización + detección de anomalías
          </div>
        </div>
      )}

      {/* ── Pending notes ── */}
      {lineage.pendingNotes.length > 0 && (
        <div>
          <SectionLabel text={`Pendientes (${lineage.pendingNotes.length})`} />
          <div style={{ display: "flex", flexDirection: "column", gap: compact ? 3 : S[1] }}>
            {lineage.pendingNotes.map((note, i) => (
              <div key={i} style={{
                fontFamily:   T.mono, fontSize: compact ? 10 : T.sz.xs, color: "#92400e",
                background:   "#fffbeb", border: "1px solid #fde68a",
                borderLeft:   "3px solid #d97706",
                borderRadius: R.sm, padding: `${compact ? 4 : S[2]}px ${compact ? 6 : S[3]}px`,
                lineHeight:   1.4,
              }}>
                {note}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── No sources state ── */}
      {lineage.sources.length === 0 && (
        <div style={{
          fontFamily:   T.mono, fontSize: T.sz.xs, color: C.inkFaint,
          background:   C.surfaceAlt, border: `1px dashed ${C.line}`,
          borderRadius: R.md,
          padding:      `${compact ? S[3] : S[4]}px`,
          fontStyle:    "italic",
          textAlign:    "center" as const,
        }}>
          Sin fuentes SAG en catálogo para este KPI.<br />
          Requiere mapeo manual en reunión operacional.
        </div>
      )}
    </div>
  );
}
