"use client";

/**
 * cliente-360-client.tsx
 *
 * CLIENTES-360-01 Phases 3-9, 11 — Full 360 client component.
 *
 * Sections:
 *  1. Header 360 (name, NIT, city, status, seller, confidence)
 *  2. KPI strip (reliable KPIs only)
 *  3. Pedidos (CRM + SAG combined)
 *  4. Cartera (receivables)
 *  5. Historial comercial (sales + collections)
 *  6. Composicion comercial (product lines from SaleRecord)
 *  7. Oportunidades (rule-based signals)
 *
 * Empty states per block — no false zeros.
 */

import { C, T, S, R, E } from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { EmptyOperationalState, WorkspaceSection } from "@/components/shell/operational-primitives";
import type { Cliente360Data } from "@/lib/comercial/clientes/cliente-360-loader";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug: string;
  data: Cliente360Data;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCurrency(value: number): string {
  if (value === 0) return "\u2014";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString("es-CO")}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDaysAgo(iso: string | null): string {
  if (!iso) return "\u2014";
  const days = Math.round((Date.now() - new Date(iso).getTime()) / (86400000));
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  return `Hace ${days} dias`;
}

// ── Status helpers ────────────────────────────────────────────────────────────

type StatusVariant = "ok" | "pending" | "warning" | "critical" | "info";

function profileStatusVariant(status: string): StatusVariant {
  switch (status) {
    case "ACTIVE": return "ok";
    case "INACTIVE": return "warning";
    case "PROSPECT": return "info";
    case "CHURNED": case "BLOCKED": return "critical";
    default: return "pending";
  }
}

function profileStatusLabel(status: string): string {
  const map: Record<string, string> = {
    ACTIVE: "Activo", INACTIVE: "Inactivo", PROSPECT: "Prospecto",
    CHURNED: "Perdido", BLOCKED: "Bloqueado",
  };
  return map[status] ?? status;
}

function orderStageVariant(stage: string): StatusVariant {
  if (stage === "Facturado") return "ok";
  if (stage === "Anulado") return "critical";
  if (stage === "Remisionado" || stage === "Gestionado_Parcialmente") return "pending";
  return "warning";
}

function sagOrderStatusVariant(status: string): StatusVariant {
  switch (status) {
    case "FACTURADO": return "ok";
    case "DESPACHADO": return "info";
    case "EN_PROCESO": return "pending";
    case "CANCELADO": return "critical";
    default: return "warning";
  }
}

function receivableStatusVariant(status: string): StatusVariant {
  switch (status) {
    case "PAID": case "CLOSED": return "ok";
    case "OPEN": return "warning";
    case "PARTIAL": return "pending";
    case "OVERDUE": return "critical";
    case "WRITTEN_OFF": case "CANCELLED": return "critical";
    default: return "info";
  }
}

function carteraStatusLabel(status: string): string {
  const map: Record<string, string> = {
    OPEN: "Pendiente", CLOSED: "Pagada", PAID: "Pagada",
    PARTIAL: "Pago parcial", OVERDUE: "Vencida",
    CANCELLED: "Anulada", WRITTEN_OFF: "Anulada",
  };
  return map[status] ?? status;
}

// ── Grid constants ────────────────────────────────────────────────────────────

const ORDER_GRID = "60px 1fr 90px 90px 90px 80px";
const RECEIVABLE_GRID = "1fr 100px 100px 100px 80px 80px";
const HISTORY_GRID = "90px 1fr 100px 80px";

// ── Component ─────────────────────────────────────────────────────────────────

