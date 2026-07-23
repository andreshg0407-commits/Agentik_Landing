"use client";

/**
 * Pedidos — Client Component.
 *
 * Sales-focused order workspace. "El pedido debe sentirse como vender,
 * no como llenar un ERP."
 *
 * Sprint: COMERCIAL-PEDIDOS-CREATOR-01
 * Sprint: COMERCIAL-PEDIDOS-POS-02
 * Sprint: COMERCIAL-PEDIDOS-UX-01
 * Sprint: COMERCIAL-PEDIDOS-MOBILE-UX-02
 * Sprint: COMERCIAL-PEDIDOS-PRODUCTOS-MOBILE-03
 * Sprint: COMERCIAL-PEDIDOS-INTELIGENCIA-COMERCIAL-05
 * Sprint: COMERCIAL-PEDIDOS-SAG-DATA-07
 * Sprint: COMERCIAL-PEDIDOS-VARIANTES-02
 * Sprint: COMERCIAL-PEDIDOS-POLISH-03
 * Sprint: COMERCIAL-PEDIDOS-DAVID-STOCK-03
 * Hotfix: ORDER-DRAFT-DETAIL-ACTIONS-HOTFIX-01
 * Sprint: ORDER-SHARE-COMMERCIAL-01
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { WholesaleOrderWizard } from "./wholesale-order-wizard";
import { C, T, S, R, E, panel, panelHeader, dataRow } from "@/lib/ui/tokens";
import type {
  OrderDraft,
  OrderLine,
  OrderHeader,
  OrderCard,
  OrderStatus,
  OrderSyncState,
  OrderValidationResult,
  OrderCopilotSignal,
} from "@/lib/comercial/pedidos/order-types";
import {
  validateOrder,
  computeOrderSummary,
  buildOrderDavidSignals,
} from "@/lib/comercial/pedidos/order-validation";
import {
  evaluateOrderFulfillment,
  sortFulfillmentLines,
  buildFulfillmentDavidMessage,
  type OrderFulfillmentSummary,
  type LineFulfillment,
  type LineFulfillmentStatus,
  type OrderFulfillmentGrade,
} from "@/lib/comercial/pedidos/order-fulfillment";
import type {
  OrderProductSearchResult,
  OrderProductVariant,
  OrderLineCandidate,
  OrderInventoryStatus,
} from "@/lib/comercial/pedidos/order-product-types";
import type {
  CustomerOrderHistory,
  SellerOrderHistory,
} from "@/lib/comercial/pedidos/order-history-types";
import type {
  SellerPerformance,
} from "@/lib/comercial/pedidos/seller-performance-service";
import type {
  OrderFulfillmentStatus,
  CustomerCommercialMemory,
  DavidCommercialInsight,
} from "@/lib/comercial/pedidos/order-core-types";
import {
  buildOrderSharePayload,
  type OrderShareBranding,
  type OrderSharePayload,
} from "@/lib/comercial/pedidos/order-share";

// ── Props ────────────────────────────────────────────────────────────────────

interface CommercialHealth {
  pedidosImportados:      number;
  pedidosConLineas:       number;
  lineasRegistradas:      number;
  productosDisponibles:   number;
  productosSinInventario: number;
}

interface Props {
  orgSlug:            string;
  orgId:              string;
  initialStats:       OrderStats;
  initialOrders:      OrderCard[];
  commercialHealth?:  CommercialHealth;
  maxSagOrderDate?:   string | null;
  branding?:          OrderShareBranding;
}

interface OrderStats {
  today:         number;
  pendingSag:    number;
  synced:        number;
  conflicts:     number;
  fromAgentik:   number;
  fromSag:       number;
  fromImport:    number;
  fromMigration: number;
}

// ── Customer profile (from search_customers) ─────────────────────────────────

interface CustomerProfile {
  customerCode:   string;
  customerName:   string;
  customerId:     string;
  lastSellerName: string;
  lastChannel:    string;
  totalOrders:    number;
  totalValue:     number;
  lastOrderDate:  string | null;
  city:           string;
  sagCode:        string;
}

// ── Status maps ──────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<OrderStatus, string> = {
  borrador:           "Borrador",
  listo_para_enviar:  "Listo para enviar",
  pendiente_sag:      "Pendiente de envio",
  sincronizado:       "Confirmado",
  conflicto:          "Conflicto",
  cancelado:          "Cancelado",
};

const STATUS_COLOR: Record<OrderStatus, { bg: string; text: string }> = {
  borrador:           { bg: C.surface,     text: C.inkMid },
  listo_para_enviar:  { bg: C.blueLight,   text: C.blueDark },
  pendiente_sag:      { bg: C.amberLight,  text: C.amber },
  sincronizado:       { bg: C.greenLight,  text: C.green },
  conflicto:          { bg: C.redLight,    text: C.red },
  cancelado:          { bg: C.surface,     text: C.inkFaint },
};

function orderStateLabel(syncState: OrderSyncState, origin: string, hasLines: boolean): string {
  if (syncState === "sincronizado") return "Confirmado en SAG";
  if (syncState === "error_sincronizacion") return "Error de envio";
  // nunca_sincronizado — depends on origin
  if (origin === "sag_customer_order") return "Pedido SAG";
  if (origin === "sag") return hasLines ? "Cotizacion CRM" : "Cotizacion CRM";
  if (origin === "agentik") return "Borrador Agentik";
  return "Pendiente de envio";
}

// ── Inventory visual system (INVENTARIO-01 Phase 5) ─────────────────────────

const INVENTORY_COLORS: Record<OrderInventoryStatus, { bg: string; fg: string; label: string }> = {
  high:        { bg: C.greenLight,  fg: C.green,   label: "Disponible" },
  medium:      { bg: C.amberLight,  fg: C.amber,   label: "Ultimas unidades" },
  low:         { bg: C.redLight,    fg: C.red,     label: "Ultimas unidades" },
  out:         { bg: C.redLight,    fg: C.red,     label: "Referencia agotada" },
  unsynced:    { bg: C.surface,     fg: C.inkFaint, label: "Inventario no validado" },
  no_variants: { bg: C.surface,     fg: C.inkFaint, label: "Sin inventario disponible" },
};

// ── API helpers ─────────────────────────────────────────────────────────────

async function orderApi(orgSlug: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return res.json();
}

async function productApi(orgSlug: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos/products`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return res.json();
}

async function historyApi(orgSlug: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos/history`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`historyApi ${body.action}: HTTP ${res.status} — ${text.slice(0, 200)}`);
  }
  return res.json();
}

// ── Draft action guards (ORDER-DRAFT-DETAIL-ACTIONS-HOTFIX-01) ──────────────

function isAgentikOrder(origin: string): boolean {
  const n = origin.toLowerCase().trim();
  return n === "agentik" || n === "agk";
}

function isDraftStatus(status: string): boolean {
  const n = status.toLowerCase().trim();
  return n === "borrador" || n === "borrador_agentik" || n === "draft";
}

/**
 * Agentik order is deletable if it has NEVER touched SAG.
 * Status is irrelevant — borrador, listo_para_enviar, cancelado all qualify.
 */
function canDeleteDraftOrder(order: { origin: string; status: string; sagOrderId: string | null; syncState?: string }): boolean {
  return isAgentikOrder(order.origin)
    && !order.sagOrderId
    && order.status !== "sincronizado";
}

function isEditableStatus(status: string): boolean {
  const n = status.toLowerCase().trim();
  return isDraftStatus(n) || n === "listo_para_enviar";
}

function canEditDraftOrder(order: { origin: string; status: string; sagOrderId: string | null }): boolean {
  return isAgentikOrder(order.origin)
    && !order.sagOrderId
    && isEditableStatus(order.status);
}

// ── Wizard step type ────────────────────────────────────────────────────────

type WizardStep = "cliente" | "productos" | "resumen";

// ── Main component ──────────────────────────────────────────────────────────

type ViewFilter = "todos" | "hoy" | "borradores" | "pendientes" | "sincronizados" | "conflictos";

