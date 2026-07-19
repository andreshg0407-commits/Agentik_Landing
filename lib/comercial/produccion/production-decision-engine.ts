/**
 * lib/comercial/produccion/production-decision-engine.ts
 *
 * FASE 9 — Production Planning Decision Engine.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Every evaluation answers:
 *   1. Why did it activate?
 *   2. What data did it use?
 *   3. What action does it recommend and why?
 *   4. What data is missing?
 *
 * No ejecutar producción. No crear OP. Sólo recomendaciones.
 *
 * Sprint: PRODUCTION-PLANNING-POLICY-PACK-01
 */

import type {
  ProductionPlanningPolicyType,
  ProductionEvidenceItem,
  ProductionNeedResult,
  ProductionNeedDecision,
  ActiveOPResult,
  ProductionPriorityResult,
  ProductionPriority,
  PriorityFactor,
  ShortageResult,
  ProductionHealthSummary,
  ProductionPlanningContext,
  SubgroupInput,
  ProductionQueue,
  ProductionQueueItem,
} from "./production-planning-types";

import type { ProductionPlanningConfig } from "./production-planning-config";

// ── Evidence builder ────────────────────────────────────────────────────────

let traceCounter = 0;

function nextTraceId(prefix: string): string {
  return `prod-${prefix}-${++traceCounter}`;
}

