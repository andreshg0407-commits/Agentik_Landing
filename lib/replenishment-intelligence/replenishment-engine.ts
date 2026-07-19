/**
 * replenishment-engine.ts
 *
 * REPLENISHMENT-INTELLIGENCE-01 — Phases 3-8: Core Engine.
 *
 * Builds ReplenishmentSnapshot from:
 *   - CommercialAvailabilityReport (Bodega 01 stock + CEO rules)
 *   - ProductionFlowSnapshot (production status, recovery signals)
 *   - LiveVendorProfile[] (vendor portfolios, coverage)
 *   - InventoryTransfer data (transfer history)
 *   - InventoryLocation catalog (location types, capabilities)
 *
 * Phases covered:
 *   3: Portfolio replenishment (maleta vendor)
 *   4: Portfolio replacement intelligence
 *   5: Store replenishment (preparation)
 *   6: Production-aware replenishment
 *   7: Transfer-aware replenishment
 *   8: Replenishment reasoning
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type { AvailabilityRow, MaletaReplacementRule } from "@/lib/commercial-intelligence/availability-types";
import { CASTILLITOS_REPLACEMENT_RULES } from "@/lib/commercial-intelligence/maleta-replacement-engine";
import type { ProductionFlowSnapshot, ProductionReferenceFlow } from "@/lib/production-intelligence/production-flow-types";
import type { LiveVendorProfile, VendorInventoryItem, VendorTransferHistory } from "@/lib/comercial/vendors/live-vendor-types";

import type {
  ReplenishmentSnapshot,
  ReplenishmentRecommendation,
  ReplenishmentTarget,
  ReplenishmentTargetType,
  ReplenishmentSource,
  ReplenishmentSourceType,
  ReplenishmentReason,
  ReplenishmentReasonCategory,
  ReplenishmentUrgency,
  ReplenishmentAction,
  ReplenishmentReasoning,
  ReplenishmentEvidence,
  ReplenishmentImpact,
  ReplenishmentConfidence,
  ReplenishmentReplacement,
  ReplenishmentProductionContext,
  ReplenishmentTransferContext,
  ReplenishmentSummary,
  ReplenishmentExecutiveReport,
  ReplenishmentDavidAnswer,
  ReplenishmentDavidQueryType,
  ReplenishmentDavidReference,
  ReplenishmentDecisionInput,
  ReplenishmentDecisionOption,
  ReplenishmentKnowledgeRelation,
} from "./replenishment-types";

// ── Build Replenishment Snapshot ───────────────────────────────────────────

export function buildReplenishmentSnapshot(opts: {
  orgSlug: string;
  /** Commercial availability rows (Bodega 01). */
  availabilityRows: AvailabilityRow[];
  /** Production flow snapshot (optional). */
  productionFlow: ProductionFlowSnapshot | null;
  /** Live vendor profiles (optional). */
  vendors: LiveVendorProfile[];
  /** CEO replacement rules. */
  rules?: MaletaReplacementRule[];
}): ReplenishmentSnapshot {
  const {
    orgSlug,
    availabilityRows,
    productionFlow,
    vendors,
    rules = CASTILLITOS_REPLACEMENT_RULES,
  } = opts;

  // Index availability by reference
  const availByRef = new Map<string, AvailabilityRow>();
  for (const row of availabilityRows) {
    availByRef.set(row.reference, row);
  }

  // Index availability by SubGrupo for replacement search
  const availBySubGrupo = new Map<string, AvailabilityRow[]>();
  for (const row of availabilityRows) {
    if (!availBySubGrupo.has(row.subGrupo)) availBySubGrupo.set(row.subGrupo, []);
    availBySubGrupo.get(row.subGrupo)!.push(row);
  }

  // Index production flows by reference
  const productionByRef = new Map<string, ProductionReferenceFlow>();
  if (productionFlow) {
    for (const flow of productionFlow.referenceFlows) {
      productionByRef.set(flow.referenceCode, flow);
    }
  }

  const recommendations: ReplenishmentRecommendation[] = [];
  let recCounter = 0;

  // Phase 3 & 4: Portfolio replenishment + replacement
  for (const vendor of vendors) {
    const vendorRecs = buildPortfolioRecommendations({
      vendor,
      availByRef,
      availBySubGrupo,
      productionByRef,
      rules,
      idPrefix: `RPL-${++recCounter}`,
    });
    recommendations.push(...vendorRecs);
    recCounter += vendorRecs.length;
  }

  // Phase 5: Store replenishment (preparation — detects main warehouse critical refs)
  const storeRecs = buildWarehouseReplenishmentRecommendations({
    availabilityRows,
    productionByRef,
    vendors,
    rules,
    availBySubGrupo,
    startId: recCounter,
  });
  recommendations.push(...storeRecs);
  recCounter += storeRecs.length;

  const summary = buildSummary(recommendations, vendors);
  const confidence = buildSnapshotConfidence(availabilityRows, productionFlow, vendors);

  return {
    orgSlug,
    computedAt: new Date().toISOString(),
    recommendations,
    summary,
    confidence,
  };
}

// ── Phase 3 & 4: Portfolio Replenishment + Replacement ─────────────────────

