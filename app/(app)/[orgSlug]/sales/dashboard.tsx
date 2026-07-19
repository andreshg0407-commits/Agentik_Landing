/**
 * Executive Sales Dashboard — server component.
 * Rendered above the debug section in /[orgSlug]/sales.
 */

import Link         from "next/link";
import type { ReactNode } from "react";
import {
  getDashboardKpis,
  getLineaMix,
  getTopClientes,
  getComparativoAnoMes,
  getBranchesSummary,
  getChannelsSummary,
  type DashboardKpis,
  type LineaMixRow,
  type TopClienteRow,
  type ComparativoRow,
  type BranchSummaryRow,
  type ChannelSummaryRow,
} from "@/lib/sales/reports";
import { getUnifiedCommercialKpis } from "@/lib/commercial-ledger/service";
import type { CommercialKpis } from "@/lib/commercial-ledger/types";

// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  orgId:         string;
  orgSlug:       string;
  currentPeriod: string;  // YYYYMM — "mes actual" for KPIs / line mix / top clients
  trendStart:    string;  // YYYYMM — start of monthly trend range
  trendEnd:      string;  // YYYYMM — end of monthly trend range
}

type TrendRow = ComparativoRow & { growthVsPrev: number | null };

// ─────────────────────────────────────────────────────────────────────────────

