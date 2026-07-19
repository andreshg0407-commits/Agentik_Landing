/**
 * lib/comercial/importaciones/import-decision-engine.ts
 *
 * FASE 9 — Import Decision Engine.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Every evaluation answers:
 *   1. Why did it activate?
 *   2. What data did it use?
 *   3. What action does it recommend and why?
 *   4. What data is missing?
 *
 * Importacion es un mundo independiente del Textil.
 *
 * Sprint: IMPORT-POLICY-PACK-01
 */

import type {
  ImportPolicyType,
  ImportEvidenceItem,
  LowRotationResult,
  RepurchaseResult,
  RepurchaseDecision,
  RepurchaseFactor,
  NextContainerItem,
  NextContainerRecommendation,
  InventoryAgingResult,
  InventoryAgingStatus,
  ImportHealthSummary,
  ImportPolicyContext,
  ImportReferenceInput,
} from "./import-policy-types";

import type { ImportPolicyPackConfig } from "./import-policy-pack-config";

// ── Evidence builder ────────────────────────────────────────────────────────

let traceCounter = 0;

function nextTraceId(prefix: string): string {
  return `imp-${prefix}-${++traceCounter}`;
}

function buildEvidence(
  policyType: ImportPolicyType,
  policyId: string,
  policyName: string,
  activationReason: string,
  dataUsed: Record<string, unknown>,
  recommendedAction: string,
  actionRationale: string,
  confidence: number,
  severity: ImportEvidenceItem["severity"],
  missingData: string[] = [],
): ImportEvidenceItem {
  return {
    policyType,
    policyId,
    policyName,
    activationReason,
    dataUsed,
    recommendedAction,
    actionRationale,
    confidence,
    severity,
    missingData,
    evaluatedAt: new Date().toISOString(),
    traceId: nextTraceId(policyType),
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function daysToMonths(days: number): number {
  return Math.round((days / 30) * 10) / 10;
}

function computeTrend(monthly: number[]): "accelerating" | "stable" | "decelerating" | "insufficient_data" {
  if (monthly.length < 3) return "insufficient_data";
  const recent = monthly.slice(-3).reduce((s, v) => s + v, 0);
  const earlier = monthly.slice(0, 3).reduce((s, v) => s + v, 0);
  if (recent === 0 && earlier === 0) return "stable";
  if (recent > earlier * 1.2) return "accelerating";
  if (recent < earlier * 0.8) return "decelerating";
  return "stable";
}

// ── FASE 2: Low rotation ────────────────────────────────────────────────────

export function evaluateLowRotation(
  ctx: ImportPolicyContext,
  items: ImportReferenceInput[],
  config: ImportPolicyPackConfig,
): LowRotationResult[] {
  const { daysThreshold, monthsThreshold } = config.lowRotation;
  const results: LowRotationResult[] = [];

  for (const item of items) {
    const missingData: string[] = [];
    if (item.lastEntryDate === null) missingData.push("lastEntryDate");
    if (item.daysSinceLastEntry === null) missingData.push("daysSinceLastEntry");

    const days = item.daysSinceLastEntry;
    const months = days !== null ? daysToMonths(days) : null;
    const hasInventory = item.currentInventory > 0;

    // Low rotation = more than threshold months without entry AND still has inventory
    const isLowRotation = days !== null && days > daysThreshold && hasInventory;

    const reason = days === null
      ? `Sin fecha de ultimo ingreso para ${item.reference}. No se puede evaluar rotacion.`
      : !hasInventory
        ? `${item.reference}: sin inventario (${item.currentInventory}). No aplica baja rotacion.`
        : isLowRotation
          ? `${item.reference}: ${months} meses sin ingreso (umbral: ${monthsThreshold}). Inventario: ${item.currentInventory} und.`
          : `${item.reference}: ${months} meses sin ingreso (dentro del umbral de ${monthsThreshold}). Inventario: ${item.currentInventory} und.`;

    const confidence = days === null ? 0.3 : 0.9;

    results.push({
      reference: item.reference,
      description: item.description,
      group: item.group,
      subgroup: item.subgroup,
      size: item.size,
      currentInventory: item.currentInventory,
      lastEntryDate: item.lastEntryDate,
      monthsSinceLastEntry: months,
      daysSinceLastEntry: days,
      isLowRotation,
      reason,
      evidence: buildEvidence(
        "LOW_ROTATION",
        `imp-lr-${item.reference}`,
        "Baja Rotacion de Importacion",
        reason,
        {
          reference: item.reference,
          currentInventory: item.currentInventory,
          lastEntryDate: item.lastEntryDate,
          daysSinceLastEntry: days,
          monthsSinceLastEntry: months,
          daysThreshold,
          monthsThreshold,
          hasInventory,
          isLowRotation,
        },
        isLowRotation
          ? `Revisar referencia ${item.reference} — ${months} meses sin recompra con ${item.currentInventory} und en inventario`
          : days === null
            ? `Verificar fecha de ultimo ingreso de ${item.reference}`
            : "Sin accion requerida",
        isLowRotation
          ? `Referencia con ${months} meses sin ingreso supera el umbral de ${monthsThreshold} meses. Con ${item.currentInventory} unidades en inventario, evaluar si se mantiene o se descontinua.`
          : days === null
            ? "Sin fecha de ultimo ingreso registrada en SAG."
            : `Dentro del umbral de ${monthsThreshold} meses.`,
        confidence,
        isLowRotation ? "medium" : "info",
        missingData,
      ),
      confidence,
    });
  }

  return results;
}

// ── FASE 3: Repurchase ──────────────────────────────────────────────────────

export function evaluateRepurchase(
  ctx: ImportPolicyContext,
  item: ImportReferenceInput,
  config: ImportPolicyPackConfig,
): RepurchaseResult {
  const { weights, rebuyThreshold, watchThreshold, minimumSalesRequired } = config.repurchase;
  const missingData: string[] = [];

  if (item.lastEntryDate === null) missingData.push("lastEntryDate");
  if (item.percentSold === null) missingData.push("percentSold");

  // Insufficient data check
  if (item.totalSold < minimumSalesRequired && item.sales6m === 0) {
    return {
      reference: item.reference,
      description: item.description,
      decision: "INSUFFICIENT_DATA",
      totalScore: 0,
      factors: [],
      currentInventory: item.currentInventory,
      totalSold: item.totalSold,
      sales6m: item.sales6m,
      monthsSinceLastEntry: item.daysSinceLastEntry !== null ? daysToMonths(item.daysSinceLastEntry) : null,
      trend: computeTrend(item.sales6mMonthly),
      suggestedQty: null,
      recommendedAction: `Verificar datos de ${item.reference} antes de evaluar recompra`,
      evidence: buildEvidence(
        "REPURCHASE",
        `imp-rp-${item.reference}`,
        "Decision de Recompra",
        `Datos insuficientes para evaluar recompra de ${item.reference}. Ventas totales: ${item.totalSold}.`,
        { reference: item.reference, totalSold: item.totalSold, sales6m: item.sales6m, minimumSalesRequired },
        `Verificar datos de ${item.reference}`,
        "Sin ventas registradas suficientes para tomar decision de recompra.",
        0.2,
        "info",
        missingData,
      ),
      confidence: 0.2,
    };
  }

  const factors: RepurchaseFactor[] = [];
  const trend = computeTrend(item.sales6mMonthly);

  // Sales volume factor
  const salesScore = item.sales6m >= 50 ? 100
    : item.sales6m >= 20 ? 70
    : item.sales6m >= 5 ? 40
    : item.sales6m >= 1 ? 20
    : 0;
  factors.push({
    factor: "salesVolume",
    score: salesScore,
    weight: weights.salesVolume,
    contribution: salesScore * weights.salesVolume,
    signal: salesScore >= 70 ? "positive" : salesScore >= 40 ? "neutral" : "negative",
    reason: `${item.sales6m} und vendidas en 6 meses`,
  });

  // Inventory level factor (lower inventory = higher score = more urgency)
  const invScore = item.currentInventory <= 5 ? 100
    : item.currentInventory <= 20 ? 80
    : item.currentInventory <= 50 ? 50
    : item.currentInventory <= 100 ? 20
    : 0;
  factors.push({
    factor: "inventoryLevel",
    score: invScore,
    weight: weights.inventoryLevel,
    contribution: invScore * weights.inventoryLevel,
    signal: invScore >= 70 ? "positive" : invScore >= 40 ? "neutral" : "negative",
    reason: `Inventario actual: ${item.currentInventory} und`,
  });

  // Rotation factor
  const rotScore = item.percentSold !== null
    ? (item.percentSold >= 80 ? 100 : item.percentSold >= 60 ? 70 : item.percentSold >= 40 ? 40 : 10)
    : 30;
  factors.push({
    factor: "rotation",
    score: rotScore,
    weight: weights.rotation,
    contribution: rotScore * weights.rotation,
    signal: rotScore >= 70 ? "positive" : rotScore >= 40 ? "neutral" : "negative",
    reason: item.percentSold !== null ? `${item.percentSold}% vendido del total importado` : "Sin datos de porcentaje vendido",
  });

  // Time since entry factor (longer = more urgency if selling well)
  const months = item.daysSinceLastEntry !== null ? daysToMonths(item.daysSinceLastEntry) : null;
  const timeScore = months !== null
    ? (months >= 12 ? 90 : months >= 8 ? 70 : months >= 4 ? 40 : 10)
    : 30;
  factors.push({
    factor: "timeSinceEntry",
    score: timeScore,
    weight: weights.timeSinceEntry,
    contribution: timeScore * weights.timeSinceEntry,
    signal: timeScore >= 70 && salesScore >= 40 ? "positive" : "neutral",
    reason: months !== null ? `${months} meses sin ingreso` : "Sin fecha de ultimo ingreso",
  });

  // Trend factor
  const trendScore = trend === "accelerating" ? 100
    : trend === "stable" ? 50
    : trend === "decelerating" ? 20
    : 30;
  factors.push({
    factor: "trend",
    score: trendScore,
    weight: weights.trend,
    contribution: trendScore * weights.trend,
    signal: trend === "accelerating" ? "positive" : trend === "decelerating" ? "negative" : "neutral",
    reason: trend === "accelerating" ? "Ventas en aumento" : trend === "decelerating" ? "Ventas en disminucion" : trend === "stable" ? "Ventas estables" : "Datos insuficientes de tendencia",
  });

  const totalScore = Math.round(factors.reduce((sum, f) => sum + f.contribution, 0));
  const decision: RepurchaseDecision = totalScore >= rebuyThreshold ? "REBUY"
    : totalScore >= watchThreshold ? "WATCH"
    : "DO_NOT_REBUY";

  // Suggested quantity: only for REBUY
  const suggestedQty = decision === "REBUY" && item.sales6m > 0
    ? Math.max(1, Math.round(item.sales6m * 2 - item.currentInventory))
    : null;

  const topFactors = [...factors].sort((a, b) => b.contribution - a.contribution).slice(0, 3);

  return {
    reference: item.reference,
    description: item.description,
    decision,
    totalScore,
    factors,
    currentInventory: item.currentInventory,
    totalSold: item.totalSold,
    sales6m: item.sales6m,
    monthsSinceLastEntry: months,
    trend,
    suggestedQty: suggestedQty !== null ? Math.max(0, suggestedQty) : null,
    recommendedAction: decision === "REBUY"
      ? `Recomprar ${item.reference}: ${topFactors.map(f => f.reason).join(". ")}`
      : decision === "WATCH"
        ? `Monitorear ${item.reference}: ${topFactors[0]?.reason ?? ""}`
        : `No recomprar ${item.reference}: ${topFactors.map(f => f.reason).join(". ")}`,
    evidence: buildEvidence(
      "REPURCHASE",
      `imp-rp-${item.reference}`,
      "Decision de Recompra",
      `${item.reference}: ${decision} (score ${totalScore}).`,
      {
        reference: item.reference,
        decision,
        totalScore,
        factorSummary: factors.map(f => ({ factor: f.factor, contribution: f.contribution, signal: f.signal })),
        rebuyThreshold,
        watchThreshold,
        currentInventory: item.currentInventory,
        sales6m: item.sales6m,
        trend,
      },
      decision === "REBUY" ? `Recomprar ${item.reference}` : decision === "WATCH" ? `Monitorear ${item.reference}` : `No recomprar ${item.reference}`,
      `Score ${totalScore} (umbral rebuy: ${rebuyThreshold}, watch: ${watchThreshold}). Factores: ${topFactors.map(f => `${f.factor}=${Math.round(f.contribution)}`).join(", ")}.`,
      missingData.length > 0 ? 0.6 : 0.8,
      decision === "REBUY" ? "medium" : "info",
      missingData,
    ),
    confidence: missingData.length > 0 ? 0.6 : 0.8,
  };
}

// ── FASE 4: Next container ──────────────────────────────────────────────────

export function buildNextContainerRecommendations(
  ctx: ImportPolicyContext,
  items: ImportReferenceInput[],
  repurchaseResults: RepurchaseResult[],
  config: ImportPolicyPackConfig,
): NextContainerRecommendation {
  const { maxItems, highPriorityThreshold, mediumPriorityThreshold } = config.nextContainer;

  // Only include REBUY and WATCH items
  const candidates = repurchaseResults.filter(r => r.decision === "REBUY" || r.decision === "WATCH");

  const containerItems: NextContainerItem[] = candidates
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, maxItems)
    .map(r => {
      const priority = r.totalScore >= highPriorityThreshold ? "HIGH" as const
        : r.totalScore >= mediumPriorityThreshold ? "MEDIUM" as const
        : "LOW" as const;

      return {
        reference: r.reference,
        description: r.description,
        priority,
        priorityScore: r.totalScore,
        currentInventory: r.currentInventory,
        sales6m: r.sales6m,
        monthsSinceLastEntry: r.monthsSinceLastEntry,
        repurchaseDecision: r.decision,
        suggestedQty: r.suggestedQty,
        reason: r.recommendedAction,
        evidence: buildEvidence(
          "NEXT_CONTAINER",
          `imp-nc-${r.reference}`,
          "Proximo Contenedor",
          `${r.reference} incluida en recomendacion de contenedor. Prioridad: ${priority} (score ${r.totalScore}).`,
          {
            reference: r.reference,
            priority,
            priorityScore: r.totalScore,
            repurchaseDecision: r.decision,
            currentInventory: r.currentInventory,
            sales6m: r.sales6m,
            suggestedQty: r.suggestedQty,
          },
          `Incluir ${r.reference} en proximo pedido a China (${r.suggestedQty ?? "?"} und)`,
          `Decision ${r.decision} con score ${r.totalScore}. Inventario: ${r.currentInventory}, ventas 6m: ${r.sales6m}.`,
          r.confidence,
          priority === "HIGH" ? "medium" : "info",
        ),
        confidence: r.confidence,
      };
    });

  return {
    tenantId: ctx.tenantId,
    totalItems: containerItems.length,
    highPriorityCount: containerItems.filter(i => i.priority === "HIGH").length,
    mediumPriorityCount: containerItems.filter(i => i.priority === "MEDIUM").length,
    lowPriorityCount: containerItems.filter(i => i.priority === "LOW").length,
    items: containerItems,
    generatedAt: new Date().toISOString(),
  };
}

// ── FASE 5: Inventory aging ─────────────────────────────────────────────────

export function evaluateInventoryAging(
  ctx: ImportPolicyContext,
  items: ImportReferenceInput[],
  config: ImportPolicyPackConfig,
): InventoryAgingResult[] {
  const { newDaysMax, normalDaysMax, agingDaysMax, lowRotationDaysMax } = config.inventoryAging;

  return items.map(item => {
    const days = item.daysSinceLastEntry;
    const months = days !== null ? daysToMonths(days) : null;
    const missingData: string[] = [];
    if (days === null) missingData.push("daysSinceLastEntry");

    let agingStatus: InventoryAgingStatus;
    if (days === null) {
      agingStatus = item.currentInventory > 0 ? "LOW_ROTATION" : "NORMAL";
    } else if (days <= newDaysMax) {
      agingStatus = "NEW";
    } else if (days <= normalDaysMax) {
      agingStatus = "NORMAL";
    } else if (days <= agingDaysMax) {
      agingStatus = "AGING";
    } else if (days <= lowRotationDaysMax) {
      agingStatus = "LOW_ROTATION";
    } else {
      agingStatus = "OBSOLETE_CANDIDATE";
    }

    const reason = days === null
      ? `${item.reference}: sin fecha de ingreso. ${item.currentInventory > 0 ? "Con inventario — asumido LOW_ROTATION." : "Sin inventario — asumido NORMAL."}`
      : `${item.reference}: ${months} meses desde ultimo ingreso. Estado: ${agingStatus}. Inventario: ${item.currentInventory} und.`;

    return {
      reference: item.reference,
      description: item.description,
      currentInventory: item.currentInventory,
      daysSinceLastEntry: days,
      monthsSinceLastEntry: months,
      sales6m: item.sales6m,
      agingStatus,
      reason,
      evidence: buildEvidence(
        "INVENTORY_AGING",
        `imp-ag-${item.reference}`,
        "Antiguedad de Inventario",
        reason,
        {
          reference: item.reference,
          daysSinceLastEntry: days,
          monthsSinceLastEntry: months,
          currentInventory: item.currentInventory,
          sales6m: item.sales6m,
          agingStatus,
          newDaysMax,
          normalDaysMax,
          agingDaysMax,
          lowRotationDaysMax,
        },
        agingStatus === "OBSOLETE_CANDIDATE"
          ? `Evaluar descontinuar ${item.reference} — candidato a obsoleto`
          : agingStatus === "LOW_ROTATION"
            ? `Revisar ${item.reference} — baja rotacion`
            : agingStatus === "AGING"
              ? `Monitorear ${item.reference} — inventario envejeciendo`
              : "Sin accion requerida",
        days === null
          ? "Sin fecha de ingreso registrada."
          : `${months} meses desde ultimo ingreso. Umbrales: NEW<=${newDaysMax}d, NORMAL<=${normalDaysMax}d, AGING<=${agingDaysMax}d, LOW_ROTATION<=${lowRotationDaysMax}d.`,
        days === null ? 0.3 : 0.85,
        agingStatus === "OBSOLETE_CANDIDATE" ? "high"
          : agingStatus === "LOW_ROTATION" ? "medium"
          : agingStatus === "AGING" ? "low"
          : "info",
        missingData,
      ),
      confidence: days === null ? 0.3 : 0.85,
    };
  });
}

// ── FASE 6: Import health ───────────────────────────────────────────────────

export function evaluateImportHealth(
  ctx: ImportPolicyContext,
  lowRotationResults: LowRotationResult[],
  repurchaseResults: RepurchaseResult[],
  agingResults: InventoryAgingResult[],
): ImportHealthSummary {
  const total = agingResults.length;
  const lowRotationCount = lowRotationResults.filter(r => r.isLowRotation).length;

  // Aging breakdown
  const agingBreakdown: Record<InventoryAgingStatus, number> = {
    NEW: 0, NORMAL: 0, AGING: 0, LOW_ROTATION: 0, OBSOLETE_CANDIDATE: 0,
  };
  for (const r of agingResults) {
    agingBreakdown[r.agingStatus]++;
  }

  // Repurchase counts
  const rebuyCount = repurchaseResults.filter(r => r.decision === "REBUY").length;
  const watchCount = repurchaseResults.filter(r => r.decision === "WATCH").length;
  const doNotRebuyCount = repurchaseResults.filter(r => r.decision === "DO_NOT_REBUY").length;
  const insufficientDataCount = repurchaseResults.filter(r => r.decision === "INSUFFICIENT_DATA").length;

  // Health classification
  const healthyCount = agingBreakdown.NEW + agingBreakdown.NORMAL;
  const atRiskCount = agingBreakdown.AGING;
  const requiresReviewCount = agingBreakdown.LOW_ROTATION + agingBreakdown.OBSOLETE_CANDIDATE;

  let overallHealth: ImportHealthSummary["overallHealth"];
  if (total === 0) {
    overallHealth = "NO_DATA";
  } else if (requiresReviewCount > total * 0.3) {
    overallHealth = "CRITICAL";
  } else if (atRiskCount + requiresReviewCount > total * 0.2) {
    overallHealth = "AT_RISK";
  } else {
    overallHealth = "HEALTHY";
  }

  return {
    tenantId: ctx.tenantId,
    totalReferences: total,
    healthyCount,
    atRiskCount,
    lowRotationCount,
    requiresReviewCount,
    rebuyCount,
    watchCount,
    doNotRebuyCount,
    insufficientDataCount,
    agingBreakdown,
    overallHealth,
    evidence: buildEvidence(
      "IMPORT_HEALTH",
      `imp-health-${ctx.tenantId}`,
      "Salud General de Importacion",
      `Importacion ${ctx.tenantId}: ${overallHealth}. ${total} referencias, ${healthyCount} sanas, ${atRiskCount} en riesgo, ${lowRotationCount} baja rotacion, ${requiresReviewCount} requieren revision, ${rebuyCount} recompra.`,
      {
        totalReferences: total,
        healthyCount,
        atRiskCount,
        lowRotationCount,
        requiresReviewCount,
        rebuyCount,
        watchCount,
        doNotRebuyCount,
        insufficientDataCount,
        agingBreakdown,
        overallHealth,
      },
      overallHealth === "CRITICAL"
        ? "Revision urgente del portafolio de importacion"
        : overallHealth === "AT_RISK"
          ? "Revisar referencias en riesgo antes del proximo pedido"
          : "Portafolio saludable. Mantener monitoreo.",
      `${total} referencias evaluadas. Sanas: ${healthyCount}. En riesgo: ${atRiskCount}. Baja rotacion: ${lowRotationCount}. Requieren revision: ${requiresReviewCount}. Recompra sugerida: ${rebuyCount}.`,
      total === 0 ? 0.2 : 0.85,
      overallHealth === "CRITICAL" ? "high" : overallHealth === "AT_RISK" ? "medium" : "info",
    ),
    generatedAt: new Date().toISOString(),
  };
}
