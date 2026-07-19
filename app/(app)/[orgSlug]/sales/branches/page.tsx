/**
 * /[orgSlug]/sales/branches — Branch/store performance ranking.
 * Shows 12-month aggregated revenue per branch with avg ticket,
 * active sellers count, last activity, and drill-down links.
 *
 * Data source: SaleRecord.storeSlug (stable slug) + storeName (display label).
 * Source signal: SAG XML import normalizes storeName → storeSlug at ingestion.
 */

import Link                  from "next/link";
import { requireOrgAccess }  from "@/lib/auth/org-access";
import { getLatestPeriod, getBranchesSummary } from "@/lib/sales/reports";
import { periodMinusMonths, isValidPeriod, fmtPeriodo } from "@/lib/sales/period-utils";
import {
  PageShell, PageHeader, KpiGrid, KpiCard, Section,
  Breadcrumb, EmptyState, TH, TD, TABLE, THEAD_ROW,
  fmtCOP, fmtN, ShareBar, ActionLink, InfoBar,
} from "../_components";

export default async function BranchesPage({
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
  const trendStart    = periodMinusMonths(currentPeriod, 11);

  const branches    = await getBranchesSummary(orgId, trendStart, currentPeriod).catch(() => []);
  const totalVentas = branches.reduce((s, b) => s + b.totalAmount, 0);

  return (
    <PageShell>
      <Breadcrumb crumbs={[
        { label: "Control Comercial", href: `/${orgSlug}/sales` },
        { label: "Sucursales" },
      ]} />

      <PageHeader
        title="Sucursales"
        badge={`${fmtPeriodo(trendStart)} – ${fmtPeriodo(currentPeriod)}`}
        periodLabel={fmtPeriodo(currentPeriod)}
        actions={
          <ActionLink href={`/${orgSlug}/reports`} variant="primary">
            ✨ Informes →
          </ActionLink>
        }
      />

      <KpiGrid>
        <KpiCard
          label="Sucursales activas"
          value={fmtN(branches.length)}
          source="SAG"
          hint="Sucursales con al menos una venta registrada en el período."
        />
        <KpiCard
          label="Ventas totales"
          value={fmtCOP(totalVentas)}
          source="SAG"
        />
        <KpiCard
          label="Top sucursal"
          value={branches[0]?.storeName ?? "—"}
          sub={branches[0] ? fmtCOP(branches[0].totalAmount) : undefined}
          accent
        />
        <KpiCard
          label="Ticket prom. (top)"
          value={branches[0]?.avgTicket != null ? fmtCOP(branches[0].avgTicket) : "—"}
          hint="Valor medio por transacción en la sucursal líder."
        />
      </KpiGrid>

      <InfoBar>
        Haz clic en el nombre de una sucursal para ver su análisis completo: tendencia mensual, mix de líneas, vendedores y clientes principales.
      </InfoBar>

      <Section
        title="Ventas por sucursal"
        subtitle={`${fmtPeriodo(trendStart)} – ${fmtPeriodo(currentPeriod)}`}
        action={<span style={{ fontSize: 10, color: "#aaa" }}>Fuente: SAG</span>}
      >
        {branches.length === 0 ? <EmptyState /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>#</TH>
                  <TH>Sucursal</TH>
                  <TH right>Ventas</TH>
                  <TH right>Pedidos</TH>
                  <TH right>Ticket prom.</TH>
                  <TH right>Vendedores</TH>
                  <TH right>% del total</TH>
                  <TH right>Última actividad</TH>
                  <TH right>{""}</TH>
                </tr>
              </thead>
              <tbody>
                {branches.map((b, i) => (
                  <tr key={b.storeSlug} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD muted>{i + 1}</TD>
                    <TD bold>
                      <Link
                        href={`/${orgSlug}/sales/branches/${b.storeSlug}?period=${currentPeriod}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {b.storeName}
                      </Link>
                    </TD>
                    <TD right>{fmtCOP(b.totalAmount)}</TD>
                    <TD right>{b.txCount != null ? fmtN(b.txCount) : "—"}</TD>
                    <TD right>{b.avgTicket != null ? fmtCOP(b.avgTicket) : "—"}</TD>
                    <TD right>{fmtN(b.activeSellers)}</TD>
                    <TD right><ShareBar share={b.share} color="#0369a1" /></TD>
                    <TD right muted>{b.lastSaleDate ?? "—"}</TD>
                    <TD right>
                      <Link
                        href={`/${orgSlug}/sales/branches/${b.storeSlug}?period=${currentPeriod}`}
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
    </PageShell>
  );
}
