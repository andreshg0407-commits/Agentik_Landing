/**
 * /[orgSlug]/sales/channels — Revenue by sales channel.
 *
 * Channel classification model
 * ─────────────────────────────
 * The `channel` field on SaleRecord holds a SaleChannel enum value set at
 * import time. Current mapping from source signals:
 *
 *  TIENDA       → ventas registradas en caja de tienda física (SAG POS / XML)
 *  ONLINE       → pedidos digitales / e-commerce
 *  TELEFONO     → órdenes tomadas por teléfono o por vendedor directo fuera de tienda
 *  DISTRIBUIDOR → canal de distribución / reventa
 *  MAYORISTA    → canal mayorista (pedidos de alta cantidad / precio especial)
 *  OTRO         → sin clasificar — canal no identificado en el sistema fuente;
 *                 pendiente de enriquecimiento manual o por regla de negocio.
 *
 * What remains "unknown":
 *  - Rows imported before the channel classification was added may appear as OTRO.
 *  - CRMQuote records do not carry a SaleChannel; quotes are joined to SaleRecord
 *    by sellerSlug only — the channel of the resulting invoice is not back-filled.
 *  - Future: add a channel-inference layer (by sellerSlug pattern, storeName, or
 *    rawCrmJson.sucursal_c) to reclassify OTRO rows retroactively.
 */

import { requireOrgAccess }  from "@/lib/auth/org-access";
import { getLatestPeriod, getChannelsSummary } from "@/lib/sales/reports";
import { periodMinusMonths, isValidPeriod, fmtPeriodo } from "@/lib/sales/period-utils";
import {
  PageShell, PageHeader, KpiGrid, KpiCard, Section,
  Breadcrumb, EmptyState, TH, TD, TABLE, THEAD_ROW,
  fmtCOP, fmtN, ShareBar, ActionLink, InfoBar,
} from "../_components";

// ── Channel metadata ──────────────────────────────────────────────────────────
// Covers all SaleChannel enum values: TIENDA, ONLINE, TELEFONO,
// DISTRIBUIDOR, MAYORISTA, OTRO.

interface ChannelMeta {
  label:       string;
  icon:        string;
  description: string;
  color:       string;
}

const CHANNEL: Record<string, ChannelMeta> = {
  TIENDA:       { label: "Tienda física",       icon: "🏪", description: "Caja / POS de tienda",          color: "#0369a1" },
  ONLINE:       { label: "Web / Online",         icon: "💻", description: "Pedidos digitales",              color: "#6d28d9" },
  TELEFONO:     { label: "Venta telefónica",     icon: "📞", description: "Vendedor directo / teléfono",   color: "#047857" },
  DISTRIBUIDOR: { label: "Distribuidor",         icon: "🚚", description: "Canal de distribución",         color: "#b45309" },
  MAYORISTA:    { label: "Mayorista",            icon: "📦", description: "Pedido mayoreo",                 color: "#7c3aed" },
  OTRO:         { label: "Otro / Sin clasificar",icon: "❓", description: "Canal pendiente de identificar", color: "#6b7280" },
};

function channelOf(raw: string): ChannelMeta {
  return CHANNEL[raw] ?? { label: raw, icon: "·", description: "Canal desconocido", color: "#aaa" };
}

