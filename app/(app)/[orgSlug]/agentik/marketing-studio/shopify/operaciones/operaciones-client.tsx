"use client";

/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/shopify/operaciones/operaciones-client.tsx
 *
 * SHOPIFY-MODULE-MATURITY-01 — Operaciones Intelligence Console — Client Component
 *
 * Architecture:
 *   - Unified structure regardless of connection/data state
 *   - Placeholders replace all metrics when ops is null
 *   - All actions route through Copilot → Intent Resolver → Policy → Runtime
 *   - OperationalSideDrawer for all detail panels (4 sections each)
 *   - Sofía supervises the full commercial cycle — Shopify is the data source
 *   - Language: natural business Spanish for Latin America
 *
 * Blocks:
 *   1. SofíaBanner      — contextual intelligence message (always visible)
 *   2. Timeline         — compact strip when connected, steps when onboarding
 *   3. ProtagonistBlock — order flow (pending → in transit → delivered)
 *   4. KpiGrid          — 8 indicator tiles, each with drawer
 *   5. ShipmentsBlock   — in-transit orders (secondary protagonist)
 *   6. SignalsSection   — Sofía's operational signals
 */

import { useState, useCallback }       from "react";
import { C, T, S, R, E }              from "@/lib/ui/tokens";
import { OperationalSideDrawer }       from "@/components/workspace/operational-side-drawer";
import type { DrawerSeverity }         from "@/components/workspace/operational-side-drawer";
import { MSAgentSignal }               from "@/components/marketing-studio/shared/ms-agent-signal";

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

const STEPS = [
  { label: "Conectar tienda Shopify" },
  { label: "Sincronizar pedidos y envíos" },
  { label: "Sofía analiza el ciclo operativo" },
  { label: "Activar alertas y seguimiento" },
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
    shipment.status === "delivered"      ? C.green :
    shipment.status === "failed_delivery"? C.red   : C.blueDark;

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

// ── Placeholder row ────────────────────────────────────────────────────────────

function PlaceholderRow() {
  return (
    <div className="ag-op-row" style={{ alignItems: "center", gap: S[3] }}>
      <div style={{ flex: 1 }}>
        <div style={{ width: "45%", height: 10, borderRadius: R.sm, background: C.surfaceAlt }} />
        <div style={{ width: "60%", height: 8,  borderRadius: R.sm, background: C.surfaceAlt, marginTop: 5 }} />
      </div>
      <div style={{ width: 56, height: 10, borderRadius: R.sm, background: C.surfaceAlt }} />
      <div style={{ width: 44, height: 8,  borderRadius: R.pill, background: C.surfaceAlt }} />
    </div>
  );
}

// ── KPI card ───────────────────────────────────────────────────────────────────

function KpiCard({
  icon, label, value, sub, noDataHint, variant, onClick,
}: {
  icon:       string;
  label:      string;
  value:      string | null;
  sub:        string | null;
  noDataHint: string;
  variant:    "ok" | "warning" | "critical" | "neutral";
  onClick:    () => void;
}) {
  const variantColor =
    variant === "ok"       ? C.green   :
    variant === "warning"  ? C.amber   :
    variant === "critical" ? C.red     : C.inkFaint;

  return (
    <button
      onClick={onClick}
      style={{
        flex:          "1 1 200px",
        minWidth:      0,
        border:        `1px solid ${C.line}`,
        borderRadius:  R.xl,
        padding:       `${S[4]}px`,
        background:    C.white,
        boxShadow:     E.xs,
        textAlign:     "left" as const,
        cursor:        "pointer",
        display:       "flex",
        flexDirection: "column" as const,
        gap:           S[1],
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: variantColor, flexShrink: 0,
        }} />
      </div>
      {value !== null ? (
        <>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color: C.titleDeep, lineHeight: 1.15 }}>
            {value}
          </div>
          {sub && (
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
              {sub}
            </div>
          )}
        </>
      ) : (
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, lineHeight: 1.55, marginTop: S[1] }}>
          {noDataHint}
        </div>
      )}
      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: "auto", paddingTop: S[2] }}>
        {label}
      </div>
    </button>
  );
}

// ── Drawer section wrapper ─────────────────────────────────────────────────────

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: S[5] }}>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        color: C.inkFaint, textTransform: "uppercase" as const,
        letterSpacing: "0.09em", marginBottom: S[3],
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

