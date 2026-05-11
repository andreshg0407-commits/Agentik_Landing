"use client";

import { useState, useEffect, useMemo } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";

export type ApRowSerial = {
  id:              string;
  comprobanteCode: string;
  customerName:    string | null;
  comprobante:     string | null;
  saleDate:        string;   // ISO string
  amount:          number;
};

interface Props {
  records:       ApRowSerial[];
  initialSearch: string;
  initialTipo:   string;
  fmtCOP:        (n: number) => string;
}

// Known AP document type codes
const TIPO_CHIPS = ["C1", "G1", "C2"];

export function CuentasPorPagarTableClient({ records, initialSearch, initialTipo, fmtCOP }: Props) {
  const [search, setSearch] = useState(initialSearch);
  const [tipo,   setTipo]   = useState(initialTipo);

  // Persist state to URL silently
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (search) params.set("q", search); else params.delete("q");
    if (tipo)   params.set("f", tipo);   else params.delete("f");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [search, tipo]);

  // Only show chips for doc types present in the data
  const presentTipos = useMemo(() => {
    const s = new Set(records.map(r => r.comprobanteCode));
    return TIPO_CHIPS.filter(t => s.has(t));
  }, [records]);

  const filtered = useMemo(() => records.filter(r => {
    const q = search.toLowerCase().trim();
    if (q && !(
      r.customerName?.toLowerCase().includes(q) ||
      r.comprobante?.toLowerCase().includes(q) ||
      r.comprobanteCode.toLowerCase().includes(q)
    )) return false;
    if (tipo && r.comprobanteCode !== tipo) return false;
    return true;
  }), [records, search, tipo]);

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
        Sin documentos de cuentas por pagar registrados.
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
          placeholder="Buscar proveedor o referencia…"
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
        {presentTipos.map(t => (
          <button
            key={t}
            onClick={() => setTipo(tipo === t ? "" : t)}
            style={{
              fontFamily:   T.mono,
              fontSize:     T.sz["2xs"],
              fontWeight:   T.wt.semibold,
              padding:      `3px ${S[2]}px`,
              borderRadius: R.pill,
              border:       `1px solid ${tipo === t ? C.blue : C.line}`,
              background:   tipo === t ? `${C.blue}15` : "transparent",
              color:        tipo === t ? C.blue : C.inkMid,
              cursor:       "pointer",
              transition:   "background 0.1s, border-color 0.1s",
            }}
          >
            {t}
          </button>
        ))}
        {(search || tipo) && (
          <button
            onClick={() => { setSearch(""); setTipo(""); }}
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
      {(search || tipo) && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginBottom: S[2] }}>
          {filtered.length} de {records.length} documentos
        </div>
      )}

      {/* Table */}
      <div className="ag-op-table">
        <div className="ag-op-table-head" style={{
          display:             "grid",
          gridTemplateColumns: "80px 2fr 1.5fr 1fr 1fr",
          padding:             `${S[2]}px ${S[4]}px`,
        }}>
          {["Tipo", "Proveedor", "Referencia", "Fecha doc", "Monto"].map(h => (
            <div key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
              {h}
            </div>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: S[8], textAlign: "center", fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight }}>
            Sin resultados para &ldquo;{search}{tipo ? ` · ${tipo}` : ""}&rdquo;
          </div>
        ) : filtered.map((r, i) => (
          <div key={r.id} className="ag-op-row" style={{
            display:             "grid",
            gridTemplateColumns: "80px 2fr 1.5fr 1fr 1fr",
            padding:             `${S[2]}px ${S[4]}px`,
            background:          i % 2 === 0 ? C.white : C.surface,
            borderBottom:        i < filtered.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
            alignItems:          "center",
          }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.blue, fontWeight: T.wt.semibold }}>{r.comprobanteCode}</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{r.customerName ?? "—"}</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>{r.comprobante ?? "—"}</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
              {new Date(r.saleDate).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "2-digit" })}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: r.amount > 0 ? C.inkMid : C.inkGhost, fontStyle: r.amount === 0 ? "italic" : "normal" }}>
              {r.amount > 0 ? fmtCOP(r.amount) : "sin monto SOAP"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
