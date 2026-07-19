/**
 * commercial-operational-pipeline.ts
 *
 * COMERCIAL-OPERATIONAL-INTEGRATION-01
 * The main pipeline that connects real Castillitos data through all foundational engines.
 *
 * Flow per reference:
 *   Prisma → Entity Snapshots → Signals → Events → Knowledge Graph → Reasoning
 *
 * This is the first end-to-end validation that the operational nervous system works.
 *
 * SERVER ONLY.
 */

import "server-only";

import { buildConfidence, aggregateConfidence } from "@/lib/business-reasoning";
import type { CommercialOperationalResult, ReferenceOperationalAnalysis } from "./commercial-operational-types";
import {
  discoverCriticalReferences,
  getInventoryForReference,
  getOrdersForReference,
  getCustomersForReference,
  getVendorsForReference,
  getPortfoliosForReference,
  getProductionForReference,
  getAlternativeInventory,
} from "./commercial-operational-entities";
import { generateReferenceSignals } from "./commercial-operational-signals";
import { generateReferenceEvents } from "./commercial-operational-events";
import { buildReferenceRelations, summarizeReferenceGraph } from "./commercial-operational-knowledge";
import { generateReferenceReasoning } from "./commercial-operational-reasoning";

// -- Pipeline Constants ------------------------------------------------------

const CRITICAL_THRESHOLD = 10;
const MAX_REFERENCES = 20;

// -- Main Pipeline -----------------------------------------------------------

/**
 * Run the full commercial operational pipeline for Castillitos.
 *
 * 1. Discover critical/out-of-stock references from real inventory
 * 2. For each reference, query all related entities
 * 3. Generate Signals, Events, Knowledge Graph relations, and Reasoning
 * 4. Return the complete operational analysis
 */
export async function runCommercialOperationalPipeline(
  orgId: string,
  orgSlug: string,
  opts: { criticalThreshold?: number; maxReferences?: number } = {},
): Promise<CommercialOperationalResult> {
  const start = Date.now();
  const threshold = opts.criticalThreshold ?? CRITICAL_THRESHOLD;
  const maxRefs = opts.maxReferences ?? MAX_REFERENCES;

  // Phase 1: Discover critical references from real inventory
  const criticalRefs = await discoverCriticalReferences(orgId, {
    criticalThreshold: threshold,
    limit: maxRefs,
  });

  // Phase 2: Analyze each reference through the full pipeline
  const analyses: ReferenceOperationalAnalysis[] = [];

  for (const critRef of criticalRefs) {
    const analysis = await analyzeReference(
      orgId,
      critRef.reference,
      threshold,
    );
    analyses.push(analysis);
  }

  // Phase 3: Aggregate results
  const totalSignals = analyses.reduce((s, a) => s + a.signals.length, 0);
  const totalEvents = analyses.reduce((s, a) => s + a.events.length, 0);
  const totalRecommendations = analyses.reduce((s, a) => s + a.recommendations.length, 0);
  const outOfStockCount = analyses.filter(a => a.isOutOfStock).length;
  const criticalCount = analyses.filter(a => a.isCritical && !a.isOutOfStock).length;

  const confidences = analyses.map(a => a.confidence).filter(c => c.score > 0);
  const overallConfidence = confidences.length > 0
    ? aggregateConfidence(confidences)
    : buildConfidence({
        score: 0,
        reason: "Sin datos de inventario encontrados",
        dataComplete: false,
        missingInformation: ["Sin productos activos en inventario SAG"],
      });

  return {
    organizationId: orgId,
    orgSlug,
    totalReferencesAnalyzed: analyses.length,
    outOfStockCount,
    criticalCount,
    analyses,
    totalSignals,
    totalEvents,
    totalRecommendations,
    confidence: overallConfidence,
    processingMs: Date.now() - start,
    assembledAt: new Date().toISOString(),
  };
}

// -- Single Reference Analysis -----------------------------------------------

async function analyzeReference(
  orgId: string,
  reference: string,
  criticalThreshold: number,
): Promise<ReferenceOperationalAnalysis> {
  // Query all related entities in parallel
  const [inv, orders, customers, vendors, portfolios, production, altInv] = await Promise.all([
    getInventoryForReference(orgId, reference),
    getOrdersForReference(orgId, reference),
    getCustomersForReference(orgId, reference),
    getVendorsForReference(orgId, reference),
    getPortfoliosForReference(orgId, reference),
    getProductionForReference(orgId, reference),
    getAlternativeInventory(orgId, reference),
  ]);

  const isOutOfStock = inv.totalAvailable === 0;
  const isCritical = inv.totalAvailable > 0 && inv.totalAvailable <= criticalThreshold;

  // Generate Signals
  const signals = generateReferenceSignals(
    orgId, inv, orders, vendors, portfolios, production, criticalThreshold,
  );

  // Generate Events
  const events = generateReferenceEvents(
    orgId, inv, signals, orders, vendors, production,
  );

  // Build Knowledge Graph relations
  const relations = buildReferenceRelations(
    reference, orders, customers, vendors, portfolios, production,
  );
  const graphSummary = summarizeReferenceGraph(reference, relations);

  // Generate Reasoning
  const reasoning = generateReferenceReasoning(
    orgId, inv, orders, customers, vendors, portfolios, production, altInv, graphSummary,
  );

  return {
    reference,
    productName: inv.productName,
    inventoryAvailable: inv.totalAvailable,
    isOutOfStock,
    isCritical,
    criticalThreshold,

    affectedOrders: orders,
    affectedCustomers: customers,
    affectedVendors: vendors,
    affectedPortfolios: portfolios,
    relatedProduction: production,
    alternativeInventory: altInv,

    signals,
    events,
    observations: reasoning.observations,
    findings: reasoning.findings,
    insights: reasoning.insights,
    risks: reasoning.risks,
    opportunities: reasoning.opportunities,
    recommendations: reasoning.recommendations,

    confidence: reasoning.confidence,
    missingInformation: reasoning.missingInformation,
  };
}
