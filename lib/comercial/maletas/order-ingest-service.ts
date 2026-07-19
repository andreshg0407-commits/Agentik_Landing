/**
 * lib/comercial/maletas/order-ingest-service.ts
 *
 * Order Ingest Service — processes an incoming order line and propagates
 * the sold quantity into the vendor's active commercial bag.
 *
 * Flow:
 *   1. Locate the vendor's active bag (status = "activa")
 *   2. Locate the reference item within that bag
 *   3. Deduct qtySold → recalculate availableToSellQty
 *   4. Write audit record (VendorBagOrderLine)
 *   5. If pressure triggered → emit CommercialOperationalEvent (David signal)
 *   6. If 2+ vendors low on same ref → emit CommercialProductionSignal
 *
 * Core invariant (enforced here + in repository):
 *   availableToSellQty = assignedQty - soldQty
 *
 * Does NOT touch: SAG adapter, Prisma schema migrations, UI layer.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-BLOCK-01-PERSISTENCE-ORDERS-01
 */

import { prisma }                         from "@/lib/prisma";
import {
  applyOrderLine,
  getActiveBagItemsByReference,
}                                          from "./vendor-bag-repository";

// ─── Input / output types ─────────────────────────────────────────────────────

export interface OrderLineInput {
  /** Internal sales rep identifier (e.g. "DAVID", "NESTOR") */
  salesRepId:  string;
  /** SAG reference code — will be uppercased */
  reference:   string;
  /** Units sold / consumed */
  qtySold:     number;
  /** External pedido / order identifier for audit */
  orderRef?:   string;
  /** Defaults to now() if not provided */
  soldAt?:     Date;
}

export interface OrderLineResult {
  ok:                 boolean;
  bagId:              string | null;
  itemId:             string | null;
  salesRepId:         string;
  reference:          string;
  availableAfterQty:  number | null;
  status:             string | null;
  triggeredPressure:  boolean;
  pressureType:       "agotado" | "bajo_minimo" | null;
  eventsEmitted:      string[];
  error?:             string;
}

// ─── Main ingest function ─────────────────────────────────────────────────────

export async function ingestOrderLine(
  organizationId: string,
  input:          OrderLineInput,
): Promise<OrderLineResult> {
  const reference = input.reference.toUpperCase();
  const soldAt    = input.soldAt ?? new Date();
  const result: OrderLineResult = {
    ok: false,
    bagId: null,
    itemId: null,
    salesRepId: input.salesRepId,
    reference,
    availableAfterQty: null,
    status: null,
    triggeredPressure: false,
    pressureType: null,
    eventsEmitted: [],
  };

  // 1. Find the vendor's active bag
  const bag = await prisma.vendorCommercialBag.findFirst({
    where: {
      organizationId,
      salesRepId: input.salesRepId,
      status:     "activa",
    },
  });

  if (!bag) {
    result.error = `No active bag found for salesRepId=${input.salesRepId}`;
    return result;
  }
  result.bagId = bag.id;

  // 2. Find the item in that bag
  const item = await prisma.vendorBagItem.findFirst({
    where: {
      bagId:          bag.id,
      organizationId,
      reference,
      status:         { not: "pausado" },
    },
  });

  if (!item) {
    result.error = `Reference ${reference} not found in bag ${bag.id}`;
    return result;
  }
  result.itemId = item.id;

  // 3. Apply the order line (deduct + write audit)
  const applied = await applyOrderLine(
    organizationId,
    item.id,
    input.qtySold,
    input.orderRef ?? null,
    soldAt,
  );

  if (!applied) {
    result.error = "Failed to apply order line (item may be paused)";
    return result;
  }

  result.ok                = true;
  result.availableAfterQty = applied.item.availableToSellQty;
  result.status            = applied.item.status;
  result.triggeredPressure = applied.triggeredPressure;
  result.pressureType      = applied.pressureType;

  // 4. Emit CommercialOperationalEvent if pressure was triggered
  if (applied.triggeredPressure && applied.pressureType) {
    const isDepletion = applied.pressureType === "agotado";

    const eventType = isDepletion ? "ruptura_inminente" : "vendedor_en_presion";
    const severity  = isDepletion ? "critical" : "warning";
    const title     = isDepletion
      ? `${reference} agotado para ${input.salesRepId}`
      : `${reference} bajo mínimo para ${input.salesRepId}`;
    const body = isDepletion
      ? `La referencia ${reference} se agotó en la maleta de ${input.salesRepId}. Disponible: 0 uds. Considera traslado interno o producción urgente.`
      : `La referencia ${reference} bajó del mínimo configurado en la maleta de ${input.salesRepId}. Disponible: ${applied.item.availableToSellQty} uds.`;

    await prisma.commercialOperationalEvent.create({
      data: {
        organizationId,
        type:      eventType,
        severity,
        title,
        body,
        refCode:   reference,
        salesRepId: input.salesRepId,
        evidence: {
          availableAfterQty:  applied.item.availableToSellQty,
          minQty:             applied.item.minQty,
          assignedQty:        applied.item.assignedQty,
          soldQty:            applied.item.soldQty,
          qtySoldThisOrder:   input.qtySold,
          orderRef:           input.orderRef ?? null,
          bagId:              bag.id,
          itemId:             item.id,
          source:             "bag_order_ingest",
        },
        dispatched: false,
      },
    });

    result.eventsEmitted.push(`commercial_operational_event:${eventType}`);
  }

  // 5. Check multi-vendor pressure → CommercialProductionSignal
  if (applied.triggeredPressure) {
    await maybeEmitProductionSignal(organizationId, reference, result.eventsEmitted);
  }

  return result;
}

