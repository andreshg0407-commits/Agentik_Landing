"use client";

/**
 * Informes Inteligentes — Mobile Report Copilot.
 *
 * Mobile-first UI. Works on desktop too but designed for thumb-friendly
 * operation: large touch targets, stacked card layout, chip prompts.
 */

import { useState, useRef, useCallback } from "react";
import type { CSSProperties } from "react";
import type { ReportResult, ReportColumn, ReportKpi } from "@/lib/reports/runners";
import ActionButton from "../_action-button";

// ── Quick-example chips ───────────────────────────────────────────────────────

const EXAMPLE_CHIPS = [
  "Clientes con cartera vencida en Cali",
  "Pedidos confirmados de Néstor esta semana",
  "Top clientes por ventas del mes",
  "Clientes sin comprar hace 60 días",
  "Cotizaciones anuladas por vendedor",
  "Pedidos en SAG pero sin facturar",
];

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function fmtCell(v: string | number | null, col: ReportColumn): string {
  if (v == null || v === "") return "—";
  if (col.currency && typeof v === "number") return fmtCOP(v);
  if (col.numeric  && typeof v === "number") return new Intl.NumberFormat("es-CO").format(v);
  return String(v);
}

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCsv(result: ReportResult) {
  const header = result.columns.map(c => `"${c.label}"`).join(",");
  const body   = result.rows.map(row =>
    result.columns.map(c => {
      const v = row[c.key];
      const s = v == null ? "" : String(v).replace(/"/g, '""');
      return `"${s}"`;
    }).join(","),
  ).join("\n");

  const csv  = `${header}\n${body}`;
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `informe-${result.queryFamily}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── PDF "export" (print the result panel) ────────────────────────────────────

function exportPdf(panelId: string) {
  const el = document.getElementById(panelId);
  if (!el) return;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<html><head><title>Informe</title>
    <style>
      body { font-family: monospace; font-size: 12px; margin: 24px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
      th { background: #f5f5f5; font-weight: bold; }
      .report-entity-links { display: none; }
      a { color: inherit; text-decoration: none; }
    </style></head><body>${el.innerHTML}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

// ── Entity deep-link resolution ───────────────────────────────────────────────

/** Same logic as lib/sales/normalize.ts toSlug — kept inline to stay client-only. */
function toSlug(s: string): string {
  return s.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

interface EntityLink { label: string; href: string }

function resolveEntityLinks(
  row:     Record<string, string | number | null>,
  orgSlug: string,
): EntityLink[] {
  const links: EntityLink[] = [];

  // Seller link
  const sellerSlug = row._sellerSlug;
  if (sellerSlug && typeof sellerSlug === "string") {
    links.push({ label: "Ver vendedor", href: `/${orgSlug}/sales/vendors/${sellerSlug}` });
  }

  // Customer link — prefer NIT, fall back to name
  const customerKey = row._customerKey ?? row.nit ?? row.customerName ?? row.name;
  if (customerKey && typeof customerKey === "string") {
    links.push({
      label: "Ver cliente",
      href:  `/${orgSlug}/sales/customers/${encodeURIComponent(customerKey)}`,
    });
  }

  // Branch link — slugify the human-readable sucursal name
  const branchName = row._branchName;
  if (branchName && typeof branchName === "string") {
    links.push({
      label: "Ver sucursal",
      href:  `/${orgSlug}/sales/branches/${encodeURIComponent(toSlug(branchName))}`,
    });
  }

  return links;
}

// ── Risk / status color maps ──────────────────────────────────────────────────

const RISK_COLORS: Record<string, { bg: string; color: string }> = {
  LOW:      { bg: "#bbf7d0", color: "#14532d" },
  MEDIUM:   { bg: "#fde68a", color: "#92400e" },
  HIGH:     { bg: "#fed7aa", color: "#9a3412" },
  CRITICAL: { bg: "#fca5a5", color: "#991b1b" },
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ACCEPTED: { bg: "#bbf7d0", color: "#14532d" },
  SENT:     { bg: "#bfdbfe", color: "#1e3a8a" },
  DRAFT:    { bg: "#e5e7eb", color: "#374151" },
  REJECTED: { bg: "#fca5a5", color: "#991b1b" },
  EXPIRED:  { bg: "#fde68a", color: "#92400e" },
};

function cellBadge(value: string, key: string): CSSProperties | null {
  if (key === "churnRisk" && value in RISK_COLORS) {
    return { ...RISK_COLORS[value], fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 };
  }
  if (key === "status" && value in STATUS_COLORS) {
    return { ...STATUS_COLORS[value], fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 };
  }
  if (key === "agingBucket") {
    const isOverdue = !["CURRENT", "Al día"].includes(value);
    return {
      background: isOverdue ? "#fde68a" : "#bbf7d0",
      color:      isOverdue ? "#92400e" : "#14532d",
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
    };
  }
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props { orgSlug: string }

export default function ReportsClient({ orgSlug }: Props) {
  const [query,   setQuery]   = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<ReportResult | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const inputRef              = useRef<HTMLTextAreaElement>(null);
  const PANEL_ID              = "report-result-panel";

  const runQuery = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/reports`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ query: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error desconocido");
      setResult(json.result as ReportResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  function handleChip(chip: string) {
    setQuery(chip);
    runQuery(chip);
    inputRef.current?.focus();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runQuery(query);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{
      fontFamily:  "monospace",
      maxWidth:    720,
      margin:      "0 auto",
      padding:     "16px 12px 48px",
    }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
          <a href={`/${orgSlug}/sales`} style={{ fontSize: 12, color: "#888", textDecoration: "none" }}>
            ← Control Comercial
          </a>
          <span style={{ color: "#ddd" }}>·</span>
          <a href={`/${orgSlug}/reports/scheduled`} style={{
            fontSize: 12, fontWeight: 700, textDecoration: "none",
            color: "#7c3aed",
            padding: "2px 8px", borderRadius: 4,
            background: "#ede9fe", border: "1px solid #c4b5fd",
          }}>
            📅 Reportes Programados
          </a>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px", color: "#111" }}>
          Informes Inteligentes
        </h1>
        <p style={{ fontSize: 13, color: "#666", margin: 0 }}>
          Escribe tu consulta en español y obtén el informe al instante.
        </p>
      </div>

      {/* ── Query input ── */}
      <form onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
        <div style={{ position: "relative" }}>
          <textarea
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                runQuery(query);
              }
            }}
            placeholder="¿Qué quieres saber? p. ej. Clientes con cartera vencida en Cali"
            rows={2}
            style={{
              width:        "100%",
              boxSizing:    "border-box",
              fontSize:     16,
              fontFamily:   "monospace",
              padding:      "14px 56px 14px 16px",
              border:       "2px solid #111",
              borderRadius: 10,
              resize:       "none",
              outline:      "none",
              lineHeight:   1.4,
              background:   "#fff",
              color:        "#111",
            }}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            style={{
              position:     "absolute",
              right:        10,
              top:          "50%",
              transform:    "translateY(-50%)",
              background:   loading || !query.trim() ? "#ccc" : "#111",
              color:        "#fff",
              border:       "none",
              borderRadius: 8,
              width:        38,
              height:       38,
              fontSize:     20,
              cursor:       loading || !query.trim() ? "default" : "pointer",
              display:      "flex",
              alignItems:   "center",
              justifyContent: "center",
              transition:   "background 0.15s",
              flexShrink:   0,
            }}
            aria-label="Buscar"
          >
            {loading ? "⏳" : "→"}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#aaa", margin: "6px 0 0 2px" }}>
          Enter para buscar · Shift+Enter para nueva línea
        </p>
      </form>

      {/* ── Quick-example chips ── */}
      <div style={{
        display:    "flex",
        flexWrap:   "wrap",
        gap:        8,
        marginBottom: 24,
      }}>
        {EXAMPLE_CHIPS.map(chip => (
          <button
            key={chip}
            onClick={() => handleChip(chip)}
            disabled={loading}
            style={{
              fontSize:     12,
              fontFamily:   "monospace",
              padding:      "8px 14px",
              borderRadius: 20,
              border:       "1px solid #d1d5db",
              background:   "#f9fafb",
              color:        "#374151",
              cursor:       loading ? "default" : "pointer",
              whiteSpace:   "nowrap",
              lineHeight:   1.3,
              transition:   "background 0.1s, border-color 0.1s",
            }}
            onMouseEnter={e => {
              if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#f3f4f6";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "#f9fafb";
            }}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div style={{
          textAlign: "center", padding: "40px 16px",
          color: "#666", fontSize: 15,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          Consultando datos…
        </div>
      )}

      {/* ── Error ── */}
      {error && !loading && (
        <div style={{
          background:   "#fff0f0",
          border:       "1px solid #fca5a5",
          borderRadius: 10,
          padding:      "16px 20px",
          color:        "#991b1b",
          fontSize:     14,
          marginBottom: 16,
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* ── Result ── */}
      {result && !loading && (
        <ReportPanel result={result} panelId={PANEL_ID} orgSlug={orgSlug} />
      )}

      {/* ── Empty state (first visit) ── */}
      {!loading && !result && !error && (
        <div style={{
          textAlign:    "center",
          padding:      "48px 16px",
          color:        "#aaa",
          fontSize:     14,
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
          <div style={{ fontWeight: 700, color: "#888", marginBottom: 6 }}>
            Tu informe aparecerá aquí
          </div>
          <div style={{ fontSize: 12 }}>
            Escribe una consulta o toca uno de los ejemplos de arriba
          </div>
        </div>
      )}
    </div>
  );
}

// ── Result panel ──────────────────────────────────────────────────────────────

function ReportPanel({ result, panelId, orgSlug }: { result: ReportResult; panelId: string; orgSlug: string }) {
  const [view, setView] = useState<"table" | "cards">("table");

  return (
    <div style={{ marginTop: 8 }}>

      {/* ── Panel header ── */}
      <div style={{
        display:      "flex",
        alignItems:   "flex-start",
        justifyContent: "space-between",
        flexWrap:     "wrap",
        gap:          8,
        marginBottom: 14,
      }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 2px", color: "#111" }}>
            {result.title}
          </h2>
          <div style={{ fontSize: 12, color: "#666" }}>{result.subtitle}</div>
          <div style={{ fontSize: 10, color: "#bbb", marginTop: 2 }}>
            {result.totalRows} resultado{result.totalRows !== 1 ? "s" : ""} ·{" "}
            {new Date(result.generatedAt).toLocaleTimeString("es-CO")}
          </div>
        </div>

        {/* Export buttons */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <ExportButton
            label="CSV"
            icon="⬇"
            onClick={() => exportCsv(result)}
            title="Descargar como hoja de cálculo (Excel / Google Sheets)"
          />
          <ExportButton
            label="PDF"
            icon="🖨"
            onClick={() => exportPdf(panelId)}
            title="Imprimir o guardar como PDF"
          />
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div style={{
        display:              "grid",
        gridTemplateColumns:  "repeat(auto-fill, minmax(140px, 1fr))",
        gap:                  10,
        marginBottom:         20,
      }}>
        {result.kpis.map((kpi, i) => (
          <KpiCard key={i} kpi={kpi} />
        ))}
      </div>

      {/* ── Bulk action CTA ── */}
      {result.rows.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          marginBottom: 12, paddingBottom: 12,
          borderBottom: "1px solid #f3f4f6",
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {result.totalRows} resultado{result.totalRows !== 1 ? "s" : ""} ·
          </span>
          <ActionButton
            orgSlug={orgSlug}
            label="Crear acción para este informe"
            icon="🎯"
            variant="purple"
            size="xs"
            prefill={{
              actionType:   "GENERAR_INFORME",
              sourceModule: "informes",
              title:        `Acción sobre informe: ${result.title}`,
              description:  `${result.totalRows} resultados · ${result.subtitle}`,
              priority:     "MEDIUM",
            }}
          />
          <ActionButton
            orgSlug={orgSlug}
            label="Programar seguimiento"
            icon="📅"
            variant="ghost"
            size="xs"
            prefill={{
              actionType:   "PROGRAMAR_INFORME",
              sourceModule: "informes",
              title:        `Seguimiento programado — ${result.title}`,
              description:  `Programar revisión periódica de: ${result.subtitle}`,
              priority:     "MEDIUM",
            }}
          />
        </div>
      )}

      {/* ── View toggle ── */}
      {result.rows.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <ToggleBtn active={view === "table"} onClick={() => setView("table")}>
            Tabla
          </ToggleBtn>
          <ToggleBtn active={view === "cards"} onClick={() => setView("cards")}>
            Tarjetas
          </ToggleBtn>
        </div>
      )}

      {/* ── No results ── */}
      {result.rows.length === 0 && (
        <div style={{
          background:   "#f9fafb",
          border:       "1px solid #e5e7eb",
          borderRadius: 10,
          padding:      "28px 20px",
          textAlign:    "center",
          color:        "#888",
          fontSize:     14,
        }}>
          Sin resultados para esta consulta.
          <div style={{ fontSize: 12, marginTop: 4, color: "#bbb" }}>
            Ajusta los filtros o prueba con otro vendedor / ciudad.
          </div>
        </div>
      )}

      {/* ── Table or Cards ── */}
      {result.rows.length > 0 && (
        <div id={panelId}>
          {view === "table" ? (
            <ResultTable result={result} orgSlug={orgSlug} />
          ) : (
            <ResultCards result={result} orgSlug={orgSlug} />
          )}
        </div>
      )}
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ kpi }: { kpi: ReportKpi }) {
  return (
    <div style={{
      border:       `1px solid ${kpi.highlight ? "#fca5a5" : kpi.positive ? "#86efac" : "#e5e7eb"}`,
      borderRadius: 10,
      padding:      "12px 14px",
      background:   kpi.highlight ? "#fff5f5" : kpi.positive ? "#f0fdf4" : "#fff",
    }}>
      <div style={{
        fontSize:        10,
        color:           "#888",
        fontWeight:      700,
        textTransform:   "uppercase",
        letterSpacing:   "0.06em",
        marginBottom:    6,
        lineHeight:      1.3,
      }}>
        {kpi.label}
      </div>
      <div style={{
        fontSize:   18,
        fontWeight: 800,
        color:      kpi.highlight ? "#dc2626" : kpi.positive ? "#15803d" : "#111",
        lineHeight: 1.2,
        wordBreak:  "break-all",
      }}>
        {kpi.value}
      </div>
    </div>
  );
}

// ── Table view ────────────────────────────────────────────────────────────────

/** Keys whose cells become inline links when the matching hidden field is set. */
const ENTITY_CELL_LINKS: Record<string, (row: Record<string, string | number | null>, orgSlug: string) => string | null> = {
  customerName: (row, org) => {
    const key = row._customerKey ?? row.nit ?? row.customerName;
    return key ? `/${org}/sales/customers/${encodeURIComponent(String(key))}` : null;
  },
  name: (row, org) => {
    const key = row._customerKey ?? row.nit ?? row.name;
    return key ? `/${org}/sales/customers/${encodeURIComponent(String(key))}` : null;
  },
  sellerName: (row, org) => {
    const slug = row._sellerSlug;
    return slug ? `/${org}/sales/vendors/${slug}` : null;
  },
  sucursal: (row, org) => {
    const name = row._branchName;
    return name ? `/${org}/sales/branches/${encodeURIComponent(toSlug(String(name)))}` : null;
  },
};

function ResultTable({ result, orgSlug }: { result: ReportResult; orgSlug: string }) {
  return (
    <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e5e7eb" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
            {result.columns.map(col => (
              <th key={col.key} style={{
                padding:   "10px 14px",
                textAlign: col.numeric ? "right" : "left",
                fontWeight: 600,
                color:     "#555",
                whiteSpace: "nowrap",
                fontSize:  11,
              }}>
                {col.label}
              </th>
            ))}
            <th style={{
              padding: "10px 14px", textAlign: "left",
              fontWeight: 600, color: "#555", whiteSpace: "nowrap", fontSize: 11,
            }}>
              Acciones
            </th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, i) => {
            const customerKey = row._customerKey ?? row.nit ?? row.customerName ?? row.name;
            const sellerSlug  = row._sellerSlug;
            const isOverdue   = (row.daysOverdue && Number(row.daysOverdue) > 0)
              || (row.agingBucket && !["CURRENT", "Al día"].includes(String(row.agingBucket)));

            return (
              <tr key={i} style={{
                background:    i % 2 === 0 ? "#fff" : "#fafafa",
                borderBottom:  "1px solid #f3f4f6",
              }}>
                {result.columns.map(col => {
                  const raw   = row[col.key];
                  const text  = fmtCell(raw, col);
                  const badge = typeof raw === "string" ? cellBadge(raw, col.key) : null;
                  const href  = ENTITY_CELL_LINKS[col.key]?.(row, orgSlug) ?? null;
                  return (
                    <td key={col.key} style={{
                      padding:   "9px 14px",
                      textAlign: col.numeric ? "right" : "left",
                      color:     "#111",
                      verticalAlign: "middle",
                      whiteSpace: col.numeric ? "nowrap" : "normal",
                    }}>
                      {badge ? (
                        <span style={badge}>{text}</span>
                      ) : text === "—" ? (
                        <span style={{ color: "#ccc" }}>—</span>
                      ) : href ? (
                        <a
                          href={href}
                          style={{
                            color: "#6d28d9",
                            textDecoration: "none",
                            fontWeight: 600,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
                          onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
                        >
                          {text}
                        </a>
                      ) : text}
                    </td>
                  );
                })}
                {/* ── Per-row action column ── */}
                <td style={{ padding: "6px 10px", verticalAlign: "middle", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {customerKey && typeof customerKey === "string" && isOverdue && (
                      <ActionButton
                        orgSlug={orgSlug}
                        label="Cobro"
                        icon="💰"
                        variant="danger"
                        size="xs"
                        prefill={{
                          actionType:   "CREAR_ACCION_COBRANZA",
                          targetType:   "customer",
                          targetLabel:  String(customerKey),
                          sourceModule: "informes",
                          title:        `Cobranza — ${customerKey}`,
                          priority:     "HIGH",
                        }}
                      />
                    )}
                    {customerKey && typeof customerKey === "string" && !isOverdue && (
                      <ActionButton
                        orgSlug={orgSlug}
                        label="Tarea"
                        variant="ghost"
                        size="xs"
                        prefill={{
                          actionType:   "CREAR_TAREA_COMERCIAL",
                          targetType:   "customer",
                          targetLabel:  String(customerKey),
                          sourceModule: "informes",
                          title:        `Tarea — ${customerKey}`,
                        }}
                      />
                    )}
                    {sellerSlug && typeof sellerSlug === "string" && (
                      <ActionButton
                        orgSlug={orgSlug}
                        label="Seg."
                        variant="ghost"
                        size="xs"
                        prefill={{
                          actionType:   "ASIGNAR_SEGUIMIENTO_VENDEDOR",
                          targetType:   "seller",
                          targetLabel:  String(row.sellerName ?? sellerSlug),
                          sourceModule: "informes",
                          title:        `Seguimiento — ${row.sellerName ?? sellerSlug}`,
                        }}
                      />
                    )}
                    <ActionButton
                      orgSlug={orgSlug}
                      label="↑"
                      variant="ghost"
                      size="xs"
                      prefill={{
                        actionType:   "ESCALAR_A_GERENCIA",
                        targetLabel:  String(customerKey ?? sellerSlug ?? row[result.columns[0]?.key ?? ""] ?? ""),
                        sourceModule: "informes",
                        title:        `Escalar — ${customerKey ?? sellerSlug ?? result.title}`,
                        priority:     "HIGH",
                      }}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Card view (mobile-friendly) ───────────────────────────────────────────────

function ResultCards({ result, orgSlug }: { result: ReportResult; orgSlug: string }) {
  // Primary label column (usually "name", "customerName", "quoteName")
  const primaryKey = result.columns[0]?.key ?? "name";
  const secondaryKey = result.columns[1]?.key;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {result.rows.map((row, i) => {
        const entityLinks = resolveEntityLinks(row, orgSlug);
        return (
          <div key={i} style={{
            border:       "1px solid #e5e7eb",
            borderRadius: 10,
            padding:      "14px 16px",
            background:   "#fff",
          }}>
            {/* Card header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>
                  {fmtCell(row[primaryKey], result.columns[0])}
                </div>
                {secondaryKey && row[secondaryKey] != null && (
                  <div style={{ fontSize: 11, color: "#888", marginTop: 1 }}>
                    {result.columns[1].label}: {fmtCell(row[secondaryKey], result.columns[1])}
                  </div>
                )}
              </div>
              {/* Amount / primary numeric — show top-right if present */}
              {(() => {
                const numCol = result.columns.find(c => c.currency);
                if (!numCol) return null;
                const v = row[numCol.key];
                if (!v) return null;
                return (
                  <div style={{ fontWeight: 800, fontSize: 16, color: "#111", textAlign: "right", flexShrink: 0 }}>
                    {fmtCell(v, numCol)}
                  </div>
                );
              })()}
            </div>

            {/* Remaining fields as pill-pairs */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {result.columns.slice(2).map(col => {
                const raw  = row[col.key];
                if (raw == null || raw === "" || col.currency) return null; // skip amount (shown above)
                const text  = fmtCell(raw, col);
                if (text === "—") return null;
                const badge = typeof raw === "string" ? cellBadge(raw, col.key) : null;
                return (
                  <span key={col.key} style={{
                    fontSize:     11,
                    background:   "#f3f4f6",
                    borderRadius: 6,
                    padding:      "3px 9px",
                    color:        "#555",
                    display:      "inline-flex",
                    alignItems:   "center",
                    gap:          4,
                  }}>
                    <span style={{ color: "#aaa" }}>{col.label}:</span>
                    {badge ? (
                      <span style={badge}>{text}</span>
                    ) : (
                      <span style={{ fontWeight: 600, color: "#333" }}>{text}</span>
                    )}
                  </span>
                );
              })}
            </div>

            {/* Entity deep-links + Action entry points */}
            {entityLinks.length > 0 && (
              <div
                className="report-entity-links"
                style={{
                  display:    "flex",
                  flexWrap:   "wrap",
                  gap:        6,
                  marginTop:  10,
                  paddingTop: 10,
                  borderTop:  "1px solid #f3f4f6",
                }}
              >
                {entityLinks.map(link => (
                  <a
                    key={link.href}
                    href={link.href}
                    style={{
                      fontSize:     11,
                      fontFamily:   "monospace",
                      fontWeight:   600,
                      color:        "#6d28d9",
                      background:   "#ede9fe",
                      border:       "1px solid #c4b5fd",
                      borderRadius: 6,
                      padding:      "4px 10px",
                      textDecoration: "none",
                      whiteSpace:   "nowrap",
                      display:      "inline-flex",
                      alignItems:   "center",
                      gap:          4,
                    }}
                  >
                    {link.label} →
                  </a>
                ))}

                {/* ── Agentik Action Layer — contextual action buttons ── */}
                {(() => {
                  const customerKey = row._customerKey ?? row.nit ?? row.customerName ?? row.name;
                  const sellerSlug  = row._sellerSlug;
                  const isOverdue   = (row.daysOverdue && Number(row.daysOverdue) > 0)
                    || (row.agingBucket && !["CURRENT", "Al día"].includes(String(row.agingBucket)));

                  return (
                    <>
                      {customerKey && typeof customerKey === "string" && isOverdue && (
                        <ActionButton
                          orgSlug={orgSlug}
                          label="Cobranza"
                          icon="💰"
                          variant="danger"
                          size="xs"
                          prefill={{
                            actionType:   "CREAR_ACCION_COBRANZA",
                            targetType:   "customer",
                            targetLabel:  String(customerKey),
                            sourceModule: "informes",
                            title:        `Cobranza — ${customerKey}`,
                            priority:     "HIGH",
                          }}
                        />
                      )}
                      {customerKey && typeof customerKey === "string" && !isOverdue && (
                        <ActionButton
                          orgSlug={orgSlug}
                          label="Crear tarea"
                          icon="✚"
                          variant="ghost"
                          size="xs"
                          prefill={{
                            actionType:   "CREAR_TAREA_COMERCIAL",
                            targetType:   "customer",
                            targetLabel:  String(customerKey),
                            sourceModule: "informes",
                            title:        `Tarea — ${customerKey}`,
                          }}
                        />
                      )}
                      {sellerSlug && typeof sellerSlug === "string" && (
                        <ActionButton
                          orgSlug={orgSlug}
                          label="Seguimiento"
                          icon="📋"
                          variant="ghost"
                          size="xs"
                          prefill={{
                            actionType:   "ASIGNAR_SEGUIMIENTO_VENDEDOR",
                            targetType:   "seller",
                            targetLabel:  String(row.sellerName ?? sellerSlug),
                            sourceModule: "informes",
                            title:        `Seguimiento — ${row.sellerName ?? sellerSlug}`,
                          }}
                        />
                      )}
                      <ActionButton
                        orgSlug={orgSlug}
                        label="Escalar"
                        icon="⬆"
                        variant="ghost"
                        size="xs"
                        prefill={{
                          actionType:   "ESCALAR_A_GERENCIA",
                          targetLabel:  String(customerKey ?? sellerSlug ?? row[Object.keys(row)[0]] ?? ""),
                          sourceModule: "informes",
                          title:        `Escalamiento desde informe — ${customerKey ?? sellerSlug ?? ""}`,
                          priority:     "HIGH",
                        }}
                      />
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Small sub-components ──────────────────────────────────────────────────────

function ExportButton({
  label, icon, onClick, title,
}: {
  label: string; icon: string; onClick: () => void; title?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          5,
        fontSize:     12,
        fontFamily:   "monospace",
        padding:      "8px 14px",
        borderRadius: 8,
        border:       "1px solid #d1d5db",
        background:   "#f9fafb",
        color:        "#374151",
        cursor:       "pointer",
        fontWeight:   600,
        whiteSpace:   "nowrap",
      }}
    >
      <span>{icon}</span> {label}
    </button>
  );
}

function ToggleBtn({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize:     12,
        fontFamily:   "monospace",
        padding:      "6px 14px",
        borderRadius: 8,
        border:       `1px solid ${active ? "#111" : "#d1d5db"}`,
        background:   active ? "#111" : "#f9fafb",
        color:        active ? "#fff" : "#374151",
        cursor:       "pointer",
        fontWeight:   active ? 700 : 400,
        transition:   "all 0.1s",
      }}
    >
      {children}
    </button>
  );
}