function buildEvidence(
  policyType: ProductionPlanningPolicyType,
  policyId: string,
  policyName: string,
  activationReason: string,
  dataUsed: Record<string, unknown>,
  recommendedAction: string,
  actionRationale: string,
  confidence: number,
  severity: ProductionEvidenceItem["severity"],
  missingData: string[] = [],
): ProductionEvidenceItem {
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

function getThreshold(brand: string, config: ProductionPlanningConfig): number {
  return config.reorder.brandThresholds[brand] ?? config.reorder.defaultThreshold;
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

// ── FASE 2 + 3: Evaluate production need ────────────────────────────────────

export function evaluateProductionNeed(
  ctx: ProductionPlanningContext,
  items: SubgroupInput[],
  config: ProductionPlanningConfig,
): ProductionNeedResult[] {
  return items.map(item => {
    const threshold = getThreshold(item.brand, config);
    const deficit = Math.max(0, threshold - item.availableInventory);
    const hasActiveOP = item.activeOPs.some(op => op.status === "open");
    const activeOPCount = item.activeOPs.filter(op => op.status === "open").length;
    const activeOPQuantity = item.activeOPs.filter(op => op.status === "open").reduce((s, op) => s + op.quantity, 0);

    const missingData: string[] = [];
    if (item.availableInventory < 0) missingData.push("availableInventory (negative)");

    let decision: ProductionNeedDecision;
    if (missingData.length > 0 && item.availableInventory < 0) {
      decision = "INSUFFICIENT_DATA";
    } else if (item.availableInventory >= threshold) {
      decision = "SUFFICIENT_STOCK";
    } else if (hasActiveOP) {
      decision = "WAIT_EXISTING_OP";
    } else {
      decision = "PRODUCE";
    }

    const reason = decision === "PRODUCE"
      ? `${item.subgroup} (${item.brand}): inventario ${item.availableInventory} < umbral ${threshold}. Deficit: ${deficit} und. Sin OP activa.`
      : decision === "WAIT_EXISTING_OP"
        ? `${item.subgroup} (${item.brand}): inventario ${item.availableInventory} < umbral ${threshold}, pero ${activeOPCount} OP activa(s) con ${activeOPQuantity} und en proceso.`
        : decision === "SUFFICIENT_STOCK"
          ? `${item.subgroup} (${item.brand}): inventario ${item.availableInventory} >= umbral ${threshold}. Sin accion requerida.`
          : `${item.subgroup} (${item.brand}): datos insuficientes para evaluar.`;

    return {
      subgroup: item.subgroup,
      brand: item.brand,
      availableInventory: item.availableInventory,
      threshold,
      deficit,
      hasActiveOP,
      activeOPCount,
      activeOPQuantity,
      decision,
      reason,
      evidence: buildEvidence(
        "TEXTILE_REORDER",
        `prod-tr-${item.subgroup}`,
        "Trigger de Produccion Textil",
        reason,
        {
          subgroup: item.subgroup,
          brand: item.brand,
          availableInventory: item.availableInventory,
          threshold,
          deficit,
          hasActiveOP,
          activeOPCount,
          activeOPQuantity,
          decision,
        },
        decision === "PRODUCE"
          ? `Sugerir produccion de ${item.subgroup}: ${deficit} und por debajo del umbral`
          : decision === "WAIT_EXISTING_OP"
            ? `Esperar OP activa de ${item.subgroup} (${activeOPQuantity} und en proceso)`
            : decision === "SUFFICIENT_STOCK"
              ? "Sin accion requerida"
              : `Verificar datos de ${item.subgroup}`,
        decision === "PRODUCE"
          ? `Inventario (${item.availableInventory}) por debajo del umbral (${threshold}) sin OP activa. Deficit de ${deficit} unidades.`
          : decision === "WAIT_EXISTING_OP"
            ? `Inventario bajo pero OP activa con ${activeOPQuantity} und. Esperar finalizacion antes de nueva produccion.`
            : decision === "SUFFICIENT_STOCK"
              ? `Inventario (${item.availableInventory}) cubre el umbral (${threshold}).`
              : "Sin datos suficientes.",
        decision === "INSUFFICIENT_DATA" ? 0.3 : 0.9,
        decision === "PRODUCE" ? "medium" : decision === "WAIT_EXISTING_OP" ? "low" : "info",
        missingData,
      ),
      confidence: decision === "INSUFFICIENT_DATA" ? 0.3 : 0.9,
    };
  });
}

// ── FASE 3: Evaluate existing OP ────────────────────────────────────────────

export function evaluateExistingOP(
  ctx: ProductionPlanningContext,
  item: SubgroupInput,
  config: ProductionPlanningConfig,
): ActiveOPResult {
  const openOPs = item.activeOPs.filter(op => op.status === "open");
  const hasActiveOP = openOPs.length > 0;
  const totalActiveQuantity = openOPs.reduce((s, op) => s + op.quantity, 0);

  const decision = hasActiveOP ? "WAIT_EXISTING_OP" as const : "NO_ACTIVE_OP" as const;

  const reason = hasActiveOP
    ? `${item.subgroup} (${item.brand}): ${openOPs.length} OP activa(s) con ${totalActiveQuantity} und en proceso. Documentos: ${openOPs.map(op => op.documentNumber).join(", ")}.`
    : `${item.subgroup} (${item.brand}): sin OP activa. Libre para sugerir produccion.`;

  return {
    subgroup: item.subgroup,
    brand: item.brand,
    hasActiveOP,
    activeOPs: openOPs,
    totalActiveQuantity,
    decision,
    reason,
    evidence: buildEvidence(
      "ACTIVE_OP",
      `prod-op-${item.subgroup}`,
      "Verificacion de OP Activa",
      reason,
      {
        subgroup: item.subgroup,
        brand: item.brand,
        hasActiveOP,
        activeOPCount: openOPs.length,
        totalActiveQuantity,
        documents: openOPs.map(op => op.documentNumber),
      },
      hasActiveOP
        ? `Esperar finalizacion de OP de ${item.subgroup}`
        : `Sin OP activa — libre para produccion`,
      hasActiveOP
        ? `${openOPs.length} OP abierta(s) suman ${totalActiveQuantity} und. No sugerir nueva produccion hasta cierre.`
        : "No hay OP abierta del subgrupo.",
      0.9,
      hasActiveOP ? "low" : "info",
    ),
    confidence: 0.9,
  };
}

// ── FASE 4: Evaluate priority ───────────────────────────────────────────────

export function evaluatePriority(
  ctx: ProductionPlanningContext,
  item: SubgroupInput,
  config: ProductionPlanningConfig,
): ProductionPriorityResult {
  const threshold = getThreshold(item.brand, config);
  const deficit = Math.max(0, threshold - item.availableInventory);
  const { weights, criticalThreshold, highThreshold, mediumThreshold } = config.priority;

  const factors: PriorityFactor[] = [];

  // Inventory deficit factor
  const deficitPct = threshold > 0 ? (deficit / threshold) * 100 : 0;
  const deficitScore = deficitPct >= 100 ? 100 : deficitPct >= 75 ? 85 : deficitPct >= 50 ? 60 : deficitPct >= 25 ? 30 : 0;
  factors.push({
    factor: "inventoryDeficit",
    score: deficitScore,
    weight: weights.inventoryDeficit,
    contribution: deficitScore * weights.inventoryDeficit,
    signal: deficitScore >= 70 ? "positive" : deficitScore >= 40 ? "neutral" : "negative",
    reason: `Deficit: ${deficit} und (${Math.round(deficitPct)}% del umbral ${threshold})`,
  });

  // Sales volume factor
  const salesScore = item.sales6m >= 100 ? 100 : item.sales6m >= 50 ? 75 : item.sales6m >= 20 ? 50 : item.sales6m >= 5 ? 25 : 0;
  factors.push({
    factor: "salesVolume",
    score: salesScore,
    weight: weights.salesVolume,
    contribution: salesScore * weights.salesVolume,
    signal: salesScore >= 70 ? "positive" : salesScore >= 40 ? "neutral" : "negative",
    reason: `${item.sales6m} und vendidas en 6 meses`,
  });

  // Coverage factor (lower coverage = higher urgency)
  const covScore = item.coverageDays !== null
    ? (item.coverageDays <= 7 ? 100 : item.coverageDays <= 15 ? 80 : item.coverageDays <= 30 ? 50 : item.coverageDays <= 60 ? 20 : 0)
    : 50;
  factors.push({
    factor: "coverage",
    score: covScore,
    weight: weights.coverage,
    contribution: covScore * weights.coverage,
    signal: covScore >= 70 ? "positive" : covScore >= 40 ? "neutral" : "negative",
    reason: item.coverageDays !== null ? `Cobertura: ${item.coverageDays} dias` : "Sin datos de cobertura",
  });

  // Pending orders factor
  const ordScore = item.pendingOrders >= 20 ? 100 : item.pendingOrders >= 10 ? 75 : item.pendingOrders >= 5 ? 50 : item.pendingOrders >= 1 ? 25 : 0;
  factors.push({
    factor: "pendingOrders",
    score: ordScore,
    weight: weights.pendingOrders,
    contribution: ordScore * weights.pendingOrders,
    signal: ordScore >= 70 ? "positive" : ordScore >= 40 ? "neutral" : "negative",
    reason: `${item.pendingOrders} pedidos pendientes`,
  });

  // Maletas factor
  const malScore = item.maletasCount >= 10 ? 100 : item.maletasCount >= 5 ? 70 : item.maletasCount >= 2 ? 40 : item.maletasCount >= 1 ? 20 : 0;
  factors.push({
    factor: "maletas",
    score: malScore,
    weight: weights.maletas,
    contribution: malScore * weights.maletas,
    signal: malScore >= 70 ? "positive" : malScore >= 40 ? "neutral" : "negative",
    reason: `${item.maletasCount} maletas con este subgrupo`,
  });

  // Tiendas factor
  const tiendasScore = item.tiendasCount >= 5 ? 100 : item.tiendasCount >= 3 ? 70 : item.tiendasCount >= 1 ? 40 : 0;
  factors.push({
    factor: "tiendas",
    score: tiendasScore,
    weight: weights.tiendas,
    contribution: tiendasScore * weights.tiendas,
    signal: tiendasScore >= 70 ? "positive" : tiendasScore >= 40 ? "neutral" : "negative",
    reason: `${item.tiendasCount} tiendas con este subgrupo`,
  });

  const totalScore = Math.round(factors.reduce((sum, f) => sum + f.contribution, 0));
  const priority: ProductionPriority = totalScore >= criticalThreshold ? "CRITICAL"
    : totalScore >= highThreshold ? "HIGH"
    : totalScore >= mediumThreshold ? "MEDIUM"
    : "LOW";

  const topFactors = [...factors].sort((a, b) => b.contribution - a.contribution).slice(0, 3);

  return {
    subgroup: item.subgroup,
    brand: item.brand,
    priority,
    totalScore,
    factors,
    availableInventory: item.availableInventory,
    threshold,
    deficit,
    sales6m: item.sales6m,
    coverageDays: item.coverageDays,
    pendingOrders: item.pendingOrders,
    maletas: item.maletasCount,
    tiendas: item.tiendasCount,
    reason: `${item.subgroup} (${item.brand}): prioridad ${priority} (score ${totalScore}). ${topFactors.map(f => f.reason).join(". ")}.`,
    evidence: buildEvidence(
      "PRODUCTION_PRIORITY",
      `prod-pri-${item.subgroup}`,
      "Prioridad de Produccion",
      `${item.subgroup}: ${priority} (score ${totalScore}).`,
      {
        subgroup: item.subgroup,
        brand: item.brand,
        priority,
        totalScore,
        factorSummary: factors.map(f => ({ factor: f.factor, contribution: f.contribution, signal: f.signal })),
        criticalThreshold,
        highThreshold,
        mediumThreshold,
        deficit,
        sales6m: item.sales6m,
        coverageDays: item.coverageDays,
      },
      priority === "CRITICAL"
        ? `Produccion urgente de ${item.subgroup}`
        : priority === "HIGH"
          ? `Programar produccion de ${item.subgroup}`
          : priority === "MEDIUM"
            ? `Monitorear ${item.subgroup} para produccion`
            : "Sin accion inmediata",
      `Score ${totalScore} (umbrales: CRITICAL>=${criticalThreshold}, HIGH>=${highThreshold}, MEDIUM>=${mediumThreshold}). Factores: ${topFactors.map(f => `${f.factor}=${Math.round(f.contribution)}`).join(", ")}.`,
      0.85,
      priority === "CRITICAL" ? "high" : priority === "HIGH" ? "medium" : "info",
    ),
    confidence: 0.85,
  };
}

// ── FASE 5: Evaluate shortage ───────────────────────────────────────────────

export function evaluateShortage(
  ctx: ProductionPlanningContext,
  items: SubgroupInput[],
  config: ProductionPlanningConfig,
): ShortageResult[] {
  const results: ShortageResult[] = [];

  for (const item of items) {
    const threshold = getThreshold(item.brand, config);
    if (item.availableInventory >= threshold) continue;

    const deficit = threshold - item.availableInventory;
    const pctOfThreshold = threshold > 0 ? (item.availableInventory / threshold) * 100 : 0;
    const hasActiveOP = item.activeOPs.some(op => op.status === "open");

    const priority: ProductionPriority = pctOfThreshold <= config.shortage.criticalPct ? "CRITICAL"
      : pctOfThreshold <= config.shortage.shortagePct ? "HIGH"
      : "MEDIUM";

    const reason = `${item.subgroup} (${item.brand}): inventario ${item.availableInventory} und (${Math.round(pctOfThreshold)}% del umbral ${threshold}). Deficit: ${deficit} und. ${hasActiveOP ? "OP activa." : "Sin OP activa."}`;

    results.push({
      subgroup: item.subgroup,
      brand: item.brand,
      availableInventory: item.availableInventory,
      threshold,
      deficit,
      priority,
      hasActiveOP,
      reason,
      evidence: buildEvidence(
        "SHORTAGE",
        `prod-sh-${item.subgroup}`,
        "Deteccion de Desabastecimiento",
        reason,
        {
          subgroup: item.subgroup,
          brand: item.brand,
          availableInventory: item.availableInventory,
          threshold,
          deficit,
          pctOfThreshold: Math.round(pctOfThreshold),
          priority,
          hasActiveOP,
          criticalPct: config.shortage.criticalPct,
          shortagePct: config.shortage.shortagePct,
        },
        priority === "CRITICAL"
          ? `Produccion urgente de ${item.subgroup} — desabastecimiento critico`
          : `Programar produccion de ${item.subgroup}`,
        `Inventario al ${Math.round(pctOfThreshold)}% del umbral. Umbrales: CRITICAL<=${config.shortage.criticalPct}%, HIGH<=${config.shortage.shortagePct}%.`,
        0.9,
        priority === "CRITICAL" ? "critical" : priority === "HIGH" ? "high" : "medium",
      ),
      confidence: 0.9,
    });
  }

  return results;
}

// ── FASE 6: Evaluate production health ──────────────────────────────────────

export function evaluateProductionHealth(
  ctx: ProductionPlanningContext,
  needResults: ProductionNeedResult[],
  priorityResults: ProductionPriorityResult[],
  shortageResults: ShortageResult[],
  config: ProductionPlanningConfig,
): ProductionHealthSummary {
  const total = needResults.length;
  const needsProductionCount = needResults.filter(r => r.decision === "PRODUCE").length;
  const waitingOPCount = needResults.filter(r => r.decision === "WAIT_EXISTING_OP").length;
  const healthyCount = needResults.filter(r => r.decision === "SUFFICIENT_STOCK").length;
  const shortageCount = shortageResults.length;

  const priorityBreakdown: Record<ProductionPriority, number> = {
    CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0,
  };
  for (const r of priorityResults) {
    priorityBreakdown[r.priority]++;
  }

  const criticalCount = priorityBreakdown.CRITICAL;
  const requiresActionCount = needsProductionCount + waitingOPCount;

  let overallHealth: ProductionHealthSummary["overallHealth"];
  if (total === 0) {
    overallHealth = "NO_DATA";
  } else if (requiresActionCount > total * (config.health?.criticalPct ?? 30) / 100) {
    overallHealth = "CRITICAL";
  } else if (requiresActionCount > total * (config.health?.atRiskPct ?? 20) / 100) {
    overallHealth = "AT_RISK";
  } else {
    overallHealth = "HEALTHY";
  }

  return {
    tenantId: ctx.tenantId,
    totalSubgroups: total,
    needsProductionCount,
    waitingOPCount,
    healthyCount,
    criticalCount,
    shortageCount,
    priorityBreakdown,
    overallHealth,
    evidence: buildEvidence(
      "PRODUCTION_HEALTH",
      `prod-health-${ctx.tenantId}`,
      "Salud de Produccion",
      `Produccion ${ctx.tenantId}: ${overallHealth}. ${total} subgrupos, ${needsProductionCount} necesitan produccion, ${waitingOPCount} esperan OP, ${healthyCount} saludables, ${criticalCount} criticos.`,
      {
        totalSubgroups: total,
        needsProductionCount,
        waitingOPCount,
        healthyCount,
        criticalCount,
        shortageCount,
        priorityBreakdown,
        overallHealth,
      },
      overallHealth === "CRITICAL"
        ? "Revision urgente del plan de produccion"
        : overallHealth === "AT_RISK"
          ? "Revisar subgrupos en riesgo antes de la siguiente produccion"
          : "Plan de produccion saludable. Mantener monitoreo.",
      `${total} subgrupos evaluados. Produccion: ${needsProductionCount}. Esperando OP: ${waitingOPCount}. Saludables: ${healthyCount}. Criticos: ${criticalCount}. Shortage: ${shortageCount}.`,
      total === 0 ? 0.2 : 0.85,
      overallHealth === "CRITICAL" ? "high" : overallHealth === "AT_RISK" ? "medium" : "info",
    ),
    generatedAt: new Date().toISOString(),
  };
}

// ── Production Queue builder ────────────────────────────────────────────────

export function buildProductionQueue(
  ctx: ProductionPlanningContext,
  needResults: ProductionNeedResult[],
  priorityResults: ProductionPriorityResult[],
  config: ProductionPlanningConfig,
): ProductionQueue {
  const priorityMap = new Map(priorityResults.map(r => [r.subgroup, r]));

  const items: ProductionQueueItem[] = needResults
    .filter(r => r.decision === "PRODUCE" || r.decision === "WAIT_EXISTING_OP")
    .map(r => {
      const pri = priorityMap.get(r.subgroup);
      return {
        subgroup: r.subgroup,
        brand: r.brand,
        priority: pri?.priority ?? "LOW",
        priorityScore: pri?.totalScore ?? 0,
        decision: r.decision,
        availableInventory: r.availableInventory,
        threshold: r.threshold,
        deficit: r.deficit,
        hasActiveOP: r.hasActiveOP,
        activeOPCount: r.activeOPCount,
        activeOPQuantity: r.activeOPQuantity,
        sales6m: pri?.sales6m ?? 0,
        coverageDays: pri?.coverageDays ?? null,
        pendingOrders: pri?.pendingOrders ?? 0,
        recommendedAction: r.decision === "PRODUCE"
          ? `Producir ${r.subgroup}: deficit ${r.deficit} und`
          : `Esperar OP de ${r.subgroup} (${r.activeOPQuantity} und en proceso)`,
        evidence: r.evidence,
        confidence: r.confidence,
      };
    })
    .sort((a, b) => {
      // PRODUCE before WAIT_EXISTING_OP
      if (a.decision !== b.decision) return a.decision === "PRODUCE" ? -1 : 1;
      // Then by priority score desc
      return b.priorityScore - a.priorityScore;
    })
    .slice(0, config.queue.maxItems);

  return {
    tenantId: ctx.tenantId,
    totalItems: items.length,
    criticalCount: items.filter(i => i.priority === "CRITICAL").length,
    highCount: items.filter(i => i.priority === "HIGH").length,
    mediumCount: items.filter(i => i.priority === "MEDIUM").length,
    lowCount: items.filter(i => i.priority === "LOW").length,
    waitingOPCount: items.filter(i => i.decision === "WAIT_EXISTING_OP").length,
    items,
    generatedAt: new Date().toISOString(),
  };
}