export function PedidosClient({ orgSlug, initialStats, initialOrders, commercialHealth, maxSagOrderDate, branding }: Props) {
  const [stats, setStats]     = useState<OrderStats>(initialStats);
  const [orders, setOrders]   = useState<OrderCard[]>(initialOrders);
  const [filter, setFilter]   = useState<ViewFilter>("todos");

  // Wizard state
  const [wizardOpen, setWizardOpen]       = useState(false);
  const [wizardStep, setWizardStep]       = useState<WizardStep>("cliente");
  const [wizardHeader, setWizardHeader]   = useState<OrderHeader>({
    customerId: "", customerName: "", customerCode: "",
    sellerId: "", sellerName: "", channel: "", notes: "",
  });
  const [wizardLines, setWizardLines] = useState<OrderLine[]>([]);
  const [submitting, setSubmitting]   = useState(false);
  const wizardSessionRef = useRef<string>("");

  // Detail drawer
  const [selectedOrder, setSelectedOrder]     = useState<OrderDraft | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  // Edit mode: when editing an existing draft instead of creating new
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);

  // Demand intelligence (PEDIDOS-DEMANDA-PRODUCCION-01)
  const [demandSummary, setDemandSummary] = useState<any>(null);
  const demandLoaded = useRef(false);
  useEffect(() => {
    if (demandLoaded.current) return;
    demandLoaded.current = true;
    fetch(`/api/orgs/${orgSlug}/comercial/demand`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "snapshot" }),
    })
      .then(r => r.json())
      .then(d => setDemandSummary(d.snapshot ?? null))
      .catch(() => {});
  }, [orgSlug]);

  // Feedback
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [reservationAlert, setReservationAlert] = useState<{
    type: "success" | "conflict" | "error";
    message: string;
    conflicts?: Array<{ reference: string; requested: number; available: number; shortfall: number }>;
  } | null>(null);

  function showFeedback(msg: string) {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 5000);
  }

  /** Interprets reservation result from API and shows appropriate feedback. */
  function handleReservationResult(reservation: any, context: "save" | "submit") {
    if (!reservation) {
      // No reservation data — legacy or error
      setReservationAlert(null);
      return;
    }
    if (reservation.ok) {
      setReservationAlert({
        type: "success",
        message: context === "save"
          ? "Borrador guardado y unidades reservadas."
          : "Pedido enviado y unidades reservadas.",
      });
      setTimeout(() => setReservationAlert(null), 6000);
    } else if (reservation.status === "CONFLICT") {
      setReservationAlert({
        type: "conflict",
        message: "La disponibilidad cambio. Revisa las cantidades.",
        conflicts: reservation.conflicts ?? [],
      });
      // Do NOT auto-dismiss conflicts — user must acknowledge
    } else {
      // PERSISTENCE_ERROR, EXPIRED, NO_INVENTORY_DATA
      setReservationAlert({
        type: "error",
        message: reservation.retryable
          ? "El pedido se guardo como borrador, pero las unidades no quedaron reservadas. Puedes reintentar."
          : `Error de reserva: ${reservation.message}`,
      });
      setTimeout(() => setReservationAlert(null), 10000);
    }
  }

  // Load orders
  const loadOrders = useCallback(async (statusFilter?: string, today?: boolean) => {
    const data = await orderApi(orgSlug, { action: "list", status: statusFilter, today });
    setOrders(data.orders ?? []);
  }, [orgSlug]);

  async function loadStats() {
    const data = await orderApi(orgSlug, { action: "stats" });
    if (data.stats) setStats(data.stats);
  }

  async function applyFilter(f: ViewFilter) {
    setFilter(f);
    switch (f) {
      case "hoy":           await loadOrders(undefined, true); break;
      case "borradores":    await loadOrders("borrador"); break;
      case "pendientes":    await loadOrders("pendiente_sag"); break;
      case "sincronizados": await loadOrders("sincronizado"); break;
      case "conflictos":    await loadOrders("conflicto"); break;
      default:              await loadOrders(); break;
    }
  }

  // Wizard actions
  function openWizard() {
    setWizardHeader({
      customerId: "", customerName: "", customerCode: "",
      sellerId: "", sellerName: "", channel: "", notes: "",
    });
    setWizardLines([]);
    setWizardStep("cliente");
    setSubmitting(false);
    setEditingOrderId(null);
    wizardSessionRef.current = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setWizardOpen(true);
  }

  function addLineFromCandidate(c: OrderLineCandidate) {
    setWizardLines(prev => {
      // Merge: if same ref+size+color exists (and not removed), sum quantity
      const existingIdx = prev.findIndex(
        l => !l.removed
          && l.referenceCode === c.referenceCode
          && l.size === c.size
          && l.color === c.color,
      );
      if (existingIdx >= 0) {
        return prev.map((l, i) => {
          if (i !== existingIdx) return l;
          const q = l.quantity + c.quantity;
          return { ...l, quantity: q, lineTotal: q * l.unitPrice };
        });
      }
      // New line
      const newLine: OrderLine = {
        id:             `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        referenceCode:  c.referenceCode,
        productName:    c.productName,
        size:           c.size,
        color:          c.color,
        quantity:       c.quantity,
        availableUnits: c.availableUnits,
        unitPrice:      c.unitPrice,
        lineTotal:      c.quantity * c.unitPrice,
        removed:        false,
        comment:        "",
        thumbnailUrl:   c.thumbnailUrl,
      };
      return [...prev, newLine];
    });
  }

  function updateWizardLineQty(lineId: string, quantity: number) {
    setWizardLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      const q = Math.max(1, quantity);
      return { ...l, quantity: q, lineTotal: q * l.unitPrice };
    }));
  }

  function removeWizardLine(lineId: string) {
    setWizardLines(prev => prev.map(l => l.id === lineId ? { ...l, removed: true } : l));
  }

  async function saveDraft() {
    if (submitting) return;
    setSubmitting(true);
    setReservationAlert(null);
    try {
      if (editingOrderId) {
        // Update existing draft
        const data = await orderApi(orgSlug, {
          action: "update_draft",
          orderId: editingOrderId,
          header: wizardHeader,
          lines:  wizardLines,
        });
        if (data.order) {
          handleReservationResult(data.reservation, "save");
          const hasConflict = data.reservation && !data.reservation.ok && data.reservation.status === "CONFLICT";
          if (!hasConflict) {
            showFeedback(data.reservation?.ok
              ? "Borrador actualizado y unidades reservadas."
              : "Borrador actualizado.");
            setWizardOpen(false);
            setEditingOrderId(null);
          }
          // On conflict: keep wizard open so user can adjust quantities
          await loadOrders();
          await loadStats();
        }
      } else {
        // Create new draft
        const data = await orderApi(orgSlug, {
          action: "create",
          header: wizardHeader,
          lines:  wizardLines,
          createdBy: "usuario",
          wizardSessionKey: wizardSessionRef.current,
        });
        if (data.order) {
          handleReservationResult(data.reservation, "save");
          const hasConflict = data.reservation && !data.reservation.ok && data.reservation.status === "CONFLICT";
          if (!hasConflict) {
            showFeedback(data.reservation?.ok
              ? "Pedido guardado y unidades reservadas."
              : "Pedido guardado como borrador.");
            setWizardOpen(false);
          }
          // On conflict: keep wizard open so user can adjust
          if (hasConflict && data.order.id) {
            setEditingOrderId(data.order.id);
          }
          await loadOrders();
          await loadStats();
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitDraft() {
    if (submitting) return;
    setSubmitting(true);
    setReservationAlert(null);
    try {
      const data = await orderApi(orgSlug, {
        action: "create",
        header: wizardHeader,
        lines:  wizardLines,
        createdBy: "usuario",
        wizardSessionKey: wizardSessionRef.current,
      });
      if (data.order) {
        const submitData = await orderApi(orgSlug, {
          action: "submit", orderId: data.order.id,
        });
        if (submitData.order) {
          // Check reservation result from submit
          if (submitData.reservation && !submitData.reservation.ok) {
            handleReservationResult(submitData.reservation, "submit");
            // Submit reverted to borrador — keep wizard open for user to fix
            if (submitData.reservation.status === "CONFLICT") {
              setEditingOrderId(data.order.id);
              // Do NOT close wizard — user must adjust quantities
            } else {
              showFeedback("El pedido se guardo como borrador. Las unidades no quedaron reservadas.");
              setWizardOpen(false);
            }
          } else {
            handleReservationResult(submitData.reservation, "submit");
            showFeedback("Pedido enviado y unidades reservadas.");
            setWizardOpen(false);
          }
          await loadOrders();
          await loadStats();
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Order detail
  async function openOrderDetail(orderId: string) {
    const data = await orderApi(orgSlug, { action: "get", orderId });
    if (data.order) {
      setSelectedOrder(data.order);
      setDetailDrawerOpen(true);
    }
  }

  async function handleOrderAction(orderId: string, action: string) {
    // Edit draft: load order data into wizard
    if (action === "edit_draft") {
      const data = await orderApi(orgSlug, { action: "get", orderId });
      if (data.order && canEditDraftOrder(data.order)) {
        const draft = data.order as OrderDraft;
        setWizardHeader(draft.header);
        setWizardLines(draft.lines);
        setWizardStep("resumen");
        wizardSessionRef.current = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setEditingOrderId(orderId);
        setDetailDrawerOpen(false);
        setSelectedOrder(null);
        setWizardOpen(true);
      } else {
        showFeedback("Este pedido no se puede editar.");
      }
      return;
    }

    if (action === "delete_draft") {
      const data = await orderApi(orgSlug, { action: "delete_draft", orderId });
      if (data.ok) {
        showFeedback("Borrador eliminado.");
        setDetailDrawerOpen(false);
        setSelectedOrder(null);
        await loadOrders();
        await loadStats();
      } else {
        showFeedback(data.error ?? "No se pudo eliminar el pedido.");
      }
      return;
    }
    const data = await orderApi(orgSlug, { action, orderId });
    if (data.order) {
      setSelectedOrder(data.order);
      showFeedback(`Pedido actualizado: ${STATUS_LABEL[data.order.status as OrderStatus] ?? data.order.status}`);
      await loadOrders();
      await loadStats();
      if (action === "cancel") {
        setDetailDrawerOpen(false);
      }
    }
  }

  // Wizard validation
  const wizardDraft: OrderDraft = {
    id: "", organizationId: "", consecutivo: 0,
    header: wizardHeader, lines: wizardLines,
    status: "borrador", origin: "agentik", syncState: "nunca_sincronizado",
    summary: computeOrderSummary(wizardLines, { type: wizardHeader.discountType, value: wizardHeader.discountValue }),
    createdBy: "usuario", createdAt: "", updatedAt: "",
    lastSyncAt: null, sagOrderId: null, sagError: null,
    externalSyncKey: "", sagInvoiceIds: [], sourceWarehouseCode: null,
    fulfillmentStatus: "sin_factura", fulfillmentPercent: 0,
    timeline: [],
    commercialJourneyId: "", versions: [], linkedDocuments: [],
  };
  const wizardValidation = validateOrder(wizardDraft);
  const wizardSignals    = buildOrderDavidSignals(wizardDraft);
  const wizardSummary    = wizardDraft.summary;

  return (
    <div>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Comercial", href: `/${orgSlug}/comercial/maletas` },
          { label: "Pedidos" },
        ]}
        title="Pedidos"
        subtitle="Captura, valida y gestiona pedidos comerciales."
        status={stats.conflicts > 0 ? "critical"
              : stats.pendingSag > 0 ? "warning"
              : "ok"}
        statusLabel={`${stats.today} pedidos · ${stats.fromSag} desde SAG${maxSagOrderDate ? ` · Ultimo: ${new Date(maxSagOrderDate).toISOString().slice(0, 10)}` : ""}`}
      />

      {/* ── SAG Sync Notice ──────────────────────────────────────────────── */}
      <div style={{
        padding: `${S[3]}px ${S[4]}px`,
        marginBottom: S[4],
        background: `${C.blueDark}08`,
        border: `1px solid ${C.blueDark}25`,
        borderRadius: R.sm,
        display: "flex",
        alignItems: "center",
        gap: S[3],
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: C.blueDark, display: "inline-block", flexShrink: 0,
        }} />
        <div>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs,
            fontWeight: T.wt.semibold, color: C.blueDark,
          }}>
            Pedidos importados desde SAG. Sincronizacion en validacion.
          </div>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginTop: 2,
          }}>
            Los datos reflejan el ultimo snapshot disponible. La sincronizacion automatica esta pendiente de activacion.
          </div>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[3],
        marginBottom: S[4],
      }}>
        <StatCard label="Total pedidos" value={stats.today} color={C.ink} />
        <StatCard label="Pendientes de envio" value={stats.pendingSag} color={stats.pendingSag > 0 ? C.amber : C.inkFaint} />
        <StatCard label="Confirmados" value={stats.synced} color={stats.synced > 0 ? C.green : C.inkFaint} />
        <StatCard label="Desde SAG" value={stats.fromSag} color={stats.fromSag > 0 ? C.blueDark : C.inkFaint} />
      </div>

      {/* Salud comercial */}
      {commercialHealth && (
        <div style={{
          ...panel, padding: S[3], marginBottom: S[3],
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
            Salud comercial
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: S[2] }}>
            <HealthStat label="Pedidos importados" value={commercialHealth.pedidosImportados} />
            <HealthStat label="Pedidos con lineas" value={commercialHealth.pedidosConLineas} />
            <HealthStat label="Lineas registradas" value={commercialHealth.lineasRegistradas} />
            <HealthStat label="Productos disponibles" value={commercialHealth.productosDisponibles} />
            <HealthStat label="Sin inventario" value={commercialHealth.productosSinInventario} alert={commercialHealth.productosSinInventario > 0} />
          </div>
          {stats.conflicts > 0 && (
            <div style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red, marginTop: S[2],
              padding: `${S[1]}px ${S[2]}px`, background: C.redLight, borderRadius: R.sm,
            }}>
              {stats.conflicts} {stats.conflicts === 1 ? "pedido requiere" : "pedidos requieren"} revision
            </div>
          )}
        </div>
      )}

      {/* Inteligencia de demanda (PEDIDOS-DEMANDA-PRODUCCION-01) */}
      {demandSummary && (
        <div style={{ ...panel, padding: S[3], marginBottom: S[3] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
            Inteligencia de demanda
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: S[2] }}>
            <HealthStat label="Refs con demanda" value={demandSummary.refsWithDemand ?? 0} />
            <HealthStat label="Sin stock" value={demandSummary.refsInStockout ?? 0} alert={(demandSummary.refsInStockout ?? 0) > 0} />
            <HealthStat label="Ruptura" value={demandSummary.refsRuptureImminent ?? 0} alert={(demandSummary.refsRuptureImminent ?? 0) > 0} />
            <HealthStat label="Vel. diaria" value={demandSummary.avgDailyVelocity ?? 0} />
            <HealthStat label="Stock total" value={demandSummary.totalStock ?? 0} />
          </div>
        </div>
      )}

      {/* Seller resolution note (PEDIDOS-VENDEDOR-RESOLUTION-01) */}
      {orders.length > 0 && (() => {
        const noSeller = orders.filter(o => !o.sellerName).length;
        if (noSeller === 0) return null;
        return (
          <div style={{
            ...panel, padding: `${S[2]}px ${S[3]}px`, marginBottom: S[3],
            background: C.amberLight, borderColor: C.amberBorder,
          }}>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.amber }}>
              Pedidos sin vendedor identificado: {noSeller}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, marginLeft: S[2] }}>
              SAG no incluye vendedor en todos los documentos PD
            </span>
          </div>
        );
      })()}

      {/* Feedback */}
      {feedbackMsg && (
        <div style={{
          ...panel, padding: `${S[2]}px ${S[4]}px`, marginBottom: S[3],
          background: C.blueLight, borderColor: C.blueBorder,
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.blueDark,
        }}>
          {feedbackMsg}
        </div>
      )}

      {/* Reservation alert */}
      {reservationAlert && (
        <div style={{
          ...panel, padding: `${S[3]}px ${S[4]}px`, marginBottom: S[3],
          background: reservationAlert.type === "success" ? "#f0fdf4"
            : reservationAlert.type === "conflict" ? "#fef3c7"
            : "#fef2f2",
          borderColor: reservationAlert.type === "success" ? "#86efac"
            : reservationAlert.type === "conflict" ? "#fbbf24"
            : "#fca5a5",
          fontFamily: T.mono, fontSize: T.sz.sm,
          color: reservationAlert.type === "success" ? "#166534"
            : reservationAlert.type === "conflict" ? "#92400e"
            : "#991b1b",
        }}>
          <div style={{ fontWeight: T.wt.semibold, marginBottom: reservationAlert.conflicts?.length ? S[2] : 0 }}>
            {reservationAlert.type === "conflict" ? "Disponibilidad insuficiente" : reservationAlert.message}
          </div>
          {reservationAlert.conflicts && reservationAlert.conflicts.length > 0 && (
            <div style={{ marginTop: S[1] }}>
              {reservationAlert.conflicts.map((c, i) => (
                <div key={i} style={{ display: "flex", gap: S[3], fontSize: T.sz.xs, padding: `${S[1]}px 0` }}>
                  <span style={{ fontWeight: T.wt.semibold }}>{c.reference}</span>
                  <span>Solicitado: {c.requested}</span>
                  <span>Disponible: {c.available}</span>
                  <span style={{ color: "#dc2626" }}>Faltante: {c.shortfall}</span>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => setReservationAlert(null)}
            style={{
              marginTop: S[2], fontFamily: T.mono, fontSize: T.sz.xs,
              background: "transparent", border: "none", cursor: "pointer",
              textDecoration: "underline", color: "inherit",
            }}
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Action bar */}
      <div style={{ display: "flex", gap: S[2], marginBottom: S[4], alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={openWizard} className="ag-action-primary" style={{
          fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
          color: C.white, background: C.blueDark, border: "none",
          borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
        }}>
          + Nuevo pedido
        </button>

        <div style={{ flex: 1 }} />
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: S[2], marginBottom: S[4], alignItems: "center", flexWrap: "wrap" }}>
        {/* Filters */}
        {(["todos", "hoy", "borradores", "pendientes", "sincronizados", "conflictos"] as ViewFilter[]).map(f => (
          <button
            key={f}
            onClick={() => applyFilter(f)}
            className="ag-action-secondary"
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
              padding: `${S[1]}px ${S[2]}px`, borderRadius: R.sm, cursor: "pointer",
              background: filter === f ? C.blueDark : C.surface,
              color:      filter === f ? C.white : C.inkMid,
              border:     `1px solid ${filter === f ? C.blueDark : C.line}`,
            }}
          >
            {{
              todos: "Todos", hoy: "Hoy", borradores: "Borradores",
              pendientes: "Pendientes", sincronizados: "Confirmados", conflictos: "Conflictos",
            }[f]}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {orders.length === 0 ? (
        <div style={{
          ...panel, padding: S[8], textAlign: "center",
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.semibold, color: C.inkMid, marginBottom: S[2] }}>
            {filter === "todos"
              ? "No hay pedidos registrados ni importados desde SAG"
              : "Sin pedidos en este filtro"}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, marginBottom: S[4] }}>
            {filter === "todos"
              ? "Los pedidos creados en Agentik y los importados desde SAG aparecen aqui."
              : "Cambia el filtro o crea un nuevo pedido."}
          </div>
          {filter === "todos" && (
            <button onClick={openWizard} className="ag-action-primary" style={{
              fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
              color: C.white, background: C.blueDark, border: "none",
              borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
            }}>
              + Nuevo pedido
            </button>
          )}
        </div>
      ) : (
        <OrdersTable orders={orders} onOpen={openOrderDetail} />
      )}

      {/* New Order Wizard — Wholesale matrix mode */}
      {wizardOpen && (
        <WholesaleOrderWizard
          orgSlug={orgSlug}
          header={wizardHeader}
          lines={wizardLines}
          onHeaderChange={setWizardHeader}
          onAddLine={addLineFromCandidate}
          onUpdateLineQty={updateWizardLineQty}
          onRemoveLine={removeWizardLine}
          onSaveDraft={saveDraft}
          onSubmit={submitDraft}
          onClose={() => { setWizardOpen(false); setEditingOrderId(null); }}
          isEditing={!!editingOrderId}
        />
      )}

      {/* Order detail drawer */}
      {detailDrawerOpen && selectedOrder && (
        <OrderDetailDrawer
          orgSlug={orgSlug}
          order={selectedOrder}
          branding={branding}
          onClose={() => { setDetailDrawerOpen(false); setSelectedOrder(null); }}
          onAction={handleOrderAction}
        />
      )}
    </div>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      ...panel, padding: S[4], textAlign: "center",
    }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: S[1] }}>
        {label}
      </div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xl"], fontWeight: T.wt.bold, color }}>
        {value > 0 ? value : "\u2014"}
      </div>
    </div>
  );
}

function HealthStat({ label, value, alert = false }: { label: string; value: number; alert?: boolean }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold,
        color: alert ? C.red : value > 0 ? C.ink : C.inkFaint,
      }}>
        {value > 0 ? value.toLocaleString() : "\u2014"}
      </div>
    </div>
  );
}

// ── Orders Table ────────────────────────────────────────────────────────────

function OrdersTable({ orders, onOpen }: { orders: OrderCard[]; onOpen: (id: string) => void }) {
  return (
    <div className="ag-op-table" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{
        ...panelHeader, fontSize: T.sz.xs, fontFamily: T.mono,
        fontWeight: T.wt.semibold, color: C.inkLight,
      }}>
        <span style={{ width: 60 }}>#</span>
        <span style={{ width: 60, textAlign: "center" }}>Origen</span>
        <span style={{ flex: 2 }}>Cliente</span>
        <span style={{ flex: 1 }}>Vendedor</span>
        <span style={{ width: 90, textAlign: "right" }}>Valor</span>
        <span style={{ width: 110, textAlign: "center" }}>Estado</span>
        <span style={{ width: 80, textAlign: "right" }}>Fecha</span>
        <span style={{ width: 60, textAlign: "center" }}>Accion</span>
      </div>

      {orders.map(o => {
        const sc = STATUS_COLOR[o.status];
        const isSagCor = o.origin === "sag_customer_order";
        const isCrm    = o.origin === "sag";
        const originBadge = isSagCor
          ? { label: "SAG",  bg: C.greenLight,  fg: C.green }
          : isCrm
          ? { label: "CRM",  bg: C.amberLight,  fg: C.amber }
          : { label: "AGK",  bg: C.blueLight,   fg: C.blueDark };
        const displayNum = o.consecutivo > 0 ? o.consecutivo : "\u2014";
        return (
          <div key={o.id} className="ag-op-row" style={{ ...dataRow, fontSize: T.sz.sm, fontFamily: T.mono }}>
            <span style={{ width: 60, color: C.inkFaint }}>{displayNum}</span>
            <span style={{ width: 60, textAlign: "center" }}>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                padding: "1px 5px", borderRadius: R.sm,
                background: originBadge.bg,
                color: originBadge.fg,
              }}>
                {originBadge.label}
              </span>
            </span>
            <div style={{ flex: 2 }}>
              <div style={{ fontWeight: T.wt.medium, color: C.ink }}>{o.customerName || "\u2014"}</div>
            </div>
            <span style={{ flex: 1, color: C.inkMid }}>{o.sellerName || "\u2014"}</span>
            <span style={{ width: 90, textAlign: "right", fontWeight: T.wt.semibold, color: C.ink }}>
              ${o.totalValue.toLocaleString()}
            </span>
            <span style={{ width: 110, textAlign: "center" }}>
              <span style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                padding: "2px 6px", borderRadius: R.pill, background: sc.bg, color: sc.text,
              }}>
                {STATUS_LABEL[o.status]}
              </span>
            </span>
            <span style={{ width: 80, textAlign: "right", color: C.inkFaint }}>
              {formatTimeAgo(o.createdAt)}
            </span>
            <span style={{ width: 60, textAlign: "center" }}>
              <button onClick={() => onOpen(o.id)} className="ag-action-secondary" style={{
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                color: C.blueDark, background: C.blueLight,
                border: `1px solid ${C.blueBorder}`, borderRadius: R.sm,
                padding: "2px 8px", cursor: "pointer",
              }}>
                Ver
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Order Wizard — UX-01: Sales-focused ─────────────────────────────────────

function OrderWizard({
  orgSlug, step, header, lines, summary, validation, signals,
  onStepChange, onHeaderChange, onAddLine, onUpdateLineQty, onRemoveLine,
  onSaveDraft, onSubmit, onClose,
}: {
  orgSlug:        string;
  step:           WizardStep;
  header:         OrderHeader;
  lines:          OrderLine[];
  summary:        ReturnType<typeof computeOrderSummary>;
  validation:     OrderValidationResult;
  signals:        OrderCopilotSignal[];
  onStepChange:   (s: WizardStep) => void;
  onHeaderChange: (h: OrderHeader) => void;
  onAddLine:      (c: OrderLineCandidate) => void;
  onUpdateLineQty:(id: string, qty: number) => void;
  onRemoveLine:   (id: string) => void;
  onSaveDraft:    () => void;
  onSubmit:       () => void;
  onClose:        () => void;
}) {
  // ── Discount state (Phase 6 — MOBILE-UX-02) ─────────────────────────────
  const [discountType, setDiscountType]     = useState<"porcentaje" | "valor_fijo">("porcentaje");
  const [discountValue, setDiscountValue]   = useState<number>(0);
  const [discountMotivo, setDiscountMotivo] = useState("");
  const [discountEnabled, setDiscountEnabled] = useState(false);

  // ── Customer search (Phase 1+2) ────────────────────────────────────────
  const [customerQuery, setCustomerQuery]     = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerProfile[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [manualEntry, setManualEntry]         = useState(false);
  const customerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Commercial intelligence (INTELIGENCIA-COMERCIAL-05) ──────────────
  const [customerMemory, setCustomerMemory]     = useState<CustomerCommercialMemory | null>(null);
  const [customerInsights, setCustomerInsights] = useState<DavidCommercialInsight[]>([]);
  const [memoryLoading, setMemoryLoading]       = useState(false);

  function handleCustomerSearch(q: string) {
    setCustomerQuery(q);
    if (customerTimer.current) clearTimeout(customerTimer.current);
    if (!q.trim()) { setCustomerResults([]); return; }
    customerTimer.current = setTimeout(async () => {
      setCustomerSearching(true);
      const data = await orderApi(orgSlug, { action: "search_customers", query: q });
      setCustomerResults(data.customers ?? []);
      setCustomerSearching(false);
    }, 250);
  }

  function selectCustomer(c: CustomerProfile) {
    onHeaderChange({
      ...header,
      customerCode: c.customerCode,
      customerName: c.customerName,
      customerId:   c.customerId,
      sellerName:   c.lastSellerName,
      channel:      c.lastChannel,
    });
    setCustomerQuery("");
    setCustomerResults([]);
    // Load commercial intelligence in background
    loadCommercialIntelligence(c.customerCode);
  }

  async function loadCommercialIntelligence(customerCode: string) {
    setMemoryLoading(true);
    setCustomerMemory(null);
    setCustomerInsights([]);
    try {
      const data = await historyApi(orgSlug, { action: "commercial_intelligence", customerCode });
      if (data.memory) setCustomerMemory(data.memory);
      if (data.insights) setCustomerInsights(data.insights);
    } catch { /* fail silently — intelligence is enrichment, not blocking */ }
    setMemoryLoading(false);
  }

  // ── POS product search (Phase 3) + Inventory filter (INVENTARIO-01) ──
  const [searchQuery, setSearchQuery]       = useState("");
  const [searchResults, setSearchResults]   = useState<OrderProductSearchResult[]>([]);
  const [searching, setSearching]           = useState(false);
  const [onlyAvailable, setOnlyAvailable]   = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<OrderProductSearchResult | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<OrderProductVariant | null>(null);
  const [selectedColor, setSelectedColor]   = useState<string | null>(null); // VARIANTES-02: Color→Talla flow
  const [addQty, setAddQty]                 = useState(1);
  const [quickAddFeedback, setQuickAddFeedback] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  function handleSearchInput(q: string) {
    setSearchQuery(q);
    setSelectedProduct(null);
    setSelectedVariant(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const data = await productApi(orgSlug, { action: "search", query: q });
      setSearchResults(data.products ?? []);
      setSearching(false);
    }, 300);
  }

  function selectProduct(p: OrderProductSearchResult) {
    setSelectedProduct(p);
    setSelectedVariant(null);
    setSelectedColor(null);
    setAddQty(1);
  }

  function selectVariant(v: OrderProductVariant) {
    setSelectedVariant(v);
    setAddQty(1);
  }

  function showQuickFeedback(msg: string) {
    setQuickAddFeedback(msg);
    setTimeout(() => setQuickAddFeedback(null), 2000);
  }

  function resetSearchAndFocus() {
    setSearchQuery("");
    setSearchResults([]);
    setSelectedProduct(null);
    setSelectedVariant(null);
    setSelectedColor(null);
    setAddQty(1);
    setTimeout(() => searchInputRef.current?.focus(), 50);
  }

  function handleAddToOrder() {
    if (!selectedProduct || !selectedVariant) return;
    onAddLine({
      referenceCode:  selectedProduct.referenceCode,
      productName:    selectedProduct.productName,
      size:           selectedVariant.size,
      color:          selectedVariant.color,
      quantity:       Math.max(1, addQty),
      availableUnits: selectedVariant.availability.availableUnits,
      unitPrice:      selectedProduct.unitPrice,
      thumbnailUrl:   selectedProduct.thumbnailUrl,
    });
    const sz = selectedVariant.size;
    const cl = selectedVariant.color;
    const detail = [cl, sz].filter(Boolean).join(" / ");
    showQuickFeedback(`Agregado: ${detail || selectedProduct.productName} x${addQty}`);
    // VARIANTES-02 Phase 6: keep product open, reset variant+qty for next selection
    setSelectedVariant(null);
    setAddQty(1);
    // Keep selectedColor so seller can pick next talla of same color
  }

  function handleQuickAdd(p: OrderProductSearchResult) {
    const v = p.variants[0];
    if (!v) return;
    onAddLine({
      referenceCode:  p.referenceCode,
      productName:    p.productName,
      size:           v.size,
      color:          v.color,
      quantity:       1,
      availableUnits: v.availability.availableUnits,
      unitPrice:      p.unitPrice,
      thumbnailUrl:   p.thumbnailUrl,
    });
    showQuickFeedback(`Agregado al pedido: ${p.productName}`);
    resetSearchAndFocus();
  }

  // ── Reorder one-tap (INTELIGENCIA-COMERCIAL-05) ─────────────────────
  async function handleReorderTap(ref: string) {
    setSearchQuery("");
    setSearchResults([]);
    setSelectedProduct(null);
    setSelectedVariant(null);
    setSelectedColor(null);
    setAddQty(1);

    const data = await productApi(orgSlug, { action: "search", query: ref });
    const products: OrderProductSearchResult[] = data.products ?? [];
    const match = products.find(
      p => p.referenceCode.toUpperCase() === ref.toUpperCase(),
    ) ?? products[0];

    if (!match) {
      showQuickFeedback(`No se encontro "${ref}" en inventario.`);
      return;
    }

    const hasVariants = match.variants.length > 1
      || (match.variants.length === 1 && (match.variants[0].size || match.variants[0].color));

    if (!hasVariants && match.variants.length >= 1) {
      // Single variant — quick add
      handleQuickAdd(match);
    } else {
      // Multiple variants — open selector
      setSelectedProduct(match);
      showQuickFeedback("Elige talla/color para agregar.");
    }
  }

  // ── Auto-save draft (Phase 8) ────────────────────────────────────────
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSaved, setAutoSaved] = useState(false);

  useEffect(() => {
    const activeLines = lines.filter(l => !l.removed);
    if (!header.customerName && activeLines.length === 0) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      setAutoSaved(true);
      setTimeout(() => setAutoSaved(false), 2000);
    }, 3000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [header, lines]);

  // ── David inventory signals (INVENTARIO-01 Phase 9) ─────────────────
  const selectorDavidSignals: string[] = [];
  if (selectedVariant) {
    const avail = selectedVariant.availability.availableUnits;
    const invStatus = selectedVariant.inventoryStatus;
    if (invStatus === "no_variants") {
      selectorDavidSignals.push("Disponibilidad no confirmada para esta referencia. Consulta con bodega.");
    } else if (avail === null || invStatus === "unsynced") {
      selectorDavidSignals.push("Disponibilidad pendiente de validacion.");
    } else if (avail <= 0) {
      selectorDavidSignals.push("Producto agotado. El pedido quedara pendiente de reposicion.");
    } else if (addQty > avail) {
      selectorDavidSignals.push(`Cantidad solicitada (${addQty}) supera disponibilidad (${avail} uds). Se enviaran ${avail} y el resto quedara pendiente.`);
    } else if (invStatus === "low") {
      selectorDavidSignals.push(`Ultimas unidades (${avail} uds). Confirma con bodega.`);
    }
  }


  // ── Discount calculations ─────────────────────────────────────────────
  const subtotal = summary.totalValue;
  const discountAmount = !discountEnabled || discountValue <= 0 ? 0
    : discountType === "porcentaje"
      ? Math.round(subtotal * Math.min(discountValue, 100) / 100)
      : Math.min(discountValue, subtotal);
  const totalFinal = Math.max(0, subtotal - discountAmount);
  const discountValid = !discountEnabled
    || (discountValue > 0
        && (discountType !== "porcentaje" || discountValue <= 100)
        && discountAmount <= subtotal);

  const steps: { key: WizardStep; label: string; icon: string }[] = [
    { key: "cliente",   label: "Cliente", icon: "1" },
    { key: "productos", label: "Productos", icon: "2" },
    { key: "resumen",   label: "Resumen",   icon: "3" },
  ];

  const inputStyle = {
    fontFamily: T.mono, fontSize: T.sz.sm, width: "100%",
    padding: `${S[3]}px ${S[3]}px`, border: `1px solid ${C.line}`, borderRadius: R.sm,
    outline: "none", minHeight: 44,
  };

  const labelStyle = {
    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
    display: "block" as const, marginBottom: 2,
  };

  const activeLines = lines.filter(l => !l.removed);

  // VARIANTES-02: Color→Talla flow — color is primary axis
  const productColors = selectedProduct
    ? [...new Set(selectedProduct.variants.map(v => v.color).filter(Boolean))].sort()
    : [];
  // Tallas filtered by selected color (or all if no color selected)
  const productSizes = selectedProduct
    ? [...new Set(
        selectedProduct.variants
          .filter(v => !selectedColor || v.color === selectedColor)
          .map(v => v.size)
          .filter(Boolean),
      )].sort()
    : [];
  // Detect if product has colors at all (some products are size-only)
  const hasColors = productColors.length > 0;
  const hasSizes  = selectedProduct ? selectedProduct.variants.some(v => v.size) : false;
  // Product without variants = single unit, no selector needed
  const isSimpleProduct = selectedProduct
    ? selectedProduct.variants.length <= 1 && !selectedProduct.variants[0]?.size && !selectedProduct.variants[0]?.color
    : false;
  // Already-added variants for this product (VARIANTES-02 Phase 7)
  const alreadyAddedLines = selectedProduct
    ? lines.filter(l => !l.removed && l.referenceCode === selectedProduct.referenceCode)
    : [];

  // Order-level David inventory signals
  const orderInventorySignals: string[] = [];
  if (activeLines.length > 0) {
    const linesOverStock = activeLines.filter(l => l.availableUnits !== null && l.quantity > l.availableUnits);
    const linesNoStock = activeLines.filter(l => l.availableUnits !== null && l.availableUnits <= 0);
    if (linesNoStock.length > 0) {
      orderInventorySignals.push(`${linesNoStock.length} ${linesNoStock.length === 1 ? "producto agotado" : "productos agotados"}. Se generara pedido pendiente.`);
    }
    if (linesOverStock.length > 0) {
      orderInventorySignals.push(`${linesOverStock.length} ${linesOverStock.length === 1 ? "linea excede" : "lineas exceden"} la disponibilidad actual.`);
    }
  }

  // Step completeness
  const clienteReady   = Boolean(header.customerName && header.customerCode);
  const productosReady = activeLines.length > 0;

  return (
    <div className="ag-order-wizard-overlay">
    <div className="ag-order-wizard-panel">
      {/* Header */}
      <div style={{ padding: `${S[3]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`, background: C.surfaceAlt }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
              Nuevo pedido
            </div>
            {header.customerName && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
                {header.customerName} {header.customerCode ? `(${header.customerCode})` : ""}
                {activeLines.length > 0 && ` · ${activeLines.length} lineas · $${summary.totalValue.toLocaleString()}`}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            {autoSaved && (
              <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.green }}>
                Borrador guardado
              </span>
            )}
            <button onClick={onClose} style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: T.mono, fontSize: T.sz.lg, color: C.inkLight, padding: S[1],
            }}>x</button>
          </div>
        </div>

        {/* Step progress bar */}
        <div style={{ display: "flex", gap: 0, marginTop: S[3] }}>
          {steps.map((s, i) => {
            const isActive    = step === s.key;
            const isComplete  = (s.key === "cliente" && clienteReady && step !== "cliente")
                             || (s.key === "productos" && productosReady && step === "resumen");
            return (
              <button key={s.key} onClick={() => onStepChange(s.key)} style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: S[1],
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                padding: `${S[2]}px 0`, cursor: "pointer",
                background: isActive ? C.blueDark : isComplete ? C.greenLight : C.surface,
                color:      isActive ? C.white : isComplete ? C.green : C.inkMid,
                border:     "none",
                borderRight: i < steps.length - 1 ? `1px solid ${C.line}` : "none",
                borderRadius: i === 0 ? `${R.sm} 0 0 ${R.sm}` : i === steps.length - 1 ? `0 ${R.sm} ${R.sm} 0` : "0",
              }}>
                <span style={{
                  width: 20, height: 20, borderRadius: R.pill,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
                  background: isActive ? "rgba(255,255,255,0.2)" : isComplete ? C.green : C.line,
                  color: isActive ? C.white : isComplete ? C.white : C.inkFaint,
                }}>
                  {isComplete ? "\u2713" : s.icon}
                </span>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: S[4] }}>

        {/* ── STEP 1: Cliente — Search-first ───────────────────────────────── */}
        {step === "cliente" && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>

            {/* Already selected — show card with commercial intelligence */}
            {header.customerName && !manualEntry ? (
              <div style={{
                ...panel, padding: S[4], borderLeft: `3px solid ${C.green}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink }}>
                      {header.customerName}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, marginTop: 2 }}>
                      {header.customerCode} {header.customerId ? `· ${header.customerId}` : ""}
                    </div>
                    {header.sellerName && (
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 2 }}>
                        Vendedor: {header.sellerName}{header.channel ? ` · ${header.channel}` : ""}
                      </div>
                    )}
                  </div>
                  <button onClick={() => {
                    onHeaderChange({
                      customerId: "", customerName: "", customerCode: "",
                      sellerId: "", sellerName: "", channel: "", notes: "",
                    });
                    setManualEntry(false);
                    setCustomerMemory(null);
                    setCustomerInsights([]);
                  }} style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
                    background: "transparent", border: `1px solid ${C.line}`,
                    borderRadius: R.sm, padding: "3px 10px", cursor: "pointer",
                  }}>
                    Cambiar
                  </button>
                </div>

                {/* Commercial intelligence strip (INTELIGENCIA-COMERCIAL-05) */}
                {memoryLoading && (
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                    marginTop: S[2], padding: `${S[1]}px 0`,
                  }}>
                    Cargando perfil comercial...
                  </div>
                )}
                {customerMemory && customerMemory.totalOrders > 0 && (
                  <div style={{ marginTop: S[3] }}>
                    <div style={{
                      display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: S[2],
                      marginBottom: S[2],
                    }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Pedidos</div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink }}>
                          {customerMemory.totalOrders}
                        </div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Ticket prom.</div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink }}>
                          ${customerMemory.avgTicketValue.toLocaleString()}
                        </div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Frecuencia</div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink }}>
                          {customerMemory.daysBetweenOrders !== null ? `${customerMemory.daysBetweenOrders}d` : "\u2014"}
                        </div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Ult. pedido</div>
                        <div style={{
                          fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold,
                          color: customerMemory.daysSinceLastOrder !== null && customerMemory.daysSinceLastOrder > 60 ? C.amber : C.ink,
                        }}>
                          {customerMemory.daysSinceLastOrder !== null ? `${customerMemory.daysSinceLastOrder}d` : "\u2014"}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: S[2],
                    }}>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Valor de vida</div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.green }}>
                          ${customerMemory.totalLifetimeValue.toLocaleString()}
                        </div>
                      </div>
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Cumplimiento</div>
                        <div style={{
                          fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                          color: customerMemory.fulfillmentPercent >= 80 ? C.green
                               : customerMemory.fulfillmentPercent > 0 ? C.amber : C.inkFaint,
                        }}>
                          {customerMemory.fulfillmentPercent > 0 ? `${customerMemory.fulfillmentPercent}%` : "\u2014"}
                        </div>
                      </div>
                    </div>
                    {/* Top references chips */}
                    {customerMemory.topReferences.length > 0 && (
                      <div style={{ marginTop: S[2] }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 3 }}>
                          Compra frecuente
                        </div>
                        <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
                          {customerMemory.topReferences.slice(0, 6).map(r => (
                            <span key={r.value} style={{
                              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                              padding: "2px 6px", borderRadius: R.sm,
                              background: C.blueLight, color: C.blueDark, border: `1px solid ${C.blueBorder}`,
                            }}>
                              {r.value} ({r.count}x)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* David insights from commercial intelligence */}
                    {customerInsights.length > 0 && (
                      <div style={{ marginTop: S[2] }}>
                        {customerInsights.slice(0, 2).map((ins, i) => (
                          <DavidChip key={i} message={ins.message} variant={
                            ins.type === "customer_dormant" ? "warning"
                            : ins.type === "value_opportunity" ? "success"
                            : "default"
                          } />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Editable fields for selected customer */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2], marginTop: S[3] }}>
                  <div>
                    <label style={labelStyle}>Vendedor</label>
                    <input type="text" value={header.sellerName}
                      onChange={e => onHeaderChange({ ...header, sellerName: e.target.value })}
                      placeholder="Nombre del vendedor" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Canal</label>
                    <input type="text" value={header.channel}
                      onChange={e => onHeaderChange({ ...header, channel: e.target.value })}
                      placeholder="Ej: Mayorista" style={inputStyle} />
                  </div>
                </div>
                <div style={{ marginTop: S[2] }}>
                  <label style={labelStyle}>Observaciones</label>
                  <textarea value={header.notes}
                    onChange={e => onHeaderChange({ ...header, notes: e.target.value })}
                    placeholder="Notas adicionales"
                    rows={2}
                    style={{ ...inputStyle, resize: "vertical" }} />
                </div>
              </div>
            ) : !manualEntry ? (
              /* Search panel */
              <>
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold,
                  color: C.ink, textAlign: "center", marginBottom: S[1],
                }}>
                  Elegir cliente
                </div>
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
                  textAlign: "center", marginBottom: S[3],
                }}>
                  Busca por nombre, codigo SAG, NIT o telefono
                </div>

                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    value={customerQuery}
                    onChange={e => handleCustomerSearch(e.target.value)}
                    placeholder="Ej: Almacenes El Sol, CLI-001, 900123..."
                    autoFocus
                    style={{
                      ...inputStyle,
                      fontSize: T.sz.base,
                      padding: `${S[3]}px ${S[4]}px`,
                      borderColor: C.blueDark,
                      borderWidth: 2,
                    }}
                  />
                  {customerSearching && (
                    <span style={{
                      position: "absolute", right: S[3], top: "50%", transform: "translateY(-50%)",
                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                    }}>
                      Buscando...
                    </span>
                  )}
                </div>

                {/* Search results — customer cards */}
                {customerResults.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: S[2], marginTop: S[2] }}>
                    {customerResults.map(c => (
                      <button
                        key={c.customerCode}
                        onClick={() => selectCustomer(c)}
                        style={{
                          ...panel, padding: S[3], textAlign: "left",
                          cursor: "pointer", border: `1px solid ${C.line}`, width: "100%",
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          background: C.white,
                        }}
                      >
                        <div>
                          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                            {c.customerName}
                          </div>
                          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: 1 }}>
                            {c.customerCode} {c.customerId ? `· ${c.customerId}` : ""}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                            {c.totalOrders} {c.totalOrders === 1 ? "pedido" : "pedidos"}
                          </div>
                          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                            ${c.totalValue.toLocaleString()}
                          </div>
                          {c.lastOrderDate && (
                            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                              Ult: {formatTimeAgo(c.lastOrderDate)}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {customerQuery.trim() && !customerSearching && customerResults.length === 0 && (
                  <div style={{
                    ...panel, padding: S[3], marginTop: S[2],
                    textAlign: "center", borderLeft: `3px solid ${C.amber}`,
                  }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, marginBottom: S[1] }}>
                      No se encontro &quot;{customerQuery}&quot; en los clientes registrados
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                      Busca por nombre, NIT o codigo. Los clientes se cargan desde CustomerProfile (SAG/CRM).
                    </div>
                  </div>
                )}

                {/* Manual entry fallback */}
                <button onClick={() => setManualEntry(true)} style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark,
                  background: "transparent", border: `1px solid ${C.blueBorder}`,
                  borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
                  marginTop: S[2],
                  textAlign: "center", width: "100%",
                }}>
                  + Crear cliente nuevo
                </button>
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                  textAlign: "center", marginTop: 4,
                }}>
                  Se sincronizara con SAG.
                </div>
              </>
            ) : (
              /* Manual entry form */
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[2] }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                    Nuevo cliente
                  </div>
                  <button onClick={() => setManualEntry(false)} style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.blueDark,
                    background: "transparent", border: "none", cursor: "pointer",
                  }}>
                    Volver a buscar
                  </button>
                </div>

                <div>
                  <label style={labelStyle}>Nombre del cliente *</label>
                  <input type="text" value={header.customerName}
                    onChange={e => onHeaderChange({ ...header, customerName: e.target.value })}
                    placeholder="Ej: Almacenes El Sol" autoFocus style={inputStyle} />
                </div>
                <div style={{ marginTop: S[2] }}>
                  <label style={labelStyle}>Codigo SAG *</label>
                  <input type="text" value={header.customerCode}
                    onChange={e => onHeaderChange({ ...header, customerCode: e.target.value })}
                    placeholder="Ej: CLI-001" style={inputStyle} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2], marginTop: S[2] }}>
                  <div>
                    <label style={labelStyle}>NIT / ID</label>
                    <input type="text" value={header.customerId}
                      onChange={e => onHeaderChange({ ...header, customerId: e.target.value })}
                      placeholder="Ej: 900.123.456-7" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Vendedor *</label>
                    <input type="text" value={header.sellerName}
                      onChange={e => onHeaderChange({ ...header, sellerName: e.target.value })}
                      placeholder="Ej: Carlos Ramirez" style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2], marginTop: S[2] }}>
                  <div>
                    <label style={labelStyle}>Canal</label>
                    <input type="text" value={header.channel}
                      onChange={e => onHeaderChange({ ...header, channel: e.target.value })}
                      placeholder="Ej: Mayorista" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Observaciones</label>
                    <input type="text" value={header.notes}
                      onChange={e => onHeaderChange({ ...header, notes: e.target.value })}
                      placeholder="Notas" style={inputStyle} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STEP 2: Productos — Mobile POS builder (PRODUCTOS-MOBILE-03) ─ */}
        {step === "productos" && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[3], paddingBottom: 72 }}>

            {/* Quick-add feedback toast */}
            {quickAddFeedback && (
              <div style={{
                padding: `${S[2]}px ${S[3]}px`, background: C.greenLight,
                borderRadius: R.sm, border: `1px solid ${C.greenBorder}`,
                fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.green,
              }}>
                {quickAddFeedback}
              </div>
            )}

            {/* Reorder suggestions — "El cliente suele comprar" (INTELIGENCIA-COMERCIAL-05) */}
            {customerMemory && customerMemory.reorderCandidates.length > 0 && !searchQuery.trim() && !selectedProduct && (
              <div style={{ ...panel, padding: S[3], borderLeft: `3px solid ${C.blueDark}` }}>
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                  color: C.blueDark, marginBottom: S[2],
                }}>
                  El cliente suele comprar
                </div>
                <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
                  {customerMemory.reorderCandidates.slice(0, 8).map(ref => (
                    <button
                      key={ref}
                      onClick={() => handleReorderTap(ref)}
                      style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                        padding: `${S[1]}px ${S[2]}px`, minHeight: 36,
                        borderRadius: R.sm, cursor: "pointer",
                        background: C.blueLight, color: C.blueDark,
                        border: `1px solid ${C.blueBorder}`,
                      }}
                    >
                      {ref}
                    </button>
                  ))}
                </div>
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: S[1],
                }}>
                  1 toque = agregar. Variantes = elige talla/color.
                </div>
              </div>
            )}

            {/* David cross-sell signals (INTELIGENCIA-COMERCIAL-05) */}
            {customerInsights.length > 0 && !searchQuery.trim() && !selectedProduct && activeLines.length > 0 && (
              <div>
                {customerInsights
                  .filter(ins => ins.type === "customer_reorder" || ins.type === "customer_preference")
                  .slice(0, 2)
                  .map((ins, i) => (
                    <DavidChip key={i} message={ins.message} />
                  ))}
              </div>
            )}

            {/* Inventory summary bar (INVENTARIO-01 Phase 7) */}
            {activeLines.length > 0 && (() => {
              const invRefs = new Set(activeLines.map(l => l.referenceCode));
              const invVariants = new Set(activeLines.map(l => `${l.referenceCode}|${l.size}|${l.color}`));
              const invUnits = activeLines.reduce((s, l) => s + l.quantity, 0);
              const linesOver = activeLines.filter(l => l.availableUnits !== null && l.quantity > l.availableUnits).length;
              const linesOut = activeLines.filter(l => l.availableUnits !== null && l.availableUnits <= 0).length;
              return (
                <div style={{
                  display: "flex", gap: S[3], alignItems: "center", justifyContent: "space-between",
                  padding: `${S[2]}px ${S[3]}px`, background: C.surface, borderRadius: R.sm,
                  border: `1px solid ${C.line}`,
                }}>
                  <div style={{ display: "flex", gap: S[4] }}>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Refs</div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>{invRefs.size}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Variantes</div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>{invVariants.size}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Uds</div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>{invUnits}</div>
                    </div>
                  </div>
                  {(linesOver > 0 || linesOut > 0) && (
                    <div style={{ display: "flex", gap: S[1] }}>
                      {linesOver > 0 && (
                        <span style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                          padding: "2px 6px", borderRadius: R.sm,
                          background: C.amberLight, color: C.amber,
                        }}>
                          {linesOver} exceden
                        </span>
                      )}
                      {linesOut > 0 && (
                        <span style={{
                          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                          padding: "2px 6px", borderRadius: R.sm,
                          background: C.redLight, color: C.red,
                        }}>
                          {linesOut} sin stock
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Search bar + availability toggle (INVENTARIO-01 Phase 8) */}
            <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={e => handleSearchInput(e.target.value)}
                  placeholder="Buscar por referencia o nombre..."
                  autoFocus
                  style={{
                    ...inputStyle,
                    fontSize: T.sz.base,
                    padding: `${S[3]}px ${S[3]}px`,
                    borderColor: C.blueDark,
                    borderWidth: 2,
                    minHeight: 48,
                  }}
                />
                {searching && (
                  <span style={{
                    position: "absolute", right: S[3], top: "50%", transform: "translateY(-50%)",
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                  }}>
                    Buscando...
                  </span>
                )}
              </div>
              <button
                onClick={() => setOnlyAvailable(!onlyAvailable)}
                title={onlyAvailable ? "Mostrando solo disponibles" : "Mostrando todos"}
                style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                  padding: `${S[2]}px ${S[2]}px`, minHeight: 48, minWidth: 48,
                  borderRadius: R.sm, cursor: "pointer",
                  background: onlyAvailable ? C.greenLight : C.surface,
                  color: onlyAvailable ? C.green : C.inkFaint,
                  border: `1px solid ${onlyAvailable ? C.greenBorder : C.line}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: T.sz.sm }}>{onlyAvailable ? "\u2713" : "\u25cb"}</span>
                <span>Disp.</span>
              </button>
            </div>

            {/* No results after search */}
            {searchQuery.trim().length > 2 && !searching && searchResults.length === 0 && !selectedProduct && (
              <div style={{
                ...panel, padding: S[6], textAlign: "center",
                borderLeft: `3px solid ${C.amber}`,
              }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.inkMid, marginBottom: S[1] }}>
                  No se encontraron productos para &quot;{searchQuery}&quot;
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                  Verifica la referencia o nombre. Si el producto es nuevo, puede que aun no este en el catalogo.
                </div>
              </div>
            )}

            {/* Initial empty state — no search yet */}
            {!searchQuery.trim() && !selectedProduct && activeLines.length === 0 && !(customerMemory && customerMemory.reorderCandidates.length > 0) && (
              <div style={{
                ...panel, padding: S[6], textAlign: "center",
              }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.inkMid, marginBottom: S[1] }}>
                  Busca productos por referencia o nombre
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
                  Escribe una referencia (ej: CJ-1026) o nombre de producto para buscar en el catalogo.
                </div>
              </div>
            )}

            {/* Product cards — touchable, with real inventory (INVENTARIO-01 Phase 3) */}
            {searchResults.length > 0 && !selectedProduct && (
              <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                {searchResults
                  .filter(p => !onlyAvailable || (p.inventoryStatus !== "out"))
                  .map(p => {
                  const hasVariants = p.variants.length > 1 || (p.variants.length === 1 && (p.variants[0].size || p.variants[0].color));
                  const inv = INVENTORY_COLORS[p.inventoryStatus];
                  const availLabel = p.inventoryStatus === "unsynced" ? inv.label
                    : p.availableQty !== null && p.availableQty > 0
                      ? `${p.availableQty} disp.`
                      : inv.label;

                  return (
                    <button
                      key={p.referenceCode}
                      onClick={() => hasVariants ? selectProduct(p) : handleQuickAdd(p)}
                      style={{
                        ...panel, padding: S[3], textAlign: "left", width: "100%",
                        cursor: p.inventoryStatus === "out" ? "default" : "pointer",
                        display: "flex", gap: S[3], alignItems: "center",
                        background: C.white, border: `1px solid ${C.line}`, minHeight: 72,
                        opacity: p.inventoryStatus === "out" ? 0.55 : 1,
                      }}
                    >
                      <ProductThumb url={p.thumbnailUrl} code={p.referenceCode} size={52} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                          {p.productName}
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                          {p.referenceCode}
                        </div>
                        <div style={{ display: "flex", gap: S[1], alignItems: "center", marginTop: 3 }}>
                          <span style={{
                            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                            padding: "2px 6px", borderRadius: R.sm,
                            background: inv.bg, color: inv.fg,
                          }}>
                            {availLabel}
                          </span>
                          <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                            {p.variantCount > 0 ? `${p.variantCount} variantes` : hasVariants ? `${p.variants.length} variantes` : "1 toque"}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        {p.unitPrice > 0 && (
                          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                            ${p.unitPrice.toLocaleString()}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {searchQuery.trim() && !searching && searchResults.length === 0 && (
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
                textAlign: "center", padding: S[4],
              }}>
                Sin resultados para &quot;{searchQuery}&quot;
              </div>
            )}

            {/* Selected product — mobile-first variant selector */}
            {selectedProduct && (
              <div style={{ ...panel, padding: S[3], borderLeft: `3px solid ${C.blueDark}` }}>
                <div style={{ display: "flex", gap: S[3], alignItems: "flex-start", marginBottom: S[3] }}>
                  <ProductThumb url={selectedProduct.thumbnailUrl} code={selectedProduct.referenceCode} size={60} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink }}>
                      {selectedProduct.productName}
                    </div>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                      {selectedProduct.referenceCode}
                    </div>
                    {selectedProduct.unitPrice > 0 && (
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, marginTop: 2 }}>
                        ${selectedProduct.unitPrice.toLocaleString()} / ud
                      </div>
                    )}
                  </div>
                  <button onClick={() => { setSelectedProduct(null); setSelectedColor(null); searchInputRef.current?.focus(); }} style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
                    background: "transparent", border: `1px solid ${C.line}`,
                    borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer", minHeight: 36,
                  }}>
                    Cambiar
                  </button>
                </div>

                {/* VARIANTES-02: Simple product — one-tap add (Phase 8) */}
                {isSimpleProduct && (
                  <div style={{ marginTop: S[2] }}>
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint,
                      padding: `${S[1]}px 0`, marginBottom: S[2],
                    }}>
                      Producto sin variantes
                    </div>
                    <div style={{ display: "flex", gap: S[2], alignItems: "center" }}>
                      <QuantityControls qty={addQty} onChange={setAddQty} />
                      <button onClick={() => {
                        const v = selectedProduct.variants[0];
                        if (v) {
                          onAddLine({
                            referenceCode: selectedProduct.referenceCode,
                            productName:   selectedProduct.productName,
                            size: v.size, color: v.color,
                            quantity: Math.max(1, addQty),
                            availableUnits: v.availability.availableUnits,
                            unitPrice: selectedProduct.unitPrice,
                            thumbnailUrl: selectedProduct.thumbnailUrl,
                          });
                          showQuickFeedback(`Agregado: ${selectedProduct.productName} x${addQty}`);
                          setAddQty(1);
                        }
                      }} className="ag-action-primary" style={{
                        flex: 1, fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                        color: C.white, background: C.blueDark, border: "none",
                        borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
                        minHeight: 44,
                      }}>
                        Agregar al pedido
                      </button>
                    </div>
                  </div>
                )}

                {/* VARIANTES-02: Color→Talla variant selector (Phase 2) */}
                {!isSimpleProduct && (
                  <>
                    {/* Step 1: Color chips (primary axis) */}
                    {hasColors && (
                      <div style={{ marginBottom: S[3] }}>
                        <div style={labelStyle}>Color</div>
                        <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
                          {productColors.map(cl => {
                            const isSelected = selectedColor === cl;
                            const colorVariants = selectedProduct.variants.filter(vr => vr.color === cl);
                            const colorAvail = colorVariants.reduce((s, vr) => {
                              const a = vr.availability.availableUnits;
                              return a !== null ? s + a : s;
                            }, 0);
                            const colorUnsynced = colorVariants.some(vr => vr.availability.availableUnits === null);
                            const colorOut = !colorUnsynced && colorAvail <= 0;
                            const invColor = colorUnsynced ? C.inkFaint : colorAvail >= 20 ? C.green : colorAvail >= 5 ? C.amber : colorAvail > 0 ? C.red : C.red;
                            return (
                              <button key={cl} onClick={() => {
                                setSelectedColor(cl);
                                setSelectedVariant(null);
                                setAddQty(1);
                                // If no sizes, auto-select the only variant for this color
                                if (!hasSizes) {
                                  const v = selectedProduct.variants.find(vr => vr.color === cl);
                                  if (v) selectVariant(v);
                                }
                              }} style={{
                                fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                                padding: `${S[2]}px ${S[3]}px`, minWidth: 56, minHeight: 48,
                                textAlign: "center",
                                borderRadius: R.sm, cursor: colorOut ? "default" : "pointer",
                                background: isSelected ? C.blueDark : C.surface,
                                color:      isSelected ? C.white : colorOut ? C.inkFaint : C.ink,
                                border:     `1px solid ${isSelected ? C.blueDark : C.line}`,
                                opacity:    colorOut ? 0.5 : 1,
                                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                gap: 2,
                              }}>
                                <span>{cl}</span>
                                <span style={{
                                  fontSize: T.sz["2xs"], fontWeight: T.wt.medium,
                                  color: isSelected ? "rgba(255,255,255,0.7)" : invColor,
                                }}>
                                  {colorUnsynced ? "\u2014" : `${colorAvail} uds`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Step 2: Talla chips (filtered by selected color) */}
                    {(hasColors ? selectedColor : true) && productSizes.length > 0 && (
                      <div style={{ marginBottom: S[3] }}>
                        <div style={labelStyle}>Talla</div>
                        <div style={{ display: "flex", gap: S[2], flexWrap: "wrap" }}>
                          {productSizes.map(sz => {
                            const isSelected = selectedVariant?.size === sz;
                            // Find the exact variant for this color+size combination
                            const v = selectedColor
                              ? selectedProduct.variants.find(vr => vr.color === selectedColor && vr.size === sz)
                              : selectedProduct.variants.find(vr => vr.size === sz);
                            const szAvail = v?.availability.availableUnits ?? null;
                            const szUnsynced = szAvail === null;
                            const szOut = !szUnsynced && szAvail <= 0;
                            const invColor = szUnsynced ? C.inkFaint : szAvail >= 20 ? C.green : szAvail >= 5 ? C.amber : szAvail > 0 ? C.red : C.red;
                            return (
                              <button key={sz} onClick={() => {
                                if (v) selectVariant(v);
                              }} style={{
                                fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                                padding: `${S[2]}px ${S[3]}px`, minWidth: 48, minHeight: 48,
                                textAlign: "center",
                                borderRadius: R.sm, cursor: szOut ? "default" : "pointer",
                                background: isSelected ? C.blueDark : C.surface,
                                color:      isSelected ? C.white : szOut ? C.inkFaint : C.ink,
                                border:     `1px solid ${isSelected ? C.blueDark : C.line}`,
                                opacity:    szOut ? 0.5 : 1,
                                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                                gap: 2,
                              }}>
                                <span>{sz}</span>
                                <span style={{
                                  fontSize: T.sz["2xs"], fontWeight: T.wt.medium,
                                  color: isSelected ? "rgba(255,255,255,0.7)" : invColor,
                                }}>
                                  {szUnsynced ? "\u2014" : `${szAvail}`}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* No colors, no sizes — only unstructured variants */}
                    {!hasColors && productSizes.length === 0 && selectedProduct.variants.length > 0 && (
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[2] }}>
                        Selecciona una variante para agregar.
                      </div>
                    )}

                    {/* Step 3: Availability + Quantity + Add (Phase 5) */}
                    {selectedVariant && (
                      <div style={{ marginTop: S[2] }}>
                        <AvailabilityBadge avail={selectedVariant.availability.availableUnits} qty={addQty} />

                        {selectorDavidSignals.slice(0, 3).map((msg, i) => (
                          <DavidChip key={i} message={msg} />
                        ))}

                        <div style={{ display: "flex", gap: S[2], alignItems: "center", marginTop: S[3] }}>
                          <QuantityControls qty={addQty} onChange={setAddQty} />
                          <button onClick={handleAddToOrder} className="ag-action-primary" style={{
                            flex: 1, fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                            color: C.white, background: C.blueDark, border: "none",
                            borderRadius: R.sm, padding: `${S[2]}px ${S[3]}px`, cursor: "pointer",
                            minHeight: 44,
                          }}>
                            Agregar al pedido
                          </button>
                        </div>

                        {/* Quantity shortcuts (Phase 5) */}
                        <div style={{ display: "flex", gap: S[1], marginTop: S[2] }}>
                          {[6, 12, 24].map(n => (
                            <button key={n} onClick={() => setAddQty(n)} style={{
                              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                              padding: `${S[1]}px ${S[2]}px`, minHeight: 32,
                              borderRadius: R.sm, cursor: "pointer",
                              background: addQty === n ? C.blueLight : C.surface,
                              color: addQty === n ? C.blueDark : C.inkMid,
                              border: `1px solid ${addQty === n ? C.blueBorder : C.line}`,
                            }}>
                              +{n}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Prompt: select color first */}
                    {hasColors && !selectedColor && (
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[2] }}>
                        Elige un color para ver tallas disponibles.
                      </div>
                    )}
                  </>
                )}

                {/* VARIANTES-02 Phase 7: Already-added summary */}
                {alreadyAddedLines.length > 0 && (
                  <div style={{
                    marginTop: S[3], padding: `${S[2]}px ${S[3]}px`,
                    background: C.greenLight, borderRadius: R.sm,
                    border: `1px solid ${C.greenBorder}`,
                  }}>
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                      color: C.green, marginBottom: S[1],
                    }}>
                      Ya agregado al pedido
                    </div>
                    {alreadyAddedLines.map(l => (
                      <div key={l.id} style={{
                        fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
                        display: "flex", justifyContent: "space-between", padding: "1px 0",
                      }}>
                        <span>
                          {[l.color, l.size].filter(Boolean).join(" ") || l.referenceCode}
                        </span>
                        <span style={{ fontWeight: T.wt.semibold }}>
                          {l.quantity} uds
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Quick feedback toast */}
                {quickAddFeedback && (
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                    color: C.green, padding: `${S[1]}px ${S[2]}px`,
                    background: C.greenLight, borderRadius: R.sm, marginTop: S[2],
                    textAlign: "center",
                  }}>
                    {quickAddFeedback}
                  </div>
                )}
              </div>
            )}

            {/* Cart-style order lines */}
            {activeLines.length > 0 && (
              <div>
                <div style={{
                  fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                  color: C.ink, marginBottom: S[2],
                }}>
                  Carrito ({activeLines.length} {activeLines.length === 1 ? "linea" : "lineas"})
                </div>
                {activeLines.map(line => (
                  <div key={line.id} style={{
                    ...panel, padding: S[3], marginBottom: S[2],
                    display: "flex", gap: S[3], alignItems: "center",
                  }}>
                    <ProductThumb url={line.thumbnailUrl ?? null} code={line.referenceCode} size={44} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.medium, color: C.ink }}>
                        {line.productName}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                        {line.referenceCode}
                        {line.size ? ` · ${line.size}` : ""}
                        {line.color ? ` · ${line.color}` : ""}
                      </div>
                      <div style={{ display: "flex", gap: S[1], alignItems: "center", marginTop: 2 }}>
                        <AvailabilityDot avail={line.availableUnits} qty={line.quantity} />
                        <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                          {line.availableUnits === null ? "No validado" : `${line.availableUnits} disp.`}
                        </span>
                        {line.availableUnits !== null && line.quantity > line.availableUnits && (
                          <span style={{
                            fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                            padding: "1px 4px", borderRadius: R.sm,
                            background: C.redLight, color: C.red,
                          }}>
                            Excede stock
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: S[1], flexShrink: 0 }}>
                      <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
                        ${line.lineTotal.toLocaleString()}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", gap: S[1] }}>
                        <button onClick={() => onUpdateLineQty(line.id, line.quantity - 1)} style={{
                          fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold,
                          width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                          background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.sm, cursor: "pointer",
                        }}>-</button>
                        <span style={{
                          fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
                          color: C.ink, minWidth: 28, textAlign: "center",
                        }}>
                          {line.quantity}
                        </span>
                        <button onClick={() => onUpdateLineQty(line.id, line.quantity + 1)} style={{
                          fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold,
                          width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                          background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.sm, cursor: "pointer",
                        }}>+</button>
                        <button onClick={() => onRemoveLine(line.id)} style={{
                          fontFamily: T.mono, fontSize: T.sz.sm, color: C.red,
                          width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center",
                          background: C.redLight, border: `1px solid ${C.redBorder}`, borderRadius: R.sm, cursor: "pointer",
                        }}>x</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {activeLines.length === 0 && !searchQuery.trim() && (
              <div style={{
                ...panel, padding: S[6], textAlign: "center",
              }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid, marginBottom: S[1] }}>
                  Que productos lleva este pedido?
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                  Busca por referencia o nombre para agregar lineas.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Resumen — Commercial summary ────────────────────────── */}
        {step === "resumen" && (
          <div style={{ display: "flex", flexDirection: "column", gap: S[4] }}>
            {/* Customer card */}
            <div style={{ ...panel, padding: S[3], borderLeft: `3px solid ${C.blueDark}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.base, fontWeight: T.wt.bold, color: C.ink }}>
                    {header.customerName || "\u2014"}
                  </div>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                    {header.customerCode || "Sin codigo"} {header.customerId ? `· ${header.customerId}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
                    Vendedor: {header.sellerName || "\u2014"}
                  </div>
                  {header.channel && (
                    <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                      Canal: {header.channel}
                    </div>
                  )}
                </div>
              </div>
              {header.notes && (
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, marginTop: S[2], fontStyle: "italic" }}>
                  {header.notes}
                </div>
              )}
            </div>

            {/* Commercial KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2] }}>
              <div style={{ ...panel, padding: S[3], textAlign: "center" }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                  {discountEnabled && discountAmount > 0 ? "Total final" : "Valor del pedido"}
                </div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: discountEnabled && discountAmount > 0 ? C.green : C.ink }}>
                  ${(discountEnabled && discountAmount > 0 ? totalFinal : summary.totalValue).toLocaleString()}
                </div>
                {discountEnabled && discountAmount > 0 && (
                  <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red, textDecoration: "line-through" }}>
                    ${summary.totalValue.toLocaleString()}
                  </div>
                )}
              </div>
              <div style={{ ...panel, padding: S[3], textAlign: "center" }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Unidades</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>
                  {summary.totalUnits}
                </div>
              </div>
              <div style={{ ...panel, padding: S[3], textAlign: "center" }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Referencias</div>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.blueDark }}>
                  {summary.uniqueReferences}
                </div>
              </div>
            </div>

            {/* Lines — visual list */}
            <div style={{ ...panel, padding: S[3] }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
                Detalle ({summary.activeLines} lineas)
              </div>
              {activeLines.map(line => (
                <div key={line.id} style={{
                  display: "flex", alignItems: "center", gap: S[2],
                  padding: `${S[1]}px 0`, borderBottom: `1px solid ${C.line}`,
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: R.sm,
                    background: C.surface, border: `1px solid ${C.line}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                    flexShrink: 0,
                  }}>
                    {line.referenceCode.slice(0, 3)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.medium, color: C.ink }}>
                      {line.productName}
                    </span>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginLeft: S[1] }}>
                      {line.size} · {line.color}
                    </span>
                  </div>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                    {line.quantity} uds
                  </span>
                  <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, width: 70, textAlign: "right" }}>
                    ${line.lineTotal.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            {/* Discount section — optional (MOBILE-UX-02 Phase 6) */}
            <div style={{ ...panel, padding: S[3] }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: discountEnabled ? S[3] : 0 }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.ink }}>
                  Descuento
                </div>
                <button onClick={() => setDiscountEnabled(!discountEnabled)} style={{
                  fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
                  color: discountEnabled ? C.red : C.blueDark,
                  background: discountEnabled ? C.redLight : C.blueLight,
                  border: `1px solid ${discountEnabled ? C.redBorder : C.blueBorder}`,
                  borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
                  minHeight: 36,
                }}>
                  {discountEnabled ? "Quitar descuento" : "Agregar descuento"}
                </button>
              </div>
              {discountEnabled && (
                <div style={{ display: "flex", flexDirection: "column", gap: S[2] }}>
                  <div style={{ display: "flex", gap: S[2] }}>
                    {(["porcentaje", "valor_fijo"] as const).map(dt => (
                      <button key={dt} onClick={() => setDiscountType(dt)} style={{
                        flex: 1, fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                        padding: `${S[2]}px ${S[3]}px`, minHeight: 44,
                        borderRadius: R.sm, cursor: "pointer",
                        background: discountType === dt ? C.blueDark : C.surface,
                        color: discountType === dt ? C.white : C.ink,
                        border: `1px solid ${discountType === dt ? C.blueDark : C.line}`,
                      }}>
                        {dt === "porcentaje" ? "% Porcentaje" : "$ Valor fijo"}
                      </button>
                    ))}
                  </div>
                  <div>
                    <label style={labelStyle}>
                      {discountType === "porcentaje" ? "Porcentaje de descuento" : "Valor del descuento ($)"}
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={discountType === "porcentaje" ? 100 : subtotal}
                      value={discountValue || ""}
                      onChange={e => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder={discountType === "porcentaje" ? "Ej: 10" : "Ej: 50000"}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Motivo (opcional)</label>
                    <input type="text" value={discountMotivo}
                      onChange={e => setDiscountMotivo(e.target.value)}
                      placeholder="Ej: Descuento por volumen"
                      style={inputStyle} />
                  </div>
                  {discountValue > 0 && (
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: `${S[2]}px ${S[3]}px`, background: C.surface, borderRadius: R.sm,
                    }}>
                      <div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>Subtotal</div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>${subtotal.toLocaleString()}</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.red }}>
                          Descuento {discountType === "porcentaje" ? `(${discountValue}%)` : ""}
                        </div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.red }}>
                          -${discountAmount.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>Total final</div>
                        <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.green }}>
                          ${totalFinal.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  )}
                  {!discountValid && (
                    <div style={{
                      fontFamily: T.mono, fontSize: T.sz.xs, color: C.red,
                      padding: `${S[1]}px ${S[2]}px`, background: C.redLight, borderRadius: R.sm,
                    }}>
                      {discountType === "porcentaje" && discountValue > 100
                        ? "El porcentaje no puede superar 100%."
                        : discountAmount > subtotal
                          ? "El descuento no puede superar el subtotal."
                          : "Ingresa un valor de descuento valido."}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* David inventory signals (INVENTARIO-01 Phase 9) */}
            {orderInventorySignals.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
                {orderInventorySignals.slice(0, 3).map((msg, i) => (
                  <DavidChip key={`inv-${i}`} message={msg} variant="warning" />
                ))}
              </div>
            )}

            {/* David insights — max 3 (Phase 4) */}
            {signals.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: S[1] }}>
                {signals.slice(0, 3).map((sig, i) => (
                  <DavidChip
                    key={i}
                    message={sig.message}
                    variant={sig.type === "inventory_warning" ? "warning"
                           : sig.type === "validation_ok" ? "success"
                           : "default"}
                  />
                ))}
              </div>
            )}

            {/* Validation issues */}
            {validation.issues.length > 0 && (
              <div style={{ ...panel, padding: S[3], background: C.redLight, borderColor: C.redBorder }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.red, marginBottom: S[1] }}>
                  Validacion
                </div>
                {validation.issues.map((issue, i) => (
                  <div key={i} style={{
                    fontFamily: T.mono, fontSize: T.sz.xs,
                    color: issue.severity === "error" ? C.red : issue.severity === "warning" ? C.amber : C.inkMid,
                    marginBottom: 2,
                  }}>
                    {issue.severity === "error" ? "Error" : issue.severity === "warning" ? "Aviso" : "Info"}: {issue.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer — sticky total bar on Productos, nav on others */}
      <div style={{
        padding: `${S[3]}px ${S[4]}px`, borderTop: `1px solid ${C.line}`,
        background: C.white,
      }}>
        {/* Sticky total bar — visible in Productos when lines exist */}
        {step === "productos" && activeLines.length > 0 && (
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: `${S[2]}px 0`, marginBottom: S[2],
          }}>
            <div style={{ display: "flex", gap: S[3], alignItems: "baseline" }}>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                {activeLines.length} {activeLines.length === 1 ? "linea" : "lineas"}
              </span>
              <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                {summary.totalUnits} uds
              </span>
            </div>
            <span style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>
              ${summary.totalValue.toLocaleString()}
            </span>
          </div>
        )}

        <div style={{ display: "flex", gap: S[2], flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: S[2] }}>
            {step !== "cliente" && (
              <button onClick={() => onStepChange(step === "resumen" ? "productos" : "cliente")}
                className="ag-action-ghost" style={{
                fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
                background: "transparent", border: `1px solid ${C.line}`,
                borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`, cursor: "pointer",
                minHeight: 44,
              }}>
                Atras
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: S[2] }}>
            {step === "productos" && (
              <button
                onClick={() => onStepChange("resumen")}
                disabled={!productosReady}
                className="ag-action-primary" style={{
                fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                color: C.white,
                background: productosReady ? C.blueDark : C.inkFaint,
                border: "none",
                borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`,
                cursor: productosReady ? "pointer" : "not-allowed",
                minHeight: 44,
              }}>
                Resumen
              </button>
            )}
            {step === "cliente" && (
              <button
                onClick={() => onStepChange("productos")}
                disabled={!clienteReady}
                className="ag-action-primary" style={{
                fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                color: C.white,
                background: clienteReady ? C.blueDark : C.inkFaint,
                border: "none",
                borderRadius: R.sm, padding: `${S[2]}px ${S[4]}px`,
                cursor: clienteReady ? "pointer" : "not-allowed",
                minHeight: 44,
              }}>
                Siguiente
              </button>
            )}
            {step === "resumen" && (
              <>
                <button onClick={onSaveDraft} className="ag-action-secondary" style={{
                  fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                  color: C.blueDark, background: C.blueLight,
                  border: `1px solid ${C.blueBorder}`, borderRadius: R.sm,
                  padding: `${S[2]}px ${S[4]}px`, cursor: "pointer", minHeight: 44,
                }}>
                  Guardar borrador
                </button>
                <button
                  onClick={onSubmit}
                  disabled={!discountValid || !validation.canSubmit}
                  className="ag-action-primary"
                  style={{
                    fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
                    color: C.white, background: (discountValid && validation.canSubmit) ? C.blueDark : C.inkFaint,
                    border: "none", borderRadius: R.sm,
                    padding: `${S[2]}px ${S[4]}px`,
                    cursor: (discountValid && validation.canSubmit) ? "pointer" : "not-allowed",
                    minHeight: 44,
                  }}
                >
                  Enviar a SAG
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

// ── Availability Badge (Phase 5) ────────────────────────────────────────────

// ── Quantity Controls (VARIANTES-02 Phase 5) ─────────────────────────────────

function QuantityControls({ qty, onChange }: { qty: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
      <button onClick={() => onChange(Math.max(1, qty - 1))} style={{
        fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold,
        width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.sm, cursor: "pointer",
      }}>-</button>
      <input type="number" min={1} value={qty}
        onChange={e => onChange(Math.max(1, parseInt(e.target.value) || 1))}
        style={{
          fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold,
          width: 64, textAlign: "center" as const, minHeight: 44,
          padding: `${S[2]}px ${S[1]}px`, border: `1px solid ${C.line}`, borderRadius: R.sm,
          outline: "none",
        }} />
      <button onClick={() => onChange(qty + 1)} style={{
        fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold,
        width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
        background: C.surface, border: `1px solid ${C.line}`, borderRadius: R.sm, cursor: "pointer",
      }}>+</button>
    </div>
  );
}

// ── Availability Badge (Phase 5) ────────────────────────────────────────────

function AvailabilityBadge({ avail, qty }: { avail: number | null; qty: number }) {
  let label: string;
  let color: string;
  let bg: string;

  if (avail === null) {
    label = "Pendiente de sincronizacion";
    color = C.amber;
    bg    = C.amberLight;
  } else if (avail <= 0) {
    label = "Sin stock — produccion";
    color = C.red;
    bg    = C.redLight;
  } else if (avail < qty) {
    label = `Parcial: ${avail} de ${qty} disponibles`;
    color = C.amber;
    bg    = C.amberLight;
  } else {
    label = `Disponible: ${avail} uds`;
    color = C.green;
    bg    = C.greenLight;
  }

  return (
    <div style={{
      fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
      padding: `${S[1]}px ${S[2]}px`, borderRadius: R.sm,
      background: bg, color, marginBottom: S[1],
      display: "inline-block",
    }}>
      {label}
    </div>
  );
}

// ── Drawer Lines Tab (POLISH-03) ─────────────────────────────────────────────

function lineInventoryLabel(line: OrderLine): { label: string; color: string; bg: string } {
  if (line.availableUnits === null) {
    return { label: "Inventario no validado", color: C.inkFaint, bg: C.surface };
  }
  if (line.availableUnits <= 0) {
    return { label: "Referencia agotada", color: C.red, bg: C.redLight };
  }
  if (line.quantity > line.availableUnits) {
    return { label: "Excede disponibilidad", color: C.amber, bg: C.amberLight };
  }
  if (line.availableUnits < 20) {
    return { label: "Ultimas unidades", color: C.amber, bg: C.amberLight };
  }
  return { label: "Disponible", color: C.green, bg: C.greenLight };
}

// ── Reference group helper ──────────────────────────────────────────────────

interface RefGroup {
  referenceCode: string;
  productName:   string;
  thumbnailUrl:  string | null;
  lines:         OrderLine[];
  totalUnits:    number;
  totalValue:    number;
}

function groupLinesByReference(lines: OrderLine[]): RefGroup[] {
  const map = new Map<string, RefGroup>();
  for (const line of lines) {
    let group = map.get(line.referenceCode);
    if (!group) {
      group = {
        referenceCode: line.referenceCode,
        productName:   line.productName,
        thumbnailUrl:  line.thumbnailUrl ?? null,
        lines:         [],
        totalUnits:    0,
        totalValue:    0,
      };
      map.set(line.referenceCode, group);
    }
    group.lines.push(line);
    group.totalUnits += line.quantity;
    group.totalValue += line.lineTotal;
    if (!group.thumbnailUrl && line.thumbnailUrl) group.thumbnailUrl = line.thumbnailUrl;
    if (group.productName === group.referenceCode && line.productName !== line.referenceCode) {
      group.productName = line.productName;
    }
  }
  return [...map.values()];
}

function stockLabel(line: OrderLine): { text: string; color: string } {
  if (line.availableUnits === null) return { text: "\u2014", color: C.inkFaint };
  if (line.availableUnits <= 0) return { text: "Sin stock", color: C.red };
  if (line.quantity > line.availableUnits) return { text: "Excede disponible", color: C.amber };
  if (line.availableUnits < 20) return { text: "Ultimas uds", color: C.amber };
  return { text: "Disponible", color: C.green };
}

// ── Drawer Lines Tab (ORDER-DETAIL-LINES-CLARITY-01) ────────────────────────

function DrawerLinesTab({ activeLines, order }: { activeLines: OrderLine[]; order: OrderDraft }) {
  const [collapsedRefs, setCollapsedRefs] = useState<Set<string>>(new Set());

  const toggleRef = (ref: string) =>
    setCollapsedRefs(prev => {
      const next = new Set(prev);
      next.has(ref) ? next.delete(ref) : next.add(ref);
      return next;
    });

  // Empty states
  if (activeLines.length === 0 && (order.origin === "sag" || order.origin === "sag_customer_order")) {
    return (
      <div style={{ ...panel, padding: S[4], borderLeft: `3px solid ${C.amber}` }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold, color: C.inkMid, marginBottom: S[1] }}>
          Pedido importado sin detalle de lineas
        </div>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight }}>
          Este pedido tiene valor total ${order.summary.totalValue.toLocaleString()} pero sin desglose de referencias.
        </div>
      </div>
    );
  }

  if (activeLines.length === 0) {
    return (
      <div style={{ ...panel, padding: S[4], textAlign: "center" }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>
          Este pedido no tiene lineas.
        </div>
      </div>
    );
  }

  const groups = groupLinesByReference(activeLines);
  const totalUnits = activeLines.reduce((s, l) => s + l.quantity, 0);
  const totalValue = activeLines.reduce((s, l) => s + l.lineTotal, 0);
  const totalVariants = activeLines.length;

  // Column header style
  const colHead = {
    fontFamily: T.mono, fontSize: "9px", color: C.inkFaint,
    textTransform: "uppercase" as const, letterSpacing: "0.06em",
    fontWeight: T.wt.semibold,
  };

  return (
    <>
      {/* Groups */}
      {groups.map(group => {
        const isCollapsed = collapsedRefs.has(group.referenceCode);
        const hasMultiple = group.lines.length > 1;

        return (
          <div key={group.referenceCode} style={{ ...panel, marginBottom: S[2] }}>
            {/* Group header */}
            <button
              onClick={() => hasMultiple && toggleRef(group.referenceCode)}
              style={{
                display: "flex", alignItems: "center", gap: S[2],
                width: "100%", padding: `${S[2]}px ${S[3]}px`,
                background: C.surfaceAlt, border: "none",
                borderBottom: `1px solid ${C.line}`,
                cursor: hasMultiple ? "pointer" : "default",
                textAlign: "left",
              }}
            >
              <ProductThumb url={group.thumbnailUrl} code={group.referenceCode} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.ink }}>
                  {group.referenceCode}
                </div>
                {group.productName !== group.referenceCode && (
                  <div style={{
                    fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {group.productName}
                  </div>
                )}
                {group.lines[0]?.subgrupoSag && (
                  <div style={{
                    fontFamily: T.mono, fontSize: "9px", color: C.inkFaint,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {group.lines[0].subgrupoSag}
                  </div>
                )}
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight,
                flexShrink: 0, textAlign: "right",
              }}>
                {group.lines.length} variante{group.lines.length !== 1 ? "s" : ""}
                {" \u00b7 "}{group.totalUnits} uds
                {" \u00b7 "}${group.totalValue.toLocaleString()}
              </div>
              {hasMultiple && (
                <span style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
                  flexShrink: 0, width: 12, textAlign: "center",
                }}>
                  {isCollapsed ? "\u25BC" : "\u25B2"}
                </span>
              )}
            </button>

            {/* Variant rows */}
            {!isCollapsed && (
              <>
                {/* Column headers */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 50px 80px 80px minmax(60px, auto)",
                  gap: `0 ${S[1]}px`,
                  padding: `${S[1]}px ${S[3]}px`,
                  borderBottom: `1px solid ${C.lineSubtle}`,
                }}>
                  <span style={colHead}>Talla</span>
                  <span style={colHead}>Color</span>
                  <span style={{ ...colHead, textAlign: "right" }}>Cant.</span>
                  <span style={{ ...colHead, textAlign: "right" }}>P. unit.</span>
                  <span style={{ ...colHead, textAlign: "right" }}>Total</span>
                  <span style={{ ...colHead, textAlign: "right" }}>Stock</span>
                </div>

                {group.lines.map(line => {
                  const st = stockLabel(line);
                  return (
                    <div key={line.id} style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 50px 80px 80px minmax(60px, auto)",
                      gap: `0 ${S[1]}px`,
                      padding: `${S[1] + 1}px ${S[3]}px`,
                      borderBottom: `1px solid ${C.lineSubtle}`,
                      fontFamily: T.mono, fontSize: T.sz["2xs"],
                      alignItems: "center",
                    }}>
                      <span style={{ color: C.ink, fontWeight: T.wt.medium }}>
                        {line.size || "\u2014"}
                      </span>
                      <span style={{ color: C.ink }} title={line.color || undefined}>
                        {line.colorName ?? (line.color || "\u2014")}
                      </span>
                      <span style={{ color: C.ink, fontWeight: T.wt.semibold, textAlign: "right" }}>
                        {line.quantity}
                      </span>
                      <span style={{ color: C.inkMid, textAlign: "right" }}>
                        ${line.unitPrice.toLocaleString()}
                      </span>
                      <span style={{ color: C.ink, fontWeight: T.wt.semibold, textAlign: "right" }}>
                        ${line.lineTotal.toLocaleString()}
                      </span>
                      <span style={{
                        color: st.color, fontWeight: T.wt.medium, textAlign: "right",
                        fontSize: "9px",
                      }}>
                        {st.text}
                      </span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })}

      {/* Totals strip */}
      <div style={{
        display: "flex", alignItems: "center", gap: S[2],
        padding: `${S[3]}px 0`, borderTop: `2px solid ${C.ink}`, marginTop: S[1],
        fontFamily: T.mono, fontSize: T.sz.xs,
      }}>
        <span style={{ color: C.inkMid }}>
          {groups.length} referencia{groups.length !== 1 ? "s" : ""}
          {" \u00b7 "}{totalVariants} variante{totalVariants !== 1 ? "s" : ""}
          {" \u00b7 "}{totalUnits} uds
        </span>
        <span style={{ marginLeft: "auto", fontWeight: T.wt.bold, color: C.ink }}>
          ${totalValue.toLocaleString()}
        </span>
      </div>
    </>
  );
}

function AvailabilityDot({ avail, qty }: { avail: number | null; qty: number }) {
  let color: string;
  let title: string;

  if (avail === null) {
    color = C.amber;
    title = "No validado";
  } else if (avail <= 0) {
    color = C.red;
    title = "Agotado";
  } else if (avail < qty) {
    color = C.amber;
    title = `Parcial: ${avail} uds`;
  } else {
    color = C.green;
    title = `Disponible: ${avail} uds`;
  }

  return (
    <span title={title} style={{
      width: 8, height: 8, borderRadius: R.pill,
      background: color, display: "inline-block", flexShrink: 0,
    }} />
  );
}

// ── Drawer Commercial Conditions (ORDER-CREATION-POLISH-01) ──────────────────

function DrawerCommercialConditions({ order }: { order: OrderDraft }) {
  const h = order.header;
  const hasDiscount = (h.discountValue ?? 0) > 0;
  const hasDelivery = h.deliveryMode === "scheduled" && h.deliveryDate;
  const hasCustomerNotes = !!(h.customerNotes);
  const hasInternalNotes = !!(h.internalNotes);
  const hasAny = hasDiscount || hasDelivery || hasCustomerNotes || hasInternalNotes;

  if (!hasAny) return null;

  const infoRow = (label: string, value: string) => (
    <div style={{ display: "flex", gap: S[2], marginBottom: S[1] }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, width: 120, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>
        {value}
      </span>
    </div>
  );

  return (
    <div style={{ ...panel, padding: S[3], marginTop: S[3] }}>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.semibold,
        color: C.ink, marginBottom: S[2],
      }}>
        Condiciones comerciales
      </div>

      {infoRow("Entrega", h.deliveryMode === "scheduled" ? "Programada" : "Inmediata")}
      {hasDelivery && infoRow("Fecha compromiso", h.deliveryDate!)}

      {hasDiscount && (
        <>
          {infoRow("Descuento", h.discountType === "percentage"
            ? `${h.discountValue}%`
            : `$${(h.discountValue ?? 0).toLocaleString()}`
          )}
          {infoRow("Valor descuento", `$${(order.summary.discountAmount ?? 0).toLocaleString()}`)}
        </>
      )}

      {hasCustomerNotes && (
        <div style={{ marginTop: S[2] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginBottom: 2 }}>
            Observaciones
          </div>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
            padding: S[2], background: C.surfaceAlt, borderRadius: R.sm,
          }}>
            {h.customerNotes}
          </div>
        </div>
      )}

      {hasInternalNotes && (
        <div style={{ marginTop: S[2] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.amber, marginBottom: 2 }}>
            Notas internas (solo Agentik)
          </div>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
            padding: S[2], background: C.amberLight, borderRadius: R.sm,
            border: `1px solid ${C.amberBorder}`,
          }}>
            {h.internalNotes}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Product Thumbnail (PRODUCTOS-MOBILE-03) ─────────────────────────────────

function ProductThumb({ url, code, size = 48 }: { url: string | null; code: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt={code}
        style={{
          width: size, height: size, borderRadius: R.sm,
          objectFit: "cover", flexShrink: 0,
          background: C.surface, border: `1px solid ${C.line}`,
        }}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: R.sm,
      background: C.surface, border: `1px solid ${C.line}`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: T.mono, fontSize: size > 44 ? T.sz.xs : T.sz["2xs"],
      color: C.inkFaint, flexShrink: 0,
    }}>
      {code.slice(0, 3)}
    </div>
  );
}

// ── David Chip (max 3 enforced at call sites) ───────────────────────────────

function DavidChip({ message, variant = "default" }: { message: string; variant?: "default" | "warning" | "success" }) {
  const bg = variant === "warning" ? C.amberLight
           : variant === "success" ? C.greenLight
           : C.surface;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: S[2],
      padding: `${S[1]}px ${S[2]}px`, marginBottom: S[1],
      background: bg, borderRadius: R.sm,
    }}>
      <span style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
        color: C.blueDark, background: C.white, padding: "1px 5px",
        borderRadius: R.sm, border: `1px solid ${C.blueBorder}`,
      }}>David</span>
      <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink }}>{message}</span>
    </div>
  );
}

