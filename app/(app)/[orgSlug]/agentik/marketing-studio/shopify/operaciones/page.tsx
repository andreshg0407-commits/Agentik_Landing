/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/operaciones/page.tsx
 *
 * SHOPIFY-OPERATIONS-01 — Operaciones
 *
 * Operational workspace for the full commercial cycle of a Shopify store.
 * Models the complete order lifecycle: pedido → pago → preparación →
 * despacho → tránsito → entrega → devolución → reembolso.
 *
 * Server component — NO AI, NO Copilot calls.
 * Phase 1: Read-only operational view. Write operations in SHOPIFY-OPERATIONS-02.
 */

import { redirect }                  from "next/navigation";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";
import { C, T, S, R }               from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { Panel, PanelHeader }        from "@/components/shell/primitives";
import { getIntegrationConnection }  from "@/lib/integrations/integration-repository";
import { getIntegrationSecret }      from "@/lib/integrations/vault/vault-service";
import { SECRET_TYPE }               from "@/lib/integrations/vault/vault-types";
import { CONNECTION_STATUS }         from "@/lib/integrations/integration-types";
import {
  listOperations,
  generateOperationalSummary,
} from "@/lib/marketing-studio/commerce/shopify-operations-service";
import type {
  OperationOrderSummary,
  OperationShipmentSummary,
  OperationListResult,
} from "@/lib/marketing-studio/commerce/shopify-operations-types";

// ── Status tokens ──────────────────────────────────────────────────────────────

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending:              "Nuevo",
  pending_payment:      "Pendiente pago",
  paid:                 "Pagado",
  preparing:            "Preparando",
  dispatched:           "Despachado",
  in_transit:           "En tránsito",
  delivered:            "Entregado",
  on_hold:              "En pausa",
  cancelled:            "Cancelado",
  refunded:             "Reembolsado",
  partially_refunded:   "Reemb. parcial",
  returned:             "Devuelto",
  failed:               "Fallido",
};

const ORDER_STATUS_COLOR: Record<string, string> = {
  pending:              C.inkMid,
  pending_payment:      C.amber,
  paid:                 C.blueDark,
  preparing:            C.blueDark,
  dispatched:           C.green,
  in_transit:           C.green,
  delivered:            C.green,
  on_hold:              C.amber,
  cancelled:            C.inkMid,
  refunded:             C.red,
  partially_refunded:   C.red,
  returned:             C.red,
  failed:               C.red,
};

const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  pending:              "Sin despachar",
  preparing:            "Preparando",
  dispatched:           "Despachado",
  in_transit:           "En tránsito",
  out_for_delivery:     "En reparto",
  delivered:            "Entregado",
  failed_delivery:      "Entrega fallida",
  returned_to_sender:   "Devuelto",
  lost:                 "Extraviado",
  unknown:              "Sin datos",
};

// ── Order row ──────────────────────────────────────────────────────────────────

function OrderRow({ order }: { order: OperationOrderSummary }) {
  const statusColor = ORDER_STATUS_COLOR[order.status] ?? C.inkMid;
  const amount = order.totalAmount.toLocaleString("es-CO", {
    style:    "currency",
    currency: order.currency,
    minimumFractionDigits: 0,
  });

  return (
    <div className="ag-op-row" style={{ alignItems: "center", gap: S[3] }}>
      {/* Order number + customer */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>
          {order.orderNumber}
          {order.requiresAttention && (
            <span style={{
              marginLeft: S[2], fontFamily: T.mono, fontSize: T.sz.xs,
              color: C.red, background: C.redLight,
              border: `1px solid ${C.redBorder}`,
              borderRadius: R.pill, padding: `1px ${S[2]}px`,
            }}>
              Atención
            </span>
          )}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 1 }}>
          {order.customerName ?? order.customerEmail ?? "Cliente no identificado"}
          {order.destinationCity && (
            <span style={{ marginLeft: S[2] }}>· {order.destinationCity}</span>
          )}
        </div>
      </div>

      {/* Amount */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, flexShrink: 0 }}>
        {amount}
      </div>

      {/* Date */}
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, flexShrink: 0 }}>
        {new Date(order.createdAt).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
      </div>

      {/* Status badge */}
      <span style={{
        fontFamily:   T.mono,
        fontSize:     T.sz.xs,
        color:        statusColor,
        background:   `${statusColor}18`,
        border:       `1px solid ${statusColor}40`,
        borderRadius: R.pill,
        padding:      `2px ${S[2]}px`,
        flexShrink:   0,
        whiteSpace:   "nowrap" as const,
      }}>
        {ORDER_STATUS_LABEL[order.status] ?? order.status}
      </span>
    </div>
  );
}

// ── Shipment row ───────────────────────────────────────────────────────────────

