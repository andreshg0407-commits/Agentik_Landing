/**
 * /[orgSlug]/sales/lines/[lineSlug] — Single product-line detail.
 * Monthly trend, top sellers, top customers.
 */

import Link                 from "next/link";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getLatestPeriod, getLineDetail } from "@/lib/sales/reports";
import { periodMinusMonths, isValidPeriod, fmtPeriodo } from "@/lib/sales/period-utils";
import {
  PageShell, PageHeader, KpiGrid, KpiCard, Section,
  Breadcrumb, EmptyState, TrendTable,
  TH, TD, TABLE, THEAD_ROW,
  fmtCOP, fmtN, ShareBar,
} from "../../_components";

export default async function LineDetailPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string; lineSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { orgSlug, lineSlug } = await params;
  const sp                    = await searchParams;
  const { organization }      = await requireOrgAccess(orgSlug);
  const orgId                 = organization.id;

  // Next.js decodes dynamic segments; use as-is for DB query
  const lineName      = decodeURIComponent(lineSlug);
  const latest        = await getLatestPeriod(orgId);
  const currentPeriod = isValidPeriod(sp.period) ? sp.period : latest;
  const trendStart    = periodMinusMonths(currentPeriod, 11);

  const detail = await getLineDetail(orgId, lineName, trendStart, currentPeriod).catch(() => null);

  if (!detail || detail.trend.length === 0) {
    return (
      <PageShell>
        <Breadcrumb crumbs={[
          { label: "Control Comercial", href: `/${orgSlug}/sales` },
          { label: "Líneas",            href: `/${orgSlug}/sales/lines?period=${currentPeriod}` },
          { label: lineName },
        ]} />
        <EmptyState message="Sin datos para esta línea en el período seleccionado." />
      </PageShell>
    );
  }

  const totalVentas = detail.trend.reduce((s, r) => s + r.totalAmount, 0);

  return (
    <PageShell>
      <Breadcrumb crumbs={[
        { label: "Control Comercial", href: `/${orgSlug}/sales` },
        { label: "Líneas",            href: `/${orgSlug}/sales/lines?period=${currentPeriod}` },
        { label: lineName },
      ]} />

      <PageHeader
        title={lineName}
        badge="Línea de producto"
        periodLabel={`${fmtPeriodo(trendStart)} – ${fmtPeriodo(currentPeriod)}`}
      />

      <KpiGrid>
        <KpiCard label="Ventas acumuladas" value={fmtCOP(totalVentas)} accent />
        <KpiCard label="Vendedores"        value={fmtN(detail.topSellers.length)} />
        <KpiCard label="Clientes únicos"   value={fmtN(detail.topClientes.length)} />
        <KpiCard
          label="Top vendedor"
          value={detail.topSellers[0]?.sellerName ?? "—"}
          sub={detail.topSellers[0] ? fmtCOP(detail.topSellers[0].totalAmount) : undefined}
        />
      </KpiGrid>

      <Section title="Tendencia mensual" subtitle={`${fmtPeriodo(trendStart)} – ${fmtPeriodo(currentPeriod)}`}>
        <TrendTable rows={detail.trend} currentPeriod={currentPeriod} fmtPeriodo={fmtPeriodo} />
      </Section>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))",
        gap: 16,
      }}>
        <Section title="Vendedores">
          {detail.topSellers.length === 0 ? <EmptyState /> : (
            <div style={{ overflowX: "auto" }}>
              <table style={TABLE}>
                <thead>
                  <tr style={THEAD_ROW}>
                    <TH>Vendedor</TH>
                    <TH right>Ventas</TH>
                    <TH right>%</TH>
                    <TH right>{""}</TH>
                  </tr>
                </thead>
                <tbody>
                  {detail.topSellers.map((s, i) => (
                    <tr key={s.sellerSlug} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <TD bold>
                        <Link
                          href={`/${orgSlug}/sales/vendors/${s.sellerSlug}?period=${currentPeriod}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                        >
                          {s.sellerName}
                        </Link>
                      </TD>
                      <TD right>{fmtCOP(s.totalAmount)}</TD>
                      <TD right><ShareBar share={s.share} /></TD>
                      <TD right>
                        <Link
                          href={`/${orgSlug}/sales/vendors/${s.sellerSlug}?period=${currentPeriod}`}
                          style={{ fontSize: 11, color: "#6d28d9", textDecoration: "none", fontWeight: 600 }}
                        >
                          →
                        </Link>
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Top clientes">
          {detail.topClientes.length === 0 ? <EmptyState /> : (
            <div style={{ overflowX: "auto" }}>
              <table style={TABLE}>
                <thead>
                  <tr style={THEAD_ROW}>
                    <TH>Cliente</TH>
                    <TH>NIT</TH>
                    <TH right>Ventas</TH>
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
