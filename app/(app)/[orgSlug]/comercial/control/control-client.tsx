"use client";

/**
 * control-client.tsx
 *
 * CONTROL-COMERCIAL-02
 * Executive Commercial Dashboard — sala ejecutiva comercial.
 *
 * Sections:
 *   1. KPI Strip — ventas, pedidos, ticket, clientes, vendedores
 *   2. Cartera Comercial — total, vencida, %, top moroso
 *   3. Alertas Operativas — with action links
 *   4. Grafico ventas por ciudad (horizontal bars)
 *   5. Tabla Geografia Comercial
 *   6. Ranking Vendedores
 *   7. Clientes Destacados
 *   8. Canales Comerciales
 *   9. Lecturas Comerciales (insights)
 *  10. Inventario resumen
 */

import { C, T, S, R, E } from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import {
  WorkspaceSection,
  EmptyOperationalState,
} from "@/components/shell/operational-primitives";
import { Panel, PanelHeader, KpiCard, Badge } from "@/components/shell/primitives";
import type {
  ControlComercialSnapshot,
  ControlAlerta,
  VendorRankRow,
  GeoRow,
  CustomerHighlight,
  ChannelRow,
  InsightEjecutivo,
} from "@/lib/comercial/control/control-comercial-loader";

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  orgSlug: string;
  snapshot: ControlComercialSnapshot;
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ControlClient({ orgSlug, snapshot }: Props) {
  const s = snapshot;

  const hasCritical = s.alertas.some(a => a.severity === "critical");
  const hasWarning = s.alertas.some(a => a.severity === "warning");
  const headerStatus = hasCritical ? "critical" as const
    : hasWarning ? "warning" as const
    : "ok" as const;
  const headerLabel = hasCritical
    ? `${s.alertas.filter(a => a.severity === "critical").length} alerta(s) critica(s)`
    : hasWarning
    ? `${s.alertas.filter(a => a.severity === "warning").length} situacion(es) pendiente(s)`
    : "Operacion normal";

  return (
    <div>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Comercial", href: `/${orgSlug}/comercial/ventas` },
          { label: "Control" },
        ]}
        title="Control Comercial"
        subtitle="Sala ejecutiva del sistema comercial"
        status={headerStatus}
        statusLabel={headerLabel}
      />

      {/* ═══════ 1. KPI Strip — Ventas ═══════════════════════════════════ */}
      <SectionLabel label={`Ventas \u2014 ${s.periodoVentas}`} source="SAG" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[3], marginBottom: S[4] }}>
        <KpiCard label="VENTAS MES" value={`$${fmtCop(s.ventasMes)}`} dotColor={C.green} source="SAG" />
        <KpiCard label="VENTAS SEMANA" value={`$${fmtCop(s.ventasSemana)}`} dotColor={C.green} source="SAG" />
        <KpiCard label="VENTAS HOY" value={`$${fmtCop(s.ventasHoy)}`} dotColor={s.ventasHoy > 0 ? C.green : C.inkGhost} source="SAG" />
      </div>

      {/* ═══════ KPI Strip — Pedidos + Ticket ════════════════════════════ */}
      <SectionLabel label={`Pedidos CRM \u2014 ${s.periodoPedidos}`} source="CRM" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[3], marginBottom: S[4] }}>
        <KpiCard label="PEDIDOS MES" value={fmtNum(s.pedidosMes)} dotColor={C.blue} source="CRM" />
        <KpiCard label="PEDIDOS TOTAL" value={fmtNum(s.pedidosTotal)} dotColor={C.blue} source="CRM" />
        <KpiCard label="TICKET PROMEDIO" value={`$${fmtCop(s.ticketPromedio)}`} dotColor={C.blue} source="CRM" />
      </div>

      {/* ═══════ KPI Strip — Clientes + Vendedores + Recaudos ═══════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[3], marginBottom: S[6] }}>
        <KpiCard label="CLIENTES ACTIVOS" value={fmtNum(s.clientesActivos)} dotColor={C.green} source="CRM+SAG" />
        <KpiCard label="CLIENTES NUEVOS" value={fmtNum(s.clientesNuevos)} dotColor={C.blueDark} source="Agentik" />
        <KpiCard label="VENDEDORES OPERATIVOS" value={fmtNum(s.vendedoresOperativos)} dotColor={C.blueDark} source="CRM" />
      </div>

      {/* ═══════ 2. Cartera Comercial ════════════════════════════════════ */}
      <WorkspaceSection title="Cartera Comercial" divider={true}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[3], marginBottom: S[3] }}>
          <KpiCard label="CARTERA TOTAL" value={`$${fmtCop(s.cartera.carteraTotal)}`} dotColor={C.amber} source="SAG" />
          <KpiCard label="CARTERA VENCIDA" value={`$${fmtCop(s.cartera.carteraVencida)}`} dotColor={C.red} urgent={s.cartera.pctVencida > 50} source="SAG" />
          <KpiCard label="% VENCIDA" value={`${s.cartera.pctVencida}%`} dotColor={s.cartera.pctVencida > 50 ? C.red : C.amber} urgent={s.cartera.pctVencida > 80} source="SAG" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: S[3], marginBottom: S[3] }}>
          <KpiCard label="CLIENTES CON MORA" value={fmtNum(s.cartera.clientesConMora)} dotColor={C.red} source="SAG" />
          {s.cartera.topMorosoName ? (
            <MiniKpi label="TOP MOROSO" value={s.cartera.topMorosoName} sub={`$${fmtCop(s.cartera.topMorosoMonto)}`} alert />
          ) : (
            <KpiCard label="TOP MOROSO" value="\u2014" dotColor={C.inkGhost} source="SAG" />
          )}
        </div>

        {/* ═══════ Recaudos ══════════════════════════════════════════════ */}
        <SectionLabel label={`Recaudos \u2014 ${s.periodoRecaudos}`} source="SAG" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: S[3] }}>
          <KpiCard label="RECAUDOS MES" value={`$${fmtCop(s.recaudosMes)}`} dotColor={s.recaudosMes > 0 ? C.green : C.inkGhost} source="SAG" />
        </div>

        <div style={{
          marginTop: S[3],
          padding: `${S[1]}px ${S[3]}px`,
          background: C.amberLight,
          border: `1px solid ${C.amberBorder}`,
          borderRadius: R.sm,
          fontFamily: T.mono,
          fontSize: T.sz.xs,
          color: C.amberDark,
        }}>
          Cartera sujeta a conciliacion SAG.
        </div>
      </WorkspaceSection>

      {/* ═══════ 3. Alertas Operativas ═══════════════════════════════════ */}
      {s.alertas.length > 0 && (
        <WorkspaceSection title="Alertas Operativas" divider={true}>
          <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
            {s.alertas.map(alerta => (
              <AlertaRow key={alerta.id} alerta={alerta} />
            ))}
          </div>
        </WorkspaceSection>
      )}

      {/* ═══════ 4. Grafico Ventas por Ciudad ═══════════════════════════ */}
      <WorkspaceSection title="Pedidos CRM por ciudad" divider={true}>
        {s.geoTable.filter(g => g.pedidos > 0).length === 0 ? (
          <EmptyOperationalState
            message="Sin pedidos CRM georeferenciados"
            detail="Los pedidos se enlazan a ciudades via CustomerProfile."
          />
        ) : (
          <GeoBarChart rows={s.geoTable.filter(g => g.pedidos > 0).sort((a, b) => b.valorPedidos - a.valorPedidos).slice(0, 10)} />
        )}
      </WorkspaceSection>

      {/* ═══════ 5. Tabla Geografia Comercial ═══════════════════════════ */}
      <WorkspaceSection title="Geografia Comercial" divider={true}>
        {s.geoTable.length === 0 ? (
          <EmptyOperationalState
            message="Sin datos geograficos"
            detail="Se requiere backfill DANE para habilitar este modulo."
          />
        ) : (
          <Panel style={{ marginBottom: 0 }}>
            <PanelHeader
              title={`Top ${s.geoTable.length} ciudades`}
              icon="📍"
              cta={{ label: "Ver clientes", href: `/${orgSlug}/comercial/clientes` }}
            />
            <div className="ag-op-table">
              <TableHeaderRow cols={[
                { label: "Ciudad", flex: 1 },
                { label: "Departamento", width: 130 },
                { label: "Clientes", width: 75, align: "right" },
                { label: "Pedidos", width: 75, align: "right" },
                { label: "Valor CRM", width: 110, align: "right" },
                { label: "Cartera venc.", width: 110, align: "right" },
              ]} />
              {s.geoTable.map(row => (
                <div key={row.city} className="ag-op-row">
                  <Cell flex={1} bold>{row.city}</Cell>
                  <Cell width={130} color={C.inkMid}>{row.department ?? "\u2014"}</Cell>
                  <Cell width={75} align="right" bold>{fmtNum(row.clientes)}</Cell>
                  <Cell width={75} align="right">{row.pedidos || "\u2014"}</Cell>
                  <Cell width={110} align="right">{row.valorPedidos > 0 ? `$${fmtCop(row.valorPedidos)}` : "\u2014"}</Cell>
                  <Cell width={110} align="right" color={row.carteraVencida > 0 ? C.red : C.inkFaint} bold={row.carteraVencida > 0}>
                    {row.carteraVencida > 0 ? `$${fmtCop(row.carteraVencida)}` : "\u2014"}
                  </Cell>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </WorkspaceSection>

      {/* ═══════ 6. Ranking Vendedores ═══════════════════════════════════ */}
      <WorkspaceSection title="Ranking Vendedores" divider={true}>
        {s.vendorRanking.length === 0 ? (
          <EmptyOperationalState
            message="Sin vendedores con actividad CRM"
            detail="El ranking se genera desde pedidos CRM (CRMQuote)."
          />
        ) : (
          <Panel style={{ marginBottom: 0 }}>
            <PanelHeader
              title={`${s.vendorRanking.length} vendedores`}
              icon="🏆"
              cta={{ label: "Ver vendedores", href: `/${orgSlug}/comercial/vendedores` }}
            />
            <div className="ag-op-table">
              <TableHeaderRow cols={[
                { label: "#", width: 36, align: "center" },
                { label: "Vendedor", flex: 1 },
                { label: "Clientes", width: 75, align: "right" },
                { label: "Pedidos", width: 75, align: "right" },
                { label: "Valor CRM", width: 110, align: "right" },
                { label: "Cartera", width: 110, align: "right" },
                { label: "Ultimo pedido", width: 100, align: "right" },
              ]} />
              {s.vendorRanking.map(v => (
                <VendorRow key={v.slug} vendor={v} orgSlug={orgSlug} />
              ))}
            </div>
          </Panel>
        )}
      </WorkspaceSection>

      {/* ═══════ 7. Clientes Destacados ═════════════════════════════════ */}
      <WorkspaceSection title="Clientes Destacados" divider={true}>
        {s.customerHighlights.length === 0 ? (
          <EmptyOperationalState
            message="Sin clientes destacados"
            detail="Se generan desde pedidos CRM, cartera y recaudos."
          />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[3] }}>
            {s.customerHighlights.map((ch, i) => (
              <CustomerCard key={`${ch.id}-${ch.reason}-${i}`} highlight={ch} orgSlug={orgSlug} />
            ))}
          </div>
        )}
      </WorkspaceSection>

      {/* ═══════ 8. Canales Comerciales ═════════════════════════════════ */}
      <WorkspaceSection title="Canales Comerciales" divider={true}>
        {s.channels.length === 0 ? (
          <EmptyOperationalState
            message="Sin datos de canales"
            detail="Los canales se derivan de SaleRecord.channel."
          />
        ) : (
          <Panel style={{ marginBottom: 0 }}>
            <PanelHeader title="Canales" icon="📡" />
            <div className="ag-op-table">
              <TableHeaderRow cols={[
                { label: "Canal", flex: 1 },
                { label: "Registros", width: 80, align: "right" },
                { label: "Valor", width: 120, align: "right" },
                { label: "Puntos", width: 75, align: "right" },
                { label: "Estado", width: 120, align: "center" },
              ]} />
              {s.channels.map(ch => (
                <ChannelRowItem key={ch.channel} row={ch} />
              ))}
            </div>
          </Panel>
        )}
      </WorkspaceSection>

      {/* ═══════ 9. Lecturas Comerciales ════════════════════════════════ */}
      {s.insights.length > 0 && (
        <WorkspaceSection title="Lecturas Comerciales" divider={true}>
          <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
            {s.insights.map(ins => (
              <InsightRow key={ins.id} insight={ins} />
            ))}
          </div>
        </WorkspaceSection>
      )}

      {/* ═══════ 10. Inventario ═════════════════════════════════════════ */}
      <WorkspaceSection title="Resumen Inventario" divider={true}>
        <Panel style={{ marginBottom: 0 }}>
          <PanelHeader
            title="Estado del inventario"
            icon="📦"
            cta={{ label: "Ver inventario", href: `/${orgSlug}/comercial/inventario` }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: S[2], padding: S[3] }}>
            <MiniKpi label="Refs totales" value={fmtNum(s.refsTotales)} />
            <MiniKpi label="Criticas (<20 uds)" value={fmtNum(s.refsCriticas)} alert={s.refsCriticas > 0} />
            <MiniKpi label="Agotadas" value={fmtNum(s.refsAgotadas)} alert={s.refsAgotadas > 0} />
            <MiniKpi label="Con OP pendiente" value={fmtNum(s.refsConOp)} />
          </div>
        </Panel>
      </WorkspaceSection>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionLabel({ label, source }: { label: string; source: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      marginBottom: S[2],
    }}>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
        color: C.inkLight, textTransform: "uppercase" as const, letterSpacing: "0.05em",
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"],
        color: C.inkFaint, background: C.surface,
        padding: `1px ${S[2]}px`, borderRadius: R.sm,
        border: `1px solid ${C.lineSubtle}`,
      }}>
        {source}
      </span>
    </div>
  );
}

