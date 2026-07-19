"use client";

/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/operaciones/operaciones-client.tsx
 *
 * SHOPIFY-MODULE-MATURITY-03 — Operaciones: Torre de Control
 * AGENTIK-COPILOT-BOUNDARIES-01 — Copilot lives in the right rail only
 *
 * Identity: this module is an operations control tower, not a metrics grid.
 *   - Protagonist block shows the full order flow + distribution bar + risk meter
 *   - Context-aware drawer actions (getOperationDrawerActions)
 *   - Canvas contains only module data
 *   - Right rail + drawer "Análisis de Sofía" section carry Copilot intelligence
 */

import { useState, useCallback }       from "react";
import { C, T, S, R, E }              from "@/lib/ui/tokens";
import { OperationalSideDrawer }       from "@/components/workspace/operational-side-drawer";
import type { DrawerSeverity }         from "@/components/workspace/operational-side-drawer";
import {
  ShopifyKpiCard,
  ShopifyDrawerSection,
  ShopifyDrawerAction,
  ShopifyPlaceholderRow,
  ShopifyActivationTimeline,
  ShopifyDistributionBar,
  ShopifyStageFlow,
  ShopifyRiskMeter,
}                                      from "@/components/marketing-studio/shopify/shopify-module-primitives";

import type {
  OperationListResult,
  OperationOrderSummary,
  OperationShipmentSummary,
}                                      from "@/lib/marketing-studio/commerce/shopify-operations-types";

// ── Public types ───────────────────────────────────────────────────────────────

export interface OperacionesClientProps {
  orgSlug:    string;
  connected:  boolean;
  shopDomain: string;
  ops:        OperationListResult | null;
  summary:    string | null;
}

type DrawerId =
  | "pendientes" | "preparando" | "en_transito" | "entregados"
  | "incidencias" | "devoluciones" | "tiempo_prom" | "alertas";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  return new Intl.NumberFormat("es-CO").format(n);
}

function fmtCurrency(amount: number, currency = "COP"): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

// ── Status maps ────────────────────────────────────────────────────────────────

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending:             "Nuevo",
  pending_payment:     "Pendiente pago",
  paid:                "Pagado",
  preparing:           "Preparando",
  dispatched:          "Despachado",
  in_transit:          "En tránsito",
  delivered:           "Entregado",
  on_hold:             "En pausa",
  cancelled:           "Cancelado",
  refunded:            "Reembolsado",
  partially_refunded:  "Reemb. parcial",
  returned:            "Devuelto",
  failed:              "Fallido",
};

