"use client";

/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/operaciones/operaciones-client.tsx
 *
 * SHOPIFY-MODULE-MATURITY-01 — Operaciones Intelligence Console — Client Component
 * AGENTIK-COPILOT-BOUNDARIES-01 — Copilot/Sofía belongs in the right rail, not in the canvas
 *
 * Architecture:
 *   - Unified structure regardless of connection/data state
 *   - Placeholders replace all metrics when ops is null
 *   - All actions route through /execution pipeline
 *   - OperationalSideDrawer for all detail panels (5 sections each)
 *   - Canvas shows module data only; Sofía intelligence lives in right rail
 *   - Language: natural business Spanish for Latin America
 *
 * Blocks:
 *   1. Timeline         — compact strip when connected, steps when onboarding
 *   2. ProtagonistBlock — order flow (pending → in transit → delivered)
 *   3. KpiGrid          — 8 indicator tiles, each with drawer
 *   4. ShipmentsBlock   — in-transit orders (secondary protagonist)
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

// ── Status labels and colors ───────────────────────────────────────────────────

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
        color:        statusColor,
        background:   `${statusColor}18`,
        border:       `1px solid ${statusColor}40`,
        borderRadius: R.pill, padding:  `2px ${S[2]}px`,
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
        fontFamily: T.mono, fontSize: T.sz.xs,
        color: shipColor, background: `${shipColor}18`,
        border: `1px solid ${shipColor}40`,
        borderRadius: R.pill, padding: `2px ${S[2]}px`, flexShrink: 0,
      }}>
        {SHIPMENT_STATUS_LABEL[shipment.status] ?? shipment.status}
      </span>
    </div>
  );
}

// ── Flow step indicator (protagonist block) ────────────────────────────────────

