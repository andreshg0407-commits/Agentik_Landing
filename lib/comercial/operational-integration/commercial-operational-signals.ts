/**
 * commercial-operational-signals.ts
 *
 * COMERCIAL-OPERATIONAL-INTEGRATION-01
 * Generates real Business Signals from Castillitos commercial data.
 *
 * Every signal carries evidence and context. No signal without evidence.
 *
 * No React. No UI. Server-side signal generation.
 */

import type { BusinessSignal } from "@/lib/business-signals";
import {
  buildSignal,
  buildSignalEvidence,
  buildSignalEvidenceItem,
  buildSignalContext,
} from "@/lib/business-signals";

import type {
  AffectedOrder,
  AffectedVendor,
  AffectedPortfolio,
  RelatedProduction,
} from "./commercial-operational-types";
import type { ReferenceInventorySnapshot } from "./commercial-operational-entities";

// -- Signal Generators -------------------------------------------------------

/** Generate signals for a reference based on its operational state. */
export function generateReferenceSignals(
  orgId: string,
  inv: ReferenceInventorySnapshot,
  orders: AffectedOrder[],
  vendors: AffectedVendor[],
  portfolios: AffectedPortfolio[],
  production: RelatedProduction[],
  criticalThreshold: number,
): BusinessSignal[] {
  const signals: BusinessSignal[] = [];
  const ref = inv.reference;
  const entity = {
    entityId: ref,
    entityType: "product" as const,
    label: inv.productName ?? ref,
  };

  // -- inventory_out_of_stock -----------------------------------------------
  if (inv.totalAvailable === 0) {
    signals.push(buildSignal({
      organizationId: orgId,
      entityId: ref,
      entityType: "product",
      category: "inventory",
      type: "absence_detected",
      title: `Referencia agotada: ${ref}`,
      description: `${inv.productName ?? ref} tiene inventario 0 en todas las bodegas`,
      severity: "critical",
      priority: orders.length > 0 ? "highest" : "high",
      source: "sag",
      confidence: 100,
      evidence: buildSignalEvidence({
        items: [
          buildSignalEvidenceItem({
            type: "entity_metric",
            description: `Inventario total = 0 (${inv.warehouses.length} bodegas consultadas)`,
            referenceId: ref,
            confidence: 100,
          }),
        ],
        entities: [entity],
        metricKeys: ["inventory_available"],
      }),
      context: buildSignalContext({
        what: `Referencia ${ref} agotada en todas las bodegas`,
        primaryEntity: entity,
        where: inv.warehouses.length > 0 ? inv.warehouses.map(w => w.warehouseCode).join(", ") : "sin bodegas",
        metrics: [{ key: "inventory_available", value: 0, unit: "unidades", threshold: criticalThreshold }],
        missingInformation: inv.productId ? [] : ["ProductEntity no encontrado en Prisma"],
      }),
    }));
  }

  // -- inventory_stock_critical ---------------------------------------------
  if (inv.totalAvailable > 0 && inv.totalAvailable <= criticalThreshold) {
    signals.push(buildSignal({
      organizationId: orgId,
      entityId: ref,
      entityType: "product",
      category: "inventory",
      type: "threshold_breach",
      title: `Stock critico: ${ref} (${inv.totalAvailable} unidades)`,
      description: `${inv.productName ?? ref} tiene solo ${inv.totalAvailable} unidades disponibles`,
      severity: "high",
      priority: orders.length > 0 ? "high" : "normal",
      source: "sag",
      confidence: 100,
      evidence: buildSignalEvidence({
        items: [
          buildSignalEvidenceItem({
            type: "entity_metric",
            description: `Inventario total = ${inv.totalAvailable} (umbral critico: ${criticalThreshold})`,
            referenceId: ref,
          }),
        ],
        entities: [entity],
        metricKeys: ["inventory_available"],
      }),
      context: buildSignalContext({
        what: `Referencia ${ref} por debajo del umbral critico`,
        primaryEntity: entity,
        metrics: [{ key: "inventory_available", value: inv.totalAvailable, unit: "unidades", threshold: criticalThreshold }],
      }),
    }));
  }

  // -- commercial_order_waiting_inventory -----------------------------------
  if (inv.totalAvailable === 0 && orders.length > 0) {
    signals.push(buildSignal({
      organizationId: orgId,
      entityId: ref,
      entityType: "product",
      category: "commercial",
      type: "absence_detected",
      title: `${orders.length} pedido(s) afectados por agotamiento de ${ref}`,
      description: `La referencia ${ref} esta agotada y tiene ${orders.length} pedido(s) pendientes`,
      severity: "high",
      priority: "high",
      source: "computed",
      confidence: 90,
      evidence: buildSignalEvidence({
        items: [
          buildSignalEvidenceItem({
            type: "entity_metric",
            description: `${orders.length} pedidos con referencia ${ref}`,
            referenceId: ref,
          }),
          ...orders.slice(0, 3).map(o =>
            buildSignalEvidenceItem({
              type: "entity_state",
              description: `Pedido ${o.orderId}: ${o.customerName ?? "sin cliente"}, $${o.amount}`,
              referenceId: o.orderId,
            }),
          ),
        ],
        entities: [entity],
        metricKeys: ["affected_orders"],
      }),
      context: buildSignalContext({
        what: `Pedidos bloqueados por referencia agotada`,
        primaryEntity: entity,
        relatedEntities: orders.slice(0, 5).map(o => ({
          entityId: o.orderId,
          entityType: "order" as const,
          label: o.customerName ?? o.orderId,
        })),
        metrics: [{ key: "affected_orders", value: orders.length, unit: "pedidos", threshold: null }],
      }),
    }));
  }

  // -- vendor_portfolio_reference_out_of_stock ------------------------------
  for (const v of vendors) {
    if (v.availableQty === 0 || inv.totalAvailable === 0) {
      signals.push(buildSignal({
        organizationId: orgId,
        entityId: v.vendorId,
        entityType: "vendor",
        category: "vendor",
        type: "absence_detected",
        title: `Vendedor ${v.vendorName}: referencia ${ref} agotada en maleta`,
        description: `${v.vendorName} tiene ${ref} en su maleta pero no hay inventario para vender`,
        severity: "medium",
        priority: "normal",
        source: "computed",
        confidence: 85,
        evidence: buildSignalEvidence({
          items: [
            buildSignalEvidenceItem({
              type: "entity_state",
              description: `Maleta ${v.portfolioId}: ${ref} asignado=${v.assignedQty}, disponible=${v.availableQty}`,
              referenceId: v.portfolioId ?? v.vendorId,
            }),
          ],
          entities: [
            entity,
            { entityId: v.vendorId, entityType: "vendor" as const, label: v.vendorName },
          ],
        }),
        context: buildSignalContext({
          what: `Referencia agotada en maleta de vendedor`,
          primaryEntity: { entityId: v.vendorId, entityType: "vendor" as const, label: v.vendorName },
          relatedEntities: [entity],
        }),
      }));
    }
  }

  // -- portfolio_needs_update -----------------------------------------------
  for (const p of portfolios) {
    if (inv.totalAvailable === 0 && p.status === "activa") {
      signals.push(buildSignal({
        organizationId: orgId,
        entityId: p.portfolioId,
        entityType: "sales_portfolio",
        category: "portfolio",
        type: "state_change",
        title: `Maleta ${p.vendorName}: referencia ${ref} requiere actualizacion`,
        description: `La maleta de ${p.vendorName} contiene ${ref} que esta agotada`,
        severity: "medium",
        priority: "normal",
        source: "computed",
        confidence: 85,
        evidence: buildSignalEvidence({
          items: [
            buildSignalEvidenceItem({
              type: "entity_state",
              description: `Maleta ${p.portfolioId}: referencia ${ref} agotada, asignado=${p.assignedQty}`,
              referenceId: p.portfolioId,
            }),
          ],
          entities: [entity, { entityId: p.portfolioId, entityType: "sales_portfolio" as const, label: p.vendorName }],
        }),
        context: buildSignalContext({
          what: `Maleta activa contiene referencia agotada`,
          primaryEntity: { entityId: p.portfolioId, entityType: "sales_portfolio" as const, label: p.vendorName },
          relatedEntities: [entity],
        }),
      }));
    }
  }

  // -- production_order_open_for_reference ----------------------------------
  const openOPs = production.filter(op => !op.isClosed);
  if (openOPs.length > 0 && (inv.totalAvailable === 0 || inv.totalAvailable <= criticalThreshold)) {
    signals.push(buildSignal({
      organizationId: orgId,
      entityId: ref,
      entityType: "product",
      category: "production",
      type: "pattern_detected",
      title: `${openOPs.length} OP(s) abierta(s) para referencia ${ref}`,
      description: `Existen ordenes de produccion en curso que pueden reabastecer ${ref}`,
      severity: "info",
      priority: "normal",
      source: "sag",
      confidence: 75,
      evidence: buildSignalEvidence({
        items: openOPs.slice(0, 3).map(op =>
          buildSignalEvidenceItem({
            type: "entity_state",
            description: `OP ${op.documentNumber ?? op.opId}: ${op.quantityOrdered} unidades, estado=${op.status}`,
            referenceId: op.opId,
          }),
        ),
        entities: [entity, ...openOPs.slice(0, 3).map(op => ({
          entityId: op.opId,
          entityType: "production_order" as const,
          label: op.documentNumber ?? op.opId,
        }))],
      }),
      context: buildSignalContext({
        what: `Produccion en curso para referencia critica/agotada`,
        primaryEntity: entity,
        relatedEntities: openOPs.slice(0, 3).map(op => ({
          entityId: op.opId,
          entityType: "production_order" as const,
          label: op.documentNumber ?? op.opId,
        })),
        metrics: [{ key: "open_ops", value: openOPs.length, unit: "OPs", threshold: null }],
      }),
    }));
  }

  return signals;
}