function ShipmentRow({ shipment }: { shipment: OperationShipmentSummary }) {
  const isStalled = (shipment.daysSinceLastUpdate ?? 0) >= 5;

  return (
    <div className="ag-op-row" style={{ alignItems: "center", gap: S[3] }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink }}>
          {shipment.orderNumber}
          {shipment.carrier && (
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginLeft: S[2] }}>
              · {shipment.carrier}
            </span>
          )}
        </div>
        {shipment.lastEvent && (
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 1 }}>
            {shipment.lastEvent}
            {shipment.destinationCity && ` · ${shipment.destinationCity}`}
          </div>
        )}
      </div>

      {isStalled && shipment.daysSinceLastUpdate != null && (
        <span style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber,
          background: C.amberLight, border: `1px solid ${C.amberBorder}`,
          borderRadius: R.pill, padding: `2px ${S[2]}px`, flexShrink: 0,
        }}>
          {shipment.daysSinceLastUpdate}d sin actualizar
        </span>
      )}

      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs,
        color: shipment.status === "delivered" ? C.green : shipment.status === "failed_delivery" ? C.red : C.blueDark,
        background: C.surfaceAlt, border: `1px solid ${C.line}`,
        borderRadius: R.pill, padding: `2px ${S[2]}px`, flexShrink: 0,
      }}>
        {SHIPMENT_STATUS_LABEL[shipment.status] ?? shipment.status}
      </span>
    </div>
  );
}

// ── Alert strip ────────────────────────────────────────────────────────────────

function AlertStrip({ count, label, color, bg, border }: {
  count: number; label: string;
  color: string; bg: string; border: string;
}) {
  if (count === 0) return null;
  return (
    <div style={{
      fontFamily: T.mono, fontSize: T.sz.xs,
      color, background: bg, border: `1px solid ${border}`,
      borderRadius: R.md, padding: `${S[2]}px ${S[3]}px`,
      marginBottom: S[3],
    }}>
      {count} {label}
    </div>
  );
}

// ── Disconnected state ─────────────────────────────────────────────────────────

function DisconnectedState({ orgSlug }: { orgSlug: string }) {
  return (
    <Panel>
      <div style={{ padding: `${S[8]}px ${S[4]}px`, textAlign: "center" }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, marginBottom: S[2] }}>
          Shopify no conectado
        </div>
        <p style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginBottom: S[4] }}>
          Conecta tu tienda para administrar operaciones, pedidos y envíos desde Agentik.
        </p>
        <a
          href={`/api/integrations/shopify/connect?orgSlug=${orgSlug}`}
          style={{
            fontFamily: T.mono, fontSize: T.sz.sm,
            color: "#fff", background: C.blueDark,
            borderRadius: R.md, padding: `${S[2]}px ${S[4]}px`,
            textDecoration: "none", display: "inline-block",
          }}
        >
          Conectar Shopify →
        </a>
      </div>
    </Panel>
  );
}

// ── Metric cell ────────────────────────────────────────────────────────────────

