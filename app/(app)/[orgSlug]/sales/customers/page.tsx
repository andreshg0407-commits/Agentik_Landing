/**
 * /[orgSlug]/sales/customers — Customer revenue ranking.
 */

import Link                 from "next/link";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getLatestPeriod, getTopClientes } from "@/lib/sales/reports";
import { isValidPeriod, fmtPeriodo }       from "@/lib/sales/period-utils";
import {
  PageShell, PageHeader, KpiGrid, KpiCard, Section,
  Breadcrumb, EmptyState, TH, TD, TABLE, THEAD_ROW,
  fmtCOP, fmtN,
} from "../_components";

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { orgSlug }      = await params;
  const sp               = await searchParams;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;

  const latest        = await getLatestPeriod(orgId);
  const currentPeriod = isValidPeriod(sp.period) ? sp.period : latest;

  const clientes = await getTopClientes(orgId, currentPeriod, 50).catch(() => []);
  const totalVentas = clientes.reduce((s, c) => s + c.ventas, 0);

  return (
    <PageShell>
      <Breadcrumb crumbs={[
        { label: "Control Comercial", href: `/${orgSlug}/sales` },
        { label: "Clientes" },
      ]} />

      <PageHeader
        title="Clientes"
        badge={fmtPeriodo(currentPeriod)}
        periodLabel={fmtPeriodo(currentPeriod)}
      />

      <KpiGrid>
        <KpiCard label="Clientes activos" value={fmtN(clientes.length)} />
        <KpiCard label="Ventas totales"   value={fmtCOP(totalVentas)} />
        <KpiCard
          label="Top cliente"
          value={clientes[0]?.customerName ?? "—"}
          sub={clientes[0] ? fmtCOP(clientes[0].ventas) : undefined}
          accent
        />
      </KpiGrid>

      <Section title="Ranking de clientes" subtitle={`Top 50 · ${fmtPeriodo(currentPeriod)}`}>
        {clientes.length === 0 ? <EmptyState /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>#</TH>
                  <TH>Cliente</TH>
                  <TH>NIT</TH>
                  <TH right>Ventas</TH>
                  <TH right>Pedidos</TH>
                  <TH right>Última fecha</TH>
                  <TH right>{""}</TH>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c, i) => {
                  const cSlug = encodeURIComponent(c.customerNit ?? c.customerName);
                  return (
                    <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <TD muted>{i + 1}</TD>
                      <TD bold>
                        <Link
                          href={`/${orgSlug}/sales/customers/${cSlug}?period=${currentPeriod}`}
                          style={{ color: "inherit", textDecoration: "none" }}
                        >
                          {c.customerName}
                        </Link>
                      </TD>
                      <TD muted>{c.customerNit ?? "—"}</TD>
                      <TD right>{fmtCOP(c.ventas)}</TD>
                      <TD right>{c.pedidos != null ? fmtN(c.pedidos) : "—"}</TD>
                      <TD right muted>{c.ultimaFecha}</TD>
                      <TD right>
                        <Link
                          href={`/${orgSlug}/sales/customers/${cSlug}?period=${currentPeriod}`}
                          style={{ fontSize: 11, color: "#6d28d9", textDecoration: "none", fontWeight: 600 }}
                        >
                          Ver detalle →
                        </Link>
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </PageShell>
  );
}
