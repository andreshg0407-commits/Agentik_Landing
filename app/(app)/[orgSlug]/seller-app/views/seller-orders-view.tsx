/**
 * Seller App — Pedidos Realizados View.
 *
 * Sprint: AGENTIK-SELLER-APP-UI-03
 * Sprint: AGENTIK-SELLER-APP-ORDER-ACTIONS-P0
 *
 * Mobile seller-scoped order list + detail + fulfillment + edit + share.
 * Uses canonical Pedidos domain. Seller sees only own orders.
 *
 * Detail: fetches full order via API `get` action (lines, header, totals).
 * Edit: reuses canonical `updateOrderDraft()` via API `update_draft` action.
 * Share: reuses canonical `buildOrderSharePayload()` via API `share` action.
 * PDF: reuses canonical `exportOrderPdf()` via API `/pedidos/pdf` route.
 *
 * Fulfillment stages shown ONLY when factual authority exists.
 */
"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { C, T, S, R, E } from "@/lib/ui/tokens";
import {
  DetailSection, DetailKpi, filterBtnStyle, fmtCOP, fmtDaysAgo,
  type SerializedOrderCard,
} from "./seller-app-shared";
import { SellerIcon, StatusChip, EmptyState, appCard } from "./seller-ui-kit";
import { ExistingOrderEditor } from "./existing-order-editor";

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
  NOT_AVAILABLE: "Sin información aún",
};

// ── Action availability (domain policy) ─────────────────────────────────────

function isEditable(origin: string, status: string, syncState: string): boolean {
  // Only Agentik-native orders in pre-SAG states are editable
  const isNative = origin === "AGENTIK_NATIVE" || origin === "agentik";
  if (!isNative) return false;
  return status === "borrador" || status === "listo_para_enviar";
}

function isShareable(_origin: string, _status: string): boolean {
  // All orders are shareable (view-only share of document)
  return true;
}

// ── Order detail types (from server getOrder) ───────────────────────────────

interface OrderLineDetail {
  id: string;
  referenceCode: string;
  productName: string;
  size: string;
  color: string;
  colorName?: string | null;
  quantity: number;
  availableUnits: number | null;
  unitPrice: number;
  lineTotal: number;
  removed: boolean;
  thumbnailUrl?: string | null;
}

interface OrderDetail {
  id: string;
  consecutivo: number;
  header: {
    customerId: string;
    customerName: string;
    customerCode: string;
    sellerId: string;
    sellerName: string;
    channel: string;
    notes: string;
    deliveryMode?: string;
    deliveryDate?: string | null;
    discountType?: string;
    discountValue?: number;
    customerNotes?: string;
    customerAddress?: string;
    customerCity?: string;
    orderDate?: string;
  };
  lines: OrderLineDetail[];
  status: string;
  origin: string;
  syncState: string;
  summary: {
    totalLines: number;
    activeLines: number;
    totalUnits: number;
    totalValue: number;
    uniqueReferences: number;
    discountAmount?: number;
    totalFinal?: number;
  };
  createdAt: string;
  lastSyncAt: string | null;
  sagOrderId: string | null;
}

// ── Fulfillment timeline stages ─────────────────────────────────────────────

interface FulfillmentStage {
  label: string;
  status: "complete" | "current" | "pending" | "not_available";
}