// ── Action button (drawer) ─────────────────────────────────────────────────────

function DrawerAction({
  label, intent, executing, result, onExecute,
}: {
  label:     string;
  intent:    string;
  executing: string | null;
  result?:   { status: string; message: string };
  onExecute: (intent: string) => void;
}) {
  const isRunning = executing === intent;
  return (
    <div style={{ marginBottom: S[2] }}>
      <button
        onClick={() => onExecute(intent)}
        disabled={!!executing}
        style={{
          display:      "block",
          width:        "100%",
          textAlign:    "left" as const,
          fontFamily:   T.mono,
          fontSize:     T.sz.sm,
          color:        isRunning ? C.inkFaint : C.blueDark,
          background:   C.blueLight,
          border:       `1px solid ${C.blueBorder}`,
          borderRadius: R.lg,
          padding:      `${S[2]}px ${S[3]}px`,
          cursor:       executing ? "default" : "pointer",
          opacity:      executing && !isRunning ? 0.5 : 1,
        }}
      >
        {isRunning ? "Enviando a Sofía…" : `→ ${label}`}
      </button>
      {result && (
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, marginTop: S[1],
          color: result.status === "ok" ? C.green : C.red,
        }}>
          {result.message}
        </div>
      )}
    </div>
  );
}

// ── Flow step indicator (protagonist block) ────────────────────────────────────

