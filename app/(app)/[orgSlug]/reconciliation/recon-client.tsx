"use client";

/**
 * Reconciliation Center client component.
 *
 * Renders the reconciliation config form, summary cards, and detail table
 * for the Orders vs Sales reconciliation result. All styling is inline
 * monospace enterprise style — no Tailwind classes.
 */

import type { CSSProperties, ReactNode } from "react";
import type { ReconResult, ReconRecord, ReconStatus } from "@/lib/reconciliation/types";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug:          string;
  periods:          string[];
  period?:          string;
  sourceA?:         string;
  sourceB?:         string;
  availableSources: Array<{ source: string; batchCount: number; recordCount: number }>;
  result?:          ReconResult | null;
}

// ── Formatters ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtPeriodo(p: string): string {
  const m = Number(p.slice(4));
  return `${MONTH_NAMES[m] ?? p.slice(4)} ${p.slice(0, 4)}`;
}

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtN(n: number): string {
  return new Intl.NumberFormat("es-CO").format(n);
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<ReconStatus, CSSProperties> = {
  MATCH:               { background: "#bbf7d0", color: "#14532d" },
  MISMATCH_AMOUNT:     { background: "#fde68a", color: "#92400e" },
  ONLY_IN_A:           { background: "#bfdbfe", color: "#1e3a8a" },
  ONLY_IN_B:           { background: "#e9d5ff", color: "#6b21a8" },
  POSSIBLE_DUPLICATE:  { background: "#fca5a5", color: "#991b1b" },
};

const STATUS_LABELS: Record<ReconStatus, string> = {
  MATCH:               "Cuadra",
  MISMATCH_AMOUNT:     "Diferencia monto",
  ONLY_IN_A:           "Solo en Fuente A",
  ONLY_IN_B:           "Solo en Fuente B",
  POSSIBLE_DUPLICATE:  "Posible duplicado",
};

const STATUS_DESC: Record<ReconStatus, string> = {
  MATCH:               "El registro existe en ambas fuentes y los montos coinciden (tolerancia 0.1%)",
  MISMATCH_AMOUNT:     "El registro existe en ambas fuentes pero los montos no coinciden",
  ONLY_IN_A:           "El registro solo existe en la Fuente A — falta en la Fuente B",
  ONLY_IN_B:           "El registro solo existe en la Fuente B — falta en la Fuente A",
  POSSIBLE_DUPLICATE:  "La misma clave aparece más de una vez en la misma fuente",
};

function StatusBadge({ status }: { status: ReconStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <span style={{
      ...s,
      fontSize: 10,
      fontWeight: 700,
      padding: "2px 8px",
      borderRadius: 4,
      fontFamily: "monospace",
      letterSpacing: "0.02em",
    }}>
      {STATUS_LABELS[status]}
    </span>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportReconCsv(result: ReconResult): void {
  const header = `Clave,Descripcion,Estado,Monto ${result.sourceALabel},Monto ${result.sourceBLabel},Diferencia,Diferencia %,Filas A,Filas B`;
  const rows = result.records.map(r => [
    r.key,
    r.label,
    STATUS_LABELS[r.status],
    r.amountA != null ? String(r.amountA) : "",
    r.amountB != null ? String(r.amountB) : "",
    r.delta   != null ? String(r.delta)   : "",
    r.deltaPercent != null ? r.deltaPercent.toFixed(2) : "",
    String(r.rowsA),
    String(r.rowsB),
  ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(","));

  const csv  = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  const dateSuffix = new Date().toISOString().slice(0, 10);
  link.download = `agentik_recon_${result.scope}_${dateSuffix}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ── Table primitives ──────────────────────────────────────────────────────────

const TABLE: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const THEAD_ROW: CSSProperties = { borderBottom: "1px solid #eee", background: "#fafafa" };

function TH({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: "6px 14px",
      textAlign: right ? "right" : "left",
      fontWeight: 600,
      color: "#777",
      fontSize: 11,
    }}>
      {children}
    </th>
  );
}

function TD({ children, right, bold }: { children: ReactNode; right?: boolean; bold?: boolean }) {
  return (
    <td style={{
      padding: "7px 14px",
      textAlign: right ? "right" : "left",
      fontWeight: bold ? 600 : 400,
      color: "#111",
      borderBottom: "1px solid #f5f5f5",
    }}>
      {children}
    </td>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label:   string;
  value:   string;
  sub?:    string;
  accent?: "green" | "yellow" | "red";
}) {
  const accentColor = accent === "green" ? "#15803d"
    : accent === "yellow" ? "#92400e"
    : accent === "red"    ? "#991b1b"
    : "#111";
  const accentBg = accent === "green" ? "#f0fdf4"
    : accent === "yellow" ? "#fffbeb"
    : accent === "red"    ? "#fef2f2"
    : "#fff";

  return (
    <div style={{
      border: "1px solid #ddd",
      borderRadius: 6,
      padding: "14px 18px",
      background: accentBg,
      fontFamily: "monospace",
    }}>
      <div style={{
        fontSize: 10,
        color: "#888",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: accentColor, lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>{sub}</div>
      )}
    </div>
  );
}

// ── Sort order for status ─────────────────────────────────────────────────────

const STATUS_ORDER: Record<ReconStatus, number> = {
  POSSIBLE_DUPLICATE: 0,
  MISMATCH_AMOUNT:    1,
  ONLY_IN_A:          2,
  ONLY_IN_B:          3,
  MATCH:              4,
};

function sortedRecords(records: ReconRecord[]): ReconRecord[] {
  return [...records].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReconClient({
  orgSlug,
  periods,
  period,
  sourceA,
  sourceB,
  availableSources,
  result,
}: Props) {
  const baseUrl = `/${orgSlug}/reconciliation`;

  // Build source options: available sources + "all"
  const sourceOptions = [
    { value: "all", label: "Todas las fuentes" },
    ...availableSources.map(s => ({
      value: s.source,
      label: `${s.source} (${fmtN(s.recordCount)} reg.)`,
    })),
  ];

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
        <a href={`/${orgSlug}/sales`} style={{ fontSize: 11, color: "#888", textDecoration: "none", fontFamily: "monospace" }}>← Control Comercial</a>
        <span style={{ color: "#ccc" }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Centro de Conciliación</h1>
        <span style={{
          fontSize: 11,
          background: "#111",
          color: "#fff",
          padding: "2px 10px",
          borderRadius: 4,
          fontWeight: 700,
          letterSpacing: "0.03em",
        }}>
          Pedidos vs Ventas
        </span>
      </div>

      {/* ── Config panel ── */}
      <div style={{ border: "1px solid #ddd", borderRadius: 6, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "9px 14px", borderBottom: "1px solid #ddd", background: "#f5f5f5" }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Configuración</span>
        </div>
        <form method="GET" action={baseUrl} style={{ padding: "14px 16px" }}>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>

            {/* Recon type (static) */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                Tipo de reconciliacion
              </label>
              <div style={{
                padding: "5px 8px",
                fontSize: 12,
                border: "1px solid #ddd",
                borderRadius: 4,
                background: "#fafafa",
                color: "#555",
              }}>
                Pedidos vs Ventas
              </div>
            </div>

            {/* Period */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                Periodo
              </label>
              <select
                name="period"
                defaultValue={period ?? ""}
                style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, fontFamily: "monospace" }}
              >
                <option value="">Seleccionar...</option>
                {periods.map(p => (
                  <option key={p} value={p}>{fmtPeriodo(p)}</option>
                ))}
              </select>
            </div>

            {/* Placeholder for layout */}
            <div />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 12 }}>

            {/* Source A */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                Fuente A
              </label>
              <select
                name="sourceA"
                defaultValue={sourceA ?? ""}
                style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, fontFamily: "monospace" }}
              >
                <option value="">Seleccionar fuente...</option>
                {sourceOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Source B */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                Fuente B
              </label>
              <select
                name="sourceB"
                defaultValue={sourceB ?? ""}
                style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, fontFamily: "monospace" }}
              >
                <option value="">Seleccionar fuente...</option>
                {sourceOptions.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            style={{
              padding: "6px 20px",
              fontSize: 12,
              fontWeight: 700,
              background: "#111",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontFamily: "monospace",
            }}
          >
            Ejecutar Conciliación
          </button>
        </form>
      </div>

      {/* ── Same-source warning ── */}
      {sourceA && sourceB && sourceA === sourceB && (
        <div style={{
          padding: "10px 14px",
          marginBottom: 16,
          border: "1px solid #fde68a",
          borderRadius: 6,
          background: "#fffbeb",
          fontSize: 12,
          color: "#92400e",
        }}>
          <b>Atención:</b> Fuente A y Fuente B son la misma ({sourceA}). La reconciliación mostrará 100% de coincidencia trivialmente — seleccione dos fuentes diferentes para obtener resultados útiles.
        </div>
      )}

      {/* ── Result ── */}
      {result && (
        <>
          {/* Summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
            <SummaryCard
              label="Cuadran"
              value={fmtN(result.summary.matched)}
              sub={`de ${fmtN(result.summary.total)} registros`}
              accent="green"
            />
            <SummaryCard
              label="Diferencia de monto"
              value={fmtN(result.summary.mismatchAmount)}
              sub="mismo key, monto distinto"
              accent={result.summary.mismatchAmount > 0 ? "yellow" : "green"}
            />
            <SummaryCard
              label={`Solo en ${result.sourceALabel}`}
              value={fmtN(result.summary.onlyInA)}
              sub="faltan en Fuente B"
              accent={result.summary.onlyInA > 0 ? "yellow" : "green"}
            />
            <SummaryCard
              label={`Solo en ${result.sourceBLabel}`}
              value={fmtN(result.summary.onlyInB)}
              sub="faltan en Fuente A"
              accent={result.summary.onlyInB > 0 ? "yellow" : "green"}
            />
            <SummaryCard
              label="Tasa de coincidencia"
              value={`${result.summary.matchRate.toFixed(1)}%`}
              sub={result.summary.possibleDuplicates > 0
                ? `${result.summary.possibleDuplicates} posibles duplicados`
                : "sin duplicados detectados"}
              accent={result.summary.matchRate >= 95 ? "green" : result.summary.matchRate >= 80 ? "yellow" : "red"}
            />
          </div>

          {/* Amount summary */}
          <div style={{
            display: "flex",
            gap: 16,
            marginBottom: 20,
            padding: "10px 14px",
            background: "#fafafa",
            border: "1px solid #eee",
            borderRadius: 6,
            fontSize: 12,
          }}>
            <span>
              <span style={{ color: "#888", fontWeight: 700 }}>Total A:</span>{" "}
              <span style={{ fontWeight: 700 }}>{fmtCOP(result.summary.totalAmountA)}</span>
            </span>
            <span style={{ color: "#ddd" }}>|</span>
            <span>
              <span style={{ color: "#888", fontWeight: 700 }}>Total B:</span>{" "}
              <span style={{ fontWeight: 700 }}>{fmtCOP(result.summary.totalAmountB)}</span>
            </span>
            <span style={{ color: "#ddd" }}>|</span>
            <span>
              <span style={{ color: "#888", fontWeight: 700 }}>Delta Total:</span>{" "}
              <span style={{
                fontWeight: 700,
                color: Math.abs(result.summary.deltaTotal) < 1 ? "#15803d" : "#dc2626",
              }}>
                {fmtCOP(result.summary.deltaTotal)}
              </span>
            </span>
            <span style={{ color: "#ddd" }}>|</span>
            <span style={{ color: "#888" }}>
              {result.sourceALabel} vs {result.sourceBLabel}
            </span>
            <span style={{ marginLeft: "auto", color: "#aaa", fontSize: 11 }}>
              {new Date(result.runAt).toLocaleString("es-CO")}
            </span>
          </div>

          {/* Status legend */}
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 16,
            padding: "10px 14px",
            background: "#fafafa",
            border: "1px solid #eee",
            borderRadius: 6,
            fontSize: 11,
            color: "#555",
          }}>
            <span style={{ fontWeight: 700, color: "#888", marginRight: 4 }}>Leyenda:</span>
            {(Object.keys(STATUS_LABELS) as ReconStatus[]).map(s => (
              <span key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  ...STATUS_STYLES[s],
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "1px 6px",
                  borderRadius: 3,
                  fontFamily: "monospace",
                  whiteSpace: "nowrap",
                }}>
                  {STATUS_LABELS[s]}
                </span>
                <span style={{ color: "#888" }}>{STATUS_DESC[s]}</span>
              </span>
            ))}
          </div>

          {/* Export + table */}
          <div style={{ border: "1px solid #ddd", borderRadius: 6, overflow: "hidden" }}>
            <div style={{
              padding: "9px 14px",
              borderBottom: "1px solid #ddd",
              background: "#f5f5f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <span style={{ fontWeight: 700, fontSize: 13 }}>
                Detalle — {result.records.length} registros
                <span style={{ fontWeight: 400, color: "#888", fontSize: 12, marginLeft: 8 }}>
                  A: {result.sourceALabel} · B: {result.sourceBLabel}
                </span>
              </span>
              <button
                onClick={() => exportReconCsv(result)}
                style={{
                  padding: "4px 14px",
                  fontSize: 11,
                  fontWeight: 700,
                  background: "#fff",
                  color: "#111",
                  border: "1px solid #ddd",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontFamily: "monospace",
                }}
              >
                Exportar CSV
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={TABLE}>
                <thead>
                  <tr style={THEAD_ROW}>
                    <TH>Estado</TH>
                    <TH>Descripcion</TH>
                    <TH right>Monto {result.sourceALabel}</TH>
                    <TH right>Monto {result.sourceBLabel}</TH>
                    <TH right>Diferencia</TH>
                    <TH right>Dif. %</TH>
                    <TH right>Filas A</TH>
                    <TH right>Filas B</TH>
                  </tr>
                </thead>
                <tbody>
                  {sortedRecords(result.records).map((r, i) => (
                    <tr key={r.key} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <TD><StatusBadge status={r.status} /></TD>
                      <TD bold>
                        <div style={{ fontSize: 12 }}>{r.label}</div>
                        <div style={{ fontSize: 10, color: "#aaa", marginTop: 2 }}>{r.key}</div>
                      </TD>
                      <TD right>{r.amountA != null ? fmtCOP(r.amountA) : <span style={{ color: "#ccc" }}>—</span>}</TD>
                      <TD right>{r.amountB != null ? fmtCOP(r.amountB) : <span style={{ color: "#ccc" }}>—</span>}</TD>
                      <TD right>
                        {r.delta != null ? (
                          <span style={{ color: Math.abs(r.delta) < 1 ? "#15803d" : "#dc2626", fontWeight: 600 }}>
                            {fmtCOP(r.delta)}
                          </span>
                        ) : (
                          <span style={{ color: "#ccc" }}>—</span>
                        )}
                      </TD>
                      <TD right>
                        {r.deltaPercent != null ? (
                          <span style={{ color: Math.abs(r.deltaPercent) < 0.1 ? "#15803d" : "#dc2626" }}>
                            {r.deltaPercent.toFixed(2)}%
                          </span>
                        ) : (
                          <span style={{ color: "#ccc" }}>—</span>
                        )}
                      </TD>
                      <TD right><span style={{ color: "#666" }}>{fmtN(r.rowsA)}</span></TD>
                      <TD right><span style={{ color: "#666" }}>{fmtN(r.rowsB)}</span></TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!result && period && sourceA && sourceB && (
        <div style={{
          padding: "20px",
          border: "1px solid #fca5a5",
          borderRadius: 6,
          background: "#fef2f2",
          fontSize: 12,
          color: "#991b1b",
        }}>
          Error al ejecutar la reconciliacion. Verifique los parametros e intente nuevamente.
        </div>
      )}

      {!period && (
        <div style={{
          padding: "20px",
          border: "1px solid #ddd",
          borderRadius: 6,
          background: "#fafafa",
          fontSize: 12,
          color: "#888",
        }}>
          Seleccione un periodo y dos fuentes para ejecutar la reconciliacion.
        </div>
      )}
    </div>
  );
}