function buildFulfillmentTimeline(order: SerializedOrderCard): FulfillmentStage[] {
  const stages: FulfillmentStage[] = [];
  stages.push({ label: "Pedido recibido", status: "complete" });

  if (order.fulfillmentStatus === "COMPLETED") {
    stages.push({ label: "Facturado", status: "complete" });
  } else if (order.fulfillmentStatus === "IN_PROGRESS") {
    stages.push({ label: "Facturacion", status: "current" });
  } else {
    stages.push({ label: "Facturacion", status: "pending" });
  }

  stages.push({ label: "Despacho", status: "not_available" });
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
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusGroup>("all");

  const filtered = useMemo(() => {
    if (statusFilter === "all") return orders;
    return orders.filter(o => orderStatusGroup(o.status, o.syncState) === statusFilter);
  }, [orders, statusFilter]);

  // Editor view — dedicated existing-order editor (NOT the wizard)
  if (editingOrderId) {
    return (
      <ExistingOrderEditor
        orderId={editingOrderId}
        orgSlug={orgSlug}
        orgId={orgId}
        onClose={(updatedId) => {
          setEditingOrderId(null);
          // Return to detail of the same order after save
          if (updatedId) setSelectedOrderId(updatedId);
        }}
        onDeleted={() => {
          setEditingOrderId(null);
          setSelectedOrderId(null);
        }}
      />
    );
  }

  // Detail view — fetches full order from server
  if (selectedOrderId) {
    const orderCard = orders.find(o => o.id === selectedOrderId);
    if (!orderCard) {
      setSelectedOrderId(null);
      return null;
    }
    return (
      <OrderDetailView
        orderCard={orderCard}
        orgSlug={orgSlug}
        orgId={orgId}
        onBack={() => setSelectedOrderId(null)}
        onEditOrder={(id) => setEditingOrderId(id)}
      />
    );
  }

  // List view
  return (
    <div style={{ padding: S[4] }}>
      <div style={{
        fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.titleDeep,
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
              flex: 1, minHeight: 38,
              background: statusFilter === g.key ? C.blueDark : C.white,
              color: statusFilter === g.key ? C.white : C.ink,
              border: `1.5px solid ${statusFilter === g.key ? C.blueDark : C.line}`,
              textAlign: "center",
            }}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Order list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="clipboard"
          title={statusFilter === "all" ? "No tienes pedidos" : "Sin pedidos en esta categoria"}
          subtitle={statusFilter === "all" ? "Crea tu primer pedido desde Inicio" : undefined}
        />
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
        ...appCard,
        display: "block", width: "100%", textAlign: "left",
        padding: S[3], cursor: "pointer", fontFamily: T.sans,
        minHeight: 72, touchAction: "manipulation",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: S[2] }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: T.sz.md, fontWeight: T.wt.bold, color: C.ink }}>
            #{order.consecutivo}
          </div>
          <div style={{
            fontSize: T.sz.sm, color: C.inkMid, marginTop: 1,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {order.customerName}
          </div>
        </div>
        <StatusChip bg={sc.bg} color={sc.color}>
          {STATUS_LABELS[order.status] ?? order.status}
        </StatusChip>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: S[3], marginTop: S[2], fontSize: T.sz.xs, color: C.inkLight }}>
        <span>{fmtDaysAgo(order.createdAt)}</span>
        <span>{order.totalUnits} uds</span>
        <span style={{ fontWeight: T.wt.bold, color: C.ink, fontSize: T.sz.sm, marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{fmtCOP(order.totalValue)}</span>
        <SellerIcon name="chevronRight" size={15} color={C.inkGhost} />
      </div>
    </button>
  );
}

// ── Order Detail View ───────────────────────────────────────────────────────