function FlowStep({
  label, count, color, isLast,
}: {
  label:  string;
  count:  number | null;
  color:  string;
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

  const hasData   = ops !== null;
  const isCompact = connected && hasData;

  // ── Computed indicators ──────────────────────────────────────────────────
  const pendingCount    = ops?.pendingPayment.length ?? 0;
  const preparingCount  = ops?.preparing.length      ?? 0;
  const inTransitCount  = ops?.inTransit.length      ?? 0;
  const deliveredCount  = ops?.delivered.length       ?? 0;
  const cancelledCount  = ops?.cancelled.length       ?? 0;
  const totalOrders     = ops?.total                  ?? 0;
  const criticalCount   = ops?.alerts.critical        ?? 0;
  const stalledCount    = ops?.alerts.stalledShipments ?? 0;
  const atRiskCount     = ops?.alerts.ordersAtRisk    ?? 0;

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
          ? { status: "ok",    message: data.message ?? "Solicitud enviada a Sofía" }
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

  // ── Sofía messages ───────────────────────────────────────────────────────
  const sofiaText = !connected
    ? "Supervisaré pedidos, incidencias, envíos y devoluciones cuando la tienda esté conectada. Te avisaré ante cualquier situación que requiera tu atención."
    : !hasData
    ? "Estoy sincronizando el ciclo operativo de tu tienda. En breve mostraré el estado de tus pedidos y envíos."
    : criticalCount > 0
    ? `Detecté ${criticalCount} alerta${criticalCount !== 1 ? "s" : ""} crítica${criticalCount !== 1 ? "s" : ""} que requieren revisión inmediata. ${stalledCount > 0 ? `Además hay ${stalledCount} envío${stalledCount !== 1 ? "s" : ""} detenido${stalledCount !== 1 ? "s" : ""}.` : ""}`
    : stalledCount > 0
    ? `${stalledCount} envío${stalledCount !== 1 ? "s" : ""} lleva${stalledCount !== 1 ? "n" : ""} más de 5 días sin movimiento. Recomiendo verificar con la transportadora.`
    : totalOrders === 0
    ? "No hay pedidos registrados en este período. Aquí veré el flujo completo cuando comiencen a llegar."
    : `Ciclo operativo activo: ${pendingCount} pendiente${pendingCount !== 1 ? "s" : ""}, ${preparingCount} preparando, ${inTransitCount} en tránsito y ${deliveredCount} entregado${deliveredCount !== 1 ? "s" : ""}.`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[4], paddingTop: S[4] }}>

      {/* ── 1. Sofía banner ─────────────────────────────────────────────── */}
      <MSAgentSignal
        text={sofiaText}
        agentLabel="Sofía · Comercio"
        variant={connected && criticalCount === 0 && totalOrders > 0 ? "positive" : "dark"}
      />

      {/* ── 2. Activation timeline ──────────────────────────────────────── */}
      {isCompact ? (
        <div style={{
          background: criticalCount > 0 ? C.redLight : C.greenLight,
          border: `1px solid ${criticalCount > 0 ? C.redBorder : C.greenBorder}`,
          borderRadius: R.xl, padding: `${S[2]}px ${S[4]}px`,
          fontFamily: T.mono, fontSize: T.sz.xs,
          color: criticalCount > 0 ? C.red : C.green,
          display: "flex", alignItems: "center", gap: S[2],
        }}>
          <span>{criticalCount > 0 ? "⚠" : "✓"}</span>
          <span>
            {criticalCount > 0
              ? `${criticalCount} alerta${criticalCount !== 1 ? "s" : ""} crítica${criticalCount !== 1 ? "s" : ""} · Sofía monitoreando el ciclo operativo`
              : "Tienda activa · Pedidos sincronizados · Sofía supervisando operaciones"}
          </span>
        </div>
      ) : (
        <div style={{
          border: `1px solid ${C.line}`, borderRadius: R.xl,
          padding: `${S[4]}px ${S[5]}px`, background: C.white, boxShadow: E.xs,
        }}>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
            color: C.inkFaint, textTransform: "uppercase" as const,
            letterSpacing: "0.09em", marginBottom: S[3],
          }}>
            Pasos de activación
          </div>
          <div style={{ display: "flex", gap: S[2], alignItems: "center", flexWrap: "wrap" as const }}>
            {STEPS.map((step, i) => {
              const done = connected && i === 0;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: S[2] }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    background: done ? C.blueDark : C.surfaceAlt,
                    border: `1px solid ${done ? C.blueDark : C.line}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {done
                      ? <span style={{ color: C.white, fontSize: 9, fontWeight: T.wt.bold }}>✓</span>
                      : <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{i + 1}</span>
                    }
                  </div>
                  <span style={{
                    fontFamily: T.mono, fontSize: T.sz.xs,
                    color: done ? C.ink : i === 0 && !connected ? C.blueDark : C.inkFaint,
                    fontWeight: i === 0 && !connected ? T.wt.semibold : T.wt.normal,
                  }}>
                    {step.label}
                  </span>
                  {i < STEPS.length - 1 && (
                    <span style={{ color: C.lineSubtle, fontFamily: T.mono, fontSize: T.sz.xs }}>→</span>
                  )}
                </div>
              );
            })}
          </div>
          {!connected && (
            <a
              href={`/${orgSlug}/agentik/marketing-studio/shopify`}
              style={{
                display: "inline-block", marginTop: S[3],
                fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                color: C.white, background: C.blueDark,
                border: `1px solid ${C.blueDark}`, borderRadius: R.lg,
                padding: `${S[2]}px ${S[4]}px`, textDecoration: "none",
              }}
            >
              Conectar tienda Shopify
            </a>
          )}
        </div>
      )}

      {/* ── 3. Protagonist: order flow ───────────────────────────────────── */}
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
          <FlowStep label="Pendientes pago" count={hasData ? pendingCount  : null} color={C.amber}   />
          <FlowStep label="Preparando"      count={hasData ? preparingCount: null} color={C.blueDark}/>
          <FlowStep label="En tránsito"     count={hasData ? inTransitCount: null} color={C.blueDark}/>
          <FlowStep label="Entregados"      count={hasData ? deliveredCount : null} color={C.green}  isLast />
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
            Sin pedidos registrados. Sofía supervisará el flujo en cuanto lleguen.
          </div>
        )}
        {!hasData && [1, 2, 3].map(i => <PlaceholderRow key={i} />)}
      </div>

      {/* ── 4. KPI grid ─────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: S[3],
      }}>
        <KpiCard
          icon="⏳"
          label="Pendientes de pago"
          value={hasData ? String(pendingCount) : null}
          sub={hasData ? "esperando confirmación" : null}
          noDataHint="Pedidos con pago aún no confirmado."
          variant={hasData ? (pendingCount > 3 ? "warning" : pendingCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("pendientes")}
        />
        <KpiCard
          icon="📦"
          label="En preparación"
          value={hasData ? String(preparingCount) : null}
          sub={hasData ? "siendo procesados" : null}
          noDataHint="Pedidos pagados que se están preparando para despacho."
          variant={hasData ? (preparingCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("preparando")}
        />
        <KpiCard
          icon="🚚"
          label="En tránsito"
          value={hasData ? String(inTransitCount) : null}
          sub={hasData ? (stalledCount > 0 ? `${stalledCount} detenido${stalledCount !== 1 ? "s" : ""}` : "en movimiento") : null}
          noDataHint="Envíos activos en la red de transportadoras."
          variant={hasData ? (stalledCount > 0 ? "warning" : inTransitCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("en_transito")}
        />
        <KpiCard
          icon="✅"
          label="Entregados"
          value={hasData ? String(deliveredCount) : null}
          sub={hasData ? "completados" : null}
          noDataHint="Pedidos confirmados como entregados al cliente."
          variant={hasData ? (deliveredCount > 0 ? "ok" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("entregados")}
        />
        <KpiCard
          icon="⚠️"
          label="Requieren atención"
          value={hasData ? String(atRiskCount) : null}
          sub={hasData ? "con riesgo operativo" : null}
          noDataHint="Sofía marcará pedidos con señales de riesgo operativo."
          variant={hasData ? (atRiskCount > 0 ? "critical" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("incidencias")}
        />
        <KpiCard
          icon="↩️"
          label="Cancelados"
          value={hasData ? String(cancelledCount) : null}
          sub={hasData ? "devoluciones o cancelados" : null}
          noDataHint="Pedidos cancelados o devueltos en este período."
          variant={hasData ? (cancelledCount > 0 ? "warning" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("devoluciones")}
        />
        <KpiCard
          icon="⏱️"
          label="Tiempo de entrega"
          value={null}
          sub={null}
          noDataHint="Promedio de días entre despacho y entrega confirmada."
          variant="neutral"
          onClick={() => setOpenDrawer("tiempo_prom")}
        />
        <KpiCard
          icon="🔔"
          label="Alertas operativas"
          value={hasData ? String(alertCount) : null}
          sub={hasData ? "requieren revisión" : null}
          noDataHint="Sofía alertará sobre situaciones que afecten la operación."
          variant={hasData ? (criticalCount > 0 ? "critical" : stalledCount > 0 ? "warning" : "neutral") : "neutral"}
          onClick={() => setOpenDrawer("alertas")}
        />
      </div>

      {/* ── 5. In-transit block ──────────────────────────────────────────── */}
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
            : [1, 2, 3].map(i => <PlaceholderRow key={i} />)
          }
        </div>
      </div>

      {/* ── 6. Sofía signals ────────────────────────────────────────────── */}
      <div style={{
        border: `1px solid ${C.line}`, borderRadius: R.xl,
        padding: `${S[5]}px`, background: C.white, boxShadow: E.xs,
      }}>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
          color: C.inkFaint, textTransform: "uppercase" as const,
          letterSpacing: "0.09em", marginBottom: S[4],
        }}>
          Señales del negocio
        </div>
        <div style={{ display: "flex", flexDirection: "column" as const, gap: S[3] }}>
          {!connected && (
            <MSAgentSignal
              text="Conecta la tienda y supervisaré pedidos, envíos y devoluciones en tiempo real. Te notificaré ante cualquier retraso o incidencia."
              agentLabel="Sofía · Comercio"
              variant="dark"
            />
          )}
          {connected && !hasData && (
            <MSAgentSignal
              text="Cargando el estado operativo de tu tienda. En breve mostraré el análisis del ciclo de pedidos."
              agentLabel="Sofía · Comercio"
              variant="dark"
            />
          )}
          {connected && hasData && criticalCount > 0 && (
            <MSAgentSignal
              text={`Detecto ${criticalCount} situación${criticalCount !== 1 ? "es" : ""} crítica${criticalCount !== 1 ? "s" : ""} que requieren atención inmediata. Revisa los pedidos marcados antes de que afecten la experiencia del cliente.`}
              agentLabel="Sofía · Comercio"
              variant="dark"
              action={{ label: "Ver alertas", href: "#" }}
            />
          )}
          {connected && hasData && stalledCount > 0 && criticalCount === 0 && (
            <MSAgentSignal
              text={`${stalledCount} envío${stalledCount !== 1 ? "s" : ""} lleva${stalledCount !== 1 ? "n" : ""} más de 5 días sin actualizaciones. Te recomiendo contactar con la transportadora para obtener estado actualizado.`}
              agentLabel="Sofía · Comercio"
              variant="positive"
            />
          )}
          {connected && hasData && criticalCount === 0 && stalledCount === 0 && totalOrders > 0 && (
            <MSAgentSignal
              text={`El ciclo operativo está funcionando bien. ${deliveredCount > 0 ? `${deliveredCount} pedido${deliveredCount !== 1 ? "s" : ""} entregado${deliveredCount !== 1 ? "s" : ""} correctamente.` : "Seguiré monitoreando el flujo de pedidos."}`}
              agentLabel="Sofía · Comercio"
              variant="positive"
            />
          )}
          {connected && hasData && totalOrders === 0 && (
            <MSAgentSignal
              text="No hay pedidos activos en este período. Cuando comiencen a llegar, mostraré el análisis del ciclo completo."
              agentLabel="Sofía · Comercio"
              variant="dark"
            />
          )}
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
        <DrawerSection title="Resumen">
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
                ? `${atRiskCount} pedido${atRiskCount !== 1 ? "s" : ""} ha${atRiskCount !== 1 ? "n" : ""} sido marcado${atRiskCount !== 1 ? "s" : ""} con señales de riesgo operativo. Sofía detecta pedidos en pausa, pagos fallidos y retrasos prolongados.`
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
        </DrawerSection>

        {/* Section 2: Evolución */}
        <DrawerSection title="Evolución">
          <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, lineHeight: 1.7, margin: 0 }}>
            {!hasData
              ? "El análisis de evolución estará disponible al conectar la tienda."
              : "Sofía comparará el estado actual con el período anterior para identificar tendencias en el volumen de pedidos, tiempos de entrega y tasa de incidencias."}
          </p>
        </DrawerSection>

        {/* Section 3: Análisis de Sofía */}
        <DrawerSection title="Análisis de Sofía">
          <p style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.ink, lineHeight: 1.7, margin: 0 }}>
            {!connected
              ? "Conecta la tienda y supervisaré el ciclo operativo completo, desde el pedido hasta la entrega."
              : !hasData
              ? "Cargando análisis operativo…"
              : openDrawer === "pendientes" && pendingCount > 3
              ? `Hay ${pendingCount} pedidos esperando confirmación de pago. Un volumen alto de pendientes puede indicar fricción en el proceso de pago. Revisa si hay algún método con problemas.`
              : openDrawer === "en_transito" && stalledCount > 0
              ? `${stalledCount} envío${stalledCount !== 1 ? "s" : ""} lleva${stalledCount !== 1 ? "n" : ""} más de 5 días sin actualizaciones de la transportadora. Esto puede afectar la satisfacción del cliente si no se comunica proactivamente.`
              : openDrawer === "alertas" && alertCount > 0
              ? "Hay situaciones que requieren intervención. Te recomiendo revisar cada alerta y tomar acción antes de que escalen."
              : "El indicador está dentro de los parámetros normales. Continuaré monitoreando y te avisaré ante cualquier cambio significativo."
            }
          </p>
        </DrawerSection>

        {/* Section 4: Acciones sugeridas */}
        <DrawerSection title="Acciones sugeridas">
          <DrawerAction
            label="Revisar pedidos pendientes"
            intent="operations.review_pending"
            executing={executingId}
            result={results["operations.review_pending"]}
            onExecute={executeAction}
          />
          <DrawerAction
            label="Analizar retrasos de envío"
            intent="operations.analyze_delays"
            executing={executingId}
            result={results["operations.analyze_delays"]}
            onExecute={executeAction}
          />
          <DrawerAction
            label="Inspeccionar devoluciones"
            intent="operations.inspect_returns"
            executing={executingId}
            result={results["operations.inspect_returns"]}
            onExecute={executeAction}
          />
          <DrawerAction
            label="Preparar plan de seguimiento"
            intent="operations.followup_plan"
            executing={executingId}
            result={results["operations.followup_plan"]}
            onExecute={executeAction}
          />
          <DrawerAction
            label="Explorar oportunidades operativas"
            intent="operations.explore_opportunities"
            executing={executingId}
            result={results["operations.explore_opportunities"]}
            onExecute={executeAction}
          />
        </DrawerSection>
      </OperationalSideDrawer>
    </div>
  );
}
