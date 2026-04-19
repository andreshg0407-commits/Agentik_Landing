/**
 * /[orgSlug]/sales/vendors/[sellerSlug] — Full vendor analytics page.
 *
 * Sections:
 *  1. KPI cards — ventas, pedidos, ticket prom, clientes únicos, líneas, CRM quotes, cartera vencida
 *  2. Tendencia mensual (TrendTable)
 *  3. Mix por sucursal
 *  4. Top líneas de producto + Top clientes  (two-column)
 *  5. Cotizaciones CRM recientes
 *  6. Cartera vencida de sus clientes
 */

import Link                         from "next/link";
import { requireOrgAccess }         from "@/lib/auth/org-access";
import {
  getLatestPeriod,
  getSellerDetail,
  getSellerBranchMix,
  getSellerRecentQuotes,
  getSellerOverdueReceivables,
} from "@/lib/sales/reports";
import {
  getSellerLedgerKpis,
} from "@/lib/commercial-ledger/service";
import { periodMinusMonths, isValidPeriod, fmtPeriodo } from "@/lib/sales/period-utils";
import {
  PageShell, PageHeader, KpiGrid, KpiCard, Section,
  Breadcrumb, EmptyState, TrendTable,
  TH, TD, TABLE, THEAD_ROW,
  fmtCOP, fmtN, ShareBar, ActionLink, InfoBar,
} from "../../_components";
import { DownloadCsvButton } from "../../_csv-button";
import {
  LedgerSection, LedgerPipelineCards,
} from "../../_ledger-section";
import ActionButton from "../../../_action-button";

// ── CRM status labels ─────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, { label: string; bg: string; color: string }> = {
  DRAFT:    { label: "Borrador",  bg: "#f5f5f5", color: "#555" },
  SENT:     { label: "Enviado",   bg: "#eff6ff", color: "#1d4ed8" },
  ACCEPTED: { label: "Aceptado",  bg: "#dcfce7", color: "#15803d" },
  REJECTED: { label: "Rechazado", bg: "#fee2e2", color: "#dc2626" },
  EXPIRED:  { label: "Vencido",   bg: "#fef9c3", color: "#92400e" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? { label: status, bg: "#f5f5f5", color: "#555" };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px",
      borderRadius: 4, background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  );
}

// ── Aging bucket badge ────────────────────────────────────────────────────────

function AgingBadge({ bucket }: { bucket: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    "CURRENT": { bg: "#dcfce7", color: "#15803d" },
    "1-30":    { bg: "#fef9c3", color: "#92400e" },
    "31-60":   { bg: "#ffedd5", color: "#c2410c" },
    "61-90":   { bg: "#fee2e2", color: "#dc2626" },
    "90+":     { bg: "#fce7f3", color: "#9d174d" },
  };
  const st = styles[bucket] ?? { bg: "#f5f5f5", color: "#555" };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px",
      borderRadius: 4, background: st.bg, color: st.color,
    }}>
      {bucket}
    </span>
  );
}