// ── Draft Delete Inline (header placement) ──────────────────────────────────

function DraftDeleteInline({
  orderId,
  onAction,
}: {
  orderId: string;
  onAction: (orderId: string, action: string) => void;
}) {
  const [confirm, setConfirm] = useState(false);

  if (!confirm) {
    return (
      <button onClick={() => setConfirm(true)}
        style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red,
          background: "transparent", border: `1px solid ${C.redBorder}`,
          borderRadius: R.sm, padding: `2px ${S[2]}px`, cursor: "pointer",
        }}>
        Eliminar borrador
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", gap: S[1], alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>
        Este borrador sera eliminado. No afecta SAG.
      </span>
      <button onClick={() => onAction(orderId, "delete_draft")}
        style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.bold,
          color: C.white, background: C.red, border: "none",
          borderRadius: R.sm, padding: `2px ${S[2]}px`, cursor: "pointer",
        }}>
        Confirmar
      </button>
      <button onClick={() => setConfirm(false)}
        style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight,
          background: "transparent", border: `1px solid ${C.line}`,
          borderRadius: R.sm, padding: `2px ${S[2]}px`, cursor: "pointer",
        }}>
        No
      </button>
    </span>
  );
}

// ── Order Detail Drawer ─────────────────────────────────────────────────────