function FlowStep({
  label, count, color, isLast,
}: {
  label:   string;
  count:   number | null;
  color:   string;
  isLast?: boolean;
}) {
  return (
    <>
      <div style={{ textAlign: "center" as const, flex: 1, minWidth: 80 }}>
        <div style={{
          fontFamily:  T.mono,
          fontSize:    T.sz["2xl"],
          fontWeight:  T.wt.bold,
          color:       count !== null ? color : C.surfaceAlt,
          lineHeight:  1.15,
        }}>
          {count !== null ? fmtNum(count) : "–"}
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
          {label}
        </div>
      </div>
      {!isLast && (
        <span style={{ color: C.lineSubtle, fontFamily: T.mono, fontSize: T.sz.sm, flexShrink: 0 }}>→</span>
      )}
    </>
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

  const alertCount = criticalCount + stalledCount;

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
          subtitle: `${pendingCount} pedido${pendingCount !== 1 ? "s" : ""} esperando confirmación · ${shopDomain || "Tienda"}`,
          severity: pendingCount > 3 ? "warning" : "info",
        };
      case "preparando":
        return {
          title:    "Pedidos en preparación",
          subtitle: `${preparingCount} pedido${preparingCount !== 1 ? "s" : ""} siendo procesado${preparingCount !== 1 ? "s" : ""}`,
          severity: "info",
        };
      case "en_transito":
        return {
          title:    "Envíos en tránsito",
          subtitle: `${inTransitCount} envío${inTransitCount !== 1 ? "s" : ""} en la red de transportadoras${stalledCount > 0 ? ` · ${stalledCount} detenido${stalledCount !== 1 ? "s" : ""}` : ""}`,
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
          subtitle: alertCount > 0 ? `${alertCount} situación${alertCount !== 1 ? "es" : ""} que requieren atención` : "Sin alertas activas",
          severity: criticalCount > 0 ? "critical" : stalledCount > 0 ? "warning" : "info",
        };
      default:
        return { title: "Detalle", severity: "info" };
    }
  };

  const cfg = drawerConfig(openDrawer);

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

      {/* ── 2. Protagonist: order flow ───────────────────────────────────── */}
      <div style={{
        border:       `1px solid ${C.line}`,
        borderTop:    `3px solid ${C.blueDark}`,
        borderRadius: R.xl,
        padding:      `${S[5]}px`,
        background:   C.white,
        boxShadow:    E.sm,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[4] }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.09em" }}>
              Comportamiento de los pedidos
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

        {/* Flow steps */}
        <div style={{ display: "flex", alignItems: "center", gap: S[2], marginBottom: S[4] }}>
          <FlowStep label="Pendientes pago" count={hasData ? pendingCount   : null} color={C.amber}    />
          <FlowStep label="Preparando"      count={hasData ? preparingCount : null} color={C.blueDark} />
          <FlowStep label="En tránsito"     count={hasData ? inTransitCount : null} color={C.blueDark} />
          <FlowStep label="Entregados"      count={hasData ? deliveredCount : null} color={C.green} isLast />
        </div>

        {/* Alert strips */}
        {criticalCount > 0 && (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.red,
            background: C.redLight, border: `1px solid ${C.redBorder}`,
            borderRadius: R.md, padding: `${S[2]}px ${S[3]}px`, marginBottom: S[2],
          }}>
            ⚠ {criticalCount} alerta{criticalCount !== 1 ? "s" : ""} crítica{criticalCount !== 1 ? "s" : ""} — revisión inmediata requerida
          </div>
        )}
        {stalledCount > 0 && (
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber,
            background: C.amberLight, border: `1px solid ${C.amberBorder}`,
            borderRadius: R.md, padding: `${S[2]}px ${S[3]}px`, marginBottom: S[2],
          }}>
            {stalledCount} envío{stalledCount !== 1 ? "s" : ""} sin movimiento por más de 5 días
          </div>
        )}

        {/* Pending orders table */}
        {hasData && ops!.pendingPayment.length > 0 && (
          <div className="ag-op-table">
            {ops!.pendingPayment.slice(0, 5).map(o => <OrderRow key={o.id} order={o} />)}
          </div>
        )}
        {hasData && ops!.pendingPayment.length === 0 && totalOrders === 0 && (
          <div style={{
            padding: `${S[5]}px ${S[4]}px`, textAlign: "center",
            fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid,
          }}>
            Sin pedidos registrados en este período.
          </div>
        )}
        {!hasData && [1, 2, 3].map(i => <ShopifyPlaceholderRow key={i} />)}
      </div>

      {/* ── 3. KPI grid ─────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: S[3],
      }}>
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
          noDataHint="Pedidos con señales de riesgo: pausados, con pago fallido o con retraso."
          variant={hasData ? (atRiskCount > 0 ? "critical" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("incidencias")}
        />
        <ShopifyKpiCard
          icon="↩️"
          label="Cancelados"
          value={hasData ? String(cancelledCount) : null}
          sub={hasData ? "devoluciones o cancelados" : null}
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
          noDataHint="Situaciones críticas o envíos detenidos que afectan el ciclo operativo."
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
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkFaint, textTransform: "uppercase" as const, letterSpacing: "0.09em" }}>
            Envíos en seguimiento
          </div>
          <button
            onClick={() => setOpenDrawer("en_transito")}
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs,
              color: C.inkFaint, background: "transparent",
              border: "none", cursor: "pointer", padding: `${S[1]}px ${S[2]}px`,
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
                ? `${atRiskCount} pedido${atRiskCount !== 1 ? "s" : ""} ha${atRiskCount !== 1 ? "n" : ""} sido marcado${atRiskCount !== 1 ? "s" : ""} con señales de riesgo operativo: pedidos en pausa, pagos fallidos y retrasos prolongados.`
                : "No hay incidencias activas en este momento. El ciclo operativo está funcionando con normalidad."
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
              El tiempo promedio de entrega se calculará a partir del histórico de pedidos despachados y sus confirmaciones de entrega. Disponible cuando acumules suficientes datos.
            </p>
          )}
          {openDrawer === "alertas" && (
            <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, lineHeight: 1.7, margin: 0 }}>
              {!hasData
                ? "Disponible al conectar la tienda Shopify."
                : alertCount === 0
                ? "No hay alertas operativas activas en este momento."
                : `Resumen: ${criticalCount > 0 ? `${criticalCount} crítica${criticalCount !== 1 ? "s" : ""}, ` : ""}${stalledCount > 0 ? `${stalledCount} envío${stalledCount !== 1 ? "s" : ""} detenido${stalledCount !== 1 ? "s" : ""}` : ""}.`
              }
            </p>
          )}
        </ShopifyDrawerSection>

        {/* Section 2: Evolución */}
        <ShopifyDrawerSection title="Evolución">
          <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, lineHeight: 1.7, margin: 0 }}>
            {!hasData
              ? "El análisis de evolución estará disponible al conectar la tienda."
              : "La comparación período a período estará disponible una vez que la tienda acumule datos históricos de pedidos y entregas."}
          </p>
        </ShopifyDrawerSection>

        {/* Section 3: Datos relevantes */}
        <ShopifyDrawerSection title="Datos relevantes">
          <div style={{ display: "flex", flexDirection: "column" as const, gap: S[2] }}>
            {[
              { label: "Total pedidos",    value: hasData ? fmtNum(totalOrders)    : "–" },
              { label: "En tránsito",      value: hasData ? String(inTransitCount) : "–" },
              { label: "Entregados",       value: hasData ? String(deliveredCount)  : "–" },
              { label: "Alertas activas",  value: hasData ? String(alertCount)     : "–" },
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
              ? "Conecta la tienda y Sofía supervisará el ciclo operativo completo, desde el pedido hasta la entrega."
              : !hasData
              ? "Cargando análisis operativo…"
              : openDrawer === "pendientes" && pendingCount > 3
              ? `Hay ${pendingCount} pedidos esperando confirmación de pago. Un volumen alto de pendientes puede indicar fricción en el proceso de pago. Revisa si hay algún método con problemas.`
              : openDrawer === "en_transito" && stalledCount > 0
              ? `${stalledCount} envío${stalledCount !== 1 ? "s" : ""} lleva${stalledCount !== 1 ? "n" : ""} más de 5 días sin actualizaciones de la transportadora. Esto puede afectar la satisfacción del cliente si no se comunica proactivamente.`
              : openDrawer === "alertas" && alertCount > 0
              ? "Hay situaciones que requieren intervención. Te recomiendo revisar cada alerta y tomar acción antes de que escalen."
              : "El indicador está dentro de los parámetros normales. Sofía continuará monitoreando y te avisará ante cualquier cambio significativo."
            }
          </p>
        </ShopifyDrawerSection>

        {/* Section 5: Acciones sugeridas */}
        <ShopifyDrawerSection title="Acciones sugeridas">
          <ShopifyDrawerAction
            label="Revisar pedidos pendientes"
            intent="operations.review_pending"
            executing={executingId}
            result={results["operations.review_pending"]}
            onExecute={executeAction}
          />
          <ShopifyDrawerAction
            label="Analizar retrasos de envío"
            intent="operations.analyze_delays"
            executing={executingId}
            result={results["operations.analyze_delays"]}
            onExecute={executeAction}
          />
          <ShopifyDrawerAction
            label="Inspeccionar devoluciones"
            intent="operations.inspect_returns"
            executing={executingId}
            result={results["operations.inspect_returns"]}
            onExecute={executeAction}
          />
          <ShopifyDrawerAction
            label="Preparar plan de seguimiento"
            intent="operations.followup_plan"
            executing={executingId}
            result={results["operations.followup_plan"]}
            onExecute={executeAction}
          />
          <ShopifyDrawerAction
            label="Explorar oportunidades operativas"
            intent="operations.explore_opportunities"
            executing={executingId}
            result={results["operations.explore_opportunities"]}
            onExecute={executeAction}
          />
        </ShopifyDrawerSection>
      </OperationalSideDrawer>
    </div>
  );
}
