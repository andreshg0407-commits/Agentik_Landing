/**
 * Seller App — Pedidos Realizados View.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-03
 *
 * Mobile seller-scoped order list + detail + fulfillment.
 * Uses canonical Pedidos domain. Seller sees only own orders.
 *
 * Fulfillment stages shown ONLY when factual authority exists.
 */
"use client";

import { useState, useMemo } from "react";
import { C, T, S, R } from "@/lib/ui/tokens";
import {
  DetailSection, DetailKpi, filterBtnStyle, fmtCOP, fmtDaysAgo,
  type SerializedOrderCard,
} from "./seller-app-shared";

// ── Status config ───────────────────────────────────────────────────────────

type StatusGroup = "all" | "active" | "completed" | "problem";

const STATUS_GROUPS: Array<{ key: StatusGroup; label: string }> = [
  { key: "all", label: "Todos" },
  { key: "active", label: "Activos" },
  { key: "completed", label: "Completados" },
  { key: "problem", label: "Problemas" },
];

function orderStatusGroup(status: string, syncState: string): StatusGroup {
  if (status === "cancelado") return "problem";
  if (status === "conflicto" || syncState === "error_sincronizacion") return "problem";
  if (status === "sincronizado") return "completed";
  return "active";
}

const STATUS_LABELS: Record<string, string> = {
  borrador: "Borrador",
  listo_para_enviar: "Listo para enviar",
  pendiente_sag: "Pendiente SAG",
  sincronizado: "Sincronizado",
  conflicto: "Conflicto",
  cancelado: "Cancelado",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  borrador: { bg: C.surfaceAlt, color: C.inkMid },
  listo_para_enviar: { bg: C.blueLight, color: C.blue },
  pendiente_sag: { bg: C.amberLight, color: C.amberDark },
  sincronizado: { bg: C.greenLight, color: C.green },
  conflicto: { bg: C.redLight, color: C.redDark },
  cancelado: { bg: C.surfaceAlt, color: C.inkLight },
};

const FULFILLMENT_LABELS: Record<string, string> = {
  COMPLETED: "Facturado",
  IN_PROGRESS: "En proceso",
  NOT_STARTED: "Sin facturar",
  NOT_AVAILABLE: "No disponible",
};

// ── Fulfillment timeline stages ─────────────────────────────────────────────

interface FulfillmentStage {
  label: string;
  status: "complete" | "current" | "pending" | "not_available";
}

function buildFulfillmentTimeline(order: SerializedOrderCard): FulfillmentStage[] {
  const stages: FulfillmentStage[] = [];

  // Stage 1: Pedido recibido — always true if order exists
  stages.push({ label: "Pedido recibido", status: "complete" });

  // Stage 2: Facturacion — derived from server-side fulfillmentStatus
  if (order.fulfillmentStatus === "COMPLETED") {
    stages.push({ label: "Facturado", status: "complete" });
  } else if (order.fulfillmentStatus === "IN_PROGRESS") {
    stages.push({ label: "Facturacion", status: "current" });
  } else {
    stages.push({ label: "Facturacion", status: "pending" });
  }

  // Stage 3: Despacho — NOT_AVAILABLE (no carrier/tracking data source)
  stages.push({ label: "Despacho", status: "not_available" });

  // Stage 4: Entrega — NOT_AVAILABLE (no delivery confirmation source)
  stages.push({ label: "Entrega", status: "not_available" });

  return stages;
}

// ── Main View ───────────────────────────────────────────────────────────────