function TableHeaderRow({ cols }: { cols: Array<{ label: string; flex?: number; width?: number; align?: string }> }) {
  return (
    <div className="ag-op-row" style={{
      background: C.surfaceAlt,
      fontWeight: T.wt.bold,
      fontSize: T.sz.xs,
      textTransform: "uppercase" as const,
      letterSpacing: "0.05em",
      color: C.inkLight,
    }}>
      {cols.map(col => (
        <span key={col.label} style={{
          flex: col.flex, width: col.width, textAlign: (col.align ?? "left") as any,
          fontFamily: T.mono,
        }}>
          {col.label}
        </span>
      ))}
    </div>
  );
}

function Cell({ children, flex, width, align, color, bold }: {
  children: React.ReactNode; flex?: number; width?: number;
  align?: string; color?: string; bold?: boolean;
}) {
  return (
    <span style={{
      flex, width, textAlign: (align ?? "left") as any,
      fontFamily: T.mono, fontSize: T.sz.base,
      fontWeight: bold ? T.wt.bold : T.wt.normal,
      color: color ?? C.ink,
      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
    }}>
      {children}
    </span>
  );
}

// ── GeoBarChart ──────────────────────────────────────────────────────────────

function GeoBarChart({ rows }: { rows: GeoRow[] }) {
  const maxVal = Math.max(...rows.map(r => r.valorPedidos), 1);
  return (
    <Panel style={{ marginBottom: 0 }}>
      <PanelHeader title="Top ciudades por valor CRM" icon="📊" />
      <div style={{ padding: S[3] }}>
        {rows.map(row => {
          const pct = Math.max((row.valorPedidos / maxVal) * 100, 2);
          return (
            <div key={row.city} style={{ marginBottom: S[2] }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                marginBottom: 2,
              }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.medium, color: C.ink }}>
                  {row.city}
                  {row.department && (
                    <span style={{ color: C.inkFaint, fontWeight: T.wt.normal }}> \u2014 {row.department}</span>
                  )}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                  ${fmtCop(row.valorPedidos)}
                </span>
              </div>
              <div style={{
                height: 14,
                background: C.lineSubtle,
                borderRadius: R.sm,
                overflow: "hidden",
              }}>
                <div style={{
                  width: `${pct}%`,
                  height: "100%",
                  background: C.blueDark,
                  borderRadius: R.sm,
                  transition: "width 0.3s",
                }} />
              </div>
              <div style={{
                display: "flex", gap: S[3], marginTop: 2,
                fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
              }}>
                <span>{row.clientes} clientes</span>
                <span>{row.pedidos} pedidos</span>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ── VendorRow ─────────────────────────────────────────────────────────────────

function VendorRow({ vendor, orgSlug }: { vendor: VendorRankRow; orgSlug: string }) {
  const isTop3 = vendor.ranking <= 3;
  const medal = vendor.ranking === 1 ? "\u{1F947}" : vendor.ranking === 2 ? "\u{1F948}" : vendor.ranking === 3 ? "\u{1F949}" : null;

  return (
    <a
      href={`/${orgSlug}/comercial/vendedores/${vendor.slug}`}
      className="ag-op-row"
      style={{
        textDecoration: "none", color: "inherit", cursor: "pointer",
        background: isTop3 ? C.blueLight : undefined,
      }}
    >
      <Cell width={36} align="center" bold={isTop3} color={isTop3 ? C.blueDark : C.inkMid}>
        {medal ?? vendor.ranking}
      </Cell>
      <Cell flex={1} bold={isTop3}>{vendor.name}</Cell>
      <Cell width={75} align="right">{vendor.clientesCrm || "\u2014"}</Cell>
      <Cell width={75} align="right">{vendor.pedidosCrm || "\u2014"}</Cell>
      <Cell width={110} align="right" bold color={vendor.valorCrm > 0 ? C.ink : C.inkFaint}>
        {vendor.valorCrm > 0 ? `$${fmtCop(vendor.valorCrm)}` : "\u2014"}
      </Cell>
      <Cell width={110} align="right" color={vendor.carteraAsociada > 0 ? C.red : C.inkFaint}>
        {vendor.carteraAsociada > 0 ? `$${fmtCop(vendor.carteraAsociada)}` : "\u2014"}
      </Cell>
      <Cell width={100} align="right" color={C.inkMid}>
        {vendor.ultimoPedido ?? "\u2014"}
      </Cell>
    </a>
  );
}

// ── ChannelRowItem ──────────────────────────────────────────────────────────

function ChannelRowItem({ row }: { row: ChannelRow }) {
  const statusColor = row.status === "activo" ? C.green
    : row.status === "sin_datos" ? C.inkFaint
    : C.amber;
  const statusLabel = row.status === "activo" ? "Activo"
    : row.status === "sin_datos" ? "Sin datos"
    : "Pendiente integracion";

  return (
    <div className="ag-op-row">
      <Cell flex={1} bold>{row.channel}</Cell>
      <Cell width={80} align="right">{row.pedidos || "\u2014"}</Cell>
      <Cell width={120} align="right" bold>{row.valor > 0 ? `$${fmtCop(row.valor)}` : "\u2014"}</Cell>
      <Cell width={75} align="right">{row.clientes || "\u2014"}</Cell>
      <span style={{
        width: 120, textAlign: "center",
        fontFamily: T.mono, fontSize: T.sz.xs,
      }}>
        <span className={`ag-op-status ag-op-status--${row.status === "activo" ? "ok" : row.status === "sin_datos" ? "neutral" : "warning"}`}>
          {statusLabel}
        </span>
      </span>
    </div>
  );
}

// ── CustomerCard ────────────────────────────────────────────────────────────

function CustomerCard({ highlight, orgSlug }: { highlight: CustomerHighlight; orgSlug: string }) {
  const colors: Record<CustomerHighlight["reason"], { fg: string; bg: string; border: string }> = {
    top_buyer:           { fg: C.green,    bg: C.greenLight,  border: C.greenBorder },
    top_collector:       { fg: C.blueDark, bg: C.blueLight,   border: C.blueBorder },
    high_risk:           { fg: C.red,      bg: C.redLight,    border: C.redBorder },
    no_recent_purchase:  { fg: C.amber,    bg: C.amberLight,  border: C.amberBorder },
  };
  const c = colors[highlight.reason];

  const badgeVariant = highlight.reason === "high_risk" ? "danger" as const
    : highlight.reason === "top_buyer" ? "success" as const
    : highlight.reason === "no_recent_purchase" ? "warning" as const
    : "neutral" as const;

  return (
    <a
      href={`/${orgSlug}/comercial/clientes/${highlight.id}`}
      style={{
        textDecoration: "none", color: "inherit", display: "block",
        padding: S[3], background: c.bg, border: `1px solid ${c.border}`,
        borderRadius: R.card, cursor: "pointer",
        borderLeft: `3px solid ${c.fg}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[1] }}>
        <Badge variant={badgeVariant} size="xs">{highlight.label}</Badge>
      </div>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.md, fontWeight: T.wt.bold,
        color: C.ink, marginBottom: 2,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
      }}>
        {highlight.name}
      </div>
      {highlight.city && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginBottom: 2 }}>
          {highlight.city}
        </div>
      )}
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
        {highlight.detail}
      </div>
    </a>
  );
}

// ── InsightRow ──────────────────────────────────────────────────────────────

function InsightRow({ insight }: { insight: InsightEjecutivo }) {
  const dotColor = insight.severity === "critical" ? C.red
    : insight.severity === "warning" ? C.amber
    : C.blueDark;

  return (
    <div style={{
      display: "flex", gap: S[2], alignItems: "center",
      padding: `${S[2]}px ${S[3]}px`,
      background: C.surface,
      borderRadius: R.md,
      border: `1px solid ${C.lineSubtle}`,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: R.pill,
        background: dotColor, flexShrink: 0,
      }} />
      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>
        {insight.text}
      </span>
    </div>
  );
}

// ── AlertaRow ─────────────────────────────────────────────────────────────────

function AlertaRow({ alerta }: { alerta: ControlAlerta }) {
  const isCritical = alerta.severity === "critical";
  const isWarning = alerta.severity === "warning";

  const bg = isCritical ? C.redLight : isWarning ? C.amberLight : C.surface;
  const border = isCritical ? C.redBorder : isWarning ? C.amberBorder : C.line;
  const dotColor = isCritical ? C.red : isWarning ? C.amber : C.inkGhost;
  const moduleBadgeVariant = isCritical ? "danger" as const
    : isWarning ? "warning" as const
    : "neutral" as const;

  return (
    <div style={{
      display: "flex", gap: S[2], alignItems: "flex-start",
      padding: `${S[2]}px ${S[3]}px`,
      background: bg, borderRadius: R.card,
      border: `1px solid ${border}`,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: R.pill,
        background: dotColor, marginTop: 4, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: 2 }}>
          <Badge variant={moduleBadgeVariant} size="xs">{alerta.module}</Badge>
          <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
            {alerta.title}
          </span>
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
          {alerta.detail}
        </div>
      </div>
      {alerta.action && (
        <a
          href={alerta.action.href}
          style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
            color: C.blueDark, textDecoration: "none",
            padding: `${S[1]}px ${S[2]}px`,
            borderRadius: R.sm,
            border: `1px solid ${C.blueBorder}`,
            background: C.blueLight,
            whiteSpace: "nowrap" as const,
            flexShrink: 0,
          }}
        >
          {alerta.action.label}
        </a>
      )}
    </div>
  );
}

// ── MiniKpi ───────────────────────────────────────────────────────────────────

function MiniKpi({ label, value, sub, alert }: {
  label: string; value: string; sub?: string; alert?: boolean;
}) {
  return (
    <div style={{
      padding: `${S[2]}px ${S[3]}px`,
      background: alert ? C.redLight : C.surface,
      borderRadius: R.card,
      border: `1px solid ${alert ? C.redBorder : C.lineSubtle}`,
    }}>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
        color: C.inkLight, textTransform: "uppercase" as const,
        letterSpacing: "0.05em", marginBottom: 2,
      }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.black,
        color: alert ? C.red : C.ink,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const,
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 1 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return n.toLocaleString("es-CO");
}

function fmtCop(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return n.toLocaleString("es-CO");
}
