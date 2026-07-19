"use client";

/**
 * Data Explorer client component.
 *
 * Interactive filter form, dataset tab selector, KPI cards, CSV export,
 * and results table for the Data Explorer page. All styling is inline
 * monospace enterprise style — no Tailwind classes.
 */

import type { CSSProperties, ReactNode } from "react";
import type {
  ExplorerDataset,
  ExplorerFilters,
  ExplorerKpis,
  FilterOptions,
  DatasetRow,
  SalesRow,
  CustomerRow,
  LineMixRow,
} from "@/lib/sales/data-explorer";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug:       string;
  dataset:       ExplorerDataset;
  filters:       ExplorerFilters;
  data:          DatasetRow[];
  kpis:          ExplorerKpis;
  filterOptions: FilterOptions;
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

// ── Dataset labels ────────────────────────────────────────────────────────────

const DATASET_LABELS: Record<ExplorerDataset, string> = {
  sales:     "Ventas",
  orders:    "Pedidos SAG",
  customers: "Clientes",
  line_mix:  "Mix Líneas",
};

const DATASET_DESC: Record<ExplorerDataset, string> = {
  sales:     "Todos los registros (todas las fuentes y granos)",
  orders:    "Registros de pedidos SAG agrupados (grain=AGGREGATED)",
  customers: "Clientes únicos agrupados por ventas totales",
  line_mix:  "Participación por línea de producto",
};

// ── CSV export ────────────────────────────────────────────────────────────────