const ORDER_STATUS_COLOR: Record<string, string> = {
  pending:             C.inkMid,
  pending_payment:     C.amber,
  paid:                C.blueDark,
  preparing:           C.blueDark,
  dispatched:          C.green,
  in_transit:          C.green,
  delivered:           C.green,
  on_hold:             C.amber,
  cancelled:           C.inkMid,
  refunded:            C.red,
  partially_refunded:  C.red,
  returned:            C.red,
  failed:              C.red,
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

// ── Activation steps ───────────────────────────────────────────────────────────

const ACTIVATION_STEPS = [
  "Conectar tienda Shopify",
  "Sincronizar pedidos y envíos",
  "Configurar alertas operativas",
  "Activar seguimiento de transportadoras",
];

// ── Context-aware drawer actions ───────────────────────────────────────────────

type ActionSpec = { label: string; intent: string };

interface OperationActionCtx {
  drawerId:      DrawerId;
  pendingCount:  number;
  stalledCount:  number;
  cancelledCount: number;
  criticalCount: number;
  atRiskCount:   number;
  totalOrders:   number;
}

function getOperationDrawerActions(ctx: OperationActionCtx): ActionSpec[] {
  const { drawerId, pendingCount, stalledCount, cancelledCount, criticalCount, atRiskCount, totalOrders } = ctx;

  if (drawerId === "pendientes" && pendingCount > 0) return [
    { label: "Revisar pedidos pendientes",       intent: "operations.review_pending"    },
    { label: "Preparar seguimiento de pago",     intent: "operations.followup_payment"  },
    { label: "Marcar para revisión manual",      intent: "operations.mark_review"       },
  ];

  if (drawerId === "en_transito" && stalledCount > 0) return [
    { label: "Analizar retrasos de envío",       intent: "operations.analyze_delays"    },
    { label: "Preparar mensaje de seguimiento",  intent: "operations.notify_customers"  },
    { label: "Revisar transportadora",           intent: "operations.contact_carrier"   },
  ];

  if (drawerId === "devoluciones" && cancelledCount > 0) return [
    { label: "Inspeccionar devoluciones",        intent: "operations.inspect_returns"        },
    { label: "Analizar causa de cancelaciones",  intent: "operations.analyze_cancellations"  },
    { label: "Preparar plan de reducción",       intent: "operations.reduce_returns_plan"    },
  ];

  if (drawerId === "alertas" && criticalCount > 0) return [
    { label: "Revisar alertas críticas",         intent: "operations.review_critical"    },
    { label: "Preparar plan de contingencia",    intent: "operations.contingency_plan"   },
    { label: "Notificar equipo operativo",       intent: "operations.notify_team"        },
  ];

  if (drawerId === "incidencias" && atRiskCount > 0) return [
    { label: "Revisar pedidos en riesgo",        intent: "operations.review_risk"        },
    { label: "Marcar para atención inmediata",   intent: "operations.mark_urgent"        },
    { label: "Preparar plan de seguimiento",     intent: "operations.followup_plan"      },
  ];

  if (drawerId === "preparando") return [
    { label: "Ver pedidos en preparación",       intent: "operations.list_preparing"     },
    { label: "Priorizar por fecha compromiso",   intent: "operations.prioritize_orders"  },
    { label: "Generar lista de despacho",        intent: "operations.dispatch_list"      },
  ];

  if (drawerId === "entregados" && totalOrders > 0) return [
    { label: "Ver confirmaciones de entrega",    intent: "operations.list_delivered"     },
    { label: "Revisar operación reciente",       intent: "operations.review_recent"      },
    { label: "Preparar resumen ejecutivo",       intent: "operations.executive_summary"  },
  ];

  // No active issues — opportunities mode
  return [
    { label: "Revisar operación reciente",       intent: "operations.review_recent"         },
    { label: "Explorar oportunidades operativas", intent: "operations.explore_opportunities" },
    { label: "Preparar resumen ejecutivo",       intent: "operations.executive_summary"     },
  ];
}

// ── Order row ──────────────────────────────────────────────────────────────────

function OrderRow({ order }: { order: OperationOrderSummary }) {
  const statusColor = ORDER_STATUS_COLOR[order.status] ?? C.inkMid;
  return (
    <div className="ag-op-row" style={{ alignItems: "center", gap: S[3] }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: T.wt.medium }}>
          {order.orderNumber}
          {order.requiresAttention && (
            <span style={{
              marginLeft: S[2], fontFamily: T.mono, fontSize: T.sz["2xs"],
              color: C.red, background: C.redLight,
              border: `1px solid ${C.redBorder}`, borderRadius: R.pill,
              padding: `1px ${S[1]}px`,
            }}>
              Atención
            </span>
          )}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
          {order.customerName ?? order.customerEmail ?? "Cliente no identificado"}
          {order.destinationCity && <span style={{ marginLeft: S[2] }}>· {order.destinationCity}</span>}
        </div>
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, flexShrink: 0 }}>
        {fmtCurrency(order.totalAmount, order.currency)}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, flexShrink: 0 }}>
        {fmtDate(order.createdAt)}
      </div>
      <span style={{
        fontFamily:   T.mono, fontSize: T.sz.xs,
        color:        statusColor, background: `${statusColor}18`,
        border:       `1px solid ${statusColor}40`,
        borderRadius: R.pill, padding: `2px ${S[2]}px`,
        flexShrink:   0, whiteSpace: "nowrap" as const,
      }}>
        {ORDER_STATUS_LABEL[order.status] ?? order.status}
      </span>
    </div>
  );
}