export default async function SalesDashboard({
  orgId,
  orgSlug,
  currentPeriod,
  trendStart,
  trendEnd,
}: Props) {
  // Parallel queries — allSettled so one failure doesn't break the page
  const [kpisR, lineasR, clientesR, trendR, ledgerKpisR, branchesR, channelsR] = await Promise.allSettled([
    getDashboardKpis(orgId, currentPeriod),
    getLineaMix(orgId, currentPeriod),
    getTopClientes(orgId, currentPeriod, 10),
    getComparativoAnoMes(orgId, trendStart, trendEnd),
    getUnifiedCommercialKpis(orgId),
    getBranchesSummary(orgId, currentPeriod, currentPeriod),
    getChannelsSummary(orgId, currentPeriod, currentPeriod),
  ]);

  const kpis       = kpisR.status      === "fulfilled" ? kpisR.value      : null;
  const lineas     = lineasR.status    === "fulfilled" ? lineasR.value    : [];
  const clientes   = clientesR.status  === "fulfilled" ? clientesR.value  : [];
  const rawTrend   = trendR.status     === "fulfilled" ? trendR.value     : [];
  const ledgerKpis: CommercialKpis | null = ledgerKpisR.status === "fulfilled" ? ledgerKpisR.value : null;
  const branches:  BranchSummaryRow[]  = branchesR.status  === "fulfilled" ? branchesR.value  : [];
  const channels:  ChannelSummaryRow[] = channelsR.status  === "fulfilled" ? channelsR.value  : [];

  // Month-over-month growth (computed in TS from sorted active rows)
  const trendActive = rawTrend.filter(r => r.totalAmount > 0);
  const trend: TrendRow[] = trendActive.map((r, i) => {
    const prev = trendActive[i - 1];
    const growth =
      prev && prev.totalAmount > 0
        ? Math.round(((r.totalAmount - prev.totalAmount) / prev.totalAmount) * 10000) / 100
        : null;
    return { ...r, growthVsPrev: growth };
  });

  const periodLabel = fmtPeriodo(currentPeriod);
  const trendLabel  = `${trendStart.slice(0,4)} – ${trendEnd.slice(0,4)}`;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "monospace", marginBottom: 48 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 20 }}>
        <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
          Panel Ejecutivo
        </h2>
        <span style={{
          fontSize: 11, background: "#111", color: "#fff",
          padding: "2px 10px", borderRadius: 4, fontWeight: 700,
          letterSpacing: "0.03em",
        }}>
          {periodLabel}
        </span>
        {kpisR.status === "rejected" && (
          <span style={{ fontSize: 11, color: "#991b1b", marginLeft: 8 }}>
            ⚠ Error al cargar KPIs
          </span>
        )}
      </div>

      {/* ── KPI cards (6 × 2 rows of 3) ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 12,
        marginBottom: 24,
      }}>
        <KpiCard
          label="Ventas mes actual"
          value={kpis ? fmtCOP(kpis.ventasMesActual) : "—"}
        />
        <KpiCard
          label="Pedidos"
          value={kpis?.pedidosMesActual != null ? fmtN(kpis.pedidosMesActual) : "—"}
        />
        <KpiCard
          label="Ticket promedio"
          value={kpis?.ticketPromedio != null ? fmtCOP(kpis.ticketPromedio) : "—"}
        />
        <KpiCard
          label="Clientes únicos"
          value={kpis ? fmtN(kpis.clientesUnicos) : "—"}
        />
        <KpiCard
          label="Top línea"
          value={kpis?.topLinea ?? "—"}
          sub={kpis?.topLinea ? fmtCOP(kpis.topLineaAmount) : undefined}
          href={kpis?.topLinea
            ? `/${orgSlug}/sales/lines/${encodeURIComponent(kpis.topLinea)}?period=${currentPeriod}`
            : undefined}
        />
        <KpiCard
          label="Top vendedor"
          value={kpis?.topVendedor ?? "—"}
          sub={kpis?.topVendedor ? fmtCOP(kpis.topVendedorAmount) : undefined}
          href={kpis?.topVendedorSlug
            ? `/${orgSlug}/sales/vendors/${kpis.topVendedorSlug}?period=${currentPeriod}`
            : undefined}
        />
      </div>

      {/* ── Unified commercial ledger KPIs ── */}
      {ledgerKpis && (
        <>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            marginBottom: 12,
          }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>Ledger Comercial Unificado</span>
            <span style={{
              fontSize: 10, background: "#ede9fe", color: "#6d28d9",
              padding: "2px 8px", borderRadius: 4, fontWeight: 700,
            }}>
              CRM · SAG · XML
            </span>
            {ledgerKpisR.status === "rejected" && (
              <span style={{ fontSize: 11, color: "#991b1b" }}>⚠ Error al cargar</span>
            )}
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginBottom: 28,
          }}>
            <KpiCard
              label="Total ordenado (CRM)"
              value={fmtCOP(ledgerKpis.totalOrdered)}
              sub={`${fmtN(ledgerKpis.quoteCount)} pedidos / cotizaciones`}
            />
            <KpiCard
              label="Total facturado (SAG)"
              value={fmtCOP(ledgerKpis.totalInvoiced)}
              sub={`${fmtN(ledgerKpis.openInvoiceCount)} facturas abiertas`}
            />
            <KpiCard
              label="Total cobrado"
              value={fmtCOP(ledgerKpis.totalCollected)}
              sub={ledgerKpis.collectionRate != null ? `${ledgerKpis.collectionRate.toFixed(1)}% tasa de cobro` : undefined}
            />
            <KpiCard
              label="Saldo pendiente"
              value={fmtCOP(ledgerKpis.totalOutstanding)}
            />
            <KpiCard
              label="Cartera vencida"
              value={fmtCOP(ledgerKpis.totalOverdue)}
            />
            <KpiCard
              label="Tasa de cobro"
              value={ledgerKpis.collectionRate != null ? `${ledgerKpis.collectionRate.toFixed(1)}%` : "—"}
              sub={ledgerKpis.totalInvoiced > 0 ? `sobre ${fmtCOP(ledgerKpis.totalInvoiced)} facturado` : undefined}
            />
          </div>

          {/* ── CRM → SAG pipeline row ── */}
          <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 700, color: "#6d28d9", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Pipeline CRM → SAG
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 12,
            marginBottom: 28,
          }}>
            <KpiCard
              label="Pendiente SAG"
              value={fmtCOP(ledgerKpis.pendingToSagAmount)}
              sub={`${fmtN(ledgerKpis.pendingToSag)} cotizaciones sin sincronizar`}
            />
            <KpiCard
              label="En SAG sin facturar"
              value={fmtCOP(ledgerKpis.notInvoicedAmount)}
              sub={`${fmtN(ledgerKpis.notInvoiced)} pedidos pendientes de factura`}
            />
            <KpiCard
              label="Cotizaciones aceptadas"
              value={fmtCOP(ledgerKpis.acceptedAmount)}
              sub={`${fmtN(ledgerKpis.acceptedQuotes)} cotizaciones aceptadas`}
            />
          </div>
        </>
      )}

      {/* ── Two-column: trend + line mix ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 16,
        marginBottom: 16,
      }}>

        {/* Monthly trend */}
        <Section title="Tendencia mensual" subtitle={trendLabel} error={trendR.status === "rejected" ? (trendR.reason as Error).message : null}>
          {trend.length === 0 ? <EmptyState /> : (
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Periodo</TH>
                  <TH right>Ventas</TH>
                  <TH right>Pedidos</TH>
                  <TH right>∆ MoM</TH>
                </tr>
              </thead>
              <tbody>
                {trend.map((r, i) => (
                  <tr key={r.periodo} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD bold={r.periodo === currentPeriod}>
                      <Link
                        href={`/${orgSlug}/sales/vendors?period=${r.periodo}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {fmtPeriodo(r.periodo)}
                      </Link>
                    </TD>
                    <TD right>{fmtCOP(r.totalAmount)}</TD>
                    <TD right>{r.txCount != null ? fmtN(r.txCount) : "—"}</TD>
                    <TD right>
                      {r.growthVsPrev != null
                        ? <GrowthBadge pct={r.growthVsPrev} />
                        : <span style={{ color: "#ccc" }}>—</span>
                      }
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Line mix */}
        <Section
          title="Mix por línea"
          subtitle={periodLabel}
          error={lineasR.status === "rejected" ? (lineasR.reason as Error).message : null}
          viewAllHref={`/${orgSlug}/sales/lines?period=${currentPeriod}`}
        >
          {lineas.length === 0 ? <EmptyState /> : (
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Línea</TH>
                  <TH right>Ventas</TH>
                  <TH right>Pedidos</TH>
                  <TH right>Ticket</TH>
                  <TH right>%</TH>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={l.linea} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD>
                      <Link
                        href={`/${orgSlug}/sales/lines/${encodeURIComponent(l.linea)}?period=${currentPeriod}`}
                        style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}
                      >
                        {l.linea}
                      </Link>
                    </TD>
                    <TD right>{fmtCOP(l.ventas)}</TD>
                    <TD right>{l.pedidos != null ? fmtN(l.pedidos) : "—"}</TD>
                    <TD right>{l.ticketProm != null ? fmtCOP(l.ticketProm) : "—"}</TD>
                    <TD right>
                      <ShareBar share={l.share} />
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

      </div>

      {/* ── Dimension summary: branches + channels ── */}
      {(branches.length > 0 || channels.length > 0) && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}>
          {/* Top branches for current period */}
          <Section
            title="Sucursales activas"
            subtitle={periodLabel}
            error={branchesR.status === "rejected" ? (branchesR.reason as Error).message : null}
            viewAllHref={`/${orgSlug}/sales/branches?period=${currentPeriod}`}
          >
            {branches.length === 0 ? <EmptyState /> : (
              <table style={TABLE}>
                <thead>
                  <tr style={THEAD_ROW}>
                    <TH>Sucursal</TH>
                    <TH right>Ventas</TH>
                    <TH right>%</TH>
                  </tr>
                </thead>
                <tbody>
                  {branches.slice(0, 5).map((b, i) => (
                    <tr key={b.storeSlug} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <TD>
                        <Link
                          href={`/${orgSlug}/sales/branches/${b.storeSlug}?period=${currentPeriod}`}
                          style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}
                        >
                          {b.storeName}
                        </Link>
                      </TD>
                      <TD right>{fmtCOP(b.totalAmount)}</TD>
                      <TD right>
                        <ShareBar share={b.share} />
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Channel distribution for current period */}
          <Section
            title="Canales de venta"
            subtitle={periodLabel}
            error={channelsR.status === "rejected" ? (channelsR.reason as Error).message : null}
            viewAllHref={`/${orgSlug}/sales/channels?period=${currentPeriod}`}
          >
            {channels.length === 0 ? <EmptyState /> : (
              <table style={TABLE}>
                <thead>
                  <tr style={THEAD_ROW}>
                    <TH>Canal</TH>
                    <TH right>Ventas</TH>
                    <TH right>%</TH>
                  </tr>
                </thead>
                <tbody>
                  {channels.map((c, i) => {
                    const LABELS: Record<string, string> = {
                      TIENDA: "🏪 Tienda física", ONLINE: "💻 Online",
                      TELEFONO: "📞 Telefónica", DISTRIBUIDOR: "🚚 Distribuidor",
                      MAYORISTA: "📦 Mayorista", OTRO: "❓ Otro",
                    };
                    return (
                      <tr key={c.channel} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <TD bold>{LABELS[c.channel] ?? c.channel}</TD>
                        <TD right>{fmtCOP(c.totalAmount)}</TD>
                        <TD right>
                          <ShareBar share={c.share} />
                        </TD>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Section>
        </div>
      )}

      {/* ── Top customers ── */}
      <Section
        title="Top 10 clientes"
        subtitle={periodLabel}
        error={clientesR.status === "rejected" ? (clientesR.reason as Error).message : null}
        viewAllHref={`/${orgSlug}/sales/customers?period=${currentPeriod}`}
      >
        {clientes.length === 0 ? <EmptyState /> : (
          <table style={TABLE}>
            <thead>
              <tr style={THEAD_ROW}>
                <TH>#</TH>
                <TH>Cliente</TH>
                <TH>NIT</TH>
                <TH right>Ventas</TH>
                <TH right>Pedidos</TH>
                <TH right>Última fecha</TH>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c, i) => {
                const customerSlug = encodeURIComponent(c.customerNit ?? c.customerName);
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD>
                      <span style={{ color: "#bbb", fontSize: 11 }}>{i + 1}</span>
                    </TD>
                    <TD bold>
                      <Link
                        href={`/${orgSlug}/sales/customers/${customerSlug}?period=${currentPeriod}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {c.customerName}
                      </Link>
                    </TD>
                    <TD>{c.customerNit ?? <span style={{ color: "#ccc" }}>—</span>}</TD>
                    <TD right>{fmtCOP(c.ventas)}</TD>
                    <TD right>{c.pedidos != null ? fmtN(c.pedidos) : "—"}</TD>
                    <TD right>
                      <span style={{ color: "#666" }}>{c.ultimaFecha}</span>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, href }: { label: string; value: string; sub?: string; href?: string }) {
  const inner = (
    <div style={{
      border: "1px solid #ddd", borderRadius: 6,
      padding: "14px 18px", background: "#fff",
      transition: "border-color 0.15s",
      textDecoration: "none", display: "block",
    }}>
      <div style={{
        fontSize: 10, color: "#888", fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.06em",
        marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#111", lineHeight: 1.2, display: "flex", alignItems: "center", gap: 6 }}>
        {value}
        {href && <span style={{ fontSize: 12, color: "#aaa" }}>→</span>}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>{sub}</div>
      )}
    </div>
  );
  if (href) return <Link href={href} style={{ textDecoration: "none" }}>{inner}</Link>;
  return inner;
}

function Section({
  title, subtitle, children, error, viewAllHref,
}: {
  title: string; subtitle: string; children: ReactNode; error: string | null; viewAllHref?: string;
}) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 6, overflow: "hidden" }}>
      <div style={{
        padding: "9px 14px", borderBottom: "1px solid #ddd",
        background: error ? "#fff0f0" : "#f5f5f5",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{title}</span>
        <span style={{ fontSize: 11, color: "#888" }}>{subtitle}</span>
        {viewAllHref && (
          <Link
            href={viewAllHref}
            style={{
              marginLeft: "auto", fontSize: 11, color: "#6d28d9",
              textDecoration: "none", fontWeight: 600,
            }}
          >
            Ver todas →
          </Link>
        )}
      </div>
      {error && (
        <div style={{
          padding: "6px 14px", fontSize: 12, color: "#991b1b",
          background: "#fff0f0", borderBottom: "1px solid #fca5a5",
        }}>
          {error}
        </div>
      )}
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ padding: "14px 16px", fontSize: 12, color: "#aaa", background: "#fafafa" }}>
      Sin datos para este período.
    </div>
  );
}

