"use client";

import { useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Pivot import tester
// ─────────────────────────────────────────────────────────────────────────────

interface DetectedPair {
  line:        string;
  valorCol:    number;
  cantidadCol: number | null;
}

interface PivotDiagnostics {
  seller:           string;
  sellerSourceRow:  number;
  sellerSourceCol:  number;
  sheetName:        string;
  linesDetected:    string[];
  colHeaderRowIdx:  number;
  lineGroupRowIdx:  number;
  detectedPairs:    DetectedPair[];
  totalRawRows:     number;
  producedRows:     number;
  skippedRows:      number;
  sampleRows:       unknown[];
  firstRowsPreview: string[][];
  warnings:         string[];
}

interface PivotResult {
  ok:               boolean;
  batchId?:         string;
  scopeType?:       string;
  scopeKey?:        string;
  rowCount?:        number;
  importedCount?:   number;
  skippedCount?:    number;
  replacedBatchId?: string | null;
  parseErrors?:     Array<{ rowIndex: number; error: string; severity: string }>;
  pivotDiagnostics?: PivotDiagnostics;
  error?:           string;
}

type PivotState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; result: PivotResult; ms: number }
  | { phase: "error"; message: string };

export function PivotImportTester({ orgSlug }: { orgSlug: string }) {
  const fileRef        = useRef<HTMLInputElement>(null);
  const [seller, setSeller]     = useState("");
  const [canal,  setCanal]      = useState("tienda");
  const [scopeType, setScopeType] = useState("MONTH");
  const [state, setState]       = useState<PivotState>({ phase: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setState({ phase: "loading" });
    const t0 = Date.now();

    const form = new FormData();
    form.append("file", file);
    form.append("scopeType", scopeType);
    form.append("defaultCanal", canal);
    if (seller.trim()) form.append("sellerOverride", seller.trim());

    try {
      const res  = await fetch(`/api/orgs/${orgSlug}/sales/import-pivot`, {
        method: "POST",
        body:   form,
      });
      const json: PivotResult = await res.json();
      setState({ phase: "done", result: json, ms: Date.now() - t0 });
    } catch (err) {
      setState({ phase: "error", message: (err as Error).message });
    }
  }

  const inputStyle: React.CSSProperties = {
    border: "1px solid #ccc", borderRadius: 4, padding: "4px 8px",
    fontSize: 12, fontFamily: "monospace",
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: "#444", marginRight: 6 };

  return (
    <div style={{
      border: "1px solid #c4b5fd", borderRadius: 6, overflow: "hidden",
      marginBottom: 24,
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 16px", background: "#faf5ff", borderBottom: "1px solid #c4b5fd",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>Pivot Import Tester</span>
        <span style={{ fontSize: 11, background: "#ede9fe", color: "#6d28d9", padding: "1px 7px", borderRadius: 4, fontWeight: 600 }}>
          CASTILLITOS FORMAT
        </span>
        <span style={{ fontSize: 11, color: "#888", marginLeft: 4 }}>
          POST /api/orgs/{orgSlug}/sales/import-pivot
        </span>
      </div>

      {/* Instructions */}
      <div style={{
        padding: "8px 16px", fontSize: 11, color: "#555",
        background: "#fdf4ff", borderBottom: "1px solid #e9d5ff",
      }}>
        Use for pivot-style Excel/CSV with line groups (CASTILLITOS / LATIN KIDS / IMPORTACION)
        and seller in the header. Outputs flat rows into the standard import pipeline.
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{
        padding: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end",
        background: "#fff",
      }}>
        <div>
          <label style={labelStyle}>File (.xlsx or .csv)</label><br />
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.ods" style={{ fontSize: 12 }} required />
        </div>

        <div>
          <label style={labelStyle}>Seller (auto-detected if blank)</label><br />
          <input
            value={seller} onChange={e => setSeller(e.target.value)}
            placeholder="e.g. JUAN GARCIA"
            style={{ ...inputStyle, width: 180 }}
          />
        </div>

        <div>
          <label style={labelStyle}>Canal default</label><br />
          <select value={canal} onChange={e => setCanal(e.target.value)} style={inputStyle}>
            <option value="tienda">tienda → TIENDA</option>
            <option value="distribuidor">distribuidor → DISTRIBUIDOR</option>
            <option value="online">online → ONLINE</option>
            <option value="otro">otro → OTRO</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Scope</label><br />
          <select value={scopeType} onChange={e => setScopeType(e.target.value)} style={inputStyle}>
            <option value="MONTH">MONTH</option>
            <option value="RANGE">RANGE</option>
            <option value="YEAR">YEAR</option>
            <option value="ADHOC">ADHOC</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={state.phase === "loading"}
          style={{
            padding: "6px 18px", background: "#7c3aed", color: "#fff",
            border: "none", borderRadius: 4, cursor: "pointer",
            fontSize: 13, fontFamily: "monospace", fontWeight: 600,
            opacity: state.phase === "loading" ? 0.5 : 1,
          }}
        >
          {state.phase === "loading" ? "Parsing & importing…" : "Parse + Import"}
        </button>

        {state.phase === "done" && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "6px 18px", background: "#fff", color: "#111",
              border: "1px solid #ccc", borderRadius: 4, cursor: "pointer",
              fontSize: 13, fontFamily: "monospace",
            }}
          >
            ↻ Refresh reports
          </button>
        )}
      </form>

      {/* Network error */}
      {state.phase === "error" && (
        <div style={{
          margin: "0 16px 16px", padding: "10px 14px",
          background: "#fff0f0", color: "#991b1b",
          border: "1px solid #fca5a5", borderRadius: 4, fontSize: 13,
        }}>
          Network error: {state.message}
        </div>
      )}

      {/* Result */}
      {state.phase === "done" && (() => {
        const r   = state.result;
        const d   = r.pivotDiagnostics;
        const isOk = r.ok && !r.error;

        return (
          <div style={{ borderTop: "1px solid #e9d5ff" }}>
            {/* Status bar */}
            <div style={{
              padding: "8px 16px",
              background: isOk ? "#f0fdf4" : "#fff0f0",
              borderBottom: "1px solid #eee",
              display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap",
            }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: isOk ? "#14532d" : "#991b1b" }}>
                {isOk ? "✓ IMPORTED" : "✗ FAILED"} — {state.ms} ms
              </span>
              {isOk && <>
                <Pill label="batch"    value={r.batchId?.slice(0, 14) + "…"} />
                <Pill label="scope"    value={`${r.scopeType} / ${r.scopeKey}`} />
                <Pill label="imported" value={String(r.importedCount)} />
                <Pill label="skipped"  value={String(r.skippedCount)} />
                {r.replacedBatchId && <Pill label="replaced" value={r.replacedBatchId.slice(0,14)+"…"} color="#7c3aed" />}
              </>}
              {!isOk && <span style={{ fontSize: 12, color: "#991b1b" }}>{r.error}</span>}
            </div>

            {/* Pivot diagnostics */}
            {d && (
              <div style={{
                padding: "10px 16px", borderBottom: "1px solid #eee",
                background: "#faf5ff", fontSize: 12,
              }}>
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 6 }}>
                  <span>
                    <span style={{ color: "#888" }}>seller: </span>
                    <b>{d.seller}</b>
                    {d.sellerSourceRow >= 0 && (
                      <span style={{ fontSize: 10, color: "#aaa", marginLeft: 5 }}>
                        (row {d.sellerSourceRow}, col {d.sellerSourceCol})
                      </span>
                    )}
                  </span>
                  {d.sheetName && <span><span style={{ color: "#888" }}>sheet: </span><b>{d.sheetName}</b></span>}
                  <span><span style={{ color: "#888" }}>header row: </span><b>{d.colHeaderRowIdx}</b></span>
                  <span>
                    <span style={{ color: "#888" }}>line group row: </span>
                    <b style={{ color: d.lineGroupRowIdx >= 0 ? "#111" : "#991b1b" }}>
                      {d.lineGroupRowIdx >= 0 ? d.lineGroupRowIdx : "not found"}
                    </b>
                  </span>
                  <span><span style={{ color: "#888" }}>raw rows: </span><b>{d.totalRawRows}</b></span>
                  <span><span style={{ color: "#888" }}>produced: </span><b style={{ color: d.producedRows > 0 ? "#14532d" : "#991b1b" }}>{d.producedRows}</b></span>
                  <span><span style={{ color: "#888" }}>skipped: </span><b>{d.skippedRows}</b></span>
                </div>

                {/* Detected column pairs per line group */}
                {d.detectedPairs && d.detectedPairs.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ color: "#888", fontSize: 11 }}>Column pairs: </span>
                    {d.detectedPairs.map((p, i) => (
                      <span key={i} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        margin: "0 6px 2px 0", padding: "2px 8px",
                        background: p.valorCol >= 0 ? "#ede9fe" : "#fee2e2",
                        borderRadius: 4, fontSize: 11,
                      }}>
                        <span style={{ fontWeight: 600, color: "#6d28d9" }}>{p.line}</span>
                        <span style={{ color: "#888" }}>
                          valor={p.valorCol >= 0 ? `col${p.valorCol}` : "–"}
                          {" "}cant={p.cantidadCol != null ? `col${p.cantidadCol}` : "–"}
                        </span>
                      </span>
                    ))}
                  </div>
                )}

                <div style={{ marginBottom: 4 }}>
                  <span style={{ color: "#888", fontSize: 11 }}>Lines detected: </span>
                  {d.linesDetected.length > 0
                    ? d.linesDetected.map(l => (
                        <span key={l} style={{
                          display: "inline-block", margin: "0 4px 2px 0",
                          padding: "1px 8px", background: "#ede9fe", color: "#6d28d9",
                          borderRadius: 4, fontSize: 11, fontWeight: 600,
                        }}>{l}</span>
                      ))
                    : <span style={{ color: "#b45309" }}>none detected</span>
                  }
                </div>

                {d.warnings.length > 0 && (
                  <div style={{
                    marginTop: 6, padding: "6px 10px",
                    background: "#fffbeb", border: "1px solid #fde68a",
                    borderRadius: 4, fontSize: 11, color: "#92400e",
                  }}>
                    {d.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                  </div>
                )}

                {d.producedRows === 0 && d.firstRowsPreview && d.firstRowsPreview.length > 0 && (
                  <details style={{ marginTop: 8 }} open>
                    <summary style={{ fontSize: 11, color: "#991b1b", cursor: "pointer", fontWeight: 600 }}>
                      Raw sheet preview — first {d.firstRowsPreview.length} rows (use this to debug header detection)
                    </summary>
                    <div style={{ overflowX: "auto", marginTop: 6 }}>
                      <table style={{
                        borderCollapse: "collapse", fontSize: 10, fontFamily: "monospace",
                        border: "1px solid #fca5a5", borderRadius: 4,
                      }}>
                        <tbody>
                          {d.firstRowsPreview.map((row, ri) => (
                            <tr key={ri} style={{ background: ri % 2 === 0 ? "#fff" : "#fff5f5" }}>
                              <td style={{ padding: "2px 6px", color: "#999", borderRight: "1px solid #fca5a5", userSelect: "none" }}>{ri}</td>
                              {row.map((cell, ci) => (
                                <td key={ci} style={{
                                  padding: "2px 8px", borderRight: "1px solid #fde8e8",
                                  maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                  color: cell ? "#111" : "#ccc",
                                }}>
                                  {cell || "·"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}

                {d.sampleRows.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ fontSize: 11, color: "#555", cursor: "pointer" }}>
                      First {d.sampleRows.length} unpivoted rows (click to expand)
                    </summary>
                    <pre style={{
                      marginTop: 6, padding: 8, fontSize: 11,
                      background: "#fff", borderRadius: 4,
                      overflowX: "auto", maxHeight: 280, border: "1px solid #e9d5ff",
                    }}>
                      {JSON.stringify(d.sampleRows, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {/* Parse errors */}
            {isOk && (r.parseErrors?.length ?? 0) > 0 && (
              <details style={{ padding: "8px 16px" }}>
                <summary style={{ fontSize: 11, color: "#b45309", cursor: "pointer" }}>
                  {r.parseErrors!.length} parse errors
                </summary>
                <pre style={{
                  marginTop: 6, padding: 8, fontSize: 11,
                  background: "#fffbeb", borderRadius: 4, maxHeight: 200, overflowY: "auto",
                }}>
                  {r.parseErrors!.map(e => `[${e.severity}] row ${e.rowIndex}: ${e.error}`).join("\n")}
                </pre>
              </details>
            )}
          </div>
        );
      })()}
    </div>
  );
}

interface ImportResult {
  ok:              boolean;
  batchId?:        string;
  grain?:          string;
  scopeType?:      string;
  scopeKey?:       string;
  rowCount?:       number;
  importedCount?:  number;
  skippedCount?:   number;
  replacedBatchId?: string | null;
  periodTotals?:   Record<string, { rows: number; total: number }>;
  previewRows?:    unknown[];
  parseErrors?:    Array<{ rowIndex: number; error: string; severity: string }>;
  error?:          string;
}

type State =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "done"; result: ImportResult; ms: number }
  | { phase: "error"; message: string };

export function ImportTester({ orgSlug }: { orgSlug: string }) {
  const fileRef  = useRef<HTMLInputElement>(null);
  const [grain,     setGrain]     = useState("TRANSACTION");
  const [scopeType, setScopeType] = useState("MONTH");
  const [state, setState]         = useState<State>({ phase: "idle" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setState({ phase: "loading" });
    const t0 = Date.now();

    const form = new FormData();
    form.append("file", file);
    form.append("grain", grain);
    form.append("scopeType", scopeType);

    try {
      const res = await fetch(`/api/orgs/${orgSlug}/sales/import`, {
        method: "POST",
        body:   form,
      });
      const json: ImportResult = await res.json();
      setState({ phase: "done", result: json, ms: Date.now() - t0 });
    } catch (e) {
      setState({ phase: "error", message: (e as Error).message });
    }
  }

  function handleRefresh() {
    window.location.reload();
  }

  const inputStyle: React.CSSProperties = {
    border: "1px solid #ccc", borderRadius: 4, padding: "4px 8px",
    fontSize: 12, fontFamily: "monospace",
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: "#444", marginRight: 6 };

  return (
    <div style={{
      border: "1px solid #ddd", borderRadius: 6, overflow: "hidden",
      marginBottom: 40,
    }}>
      {/* Header */}
      <div style={{ padding: "10px 16px", background: "#f5f5f5", borderBottom: "1px solid #ddd" }}>
        <span style={{ fontWeight: 700, fontSize: 15 }}>CSV Import Tester</span>
        <span style={{ fontSize: 11, color: "#888", marginLeft: 12 }}>
          POST /api/orgs/{orgSlug}/sales/import
        </span>
      </div>

      {/* Instructions */}
      <div style={{
        padding: "8px 16px", fontSize: 11, color: "#555",
        background: "#fffef5", borderBottom: "1px solid #eee",
      }}>
        1. Select a SAG CSV file · 2. Choose grain and scope · 3. Click Import
        · 4. Check result below · 5. Click "Refresh reports" to see updated data
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} style={{ padding: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <div>
          <label style={labelStyle}>CSV file</label><br />
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ fontSize: 12 }} required />
        </div>

        <div>
          <label style={labelStyle}>Grain</label><br />
          <select value={grain} onChange={e => setGrain(e.target.value)} style={inputStyle}>
            <option value="TRANSACTION">TRANSACTION</option>
            <option value="AGGREGATED">AGGREGATED</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Scope type</label><br />
          <select value={scopeType} onChange={e => setScopeType(e.target.value)} style={inputStyle}>
            <option value="MONTH">MONTH (auto from periodo_ao_mes)</option>
            <option value="RANGE">RANGE (multi-month)</option>
            <option value="YEAR">YEAR</option>
            <option value="ADHOC">ADHOC (no replace)</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={state.phase === "loading"}
          style={{
            padding: "6px 18px", background: "#111", color: "#fff",
            border: "none", borderRadius: 4, cursor: "pointer",
            fontSize: 13, fontFamily: "monospace", fontWeight: 600,
            opacity: state.phase === "loading" ? 0.5 : 1,
          }}
        >
          {state.phase === "loading" ? "Importing…" : "Import"}
        </button>

        {state.phase === "done" && (
          <button
            type="button"
            onClick={handleRefresh}
            style={{
              padding: "6px 18px", background: "#fff", color: "#111",
              border: "1px solid #ccc", borderRadius: 4, cursor: "pointer",
              fontSize: 13, fontFamily: "monospace",
            }}
          >
            ↻ Refresh reports
          </button>
        )}
      </form>

      {/* Result */}
      {state.phase === "error" && (
        <div style={{
          margin: "0 16px 16px", padding: "10px 14px",
          background: "#fff0f0", color: "#991b1b",
          border: "1px solid #fca5a5", borderRadius: 4, fontSize: 13,
        }}>
          Network error: {state.message}
        </div>
      )}

      {state.phase === "done" && (() => {
        const r = state.result;
        const isOk = r.ok && !r.error;

        return (
          <div style={{ borderTop: "1px solid #eee" }}>
            {/* Summary bar */}
            <div style={{
              padding: "8px 16px",
              background: isOk ? "#f0fdf4" : "#fff0f0",
              borderBottom: "1px solid #eee",
              display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap",
            }}>
              <span style={{
                fontWeight: 700, fontSize: 12,
                color: isOk ? "#14532d" : "#991b1b",
              }}>
                {isOk ? "✓ IMPORTED" : "✗ FAILED"} — {state.ms} ms
              </span>

              {isOk && <>
                <Pill label="batch" value={r.batchId?.slice(0, 14) + "…"} />
                <Pill label="scope" value={`${r.scopeType} / ${r.scopeKey}`} />
                <Pill label="imported" value={String(r.importedCount)} />
                <Pill label="skipped" value={String(r.skippedCount)} />
                {r.replacedBatchId && <Pill label="replaced" value={r.replacedBatchId.slice(0, 14) + "…"} color="#7c3aed" />}
                {(r.parseErrors?.length ?? 0) > 0 && (
                  <Pill label="parse errors" value={String(r.parseErrors?.length)} color="#b45309" />
                )}
              </>}

              {!isOk && <span style={{ fontSize: 12, color: "#991b1b" }}>{r.error}</span>}
            </div>

            {/* Period totals */}
            {isOk && r.periodTotals && Object.keys(r.periodTotals).length > 0 && (
              <div style={{ padding: "8px 16px", borderBottom: "1px solid #eee" }}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Period totals in this file:</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {Object.entries(r.periodTotals).map(([p, v]) => (
                    <span key={p} style={{ fontSize: 12 }}>
                      <b>{p}</b>: {v.rows} rows · {fmtCOP(v.total)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* First 10 rows preview */}
            {isOk && r.previewRows && r.previewRows.length > 0 && (
              <details style={{ padding: "8px 16px", borderBottom: "1px solid #eee" }}>
                <summary style={{ fontSize: 11, color: "#555", cursor: "pointer" }}>
                  First {r.previewRows.length} normalized rows (click to expand)
                </summary>
                <pre style={{
                  marginTop: 8, padding: 8, fontSize: 11,
                  background: "#fafafa", borderRadius: 4,
                  overflowX: "auto", maxHeight: 260,
                }}>
                  {JSON.stringify(r.previewRows, null, 2)}
                </pre>
              </details>
            )}

            {/* Parse errors */}
            {isOk && r.parseErrors && r.parseErrors.length > 0 && (
              <details style={{ padding: "8px 16px" }}>
                <summary style={{ fontSize: 11, color: "#b45309", cursor: "pointer" }}>
                  {r.parseErrors.length} parse error(s) / warnings (click to expand)
                </summary>
                <pre style={{
                  marginTop: 8, padding: 8, fontSize: 11,
                  background: "#fffbeb", borderRadius: 4,
                  overflowX: "auto", maxHeight: 200,
                }}>
                  {r.parseErrors.map(e => `[${e.severity.toUpperCase()}] row ${e.rowIndex}: ${e.error}`).join("\n")}
                </pre>
              </details>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function Pill({ label, value, color = "#374151" }: { label: string; value?: string; color?: string }) {
  return (
    <span style={{ fontSize: 11, color }}>
      <span style={{ opacity: 0.6 }}>{label}: </span>
      <b>{value}</b>
    </span>
  );
}

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}
