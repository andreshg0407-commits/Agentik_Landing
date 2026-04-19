/**
 * /[orgSlug]/sales/vendors — Vendor performance leaderboard.
 * Ranks all sellers by revenue for a 12-month window.
 * Shows avg ticket, unique customers, last sale date, CRM quotes count,
 * and active / inactive badge.
 */

import Link                  from "next/link";
import { requireOrgAccess }  from "@/lib/auth/org-access";
import { getLatestPeriod, getVendorLeaderboard } from "@/lib/sales/reports";
import { periodMinusMonths, isValidPeriod, fmtPeriodo } from "@/lib/sales/period-utils";
import {
  PageShell, PageHeader, KpiGrid, KpiCard, Section,
  Breadcrumb, EmptyState, TH, TD, TABLE, THEAD_ROW,
  fmtCOP, fmtN, ShareBar, ActionLink, InfoBar,
} from "../_components";

// ── Medal rank ────────────────────────────────────────────────────────────────

function RankCell({ rank }: { rank: number }) {
  const medals: Record<number, { icon: string; bg: string; color: string }> = {
    1: { icon: "🥇", bg: "#fffbeb", color: "#92400e" },
    2: { icon: "🥈", bg: "#f8fafc", color: "#475569" },
    3: { icon: "🥉", bg: "#fff7ed", color: "#9a3412" },
  };
  const m = medals[rank];
  return m ? (
    <td style={{
      padding: "8px 14px", textAlign: "center",
      background: m.bg, color: m.color, fontWeight: 700, fontSize: 14,
      borderBottom: "1px solid #f5f5f5",
    }}>
      {m.icon}
    </td>
  ) : (
    <TD muted>{rank}</TD>
  );
}

// ── Active badge ──────────────────────────────────────────────────────────────

function ActiveBadge({ lastSaleDate, currentPeriod }: { lastSaleDate: string | null; currentPeriod: string }) {
  if (!lastSaleDate) return <span style={{ color: "#ccc", fontSize: 10 }}>—</span>;
  const salesPeriod = lastSaleDate.slice(0, 7).replace("-", ""); // YYYYMM
  const isActive    = salesPeriod >= currentPeriod;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px",
      borderRadius: 4,
      background: isActive ? "#dcfce7" : "#f5f5f5",
      color:      isActive ? "#15803d" : "#888",
    }}>
      {isActive ? "Activo" : "Inactivo"}
    </span>
  );
}

export default async function VendorsPage({
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

  const sellers = await getVendorLeaderboard(orgId, trendStart, currentPeriod).catch(() => []);

  const totalVentas    = sellers.reduce((s, r) => s + r.totalAmount, 0);
  const topSeller      = sellers[0] ?? null;
  const activeSellers  = sellers.filter(s => s.lastSaleDate && s.lastSaleDate.slice(0, 7).replace("-", "") >= currentPeriod);

  return (
    <PageShell>
      <Breadcrumb crumbs={[
        { label: "Control Comercial", href: `/${orgSlug}/sales` },
        { label: "Vendedores" },
      ]} />

      <PageHeader
        title="Vendedores"
        badge={fmtPeriodo(trendStart) + " – " + fmtPeriodo(currentPeriod)}
        periodLabel={fmtPeriodo(currentPeriod)}
        actions={
          <ActionLink href={`/${orgSlug}/reports`} variant="primary">
            ✨ Informes inteligentes →
          </ActionLink>
        }
      />

      <KpiGrid>
        <KpiCard
          label="Vendedores en ranking"
          value={fmtN(sellers.length)}
          source="SAG"
          hint="Vendedores con al menos una venta registrada en el período."
        />
        <KpiCard
          label="Activos este mes"
          value={fmtN(activeSellers.length)}
          hint="Vendedores con venta registrada en el último período disponible."
        />
        <KpiCard
          label="Ventas totales"
          value={fmtCOP(totalVentas)}
          source="SAG"
          hint="Suma de ventas netas del período (fuente: registros SAG)."
        />
        <KpiCard
          label="Top vendedor"
          value={topSeller?.sellerName ?? "—"}
          sub={topSeller ? fmtCOP(topSeller.totalAmount) : undefined}
          accent
        />
      </KpiGrid>

      <InfoBar>
        Haz clic en el nombre de un vendedor para ver su análisis completo: tendencia mensual, mix de sucursales, cartera vencida y cotizaciones CRM.
      </InfoBar>

      <Section
        title="Ranking de vendedores"
        subtitle={`${fmtPeriodo(trendStart)} – ${fmtPeriodo(currentPeriod)}`}
      >
        {sellers.length === 0 ? <EmptyState /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>#</TH>
                  <TH>Vendedor</TH>
                  <TH right>Ventas</TH>
                  <TH right>Pedidos</TH>
                  <TH right>Ticket prom.</TH>
                  <TH right>Clientes</TH>
                  <TH right>% total</TH>
                  <TH right>Cotiz. CRM</TH>
                  <TH right>Última venta</TH>
                  <TH right>Estado</TH>
                  <TH right>{""}</TH>
                </tr>
              </thead>
              <tbody>
                {sellers.map((s, i) => (
                  <tr
                    key={s.sellerSlug}
                    style={{
                      background: i === 0 ? "#fffbeb" : i % 2 === 0 ? "#fff" : "#fafafa",
                    }}
                  >
                    <RankCell rank={i + 1} />
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
                    <TD right>{s.avgTicket != null ? fmtCOP(s.avgTicket) : "—"}</TD>
                    <TD right>{fmtN(s.uniqueCustomers)}</TD>
                    <TD right><ShareBar share={s.share} /></TD>
                    <TD right>{s.crmQuotes > 0 ? fmtN(s.crmQuotes) : <span style={{ color: "#ccc" }}>—</span>}</TD>
                    <TD right muted>{s.lastSaleDate ?? "—"}</TD>
                    <TD right>
                      <ActiveBadge lastSaleDate={s.lastSaleDate} currentPeriod={currentPeriod} />
                    </TD>
                    <TD right>
                      <Link
                        href={`/${orgSlug}/sales/vendors/${s.sellerSlug}?period=${currentPeriod}`}
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