function buildPortfolioRecommendations(opts: {
  vendor: LiveVendorProfile;
  availByRef: Map<string, AvailabilityRow>;
  availBySubGrupo: Map<string, AvailabilityRow[]>;
  productionByRef: Map<string, ProductionReferenceFlow>;
  rules: MaletaReplacementRule[];
  idPrefix: string;
}): ReplenishmentRecommendation[] {
  const { vendor, availByRef, availBySubGrupo, productionByRef, rules } = opts;
  const recs: ReplenishmentRecommendation[] = [];
  let counter = 0;

  for (const item of vendor.portfolio.items) {
    if (!item.replacementRequired && item.commercialAvailabilityStatus === "available") continue;

    const avail = availByRef.get(item.referenceCode);
    const production = productionByRef.get(item.referenceCode);
    const rule = item.subLinea
      ? rules.find((r) => item.subLinea!.toUpperCase().includes(r.subLinea.toUpperCase())) ?? null
      : null;

    const isOutOfStock = (avail?.existenciaBodega01 ?? 0) === 0;
    const isCritical = rule ? (avail?.existenciaBodega01 ?? 0) <= rule.threshold : isOutOfStock;

    if (!isCritical && !isOutOfStock) continue;

    const target = buildPortfolioTarget(vendor, item);
    const prodCtx = production ? buildProductionContext(production) : null;
    const transferCtx = buildTransferContextFromVendor(vendor.transferHistory);

    // Phase 4: Find replacement candidates
    const replacements = findReplacements(
      item.referenceCode,
      item.subGrupo ?? "",
      item.subLinea ?? "",
      rule?.threshold ?? 0,
      availBySubGrupo,
    );

    // Phase 6: Production-aware action
    const { action, urgency, reason } = derivePortfolioAction({
      isOutOfStock,
      isCritical,
      production,
      replacements,
      rule,
      avail,
    });

    // Phase 8: Reasoning
    const reasoning = buildPortfolioReasoning({
      vendor,
      item,
      avail,
      production,
      action,
      replacements,
      rule,
    });

    const evidence = buildPortfolioEvidence(item, avail, production, vendor);
    const source = buildSource(avail, production);
    const impact = buildPortfolioImpact(vendor, item, avail);

    const confidence: ReplenishmentConfidence = {
      score: computeConfidence(avail !== undefined, production !== undefined, true),
      reason: `${avail ? "Disponibilidad" : "Sin disponibilidad"}${production ? " + produccion" : ""}${vendor ? " + vendor" : ""}.`,
      sourceCount: (avail ? 1 : 0) + (production ? 1 : 0) + 1,
    };

    recs.push({
      id: `RPL-P-${vendor.vendorId}-${++counter}`,
      referenceCode: item.referenceCode,
      description: item.description ?? "",
      subGrupo: item.subGrupo ?? "",
      subLinea: item.subLinea ?? "",
      target,
      source,
      reason,
      urgency,
      action,
      reasoning,
      evidence,
      impact,
      confidence,
      replacementCandidates: replacements,
      productionContext: prodCtx,
      transferContext: transferCtx,
      suggestedOnly: true,
    });
  }

  return recs;
}

function buildPortfolioTarget(vendor: LiveVendorProfile, item: VendorInventoryItem): ReplenishmentTarget {
  return {
    targetType: "PORTFOLIO",
    locationCode: vendor.location.locationCode,
    locationName: vendor.location.locationName,
    locationType: "PORTFOLIO",
    entityId: vendor.vendorId,
    entityName: vendor.vendorName,
    currentStock: item.quantityInPortfolio,
    minimumStock: null,
    idealStock: null,
    deficit: Math.max(0, (item.quantityAvailableInMainWarehouse ?? 0) <= 0 ? item.quantityInPortfolio : 0),
  };
}

