/**
 * commercial-operational-events.ts
 *
 * COMERCIAL-OPERATIONAL-INTEGRATION-01
 * Generates real Business Events from Castillitos commercial signals and data.
 *
 * Every event carries trace and correlation. No event without traceability.
 *
 * No React. No UI. Server-side event generation.
 */

import type { BusinessSignal } from "@/lib/business-signals";
import type { BusinessEvent } from "@/lib/business-events";
import {
  buildEvent,
  buildEventPayload,
  buildEventCorrelation,
  buildEventTrace,
  createCorrelationId,
} from "@/lib/business-events";

import type { ReferenceInventorySnapshot } from "./commercial-operational-entities";
import type { AffectedOrder, AffectedVendor, RelatedProduction } from "./commercial-operational-types";

// -- Event Generators --------------------------------------------------------

/** Generate events from signals and data for a single reference. */
export function generateReferenceEvents(
  orgId: string,
  inv: ReferenceInventorySnapshot,
  signals: BusinessSignal[],
  orders: AffectedOrder[],
  vendors: AffectedVendor[],
  production: RelatedProduction[],
): BusinessEvent[] {
  const events: BusinessEvent[] = [];
  const ref = inv.reference;
  const entity = {
    entityId: ref,
    entityType: "product" as const,
    label: inv.productName ?? ref,
  };

  // Shared correlation for this reference's event chain
  const correlationId = createCorrelationId();
  const signalIds = signals.map(s => s.signalId);

  // -- inventory_out_of_stock_detected --------------------------------------
  if (inv.totalAvailable === 0) {
    const rootEvent = buildEvent({
      organizationId: orgId,
      eventType: "inventory_out_of_stock_detected",
      category: "inventory",
      source: "signal_engine",
      entity,
      severity: "critical",
      priority: orders.length > 0 ? "highest" : "high",
      confidence: 100,
      payload: buildEventPayload({
        summary: `Referencia ${ref} agotada en todas las bodegas`,
        after: { inventory: 0, warehouses: inv.warehouses.length },
        metrics: [
          { key: "inventory_available", value: 0, unit: "unidades", previousValue: null },
          { key: "warehouses_checked", value: inv.warehouses.length, unit: "count", previousValue: null },
        ],
      }),
      correlation: buildEventCorrelation({
        correlationId,
        relatedSignalIds: signalIds,
        relatedEntityIds: [ref],
      }),
      trace: buildEventTrace({
        origin: `Inventario SAG: referencia ${ref} = 0`,
        sourceObservationIds: signalIds,
        createdBy: "commercial_operational_pipeline",
      }),
    });
    events.push(rootEvent);

    // -- commercial_order_blocked (correlated) --------------------------------
    if (orders.length > 0) {
      events.push(buildEvent({
        organizationId: orgId,
        eventType: "commercial_order_blocked",
        category: "commercial",
        source: "signal_engine",
        entity,
        severity: "high",
        priority: "high",
        confidence: 90,
        relatedEntities: orders.slice(0, 5).map(o => ({
          entityId: o.orderId,
          entityType: "order" as const,
          label: o.customerName ?? o.orderId,
        })),
        payload: buildEventPayload({
          summary: `${orders.length} pedido(s) bloqueado(s) por agotamiento de ${ref}`,
          metrics: [
            { key: "affected_orders", value: orders.length, unit: "pedidos", previousValue: null },
            { key: "affected_amount", value: orders.reduce((s, o) => s + o.amount, 0), unit: "COP", previousValue: null },
          ],
        }),
        correlation: buildEventCorrelation({
          correlationId,
          causationId: rootEvent.eventId,
          rootEventId: rootEvent.eventId,
          relatedSignalIds: signalIds,
          relatedEventIds: [rootEvent.eventId],
          relatedEntityIds: [ref, ...orders.map(o => o.orderId)],
        }),
        trace: buildEventTrace({
          origin: `Pedidos con referencia agotada ${ref}`,
          sourceObservationIds: signalIds,
          createdBy: "commercial_operational_pipeline",
        }),
      }));
    }

    // -- vendor_portfolio_reference_out_of_stock (correlated) -----------------
    for (const v of vendors.slice(0, 5)) {
      events.push(buildEvent({
        organizationId: orgId,
        eventType: "vendor_portfolio_reference_out_of_stock",
        category: "vendor",
        source: "signal_engine",
        entity: { entityId: v.vendorId, entityType: "vendor" as const, label: v.vendorName },
        severity: "medium",
        relatedEntities: [entity],
        payload: buildEventPayload({
          summary: `Vendedor ${v.vendorName}: referencia ${ref} agotada en maleta`,
          metadata: {
            reference: ref,
            assignedQty: v.assignedQty,
            availableQty: v.availableQty,
          },
        }),
        correlation: buildEventCorrelation({
          correlationId,
          causationId: rootEvent.eventId,
          rootEventId: rootEvent.eventId,
          relatedSignalIds: signalIds,
          relatedEntityIds: [ref, v.vendorId],
        }),
        trace: buildEventTrace({
          origin: `Maleta de ${v.vendorName} contiene referencia agotada ${ref}`,
          createdBy: "commercial_operational_pipeline",
        }),
      }));
    }
  }

  // -- inventory_stock_critical_detected ------------------------------------
  if (inv.totalAvailable > 0 && inv.totalAvailable <= 10) {
    events.push(buildEvent({
      organizationId: orgId,
      eventType: "inventory_stock_critical_detected",
      category: "inventory",
      source: "signal_engine",
      entity,
      severity: "high",
      confidence: 100,
      payload: buildEventPayload({
        summary: `Stock critico: ${ref} tiene ${inv.totalAvailable} unidades`,
        after: { inventory: inv.totalAvailable },
        metrics: [
          { key: "inventory_available", value: inv.totalAvailable, unit: "unidades", previousValue: null },
        ],
      }),
      correlation: buildEventCorrelation({
        correlationId,
        relatedSignalIds: signalIds,
        relatedEntityIds: [ref],
      }),
      trace: buildEventTrace({
        origin: `Inventario SAG: referencia ${ref} = ${inv.totalAvailable}`,
        createdBy: "commercial_operational_pipeline",
      }),
    }));
  }

  // -- production_order_created (for open OPs) ------------------------------
  const openOPs = production.filter(op => !op.isClosed);
  for (const op of openOPs.slice(0, 3)) {
    events.push(buildEvent({
      organizationId: orgId,
      eventType: "production_order_created",
      category: "production",
      source: "sync_engine",
      entity: {
        entityId: op.opId,
        entityType: "production_order" as const,
        label: op.documentNumber ?? op.opId,
      },
      severity: "info",
      relatedEntities: [entity],
      payload: buildEventPayload({
        summary: `OP ${op.documentNumber ?? op.opId}: ${op.quantityOrdered} unidades de ${ref}`,
        metadata: {
          reference: ref,
          quantityOrdered: op.quantityOrdered,
          documentDate: op.documentDate,
        },
      }),
      correlation: buildEventCorrelation({
        correlationId,
        relatedSignalIds: signalIds,
        relatedEntityIds: [ref, op.opId],
      }),
      trace: buildEventTrace({
        origin: `OP ${op.documentNumber ?? op.opId} para referencia ${ref}`,
        createdBy: "commercial_operational_pipeline",
      }),
    }));
  }

  return events;
}