// ── Shipment row ───────────────────────────────────────────────────────────────

function ShipmentRow({ shipment }: { shipment: OperationShipmentSummary }) {
  const isStalled = (shipment.daysSinceLastUpdate ?? 0) >= 5;
  const shipColor =
    shipment.status === "delivered"       ? C.green :
    shipment.status === "failed_delivery" ? C.red   : C.blueDark;

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
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
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
          {shipment.daysSinceLastUpdate}d sin mover
        </span>
      )}
      <span style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: shipColor,
        background: `${shipColor}18`, border: `1px solid ${shipColor}40`,
        borderRadius: R.pill, padding: `2px ${S[2]}px`, flexShrink: 0,
      }}>
        {SHIPMENT_STATUS_LABEL[shipment.status] ?? shipment.status}
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function OperacionesClient({
  orgSlug, connected, shopDomain, ops, summary,
}: OperacionesClientProps) {

  const [openDrawer,  setOpenDrawer]  = useState<DrawerId | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [results,     setResults]     = useState<Record<string, { status: string; message: string }>>({});

  const hasData = ops !== null;

  // ── Computed indicators ──────────────────────────────────────────────────
  const pendingCount   = ops?.pendingPayment.length   ?? 0;
  const preparingCount = ops?.preparing.length        ?? 0;
  const inTransitCount = ops?.inTransit.length        ?? 0;
  const deliveredCount = ops?.delivered.length        ?? 0;
  const cancelledCount = ops?.cancelled.length        ?? 0;
  const totalOrders    = ops?.total                   ?? 0;
  const criticalCount  = ops?.alerts.critical         ?? 0;
  const stalledCount   = ops?.alerts.stalledShipments ?? 0;
  const atRiskCount    = ops?.alerts.ordersAtRisk     ?? 0;
  const alertCount     = criticalCount + stalledCount;

  const riskLevel: "ok" | "warning" | "critical" =
    criticalCount > 0 ? "critical" : stalledCount > 0 ? "warning" : "ok";

  const riskLabel =
    criticalCount > 0
      ? `${criticalCount} alerta${criticalCount !== 1 ? "s" : ""} crítica${criticalCount !== 1 ? "s" : ""}`
      : stalledCount > 0
      ? `${stalledCount} envío${stalledCount !== 1 ? "s" : ""} sin movimiento`
      : "Operación dentro de parámetros normales";

  // ── Execute action ───────────────────────────────────────────────────────
  const executeAction = useCallback(async (intent: string) => {
    setExecutingId(intent);
    try {
      const resp = await fetch(`/api/orgs/${orgSlug}/marketing-studio/execution`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ intent, channel: "shopify", module: "operations" }),
      });
      const data = await resp.json();
      setResults(prev => ({
        ...prev,
        [intent]: data.ok
          ? { status: "ok",    message: data.message ?? "Solicitud enviada" }
          : { status: "error", message: data.error   ?? "Error al procesar" },
      }));
    } catch {
      setResults(prev => ({ ...prev, [intent]: { status: "error", message: "Error de conexión" } }));
    } finally {
      setExecutingId(null);
    }
  }, [orgSlug]);

  // ── Drawer config ────────────────────────────────────────────────────────
  type DrawerConfig = { title: string; subtitle?: string; severity: DrawerSeverity };

  const drawerConfig = (id: DrawerId | null): DrawerConfig => {
    switch (id) {
      case "pendientes":
        return {
          title:    "Pedidos pendientes de pago",
          subtitle: `${pendingCount} esperando confirmación · ${shopDomain || "Tienda"}`,
          severity: pendingCount > 3 ? "warning" : "info",
        };
      case "preparando":
        return {
          title:    "Pedidos en preparación",
          subtitle: `${preparingCount} siendo procesado${preparingCount !== 1 ? "s" : ""}`,
          severity: "info",
        };
      case "en_transito":
        return {
          title:    "Envíos en tránsito",
          subtitle: `${inTransitCount} en red de transportadoras${stalledCount > 0 ? ` · ${stalledCount} detenido${stalledCount !== 1 ? "s" : ""}` : ""}`,
          severity: stalledCount > 0 ? "warning" : "info",
        };
      case "entregados":
        return {
          title:    "Pedidos entregados",
          subtitle: `${deliveredCount} entregado${deliveredCount !== 1 ? "s" : ""} en este período`,
          severity: "info",
        };
      case "incidencias":
        return {
          title:    "Incidencias operativas",
          subtitle: `${atRiskCount} pedido${atRiskCount !== 1 ? "s" : ""} con riesgo operativo`,
          severity: atRiskCount > 0 ? "warning" : "info",
        };
      case "devoluciones":
        return {
          title:    "Devoluciones y cancelaciones",
          subtitle: `${cancelledCount} cancelado${cancelledCount !== 1 ? "s" : ""}`,
          severity: cancelledCount > 0 ? "watch" : "info",
        };
      case "tiempo_prom":
        return {
          title:    "Tiempo promedio de entrega",
          subtitle: "Estimado basado en pedidos despachados",
          severity: "info",
        };
      case "alertas":
        return {
          title:    "Alertas operativas",
          subtitle: alertCount > 0
            ? `${alertCount} situación${alertCount !== 1 ? "es" : ""} que requieren atención`
            : "Sin alertas activas",
          severity: criticalCount > 0 ? "critical" : stalledCount > 0 ? "warning" : "info",
        };
      default:
        return { title: "Detalle", severity: "info" };
    }
  };

  const cfg     = drawerConfig(openDrawer);
  const actions = openDrawer
    ? getOperationDrawerActions({
        drawerId:      openDrawer,
        pendingCount,
        stalledCount,
        cancelledCount,
        criticalCount,
        atRiskCount,
        totalOrders,
      })
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4], paddingTop: S[4] }}>

      {/* ── 1. Activation timeline ───────────────────────────────────────── */}
      <ShopifyActivationTimeline
        steps={ACTIVATION_STEPS}
        connected={connected}
        orgSlug={orgSlug}
        compactText={`Tienda activa · ${shopDomain || "Shopify"} · Pedidos sincronizados`}
        criticalCount={alertCount}
      />

      {/* ── 2. Protagonist: control tower ───────────────────────────────── */}
      <div style={{
        border:       `1px solid ${C.line}`,
        borderTop:    `3px solid ${C.blueDark}`,
        borderRadius: R.xl,
        padding:      `${S[5]}px`,
        background:   C.white,
        boxShadow:    E.sm,
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: S[4] }}>
          <div>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
              color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.09em",
            }}>
              Flujo operativo
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, marginTop: S[1] }}>
              {hasData
                ? summary ?? `${fmtNum(totalOrders)} pedido${totalOrders !== 1 ? "s" : ""} en seguimiento`
                : "El flujo de pedidos estará disponible al conectar la tienda"}
            </div>
          </div>
          <button
            onClick={() => setOpenDrawer("pendientes")}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs,
              color: C.blueDark, background: C.blueLight,
              border: `1px solid ${C.blueBorder}`, borderRadius: R.lg,
              padding: `${S[1]}px ${S[3]}px`, cursor: "pointer",
            }}
          >
            Ver detalle →
          </button>
        </div>

        {/* Stage flow */}
        <div style={{ marginBottom: S[4] }}>
          <ShopifyStageFlow
            stages={[
              { label: "Pago pendiente", count: hasData ? pendingCount   : null, color: C.amber    },
              { label: "Preparando",     count: hasData ? preparingCount : null, color: C.blueDark },
              { label: "En tránsito",    count: hasData ? inTransitCount : null, color: C.blueDark },
              { label: "Entregados",     count: hasData ? deliveredCount : null, color: C.green    },
              ...(hasData && cancelledCount > 0
                ? [{ label: "Devueltos", count: cancelledCount, color: C.red }]
                : []),
            ]}
          />
        </div>

        {/* Distribution bar */}
        <div style={{ marginBottom: S[3] }}>
          <ShopifyDistributionBar
            segments={[
              { label: "Pago pendiente", count: hasData ? pendingCount   : 0, color: C.amber     },
              { label: "Preparando",     count: hasData ? preparingCount : 0, color: C.blueDark  },
              { label: "En tránsito",    count: hasData ? inTransitCount : 0, color: C.blue      },
              { label: "Entregados",     count: hasData ? deliveredCount : 0, color: C.green     },
              { label: "Cancelados",     count: hasData ? cancelledCount : 0, color: C.lineSubtle },
            ]}
          />
        </div>

        {/* Risk meter */}
        {hasData && (
          <div style={{ marginBottom: S[3] }}>
            <ShopifyRiskMeter level={riskLevel} label={riskLabel} />
          </div>
        )}

        {/* Pending orders table */}
        {hasData && ops!.pendingPayment.length > 0 && (
          <div className="ag-op-table" style={{ marginTop: S[2] }}>
            {ops!.pendingPayment.slice(0, 5).map(o => <OrderRow key={o.id} order={o} />)}
          </div>
        )}
        {hasData && ops!.pendingPayment.length === 0 && totalOrders === 0 && (
          <div style={{
            padding: `${S[4]}px`, textAlign: "center",
            fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, marginTop: S[2],
          }}>
            Sin pedidos registrados en este período.
          </div>
        )}
        {!hasData && (
          <div style={{ marginTop: S[2] }}>
            {[1, 2, 3].map(i => <ShopifyPlaceholderRow key={i} />)}
          </div>
        )}
      </div>

      {/* ── 3. KPI grid ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[3] }}>
        <ShopifyKpiCard
          icon="⏳"
          label="Pendientes de pago"
          value={hasData ? String(pendingCount) : null}
          sub={hasData ? "esperando confirmación" : null}
          noDataHint="Pedidos recibidos con pago aún no confirmado."
          variant={hasData ? (pendingCount > 3 ? "warning" : pendingCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("pendientes")}
        />
        <ShopifyKpiCard
          icon="📦"
          label="En preparación"
          value={hasData ? String(preparingCount) : null}
          sub={hasData ? "siendo procesados" : null}
          noDataHint="Pedidos pagados que se están preparando para despacho."
          variant={hasData ? (preparingCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("preparando")}
        />
        <ShopifyKpiCard
          icon="🚚"
          label="En tránsito"
          value={hasData ? String(inTransitCount) : null}
          sub={hasData ? (stalledCount > 0 ? `${stalledCount} detenido${stalledCount !== 1 ? "s" : ""}` : "en movimiento") : null}
          noDataHint="Envíos activos en la red de transportadoras."
          variant={hasData ? (stalledCount > 0 ? "warning" : inTransitCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("en_transito")}
        />
        <ShopifyKpiCard
          icon="✅"
          label="Entregados"
          value={hasData ? String(deliveredCount) : null}
          sub={hasData ? "completados" : null}
          noDataHint="Pedidos confirmados como entregados al cliente."
          variant={hasData ? (deliveredCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("entregados")}
        />
        <ShopifyKpiCard
          icon="⚠️"
          label="Requieren atención"
          value={hasData ? String(atRiskCount) : null}
          sub={hasData ? "con riesgo operativo" : null}
          noDataHint="Pedidos con señales de riesgo: pausados, pago fallido o retrasos."
          variant={hasData ? (atRiskCount > 0 ? "critical" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("incidencias")}
        />
        <ShopifyKpiCard
          icon="↩️"
          label="Cancelados"
          value={hasData ? String(cancelledCount) : null}
          sub={hasData ? "cancelaciones y devoluciones" : null}
          noDataHint="Pedidos cancelados o devueltos en este período."
          variant={hasData ? (cancelledCount > 0 ? "warning" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("devoluciones")}
        />
        <ShopifyKpiCard
          icon="⏱️"
          label="Tiempo de entrega"
          value={null}
          sub={null}
          noDataHint="Promedio de días entre despacho y entrega confirmada."
          variant="neutral"
          onClick={() => setOpenDrawer("tiempo_prom")}
        />
        <ShopifyKpiCard
          icon="🔔"
          label="Alertas operativas"
          value={hasData ? String(alertCount) : null}
          sub={hasData ? "requieren revisión" : null}
          noDataHint="Situaciones críticas o envíos detenidos que afectan el ciclo."
          variant={hasData ? (criticalCount > 0 ? "critical" : stalledCount > 0 ? "warning" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("alertas")}
        />
      </div>

      {/* ── 4. In-transit block ──────────────────────────────────────────── */}
      <div style={{
        border: `1px solid ${C.line}`, borderRadius: R.xl,
        padding: `${S[5]}px`, background: C.white, boxShadow: E.xs,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[4] }}>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
            color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.09em",
          }}>
            Envíos en seguimiento
          </div>
          <button
            onClick={() => setOpenDrawer("en_transito")}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
              background: "transparent", border: "none", cursor: "pointer",
              padding: `${S[1]}px ${S[2]}px`,
            }}
          >
            Ver todos →
          </button>
        </div>
        <div className="ag-op-table">
          {hasData && ops!.inTransit.length > 0
            ? ops!.inTransit.slice(0, 5).map(s => <ShipmentRow key={s.id} shipment={s} />)
            : hasData
            ? (
              <div style={{
                padding: `${S[4]}px`, textAlign: "center",
                fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid,
              }}>
                Sin envíos activos en tránsito.
              </div>
            )
            : [1, 2, 3].map(i => <ShopifyPlaceholderRow key={i} />)
          }
        </div>
      </div>

      {/* ── Drawer ──────────────────────────────────────────────────────── */}
      <OperationalSideDrawer
        open={openDrawer !== null}
        onClose={() => setOpenDrawer(null)}
        title={cfg.title}
        subtitle={cfg.subtitle}
        severity={cfg.severity}
      >
        {/* Section 1: Resumen */}
        <ShopifyDrawerSection title="Resumen">
          {openDrawer === "pendientes" && (
            <div className="ag-op-table">
              {hasData && ops!.pendingPayment.length > 0
                ? ops!.pendingPayment.map(o => <OrderRow key={o.id} order={o} />)
                : <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, margin: 0 }}>
                    {hasData ? "Sin pedidos pendientes de pago." : "Disponible al conectar la tienda."}
                  </p>
              }
            </div>
          )}
          {openDrawer === "preparando" && (
            <div className="ag-op-table">
              {hasData && ops!.preparing.length > 0
                ? ops!.preparing.map(o => <OrderRow key={o.id} order={o} />)
                : <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, margin: 0 }}>
                    {hasData ? "Sin pedidos en preparación." : "Disponible al conectar la tienda."}
                  </p>
              }
            </div>
          )}
          {openDrawer === "en_transito" && (
            <div className="ag-op-table">
              {hasData && ops!.inTransit.length > 0
                ? ops!.inTransit.map(s => <ShipmentRow key={s.id} shipment={s} />)
                : <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, margin: 0 }}>
                    {hasData ? "Sin envíos activos en tránsito." : "Disponible al conectar la tienda."}
                  </p>
              }
            </div>
          )}
          {openDrawer === "entregados" && (
            <div className="ag-op-table">
              {hasData && ops!.delivered.length > 0
                ? ops!.delivered.slice(0, 8).map(o => <OrderRow key={o.id} order={o} />)
                : <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, margin: 0 }}>
                    {hasData ? "Sin pedidos entregados en este período." : "Disponible al conectar la tienda."}
                  </p>
              }
            </div>
          )}
          {openDrawer === "incidencias" && (
            <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, lineHeight: 1.7, margin: 0 }}>
              {!hasData
                ? "Disponible al conectar la tienda Shopify."
                : atRiskCount > 0
                ? `${atRiskCount} pedido${atRiskCount !== 1 ? "s" : ""} marcado${atRiskCount !== 1 ? "s" : ""} con riesgo operativo: pedidos en pausa, pagos fallidos o retrasos prolongados.`
                : "Sin incidencias activas. El ciclo operativo está funcionando con normalidad."
              }
            </p>
          )}
          {openDrawer === "devoluciones" && (
            <div className="ag-op-table">
              {hasData && ops!.cancelled.length > 0
                ? ops!.cancelled.map(o => <OrderRow key={o.id} order={o} />)
                : <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, margin: 0 }}>
                    {hasData ? "Sin cancelaciones ni devoluciones registradas." : "Disponible al conectar la tienda."}
                  </p>
              }
            </div>
          )}
          {openDrawer === "tiempo_prom" && (
            <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, lineHeight: 1.7, margin: 0 }}>
              El tiempo promedio de entrega se calculará a partir del histórico de pedidos despachados y sus confirmaciones. Disponible al acumular datos suficientes.
            </p>
          )}
          {openDrawer === "alertas" && (
            <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, lineHeight: 1.7, margin: 0 }}>
              {!hasData
                ? "Disponible al conectar la tienda Shopify."
                : alertCount === 0
                ? "Sin alertas operativas activas."
                : `${criticalCount > 0 ? `${criticalCount} crítica${criticalCount !== 1 ? "s" : ""}` : ""}${criticalCount > 0 && stalledCount > 0 ? " · " : ""}${stalledCount > 0 ? `${stalledCount} envío${stalledCount !== 1 ? "s" : ""} detenido${stalledCount !== 1 ? "s" : ""}` : ""}.`
              }
            </p>
          )}
        </ShopifyDrawerSection>

        {/* Section 2: Evolución */}
        <ShopifyDrawerSection title="Evolución">
          <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, lineHeight: 1.7, margin: 0 }}>
            {!hasData
              ? "Disponible al conectar la tienda."
              : "La comparación período a período estará disponible una vez que la tienda acumule datos históricos de pedidos y entregas."}
          </p>
        </ShopifyDrawerSection>

        {/* Section 3: Datos relevantes */}
        <ShopifyDrawerSection title="Datos relevantes">
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
            {[
              { label: "Total pedidos",   value: hasData ? fmtNum(totalOrders)    : "–" },
              { label: "En tránsito",     value: hasData ? String(inTransitCount) : "–" },
              { label: "Entregados",      value: hasData ? String(deliveredCount) : "–" },
              { label: "Alertas activas", value: hasData ? String(alertCount)     : "–" },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>{label}</span>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, fontWeight: T.wt.medium }}>{value}</span>
              </div>
            ))}
          </div>
        </ShopifyDrawerSection>

        {/* Section 4: Análisis de Sofía */}
        <ShopifyDrawerSection title="Análisis de Sofía">
          <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, lineHeight: 1.7, margin: 0 }}>
            {!connected
              ? "Conecta la tienda y Sofía supervisará el ciclo operativo completo."
              : !hasData
              ? "Cargando análisis operativo…"
              : openDrawer === "pendientes" && pendingCount > 3
              ? `${pendingCount} pedidos esperan pago. Un volumen elevado puede indicar fricción en el proceso de cobro.`
              : openDrawer === "en_transito" && stalledCount > 0
              ? `${stalledCount} envío${stalledCount !== 1 ? "s" : ""} lleva${stalledCount !== 1 ? "n" : ""} más de 5 días sin actualizaciones. Considera comunicarte con la transportadora.`
              : openDrawer === "alertas" && alertCount > 0
              ? "Hay situaciones que requieren intervención. Te recomiendo revisar cada alerta antes de que escalen."
              : "El indicador está dentro de parámetros normales. Sofía continuará monitoreando y te avisará ante cambios significativos."
            }
          </p>
        </ShopifyDrawerSection>

        {/* Section 5: Acciones sugeridas — context-aware */}
        <ShopifyDrawerSection title="Acciones sugeridas">
          {actions.map(action => (
            <ShopifyDrawerAction
              key={action.intent}
              label={action.label}
              intent={action.intent}
              executing={executingId}
              result={results[action.intent]}
              onExecute={executeAction}
            />
          ))}
        </ShopifyDrawerSection>
      </OperationalSideDrawer>
    </div>
  );
}