export function SellerOrdersView({
  orders,
  orgSlug,
  orgId,
  initialOrderId,
}: {
  orders: SerializedOrderCard[];
  orgSlug: string;
  orgId: string;
  initialOrderId?: string;
}) {
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId ?? null);
  const [statusFilter, setStatusFilter] = useState<StatusGroup>("all");

  const filtered = useMemo(() => {
    if (statusFilter === "all") return orders;
    return orders.filter(o => orderStatusGroup(o.status, o.syncState) === statusFilter);
  }, [orders, statusFilter]);

  // Detail view
  if (selectedOrderId) {
    const order = orders.find(o => o.id === selectedOrderId);
    if (!order) {
      setSelectedOrderId(null);
      return null;
    }
    return (
      <OrderDetailView
        order={order}
        onBack={() => setSelectedOrderId(null)}
      />
    );
  }

  // List view
  return (
    <div style={{ padding: S[4] }}>
      <div style={{
        fontSize: T.sz.lg, fontWeight: T.wt.semibold, color: C.ink,
        marginBottom: S[3],
      }}>
        Pedidos
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: S[1], marginBottom: S[3], overflowX: "auto" }}>
        {STATUS_GROUPS.map(g => (
          <button
            key={g.key}
            onClick={() => setStatusFilter(g.key)}
            style={{
              ...filterBtnStyle,
              flex: 1,
              background: statusFilter === g.key ? C.blueDark : C.white,
              color: statusFilter === g.key ? C.white : C.inkMid,
              border: `1px solid ${statusFilter === g.key ? C.blueDark : C.line}`,
              textAlign: "center",
            }}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Order list */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: "center", padding: `${S[8]}px ${S[4]}px`,
          color: C.inkLight, fontSize: T.sz.md,
        }}>
          {statusFilter === "all" ? "No tienes pedidos" : "Sin pedidos en esta categoria"}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
          {filtered.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onClick={() => setSelectedOrderId(order.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Order Card ──────────────────────────────────────────────────────────────

function OrderCard({ order, onClick }: { order: SerializedOrderCard; onClick: () => void }) {
  const sc = STATUS_COLORS[order.status] ?? { bg: C.surfaceAlt, color: C.inkMid };

  return (
    <button
      onClick={onClick}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: S[3], background: C.white, border: `1px solid ${C.line}`,
        borderRadius: R.lg, cursor: "pointer", fontFamily: T.mono,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
            #{order.consecutivo}
          </div>
          <div style={{
            fontSize: T.sz.xs, color: C.inkMid, marginTop: 1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            maxWidth: 200,
          }}>
            {order.customerName}
          </div>
        </div>
        <span style={{
          fontSize: T.sz.xs, padding: `2px ${S[2]}px`,
          background: sc.bg, color: sc.color,
          borderRadius: R.sm, fontWeight: T.wt.medium,
          whiteSpace: "nowrap",
        }}>
          {STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>
      <div style={{ display: "flex", gap: S[3], marginTop: S[2], fontSize: T.sz.xs, color: C.inkLight }}>
        <span>{fmtDaysAgo(order.createdAt)}</span>
        <span>{order.totalUnits} uds</span>
        <span>{fmtCOP(order.totalValue)}</span>
      </div>
    </button>
  );
}

// ── Order Detail View ───────────────────────────────────────────────────────

function OrderDetailView({ order, onBack }: { order: SerializedOrderCard; onBack: () => void }) {
  const sc = STATUS_COLORS[order.status] ?? { bg: C.surfaceAlt, color: C.inkMid };
  const timeline = buildFulfillmentTimeline(order);

  return (
    <div style={{ padding: S[4] }}>
      {/* Back */}
      <button
        onClick={onBack}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: C.blue, fontSize: T.sz.sm, fontFamily: T.mono,
          padding: 0, marginBottom: S[3],
        }}
      >
        {"\u2190"} Volver a pedidos
      </button>

      {/* Header */}
      <div style={{
        padding: S[4], background: C.white, border: `1px solid ${C.line}`,
        borderRadius: R.lg, marginBottom: S[4],
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>
              Pedido #{order.consecutivo}
            </div>
            <div style={{ fontSize: T.sz.sm, color: C.inkMid, marginTop: 2 }}>
              {order.customerName}
            </div>
          </div>
          <span style={{
            fontSize: T.sz.xs, padding: `2px ${S[2]}px`,
            background: sc.bg, color: sc.color,
            borderRadius: R.sm, fontWeight: T.wt.medium,
          }}>
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>

        {/* KPIs */}
        <div style={{ display: "flex", gap: S[3], marginTop: S[3] }}>
          <DetailKpi label="Referencias" value={String(order.totalReferences)} />
          <DetailKpi label="Unidades" value={String(order.totalUnits)} />
          <DetailKpi label="Total" value={fmtCOP(order.totalValue)} />
        </div>

        {/* Metadata */}
        <div style={{ display: "flex", gap: S[3], marginTop: S[3], fontSize: T.sz.xs, color: C.inkLight }}>
          <span>Fecha: {fmtDaysAgo(order.createdAt)}</span>
          {order.channel && <span>Canal: {order.channel}</span>}
        </div>
      </div>

      {/* Fulfillment timeline */}
      <DetailSection title="Cumplimiento">
        {/* Invoice status */}
        <div style={{
          display: "flex", alignItems: "center", gap: S[2],
          marginBottom: S[3],
        }}>
          <InvoiceStatusBadge status={order.fulfillmentStatus} />
          {order.fulfillmentPercent != null && order.fulfillmentPercent > 0 && (
            <span style={{ fontSize: T.sz.xs, color: C.inkMid }}>
              {order.fulfillmentPercent}% facturado
            </span>
          )}
        </div>

        {/* Timeline */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {timeline.map((stage, i) => (
            <TimelineStage key={stage.label} stage={stage} isLast={i === timeline.length - 1} />
          ))}
        </div>
      </DetailSection>

      {/* Sync state */}
      <DetailSection title="Sincronizacion">
        <div style={{ fontSize: T.sz.sm, color: C.ink }}>
          {order.syncState === "sincronizado" && "Sincronizado con SAG"}
          {order.syncState === "nunca_sincronizado" && "Pendiente de sincronizacion"}
          {order.syncState === "error_sincronizacion" && "Error de sincronizacion"}
        </div>
        {order.lastSyncAt && (
          <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginTop: S[1] }}>
            Ultima sync: {fmtDaysAgo(order.lastSyncAt)}
          </div>
        )}
      </DetailSection>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    COMPLETED: { label: "Facturado", bg: C.greenLight, color: C.green },
    IN_PROGRESS: { label: "En proceso", bg: C.amberLight, color: C.amberDark },
    NOT_STARTED: { label: "Sin facturar", bg: C.surfaceAlt, color: C.inkMid },
    NOT_AVAILABLE: { label: "No disponible", bg: C.surfaceAlt, color: C.inkLight },
  };
  const m = map[status] ?? { label: "\u2014", bg: C.surfaceAlt, color: C.inkLight };
  return (
    <span style={{
      fontSize: T.sz.xs, padding: `2px ${S[2]}px`,
      background: m.bg, color: m.color,
      borderRadius: R.sm, fontWeight: T.wt.medium,
    }}>
      {m.label}
    </span>
  );
}

function TimelineStage({ stage, isLast }: { stage: FulfillmentStage; isLast: boolean }) {
  const dotColor = stage.status === "complete" ? C.green
    : stage.status === "current" ? C.blue
    : stage.status === "not_available" ? C.inkLight
    : C.line;
  const lineColor = stage.status === "complete" ? C.green : C.line;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: S[2] }}>
      {/* Dot + line */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 16 }}>
        <div style={{
          width: 10, height: 10, borderRadius: "50%",
          background: dotColor, flexShrink: 0, marginTop: 3,
          border: stage.status === "current" ? `2px solid ${C.blueDark}` : "none",
        }} />
        {!isLast && (
          <div style={{ width: 2, height: 24, background: lineColor }} />
        )}
      </div>
      {/* Label */}
      <div style={{
        fontSize: T.sz.sm,
        color: stage.status === "not_available" ? C.inkLight : C.ink,
        fontWeight: stage.status === "current" ? T.wt.semibold : T.wt.normal,
        paddingBottom: isLast ? 0 : S[2],
      }}>
        {stage.label}
        {stage.status === "not_available" && (
          <span style={{ fontSize: T.sz.xs, color: C.inkLight, marginLeft: S[1] }}>
            {"\u2014"} No disponible
          </span>
        )}
      </div>
    </div>
  );
}
