/**
 * /[orgSlug]/sales/branches/[branchSlug] — Single branch detail page.
 *
 * Sections:
 *  1. KPI cards — ventas, pedidos, ticket prom, clientes únicos, vendedores activos
 *  2. Tendencia mensual
 *  3. Top vendedores (linked to /vendors/[sellerSlug])
 *  4. Mix por línea (linked to /lines/[lineSlug])   +   Top clientes (linked to /customers/[slug])
 *
 * Data source: SaleRecord filtered by storeSlug.
 * storeSlug is the stable join key normalised from storeName at SAG import.
 */

import Link                 from "next/link";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getLatestPeriod, getBranchDetail } from "@/lib/sales/reports";
import { periodMinusMonths, isValidPeriod, fmtPeriodo } from "@/lib/sales/period-utils";
import {
  PageShell, PageHeader, KpiGrid, KpiCard, Section,
  Breadcrumb, EmptyState, TrendTable,
  TH, TD, TABLE, THEAD_ROW,
  fmtCOP, fmtN, ShareBar, ActionLink, InfoBar,
} from "../../_components";
import { DownloadCsvButton } from "../../_csv-button";

export default async function BranchDetailPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string; branchSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { orgSlug, branchSlug } = await params;
  const sp                      = await searchParams;
  const { organization }        = await requireOrgAccess(orgSlug);
  const orgId                   = organization.id;

  const latest        = await getLatestPeriod(orgId);
  const currentPeriod = isValidPeriod(sp.period) ? sp.period : latest;
  const trendStart    = periodMinusMonths(currentPeriod, 11);

  const detail = await getBranchDetail(orgId, branchSlug, trendStart, currentPeriod).catch(() => null);

  if (!detail || detail.trend.length === 0) {
    return (
      <PageShell>
        <Breadcrumb crumbs={[
          { label: "Control Comercial", href: `/${orgSlug}/sales` },
          { label: "Sucursales",        href: `/${orgSlug}/sales/branches?period=${currentPeriod}` },
          { label: branchSlug },
        ]} />
        <EmptyState message="Sin datos para esta sucursal en el período seleccionado." />
      </PageShell>
    );
  }

  // ── KPI aggregates ──────────────────────────────────────────────────────────
  const totalVentas  = detail.trend.reduce((s, r) => s + r.totalAmount, 0);
  const totalPedidos = detail.trend.every(r => r.txCount != null)
    ? detail.trend.reduce((s, r) => s + (r.txCount ?? 0), 0)
    : null;

  // ── CSV rows ────────────────────────────────────────────────────────────────
  const vendedoresCsv = detail.topSellers.map(s => [s.sellerName, s.totalAmount, s.txCount ?? "", s.share]);
  const clientesCsv   = detail.topClientes.map(c => [c.customerName, c.customerNit ?? "", c.totalAmount, c.txCount ?? ""]);

  return (
    <PageShell>
      <Breadcrumb crumbs={[
        { label: "Control Comercial", href: `/${orgSlug}/sales` },
        { label: "Sucursales",        href: `/${orgSlug}/sales/branches?period=${currentPeriod}` },
        { label: detail.storeName },
      ]} />

      <PageHeader
        title={detail.storeName}
        badge="Sucursal"
        periodLabel={`${fmtPeriodo(trendStart)} – ${fmtPeriodo(currentPeriod)}`}
        actions={
          <ActionLink href={`/${orgSlug}/reports`} variant="primary">
            ✨ Abrir informe →
          </ActionLink>
        }
      />

      {/* ── KPI cards ── */}
      <KpiGrid>
        <KpiCard
          label="Ventas acumuladas"
          value={fmtCOP(totalVentas)}
          accent
          source="SAG"
          hint="Total de ventas netas registradas en SAG para esta sucursal."
        />
        <KpiCard
          label="Pedidos"
          value={totalPedidos != null ? fmtN(totalPedidos) : "—"}
          source="SAG"
        />
        <KpiCard
          label="Ticket promedio"
          value={totalPedidos && totalPedidos > 0 ? fmtCOP(totalVentas / totalPedidos) : "—"}
          hint="Ventas ÷ pedidos. Valor medio por transacción en la sucursal."
        />
        <KpiCard
          label="Clientes únicos"
          value={fmtN(detail.uniqueCustomers)}
          source="SAG"
          hint="Clientes distintos que compraron en esta sucursal en el período."
        />
        <KpiCard
          label="Vendedores activos"
          value={fmtN(detail.activeSellers)}
          hint="Vendedores con al menos una venta registrada en el período."
        />
        <KpiCard
          label="Última actividad"
          value={detail.lastSaleDate ?? "—"}
          hint="Fecha de la última transacción registrada en SAG para esta sucursal."
        />
      </KpiGrid>

      {/* ── Monthly trend ── */}
      <Section title="Tendencia mensual" subtitle={`${fmtPeriodo(trendStart)} – ${fmtPeriodo(currentPeriod)}`}>
        <TrendTable rows={detail.trend} currentPeriod={currentPeriod} fmtPeriodo={fmtPeriodo} />
      </Section>

      {/* ── Top sellers (full width) ── */}
      <InfoBar>
        Haz clic en el nombre de un vendedor para ver su análisis completo: tendencia, mix de líneas, clientes y cartera.
      </InfoBar>

      <Section title="Vendedores en esta sucursal">
        <div style={{ padding: "8px 14px 4px", display: "flex", justifyContent: "flex-end" }}>
          <DownloadCsvButton
            filename={`vendedores_${branchSlug}.csv`}
            columns={["Vendedor", "Ventas", "Pedidos", "% del total"]}
            rows={vendedoresCsv}
          />
        </div>
        {detail.topSellers.length === 0 ? <EmptyState /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>#</TH>
                  <TH>Vendedor</TH>
                  <TH right>Ventas</TH>
                  <TH right>Pedidos</TH>
                  <TH right>% sucursal</TH>
                  <TH right>{""}</TH>
                </tr>
              </thead>
              <tbody>
                {detail.topSellers.map((s, i) => (
                  <tr key={s.sellerSlug} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD muted>{i + 1}</TD>
                    <TD bold>
                      <Link
                        href={`/${orgSlug}/sales/vendors/${s.sellerSlug}?period=${currentPeriod}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {s.sellerName}
                      </Link>
                    </TD>
                    <TD right>{fmtCOP(s.totalAmount)}</TD>
                    <TD right>{s.txCount != null ? fmtN(s.txCount) : "—"}</TD>
                    <TD right><ShareBar share={s.share} color="#0369a1" /></TD>
                    <TD right>
                      <Link
                        href={`/${orgSlug}/sales/vendors/${s.sellerSlug}?period=${currentPeriod}`}
                        style={{ fontSize: 11, color: "#0369a1", textDecoration: "none", fontWeight: 600 }}
                      >
                        Ver detalle →
                      </Link>
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Two-column: top lines + top clients ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))",
        gap: 16,
        marginBottom: 20,
      }}>
        {/* Product line mix */}
        <Section title="Mix por línea de producto">
          {detail.topLines.length === 0 ? <EmptyState /> : (
            <div style={{ overflowX: "auto" }}>
              <table style={TABLE}>
                <thead>
                  <tr style={THEAD_ROW}>
                    <TH>Línea</TH>
                    <TH right>Ventas</TH>
                    <TH right>Pedidos</TH>
                    <TH right>%</TH>
                  </tr>
                </thead>
                <tbody>
                  {detail.topLines.map((l, i) => (
                    <tr key={l.productLine} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <TD>
                        <Link
                          href={`/${orgSlug}/sales/lines/${encodeURIComponent(l.productLine)}?period=${currentPeriod}`}
                          style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}
                        >
                          {l.productLine}
                        </Link>
                      </TD>
                      <TD right>{fmtCOP(l.totalAmount)}</TD>
                      <TD right>{l.txCount != null ? fmtN(l.txCount) : "—"}</TD>
                      <TD right><ShareBar share={l.share} color="#0369a1" /></TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Top clients */}
        <Section title="Top clientes">
          <div style={{ padding: "8px 14px 4px", display: "flex", justifyContent: "flex-end" }}>
            <DownloadCsvButton
              filename={`clientes_${branchSlug}.csv`}
              columns={["Cliente", "NIT", "Ventas", "Pedidos"]}
              rows={clientesCsv}
            />
          </div>
          {detail.topClientes.length === 0 ? <EmptyState /> : (
            <div style={{ overflowX: "auto" }}>
              <table style={TABLE}>
                <thead>
                  <tr style={THEAD_ROW}>
                    <TH>Cliente</TH>
                    <TH>NIT</TH>
                    <TH right>Ventas</TH>
                    <TH right>Pedidos</TH>
                  </tr>
                </thead>
                <tbody>
                  {detail.topClientes.map((c, i) => {
                    const cSlug = encodeURIComponent(c.customerNit ?? c.customerName);
                    return (
                      <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <TD bold>
                          <Link
                            href={`/${orgSlug}/sales/customers/${cSlug}?period=${currentPeriod}`}
                            style={{ color: "inherit", textDecoration: "none" }}
                          >
                            {c.customerName}
                          </Link>
                        </TD>
                        <TD muted>{c.customerNit ?? "—"}</TD>
                        <TD right>{fmtCOP(c.totalAmount)}</TD>
                        <TD right>{c.txCount != null ? fmtN(c.txCount) : "—"}</TD>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </PageShell>
  );
}