type DetailTab = "lineas" | "cumplimiento" | "historial_cliente" | "desempeno_vendedor" | "variantes" | "demanda";

function OrderDetailDrawer({
  orgSlug,
  order,
  branding: brandingProp,
  onClose,
  onAction,
}: {
  orgSlug:   string;
  order:     OrderDraft;
  branding?: OrderShareBranding;
  onClose:   () => void;
  onAction:  (orderId: string, action: string) => void;
}) {
  const sc = STATUS_COLOR[order.status];
  const syncBdg = orderStateLabel(order.syncState, order.origin, order.lines.filter(l => !l.removed).length > 0);
  const signals = buildOrderDavidSignals(order);
  const activeLines = order.lines.filter(l => !l.removed);
  const fulfillment = evaluateOrderFulfillment(order);

  const [activeTab, setActiveTab]     = useState<DetailTab>("lineas");
  const [customerHist, setCustomerHist] = useState<CustomerOrderHistory | null>(null);
  const [sellerPerf, setSellerPerf]     = useState<SellerPerformance | null>(null);
  const [variantMetrics, setVariantMetrics] = useState<any>(null);
  const [demandData, setDemandData]         = useState<any>(null);
  const [histLoading, setHistLoading]   = useState(false);
  const [pdfLoading, setPdfLoading]     = useState(false);
  const [feedback, setFeedback]         = useState<string | null>(null);

  function showFb(msg: string) { setFeedback(msg); setTimeout(() => setFeedback(null), 4000); }

  async function switchTab(tab: DetailTab) {
    setActiveTab(tab);
    if (tab === "historial_cliente" && !customerHist) {
      setHistLoading(true);
      const data = await historyApi(orgSlug, { action: "customer", customerCode: order.header.customerCode });
      setCustomerHist(data.history ?? null);
      setHistLoading(false);
    }
    if (tab === "desempeno_vendedor" && !sellerPerf) {
      setHistLoading(true);
      try {
        const data = await historyApi(orgSlug, {
          action: "seller_performance",
          sellerName: order.header.sellerName ?? "",
          sellerCode: order.header.sellerId ?? null,
          source: order.sellerSource ?? "unknown",
        });
        setSellerPerf(data.performance ?? null);
      } catch (err) {
        console.error("[desempeno_vendedor] fetch error", err);
        setSellerPerf(null);
      } finally {
        setHistLoading(false);
      }
    }
    if (tab === "variantes" && !variantMetrics) {
      setHistLoading(true);
      const data = await historyApi(orgSlug, { action: "variant_metrics" });
      setVariantMetrics(data.metrics ?? null);
      setHistLoading(false);
    }
    if (tab === "demanda" && !demandData) {
      setHistLoading(true);
      try {
        const res = await fetch(`/api/orgs/${orgSlug}/comercial/demand`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "snapshot" }),
        });
        const json = await res.json();
        setDemandData(json.snapshot ?? null);
      } catch { setDemandData(null); }
      setHistLoading(false);
    }
  }

  async function downloadPdf() {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgSlug}/comercial/pedidos/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      if (!res.ok) { showFb("Error al generar PDF."); setPdfLoading(false); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pedido_${order.consecutivo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      showFb("PDF descargado.");
    } catch {
      showFb("Error al generar PDF.");
    }
    setPdfLoading(false);
  }

  // ── Share preview modal state ────────────────────────────────────────────
  const [shareOpen, setShareOpen]   = useState(false);
  const [shareTab, setShareTab]     = useState<"whatsapp" | "correo">("whatsapp");
  const [sharePayload, setSharePayload] = useState<OrderSharePayload | null>(null);

  function openSharePreview(tab: "whatsapp" | "correo") {
    const fallbackBranding: OrderShareBranding = {
      commercialName: "Agentik",
      legalName:      "Agentik",
      phone:          "",
      email:          "",
      website:        "",
      logoUrl:        "",
      documentFooter: "Generado desde Agentik.",
    };
    const payload = buildOrderSharePayload(order, brandingProp || fallbackBranding);
    setSharePayload(payload);
    setShareTab(tab);
    setShareOpen(true);
  }

  function executeWhatsApp() {
    if (!sharePayload) return;
    const encoded = encodeURIComponent(sharePayload.whatsappText);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
    setShareOpen(false);
  }

  function executeEmail() {
    if (!sharePayload) return;
    const subject = encodeURIComponent(sharePayload.subject);
    const body = encodeURIComponent(sharePayload.emailBody);
    window.open(`mailto:?subject=${subject}&body=${body}`, "_self");
    setShareOpen(false);
  }

  const tabBtn = (tab: DetailTab, label: string) => (
    <button key={tab} onClick={() => switchTab(tab)} style={{
      fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
      padding: `${S[1]}px ${S[2]}px`, borderRadius: R.sm, cursor: "pointer",
      background: activeTab === tab ? C.blueDark : "transparent",
      color:      activeTab === tab ? C.white : C.inkMid,
      border:     `1px solid ${activeTab === tab ? C.blueDark : C.line}`,
    }}>
      {label}
    </button>
  );

  const actionBtn = (label: string, onClick: () => void, loading = false) => (
    <button onClick={onClick} disabled={loading} className="ag-action-secondary" style={{
      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
      color: C.blueDark, background: C.blueLight,
      border: `1px solid ${C.blueBorder}`, borderRadius: R.sm,
      padding: `2px ${S[2]}px`, cursor: loading ? "wait" : "pointer",
      opacity: loading ? 0.6 : 1,
    }}>
      {label}
    </button>
  );

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: 640, maxWidth: "100vw",
      background: C.white, borderLeft: `1px solid ${C.line}`, boxShadow: E.lg,
      zIndex: 51, display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: S[4], borderBottom: `1px solid ${C.line}`, background: C.surfaceAlt }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>
              Pedido #{order.consecutivo}
            </div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight, marginTop: 2 }}>
              {order.header.customerName}
              {order.header.sellerName ? (
                <>
                  {" · "}{order.header.sellerName}
                  {order.sellerSource && (
                    <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, marginLeft: S[1] }}>
                      ({order.sellerSource === "sag_movimientos" ? "SAG" : "CRM"} · {order.sellerConfidence === "high" ? "alta" : "media"})
                    </span>
                  )}
                </>
              ) : (
                <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginLeft: S[1] }}>
                   · Vendedor no identificado en SAG
                </span>
              )}
            </div>
            {order.commercialJourneyId && (
              <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint, marginTop: 1 }}>
                {order.commercialJourneyId}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: S[2] }}>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
              padding: "2px 8px", borderRadius: R.pill, background: sc.bg, color: sc.text,
            }}>
              {STATUS_LABEL[order.status]}
            </span>
            <button onClick={onClose} style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: T.mono, fontSize: T.sz.lg, color: C.inkLight, padding: S[1],
            }}>x</button>
          </div>
        </div>

        {/* Summary strip */}
        <div style={{ display: "flex", gap: S[3], marginTop: S[3], flexWrap: "wrap" }}>
          <MiniStat label="Lineas" value={String(order.summary.activeLines)} color={C.ink} />
          <MiniStat label="Unidades" value={String(order.summary.totalUnits)} color={C.ink} />
          <MiniStat label="Valor" value={`$${order.summary.totalValue.toLocaleString()}`} color={C.green} />
          <MiniStat label="Estado" value={syncBdg} color={order.syncState === "sincronizado" ? C.green : C.inkMid} />
        </div>

        {/* Fulfillment summary — Phase 5 */}
        {activeLines.length > 0 && (
          <FulfillmentStrip fulfillment={fulfillment} />
        )}

        {/* Document actions */}
        <div style={{ display: "flex", gap: S[1], marginTop: S[3], flexWrap: "wrap" }}>
          {actionBtn(pdfLoading ? "Generando..." : "Descargar PDF", downloadPdf, pdfLoading)}
          {actionBtn("WhatsApp", () => openSharePreview("whatsapp"))}
          {actionBtn("Correo", () => openSharePreview("correo"))}
        </div>

        {/* Draft actions — visible in header for AGK orders */}
        {(canEditDraftOrder(order) || canDeleteDraftOrder(order)) && (
          <div style={{ display: "flex", gap: S[2], marginTop: S[2], flexWrap: "wrap", alignItems: "center" }}>
            {canEditDraftOrder(order) && (
              <button onClick={() => onAction(order.id, "edit_draft")}
                className="ag-action-secondary"
                style={{
                  fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                  color: C.blueDark, background: C.blueLight,
                  border: `1px solid ${C.blueBorder}`, borderRadius: R.sm,
                  padding: `2px ${S[2]}px`, cursor: "pointer",
                }}>
                Editar borrador
              </button>
            )}
            {canDeleteDraftOrder(order) && (
              <DraftDeleteInline orderId={order.id} onAction={onAction} />
            )}
          </div>
        )}
      </div>

      {/* Feedback */}
      {feedback && (
        <div style={{
          padding: `${S[1]}px ${S[4]}px`, background: C.greenLight,
          borderBottom: `1px solid ${C.line}`,
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.green,
        }}>
          {feedback}
        </div>
      )}

      {/* David signals — max 3 */}
      {signals.length > 0 && (
        <div style={{ padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`, background: C.surface }}>
          {signals.slice(0, 3).map((msg, i) => (
            <DavidChip key={i} message={msg.message} />
          ))}
        </div>
      )}

      {/* SAG error */}
      {order.sagError && (
        <div style={{
          padding: `${S[2]}px ${S[4]}px`, background: C.redLight,
          borderBottom: `1px solid ${C.redBorder}`,
          fontFamily: T.mono, fontSize: T.sz.sm, color: C.red,
        }}>
          Error SAG: {order.sagError}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: S[1], padding: `${S[2]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}` }}>
        {tabBtn("lineas", "Lineas")}
        {tabBtn("cumplimiento", "Cumplimiento")}
        {tabBtn("variantes", "Variantes")}
        {tabBtn("historial_cliente", "Historial cliente")}
        {tabBtn("desempeno_vendedor", "Desempe\u00f1o vendedor")}
        {tabBtn("demanda", "Demanda")}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "auto", padding: S[4] }}>

        {/* Lineas tab */}
        {activeTab === "lineas" && (
          <>
            <DrawerLinesTab activeLines={activeLines} order={order} />
            <DrawerCommercialConditions order={order} />
          </>
        )}

        {/* Fulfillment tab */}
        {activeTab === "cumplimiento" && (
          <FulfillmentPanel order={order} fulfillment={fulfillment} />
        )}

        {/* Variant metrics tab */}
        {activeTab === "variantes" && (
          <VariantMetricsPanel metrics={variantMetrics} loading={histLoading} />
        )}

        {/* Customer history tab */}
        {activeTab === "historial_cliente" && (
          <CustomerHistoryPanel history={customerHist} loading={histLoading} />
        )}

        {/* Seller performance tab (PEDIDOS-VENDEDOR-PERFORMANCE-01) */}
        {activeTab === "desempeno_vendedor" && (
          <SellerPerformancePanel performance={sellerPerf} loading={histLoading} />
        )}

        {/* Demand intelligence tab (PEDIDOS-DEMANDA-PRODUCCION-01) */}
        {activeTab === "demanda" && (
          <DemandIntelligencePanel data={demandData} loading={histLoading} refCode={order.lines[0]?.referenceCode} />
        )}
      </div>

      {/* Footer actions */}
      <div style={{
        padding: S[4], borderTop: `1px solid ${C.line}`,
        display: "flex", gap: S[2], flexWrap: "wrap",
      }}>
        <OrderActions status={order.status} orderId={order.id} sagOrderId={order.sagOrderId} origin={order.origin} onAction={onAction} />
      </div>

      {/* Share preview modal */}
      {shareOpen && sharePayload && (
        <SharePreviewModal
          payload={sharePayload}
          tab={shareTab}
          onTabChange={setShareTab}
          onSendWhatsApp={executeWhatsApp}
          onSendEmail={executeEmail}
          onClose={() => setShareOpen(false)}
          branding={brandingProp}
        />
      )}
    </div>
  );
}

// ── Share Preview Modal ─────────────────────────────────────────────────────

function SharePreviewModal({
  payload,
  tab,
  onTabChange,
  onSendWhatsApp,
  onSendEmail,
  onClose,
  branding,
}: {
  payload:        OrderSharePayload;
  tab:            "whatsapp" | "correo";
  onTabChange:    (t: "whatsapp" | "correo") => void;
  onSendWhatsApp: () => void;
  onSendEmail:    () => void;
  onClose:        () => void;
  branding?:      OrderShareBranding;
}) {
  const tabStyle = (active: boolean) => ({
    fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
    padding: `${S[1]}px ${S[3]}px`, borderRadius: R.sm, cursor: "pointer" as const,
    background: active ? C.blueDark : "transparent",
    color:      active ? C.white : C.inkMid,
    border:     `1px solid ${active ? C.blueDark : C.line}`,
  });

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(0,0,0,0.4)", display: "flex",
      alignItems: "center", justifyContent: "center",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: C.white, borderRadius: R.lg, width: 560, maxWidth: "92vw",
        maxHeight: "85vh", display: "flex", flexDirection: "column",
        boxShadow: E.lg, overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: `${S[3]}px ${S[4]}px`, borderBottom: `1px solid ${C.line}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
            Compartir pedido
          </div>
          <button onClick={onClose} style={{
            fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight,
            background: "transparent", border: "none", cursor: "pointer",
          }}>
            Cerrar
          </button>
        </div>

        {/* Tabs */}
        <div style={{ padding: `${S[2]}px ${S[4]}px`, display: "flex", gap: S[2] }}>
          <button style={tabStyle(tab === "whatsapp")} onClick={() => onTabChange("whatsapp")}>
            WhatsApp
          </button>
          <button style={tabStyle(tab === "correo")} onClick={() => onTabChange("correo")}>
            Correo
          </button>
        </div>

        {/* Summary strip */}
        <div style={{
          padding: `${S[2]}px ${S[4]}px`, background: C.surfaceAlt,
          fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid,
          display: "flex", gap: S[3], flexWrap: "wrap",
        }}>
          <span>Destinatario: <strong>{payload.summary.recipientName}</strong></span>
          <span>Total: <strong>${payload.summary.total.toLocaleString("es-CO")}</strong></span>
          <span>{payload.summary.units} uds</span>
        </div>

        {/* Preview body */}
        <div style={{
          flex: 1, overflow: "auto", padding: S[4],
        }}>
          {tab === "whatsapp" && (
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.xs, lineHeight: 1.6,
              whiteSpace: "pre-wrap", color: C.ink,
              background: "#e8f5e9", borderRadius: R.md, padding: S[3],
            }}>
              {payload.whatsappText}
            </div>
          )}
          {tab === "correo" && (
            <div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid, marginBottom: S[2],
              }}>
                <strong>Asunto:</strong> {payload.subject}
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz.xs, lineHeight: 1.6,
                whiteSpace: "pre-wrap", color: C.ink,
                background: C.surfaceAlt, borderRadius: R.md, padding: S[3],
                border: `1px solid ${C.line}`,
              }}>
                {payload.emailBody}
              </div>
              <div style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkLight, marginTop: S[2],
              }}>
                El PDF se adjuntara automaticamente si esta disponible.
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          padding: `${S[3]}px ${S[4]}px`, borderTop: `1px solid ${C.line}`,
          display: "flex", justifyContent: "flex-end", gap: S[2],
        }}>
          <button onClick={onClose} className="ag-action-ghost" style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
            color: C.inkMid, background: "transparent",
            border: `1px solid ${C.line}`, borderRadius: R.sm,
            padding: `${S[1]}px ${S[3]}px`, cursor: "pointer",
          }}>
            Cancelar
          </button>
          <button
            onClick={tab === "whatsapp" ? onSendWhatsApp : onSendEmail}
            className="ag-action-primary"
            style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
              color: C.white, background: tab === "whatsapp" ? "#25D366" : C.blueDark,
              border: "none", borderRadius: R.sm,
              padding: `${S[1]}px ${S[3]}px`, cursor: "pointer",
            }}
          >
            {tab === "whatsapp" ? "Enviar por WhatsApp" : "Abrir correo"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Order Actions ───────────────────────────────────────────────────────────

function OrderActions({
  status, orderId, sagOrderId, origin, onAction,
}: {
  status:     OrderStatus;
  orderId:    string;
  sagOrderId: string | null;
  origin:     string;
  onAction:   (orderId: string, action: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const btn = (label: string, action: string, primary = false) => (
    <button key={action} onClick={() => onAction(orderId, action)}
      className={primary ? "ag-action-primary" : "ag-action-secondary"}
      style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        color: primary ? C.white : C.blueDark,
        background: primary ? C.blueDark : C.blueLight,
        border: primary ? "none" : `1px solid ${C.blueBorder}`,
        borderRadius: R.sm, padding: `${S[1]}px ${S[3]}px`, cursor: "pointer",
      }}>
      {label}
    </button>
  );

  const ghost = (label: string, action: string) => (
    <button key={action} onClick={() => onAction(orderId, action)}
      className="ag-action-ghost"
      style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
        background: "transparent", border: `1px solid ${C.line}`,
        borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
      }}>
      {label}
    </button>
  );

  const orderShape = { origin, status, sagOrderId };
  const showDelete = canDeleteDraftOrder(orderShape);
  const showEdit   = canEditDraftOrder(orderShape);

  const editBtn = showEdit ? (
    <button key="edit" onClick={() => onAction(orderId, "edit_draft")}
      className="ag-action-secondary"
      style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
        color: C.blueDark, background: C.blueLight,
        border: `1px solid ${C.blueBorder}`, borderRadius: R.sm,
        padding: `${S[1]}px ${S[3]}px`, cursor: "pointer",
      }}>
      Editar borrador
    </button>
  ) : null;

  const deleteBtn = showDelete && !confirmDelete ? (
    <button key="delete" onClick={() => setConfirmDelete(true)}
      style={{
        fontFamily: T.mono, fontSize: T.sz.xs, color: C.red,
        background: "transparent", border: `1px solid ${C.redBorder}`,
        borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
      }}>
      Eliminar borrador
    </button>
  ) : showDelete && confirmDelete ? (
    <span key="delete-confirm" style={{ display: "inline-flex", gap: S[1], alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.red }}>
        Este borrador sera eliminado. Esta accion no afecta SAG.
      </span>
      <button onClick={() => onAction(orderId, "delete_draft")}
        style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
          color: C.white, background: C.red, border: "none",
          borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
        }}>
        Confirmar
      </button>
      <button onClick={() => setConfirmDelete(false)}
        style={{
          fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkLight,
          background: "transparent", border: `1px solid ${C.line}`,
          borderRadius: R.sm, padding: `${S[1]}px ${S[2]}px`, cursor: "pointer",
        }}>
        No
      </button>
    </span>
  ) : null;

  switch (status) {
    case "borrador":
      return <>{btn("Enviar a revision", "submit", true)}{editBtn}{ghost("Cancelar", "cancel")}{deleteBtn}</>;
    case "listo_para_enviar":
      return <>{btn("Preparar para SAG", "mark_pending_sag", true)}{editBtn}{ghost("Volver a borrador", "return_to_draft")}{deleteBtn}</>;
    case "pendiente_sag":
      return <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.amber }}>Pendiente de confirmacion en SAG.</span>;
    case "sincronizado":
      return <span style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.green }}>
        Confirmado en SAG.{sagOrderId ? ` Pedido ${sagOrderId}` : ""}
      </span>;
    case "conflicto":
      return <>{ghost("Volver a borrador", "return_to_draft")}{ghost("Cancelar", "cancel")}</>;
    case "cancelado":
      return <>{deleteBtn}</>;
    default:
      return null;
  }
}

