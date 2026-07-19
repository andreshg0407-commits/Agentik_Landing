/**
 * production-flow-engine.ts
 *
 * PRODUCTION-FLOW-INTELLIGENCE-01 — Phases 3-8: Core Flow Engine.
 *
 * Builds ProductionFlowSnapshot from:
 *   - ProductionInProgressReport (existing engine)
 *   - CommercialAvailabilityReport (existing engine)
 *   - LiveVendor data (optional)
 *   - CEO replacement rules
 *
 * Phases covered:
 *   3: Stage inference improvement (delegates to existing + enriches)
 *   4: Production flow snapshot per reference
 *   5: Out-of-stock WITH active production
 *   6: Out-of-stock WITHOUT active production
 *   7: Production delay risk
 *   8: Replacement + production decision support
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type {
  SagProductionRecord,
  ProductionRow,
  ProductionInProgressReport,
} from "./production-types";
import { inferProductionStage, DEFAULT_PRODUCTION_STAGES } from "./production-stage-inference";
import { buildDocumentEvidence } from "./production-document-mapping";
import type { AvailabilityRow, MaletaReplacementRule } from "@/lib/commercial-intelligence/availability-types";
import { CASTILLITOS_REPLACEMENT_RULES } from "@/lib/commercial-intelligence/maleta-replacement-engine";

import type {
  ProductionFlowSnapshot,
  ProductionReferenceFlow,
  ProductionOrderFlow,
  ProductionStageState,
  ProductionFlowStatus,
  ProductionAvailabilityImpact,
  ProductionAvailabilityStatus,
  ProductionDelayRisk,
  ProductionDelayRiskLevel,
  ProductionRecoverySignal,
  ProductionRecoveryType,
  ProductionReadiness,
  ProductionFlowRecommendation,
  ProductionRecommendationAction,
  ProductionReplacementCandidate,
  ProductionDocumentEvidence,
  ProductionFlowConfidence,
  ProductionFlowSummary,
  ProductionFlowSubLineaSummary,
  ProductionDelayConfig,
  ProductionFlowExecutiveReport,
  ProductionFlowDavidAnswer,
  ProductionFlowDavidQueryType,
  ProductionFlowDavidReference,
} from "./production-flow-types";
import { DEFAULT_DELAY_CONFIG } from "./production-flow-types";

// ── Build Production Flow Snapshot ─────────────────────────────────────────

/** Build a complete production flow snapshot. */
export function buildProductionFlowSnapshot(opts: {
  orgSlug: string;
  /** Production report (from existing engine). */
  productionReport: ProductionInProgressReport;
  /** Raw SAG production records (for document evidence). */
  productionRecords: SagProductionRecord[];
  /** Commercial availability rows (Bodega 01). */
  availabilityRows: AvailabilityRow[];
  /** CEO replacement rules. */
  rules?: MaletaReplacementRule[];
  /** Delay risk configuration. */
  delayConfig?: ProductionDelayConfig;
  /** Vendor IDs affected per reference (from LiveVendor, optional). */
  vendorsByReference?: Map<string, string[]>;
}): ProductionFlowSnapshot {
  const {
    orgSlug,
    productionReport,
    productionRecords,
    availabilityRows,
    rules = CASTILLITOS_REPLACEMENT_RULES,
    delayConfig = DEFAULT_DELAY_CONFIG,
    vendorsByReference = new Map(),
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

  // Index production records by reference
  const recordsByRef = new Map<string, SagProductionRecord[]>();
  for (const rec of productionRecords) {
    const key = rec.reference;
    if (!recordsByRef.has(key)) recordsByRef.set(key, []);
    recordsByRef.get(key)!.push(rec);
  }

  // Build reference flows from production report rows
  const referenceFlows: ProductionReferenceFlow[] = productionReport.rows.map((row) => {
    const records = recordsByRef.get(row.reference) ?? [];
    const avail = availByRef.get(row.reference);
    const affectedVendors = vendorsByReference.get(row.reference) ?? [];

    return buildReferenceFlow({
      row,
      records,
      avail,
      rules,
      delayConfig,
      affectedVendors,
      availBySubGrupo,
    });
  });

  // Phase 6: Detect out-of-stock references WITHOUT production
  const refsInProduction = new Set(referenceFlows.map((f) => f.referenceCode));
  const outOfStockWithoutProduction: ProductionReferenceFlow[] = [];

  for (const avail of availabilityRows) {
    if (refsInProduction.has(avail.reference)) continue;
    if (avail.existenciaBodega01 > 0) continue; // Not out of stock

    const rule = rules.find((r) => avail.subLinea.toUpperCase().includes(r.subLinea.toUpperCase()));
    const isCritical = rule ? avail.existenciaBodega01 <= rule.threshold : avail.existenciaBodega01 === 0;
    if (!isCritical && avail.existenciaBodega01 > 0) continue;

    const affectedVendors = vendorsByReference.get(avail.reference) ?? [];

    outOfStockWithoutProduction.push(buildMissingProductionFlow({
      avail,
      rules,
      affectedVendors,
      availBySubGrupo,
    }));
  }

  const allFlows = [...referenceFlows, ...outOfStockWithoutProduction];

  const summary = buildFlowSummary(allFlows);
  const confidence = buildSnapshotConfidence(productionReport, availabilityRows);

  return {
    orgSlug,
    computedAt: new Date().toISOString(),
    referenceFlows: allFlows,
    summary,
    confidence,
  };
}

// ── Build Reference Flow (has production) ──────────────────────────────────

function buildReferenceFlow(opts: {
  row: ProductionRow;
  records: SagProductionRecord[];
  avail: AvailabilityRow | undefined;
  rules: MaletaReplacementRule[];
  delayConfig: ProductionDelayConfig;
  affectedVendors: string[];
  availBySubGrupo: Map<string, AvailabilityRow[]>;
}): ProductionReferenceFlow {
  const { row, records, avail, rules, delayConfig, affectedVendors, availBySubGrupo } = opts;

  // Build document evidence
  const documentEvidence = records.map((rec) =>
    buildDocumentEvidence({
      docType: rec.docType,
      documentDate: rec.fechaDocumento,
      quantity: rec.cantidad,
      isClosed: rec.cerrado,
      opNumber: rec.opNumero ?? null,
    }),
  );

  // Build order flows
  const ordersByOp = new Map<string, SagProductionRecord[]>();
  for (const rec of records) {
    const opKey = rec.opNumero ?? "__no_op__";
    if (!ordersByOp.has(opKey)) ordersByOp.set(opKey, []);
    ordersByOp.get(opKey)!.push(rec);
  }

  const activeOrders: ProductionOrderFlow[] = [];
  const closedOrders: ProductionOrderFlow[] = [];

  for (const [opNum, opRecords] of ordersByOp) {
    const opFlow = buildOrderFlow(opNum, opRecords);
    if (opFlow.isClosed) {
      closedOrders.push(opFlow);
    } else {
      activeOrders.push(opFlow);
    }
  }

  // Stage state (Phase 3)
  const stageState = buildStageState(row, records);

  // Availability impact (Phase 5)
  const availabilityImpact = buildAvailabilityImpact(avail, rules, affectedVendors);

  // Delay risk (Phase 7)
  const delayRisk = assessDelayRisk(row, stageState, records, delayConfig);

  // Recovery signal
  const recoverySignal = buildRecoverySignal(row, stageState, availabilityImpact);

  // Recommendation (Phase 8)
  const recommendation = buildRecommendation({
    stageState,
    availabilityImpact,
    delayRisk,
    recoverySignal,
    avail,
    rules,
    availBySubGrupo,
    subGrupo: row.subGrupo,
    subLinea: row.subLinea,
    referenceCode: row.reference,
  });

  // Confidence
  const confidence = buildReferenceConfidence(documentEvidence, avail !== undefined);

  return {
    referenceCode: row.reference,
    description: row.description,
    subGrupo: row.subGrupo,
    subLinea: row.subLinea,
    activeOrders,
    closedOrders,
    quantityInProduction: row.cantidadEnProceso,
    quantityRecentlyCompleted: closedOrders.reduce((s, o) => s + o.quantityOrdered, 0),
    quantityInBodega04: records
      .filter((r) => r.bodega === "04")
      .reduce((s, r) => s + Math.abs(r.cantidad), 0),
    stageState,
    availabilityImpact,
    delayRisk,
    recoverySignal,
    recommendation,
    documentEvidence,
    confidence,
  };
}

// ── Build Order Flow ───────────────────────────────────────────────────────

function buildOrderFlow(opNumber: string, records: SagProductionRecord[]): ProductionOrderFlow {
  const opRecords = records.filter((r) => r.docType === "OP");
  const isClosed = opRecords.length > 0 ? opRecords.every((r) => r.cerrado) : records.every((r) => r.cerrado);
  const activationDate = records.reduce(
    (earliest, r) => (r.fechaDocumento < earliest ? r.fechaDocumento : earliest),
    records[0].fechaDocumento,
  );
  const now = Date.now();
  const daysInProduction = Math.max(
    0,
    Math.floor((now - new Date(activationDate).getTime()) / (1000 * 60 * 60 * 24)),
  );
  const quantityOrdered = opRecords.length > 0
    ? opRecords.reduce((s, r) => s + r.cantidad, 0)
    : records.reduce((s, r) => s + Math.abs(r.cantidad), 0);

  const stageInference = inferProductionStage({ records, stages: DEFAULT_PRODUCTION_STAGES });

  const documents = records.map((rec) =>
    buildDocumentEvidence({
      docType: rec.docType,
      documentDate: rec.fechaDocumento,
      quantity: rec.cantidad,
      isClosed: rec.cerrado,
      opNumber: rec.opNumero ?? null,
    }),
  );

  return {
    opNumber: opNumber === "__no_op__" ? "\u2014" : opNumber,
    status: isClosed ? "closed" : "open",
    activationDate,
    daysInProduction,
    quantityOrdered,
    isClosed,
    stageInference,
    documents,
  };
}

// ── Phase 3: Stage State ───────────────────────────────────────────────────

function buildStageState(row: ProductionRow, records: SagProductionRecord[]): ProductionStageState {
  const docTypes = new Set(records.map((r) => r.docType));
  const hasET = docTypes.has("ET");

  // Check for recent ET (within 30 days)
  const now = Date.now();
  const etRecords = records.filter((r) => r.docType === "ET");
  const hasRecentET = etRecords.some(
    (r) => (now - new Date(r.fechaDocumento).getTime()) / (1000 * 60 * 60 * 24) <= 30,
  );

  let productionStatus: ProductionFlowStatus;
  switch (row.status) {
    case "completado":
      productionStatus = hasRecentET ? "completing" : "completed";
      break;
    case "detenido":
      productionStatus = "stalled";
      break;
    case "indeterminado":
      productionStatus = "indeterminate";
      break;
    case "en_proceso":
    default:
      productionStatus = "active";
      break;
  }

  return {
    currentStage: row.etapaActual,
    hasActiveOP: docTypes.has("OP") && !records.filter((r) => r.docType === "OP").every((r) => r.cerrado),
    hasCN: docTypes.has("CN"),
    hasExternalProcessing: docTypes.has("PC") || docTypes.has("EC"),
    hasServiceDocuments: docTypes.has("T1") || docTypes.has("T2") || docTypes.has("Y1"),
    hasET,
    hasRecentET,
    productionStatus,
  };
}

// ── Phase 5: Availability Impact ───────────────────────────────────────────

function buildAvailabilityImpact(
  avail: AvailabilityRow | undefined,
  rules: MaletaReplacementRule[],
  affectedVendors: string[],
): ProductionAvailabilityImpact {
  if (!avail) {
    return {
      existenciaBodega01: null,
      pedidosPendientes: null,
      disponibleReal: null,
      availabilityStatus: "unknown",
      isOutOfStock: false,
      isCritical: false,
      ceoThreshold: null,
      ceoRuleSubLinea: null,
      affectedVendorIds: affectedVendors,
    };
  }

  const rule = rules.find((r) => avail.subLinea.toUpperCase().includes(r.subLinea.toUpperCase()));
  const isOutOfStock = avail.existenciaBodega01 === 0;
  const isCritical = rule ? avail.existenciaBodega01 <= rule.threshold : isOutOfStock;

  let availabilityStatus: ProductionAvailabilityStatus;
  if (isOutOfStock) availabilityStatus = "out_of_stock";
  else if (isCritical) availabilityStatus = "critical";
  else if (rule && avail.existenciaBodega01 <= rule.threshold * 2) availabilityStatus = "low";
  else availabilityStatus = "adequate";

  return {
    existenciaBodega01: avail.existenciaBodega01,
    pedidosPendientes: avail.pedidosPendientes,
    disponibleReal: avail.disponibleReal,
    availabilityStatus,
    isOutOfStock,
    isCritical,
    ceoThreshold: rule?.threshold ?? null,
    ceoRuleSubLinea: rule?.subLinea ?? null,
    affectedVendorIds: affectedVendors,
  };
}

// ── Phase 7: Delay Risk ────────────────────────────────────────────────────

function assessDelayRisk(
  row: ProductionRow,
  stageState: ProductionStageState,
  records: SagProductionRecord[],
  config: ProductionDelayConfig,
): ProductionDelayRisk {
  const dias = row.diasEnProduccion;
  const evidence: string[] = [];

  // Check stalled
  const isStalled = stageState.productionStatus === "stalled";
  if (isStalled) evidence.push("Produccion detenida — sin movimientos recientes.");

  // Check indeterminate
  const isStageIndeterminate = !stageState.currentStage.confidence.determined;
  if (isStageIndeterminate) evidence.push("Etapa de produccion indeterminada.");

  // Check high WIP without ET
  const bodega04Qty = records
    .filter((r) => r.bodega === "04")
    .reduce((s, r) => s + Math.abs(r.cantidad), 0);
  const hasHighWipWithoutET = bodega04Qty >= config.highWipThreshold && !stageState.hasRecentET;
  if (hasHighWipWithoutET) {
    evidence.push(`${bodega04Qty} unidades en Bodega 04 sin ET reciente.`);
  }

  // Determine risk level
  let level: ProductionDelayRiskLevel = "none";
  let thresholdExceeded: number | null = null;

  if (dias >= config.criticalRiskDays || (isStalled && dias > config.highRiskDays)) {
    level = "critical";
    thresholdExceeded = config.criticalRiskDays;
    evidence.push(`${dias} dias en produccion — excede umbral critico (${config.criticalRiskDays}).`);
  } else if (dias >= config.highRiskDays || isStalled) {
    level = "high";
    thresholdExceeded = config.highRiskDays;
    evidence.push(`${dias} dias en produccion — excede umbral alto (${config.highRiskDays}).`);
  } else if (dias >= config.mediumRiskDays || hasHighWipWithoutET) {
    level = "medium";
    thresholdExceeded = config.mediumRiskDays;
    if (dias >= config.mediumRiskDays) {
      evidence.push(`${dias} dias en produccion — excede umbral medio (${config.mediumRiskDays}).`);
    }
  } else if (dias >= config.mediumRiskDays * 0.7) {
    level = "low";
  }

  // Confidence
  let confidence = 70;
  if (evidence.length >= 3) confidence = 85;
  else if (evidence.length >= 2) confidence = 80;
  if (isStageIndeterminate) confidence -= 15;

  return {
    level,
    daysInProduction: dias,
    thresholdExceeded,
    isStalled,
    isStageIndeterminate,
    hasHighWipWithoutET,
    evidence,
    confidence: Math.max(0, Math.min(95, confidence)),
  };
}

// ── Recovery Signal ────────────────────────────────────────────────────────

function buildRecoverySignal(
  row: ProductionRow,
  stageState: ProductionStageState,
  availabilityImpact: ProductionAvailabilityImpact,
): ProductionRecoverySignal | null {
  // Only relevant if the reference has availability issues
  if (!availabilityImpact.isOutOfStock && !availabilityImpact.isCritical) return null;

  let recoveryType: ProductionRecoveryType;
  let estimatedReadiness: ProductionReadiness;
  const evidence: string[] = [];

  if (stageState.hasRecentET) {
    recoveryType = "production_completing";
    estimatedReadiness = "ready_soon";
    evidence.push("ET reciente encontrado — producto entrando a Bodega 01.");
  } else if (stageState.hasET) {
    recoveryType = "production_completing";
    estimatedReadiness = "in_progress";
    evidence.push("ET encontrado (no reciente) — verificar estado actual.");
  } else if (stageState.productionStatus === "stalled") {
    recoveryType = "production_stalled";
    estimatedReadiness = "unlikely";
    evidence.push("Produccion detenida — recuperacion improbable sin intervencion.");
  } else if (stageState.hasActiveOP) {
    recoveryType = "production_in_progress";

    // Estimate readiness based on stage
    const stageOrder = stageState.currentStage.stageOrder;
    if (stageOrder >= 4) {
      estimatedReadiness = "ready_soon";
      evidence.push(`Etapa ${stageState.currentStage.stageLabel} — proxima a terminacion.`);
    } else if (stageOrder >= 2) {
      estimatedReadiness = "in_progress";
      evidence.push(`Etapa ${stageState.currentStage.stageLabel} — en proceso.`);
    } else {
      estimatedReadiness = "uncertain";
      evidence.push("OP activa pero etapa temprana.");
    }
  } else {
    return null;
  }

  const confidence = stageState.hasRecentET ? 85 : stageState.hasActiveOP ? 60 : 30;

  return {
    referenceCode: row.reference,
    recoveryType,
    expectedQuantity: row.cantidadEnProceso,
    estimatedReadiness,
    evidence,
    confidence,
  };
}

// ── Phase 8: Recommendation ────────────────────────────────────────────────

function buildRecommendation(opts: {
  stageState: ProductionStageState;
  availabilityImpact: ProductionAvailabilityImpact;
  delayRisk: ProductionDelayRisk;
  recoverySignal: ProductionRecoverySignal | null;
  avail: AvailabilityRow | undefined;
  rules: MaletaReplacementRule[];
  availBySubGrupo: Map<string, AvailabilityRow[]>;
  subGrupo: string;
  subLinea: string;
  referenceCode: string;
}): ProductionFlowRecommendation {
  const { stageState, availabilityImpact, delayRisk, recoverySignal, availBySubGrupo, subGrupo, subLinea, referenceCode, rules } = opts;

  // Find replacement candidates from same SubGrupo
  const rule = rules.find((r) => subLinea.toUpperCase().includes(r.subLinea.toUpperCase()));
  const threshold = rule?.threshold ?? 0;
  const replacements = findReplacementCandidates(referenceCode, subGrupo, subLinea, threshold, availBySubGrupo);

  // Determine action
  let action: ProductionRecommendationAction;
  let description: string;
  let urgency: "critical" | "high" | "medium" | "low" | "none";

  if (!availabilityImpact.isOutOfStock && !availabilityImpact.isCritical) {
    // Stock adequate
    if (delayRisk.level === "critical" || delayRisk.level === "high") {
      action = "review_production";
      description = `Produccion con riesgo de retraso (${delayRisk.daysInProduction} dias). Stock actual adecuado pero revisar avance.`;
      urgency = delayRisk.level === "critical" ? "high" : "medium";
    } else {
      action = "monitor";
      description = "Produccion en curso. Stock adecuado.";
      urgency = "none";
    }
  } else if (stageState.hasActiveOP) {
    // Out of stock WITH production
    if (recoverySignal?.estimatedReadiness === "ready_soon") {
      action = "wait_for_production";
      description = `Produccion proxima a completar. ${recoverySignal.evidence[0] ?? ""}`;
      urgency = availabilityImpact.isOutOfStock ? "medium" : "low";
    } else if (delayRisk.level === "critical" || delayRisk.level === "high") {
      action = "review_production";
      description = `Agotado con produccion retrasada (${delayRisk.daysInProduction} dias). Revisar avance y considerar reemplazo temporal en maletas.`;
      urgency = "critical";
    } else {
      action = "wait_for_production";
      description = `Agotado con produccion activa. Etapa: ${stageState.currentStage.stageLabel}. Monitorear avance.`;
      urgency = availabilityImpact.isOutOfStock ? "high" : "medium";
    }
  } else {
    // Out of stock WITHOUT production
    action = replacements.length > 0 ? "suggest_replacement" : "suggest_production";
    description = availabilityImpact.isOutOfStock
      ? `Sin existencia en Bodega 01 y sin produccion activa. ${replacements.length > 0 ? `${replacements.length} reemplazo(s) disponible(s) del mismo SubGrupo.` : "Sugerir nueva OP."}`
      : `Stock critico y sin produccion activa. Considerar nueva OP o reemplazo.`;
    urgency = availabilityImpact.isOutOfStock ? "critical" : "high";
  }

  // Confidence
  let confidence = 70;
  if (availabilityImpact.existenciaBodega01 !== null) confidence += 10;
  if (stageState.currentStage.confidence.determined) confidence += 10;
  confidence = Math.min(95, confidence);

  return {
    action,
    description,
    urgency,
    replacementCandidates: replacements,
    confidence,
    suggestedOnly: true,
  };
}

function findReplacementCandidates(
  currentReference: string,
  subGrupo: string,
  subLinea: string,
  threshold: number,
  availBySubGrupo: Map<string, AvailabilityRow[]>,
): ProductionReplacementCandidate[] {
  const sameGroup = availBySubGrupo.get(subGrupo) ?? [];

  return sameGroup
    .filter(
      (row) =>
        row.reference !== currentReference &&
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

// ── Phase 6: Missing Production Flow ───────────────────────────────────────

function buildMissingProductionFlow(opts: {
  avail: AvailabilityRow;
  rules: MaletaReplacementRule[];
  affectedVendors: string[];
  availBySubGrupo: Map<string, AvailabilityRow[]>;
}): ProductionReferenceFlow {
  const { avail, rules, affectedVendors, availBySubGrupo } = opts;

  const rule = rules.find((r) => avail.subLinea.toUpperCase().includes(r.subLinea.toUpperCase()));
  const threshold = rule?.threshold ?? 0;
  const replacements = findReplacementCandidates(avail.reference, avail.subGrupo, avail.subLinea, threshold, availBySubGrupo);

  const isOutOfStock = avail.existenciaBodega01 === 0;

  return {
    referenceCode: avail.reference,
    description: avail.description,
    subGrupo: avail.subGrupo,
    subLinea: avail.subLinea,
    activeOrders: [],
    closedOrders: [],
    quantityInProduction: 0,
    quantityRecentlyCompleted: 0,
    quantityInBodega04: 0,
    stageState: {
      currentStage: {
        stageId: "sin_produccion",
        stageLabel: "Sin produccion activa",
        stageOrder: 0,
        evidence: [],
        confidence: { score: 95, reason: "No se encontro OP para esta referencia", evidenceCount: 0, determined: true },
      },
      hasActiveOP: false,
      hasCN: false,
      hasExternalProcessing: false,
      hasServiceDocuments: false,
      hasET: false,
      hasRecentET: false,
      productionStatus: "no_production",
    },
    availabilityImpact: {
      existenciaBodega01: avail.existenciaBodega01,
      pedidosPendientes: avail.pedidosPendientes,
      disponibleReal: avail.disponibleReal,
      availabilityStatus: isOutOfStock ? "out_of_stock" : "critical",
      isOutOfStock,
      isCritical: true,
      ceoThreshold: rule?.threshold ?? null,
      ceoRuleSubLinea: rule?.subLinea ?? null,
      affectedVendorIds: affectedVendors,
    },
    delayRisk: {
      level: "none",
      daysInProduction: 0,
      thresholdExceeded: null,
      isStalled: false,
      isStageIndeterminate: false,
      hasHighWipWithoutET: false,
      evidence: [],
      confidence: 95,
    },
    recoverySignal: null,
    recommendation: {
      action: replacements.length > 0 ? "suggest_replacement" : "suggest_production",
      description: isOutOfStock
        ? `Sin existencia en Bodega 01 y sin produccion activa. ${replacements.length > 0 ? `${replacements.length} reemplazo(s) disponible(s).` : "Sugerir nueva OP."}`
        : `Stock critico (${avail.existenciaBodega01}) sin produccion activa.`,
      urgency: isOutOfStock ? "critical" : "high",
      replacementCandidates: replacements,
      confidence: 85,
      suggestedOnly: true,
    },
    documentEvidence: [],
    confidence: {
      score: 80,
      reason: "Datos de disponibilidad sin datos de produccion",
      sourceCount: 1,
      hasProductionData: false,
      hasAvailabilityData: true,
      hasTransferData: false,
    },
  };
}

// ── Summary Builder ────────────────────────────────────────────────────────

function buildFlowSummary(flows: ProductionReferenceFlow[]): ProductionFlowSummary {
  const activeFlows = flows.filter((f) => f.stageState.productionStatus === "active" || f.stageState.productionStatus === "completing");
  const activeDays = activeFlows.map((f) => {
    const maxDays = f.activeOrders.reduce((m, o) => Math.max(m, o.daysInProduction), 0);
    return maxDays;
  });

  // By SubLinea
  const bySubLineaMap = new Map<string, ProductionReferenceFlow[]>();
  for (const f of flows) {
    if (!bySubLineaMap.has(f.subLinea)) bySubLineaMap.set(f.subLinea, []);
    bySubLineaMap.get(f.subLinea)!.push(f);
  }

  const bySubLinea: ProductionFlowSubLineaSummary[] = [];
  for (const [subLinea, slFlows] of bySubLineaMap) {
    bySubLinea.push({
      subLinea,
      totalReferences: slFlows.length,
      activeCount: slFlows.filter((f) => f.stageState.productionStatus === "active").length,
      completedCount: slFlows.filter((f) => f.stageState.productionStatus === "completed" || f.stageState.productionStatus === "completing").length,
      stalledCount: slFlows.filter((f) => f.stageState.productionStatus === "stalled").length,
      outOfStockWithProduction: slFlows.filter((f) => f.availabilityImpact.isOutOfStock && f.stageState.hasActiveOP).length,
      outOfStockWithoutProduction: slFlows.filter((f) => f.availabilityImpact.isOutOfStock && !f.stageState.hasActiveOP).length,
      delayRiskCount: slFlows.filter((f) => f.delayRisk.level !== "none").length,
    });
  }

  return {
    totalReferencesInProduction: flows.length,
    activeProductionCount: flows.filter((f) => f.stageState.productionStatus === "active").length,
    recentlyCompletedCount: flows.filter((f) => f.stageState.productionStatus === "completed" || f.stageState.productionStatus === "completing").length,
    stalledCount: flows.filter((f) => f.stageState.productionStatus === "stalled").length,
    indeterminateCount: flows.filter((f) => f.stageState.productionStatus === "indeterminate").length,
    outOfStockWithProduction: flows.filter((f) => f.availabilityImpact.isOutOfStock && f.stageState.hasActiveOP).length,
    outOfStockWithoutProduction: flows.filter((f) => f.availabilityImpact.isOutOfStock && !f.stageState.hasActiveOP).length,
    delayRiskCount: flows.filter((f) => f.delayRisk.level !== "none").length,
    recoverySoonCount: flows.filter((f) => f.recoverySignal?.estimatedReadiness === "ready_soon").length,
    avgDaysInProduction: activeDays.length > 0 ? Math.round(activeDays.reduce((s, d) => s + d, 0) / activeDays.length) : 0,
    bySubLinea,
  };
}

// ── Confidence ─────────────────────────────────────────────────────────────

function buildSnapshotConfidence(
  productionReport: ProductionInProgressReport,
  availabilityRows: AvailabilityRow[],
): ProductionFlowConfidence {
  let score = 0;
  const sources: string[] = [];

  if (productionReport.rows.length > 0) {
    score += 40;
    sources.push("produccion");
  }
  if (availabilityRows.length > 0) {
    score += 35;
    sources.push("disponibilidad");
  }
  // Base confidence for having the engine running
  score += 10;

  return {
    score: Math.min(95, score),
    reason: sources.length > 0
      ? `Datos de ${sources.join(" + ")} disponibles. ${productionReport.rows.length} ref(s) en produccion, ${availabilityRows.length} ref(s) con disponibilidad.`
      : "Sin datos de produccion ni disponibilidad.",
    sourceCount: sources.length,
    hasProductionData: productionReport.rows.length > 0,
    hasAvailabilityData: availabilityRows.length > 0,
    hasTransferData: false, // Will be enriched when TM sync is active
  };
}

function buildReferenceConfidence(
  evidence: ProductionDocumentEvidence[],
  hasAvailability: boolean,
): ProductionFlowConfidence {
  let score = 30;
  if (evidence.length > 0) score += 30;
  if (evidence.length >= 3) score += 10;
  if (hasAvailability) score += 20;

  return {
    score: Math.min(95, score),
    reason: `${evidence.length} documento(s) de produccion${hasAvailability ? " + datos de disponibilidad" : ""}.`,
    sourceCount: (evidence.length > 0 ? 1 : 0) + (hasAvailability ? 1 : 0),
    hasProductionData: evidence.length > 0,
    hasAvailabilityData: hasAvailability,
    hasTransferData: false,
  };
}

// ── Phase 11: Executive Report Output ──────────────────────────────────────

/** Build executive-consumable report from flow snapshot. */
export function buildProductionFlowExecutiveReport(
  snapshot: ProductionFlowSnapshot,
): ProductionFlowExecutiveReport {
  return {
    orgSlug: snapshot.orgSlug,
    computedAt: snapshot.computedAt,
    productionByLine: snapshot.summary.bySubLinea,
    outOfStockWithProduction: snapshot.referenceFlows.filter(
      (f) => f.availabilityImpact.isOutOfStock && f.stageState.hasActiveOP,
    ),
    outOfStockWithoutProduction: snapshot.referenceFlows.filter(
      (f) => f.availabilityImpact.isOutOfStock && !f.stageState.hasActiveOP,
    ),
    delayRiskReferences: snapshot.referenceFlows.filter(
      (f) => f.delayRisk.level !== "none",
    ),
    recoverySoonReferences: snapshot.referenceFlows.filter(
      (f) => f.recoverySignal?.estimatedReadiness === "ready_soon",
    ),
    summary: snapshot.summary,
    confidence: snapshot.confidence,
  };
}

// ── Phase 12: David Readiness ──────────────────────────────────────────────

/** Answer David queries about production flow. */
export function answerDavidQuery(
  snapshot: ProductionFlowSnapshot,
  queryType: ProductionFlowDavidQueryType,
): ProductionFlowDavidAnswer {
  const caveats: string[] = [];

  if (!snapshot.confidence.hasProductionData) {
    caveats.push("Sin datos de produccion disponibles — respuestas basadas unicamente en disponibilidad.");
  }
  if (!snapshot.confidence.hasAvailabilityData) {
    caveats.push("Sin datos de disponibilidad comercial — no se puede determinar estado de agotados.");
  }

  switch (queryType) {
    case "out_of_stock_in_production":
      return buildOOSInProductionAnswer(snapshot, caveats);
    case "out_of_stock_need_production":
      return buildOOSNeedProductionAnswer(snapshot, caveats);
    case "nearing_completion":
      return buildNearingCompletionAnswer(snapshot, caveats);
    case "delayed_production":
      return buildDelayedProductionAnswer(snapshot, caveats);
    case "replacement_candidates":
      return buildReplacementCandidatesAnswer(snapshot, caveats);
  }
}

function buildOOSInProductionAnswer(snapshot: ProductionFlowSnapshot, caveats: string[]): ProductionFlowDavidAnswer {
  const matches = snapshot.referenceFlows.filter(
    (f) => f.availabilityImpact.isOutOfStock && f.stageState.hasActiveOP,
  );

  return {
    queryType: "out_of_stock_in_production",
    answer: matches.length > 0
      ? `${matches.length} referencia(s) agotada(s) ya tienen produccion activa.`
      : "Ninguna referencia agotada tiene produccion activa actualmente.",
    references: matches.map(flowToDavidRef),
    totalMatches: matches.length,
    confidence: snapshot.confidence.score,
    caveats,
  };
}

function buildOOSNeedProductionAnswer(snapshot: ProductionFlowSnapshot, caveats: string[]): ProductionFlowDavidAnswer {
  const matches = snapshot.referenceFlows.filter(
    (f) => (f.availabilityImpact.isOutOfStock || f.availabilityImpact.isCritical) && !f.stageState.hasActiveOP,
  );

  return {
    queryType: "out_of_stock_need_production",
    answer: matches.length > 0
      ? `${matches.length} referencia(s) agotada(s) o critica(s) sin produccion activa — considerar nueva OP.`
      : "Todas las referencias agotadas ya tienen produccion activa.",
    references: matches.map(flowToDavidRef),
    totalMatches: matches.length,
    confidence: snapshot.confidence.score,
    caveats,
  };
}

function buildNearingCompletionAnswer(snapshot: ProductionFlowSnapshot, caveats: string[]): ProductionFlowDavidAnswer {
  const matches = snapshot.referenceFlows.filter(
    (f) => f.recoverySignal?.estimatedReadiness === "ready_soon",
  );

  return {
    queryType: "nearing_completion",
    answer: matches.length > 0
      ? `${matches.length} referencia(s) proxima(s) a completar produccion.`
      : "No se detectan referencias con produccion proxima a completar.",
    references: matches.map(flowToDavidRef),
    totalMatches: matches.length,
    confidence: snapshot.confidence.score,
    caveats,
  };
}

function buildDelayedProductionAnswer(snapshot: ProductionFlowSnapshot, caveats: string[]): ProductionFlowDavidAnswer {
  const matches = snapshot.referenceFlows.filter(
    (f) => f.delayRisk.level === "high" || f.delayRisk.level === "critical",
  );

  return {
    queryType: "delayed_production",
    answer: matches.length > 0
      ? `${matches.length} referencia(s) con produccion retrasada o en riesgo.`
      : "No se detecta produccion retrasada actualmente.",
    references: matches.map(flowToDavidRef),
    totalMatches: matches.length,
    confidence: snapshot.confidence.score,
    caveats,
  };
}

function buildReplacementCandidatesAnswer(snapshot: ProductionFlowSnapshot, caveats: string[]): ProductionFlowDavidAnswer {
  const matches = snapshot.referenceFlows.filter(
    (f) => f.recommendation.replacementCandidates.length > 0,
  );

  return {
    queryType: "replacement_candidates",
    answer: matches.length > 0
      ? `${matches.length} referencia(s) tienen candidatos de reemplazo del mismo SubGrupo.`
      : "No se encontraron candidatos de reemplazo actualmente.",
    references: matches.map(flowToDavidRef),
    totalMatches: matches.length,
    confidence: snapshot.confidence.score,
    caveats,
  };
}

function flowToDavidRef(flow: ProductionReferenceFlow): ProductionFlowDavidReference {
  const statusText = flow.stageState.productionStatus === "no_production"
    ? "Sin produccion"
    : `${flow.stageState.currentStage.stageLabel} (${flow.stageState.productionStatus})`;

  return {
    referenceCode: flow.referenceCode,
    description: flow.description,
    subGrupo: flow.subGrupo,
    subLinea: flow.subLinea,
    status: statusText,
    detail: flow.recommendation.description,
  };
}