function derivePortfolioAction(opts: {
  isOutOfStock: boolean;
  isCritical: boolean;
  production: ProductionReferenceFlow | undefined;
  replacements: ReplenishmentReplacement[];
  rule: MaletaReplacementRule | null;
  avail: AvailabilityRow | undefined;
}): { action: ReplenishmentAction; urgency: ReplenishmentUrgency; reason: ReplenishmentReason } {
  const { isOutOfStock, isCritical, production, replacements, rule, avail } = opts;

  // Phase 6: Production-aware
  if (production && production.stageState.hasActiveOP) {
    if (production.recoverySignal?.estimatedReadiness === "ready_soon") {
      return {
        action: "wait_for_production",
        urgency: isOutOfStock ? "medium" : "low",
        reason: {
          category: isOutOfStock ? "out_of_stock" : "below_ceo_threshold",
          description: `Produccion proxima a completar. Esperar entrada de producto terminado.`,
          ceoRule: rule ? `${rule.subLinea} <= ${rule.threshold}` : null,
          threshold: rule?.threshold ?? null,
        },
      };
    }

    if (production.delayRisk.level === "high" || production.delayRisk.level === "critical") {
      return {
        action: "review_production",
        urgency: "high",
        reason: {
          category: isOutOfStock ? "out_of_stock" : "below_ceo_threshold",
          description: `Produccion retrasada (${production.delayRisk.daysInProduction} dias). Revisar avance.`,
          ceoRule: rule ? `${rule.subLinea} <= ${rule.threshold}` : null,
          threshold: rule?.threshold ?? null,
        },
      };
    }

    return {
      action: "wait_for_production",
      urgency: isOutOfStock ? "high" : "medium",
      reason: {
        category: isOutOfStock ? "out_of_stock" : "below_ceo_threshold",
        description: `Produccion activa. Etapa: ${production.stageState.currentStage.stageLabel}.`,
        ceoRule: rule ? `${rule.subLinea} <= ${rule.threshold}` : null,
        threshold: rule?.threshold ?? null,
      },
    };
  }

  // No production
  if (isOutOfStock) {
    if (replacements.length > 0) {
      return {
        action: "replace_reference",
        urgency: "critical",
        reason: {
          category: "out_of_stock",
          description: `Sin existencia en Bodega 01 y sin produccion. ${replacements.length} reemplazo(s) del mismo SubGrupo.`,
          ceoRule: rule ? `${rule.subLinea} <= ${rule.threshold}` : null,
          threshold: rule?.threshold ?? null,
        },
      };
    }

    return {
      action: "suggest_production",
      urgency: "critical",
      reason: {
        category: "out_of_stock",
        description: `Sin existencia, sin produccion, sin reemplazos. Crear nueva OP.`,
        ceoRule: rule ? `${rule.subLinea} <= ${rule.threshold}` : null,
        threshold: rule?.threshold ?? null,
      },
    };
  }

  // Critical but not zero
  if (isCritical && replacements.length > 0) {
    return {
      action: "replace_reference",
      urgency: "high",
      reason: {
        category: "below_ceo_threshold",
        description: `Existencia (${avail?.existenciaBodega01 ?? 0}) por debajo de umbral CEO. Reemplazar en maleta.`,
        ceoRule: rule ? `${rule.subLinea} <= ${rule.threshold}` : null,
        threshold: rule?.threshold ?? null,
      },
    };
  }

  return {
    action: "suggest_production",
    urgency: "high",
    reason: {
      category: "below_ceo_threshold",
      description: `Existencia critica sin produccion activa. Considerar nueva OP.`,
      ceoRule: rule ? `${rule.subLinea} <= ${rule.threshold}` : null,
      threshold: rule?.threshold ?? null,
    },
  };
}

// ── Phase 5: Warehouse / Store Replenishment ───────────────────────────────