function exportToCsv(data: DatasetRow[], dataset: ExplorerDataset): void {
  let header: string;
  let rows: string[][];

  if (dataset === "sales" || dataset === "orders") {
    header = "ID,Fecha,Periodo,Vendedor,Tienda,Linea,Canal,Monto,Pedidos,Cliente,NIT";
    rows = (data as SalesRow[]).map(r => [
      r.id,
      r.saleDate,
      r.periodoAoMes ?? "",
      r.sellerName,
      r.storeName,
      r.productLine,
      r.channel,
      String(r.amount),
      r.txCount != null ? String(r.txCount) : "",
      r.customerName ?? "",
      r.customerNit  ?? "",
    ]);
  } else if (dataset === "customers") {
    header = "Cliente,NIT,Ventas,Pedidos,Ticket Prom,Ultima Fecha,Periodos";
    rows = (data as CustomerRow[]).map(r => [
      r.customerName,
      r.customerNit ?? "",
      String(r.totalVentas),
      r.totalPedidos != null ? String(r.totalPedidos) : "",
      r.avgTicket    != null ? String(r.avgTicket)    : "",
      r.ultimaFecha,
      String(r.periodos),
    ]);
  } else {
    header = "Linea,Ventas,Pedidos,Ticket Prom,Share %";
    rows = (data as LineMixRow[]).map(r => [
      r.productLine,
      String(r.ventas),
      r.pedidos  != null ? String(r.pedidos)  : "",
      r.avgTicket != null ? String(r.avgTicket) : "",
      r.share.toFixed(2),
    ]);
  }

  const csvContent = [
    header,
    ...rows.map(row =>
      row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  const dateSuffix = new Date().toISOString().slice(0, 10);
  link.download = `agentik_${dataset}_${dateSuffix}.csv`;
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

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      border: "1px solid #ddd",
      borderRadius: 6,
      padding: "14px 18px",
      background: "#fff",
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
      <div style={{ fontSize: 20, fontWeight: 700, color: "#111", lineHeight: 1.2 }}>
        {value}
      </div>
    </div>
  );
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 6, overflow: "hidden" }}>
      <div style={{
        padding: "9px 14px",
        borderBottom: "1px solid #ddd",
        background: "#f5f5f5",
      }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ExplorerClient({
  orgSlug,
  dataset,
  filters,
  data,
  kpis,
  filterOptions,
}: Props) {
  const DATASETS: ExplorerDataset[] = ["sales", "orders", "customers", "line_mix"];
  const baseUrl = `/${orgSlug}/data-explorer`;

  const activeFilterCount = [
    filters.period,
    filters.seller,
    filters.customer,
    filters.productLine,
    filters.channel,
    filters.q,
    filters.amountMin != null ? String(filters.amountMin) : undefined,
    filters.amountMax != null ? String(filters.amountMax) : undefined,
  ].filter(Boolean).length;

  return (
    <div style={{ fontFamily: "monospace", maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
        <a href={`/${orgSlug}/sales`} style={{ fontSize: 11, color: "#888", textDecoration: "none", fontFamily: "monospace" }}>← Control Comercial</a>
        <span style={{ color: "#ccc" }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>Explorador de Datos</h1>
        <span style={{
          fontSize: 11,
          background: "#111",
          color: "#fff",
          padding: "2px 10px",
          borderRadius: 4,
          fontWeight: 700,
          letterSpacing: "0.03em",
        }}>
          {DATASET_LABELS[dataset]}
        </span>
      </div>

      {/* ── Dataset tabs ── */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {DATASETS.map(ds => {
          const active = ds === dataset;
          return (
            <a
              key={ds}
              href={`${baseUrl}?dataset=${ds}`}
              style={{
                padding: "6px 16px",
                fontSize: 12,
                fontWeight: active ? 700 : 400,
                border: "1px solid #ddd",
                borderRadius: 4,
                background: active ? "#111" : "#fff",
                color: active ? "#fff" : "#333",
                textDecoration: "none",
                fontFamily: "monospace",
                cursor: "pointer",
              }}
            >
              {DATASET_LABELS[ds]}
            </a>
          );
        })}
      </div>

      {/* ── Dataset description ── */}
      <div style={{ fontSize: 11, color: "#888", marginBottom: 16, fontFamily: "monospace" }}>
        {DATASET_DESC[dataset]}
      </div>

      {/* ── Filter form ── */}
      <div style={{ border: "1px solid #ddd", borderRadius: 6, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "9px 14px", borderBottom: "1px solid #ddd", background: "#f5f5f5", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Filtros</span>
          {activeFilterCount > 0 && (
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              background: "#111",
              color: "#fff",
              padding: "1px 7px",
              borderRadius: 10,
              fontFamily: "monospace",
            }}>
              {activeFilterCount} activo{activeFilterCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <form method="GET" action={baseUrl} style={{ padding: "14px 16px" }}>
          <input type="hidden" name="dataset" value={dataset} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>

            {/* Period */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                Periodo
              </label>
              <select
                name="period"
                defaultValue={filters.period ?? ""}
                style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, fontFamily: "monospace" }}
              >
                <option value="">Todos</option>
                {filterOptions.periods.map(p => (
                  <option key={p} value={p}>{fmtPeriodo(p)}</option>
                ))}
              </select>
            </div>

            {/* Seller */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                Vendedor
              </label>
              <select
                name="seller"
                defaultValue={filters.seller ?? ""}
                style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, fontFamily: "monospace" }}
              >
                <option value="">Todos</option>
                {filterOptions.sellers.map(s => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Product line */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                Linea
              </label>
              <select
                name="productLine"
                defaultValue={filters.productLine ?? ""}
                style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, fontFamily: "monospace" }}
              >
                <option value="">Todas</option>
                {filterOptions.productLines.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            {/* Channel */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                Canal
              </label>
              <select
                name="channel"
                defaultValue={filters.channel ?? ""}
                style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, fontFamily: "monospace" }}
              >
                <option value="">Todos</option>
                {filterOptions.channels.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>

            {/* Customer */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                Cliente
              </label>
              <input
                type="text"
                name="customer"
                defaultValue={filters.customer ?? ""}
                style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, fontFamily: "monospace", boxSizing: "border-box" }}
                placeholder="nombre cliente..."
              />
            </div>

            {/* Q / free text */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                Buscar
              </label>
              <input
                type="text"
                name="q"
                defaultValue={filters.q ?? ""}
                style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, fontFamily: "monospace", boxSizing: "border-box" }}
                placeholder="buscar..."
              />
            </div>

            {/* Amount min */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                Monto min
              </label>
              <input
                type="number"
                name="amountMin"
                defaultValue={filters.amountMin ?? ""}
                style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, fontFamily: "monospace", boxSizing: "border-box" }}
              />
            </div>

            {/* Amount max */}
            <div>
              <label style={{ display: "block", fontSize: 10, color: "#888", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>
                Monto max
              </label>
              <input
                type="number"
                name="amountMax"
                defaultValue={filters.amountMax ?? ""}
                style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #ddd", borderRadius: 4, fontFamily: "monospace", boxSizing: "border-box" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
              Aplicar
            </button>
            <a
              href={`${baseUrl}?dataset=${dataset}`}
              style={{ fontSize: 12, color: "#666", textDecoration: "none", fontFamily: "monospace" }}
            >
              Limpiar
            </a>
          </div>
        </form>
      </div>

      {/* ── KPI row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Total Ventas"     value={fmtCOP(kpis.totalSales)} />
        <KpiCard label="Pedidos"          value={kpis.totalOrders != null ? fmtN(kpis.totalOrders) : "—"} />
        <KpiCard label="Clientes Unicos"  value={fmtN(kpis.uniqueCustomers)} />
        <KpiCard label="Ticket Promedio"  value={kpis.avgTicket != null ? fmtCOP(kpis.avgTicket) : "—"} />
      </div>

      {/* ── Results table ── */}
      <Section title={`Resultados — ${data.length} filas (max 500)`}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 14px", borderBottom: "1px solid #eee" }}>
          <button
            onClick={() => exportToCsv(data, dataset)}
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

        {data.length === 0 ? (
          <div style={{ padding: "14px 16px", fontSize: 12, color: "#aaa", background: "#fafafa" }}>
            Sin resultados para los filtros seleccionados.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            {(dataset === "sales" || dataset === "orders") && (
              <table style={TABLE}>
                <thead>
                  <tr style={THEAD_ROW}>
                    <TH>Fecha</TH>
                    <TH>Periodo</TH>
                    <TH>Vendedor</TH>
                    <TH>Tienda</TH>
                    <TH>Linea</TH>
                    <TH>Canal</TH>
                    <TH right>Monto</TH>
                    <TH right>Pedidos</TH>
                    <TH>Cliente</TH>
                  </tr>
                </thead>
                <tbody>
                  {(data as SalesRow[]).map((r, i) => (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <TD>{r.saleDate}</TD>
                      <TD>{r.periodoAoMes ? fmtPeriodo(r.periodoAoMes) : <span style={{ color: "#ccc" }}>—</span>}</TD>
                      <TD bold>{r.sellerName}</TD>
                      <TD><span style={{ color: "#555" }}>{r.storeName}</span></TD>
                      <TD>{r.productLine}</TD>
                      <TD>{r.channel}</TD>
                      <TD right>{fmtCOP(r.amount)}</TD>
                      <TD right>{r.txCount != null ? fmtN(r.txCount) : <span style={{ color: "#ccc" }}>—</span>}</TD>
                      <TD>{r.customerName ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {dataset === "customers" && (
              <table style={TABLE}>
                <thead>
                  <tr style={THEAD_ROW}>
                    <TH>Cliente</TH>
                    <TH>NIT</TH>
                    <TH right>Ventas</TH>
                    <TH right>Pedidos</TH>
                    <TH right>Ticket Prom.</TH>
                    <TH right>Ultima Fecha</TH>
                    <TH right>Periodos</TH>
                  </tr>
                </thead>
                <tbody>
                  {(data as CustomerRow[]).map((r, i) => (
                    <tr key={r.customerName} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <TD bold>{r.customerName}</TD>
                      <TD>{r.customerNit ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                      <TD right>{fmtCOP(r.totalVentas)}</TD>
                      <TD right>{r.totalPedidos != null ? fmtN(r.totalPedidos) : <span style={{ color: "#ccc" }}>—</span>}</TD>
                      <TD right>{r.avgTicket != null ? fmtCOP(r.avgTicket) : <span style={{ color: "#ccc" }}>—</span>}</TD>
                      <TD right><span style={{ color: "#666" }}>{r.ultimaFecha}</span></TD>
                      <TD right>{r.periodos}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {dataset === "line_mix" && (
              <table style={TABLE}>
                <thead>
                  <tr style={THEAD_ROW}>
                    <TH>Linea</TH>
                    <TH right>Ventas</TH>
                    <TH right>Pedidos</TH>
                    <TH right>Ticket Prom.</TH>
                    <TH right>Share %</TH>
                  </tr>
                </thead>
                <tbody>
                  {(data as LineMixRow[]).map((r, i) => (
                    <tr key={r.productLine} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <TD bold>{r.productLine}</TD>
                      <TD right>{fmtCOP(r.ventas)}</TD>
                      <TD right>{r.pedidos != null ? fmtN(r.pedidos) : <span style={{ color: "#ccc" }}>—</span>}</TD>
                      <TD right>{r.avgTicket != null ? fmtCOP(r.avgTicket) : <span style={{ color: "#ccc" }}>—</span>}</TD>
                      <TD right>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            display: "inline-block",
                            height: 6,
                            width: Math.max(2, r.share * 0.8),
                            background: "#7c3aed",
                            borderRadius: 2,
                            verticalAlign: "middle",
                          }} />
                          <span style={{ fontSize: 11 }}>{r.share.toFixed(1)}%</span>
                        </span>
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
