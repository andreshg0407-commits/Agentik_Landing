/**
 * commercial-operational-knowledge.ts
 *
 * COMERCIAL-OPERATIONAL-INTEGRATION-01
 * Builds an in-memory Knowledge Graph from real Castillitos data.
 *
 * Connects: Product → Portfolio → Vendor → Order → Customer → ProductionOrder
 * All relations use BusinessEntityRelation / KnowledgeEdge contracts.
 *
 * No React. No UI. No direct imports between entity modules.
 */

import type { BusinessEntityRelation } from "@/lib/business-entities/core";
import { buildRelation } from "@/lib/business-entities/core";
import type {
  AffectedOrder,
  AffectedCustomer,
  AffectedVendor,
  AffectedPortfolio,
  RelatedProduction,
} from "./commercial-operational-types";

// -- Relation Builders -------------------------------------------------------

/**
 * Build all BusinessEntityRelations for a reference and its connected entities.
 * These relations form the edges of the Knowledge Graph for this reference.
 */
export function buildReferenceRelations(
  reference: string,
  orders: AffectedOrder[],
  customers: AffectedCustomer[],
  vendors: AffectedVendor[],
  portfolios: AffectedPortfolio[],
  production: RelatedProduction[],
): BusinessEntityRelation[] {
  const relations: BusinessEntityRelation[] = [];

  // Product → Portfolio (contains)
  for (const p of portfolios) {
    relations.push(buildRelation({
      sourceEntityId: reference,
      sourceEntityType: "product",
      targetEntityId: p.portfolioId,
      targetEntityType: "sales_portfolio",
      relationType: "belongs_to",
      strength: "strong",
      metadata: { assignedQty: p.assignedQty, vendorName: p.vendorName },
    }));
  }

  // Portfolio → Vendor (owned by)
  for (const p of portfolios) {
    relations.push(buildRelation({
      sourceEntityId: p.portfolioId,
      sourceEntityType: "sales_portfolio",
      targetEntityId: p.vendorId,
      targetEntityType: "vendor",
      relationType: "owned" as any,
      strength: "strong",
      metadata: { season: p.season },
    }));
  }

  // Product → Vendor (sold_by)
  for (const v of vendors) {
    relations.push(buildRelation({
      sourceEntityId: reference,
      sourceEntityType: "product",
      targetEntityId: v.vendorId,
      targetEntityType: "vendor",
      relationType: "sold_by",
      strength: "strong",
      metadata: { assignedQty: v.assignedQty, availableQty: v.availableQty },
    }));
  }

  // Product → Order (ordered)
  for (const o of orders) {
    relations.push(buildRelation({
      sourceEntityId: reference,
      sourceEntityType: "product",
      targetEntityId: o.orderId,
      targetEntityType: "order",
      relationType: "contains",
      strength: "strong",
      metadata: { amount: o.amount, customerName: o.customerName },
    }));
  }

  // Order → Customer (ordered_by)
  for (const o of orders) {
    if (o.customerName) {
      relations.push(buildRelation({
        sourceEntityId: o.orderId,
        sourceEntityType: "order",
        targetEntityId: o.customerName,
        targetEntityType: "customer",
        relationType: "ordered_by",
        strength: "strong",
      }));
    }
  }

  // Vendor → Customer (sells to) — inferred from orders
  const vendorCustomerPairs = new Set<string>();
  for (const o of orders) {
    for (const v of vendors) {
      const key = `${v.vendorId}:${o.customerName}`;
      if (o.customerName && !vendorCustomerPairs.has(key)) {
        vendorCustomerPairs.add(key);
        relations.push(buildRelation({
          sourceEntityId: v.vendorId,
          sourceEntityType: "vendor",
          targetEntityId: o.customerName,
          targetEntityType: "customer",
          relationType: "assigned_to",
          strength: "inferred",
        }));
      }
    }
  }

  // Product → ProductionOrder (produced_by)
  for (const op of production) {
    relations.push(buildRelation({
      sourceEntityId: reference,
      sourceEntityType: "product",
      targetEntityId: op.opId,
      targetEntityType: "production_order",
      relationType: "produced_by",
      strength: "strong",
      metadata: { quantityOrdered: op.quantityOrdered, isClosed: op.isClosed },
    }));
  }

  return relations;
}

// -- Graph Summary -----------------------------------------------------------

/** Summary of the knowledge graph for a reference. */
export interface ReferenceGraphSummary {
  reference: string;
  totalRelations: number;
  portfolioCount: number;
  vendorCount: number;
  orderCount: number;
  customerCount: number;
  productionCount: number;
}

/** Compute a summary of the graph for a reference. */
export function summarizeReferenceGraph(
  reference: string,
  relations: BusinessEntityRelation[],
): ReferenceGraphSummary {
  const refRelations = relations.filter(
    r => r.sourceEntityId === reference || r.targetEntityId === reference,
  );

  const uniqueTypes = new Map<string, Set<string>>();
  for (const r of refRelations) {
    const otherId = r.sourceEntityId === reference ? r.targetEntityId : r.sourceEntityId;
    const otherType = r.sourceEntityId === reference ? r.targetEntityType : r.sourceEntityType;
    if (!uniqueTypes.has(otherType)) uniqueTypes.set(otherType, new Set());
    uniqueTypes.get(otherType)!.add(otherId);
  }

  return {
    reference,
    totalRelations: refRelations.length,
    portfolioCount: uniqueTypes.get("sales_portfolio")?.size ?? 0,
    vendorCount: uniqueTypes.get("vendor")?.size ?? 0,
    orderCount: uniqueTypes.get("order")?.size ?? 0,
    customerCount: uniqueTypes.get("customer")?.size ?? 0,
    productionCount: uniqueTypes.get("production_order")?.size ?? 0,
  };
}
