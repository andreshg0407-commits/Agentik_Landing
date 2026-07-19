"use client";

import { useState, useEffect, useMemo } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";

export type CollectionRowSerial = {
  id:               string;
  comprobanteCode:  string;
  customerName:     string | null;
  documentNumber:   string | null;
  collectionDate:   string;   // ISO string
  amount:           number;
};

interface Props {
  records:       CollectionRowSerial[];
  initialSearch: string;
  initialFuente: string;
  fmtCOP:        (n: number) => string;
}

export function CobrosHoyTableClient({ records, initialSearch, initialFuente, fmtCOP }: Props) {
  const [search, setSearch] = useState(initialSearch);
  const [fuente, setFuente] = useState(initialFuente);

  // Unique source codes for filter chips
  const fuentes = useMemo(() => {
    const s = new Set(records.map(r => r.comprobanteCode).filter(Boolean));
    return Array.from(s).sort();
  }, [records]);

  // Persist state to URL silently
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (search) params.set("q", search); else params.delete("q");
    if (fuente) params.set("f", fuente); else params.delete("f");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [search, fuente]);

  const filtered = useMemo(() => records.filter(r => {
    const q = search.toLowerCase().trim();
    if (q && !(
      r.customerName?.toLowerCase().includes(q) ||
      r.documentNumber?.toLowerCase().includes(q) ||
      r.comprobanteCode.toLowerCase().includes(q)
    )) return false;
    if (fuente && r.comprobanteCode !== fuente) return false;
    return true;
  }), [records, search, fuente]);

  if (records.length === 0) {
    return (
      <div style={{
        padding:      S[10],
        textAlign:    "center",
        color:        C.inkLight,
        fontFamily:   T.mono,
        fontSize:     T.sz.sm,
        border:       `1px solid ${C.line}`,
        borderRadius: R.xl,
      }}>
        Sin cobros registrados para este día operativo.
      </div>
    );
  }

  return (
    <div>
      {/* Search + filter bar */}
      <div style={{
        display:      "flex",
        alignItems:   "center",
        gap:          S[2],
        marginBottom: S[3],
        flexWrap:     "wrap" as const,
      }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar tercero o comprobante…"
          className="ag-op-search"
          style={{
            flex:         "1 1 220px",
            fontFamily:   T.mono,
            fontSize:     T.sz.sm,
            color:        C.ink,
            background:   C.white,
            border:       `1px solid ${C.line}`,
            borderRadius: R.md,
            padding:      `${S[2]}px ${S[3]}px`,
          }}
        />
        {fuentes.map(f => (
          <button
            key={f}
            onClick={() => setFuente(fuente === f ? "" : f)}
            style={{
              fontFamily:   T.mono,
              fontSize:     T.sz["2xs"],
              fontWeight:   T.wt.semibold,
              padding:      `3px ${S[2]}px`,
              borderRadius: R.pill,
              border:       `1px solid ${fuente === f ? C.blue : C.line}`,
              background:   fuente === f ? `${C.blue}15` : "transparent",
              color:        fuente === f ? C.blue : C.inkMid,
              cursor:       "pointer",
              transition:   "background 0.1s, border-color 0.1s",
            }}
          >
            {f}
          </button>
        ))}
        {(search || fuente) && (
          <button
            onClick={() => { setSearch(""); setFuente(""); }}
            style={{
              fontFamily:   T.mono,
              fontSize:     T.sz.xs,
              color:        C.inkLight,
              background:   "transparent",
              border:       "none",
              cursor:       "pointer",
              padding:      `${S[1]}px ${S[2]}px`,
            }}
          >
            Limpiar ×
          </button>
        )}
      </div>

      {/* Results count */}
      {(search || fuente) && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[2] }}>
          {filtered.length} de {records.length} registros
        </div>
      )}

      {/* Table */}
      <div className="ag-op-table">
        <div className="ag-op-table-head" style={{
          display:             "grid",
          gridTemplateColumns: "1fr 1.5fr 2fr 1fr 1fr",
          padding:             `${S[2]}px ${S[4]}px`,
        }}>
          {["Fuente", "Tercero", "Comprobante", "Fecha", "Monto"].map(h => (
            <div key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
              {h}
            </div>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: S[8], textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
            Sin resultados para &ldquo;{search}{fuente ? ` · ${fuente}` : ""}&rdquo;
          </div>
        ) : filtered.map((r, i) => (
          <div key={r.id} className="ag-op-row" style={{
            display:             "grid",
            gridTemplateColumns: "1fr 1.5fr 2fr 1fr 1fr",
            padding:             `${S[2]}px ${S[4]}px`,
            background:          i % 2 === 0 ? C.white : C.surface,
            borderBottom:        i < filtered.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
            alignItems:          "center",
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>{r.comprobanteCode}</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{r.customerName ?? "—"}</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>{r.documentNumber ?? "—"}</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
              {new Date(r.collectionDate).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.green }}>
              {r.amount > 0 ? fmtCOP(r.amount) : "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