function buildWarehouseReplenishmentRecommendations(opts: {
  availabilityRows: AvailabilityRow[];
  productionByRef: Map<string, ProductionReferenceFlow>;
  vendors: LiveVendorProfile[];
  rules: MaletaReplacementRule[];
  availBySubGrupo: Map<string, AvailabilityRow[]>;
  startId: number;
}): ReplenishmentRecommendation[] {
  const { availabilityRows, productionByRef, vendors, rules, availBySubGrupo, startId } = opts;
  const recs: ReplenishmentRecommendation[] = [];
  let counter = startId;

  // Find references that are out of stock in Bodega 01 but NOT already covered by vendor recs
  const vendorRefs = new Set<string>();
  for (const v of vendors) {
    for (const item of v.portfolio.items) {
      vendorRefs.add(item.referenceCode);
    }
  }

  for (const avail of availabilityRows) {
    if (vendorRefs.has(avail.reference)) continue;
    if (avail.existenciaBodega01 > 0) {
      const rule = rules.find((r) => avail.subLinea.toUpperCase().includes(r.subLinea.toUpperCase()));
      if (!rule || avail.existenciaBodega01 > rule.threshold) continue;
    }

    const production = productionByRef.get(avail.reference);
    const isOutOfStock = avail.existenciaBodega01 === 0;
    const rule = rules.find((r) => avail.subLinea.toUpperCase().includes(r.subLinea.toUpperCase()));

    // Phase 6: Production-aware
    let action: ReplenishmentAction;
    let urgency: ReplenishmentUrgency;

    if (production?.stageState.hasActiveOP) {
      if (production.recoverySignal?.estimatedReadiness === "ready_soon") {
        action = "wait_for_production";
        urgency = "medium";
      } else if (production.delayRisk.level === "high" || production.delayRisk.level === "critical") {
        action = "review_production";
        urgency = "high";
      } else {
        action = "wait_for_production";
        urgency = isOutOfStock ? "high" : "medium";
      }
    } else {
      const replacements = findReplacements(avail.reference, avail.subGrupo, avail.subLinea, rule?.threshold ?? 0, availBySubGrupo);
      action = replacements.length > 0 ? "replace_reference" : "suggest_production";
      urgency = isOutOfStock ? "critical" : "high";
    }

    const prodCtx = production ? buildProductionContext(production) : null;
    const replacements = findReplacements(avail.reference, avail.subGrupo, avail.subLinea, rule?.threshold ?? 0, availBySubGrupo);

    // Count affected vendors
    const affectedVendors = vendors.filter((v) =>
      v.portfolio.items.some((i) => i.referenceCode === avail.reference),
    );

    recs.push({
      id: `RPL-W-${++counter}`,
      referenceCode: avail.reference,
      description: avail.description,
      subGrupo: avail.subGrupo,
      subLinea: avail.subLinea,
      target: {
        targetType: "MAIN_WAREHOUSE",
        locationCode: "01",
        locationName: "Bodega Principal",
        locationType: "MAIN_WAREHOUSE",
        entityId: null,
        entityName: null,
        currentStock: avail.existenciaBodega01,
        minimumStock: rule?.threshold ?? null,
        idealStock: null,
        deficit: isOutOfStock ? 1 : Math.max(0, (rule?.threshold ?? 0) - avail.existenciaBodega01),
      },
      source: {
        sourceType: production?.stageState.hasActiveOP ? "PRODUCTION" : "NONE",
        locationCode: production?.stageState.hasActiveOP ? "04" : null,
        locationName: production?.stageState.hasActiveOP ? "Producto en Proceso" : null,
        availableStock: production?.quantityInProduction ?? null,
        reservedStock: null,
        netAvailable: production?.quantityInProduction ?? null,
      },
      reason: {
        category: isOutOfStock ? "out_of_stock" : "below_ceo_threshold",
        description: isOutOfStock
          ? `Sin existencia en Bodega 01.`
          : `Existencia (${avail.existenciaBodega01}) por debajo de umbral ${rule?.subLinea ?? ""} (${rule?.threshold ?? 0}).`,
        ceoRule: rule ? `${rule.subLinea} <= ${rule.threshold}` : null,
        threshold: rule?.threshold ?? null,
      },
      urgency,
      action,
      reasoning: {
        whatHappened: isOutOfStock
          ? `Referencia ${avail.reference} sin existencia en Bodega 01.`
          : `Referencia ${avail.reference} con existencia critica (${avail.existenciaBodega01}) en Bodega 01.`,
        whyItHappened: `Consumo comercial supero reposicion. ${avail.pedidosPendientes} pedido(s) pendiente(s).`,
        whatEvidenceExists: `Disponible real: ${avail.disponibleReal}. ${production ? `Produccion: ${production.stageState.currentStage.stageLabel}.` : "Sin produccion activa."}`,
        whatRecommendation: action === "wait_for_production"
          ? "Esperar produccion activa."
          : action === "suggest_production"
            ? "Sugerir nueva OP."
            : "Considerar reemplazo del mismo SubGrupo.",
        whatImpact: `${affectedVendors.length} vendedor(es) con esta referencia en maleta.`,
        confidenceExplanation: `Datos de disponibilidad${production ? " + produccion" : ""}.`,
      },
      evidence: [
        {
          type: "AVAILABILITY_DATA",
          description: `Bodega 01: existencia=${avail.existenciaBodega01}, pedidos=${avail.pedidosPendientes}, disponible=${avail.disponibleReal}.`,
          source: "commercial-availability",
          observedAt: new Date().toISOString(),
        },
        ...(production ? [{
          type: "PRODUCTION_DATA" as const,
          description: `Produccion: ${production.stageState.currentStage.stageLabel}. ${production.quantityInProduction} unidades.`,
          source: "production-flow" as const,
          observedAt: new Date().toISOString(),
        }] : []),
      ],
      impact: {
        vendorsAffected: affectedVendors.length,
        storesAffected: 0,
        isCommerciallyCritical: isOutOfStock || avail.disponibleReal < 0,
        quantityAffected: avail.existenciaBodega01,
        description: `Referencia ${isOutOfStock ? "agotada" : "critica"} en Bodega 01. ${affectedVendors.length} vendedor(es) afectado(s).`,
      },
      confidence: {
        score: computeConfidence(true, production !== undefined, false),
        reason: `Datos de disponibilidad${production ? " + produccion" : ""}.`,
        sourceCount: 1 + (production ? 1 : 0),
      },
      replacementCandidates: replacements,
      productionContext: prodCtx,
      transferContext: null,
      suggestedOnly: true,
    });
  }

  return recs;
}

// ── Phase 4: Replacement Intelligence ──────────────────────────────────────

function findReplacements(
  currentRef: string,
  subGrupo: string,
  subLinea: string,
  threshold: number,
  availBySubGrupo: Map<string, AvailabilityRow[]>,
): ReplenishmentReplacement[] {
  if (!subGrupo) return [];
  const sameGroup = availBySubGrupo.get(subGrupo) ?? [];

  return sameGroup
    .filter((row) =>
      row.reference !== currentRef &&
      row.existenciaBodega01 > threshold &&
      row.subLinea.toUpperCase().includes(subLinea.toUpperCase()),
    )
    .sort((a, b) => b.existenciaBodega01 - a.existenciaBodega01)
    .slice(0, 5)
    .map((row) => ({
      referenceCode: row.reference,
      description: row.description,
      subGrupo: row.subGrupo,
      subLinea: row.subLinea,
      existenciaBodega01: row.existenciaBodega01,
      reason: `Mismo SubGrupo (${subGrupo}) con existencia ${row.existenciaBodega01} > umbral ${threshold}`,
    }));
}

// ── Phase 6: Production Context ────────────────────────────────────────────

function buildProductionContext(flow: ProductionReferenceFlow): ReplenishmentProductionContext {
  return {
    hasActiveProduction: flow.stageState.hasActiveOP,
    productionStatus: flow.stageState.productionStatus,
    stageLabel: flow.stageState.currentStage.stageLabel,
    estimatedReadiness: flow.recoverySignal?.estimatedReadiness ?? null,
    quantityInProduction: flow.quantityInProduction,
    daysInProduction: flow.activeOrders.length > 0
      ? Math.max(...flow.activeOrders.map((o) => o.daysInProduction))
      : null,
    productionRecommendation: flow.recommendation.description,
  };
}

// ── Phase 7: Transfer Context ──────────────────────────────────────────────