function OrderDetailView({
  orderCard,
  orgSlug,
  orgId,
  onBack,
  onEditOrder,
}: {
  orderCard: SerializedOrderCard;
  orgSlug: string;
  orgId: string;
  onBack: () => void;
  onEditOrder?: (orderId: string) => void;
}) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);

  const sc = STATUS_COLORS[orderCard.status] ?? { bg: C.surfaceAlt, color: C.inkMid };
  const timeline = buildFulfillmentTimeline(orderCard);

  const canEdit = isEditable(orderCard.origin, orderCard.status, orderCard.syncState);
  const canShare = isShareable(orderCard.origin, orderCard.status);

  // Fetch full order detail from server
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get", orderId: orderCard.id }),
        });
        if (r.ok && !cancelled) {
          const data = await r.json();
          if (data.order) setDetail(data.order);
        }
      } catch { /* degrade silently */ }
      if (!cancelled) setLoadingDetail(false);
    })();
    return () => { cancelled = true; };
  }, [orgSlug, orderCard.id]);

  // Fetch canonical PDF blob from server (shared by download + share)
  const fetchPdfBlob = useCallback(async (): Promise<Blob | null> => {
    try {
      const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderCard.id }),
      });
      if (r.ok) return r.blob();
    } catch { /* ignore */ }
    return null;
  }, [orgSlug, orderCard.id]);

  // Download PDF (browser file download)
  const handleDownloadPdf = useCallback(async () => {
    setPdfLoading(true);
    const blob = await fetchPdfBlob();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pedido_${orderCard.consecutivo}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    setPdfLoading(false);
  }, [fetchPdfBlob, orderCard.consecutivo]);

  // Share PDF via Web Share API (native share sheet — iOS Safari / Android Chrome)
  // Falls back to text-only WhatsApp if Web Share not available
  const handleSharePdf = useCallback(async () => {
    setShareLoading(true);
    const blob = await fetchPdfBlob();
    const fileName = `pedido_${orderCard.consecutivo}.pdf`;

    if (blob) {
      // Attempt Web Share API with PDF file
      const pdfFile = new File([blob], fileName, { type: "application/pdf" });
      if (typeof navigator !== "undefined" && navigator.share && navigator.canShare?.({ files: [pdfFile] })) {
        try {
          await navigator.share({
            title: `Pedido #${orderCard.consecutivo}`,
            text: `Pedido #${orderCard.consecutivo} — ${orderCard.customerName}`,
            files: [pdfFile],
          });
          setShareLoading(false);
          return;
        } catch (e: any) {
          // AbortError = user cancelled share sheet — not an error
          if (e?.name === "AbortError") {
            setShareLoading(false);
            return;
          }
          // Fall through to text fallback
        }
      }
    }

    // Fallback: text-only WhatsApp share (when Web Share API unavailable or PDF failed)
    try {
      const r = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "share", orderId: orderCard.id }),
      });
      if (r.ok) {
        const { share } = await r.json();
        if (share?.whatsappText) {
          const encoded = encodeURIComponent(share.whatsappText);
          window.open(`https://wa.me/?text=${encoded}`, "_blank");
        }
      }
    } catch { /* ignore */ }
    setShareLoading(false);
  }, [fetchPdfBlob, orderCard.consecutivo, orderCard.customerName, orgSlug, orderCard.id]);

  // Use detail totals when available, fall back to card-level data
  const totalValue = detail?.summary?.totalFinal ?? detail?.summary?.totalValue ?? orderCard.totalValue;
  const totalUnits = detail?.summary?.totalUnits ?? orderCard.totalUnits;
  const totalRefs = detail?.summary?.uniqueReferences ?? orderCard.totalReferences;
  const activeLines = detail ? detail.lines.filter(l => !l.removed) : [];

  return (
    <div style={{ padding: S[4] }}>
      {/* Back */}
      <button
        onClick={onBack}
        style={{
          display: "flex", alignItems: "center", gap: S[1],
          background: "none", border: "none", cursor: "pointer",
          color: C.blueDark, fontSize: T.sz.md, fontWeight: T.wt.semibold, fontFamily: T.sans,
          padding: `${S[2]}px 0`, minHeight: 44, marginBottom: S[1], touchAction: "manipulation",
        }}
      >
        <SellerIcon name="back" size={17} color={C.blueDark} /> Pedidos
      </button>

      {/* Header card */}
      <div style={{ ...appCard, padding: S[4], marginBottom: S[3] }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>
              Pedido #{orderCard.consecutivo}
            </div>
            <div style={{ fontSize: T.sz.sm, color: C.inkMid, marginTop: 2 }}>
              {detail?.header?.customerName || orderCard.customerName}
            </div>
          </div>
          <span style={{
            fontSize: T.sz.xs, padding: `2px ${S[2]}px`,
            background: sc.bg, color: sc.color,
            borderRadius: R.sm, fontWeight: T.wt.medium,
          }}>
            {STATUS_LABELS[orderCard.status] ?? orderCard.status}
          </span>
        </div>

        {/* KPIs */}
        <div style={{ display: "flex", gap: S[3], marginTop: S[3] }}>
          <DetailKpi label="Referencias" value={String(totalRefs)} />
          <DetailKpi label="Unidades" value={String(totalUnits)} />
          <DetailKpi label="Total" value={fmtCOP(totalValue)} />
        </div>

        {/* Metadata */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: S[3], marginTop: S[3], fontSize: T.sz.xs, color: C.inkLight }}>
          <span>Fecha: {fmtDaysAgo(orderCard.createdAt)}</span>
          {detail?.header?.sellerName && <span>Vendedor: {detail.header.sellerName}</span>}
          {orderCard.channel && <span>Canal: {orderCard.channel}</span>}
          {detail?.header?.orderDate && <span>Fecha pedido: {detail.header.orderDate}</span>}
        </div>
      </div>

      {/* Action buttons */}
      {(canEdit || canShare) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: S[2], marginBottom: S[3] }}>
          {canEdit && (
            <button
              disabled={!detail || !onEditOrder}
              onClick={() => {
                if (!detail || !onEditOrder) return;
                onEditOrder(detail.id);
              }}
              style={{
                ...actionBtnStyle,
                flex: 1,
                opacity: detail ? 1 : 0.5,
              }}
            >
              <SellerIcon name="pencil" size={16} color={C.blueDark} />
              <span>{loadingDetail ? "..." : "Editar"}</span>
            </button>
          )}
          {canShare && (
            <>
              <button
                onClick={handleDownloadPdf}
                disabled={pdfLoading}
                style={{ ...actionBtnStyle, flex: 1 }}
              >
                <SellerIcon name="download" size={16} color={C.blueDark} />
                <span>{pdfLoading ? "..." : "Descargar PDF"}</span>
              </button>
              <button
                onClick={handleSharePdf}
                disabled={shareLoading}
                style={{ ...actionBtnStyle, flex: 1 }}
              >
                <SellerIcon name="shareExternal" size={16} color={C.blueDark} />
                <span>{shareLoading ? "..." : "Compartir PDF"}</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Order lines */}
      <DetailSection title={`Lineas${activeLines.length > 0 ? ` (${activeLines.length})` : ""}`}>
        {loadingDetail ? (
          <div style={{ fontSize: T.sz.sm, color: C.inkLight, padding: S[2] }}>
            Cargando detalle...
          </div>
        ) : activeLines.length === 0 ? (
          <div style={{ fontSize: T.sz.sm, color: C.inkLight, padding: S[2] }}>
            {"\u2014"} Sin lineas disponibles
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {activeLines.map((line, i) => (
              <OrderLineRow key={line.id} line={line} isLast={i === activeLines.length - 1} />
            ))}
            {/* Line total */}
            <div style={{
              display: "flex", justifyContent: "space-between",
              padding: `${S[2]}px 0`, marginTop: S[1],
              borderTop: `1px solid ${C.line}`,
              fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink,
            }}>
              <span>Total</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtCOP(totalValue)}</span>
            </div>
          </div>
        )}
      </DetailSection>

      {/* Discount info */}
      {detail?.summary?.discountAmount != null && detail.summary.discountAmount > 0 && (
        <DetailSection title="Condiciones">
          <div style={{ fontSize: T.sz.sm, color: C.ink, fontVariantNumeric: "tabular-nums" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Subtotal</span>
              <span>{fmtCOP(detail.summary.totalValue)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: S[1], color: C.green }}>
              <span>Descuento</span>
              <span>-{fmtCOP(detail.summary.discountAmount)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: S[1], fontWeight: T.wt.bold }}>
              <span>Total final</span>
              <span>{fmtCOP(detail.summary.totalFinal ?? detail.summary.totalValue)}</span>
            </div>
          </div>
        </DetailSection>
      )}

      {/* Notes */}
      {detail?.header?.notes && (
        <DetailSection title="Notas">
          <div style={{ fontSize: T.sz.sm, color: C.ink, whiteSpace: "pre-wrap" }}>
            {detail.header.notes}
          </div>
        </DetailSection>
      )}

      {/* Fulfillment timeline */}
      <DetailSection title="Cumplimiento">
        <div style={{
          display: "flex", alignItems: "center", gap: S[2],
          marginBottom: S[3],
        }}>
          <InvoiceStatusBadge status={orderCard.fulfillmentStatus} />
          {orderCard.fulfillmentPercent != null && orderCard.fulfillmentPercent > 0 && (
            <span style={{ fontSize: T.sz.xs, color: C.inkMid }}>
              {orderCard.fulfillmentPercent}% facturado
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {timeline.map((stage, i) => (
            <TimelineStage key={stage.label} stage={stage} isLast={i === timeline.length - 1} />
          ))}
        </div>
      </DetailSection>

      {/* Sync state */}
      <DetailSection title="Sincronizacion">
        <div style={{ fontSize: T.sz.sm, color: C.ink }}>
          {orderCard.syncState === "sincronizado" && "Sincronizado con SAG"}
          {orderCard.syncState === "nunca_sincronizado" && "Pendiente de sincronizacion"}
          {orderCard.syncState === "error_sincronizacion" && "Error de sincronizacion"}
        </div>
        {orderCard.lastSyncAt && (
          <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginTop: S[1] }}>
            Ultima sync: {fmtDaysAgo(orderCard.lastSyncAt)}
          </div>
        )}
        {detail?.sagOrderId && (
          <div style={{ fontSize: T.sz.xs, color: C.inkLight, marginTop: S[1] }}>
            SAG ID: {detail.sagOrderId}
          </div>
        )}
      </DetailSection>

      {/* Source */}
      <DetailSection title="Origen">
        <div style={{ fontSize: T.sz.sm, color: C.ink }}>
          {orderCard.origin === "AGENTIK_NATIVE" || orderCard.origin === "agentik"
            ? "Creado en Agentik"
            : orderCard.origin === "SAG_HISTORICAL" || orderCard.origin === "sag_customer_order"
              ? "Historial SAG"
              : orderCard.origin === "CRM_LEGACY"
                ? "CRM Legado"
                : orderCard.origin}
        </div>
      </DetailSection>
    </div>
  );
}