function GrowthBadge({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700,
      color: up ? "#15803d" : "#dc2626",
    }}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function ShareBar({ share }: { share: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{
        display: "inline-block", height: 6, width: Math.max(2, share * 0.8),
        background: "#7c3aed", borderRadius: 2, verticalAlign: "middle",
      }} />
      <span style={{ fontSize: 11 }}>{share.toFixed(1)}%</span>
    </span>
  );
}

// ── Table primitives ──────────────────────────────────────────────────────────

const TABLE: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
const THEAD_ROW: React.CSSProperties = { borderBottom: "1px solid #eee", background: "#fafafa" };

function TH({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th style={{
      padding: "6px 14px", textAlign: right ? "right" : "left",
      fontWeight: 600, color: "#777", fontSize: 11,
    }}>
      {children}
    </th>
  );
}

function TD({ children, right, bold }: { children: ReactNode; right?: boolean; bold?: boolean }) {
  return (
    <td style={{
      padding: "7px 14px", textAlign: right ? "right" : "left",
      fontWeight: bold ? 600 : 400, color: "#111",
      borderBottom: "1px solid #f5f5f5",
    }}>
      {children}
    </td>
  );
}

// ── Formatters ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtPeriodo(p: string): string {
  const m = Number(p.slice(4));
  return `${MONTH_NAMES[m] ?? p.slice(4)} ${p.slice(0, 4)}`;
}

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function fmtN(n: number): string {
  return new Intl.NumberFormat("es-CO").format(n);
}
