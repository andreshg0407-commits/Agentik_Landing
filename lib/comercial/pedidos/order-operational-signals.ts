/**
 * lib/comercial/pedidos/order-operational-signals.ts
 *
 * Generates traceable operational signals from an order.
 * Signals are consumed by: inventario, produccion, tiendas, finanzas.
 *
 * V1: Signal generation only — no actions executed.
 * V2: Signals will feed into operational queues.
 *
 * No Prisma — pure domain logic, runs on client and server.
 *
 * Sprint: COMERCIAL-PEDIDOS-CORE-ARCHITECTURE-04
 */

import type { OrderDraft, OrderLine } from "./order-types";
import type { OrderOperationalSignal, OrderSignalTarget } from "./order-core-types";

// ── Build all operational signals for an order ───────────────────────────────

export function buildOrderOperationalSignals(order: OrderDraft): OrderOperationalSignal[] {
  const signals: OrderOperationalSignal[] = [];

  signals.push(...buildInventorySignals(order));
  signals.push(...buildProductionSignals(order));
  signals.push(...buildStoreTransferSignals(order));
  signals.push(...buildFinanceSignals(order));

  return signals;
}

// ── Inventory signals ────────────────────────────────────────────────────────

export function buildInventorySignals(order: OrderDraft): OrderOperationalSignal[] {
  const signals: OrderOperationalSignal[] = [];
  const activeLines = order.lines.filter(l => !l.removed);
  const now = new Date().toISOString();

  for (const line of activeLines) {
    if (line.availableUnits === null) {
      signals.push(makeSignal(order.id, "inventario", "warning",
        `Ref ${line.referenceCode} (${line.size}/${line.color}): disponibilidad no sincronizada.`,
        { referenceCode: line.referenceCode, size: line.size, color: line.color, quantity: line.quantity },
        now,
      ));
    } else if (line.quantity > line.availableUnits) {
      const deficit = line.quantity - line.availableUnits;
      signals.push(makeSignal(order.id, "inventario", "action_required",
        `Ref ${line.referenceCode} (${line.size}/${line.color}): faltan ${deficit} uds. Disponible: ${line.availableUnits}, pedido: ${line.quantity}.`,
        {
          referenceCode: line.referenceCode, size: line.size, color: line.color,
          quantity: line.quantity, available: line.availableUnits, deficit,
        },
        now,
      ));
    }
  }

  return signals;
}

// ── Production signals ───────────────────────────────────────────────────────

export function buildProductionSignals(order: OrderDraft): OrderOperationalSignal[] {
  const signals: OrderOperationalSignal[] = [];
  const activeLines = order.lines.filter(l => !l.removed);
  const now = new Date().toISOString();

  // Only generate production signals for lines with confirmed inventory deficit
  const deficitLines = activeLines.filter(
    l => l.availableUnits !== null && l.quantity > l.availableUnits
  );

  if (deficitLines.length > 0) {
    const totalDeficit = deficitLines.reduce(
      (a, l) => a + (l.quantity - (l.availableUnits as number)),
      0,
    );

    signals.push(makeSignal(order.id, "produccion", "action_required",
      `Pedido #${order.consecutivo} requiere produccion: ${deficitLines.length} ${deficitLines.length === 1 ? "referencia" : "referencias"} con deficit total de ${totalDeficit} uds.`,
      {
        consecutivo: order.consecutivo,
        deficitLines: deficitLines.map(l => ({
          referenceCode: l.referenceCode,
          size:          l.size,
          color:         l.color,
          deficit:       l.quantity - (l.availableUnits as number),
        })),
        totalDeficit,
      },
      now,
    ));
  }

  return signals;
}

// ── Store transfer signals ───────────────────────────────────────────────────

export function buildStoreTransferSignals(order: OrderDraft): OrderOperationalSignal[] {
  const signals: OrderOperationalSignal[] = [];
  const activeLines = order.lines.filter(l => !l.removed);
  const now = new Date().toISOString();

  // Only suggest transfers when there's a deficit and a source warehouse
  if (!order.sourceWarehouseCode) return signals;

  const deficitLines = activeLines.filter(
    l => l.availableUnits !== null && l.quantity > l.availableUnits
  );

  if (deficitLines.length > 0) {
    signals.push(makeSignal(order.id, "tiendas", "info",
      `Pedido #${order.consecutivo}: ${deficitLines.length} ${deficitLines.length === 1 ? "referencia necesita" : "referencias necesitan"} transferencia desde otra bodega.`,
      {
        consecutivo:     order.consecutivo,
        sourceWarehouse: order.sourceWarehouseCode,
        deficitRefs:     deficitLines.map(l => l.referenceCode),
      },
      now,
    ));
  }

  return signals;
}

// ── Finance signals ──────────────────────────────────────────────────────────

export function buildFinanceSignals(order: OrderDraft): OrderOperationalSignal[] {
  const signals: OrderOperationalSignal[] = [];
  const now = new Date().toISOString();

  // Signal when order is submitted — finance should expect future invoice
  if (order.status === "listo_para_enviar" || order.status === "pendiente_sag") {
    signals.push(makeSignal(order.id, "finanzas", "info",
      `Pedido #${order.consecutivo} por $${order.summary.totalValue.toLocaleString()} enviado a SAG. Factura esperada.`,
      {
        consecutivo: order.consecutivo,
        customerCode: order.header.customerCode,
        totalValue:   order.summary.totalValue,
        status:       order.status,
      },
      now,
    ));
  }

  // Signal on fulfillment differences
  if (order.fulfillmentStatus === "facturado_con_diferencias") {
    signals.push(makeSignal(order.id, "finanzas", "warning",
      `Pedido #${order.consecutivo}: la factura tiene diferencias frente al pedido. Verificar valores.`,
      {
        consecutivo:      order.consecutivo,
        fulfillmentStatus: order.fulfillmentStatus,
        fulfillmentPercent: order.fulfillmentPercent,
      },
      now,
    ));
  }

  if (order.fulfillmentStatus === "facturado_parcial") {
    signals.push(makeSignal(order.id, "facturacion", "info",
      `Pedido #${order.consecutivo}: ${order.fulfillmentPercent}% facturado. Pendiente el resto.`,
      {
        consecutivo:        order.consecutivo,
        fulfillmentPercent: order.fulfillmentPercent,
      },
      now,
    ));
  }

  return signals;
}

// ── Internal helper ──────────────────────────────────────────────────────────

function makeSignal(
  orderId:   string,
  target:    OrderSignalTarget,
  severity:  OrderOperationalSignal["severity"],
  message:   string,
  data:      Record<string, unknown>,
  createdAt: string,
): OrderOperationalSignal {
  return { orderId, target, severity, message, data, createdAt };
}