function MetricCell({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div style={{
      flex: 1, minWidth: 100,
      padding: `${S[3]}px ${S[4]}px`,
      background: C.surface, border: `1px solid ${C.line}`,
      borderRadius: R.md,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, color: color ?? C.ink, fontWeight: T.wt.bold }}>
        {value}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function OperacionesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }                  = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  // Resolve Shopify connection
  const connection  = await getIntegrationConnection(organization.id, "shopify");
  const isConnected = connection?.status === CONNECTION_STATUS.CONNECTED && !!connection.shopDomain;

  let ops: OperationListResult | null = null;

  if (isConnected && connection?.id) {
    const vaultSecret = await getIntegrationSecret({
      organizationId: organization.id,
      connectionId:   connection.id,
      secretType:     SECRET_TYPE.ACCESS_TOKEN,
    });

    if (vaultSecret) {
      try {
        ops = await listOperations(
          organization.id,
          vaultSecret.plainValue,   // ⚠ server-only
          connection.shopDomain!,
        );
      } catch {
        // Non-blocking — render with empty state
      }
    }
  }

  const totalOrders   = ops?.total ?? 0;
  const criticalCount = ops?.alerts.critical ?? 0;
  const summary       = ops ? generateOperationalSummary(ops) : null;

  const statusLabel = !isConnected
    ? "Shopify desconectado"
    : criticalCount > 0
      ? `${criticalCount} alerta${criticalCount !== 1 ? "s" : ""} crítica${criticalCount !== 1 ? "s" : ""}`
      : totalOrders > 0
        ? `${totalOrders} pedido${totalOrders !== 1 ? "s" : ""} activo${totalOrders !== 1 ? "s" : ""}`
        : "Sin pedidos activos";

  return (
    <div style={{ maxWidth: 1100, fontFamily: T.mono }}>
      <OperationalWorkspaceHeader
        title="Operaciones"
        subtitle="Ciclo de vida completo de ventas · Pedidos · Pagos · Envíos · Devoluciones"
        status={!isConnected ? "neutral" : criticalCount > 0 ? "critical" : totalOrders > 0 ? "ok" : "neutral"}
        statusLabel={statusLabel}
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Shopify", href: `/${orgSlug}/agentik/marketing-studio/shopify` },
          { label: "Operaciones" },
        ]}
      />

      <div style={{ padding: `${S[4]}px 0` }}>
        {!isConnected ? (
          <DisconnectedState orgSlug={orgSlug} />
        ) : (
          <>
            {/* ── Copilot-readable summary ── */}
            {summary && (
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
                background: C.surface, border: `1px solid ${C.line}`,
                borderRadius: R.md, padding: `${S[2]}px ${S[3]}px`,
                marginBottom: S[4],
              }}>
                {summary}
              </div>
            )}

            {/* ── Alert strips ── */}
            <AlertStrip
              count={ops?.alerts.critical ?? 0}
              label={`alerta${(ops?.alerts.critical ?? 0) !== 1 ? "s" : ""} crítica${(ops?.alerts.critical ?? 0) !== 1 ? "s" : ""} — revisión inmediata requerida.`}
              color={C.red} bg={C.redLight} border={C.redBorder}
            />
            <AlertStrip
              count={ops?.alerts.stalledShipments ?? 0}
              label={`envío${(ops?.alerts.stalledShipments ?? 0) !== 1 ? "s" : ""} sin movimiento.`}
              color={C.amber} bg={C.amberLight} border={C.amberBorder}
            />

            {/* ── Metrics strip ── */}
            {ops && (
              <div style={{ display: "flex", gap: S[3], flexWrap: "wrap" as const, marginBottom: S[5] }}>
                <MetricCell value={ops.pendingPayment.length} label="Pendientes pago" color={C.amber} />
                <MetricCell value={ops.preparing.length}      label="Preparando"      color={C.blueDark} />
                <MetricCell value={ops.inTransit.length}      label="En tránsito"     color={C.blueDark} />
                <MetricCell value={ops.delivered.length}      label="Entregados"      color={C.green} />
                <MetricCell value={ops.alerts.ordersAtRisk}   label="Requieren atención" color={C.red} />
              </div>
            )}

            {/* ── Pending payment ── */}
            {(ops?.pendingPayment.length ?? 0) > 0 && (
              <Panel style={{ marginBottom: S[4] }}>
                <PanelHeader title="Pendientes de pago" />
                <div className="ag-op-table">
                  {ops!.pendingPayment.map(o => <OrderRow key={o.id} order={o} />)}
                </div>
              </Panel>
            )}

            {/* ── In transit ── */}
            {(ops?.inTransit.length ?? 0) > 0 && (
              <Panel style={{ marginBottom: S[4] }}>
                <PanelHeader title="En tránsito" />
                <div className="ag-op-table">
                  {ops!.inTransit.map(s => <ShipmentRow key={s.id} shipment={s} />)}
                </div>
              </Panel>
            )}

            {/* ── Preparing ── */}
            {(ops?.preparing.length ?? 0) > 0 && (
              <Panel style={{ marginBottom: S[4] }}>
                <PanelHeader title="Preparando" />
                <div className="ag-op-table">
                  {ops!.preparing.map(o => <OrderRow key={o.id} order={o} />)}
                </div>
              </Panel>
            )}

            {/* ── Delivered ── */}
            {(ops?.delivered.length ?? 0) > 0 && (
              <Panel style={{ marginBottom: S[4] }}>
                <PanelHeader title="Entregados" />
                <div className="ag-op-table">
                  {ops!.delivered.map(o => <OrderRow key={o.id} order={o} />)}
                </div>
              </Panel>
            )}

            {/* ── Cancelled / failed ── */}
            {(ops?.cancelled.length ?? 0) > 0 && (
              <Panel style={{ marginBottom: S[4] }}>
                <PanelHeader title="Cancelados y fallidos" />
                <div className="ag-op-table">
                  {ops!.cancelled.map(o => <OrderRow key={o.id} order={o} />)}
                </div>
              </Panel>
            )}

            {/* ── Empty state ── */}
            {ops && ops.total === 0 && (
              <Panel>
                <div style={{
                  padding: `${S[8]}px ${S[4]}px`,
                  textAlign: "center",
                  fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid,
                }}>
                  Sin pedidos registrados en la tienda.
                </div>
              </Panel>
            )}
          </>
        )}
      </div>
    </div>
  );
}