// ── Fulfillment visual maps ──────────────────────────────────────────────────

const FULFILLMENT_GRADE_LABEL: Record<OrderFulfillmentGrade, string> = {
  ready:   "Listo para despacho",
  partial: "Despacho parcial",
  blocked: "Despacho bloqueado",
  unknown: "Pendiente de validacion",
};

const FULFILLMENT_GRADE_COLOR: Record<OrderFulfillmentGrade, { bg: string; text: string }> = {
  ready:   { bg: C.greenLight, text: C.green },
  partial: { bg: C.amberLight, text: C.amber },
  blocked: { bg: C.redLight,   text: C.red },
  unknown: { bg: C.surface,    text: C.inkFaint },
};

const LINE_STATUS_LABEL: Record<LineFulfillmentStatus, string> = {
  available:          "Disponible",
  low_stock:          "Ultimas unidades",
  partial:            "Disponibilidad parcial",
  out_of_stock:       "Referencia agotada",
  inventory_unknown:  "Inventario no validado",
};

const LINE_STATUS_COLOR: Record<LineFulfillmentStatus, { bg: string; fg: string }> = {
  available:         { bg: C.greenLight, fg: C.green },
  low_stock:         { bg: C.amberLight, fg: C.amber },
  partial:           { bg: C.amberLight, fg: C.amber },
  out_of_stock:      { bg: C.redLight,   fg: C.red },
  inventory_unknown: { bg: C.surface,    fg: C.inkFaint },
};