export default async function ChannelsPage({
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

  const channels    = await getChannelsSummary(orgId, trendStart, currentPeriod).catch(() => []);
  const totalVentas = channels.reduce((s, c) => s + c.totalAmount, 0);

  const topChannel   = channels[0] ?? null;
  const otroChannel  = channels.find(c => c.channel === "OTRO");
  const sinClasificar = otroChannel
    ? Math.round((otroChannel.totalAmount / totalVentas) * 10000) / 100
    : 0;

  return (
    <PageShell>
      <Breadcrumb crumbs={[
        { label: "Control Comercial", href: `/${orgSlug}/sales` },
        { label: "Canales de venta" },
      ]} />

      <PageHeader
        title="Canales de venta"
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
          label="Canales activos"
          value={fmtN(channels.length)}
          source="SAG"
          hint="Canales de venta con registros en el período seleccionado."
        />
        <KpiCard
          label="Ventas totales"
          value={fmtCOP(totalVentas)}
          source="SAG"
        />
        <KpiCard
          label="Canal principal"
          value={topChannel ? channelOf(topChannel.channel).label : "—"}
          sub={topChannel ? fmtCOP(topChannel.totalAmount) : undefined}
          accent
        />
        {sinClasificar > 0 && (
          <KpiCard
            label="Sin clasificar (OTRO)"
            value={`${sinClasificar.toFixed(1)}%`}
            sub="Pendiente de enriquecimiento"
            hint="Ventas cuyo canal de origen no pudo determinarse. Se recomienda revisión manual o configurar regla de clasificación."
          />
        )}
      </KpiGrid>

      <InfoBar>
        El canal se asigna automáticamente según la fuente de la transacción (SAG/POS, XML, CRM). Las ventas sin canal reconocido aparecen como <strong>Otro / Sin clasificar</strong>.
      </InfoBar>

      {/* ── Channel ranking ── */}
      <Section title="Distribución por canal" subtitle={`${fmtPeriodo(trendStart)} – ${fmtPeriodo(currentPeriod)}`}>
        {channels.length === 0 ? <EmptyState /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={TABLE}>
              <thead>
                <tr style={THEAD_ROW}>
                  <TH>#</TH>
                  <TH>Canal</TH>
                  <TH>Descripción</TH>
                  <TH right>Ventas</TH>
                  <TH right>Pedidos</TH>
                  <TH right>Ticket prom.</TH>
                  <TH right>% del total</TH>
                  <TH right>Última actividad</TH>
                </tr>
              </thead>
              <tbody>
                {channels.map((c, i) => {
                  const meta = channelOf(c.channel);
                  return (
                    <tr key={c.channel} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                      <TD muted>{i + 1}</TD>
                      <TD bold>
                        <span style={{ marginRight: 6 }}>{meta.icon}</span>
                        {meta.label}
                      </TD>
                      <TD muted>{meta.description}</TD>
                      <TD right>{fmtCOP(c.totalAmount)}</TD>
                      <TD right>{c.txCount != null ? fmtN(c.txCount) : "—"}</TD>
                      <TD right>{c.avgTicket != null ? fmtCOP(c.avgTicket) : "—"}</TD>
                      <TD right>
                        <ShareBar share={c.share} color={meta.color} />
                      </TD>
                      <TD right muted>{c.lastSaleDate ?? "—"}</TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* ── Classification note ── */}
      <Section title="Modelo de clasificación de canales">
        <div style={{ padding: "12px 16px", fontSize: 12, lineHeight: 1.7 }}>
          <p style={{ margin: "0 0 10px", color: "#555" }}>
            El canal se asigna en el momento de la importación desde el sistema fuente (SAG / XML).
            La tabla siguiente describe qué señal se utiliza para cada valor y qué queda pendiente.
          </p>
          <table style={{ ...TABLE, fontSize: 12 }}>
            <thead>
              <tr style={THEAD_ROW}>
                <TH>Canal</TH>
                <TH>Señal de origen</TH>
                <TH>Fuente</TH>
                <TH>Estado</TH>
              </tr>
            </thead>
            <tbody>
              {[
                { key: "TIENDA",       signal: "Registro de caja / comprobante POS en XML",     source: "SAG XML",    status: "Clasificado" },
                { key: "ONLINE",       signal: "Flag de pedido digital en SAG o integración web", source: "SAG / API", status: "Clasificado" },
                { key: "TELEFONO",     signal: "Tipo de comprobante = orden telefónica",          source: "SAG XML",    status: "Clasificado" },
                { key: "DISTRIBUIDOR", signal: "Código de cliente tipo DIST en SAG",              source: "SAG",        status: "Clasificado" },
                { key: "MAYORISTA",    signal: "Lista de precio mayorista o tipo cliente MAY",    source: "SAG",        status: "Clasificado" },
                { key: "OTRO",         signal: "No coincide con ninguna regla anterior",          source: "—",          status: "⚠ Pendiente de enriquecimiento" },
              ].map((row, i) => {
                const meta = channelOf(row.key);
                return (
                  <tr key={row.key} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <TD bold>
                      <span style={{ marginRight: 6 }}>{meta.icon}</span>
                      {meta.label}
                    </TD>
                    <TD>{row.signal}</TD>
                    <TD muted>{row.source}</TD>
                    <TD>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                        background: row.key === "OTRO" ? "#fef9c3" : "#dcfce7",
                        color:      row.key === "OTRO" ? "#92400e"  : "#15803d",
                      }}>
                        {row.status}
                      </span>
                    </TD>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
    </PageShell>
  );
}