function buildTransferContextFromVendor(history: VendorTransferHistory): ReplenishmentTransferContext {
  const daysSince = history.lastInboundAt
    ? Math.floor((Date.now() - new Date(history.lastInboundAt).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const isFrequent = history.totalInboundTransfers >= 3;

  return {
    recentInboundCount: history.totalInboundTransfers,
    recentOutboundCount: history.totalOutboundTransfers,
    lastInboundAt: history.lastInboundAt,
    daysSinceLastInbound: daysSince,
    isFrequentlySupplied: isFrequent,
    frequencyAssessment: isFrequent
      ? `${history.totalInboundTransfers} TM recibidos — abastecimiento frecuente.`
      : history.totalInboundTransfers > 0
        ? `${history.totalInboundTransfers} TM recibido(s) — abastecimiento infrecuente.`
        : "Sin TM registrados — sin historial de abastecimiento.",
  };
}

// ── Phase 8: Reasoning & Evidence Builders ─────────────────────────────────

function buildPortfolioReasoning(opts: {
  vendor: LiveVendorProfile;
  item: VendorInventoryItem;
  avail: AvailabilityRow | undefined;
  production: ProductionReferenceFlow | undefined;
  action: ReplenishmentAction;
  replacements: ReplenishmentReplacement[];
  rule: MaletaReplacementRule | null;
}): ReplenishmentReasoning {
  const { vendor, item, avail, production, action, replacements, rule } = opts;
  const existencia = avail?.existenciaBodega01 ?? 0;
  const isOutOfStock = existencia === 0;

  return {
    whatHappened: isOutOfStock
      ? `Referencia ${item.referenceCode} agotada en Bodega 01. Vendedor ${vendor.vendorName} la lleva en maleta.`
      : `Referencia ${item.referenceCode} con existencia critica (${existencia}) en Bodega 01. Vendedor ${vendor.vendorName} la lleva en maleta.`,
    whyItHappened: `${rule ? `Umbral CEO ${rule.subLinea}: ${rule.threshold}.` : ""} Existencia actual: ${existencia}.`,
    whatEvidenceExists: [
      avail ? `Disponibilidad Bodega 01: ${avail.disponibleReal}.` : "Sin datos de disponibilidad.",
      production ? `Produccion: ${production.stageState.currentStage.stageLabel}.` : "Sin produccion activa.",
      `Vendedor ${vendor.vendorName} tiene ${item.quantityInPortfolio} unidades en maleta.`,
    ].join(" "),
    whatRecommendation: actionDescription(action, replacements),
    whatImpact: `Vendedor ${vendor.vendorName} afectado. ${replacements.length > 0 ? `${replacements.length} reemplazo(s) disponible(s).` : "Sin reemplazos."}`,
    confidenceExplanation: `Datos de disponibilidad${production ? " + produccion" : ""} + portfolio de vendedor.`,
  };
}

function actionDescription(action: ReplenishmentAction, replacements: ReplenishmentReplacement[]): string {
  switch (action) {
    case "wait_for_production": return "Esperar produccion activa. No retirar de maleta.";
    case "review_production": return "Produccion retrasada. Revisar avance y considerar reemplazo temporal.";
    case "replace_reference": return `Reemplazar en maleta con ${replacements[0]?.referenceCode ?? "alternativa"} del mismo SubGrupo.`;
    case "remove_from_portfolio": return "Retirar referencia de maleta. Sin stock ni produccion.";
    case "suggest_production": return "Sin produccion activa. Sugerir nueva OP.";
    case "replenish_from_warehouse": return "Reponer desde Bodega 01.";
    case "transfer_between_locations": return "Transferir desde ubicacion con excedente.";
    case "monitor": return "Monitorear. Sin accion inmediata.";
    case "no_action_needed": return "Sin accion necesaria.";
  }
}

function buildPortfolioEvidence(
  item: VendorInventoryItem,
  avail: AvailabilityRow | undefined,
  production: ProductionReferenceFlow | undefined,
  vendor: LiveVendorProfile,
): ReplenishmentEvidence[] {
  const now = new Date().toISOString();
  const evidence: ReplenishmentEvidence[] = [];

  if (avail) {
    evidence.push({
      type: "AVAILABILITY_DATA",
      description: `Bodega 01: existencia=${avail.existenciaBodega01}, pedidos=${avail.pedidosPendientes}, disponible=${avail.disponibleReal}.`,
      source: "commercial-availability",
      observedAt: now,
    });
  }

  if (production) {
    evidence.push({
      type: "PRODUCTION_DATA",
      description: `Produccion: ${production.stageState.currentStage.stageLabel}. ${production.quantityInProduction} unidades en proceso.`,
      source: "production-flow",
      observedAt: now,
    });
  }

  evidence.push({
    type: "VENDOR_PORTFOLIO",
    description: `Vendedor ${vendor.vendorName}: ${item.quantityInPortfolio} unidades en maleta (${vendor.location.locationName}).`,
    source: "live-vendor",
    observedAt: now,
  });

  return evidence;
}

function buildSource(
  avail: AvailabilityRow | undefined,
  production: ProductionReferenceFlow | undefined,
): ReplenishmentSource {
  if (production?.stageState.hasActiveOP) {
    return {
      sourceType: "PRODUCTION",
      locationCode: "04",
      locationName: "Producto en Proceso",
      availableStock: production.quantityInProduction,
      reservedStock: null,
      netAvailable: production.quantityInProduction,
    };
  }

  if (avail && avail.existenciaBodega01 > 0) {
    return {
      sourceType: "MAIN_WAREHOUSE",
      locationCode: "01",
      locationName: "Bodega Principal",
      availableStock: avail.existenciaBodega01,
      reservedStock: avail.pedidosPendientes,
      netAvailable: avail.disponibleReal,
    };
  }

  return {
    sourceType: "NONE",
    locationCode: null,
    locationName: null,
    availableStock: null,
    reservedStock: null,
    netAvailable: null,
  };
}

function buildPortfolioImpact(
  vendor: LiveVendorProfile,
  item: VendorInventoryItem,
  avail: AvailabilityRow | undefined,
): ReplenishmentImpact {
  const isOutOfStock = (avail?.existenciaBodega01 ?? 0) === 0;
  return {
    vendorsAffected: 1,
    storesAffected: 0,
    isCommerciallyCritical: isOutOfStock,
    quantityAffected: item.quantityInPortfolio,
    description: `Vendedor ${vendor.vendorName} afectado. Referencia ${isOutOfStock ? "agotada" : "critica"}.`,
  };
}

// ── Confidence ─────────────────────────────────────────────────────────────

function computeConfidence(hasAvail: boolean, hasProd: boolean, hasVendor: boolean): number {
  let score = 30;
  if (hasAvail) score += 30;
  if (hasProd) score += 20;
  if (hasVendor) score += 15;
  return Math.min(95, score);
}

function buildSnapshotConfidence(
  availRows: AvailabilityRow[],
  prodFlow: ProductionFlowSnapshot | null,
  vendors: LiveVendorProfile[],
): ReplenishmentConfidence {
  let score = 10;
  const sources: string[] = [];
  if (availRows.length > 0) { score += 35; sources.push("disponibilidad"); }
  if (prodFlow) { score += 25; sources.push("produccion"); }
  if (vendors.length > 0) { score += 20; sources.push("vendedores"); }

  return {
    score: Math.min(95, score),
    reason: sources.length > 0
      ? `Datos de ${sources.join(" + ")}. ${availRows.length} ref(s) con disponibilidad, ${vendors.length} vendedor(es).`
      : "Sin datos disponibles.",
    sourceCount: sources.length,
  };
}

// ── Summary ────────────────────────────────────────────────────────────────

function buildSummary(recs: ReplenishmentRecommendation[], vendors: LiveVendorProfile[]): ReplenishmentSummary {
  const affectedVendors = new Set<string>();
  const affectedRefs = new Set<string>();

  for (const r of recs) {
    affectedRefs.add(r.referenceCode);
    if (r.target.entityId) affectedVendors.add(r.target.entityId);
  }

  return {
    totalRecommendations: recs.length,
    criticalCount: recs.filter((r) => r.urgency === "critical").length,
    highCount: recs.filter((r) => r.urgency === "high").length,
    mediumCount: recs.filter((r) => r.urgency === "medium").length,
    lowCount: recs.filter((r) => r.urgency === "low").length,
    replenishCount: recs.filter((r) => r.action === "replenish_from_warehouse").length,
    replaceCount: recs.filter((r) => r.action === "replace_reference").length,
    removeCount: recs.filter((r) => r.action === "remove_from_portfolio").length,
    waitProductionCount: recs.filter((r) => r.action === "wait_for_production").length,
    suggestProductionCount: recs.filter((r) => r.action === "suggest_production").length,
    transferCount: recs.filter((r) => r.action === "transfer_between_locations").length,
    monitorCount: recs.filter((r) => r.action === "monitor").length,
    portfolioTargets: recs.filter((r) => r.target.targetType === "PORTFOLIO").length,
    storeTargets: recs.filter((r) => r.target.targetType === "STORE").length,
    warehouseTargets: recs.filter((r) => r.target.targetType === "MAIN_WAREHOUSE").length,
    totalVendorsAffected: affectedVendors.size,
    totalReferencesAffected: affectedRefs.size,
  };
}

// ── Phase 10: Decision Engine Integration ──────────────────────────────────

/** Convert recommendations to decision inputs. */
export function buildReplenishmentDecisionInputs(
  recommendations: ReplenishmentRecommendation[],
): ReplenishmentDecisionInput[] {
  return recommendations
    .filter((r) => r.urgency === "critical" || r.urgency === "high")
    .map((r) => ({
      decisionType: deriveDecisionType(r.action),
      referenceCode: r.referenceCode,
      target: r.target,
      recommendedAction: r.action,
      urgency: r.urgency,
      confidence: r.confidence.score,
      options: buildDecisionOptions(r),
      suggestedOnly: true as const,
    }));
}

function deriveDecisionType(action: ReplenishmentAction): "replenish_or_wait" | "replace_or_produce" | "transfer_or_hold" | "produce_or_skip" {
  switch (action) {
    case "wait_for_production":
    case "review_production":
      return "replenish_or_wait";
    case "replace_reference":
    case "suggest_production":
      return "replace_or_produce";
    case "transfer_between_locations":
      return "transfer_or_hold";
    default:
      return "produce_or_skip";
  }
}

function buildDecisionOptions(rec: ReplenishmentRecommendation): ReplenishmentDecisionOption[] {
  const options: ReplenishmentDecisionOption[] = [];

  if (rec.productionContext?.hasActiveProduction) {
    options.push({
      label: "Esperar produccion",
      action: "wait_for_production",
      pros: ["Produccion activa existente", "No requiere nueva OP"],
      cons: ["Demora hasta completar", "Stock critico mientras tanto"],
    });
  }

  if (rec.replacementCandidates.length > 0) {
    options.push({
      label: "Reemplazar referencia",
      action: "replace_reference",
      pros: [`${rec.replacementCandidates.length} reemplazo(s) disponible(s)`, "Accion inmediata"],
      cons: ["No resuelve el agotado original", "Cliente puede preferir la referencia original"],
    });
  }

  if (!rec.productionContext?.hasActiveProduction) {
    options.push({
      label: "Sugerir produccion",
      action: "suggest_production",
      pros: ["Resuelve el agotado de raiz"],
      cons: ["Tiempo de produccion requerido", "Costo de nueva OP"],
    });
  }

  return options;
}

// ── Phase 11: Executive Report ─────────────────────────────────────────────

/** Build executive-consumable report from snapshot. */
export function buildReplenishmentExecutiveReport(
  snapshot: ReplenishmentSnapshot,
): ReplenishmentExecutiveReport {
  const recs = snapshot.recommendations;

  return {
    orgSlug: snapshot.orgSlug,
    computedAt: snapshot.computedAt,
    toReplenish: recs.filter((r) => r.action === "replenish_from_warehouse"),
    toRemoveFromPortfolios: recs.filter((r) => r.action === "remove_from_portfolio"),
    withReplacements: recs.filter((r) => r.replacementCandidates.length > 0),
    toWaitForProduction: recs.filter((r) => r.action === "wait_for_production"),
    toProduction: recs.filter((r) => r.action === "suggest_production"),
    storesNeedingReplenishment: recs.filter((r) => r.target.targetType === "STORE"),
    recommendedTransfers: recs.filter((r) => r.action === "transfer_between_locations"),
    summary: snapshot.summary,
    confidence: snapshot.confidence,
  };
}

// ── Phase 12: David Readiness ──────────────────────────────────────────────

/** Answer David queries about replenishment. */
export function answerReplenishmentDavidQuery(
  snapshot: ReplenishmentSnapshot,
  queryType: ReplenishmentDavidQueryType,
): ReplenishmentDavidAnswer {
  const caveats: string[] = [];
  if (snapshot.confidence.score < 50) {
    caveats.push("Datos limitados — recomendaciones con confianza reducida.");
  }

  switch (queryType) {
    case "what_to_replenish_today":
      return buildWhatToReplenishAnswer(snapshot, caveats);
    case "vendor_most_critical":
      return buildVendorMostCriticalAnswer(snapshot, caveats);
    case "remove_from_portfolios":
      return buildRemoveFromPortfoliosAnswer(snapshot, caveats);
    case "add_to_portfolios":
      return buildAddToPortfoliosAnswer(snapshot, caveats);
    case "out_of_stock_with_production":
      return buildOOSWithProductionAnswer(snapshot, caveats);
    case "out_of_stock_need_production":
      return buildOOSNeedProductionAnswer(snapshot, caveats);
  }
}

function buildWhatToReplenishAnswer(snapshot: ReplenishmentSnapshot, caveats: string[]): ReplenishmentDavidAnswer {
  const urgent = snapshot.recommendations.filter((r) => r.urgency === "critical" || r.urgency === "high");
  return {
    queryType: "what_to_replenish_today",
    answer: urgent.length > 0
      ? `${urgent.length} referencia(s) requieren atencion urgente hoy.`
      : "No hay reposiciones urgentes pendientes.",
    references: urgent.map(recToDavidRef),
    totalMatches: urgent.length,
    confidence: snapshot.confidence.score,
    caveats,
  };
}

function buildVendorMostCriticalAnswer(snapshot: ReplenishmentSnapshot, caveats: string[]): ReplenishmentDavidAnswer {
  // Count critical recs per vendor
  const byVendor = new Map<string, { name: string; count: number }>();
  for (const r of snapshot.recommendations) {
    if (r.target.targetType !== "PORTFOLIO" || !r.target.entityId) continue;
    if (r.urgency !== "critical" && r.urgency !== "high") continue;
    const existing = byVendor.get(r.target.entityId) ?? { name: r.target.entityName ?? r.target.entityId, count: 0 };
    existing.count++;
    byVendor.set(r.target.entityId, existing);
  }

  const sorted = Array.from(byVendor.entries()).sort((a, b) => b[1].count - a[1].count);
  const top = sorted[0];

  return {
    queryType: "vendor_most_critical",
    answer: top
      ? `${top[1].name} tiene ${top[1].count} referencia(s) critica(s) en maleta.`
      : "Ningun vendedor tiene referencias criticas actualmente.",
    references: sorted.map(([vendorId, data]) => ({
      referenceCode: vendorId,
      description: data.name,
      subGrupo: "",
      subLinea: "",
      action: `${data.count} ref(s) critica(s)`,
      detail: `Vendedor con mas referencias criticas.`,
      urgency: "critical" as ReplenishmentUrgency,
    })),
    totalMatches: sorted.length,
    confidence: snapshot.confidence.score,
    caveats,
  };
}

function buildRemoveFromPortfoliosAnswer(snapshot: ReplenishmentSnapshot, caveats: string[]): ReplenishmentDavidAnswer {
  const toRemove = snapshot.recommendations.filter(
    (r) => r.target.targetType === "PORTFOLIO" &&
      (r.action === "replace_reference" || r.action === "remove_from_portfolio") &&
      r.reason.category === "out_of_stock",
  );
  return {
    queryType: "remove_from_portfolios",
    answer: toRemove.length > 0
      ? `${toRemove.length} referencia(s) deberian salir de maletas (agotadas, sin reposicion posible).`
      : "No hay referencias que deban salir de maletas actualmente.",
    references: toRemove.map(recToDavidRef),
    totalMatches: toRemove.length,
    confidence: snapshot.confidence.score,
    caveats,
  };
}

function buildAddToPortfoliosAnswer(snapshot: ReplenishmentSnapshot, caveats: string[]): ReplenishmentDavidAnswer {
  const toAdd = snapshot.recommendations.filter(
    (r) => r.action === "replace_reference" && r.replacementCandidates.length > 0,
  );
  return {
    queryType: "add_to_portfolios",
    answer: toAdd.length > 0
      ? `${toAdd.length} referencia(s) tienen reemplazos que podrian entrar a maletas.`
      : "No se identificaron nuevas referencias para agregar a maletas.",
    references: toAdd.flatMap((r) =>
      r.replacementCandidates.slice(0, 2).map((c) => ({
        referenceCode: c.referenceCode,
        description: c.description ?? "",
        subGrupo: c.subGrupo,
        subLinea: c.subLinea,
        action: `Reemplazo de ${r.referenceCode}`,
        detail: c.reason,
        urgency: r.urgency,
      })),
    ),
    totalMatches: toAdd.length,
    confidence: snapshot.confidence.score,
    caveats,
  };
}

function buildOOSWithProductionAnswer(snapshot: ReplenishmentSnapshot, caveats: string[]): ReplenishmentDavidAnswer {
  const matches = snapshot.recommendations.filter(
    (r) => r.productionContext?.hasActiveProduction && r.reason.category === "out_of_stock",
  );
  return {
    queryType: "out_of_stock_with_production",
    answer: matches.length > 0
      ? `${matches.length} referencia(s) agotada(s) ya tienen produccion activa.`
      : "Ninguna referencia agotada tiene produccion activa.",
    references: matches.map(recToDavidRef),
    totalMatches: matches.length,
    confidence: snapshot.confidence.score,
    caveats,
  };
}

function buildOOSNeedProductionAnswer(snapshot: ReplenishmentSnapshot, caveats: string[]): ReplenishmentDavidAnswer {
  const matches = snapshot.recommendations.filter(
    (r) => r.action === "suggest_production" && r.reason.category === "out_of_stock",
  );
  return {
    queryType: "out_of_stock_need_production",
    answer: matches.length > 0
      ? `${matches.length} referencia(s) agotada(s) sin produccion — considerar nueva OP.`
      : "Todas las referencias agotadas ya tienen produccion o reemplazo.",
    references: matches.map(recToDavidRef),
    totalMatches: matches.length,
    confidence: snapshot.confidence.score,
    caveats,
  };
}

function recToDavidRef(r: ReplenishmentRecommendation): ReplenishmentDavidReference {
  return {
    referenceCode: r.referenceCode,
    description: r.description,
    subGrupo: r.subGrupo,
    subLinea: r.subLinea,
    action: actionDescription(r.action, r.replacementCandidates),
    detail: r.reasoning.whatRecommendation,
    urgency: r.urgency,
  };
}

// ── Phase 13: Knowledge Graph Relations ────────────────────────────────────

/** Build knowledge graph relations from replenishment snapshot. */
export function buildReplenishmentKnowledgeRelations(
  snapshot: ReplenishmentSnapshot,
): ReplenishmentKnowledgeRelation[] {
  const relations: ReplenishmentKnowledgeRelation[] = [];

  for (const rec of snapshot.recommendations) {
    // InventoryLocation → ReplenishmentNeed
    relations.push({
      fromType: "InventoryLocation",
      fromId: rec.target.locationCode,
      toType: "ReplenishmentNeed",
      toId: rec.id,
      relationType: "needs_replenishment",
    });

    // Product → ReplenishmentRecommendation
    relations.push({
      fromType: "Product",
      fromId: rec.referenceCode,
      toType: "ReplenishmentRecommendation",
      toId: rec.id,
      relationType: "has_recommendation",
    });

    // Vendor → ReplenishmentRecommendation
    if (rec.target.entityId && rec.target.targetType === "PORTFOLIO") {
      relations.push({
        fromType: "Vendor",
        fromId: rec.target.entityId,
        toType: "ReplenishmentRecommendation",
        toId: rec.id,
        relationType: "affects_vendor",
      });
    }

    // ProductionFlow → ReplenishmentDecision
    if (rec.productionContext?.hasActiveProduction) {
      relations.push({
        fromType: "ProductionFlow",
        fromId: rec.referenceCode,
        toType: "ReplenishmentDecision",
        toId: rec.id,
        relationType: "informed_by_production",
      });
    }
  }

  return relations;
}