// ─── Multi-vendor production signal ──────────────────────────────────────────

async function maybeEmitProductionSignal(
  organizationId:  string,
  reference:       string,
  emittedEvents:   string[],
): Promise<void> {
  const activeItems = await getActiveBagItemsByReference(organizationId, reference);

  const lowItems = activeItems.filter(
    i => i.status === "bajo_minimo" || i.status === "agotado",
  );

  // Only signal when 2+ vendors are affected
  if (lowItems.length < 2) return;

  const depletedCount      = lowItems.filter(i => i.status === "agotado").length;
  const urgency            = depletedCount >= 2 ? "urgente" : depletedCount === 1 ? "alta" : "importante";
  const affectedSalesRepIds = [...new Set(lowItems.map(i => i.bag.salesRepId))];
  const totalMissing       = lowItems.reduce(
    (s, i) => s + Math.max(0, i.idealQty - i.availableToSellQty),
    0,
  );
  const suggestedQty       = Math.max(totalMissing, lowItems[0].idealQty ?? 1);
  const firstItem          = lowItems[0];

  await prisma.commercialProductionSignal.create({
    data: {
      organizationId,
      reference:            firstItem.reference,
      description:          firstItem.description,
      line:                 firstItem.line,
      urgency,
      priority:             depletedCount,
      totalMissing,
      suggestedQty,
      affectedSalesRepCount: affectedSalesRepIds.length,
      affectedSalesRepIds:  affectedSalesRepIds,
      reasoning:            `${lowItems.length} vendedores con ${reference} bajo mínimo o agotado. Señal generada por ingesta de pedido.`,
      snapshotAt:           new Date(),
    },
  });

  emittedEvents.push(`commercial_production_signal:${reference}`);
}

// ─── Batch ingest (multiple order lines in one call) ─────────────────────────

export interface BatchIngestResult {
  processed: number;
  succeeded: number;
  failed:    number;
  results:   OrderLineResult[];
}

export async function ingestOrderLineBatch(
  organizationId: string,
  lines:          OrderLineInput[],
): Promise<BatchIngestResult> {
  const results = await Promise.all(
    lines.map(line => ingestOrderLine(organizationId, line)),
  );

  return {
    processed: results.length,
    succeeded: results.filter(r => r.ok).length,
    failed:    results.filter(r => !r.ok).length,
    results,
  };
}