export default async function SellerDetailPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string; sellerSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { orgSlug, sellerSlug } = await params;
  const sp                      = await searchParams;
  const { organization }        = await requireOrgAccess(orgSlug);
  const orgId                   = organization.id;

  const latest        = await getLatestPeriod(orgId);
  const currentPeriod = isValidPeriod(sp.period) ? sp.period : latest;
  const trendStart    = periodMinusMonths(currentPeriod, 11);

  const [detail, branches, recentQuotes, overdueRows, ledger] = await Promise.all([
    getSellerDetail(orgId, sellerSlug, trendStart, currentPeriod).catch(() => null),
    getSellerBranchMix(orgId, sellerSlug, trendStart, currentPeriod).catch(() => []),
    getSellerRecentQuotes(orgId, sellerSlug, 10).catch(() => []),
    getSellerOverdueReceivables(orgId, sellerSlug, 25).catch(() => []),
    getSellerLedgerKpis(orgId, sellerSlug).catch(() => null),
  ]);

  if (!detail || detail.trend.length === 0) {
    return (
      <PageShell>
        <Breadcrumb crumbs={[
          { label: "Control Comercial", href: `/${orgSlug}/sales` },
          { label: "Vendedores",        href: `/${orgSlug}/sales/vendors?period=${currentPeriod}` },
          { label: decodeURIComponent(sellerSlug) },
        ]} />
        <EmptyState message="Sin datos para este vendedor en el período seleccionado." />
      </PageShell>
    );
  }

  // ── Aggregate KPIs ──────────────────────────────────────────────────────────
  const totalVentas  = detail.trend.reduce((s, r) => s + r.totalAmount, 0);
  const totalPedidos = detail.trend.every(r => r.txCount != null)
    ? detail.trend.reduce((s, r) => s + (r.txCount ?? 0), 0)
    : null;
  const totalOverdue = overdueRows.reduce((s, r) => s + r.balanceDue, 0);
  const crmTotal     = recentQuotes.reduce((s, r) => s + r.amount, 0);

  const isActive = detail.lastSaleDate != null
    && detail.lastSaleDate.slice(0, 7).replace("-", "") >= currentPeriod;

  // ── CSV prep ────────────────────────────────────────────────────────────────
  const clientesCsvRows = detail.topClientes.map(c => [
    c.customerName, c.customerNit ?? "", c.totalAmount, c.txCount ?? "",
  ]);
  const sucursalesCsvRows = branches.map(b => [
    b.storeName, b.totalAmount, b.txCount ?? "", b.share,
  ]);
  const overddueCsvRows = overdueRows.map(r => [
    r.customerName, r.customerNit ?? "", r.balanceDue, r.daysOverdue, r.agingBucket, r.invoiceNumber ?? "",
  ]);

  return (
    <PageShell>
      <Breadcrumb crumbs={[
        { label: "Control Comercial", href: `/${orgSlug}/sales` },
        { label: "Vendedores",        href: `/${orgSlug}/sales/vendors?period=${currentPeriod}` },
        { label: detail.sellerName },
      ]} />

      <PageHeader
        title={detail.sellerName}
        badge={isActive ? "Activo" : "Inactivo"}
        periodLabel={`${fmtPeriodo(trendStart)} – ${fmtPeriodo(currentPeriod)}`}
        actions={
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <ActionButton
              orgSlug={orgSlug}
              label="Seguimiento"
              icon="📋"
              variant="outline"
              size="sm"
              prefill={{
                actionType:   "ASIGNAR_SEGUIMIENTO_VENDEDOR",
                targetType:   "seller",
                targetId:     sellerSlug,
                targetLabel:  detail.sellerName,
                sourceModule: "control_comercial",
                title:        `Seguimiento comercial — ${detail.sellerName}`,
                priority:     "MEDIUM",
              }}
            />
            <ActionButton
              orgSlug={orgSlug}
              label="Alerta operativa"
              icon="⚠"
              variant="outline"
              size="sm"
              prefill={{
                actionType:   "ABRIR_ALERTA_OPERATIVA",
                targetType:   "seller",
                targetId:     sellerSlug,
                targetLabel:  detail.sellerName,
                sourceModule: "control_comercial",
                title:        `Alerta operativa — ${detail.sellerName}`,
                priority:     "HIGH",
              }}
            />
            <ActionButton
              orgSlug={orgSlug}
              label="Escalar"
              icon="⬆"
              variant="danger"
              size="sm"
              prefill={{
                actionType:   "ESCALAR_A_GERENCIA",
                targetType:   "seller",
                targetId:     sellerSlug,
                targetLabel:  detail.sellerName,
                sourceModule: "control_comercial",
                title:        `Escalamiento gerencia — ${detail.sellerName}`,
                priority:     "URGENT",
              }}
            />
            <ActionLink
              href={`/${orgSlug}/reports?q=${encodeURIComponent("Pedidos de " + detail.sellerName)}`}
              variant="primary"
            >
              ✨ Informe →
            </ActionLink>
          </div>
        }
      />

      {/* ── KPI cards ── */}
      <KpiGrid>
        <KpiCard
          label="Ventas acumuladas"
          value={fmtCOP(totalVentas)}
          accent
          source="SAG"
          hint="Ventas netas registradas en SAG para el período de 12 meses."
        />
        <KpiCard
          label="Pedidos"
          value={totalPedidos != null ? fmtN(totalPedidos) : "—"}
          source="SAG"
          hint="Número de transacciones registradas en el sistema."
        />
        <KpiCard
          label="Ticket promedio"
          value={totalPedidos && totalPedidos > 0 ? fmtCOP(totalVentas / totalPedidos) : "—"}
          hint="Ventas acumuladas ÷ número de pedidos. Indica el valor medio por transacción."
        />
        <KpiCard
          label="Clientes únicos"
          value={fmtN(detail.uniqueCustomers)}
          source="SAG"
          hint="Clientes distintos con al menos una compra en el período."
        />
        <KpiCard label="Líneas activas"     value={fmtN(detail.topLines.length)} />
        <KpiCard label="Sucursales"         value={fmtN(branches.length)} />
        <KpiCard
          label="Cotizaciones CRM"
          value={recentQuotes.length > 0 ? fmtN(recentQuotes.length) : "—"}
          sub={recentQuotes.length > 0 ? fmtCOP(crmTotal) : undefined}
          source="CRM"
          hint="Cotizaciones registradas por este vendedor en el CRM. No incluye ventas ya facturadas."
        />
        <KpiCard
          label="Cartera vencida"
          value={overdueRows.length > 0 ? fmtCOP(totalOverdue) : "—"}
          sub={overdueRows.length > 0 ? `${overdueRows.length} facturas` : undefined}
          source="ERP"
          hint="Saldo pendiente de cobro de los clientes asignados a este vendedor."
        />
      </KpiGrid>

      {/* ── Unified commercial ledger ── */}
      {ledger && (
        <LedgerSection title="Libro Comercial Unificado" subtitle="CRM · SAG · Cartera">
          <div style={{ padding: "14px 14px 0" }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: 10, marginBottom: 14,
            }}>
              {[
                { label: "Total cotizado CRM",   value: fmtCOP(ledger.totalQuoteAmount), sub: `${fmtN(ledger.totalQuotes)} cotizaciones` },
                { label: "Aceptadas",            value: fmtCOP(ledger.acceptedAmount),    sub: `${fmtN(ledger.acceptedQuotes)} aprobadas` },
                { label: "Pendiente SAG",        value: fmtCOP(ledger.pendingToSagAmount),sub: `${fmtN(ledger.pendingToSag)} sin sincronizar` },
                { label: "En SAG sin facturar",  value: fmtCOP(ledger.notInvoicedAmount), sub: `${fmtN(ledger.notInvoiced)} pedidos` },
                { label: "Saldo vencido clientes", value: fmtCOP(ledger.totalOverdue),   sub: `${fmtN(ledger.overdueCount)} facturas` },
              ].map(c => (
                <div key={c.label} style={{
                  border: "1px solid #c4b5fd", borderRadius: 5, padding: "10px 12px", background: "#faf5ff",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#6d28d9", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                    {c.label}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#111" }}>{c.value}</div>
                  {c.sub && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{c.sub}</div>}
                </div>
              ))}
            </div>
            <LedgerPipelineCards {...ledger} />
          </div>
        </LedgerSection>
      )}

      {/* ── Monthly trend ── */}
      <Section title="Tendencia mensual" subtitle={`${fmtPeriodo(trendStart)} – ${fmtPeriodo(currentPeriod)}`}>
        <TrendTable rows={detail.trend} currentPeriod={currentPeriod} fmtPeriodo={fmtPeriodo} />
      </Section>

      {/* ── Branch mix ── */}
      {branches.length > 0 && (
        <Section
          title="Mix por sucursal"
          subtitle={`${fmtPeriodo(trendStart)} – ${fmtPeriodo(currentPeriod)}`}
          action={
            <ActionLink href={`/${orgSlug}/sales/branches`} variant="muted">
              Ver todas las sucursales →
            </ActionLink>
          }
        >
          <div style={{ padding: "8px 14px 4px", display: "flex", justifyContent: "flex-end" }}>
            <DownloadCsvButton
              filename={`sucursales_${sellerSlug}.csv`}
              columns={["Sucursal", "Ventas", "Pedidos", "% del total"]}
              rows={sucursalesCsvRows}
            />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>#</TH>
                  <TH>Sucursal</TH>
                  <TH right>Ventas</TH>
                  <TH right>Pedidos</TH>
                  <TH right>% del total</TH>
                </tr>
              </thead>
              <tbody>
                {branches.map((b, i) => (
                  <tr key={b.storeSlug} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD muted>{i + 1}</TD>
                    <TD bold>{b.storeName}</TD>
                    <TD right>{fmtCOP(b.totalAmount)}</TD>
                    <TD right>{b.txCount != null ? fmtN(b.txCount) : "—"}</TD>
                    <TD right><ShareBar share={b.share} /></TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── Two-column: top lines + top clients ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))",
        gap: 16,
        marginBottom: 20,
      }}>
        {/* Top lines */}
        <Section title="Top líneas de producto">
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
                      <TD right><ShareBar share={l.share} /></TD>
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
              filename={`clientes_${sellerSlug}.csv`}
              columns={["Cliente", "NIT", "Ventas", "Pedidos"]}
              rows={clientesCsvRows}
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

      {/* ── Recent CRM quotes ── */}
      {recentQuotes.length > 0 && (
        <Section title="Cotizaciones CRM recientes">
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>N° Cotización</TH>
                  <TH>Cliente</TH>
                  <TH right>Valor</TH>
                  <TH>Estado</TH>
                  <TH right>Fecha</TH>
                </tr>
              </thead>
              <tbody>
                {recentQuotes.map((q, i) => (
                  <tr key={q.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD muted>{q.quoteNumber ?? q.id.slice(0, 8)}</TD>
                    <TD bold>{q.customerName ?? "—"}</TD>
                    <TD right>{fmtCOP(q.amount)}</TD>
                    <TD><StatusBadge status={q.status} /></TD>
                    <TD right muted>{q.issuedAt}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── Overdue receivables ── */}
      {overdueRows.length > 0 && (
        <Section title="Cartera vencida de sus clientes">
          <div style={{ padding: "8px 14px 4px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 700 }}>
              Total: {fmtCOP(totalOverdue)} · {overdueRows.length} facturas
            </span>
            <DownloadCsvButton
              filename={`cartera_${sellerSlug}.csv`}
              columns={["Cliente", "NIT", "Saldo", "Días vencido", "Bucket", "N° factura"]}
              rows={overddueCsvRows}
            />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>Cliente</TH>
                  <TH>NIT</TH>
                  <TH right>Saldo vencido</TH>
                  <TH right>Días</TH>
                  <TH>Bucket</TH>
                  <TH>N° factura</TH>
                </tr>
              </thead>
              <tbody>
                {overdueRows.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD bold>{r.customerName}</TD>
                    <TD muted>{r.customerNit ?? "—"}</TD>
                    <TD right>{fmtCOP(r.balanceDue)}</TD>
                    <TD right>{fmtN(r.daysOverdue)}</TD>
                    <TD><AgingBadge bucket={r.agingBucket} /></TD>
                    <TD muted>{r.invoiceNumber ?? "—"}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </PageShell>
  );
}