// ── Order line row ──────────────────────────────────────────────────────────

function OrderLineRow({ line, isLast }: { line: OrderLineDetail; isLast: boolean }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: S[2],
      padding: `${S[2]}px 0`,
      borderBottom: isLast ? "none" : `1px solid ${C.surfaceAlt}`,
      fontSize: T.sz.sm,
    }}>
      {/* Thumbnail */}
      {line.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={line.thumbnailUrl}
          alt=""
          style={{
            width: 40, height: 40, borderRadius: R.sm,
            objectFit: "cover", flexShrink: 0,
            border: `1px solid ${C.line}`,
          }}
        />
      )}
      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: T.wt.semibold, color: C.ink }}>
          {line.referenceCode}
        </div>
        <div style={{ fontSize: T.sz.xs, color: C.inkMid, marginTop: 1 }}>
          {line.colorName ?? line.color}{line.size ? ` / ${line.size}` : ""}
        </div>
      </div>
      {/* Quantity + price */}
      <div style={{ textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
        <div style={{ fontWeight: T.wt.semibold, color: C.ink }}>
          {fmtCOP(line.lineTotal)}
        </div>
        <div style={{ fontSize: T.sz.xs, color: C.inkLight }}>
          {line.quantity} × {fmtCOP(line.unitPrice)}
        </div>
      </div>
    </div>
  );
}

