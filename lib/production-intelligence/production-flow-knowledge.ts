/**
 * production-flow-knowledge.ts
 *
 * PRODUCTION-FLOW-INTELLIGENCE-01 — Phase 10: Knowledge Graph Preparation.
 *
 * Helpers to build knowledge graph relations from production flow data.
 * Does NOT modify the knowledge graph — only prepares relation objects.
 *
 * Relations prepared:
 *   Product → ProductionOrder (has_production_order)
 *   ProductionOrder → InventoryLocation 04 (produces_in)
 *   ProductionOrder → InventoryLocation 01 (delivers_to)
 *   ProductionOrder → ProductionDocument (evidenced_by)
 *   ProductionFlow → CommercialAvailability (impacts_availability)
 *   ProductionFlow → LiveVendor (affects_vendor)
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type {
  ProductionFlowSnapshot,
  ProductionReferenceFlow,
  ProductionKnowledgeRelation,
  ProductionKnowledgeRelationType,
} from "./production-flow-types";

/** Build all knowledge graph relations from a production flow snapshot. */
export function buildProductionKnowledgeRelations(
  snapshot: ProductionFlowSnapshot,
): ProductionKnowledgeRelation[] {
  const relations: ProductionKnowledgeRelation[] = [];

  for (const flow of snapshot.referenceFlows) {
    // Product → ProductionOrder (for each active order)
    for (const order of flow.activeOrders) {
      if (order.opNumber === "\u2014") continue;

      relations.push({
        fromType: "Product",
        fromId: flow.referenceCode,
        toType: "ProductionOrder",
        toId: order.opNumber,
        relationType: "has_production_order",
      });

      // ProductionOrder → InventoryLocation 04 (produces_in)
      relations.push({
        fromType: "ProductionOrder",
        fromId: order.opNumber,
        toType: "InventoryLocation",
        toId: "04",
        relationType: "produces_in",
      });

      // ProductionOrder → InventoryLocation 01 (delivers_to)
      relations.push({
        fromType: "ProductionOrder",
        fromId: order.opNumber,
        toType: "InventoryLocation",
        toId: "01",
        relationType: "delivers_to",
      });

      // ProductionOrder → ProductionDocument (evidenced_by)
      for (const doc of order.documents) {
        relations.push({
          fromType: "ProductionOrder",
          fromId: order.opNumber,
          toType: "ProductionDocument",
          toId: `${doc.documentType}-${doc.documentDate}`,
          relationType: "evidenced_by",
        });
      }
    }

    // ProductionFlow → CommercialAvailability (impacts_availability)
    if (flow.availabilityImpact.existenciaBodega01 !== null) {
      relations.push({
        fromType: "ProductionFlow",
        fromId: flow.referenceCode,
        toType: "CommercialAvailability",
        toId: flow.referenceCode,
        relationType: "impacts_availability",
      });
    }

    // ProductionFlow → LiveVendor (affects_vendor)
    for (const vendorId of flow.availabilityImpact.affectedVendorIds) {
      relations.push({
        fromType: "ProductionFlow",
        fromId: flow.referenceCode,
        toType: "LiveVendor",
        toId: vendorId,
        relationType: "affects_vendor",
      });
    }
  }

  return relations;
}

/** Get relations for a specific reference. */
export function getRelationsForReference(
  referenceCode: string,
  relations: ProductionKnowledgeRelation[],
): ProductionKnowledgeRelation[] {
  return relations.filter(
    (r) => r.fromId === referenceCode || r.toId === referenceCode,
  );
}

/** Get relations of a specific type. */
export function getRelationsByType(
  relationType: ProductionKnowledgeRelationType,
  relations: ProductionKnowledgeRelation[],
): ProductionKnowledgeRelation[] {
  return relations.filter((r) => r.relationType === relationType);
}
