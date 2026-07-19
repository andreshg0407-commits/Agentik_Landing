/**
 * /[orgSlug]/sales/lines — Product lines ranking.
 * Shows current-period revenue per line with MoM growth vs the previous month.
 */

import Link                 from "next/link";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getLatestPeriod, getLineaMix } from "@/lib/sales/reports";
import { periodMinusMonths, isValidPeriod, fmtPeriodo } from "@/lib/sales/period-utils";
import {
  PageShell, PageHeader, KpiGrid, KpiCard, Section,
  Breadcrumb, EmptyState, TH, TD, TABLE, THEAD_ROW,
  fmtCOP, fmtN, ShareBar, GrowthBadge, ActionLink, InfoBar,
} from "../_components";

export default async function LinesPage({
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
  const prevPeriod    = periodMinusMonths(currentPeriod, 1);

  // Fetch current + previous month in parallel for MoM growth
  const [lineas, lineasPrev] = await Promise.all([
    getLineaMix(orgId, currentPeriod).catch(() => []),
    getLineaMix(orgId, prevPeriod).catch(() => []),
  ]);

  const prevMap     = new Map(lineasPrev.map(l => [l.linea, l.ventas]));
  const totalVentas = lineas.reduce((s, l) => s + l.ventas, 0);

  // Compute MoM growth per line
  const lineasWithGrowth = lineas.map(l => {
    const prev   = prevMap.get(l.linea) ?? 0;
    const growth = prev > 0
      ? Math.round(((l.ventas - prev) / prev) * 10000) / 100
      : null;
    return { ...l, ventasPrev: prev, growth };
  });

  return (
    <PageShell>
      <Breadcrumb crumbs={[
        { label: "Control Comercial", href: `/${orgSlug}/sales` },
        { label: "Líneas de producto" },
      ]} />

      <PageHeader
        title="Líneas de producto"
        badge={fmtPeriodo(currentPeriod)}
        periodLabel={fmtPeriodo(currentPeriod)}
        actions={
          <ActionLink href={`/${orgSlug}/reports`} variant="primary">
            ✨ Informes →
          </ActionLink>
        }
      />

      <KpiGrid>
        <KpiCard
          label="Líneas activas"
          value={fmtN(lineas.length)}
          source="SAG"
          hint="Líneas de producto con ventas en el período seleccionado."
        />
        <KpiCard
          label="Ventas totales"
          value={fmtCOP(totalVentas)}
          source="SAG"
        />
        <KpiCard
          label="Top línea"
          value={lineas[0]?.linea ?? "—"}
          sub={lineas[0] ? fmtCOP(lineas[0].ventas) : undefined}
          accent
        />
        <KpiCard
          label="Crecim. mensual top línea"
          value={(() => {
            const g = lineasWithGrowth[0]?.growth;
            if (g == null) return "—";
            return `${g >= 0 ? "▲" : "▼"} ${Math.abs(g).toFixed(1)}%`;
          })()}
          hint="Variación porcentual de la línea líder vs. el mes anterior."
        />
      </KpiGrid>

      <Section
        title="Mix por línea"
        subtitle={`${fmtPeriodo(currentPeriod)} vs. ${fmtPeriodo(prevPeriod)}`}
        action={<span style={{ fontSize: 10, color: "#aaa" }}>Fuente: SAG</span>}
      >
        {lineasWithGrowth.length === 0 ? <EmptyState /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>#</TH>
                  <TH>Línea</TH>
                  <TH right>Ventas</TH>
                  <TH right>Mes anterior</TH>
                  <TH right>Crecim. mensual</TH>
                  <TH right>Pedidos</TH>
                  <TH right>Ticket prom.</TH>
                  <TH right>% del total</TH>
                  <TH right>{""}</TH>
                </tr>
              </thead>
              <tbody>
                {lineasWithGrowth.map((l, i) => (
                  <tr key={l.linea} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD muted>{i + 1}</TD>
                    <TD bold>
                      <Link
                        href={`/${orgSlug}/sales/lines/${encodeURIComponent(l.linea)}?period=${currentPeriod}`}
                        style={{ color: "inherit", textDecoration: "none" }}
                      >
                        {l.linea}
                      </Link>
                    </TD>
                    <TD right>{fmtCOP(l.ventas)}</TD>
                    <TD right muted>{l.ventasPrev > 0 ? fmtCOP(l.ventasPrev) : <span style={{ color: "#ccc" }}>nuevo</span>}</TD>
                    <TD right><GrowthBadge pct={l.growth} /></TD>
                    <TD right>{l.pedidos != null ? fmtN(l.pedidos) : "—"}</TD>
                    <TD right>{l.ticketProm != null ? fmtCOP(l.ticketProm) : "—"}</TD>
                    <TD right><ShareBar share={l.share} /></TD>
                    <TD right>
                      <Link
                        href={`/${orgSlug}/sales/lines/${encodeURIComponent(l.linea)}?period=${currentPeriod}`}
                        style={{ fontSize: 11, color: "#6d28d9", textDecoration: "none", fontWeight: 600 }}
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