// ── Action button style ────────────────────────────────────────────────────

const actionBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: S[1],
  padding: `${S[2]}px ${S[3]}px`,
  minHeight: 44,
  background: C.white,
  border: `1.5px solid ${C.blueDark}`,
  borderRadius: R.lg,
  color: C.blueDark,
  fontFamily: T.sans,
  fontSize: T.sz.sm,
  fontWeight: T.wt.semibold,
  cursor: "pointer",
  touchAction: "manipulation",
};

// ── Sub-components ──────────────────────────────────────────────────────────

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    COMPLETED: { label: "Facturado", bg: C.greenLight, color: C.green },
    IN_PROGRESS: { label: "En proceso", bg: C.amberLight, color: C.amberDark },
    NOT_STARTED: { label: "Sin facturar", bg: C.surfaceAlt, color: C.inkMid },
    NOT_AVAILABLE: { label: "Sin información aún", bg: C.surfaceAlt, color: C.inkLight },
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
      <div style={{
        fontSize: T.sz.sm,
        color: stage.status === "not_available" ? C.inkLight : C.ink,
        fontWeight: stage.status === "current" ? T.wt.semibold : T.wt.normal,
        paddingBottom: isLast ? 0 : S[2],
      }}>
        {stage.label}
        {stage.status === "not_available" && (
          <span style={{ fontSize: T.sz.xs, color: C.inkLight, marginLeft: S[1] }}>
            {"\u2014"} Sin información aún
          </span>
        )}
      </div>
    </div>
  );
}