// ── Fulfillment Strip (drawer header) ─────────────────────────────────────

function FulfillmentStrip({ fulfillment }: { fulfillment: OrderFulfillmentSummary }) {
  const gc = FULFILLMENT_GRADE_COLOR[fulfillment.status];
  return (
    <div style={{
      ...panel, padding: `${S[2]}px ${S[3]}px`, marginTop: S[3],
      borderLeft: `3px solid ${gc.text}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: S[1] }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink }}>
          Cumplimiento
        </div>
        <span style={{
          fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
          padding: "2px 6px", borderRadius: R.sm, background: gc.bg, color: gc.text,
        }}>
          {FULFILLMENT_GRADE_LABEL[fulfillment.status]}
        </span>
      </div>
      <div style={{ display: "flex", gap: S[3], fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkMid }}>
        <span>Disponibles: <b style={{ color: C.green }}>{fulfillment.availableLines}</b></span>
        {fulfillment.lowStockLines > 0 && <span>Stock bajo: <b style={{ color: C.amber }}>{fulfillment.lowStockLines}</b></span>}
        {fulfillment.partialLines > 0 && <span>Parciales: <b style={{ color: C.amber }}>{fulfillment.partialLines}</b></span>}
        {fulfillment.blockedLines > 0 && <span>Agotadas: <b style={{ color: C.red }}>{fulfillment.blockedLines}</b></span>}
        <span>Cobertura: <b style={{ color: fulfillment.completionPercent === 100 ? C.green : fulfillment.completionPercent >= 80 ? C.amber : C.red }}>{fulfillment.completionPercent}%</b></span>
      </div>
    </div>
  );
}

// ── Fulfillment Panel (tab) ─────────────────────────────────────────────────

const INVOICE_LABEL: Record<OrderFulfillmentStatus, string> = {
  sin_factura:               "Sin factura",
  facturado_completo:        "Facturado completo",
  facturado_parcial:         "Facturado parcial",
  facturado_con_diferencias: "Facturado con diferencias",
  cancelado:                 "Cancelado",
  pendiente_revision:        "Pendiente revision",
};

const INVOICE_COLOR: Record<OrderFulfillmentStatus, { bg: string; text: string }> = {
  sin_factura:               { bg: C.surface,    text: C.inkFaint },
  facturado_completo:        { bg: C.greenLight, text: C.green },
  facturado_parcial:         { bg: C.amberLight, text: C.amber },
  facturado_con_diferencias: { bg: C.redLight,   text: C.red },
  cancelado:                 { bg: C.surface,    text: C.inkFaint },
  pendiente_revision:        { bg: C.amberLight, text: C.amber },
};

function FulfillmentPanel({ order, fulfillment }: { order: OrderDraft; fulfillment: OrderFulfillmentSummary }) {
  const gc = FULFILLMENT_GRADE_COLOR[fulfillment.status];
  const ic = INVOICE_COLOR[order.fulfillmentStatus];
  const sorted = sortFulfillmentLines(fulfillment.lines);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {/* Inventory fulfillment summary */}
      <div style={{
        ...panel, padding: S[3],
        borderLeft: `3px solid ${gc.text}`,
      }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
          Cumplimiento del pedido
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2], marginBottom: S[2] }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Estado</div>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
              padding: "2px 6px", borderRadius: R.sm, background: gc.bg, color: gc.text,
            }}>
              {FULFILLMENT_GRADE_LABEL[fulfillment.status]}
            </span>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Cobertura</div>
            <div style={{
              fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold,
              color: fulfillment.completionPercent === 100 ? C.green : fulfillment.completionPercent >= 80 ? C.amber : C.red,
            }}>
              {fulfillment.completionPercent}%
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Lineas</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xl, fontWeight: T.wt.bold, color: C.ink }}>
              {fulfillment.totalLines}
            </div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: S[1] }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Disponibles</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.green }}>
              {fulfillment.availableLines || "\u2014"}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Stock bajo</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: fulfillment.lowStockLines > 0 ? C.amber : C.inkFaint }}>
              {fulfillment.lowStockLines || "\u2014"}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Parciales</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: fulfillment.partialLines > 0 ? C.amber : C.inkFaint }}>
              {fulfillment.partialLines || "\u2014"}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Agotadas</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: fulfillment.blockedLines > 0 ? C.red : C.inkFaint }}>
              {fulfillment.blockedLines || "\u2014"}
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Sin validar</div>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: fulfillment.unknownLines > 0 ? C.inkMid : C.inkFaint }}>
              {fulfillment.unknownLines || "\u2014"}
            </div>
          </div>
        </div>
      </div>

      {/* Line-by-line fulfillment — sorted by priority */}
      {sorted.length > 0 && (
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
            Detalle por referencia
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {sorted.map(line => {
              const lc = LINE_STATUS_COLOR[line.status];
              const isExpanded = expandedId === line.lineId;
              return (
                <div key={line.lineId} style={{ borderBottom: `1px solid ${C.line}` }}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : line.lineId)}
                    style={{
                      display: "flex", alignItems: "center", gap: S[2],
                      width: "100%", padding: `${S[2]}px 0`,
                      background: isExpanded ? C.surfaceAlt : "transparent",
                      border: "none", cursor: "pointer", textAlign: "left",
                    }}
                  >
                    <AvailabilityDot avail={line.availableQty} qty={line.requestedQty} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.medium, color: C.ink }}>
                        {line.referenceCode}
                      </div>
                      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
                        {line.size || "\u2014"} · {line.color || "\u2014"}
                      </div>
                    </div>
                    <span style={{
                      fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                      padding: "1px 4px", borderRadius: R.sm,
                      background: lc.bg, color: lc.fg, flexShrink: 0,
                    }}>
                      {LINE_STATUS_LABEL[line.status]}
                    </span>
                    <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid, minWidth: 56, textAlign: "right", flexShrink: 0 }}>
                      {line.availableQty !== null ? `${line.availableQty}/${line.requestedQty}` : `\u2014/${line.requestedQty}`}
                    </div>
                    <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint, width: 16, textAlign: "center", flexShrink: 0 }}>
                      {isExpanded ? "\u25B2" : "\u25BC"}
                    </span>
                  </button>

                  {isExpanded && (
                    <div style={{
                      padding: `${S[2]}px ${S[3]}px ${S[3]}px ${S[3]}px`,
                      background: C.surfaceAlt, borderTop: `1px solid ${C.line}`,
                    }}>
                      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: `${S[1]}px ${S[2]}px`, fontFamily: T.mono, fontSize: T.sz.xs }}>
                        <span style={{ color: C.inkFaint }}>Producto</span>
                        <span style={{ color: C.ink }}>{line.productName}</span>
                        <span style={{ color: C.inkFaint }}>Talla</span>
                        <span style={{ color: C.ink }}>{line.size || "\u2014"}</span>
                        <span style={{ color: C.inkFaint }}>Color</span>
                        <span style={{ color: C.ink }}>{line.color || "\u2014"}</span>
                        <span style={{ color: C.inkFaint }}>Solicitado</span>
                        <span style={{ color: C.ink, fontWeight: T.wt.semibold }}>{line.requestedQty} uds</span>
                        <span style={{ color: C.inkFaint }}>Disponible</span>
                        <span style={{ color: lc.fg, fontWeight: T.wt.semibold }}>
                          {line.availableQty !== null ? `${line.availableQty} uds` : "\u2014"}
                        </span>
                        {line.deficitQty > 0 && (
                          <>
                            <span style={{ color: C.inkFaint }}>Faltante</span>
                            <span style={{ color: C.red, fontWeight: T.wt.semibold }}>{line.deficitQty} uds</span>
                          </>
                        )}
                        <span style={{ color: C.inkFaint }}>Estado</span>
                        <span style={{ color: lc.fg, fontWeight: T.wt.semibold }}>
                          {LINE_STATUS_LABEL[line.status]}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invoice / SAG section */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
        <div style={{ ...panel, padding: S[3], textAlign: "center" }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Estado factura</div>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold,
            marginTop: S[1], display: "inline-block",
            padding: "2px 8px", borderRadius: R.sm, background: ic.bg, color: ic.text,
          }}>
            {INVOICE_LABEL[order.fulfillmentStatus]}
          </div>
        </div>
        <div style={{ ...panel, padding: S[3], textAlign: "center" }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>Numero SAG</div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
            {order.sagOrderId || "\u2014"}
          </div>
        </div>
      </div>

      {order.sagInvoiceIds.length > 0 && (
        <div style={{ ...panel, padding: S[3] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
            Facturas vinculadas
          </div>
          {order.sagInvoiceIds.map((invId, i) => (
            <div key={invId} style={{
              ...dataRow, fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid,
            }}>
              Factura {i + 1}: {invId}
            </div>
          ))}
        </div>
      )}

      {/* David fulfillment signal */}
      <DavidChip
        message={buildFulfillmentDavidMessage(fulfillment)}
        variant={fulfillment.status === "ready" ? "success" : fulfillment.status === "blocked" ? "warning" : "default"}
      />
    </div>
  );
}

// ── Variant Metrics Panel (PEDIDOS-VARIANT-ENRICHMENT-01) ────────────────────

function VariantMetricsPanel({
  metrics,
  loading,
}: {
  metrics: any;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div style={{ ...panel, padding: S[4], textAlign: "center" }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>Cargando metricas...</div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div style={{ ...panel, padding: S[4], textAlign: "center" }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>Sin datos de variantes</div>
      </div>
    );
  }

  const rankStyle = {
    fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
    width: 20, textAlign: "right" as const, flexShrink: 0,
  };
  const nameStyle = {
    fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
    flex: 1, overflow: "hidden" as const, textOverflow: "ellipsis" as const,
    whiteSpace: "nowrap" as const,
  };
  const valStyle = {
    fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold,
    color: C.ink, textAlign: "right" as const, width: 60, flexShrink: 0,
  };
  const ordStyle = {
    fontFamily: T.mono, fontSize: "9px", color: C.inkFaint,
    textAlign: "right" as const, width: 50, flexShrink: 0,
  };

  const renderRank = (title: string, items: Array<{ value: string; units: number; orders: number }>) => (
    <div style={{ ...panel, marginBottom: S[3] }}>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
        color: C.ink, padding: `${S[2]}px ${S[3]}px`,
        borderBottom: `1px solid ${C.line}`, background: C.surfaceAlt,
      }}>
        {title}
      </div>
      {items.length === 0 ? (
        <div style={{ padding: S[3], fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
          Sin datos
        </div>
      ) : items.map((item, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: S[2],
          padding: `${S[1]}px ${S[3]}px`,
          borderBottom: i < items.length - 1 ? `1px solid ${C.lineSubtle}` : "none",
        }}>
          <span style={rankStyle}>{i + 1}</span>
          <span style={nameStyle}>{item.value}</span>
          <span style={valStyle}>{Math.round(item.units).toLocaleString()}</span>
          <span style={ordStyle}>{item.orders} ped</span>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div style={{
        fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint,
        marginBottom: S[2],
      }}>
        Ultimos 30 dias
      </div>
      {renderRank("Top tallas vendidas", metrics.topSizes ?? [])}
      {renderRank("Top colores vendidos", metrics.topColors ?? [])}
      {renderRank("Top subgrupos vendidos", metrics.topSubgrupos ?? [])}
    </>
  );
}

// ── Demand Intelligence Panel (PEDIDOS-DEMANDA-PRODUCCION-01) ───────────────

function DemandIntelligencePanel({
  data,
  loading,
  refCode,
}: {
  data: any;
  loading: boolean;
  refCode?: string;
}) {
  if (loading) {
    return (
      <div style={{ ...panel, padding: S[4], textAlign: "center" }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>Cargando inteligencia de demanda...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ ...panel, padding: S[4], textAlign: "center" }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkMid }}>Sin datos de demanda</div>
      </div>
    );
  }

  const kpiCard = (label: string, value: string | number, sub?: string) => (
    <div style={{
      ...panel, padding: `${S[2]}px ${S[3]}px`, flex: 1, minWidth: 100,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, textTransform: "uppercase" as const }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color: C.ink }}>{value}</div>
      {sub && <div style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint }}>{sub}</div>}
    </div>
  );

  const coverageBadge = (status: string) => {
    const colors: Record<string, string> = {
      sin_stock: C.red, ruptura_inminente: C.amber, cobertura_baja: C.amber,
      cobertura_estable: C.green, cobertura_alta: C.green, sin_demanda: C.inkFaint,
    };
    const labels: Record<string, string> = {
      sin_stock: "Sin stock", ruptura_inminente: "Ruptura inminente",
      cobertura_baja: "Cobertura baja", cobertura_estable: "Estable",
      cobertura_alta: "Alta", sin_demanda: "Sin demanda",
    };
    return (
      <span style={{
        fontFamily: T.mono, fontSize: "9px", fontWeight: T.wt.semibold,
        color: colors[status] ?? C.inkMid,
      }}>
        {labels[status] ?? status}
      </span>
    );
  };

  // Find current order's ref in the snapshot
  const orderRef = refCode ? (data.entries as any[])?.find((e: any) => e.refCode === refCode) : null;

  return (
    <>
      {/* Summary KPIs */}
      <div style={{ display: "flex", gap: S[2], marginBottom: S[3], flexWrap: "wrap" }}>
        {kpiCard("Refs activos", data.totalRefs?.toLocaleString() ?? "\u2014")}
        {kpiCard("Con demanda", data.refsWithDemand?.toLocaleString() ?? "\u2014")}
        {kpiCard("Sin stock", data.refsInStockout ?? "\u2014", data.refsRuptureImminent ? `${data.refsRuptureImminent} ruptura` : undefined)}
        {kpiCard("Vel. diaria", `${data.avgDailyVelocity?.toLocaleString() ?? "\u2014"} uds`)}
      </div>

      {/* 30d summary strip */}
      <div style={{
        ...panel, padding: `${S[2]}px ${S[3]}px`, marginBottom: S[3],
        display: "flex", gap: S[4], flexWrap: "wrap",
      }}>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
          30d: <strong style={{ color: C.ink }}>{(data.totalUnits30d ?? 0).toLocaleString()}</strong> uds
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
          <strong style={{ color: C.ink }}>{(data.totalOrders30d ?? 0).toLocaleString()}</strong> pedidos
        </span>
        <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
          Stock total: <strong style={{ color: C.ink }}>{(data.totalStock ?? 0).toLocaleString()}</strong>
        </span>
      </div>

      {/* Current order ref context */}
      {orderRef && (
        <div style={{
          ...panel, marginBottom: S[3], background: C.surfaceAlt,
          borderLeft: `3px solid ${C.blueDark}`,
        }}>
          <div style={{
            padding: `${S[2]}px ${S[3]}px`,
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold, color: C.blueDark,
          }}>
            Ref del pedido: {orderRef.refCode}
          </div>
          <div style={{ padding: `0 ${S[3]}px ${S[2]}px`, display: "flex", gap: S[4], flexWrap: "wrap" }}>
            <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkMid }}>
              Stock: <strong>{orderRef.currentStock}</strong>
            </span>
            <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkMid }}>
              Vel: <strong>{orderRef.dailyVelocity}</strong> uds/dia
            </span>
            <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkMid }}>
              Cob: <strong>{orderRef.coverageDays ?? "\u2014"}</strong> dias
            </span>
            {coverageBadge(orderRef.coverageStatus)}
          </div>
        </div>
      )}

      {/* Top demand refs */}
      <div style={{ ...panel, marginBottom: S[3] }}>
        <div style={{
          fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
          color: C.ink, padding: `${S[2]}px ${S[3]}px`,
          borderBottom: `1px solid ${C.line}`, background: C.surfaceAlt,
        }}>
          Top refs por velocidad de demanda
        </div>
        {(data.entries as any[])?.slice(0, 10).map((e: any, i: number) => (
          <div key={e.refCode} style={{
            display: "flex", alignItems: "center", gap: S[2],
            padding: `${S[1]}px ${S[3]}px`,
            borderBottom: i < 9 ? `1px solid ${C.lineSubtle}` : "none",
            background: e.refCode === refCode ? `${C.blueDark}08` : "transparent",
          }}>
            <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, width: 18, textAlign: "right" }}>{i + 1}</span>
            <span style={{
              fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink,
              flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }} title={e.productName}>
              {e.refCode}
            </span>
            <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, width: 45, textAlign: "right" }}>
              {e.dailyVelocity} /d
            </span>
            <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.inkFaint, width: 40, textAlign: "right" }}>
              stk {e.currentStock}
            </span>
            <span style={{ width: 65 }}>{coverageBadge(e.coverageStatus)}</span>
          </div>
        ))}
      </div>

      {/* Critical stockouts */}
      {(data.refsInStockout ?? 0) > 0 && (
        <div style={{ ...panel }}>
          <div style={{
            fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.bold,
            color: C.red, padding: `${S[2]}px ${S[3]}px`,
            borderBottom: `1px solid ${C.line}`, background: C.redLight,
          }}>
            Stockouts con demanda activa ({data.refsInStockout})
          </div>
          {(data.entries as any[])
            ?.filter((e: any) => e.coverageStatus === "sin_stock" && e.dailyVelocity > 0)
            .slice(0, 8)
            .map((e: any, i: number) => (
              <div key={e.refCode} style={{
                display: "flex", alignItems: "center", gap: S[2],
                padding: `${S[1]}px ${S[3]}px`,
                borderBottom: `1px solid ${C.lineSubtle}`,
              }}>
                <span style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.ink, flex: 1 }} title={e.productName}>
                  {e.refCode}
                </span>
                <span style={{ fontFamily: T.mono, fontSize: "9px", color: C.red }}>
                  {e.dailyVelocity} uds/dia sin stock
                </span>
              </div>
            ))}
        </div>
      )}
    </>
  );
}

// ── Customer History Panel ──────────────────────────────────────────────────

function CustomerHistoryPanel({
  history,
  loading,
}: {
  history: CustomerOrderHistory | null;
  loading: boolean;
}) {
  if (loading) {
    return <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, textAlign: "center", padding: S[6] }}>
      Cargando historial del cliente...
    </div>;
  }

  if (!history || history.totalOrders === 0) {
    return <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, textAlign: "center", padding: S[6] }}>
      Sin historial registrado para este cliente.
    </div>;
  }

  const { preferences: prefs } = history;

  // Commercial intelligence metrics
  const avgTicket = history.totalOrders > 0 ? Math.round(history.totalValue / history.totalOrders) : 0;
  const daysSinceLastOrder = history.lastOrderDate
    ? Math.floor((Date.now() - new Date(history.lastOrderDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2] }}>
        <MiniStat label="Pedidos" value={String(history.totalOrders)} color={C.ink} />
        <MiniStat label="Unidades" value={history.totalUnits > 0 ? String(history.totalUnits) : "\u2014"} color={C.ink} />
        <MiniStat label="Valor total" value={`$${history.totalValue.toLocaleString()}`} color={C.green} />
      </div>

      {/* Commercial intelligence strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: S[2] }}>
        <MiniStat label="Ticket promedio" value={avgTicket > 0 ? `$${avgTicket.toLocaleString()}` : "\u2014"} color={C.blueDark} />
        <MiniStat label="Primer pedido" value={history.firstOrderDate ? formatDateShort(history.firstOrderDate) : "\u2014"} color={C.inkMid} />
        <MiniStat label="Dias sin comprar" value={daysSinceLastOrder !== null ? String(daysSinceLastOrder) : "\u2014"} color={daysSinceLastOrder !== null && daysSinceLastOrder > 60 ? C.red : C.inkMid} />
      </div>

      {prefs.topReferences.length > 0 && (
        <div style={{ ...panel, padding: S[3] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
            Referencias frecuentes
          </div>
          <div style={{ display: "flex", gap: S[1], flexWrap: "wrap" }}>
            {prefs.topReferences.slice(0, 8).map(r => (
              <span key={r.value} style={{
                fontFamily: T.mono, fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                padding: "2px 6px", borderRadius: R.sm,
                background: C.blueLight, color: C.blueDark, border: `1px solid ${C.blueBorder}`,
              }}>
                {r.value} ({r.count}x)
              </span>
            ))}
          </div>
        </div>
      )}

      {(prefs.topSizes.length > 0 || prefs.topColors.length > 0) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
          {prefs.topSizes.length > 0 && (
            <div style={{ ...panel, padding: S[3] }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[1] }}>
                Tallas frecuentes
              </div>
              {prefs.topSizes.slice(0, 5).map(s => (
                <div key={s.value} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                  {s.value} — {s.count}x
                </div>
              ))}
            </div>
          )}
          {prefs.topColors.length > 0 && (
            <div style={{ ...panel, padding: S[3] }}>
              <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[1] }}>
                Colores frecuentes
              </div>
              {prefs.topColors.slice(0, 5).map(c => (
                <div key={c.value} style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkMid }}>
                  {c.value} — {c.count}x
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ ...panel, padding: S[3] }}>
        <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
          Ultimos pedidos
        </div>
        {history.orders.slice(0, 10).map(o => (
          <div key={o.orderId} style={{
            ...dataRow, fontFamily: T.mono, fontSize: T.sz.xs,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ color: C.ink }}>#{o.consecutivo} · {o.sellerName}</span>
            <span style={{ color: C.inkMid }}>{o.totalUnits} uds · ${o.totalValue.toLocaleString()}</span>
            <span style={{ fontSize: T.sz["2xs"], color: C.inkFaint }}>{formatTimeAgo(o.date)}</span>
          </div>
        ))}
      </div>

      {prefs.oneTimeBuys.length > 0 && (
        <div style={{ ...panel, padding: S[3], background: C.surface }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.inkMid, marginBottom: S[1] }}>
            Comprados 1 sola vez (oportunidad de recompra)
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, color: C.inkFaint }}>
            {prefs.oneTimeBuys.slice(0, 10).join(", ")}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Seller Performance Panel (PEDIDOS-VENDEDOR-PERFORMANCE-01) ────────────

function SellerPerformancePanel({
  performance,
  loading,
}: {
  performance: SellerPerformance | null;
  loading: boolean;
}) {
  if (loading) {
    return <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkFaint, textAlign: "center", padding: S[6] }}>
      Cargando desempe\u00f1o del vendedor...
    </div>;
  }

  if (!performance || performance.kpis.totalOrders === 0) {
    return <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, color: C.inkLight, textAlign: "center", padding: S[6] }}>
      Informaci\u00f3n de desempe\u00f1o en construcci\u00f3n. Los datos se calculan con pedidos SAG que tengan vendedor asignado.
    </div>;
  }

  const { kpis, recentOrders, topClients, topSubgrupos, topSizes, topColors, alerts } = performance;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: S[3] }}>
      {/* Seller identity */}
      <div style={{ ...panel, padding: S[3], display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.sm, fontWeight: T.wt.bold, color: C.ink }}>
            {performance.sellerName}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>
            {performance.source === "sag_movimientos" ? "Fuente: SAG" : performance.source === "crm_quote_history" ? "Fuente: CRM" : "Fuente: desconocida"}
            {performance.sellerCode ? ` \u00b7 C\u00f3digo: ${performance.sellerCode}` : ""}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: S[2] }}>
        <MiniStat label="Pedidos" value={String(kpis.totalOrders)} color={C.ink} />
        <MiniStat label="Unidades" value={kpis.totalUnits > 0 ? kpis.totalUnits.toLocaleString() : "\u2014"} color={C.ink} />
        <MiniStat label="Valor total" value={kpis.totalValue > 0 ? `$${kpis.totalValue.toLocaleString()}` : "\u2014"} color={C.green} />
        <MiniStat label="Clientes" value={String(kpis.totalCustomers)} color={C.blueDark} />
        <MiniStat label="Ticket promedio" value={kpis.avgTicket > 0 ? `$${kpis.avgTicket.toLocaleString()}` : "\u2014"} color={C.inkMid} />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div style={{ ...panel, padding: S[3] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
            Alertas
          </div>
          {alerts.map((a, i) => (
            <div key={i} style={{
              ...dataRow, fontFamily: T.mono, fontSize: T.sz.xs,
              display: "flex", alignItems: "center", gap: S[2],
            }}>
              <span style={{
                fontSize: T.sz["2xs"], fontWeight: T.wt.semibold,
                padding: "1px 6px", borderRadius: R.sm,
                background: a.type === "stockout" ? `${C.red}14` : a.type === "inactive_client" ? `${C.amber}14` : C.surfaceAlt,
                color: a.type === "stockout" ? C.red : a.type === "inactive_client" ? C.amber : C.inkMid,
              }}>
                {a.type === "stockout" ? "Sin stock" : a.type === "inactive_client" ? "Inactivo" : a.type}
              </span>
              <span style={{ color: C.ink }}>{a.label}</span>
              <span style={{ color: C.inkFaint, marginLeft: "auto" }}>{a.detail}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recent orders */}
      {recentOrders.length > 0 && (
        <div style={{ ...panel, padding: S[3] }}>
          <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
            \u00daltimos pedidos
          </div>
          {recentOrders.map((o, i) => (
            <div key={i} style={{
              ...dataRow, fontFamily: T.mono, fontSize: T.sz.xs,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ color: C.ink }}>#{o.consecutivo} \u00b7 {o.customerName}</span>
              <span style={{ color: C.inkMid }}>
                {o.totalUnits > 0 ? `${o.totalUnits} uds` : ""} \u00b7 ${o.totalValue.toLocaleString()}
              </span>
              <span style={{ color: C.inkFaint, fontSize: T.sz["2xs"] }}>
                {formatDateShort(o.orderDate)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Top clients + Top subgrupos side-by-side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
        {topClients.length > 0 && (
          <div style={{ ...panel, padding: S[3] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
              Top clientes
            </div>
            {topClients.map((c, i) => (
              <div key={i} style={{ ...dataRow, fontFamily: T.mono, fontSize: T.sz.xs, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.ink }}>{c.customerName}</span>
                <span style={{ color: C.inkMid }}>{c.orders} ped \u00b7 ${c.totalValue.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}

        {topSubgrupos.length > 0 && (
          <div style={{ ...panel, padding: S[3] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
              Top subgrupos
            </div>
            {topSubgrupos.map((s, i) => (
              <div key={i} style={{ ...dataRow, fontFamily: T.mono, fontSize: T.sz.xs, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.ink }}>{s.label}</span>
                <span style={{ color: C.inkMid }}>{s.units} uds \u00b7 {s.pct}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top sizes + Top colors side-by-side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: S[2] }}>
        {topSizes.length > 0 && (
          <div style={{ ...panel, padding: S[3] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
              Top tallas
            </div>
            {topSizes.map((s, i) => (
              <div key={i} style={{ ...dataRow, fontFamily: T.mono, fontSize: T.sz.xs, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.ink }}>{s.label}</span>
                <span style={{ color: C.inkMid }}>{s.units} uds \u00b7 {s.pct}%</span>
              </div>
            ))}
          </div>
        )}

        {topColors.length > 0 && (
          <div style={{ ...panel, padding: S[3] }}>
            <div style={{ fontFamily: T.mono, fontSize: T.sz.xs, fontWeight: T.wt.semibold, color: C.ink, marginBottom: S[2] }}>
              Top colores
            </div>
            {topColors.map((c, i) => (
              <div key={i} style={{ ...dataRow, fontFamily: T.mono, fontSize: T.sz.xs, display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.ink }}>{c.label}</span>
                <span style={{ color: C.inkMid }}>{c.units} uds \u00b7 {c.pct}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Shared helpers ──────────────────────────────────────────────────────────

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz["2xs"], color: C.inkFaint }}>{label}</div>
      <div style={{ fontFamily: T.mono, fontSize: T.sz.lg, fontWeight: T.wt.bold, color }}>{value}</div>
    </div>
  );
}

function formatDateShort(iso: string): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatTimeAgo(iso: string): string {
  if (!iso) return "\u2014";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}