export function Cliente360Client({ orgSlug, data }: Props) {
  const { profile, seller, crmQuotes, sagOrders, receivables, sales, collections, opportunities } = data;

  // Determine last activity across all sources
  const allDates: number[] = [];
  for (const q of crmQuotes.items) if (q.issuedAt) allDates.push(new Date(q.issuedAt).getTime());
  for (const o of sagOrders.items) if (o.orderDate) allDates.push(new Date(o.orderDate).getTime());
  for (const s of sales.items) if (s.saleDate) allDates.push(new Date(s.saleDate).getTime());
  for (const c of collections.items) if (c.collectionDate) allDates.push(new Date(c.collectionDate).getTime());
  const lastActivity = allDates.length > 0 ? new Date(Math.max(...allDates)).toISOString() : null;

  // Product line aggregation for composicion
  const lineAgg = new Map<string, { count: number; total: number }>();
  for (const s of sales.items) {
    const line = s.productLine ?? "Sin linea";
    const entry = lineAgg.get(line) ?? { count: 0, total: 0 };
    entry.count++;
    entry.total += s.amount;
    lineAgg.set(line, entry);
  }
  const productLines = [...lineAgg.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([name, data]) => ({ name, ...data }));

  // Header status
  const headerStatus = receivables.totalOverdue > 0 ? "warning" as const : "ok" as const;
  const totalOrders = crmQuotes.items.length + sagOrders.items.length;

  return (
    <div style={{ padding: S[6], maxWidth: 1200 }}>
      {/* ── Phase 3: Header 360 ──────────────────────────────────────────── */}
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Comercial", href: `/${orgSlug}/comercial/maletas` },
          { label: "Clientes", href: `/${orgSlug}/comercial/clientes` },
          { label: profile.name },
        ]}
        contextualBackHref={`/${orgSlug}/comercial/clientes`}
        contextualBackLabel="Clientes"
      />

      {/* Identity block */}
      <div
        style={{
          ...panelStyle,
          marginBottom: S[5],
          padding: S[5],
          display: "flex",
          flexWrap: "wrap" as const,
          gap: S[5],
          alignItems: "flex-start",
        }}
      >
        {/* Name + NIT + City */}
        <div style={{ flex: "1 1 300px", minWidth: 260 }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink, marginBottom: S[1] }}>
            {profile.name}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap" as const, gap: S[3], alignItems: "center" }}>
            {profile.nit && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                NIT {profile.nit}
              </span>
            )}
            {profile.city && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                {profile.city}
              </span>
            )}
            <span className={`ag-op-status ag-op-status--${profileStatusVariant(profile.status)}`}
              style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold }}
            >
              {profileStatusLabel(profile.status)}
            </span>
          </div>
        </div>

        {/* Seller info */}
        <div style={{ flex: "0 0 auto", textAlign: "right" as const }}>
          {seller.state === "disponible" ? (
            <>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginBottom: 2 }}>
                VENDEDOR PRINCIPAL
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                {seller.sellerName}
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: seller.confidence >= 80 ? C.green : C.amber }}>
                {seller.confidence}% confianza
              </div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginBottom: 2 }}>
                VENDEDOR PRINCIPAL
              </div>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkGhost }}>
                Sin vendedor asignado
              </div>
            </>
          )}
        </div>

        {/* CTAs */}
        <div style={{ flex: "0 0 auto", display: "flex", gap: S[2], flexWrap: "wrap" as const }}>
          {totalOrders > 0 && (
            <a href="#pedidos" className="ag-action-secondary"
              style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], padding: `4px ${S[3]}px`, borderRadius: R.sm, textDecoration: "none" }}>
              Ver pedidos
            </a>
          )}
          {receivables.state === "disponible" && (
            <a href="#cartera" className="ag-action-secondary"
              style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], padding: `4px ${S[3]}px`, borderRadius: R.sm, textDecoration: "none" }}>
              Ver cartera
            </a>
          )}
        </div>
      </div>

      {/* ── Phase 4: KPI Strip ───────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: S[3],
          marginBottom: S[6],
        }}
      >
        <KpiCard label="Pedidos CRM" value={crmQuotes.items.length} />
        <KpiCard label="Pedidos SAG" value={sagOrders.items.length} />
        <KpiCard
          label="Facturas"
          value={sales.items.filter(s => s.sagSourceType === "OFICIAL").length}
        />
        <KpiCard
          label="Cartera vencida"
          textValue={receivables.totalOverdue > 0 ? fmtCurrency(receivables.totalOverdue) : "\u2014"}
          color={receivables.totalOverdue > 0 ? C.red : undefined}
        />
        <KpiCard
          label="Ultima compra"
          textValue={fmtDaysAgo(lastActivity)}
        />
        <KpiCard
          label="Vendedor"
          textValue={seller.sellerName ?? "\u2014"}
        />
      </div>

      {/* ── Phase 5: Pedidos ─────────────────────────────────────────────── */}
      <div id="pedidos">
        <WorkspaceSection title="Pedidos recientes" subtitle={totalOrders > 0 ? `${totalOrders} pedidos` : undefined}>
          {totalOrders === 0 ? (
            <EmptyOperationalState message="Sin pedidos registrados" detail="No hay pedidos CRM ni SAG vinculados a este cliente." />
          ) : (
            <div className="ag-op-table" style={{ border: `1px solid ${C.line}`, borderRadius: R.sm, overflow: "hidden" }}>
              {/* Header */}
              <div className="ag-op-row" style={{ display: "grid", gridTemplateColumns: ORDER_GRID, gap: S[2], padding: `${S[2]}px ${S[4]}px`, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
                {["Origen", "Numero", "Fecha", "Valor", "Estado", "SAG"].map(h => (
                  <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkLight, textTransform: "uppercase" as const }}>{h}</span>
                ))}
              </div>
              {/* CRM rows */}
              {crmQuotes.items.map((q, i) => (
                <div key={q.id} className="ag-op-row" style={{ display: "grid", gridTemplateColumns: ORDER_GRID, gap: S[2], padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}22`, alignItems: "center" }}>
                  <span className="ag-op-status ag-op-status--info" style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold }}>CRM</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{q.quoteNumber ?? q.id.slice(0, 8)}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{fmtDate(q.issuedAt)}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{fmtCurrency(q.amount)}</span>
                  <span className={`ag-op-status ag-op-status--${orderStageVariant(q.stage)}`} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold }}>{q.stage}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: q.sagOrderId ? C.green : C.inkGhost }}>{q.sagOrderId ? "\u2713" : "\u2014"}</span>
                </div>
              ))}
              {/* SAG rows */}
              {sagOrders.items.map((o, i) => (
                <div key={o.id} className="ag-op-row" style={{ display: "grid", gridTemplateColumns: ORDER_GRID, gap: S[2], padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}22`, alignItems: "center" }}>
                  <span className="ag-op-status ag-op-status--scheduled" style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold }}>SAG</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{o.orderNumber ?? String(o.erpMovId ?? "\u2014")}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{fmtDate(o.orderDate)}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{fmtCurrency(o.amount)}</span>
                  <span className={`ag-op-status ag-op-status--${sagOrderStatusVariant(o.status)}`} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold }}>{o.status}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkGhost }}>{String(o.erpMovId ?? "\u2014")}</span>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>
      </div>

      {/* ── Phase 6: Cartera ─────────────────────────────────────────────── */}
      <div id="cartera" style={{ marginTop: S[6] }}>
        <WorkspaceSection title="Cartera" subtitle={receivables.state === "disponible" ? `${receivables.openCount} facturas abiertas` : undefined}>
          {receivables.state === "no_disponible" ? (
            <EmptyOperationalState message="Sin cartera registrada" detail="No hay facturas pendientes de cobro para este cliente." />
          ) : (
            <>
              {/* Cartera summary strip */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[3], marginBottom: S[4] }}>
                <MiniStat label="Total cartera" value={fmtCurrency(receivables.totalBalance)} />
                <MiniStat label="Vencida" value={fmtCurrency(receivables.totalOverdue)} color={receivables.totalOverdue > 0 ? C.red : undefined} />
                <MiniStat label="Facturas abiertas" value={String(receivables.openCount)} />
              </div>
              {/* Receivables table */}
              <div className="ag-op-table" style={{ border: `1px solid ${C.line}`, borderRadius: R.sm, overflow: "hidden" }}>
                <div className="ag-op-row" style={{ display: "grid", gridTemplateColumns: RECEIVABLE_GRID, gap: S[2], padding: `${S[2]}px ${S[4]}px`, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
                  {["Factura", "Monto", "Pagado", "Saldo", "Mora", "Estado"].map(h => (
                    <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkLight, textTransform: "uppercase" as const }}>{h}</span>
                  ))}
                </div>
                {receivables.items.map(r => (
                  <div key={r.id} className={`ag-op-row${r.daysOverdue > 90 ? " ag-op-row--critical" : r.daysOverdue > 30 ? " ag-op-row--warning" : ""}`}
                    style={{ display: "grid", gridTemplateColumns: RECEIVABLE_GRID, gap: S[2], padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}22`, alignItems: "center" }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{r.erpId ?? r.id.slice(0, 8)}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{fmtCurrency(r.originalAmount)}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green }}>{fmtCurrency(r.paidAmount)}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: r.balanceDue > 0 ? C.red : C.ink }}>{fmtCurrency(r.balanceDue)}</span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: r.daysOverdue > 30 ? C.red : r.daysOverdue > 0 ? C.amber : C.inkGhost }}>{r.daysOverdue > 0 ? `${r.daysOverdue}d` : "\u2014"}</span>
                    <span className={`ag-op-status ag-op-status--${receivableStatusVariant(r.status)}`} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold }}>{carteraStatusLabel(r.status)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </WorkspaceSection>
      </div>

      {/* ── Phase 7: Historial comercial ─────────────────────────────────── */}
      <div style={{ marginTop: S[6] }}>
        <WorkspaceSection title="Historial comercial" subtitle={sales.state === "disponible" ? `${sales.items.length} registros` : undefined}>
          {sales.state === "no_disponible" && collections.state === "no_disponible" ? (
            <EmptyOperationalState message="Sin historial comercial" detail="No hay facturas, remisiones ni cobros registrados para este cliente." />
          ) : (
            <div className="ag-op-table" style={{ border: `1px solid ${C.line}`, borderRadius: R.sm, overflow: "hidden" }}>
              <div className="ag-op-row" style={{ display: "grid", gridTemplateColumns: HISTORY_GRID, gap: S[2], padding: `${S[2]}px ${S[4]}px`, background: C.surfaceAlt, borderBottom: `1px solid ${C.line}` }}>
                {["Fecha", "Tipo", "Valor", "Ref"].map(h => (
                  <span key={h} style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold, color: C.inkLight, textTransform: "uppercase" as const }}>{h}</span>
                ))}
              </div>
              {/* Sales */}
              {sales.items.slice(0, 30).map(s => (
                <div key={s.id} className="ag-op-row" style={{ display: "grid", gridTemplateColumns: HISTORY_GRID, gap: S[2], padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}22`, alignItems: "center" }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{fmtDate(s.saleDate)}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
                    {s.sagSourceType === "OFICIAL" ? "Factura" : s.sagSourceType === "REMISION" ? "Remision" : s.sagSourceType ?? "Venta"}
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{fmtCurrency(s.amount)}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{s.comprobanteCode ?? "\u2014"}</span>
                </div>
              ))}
              {/* Collections */}
              {collections.items.slice(0, 20).map(c => (
                <div key={c.id} className="ag-op-row" style={{ display: "grid", gridTemplateColumns: HISTORY_GRID, gap: S[2], padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}22`, alignItems: "center" }}>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>{fmtDate(c.collectionDate)}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green }}>Cobro</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.green }}>{fmtCurrency(c.amount)}</span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight }}>{c.documentNumber ?? "\u2014"}</span>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>
      </div>

      {/* ── Phase 8: Composicion comercial ───────────────────────────────── */}
      <div style={{ marginTop: S[6] }}>
        <WorkspaceSection title="Composicion comercial">
          {productLines.length === 0 ? (
            <EmptyOperationalState message="Pendiente de consolidar" detail="No hay detalle de lineas de producto para este cliente. Se requiere historial de SaleRecord con productLine." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: S[3] }}>
              {productLines.map(pl => (
                <div key={pl.name} style={{ ...panelStyle, padding: S[4] }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, textTransform: "uppercase" as const, marginBottom: S[1] }}>
                    {pl.name}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
                    {fmtCurrency(pl.total)}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
                    {pl.count} transaccion{pl.count !== 1 ? "es" : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>
      </div>

      {/* ── Phase 9: Oportunidades ───────────────────────────────────────── */}
      <div style={{ marginTop: S[6] }}>
        <WorkspaceSection title="Oportunidades" subtitle={opportunities.length > 0 ? `${opportunities.length} detectadas` : undefined}>
          {opportunities.length === 0 ? (
            <EmptyOperationalState message="Sin oportunidades detectadas" detail="No se identificaron oportunidades comerciales con los datos actuales." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
              {opportunities.map(opp => (
                <div key={opp.id} style={{ ...panelStyle, padding: S[4], borderLeft: `3px solid ${oppColor(opp.type)}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
                    <span className={`ag-op-status ag-op-status--${oppVariant(opp.type)}`}
                      style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold }}>
                      {oppLabel(opp.type)}
                    </span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                      {opp.title}
                    </span>
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                    {opp.reason}
                  </div>
                </div>
              ))}
            </div>
          )}
        </WorkspaceSection>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ label, value, textValue, color }: {
  label: string; value?: number; textValue?: string; color?: string;
}) {
  return (
    <div className="ag-kpi-card" style={{ padding: S[4], background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.sm, boxShadow: E.xs }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginBottom: S[1], textTransform: "uppercase" as const }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: color ?? C.ink, lineHeight: 1 }}>
        {textValue ?? (value != null ? (value === 0 ? "\u2014" : value.toLocaleString("es-CO")) : "\u2014")}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ ...panelStyle, padding: `${S[3]}px ${S[4]}px` }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, textTransform: "uppercase" as const }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.bold, color: color ?? C.ink }}>{value}</div>
    </div>
  );
}

// ── Opportunity helpers ───────────────────────────────────────────────────────

function oppVariant(type: string): StatusVariant {
  switch (type) {
    case "cartera": return "critical";
    case "inactividad": return "warning";
    case "conversion": return "pending";
    case "asignacion": return "info";
    case "trazabilidad": return "info";
    default: return "info";
  }
}

function oppColor(type: string): string {
  switch (type) {
    case "cartera": return C.red;
    case "inactividad": return C.amber;
    case "conversion": return C.blueDark;
    case "asignacion": return C.blue;
    case "trazabilidad": return C.blue;
    default: return C.inkLight;
  }
}

function oppLabel(type: string): string {
  switch (type) {
    case "cartera": return "CARTERA";
    case "inactividad": return "INACTIVIDAD";
    case "conversion": return "CONVERSION";
    case "asignacion": return "ASIGNACION";
    case "trazabilidad": return "TRAZABILIDAD";
    default: return type.toUpperCase();
  }
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  background: C.surface,
  border: `1px solid ${C.line}`,
  borderRadius: R.sm,
  boxShadow: E.xs,
};
