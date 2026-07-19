/**
 * lib/comercial/sales-reps/sales-rep-decision-engine.ts
 *
 * FASE 12 — SalesRep Decision Engine.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Every evaluation answers:
 *   1. Why did it activate?
 *   2. What data did it use?
 *   3. What action does it recommend and why?
 *   4. How confident is it?
 *   5. What data is missing?
 *
 * Sprint: SALES-REP-POLICY-PACK-01
 */

import type {
  SalesRepPolicyType,
  SalesRepEvidenceItem,
  MalletOutOfStockResult,
  MalletReplacementSuggestion,
  OverdueReceivableResult,
  InactiveCustomerResult,
  CustomerActivityStatus,
  CustomerPriorityResult,
  CustomerPriorityLevel,
  CustomerPriorityFactor,
  SalesRepMalletState,
  MalletHealthStatus,
  OrderFulfillmentState,
  OrderFulfillmentStatus,
  DataFreshnessLabel,
  SalesRepDailyState,
  SalesRepProfile,
  SalesRepAlert,
  SalesRepPolicyContext,
  MalletItemInput,
  CustomerInput,
  ReplacementCandidateInput,
  OrderInput,
  MalletStateInput,
} from "./sales-rep-decision-types";

import type { SalesRepPolicyPackConfig } from "./sales-rep-policy-pack-config";

// ── Evidence builder ────────────────────────────────────────────────────────

let traceCounter = 0;

function nextTraceId(prefix: string): string {
  return `${prefix}-${++traceCounter}`;
}

function buildEvidence(
  policyType: SalesRepPolicyType,
  policyId: string,
  policyName: string,
  activationReason: string,
  dataUsed: Record<string, unknown>,
  recommendedAction: string,
  actionRationale: string,
  confidence: number,
  severity: SalesRepEvidenceItem["severity"],
  missingData: string[] = [],
  traceId?: string,
): SalesRepEvidenceItem {
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
    traceId: traceId ?? nextTraceId(policyType),
  };
}

// ── FASE 2: Mallet out-of-stock ─────────────────────────────────────────────

export function evaluateMalletOutOfStock(
  ctx: SalesRepPolicyContext,
  malletId: string,
  items: MalletItemInput[],
  config: SalesRepPolicyPackConfig,
): MalletOutOfStockResult[] {
  const { outOfStockThreshold } = config.outOfStock;
  const results: MalletOutOfStockResult[] = [];

  for (const item of items) {
    if (item.availableInventory > outOfStockThreshold) continue;

    const reason = item.availableInventory < 0
      ? `Referencia ${item.reference} con inventario negativo (${item.availableInventory}). Sobre-comprometida.`
      : item.availableInventory === 0
        ? `Referencia ${item.reference} agotada. Inventario = 0.`
        : `Referencia ${item.reference} con inventario ${item.availableInventory} <= umbral ${outOfStockThreshold}.`;

    results.push({
      salesRepId: ctx.salesRepId,
      malletId,
      productId: item.reference,
      reference: item.reference,
      productName: item.productName,
      photoUrl: item.photoUrl,
      currentMalletUnits: item.currentMalletUnits,
      availableInventory: item.availableInventory,
      reason,
      recommendedAction: "Retirar referencia de la maleta",
      replacementSuggestions: [],
      evidence: buildEvidence(
        "MALLET_OUT_OF_STOCK",
        `soos-${ctx.salesRepId}-${item.reference}`,
        "Referencia Agotada en Maleta",
        reason,
        {
          salesRepId: ctx.salesRepId,
          malletId,
          reference: item.reference,
          productName: item.productName,
          currentMalletUnits: item.currentMalletUnits,
          availableInventory: item.availableInventory,
          outOfStockThreshold,
        },
        "Retirar referencia de la maleta",
        `Inventario disponible (${item.availableInventory}) no permite continuar ofreciendo esta referencia. Retirar para evitar compromisos sin respaldo.`,
        item.availableInventory < 0 ? 0.99 : 0.95,
        item.availableInventory < 0 ? "critical" : "high",
      ),
      confidence: item.availableInventory < 0 ? 0.99 : 0.95,
    });
  }

  return results;
}

// ── FASE 3: Replacement suggestion ──────────────────────────────────────────

export function evaluateMalletReplacement(
  outOfStockItem: MalletOutOfStockResult,
  candidates: ReplacementCandidateInput[],
  config: SalesRepPolicyPackConfig,
): MalletReplacementSuggestion[] {
  const { maxReplacementSuggestions, minReplacementQuality, minReplacementFreshness } = config.outOfStock;

  const eligible = candidates.filter(c => {
    if (c.availableUnits <= 0) return false;
    if (c.quality < minReplacementQuality) return false;
    if (c.freshness < minReplacementFreshness) return false;
    if (c.reference === outOfStockItem.reference) return false;

    // Match group/subgroup or sizeClass
    const matchesGroup = outOfStockItem.evidence.dataUsed.groupCode
      ? c.groupCode === outOfStockItem.evidence.dataUsed.groupCode
      : true;
    const matchesSubgroup = outOfStockItem.evidence.dataUsed.subgroupCode
      ? c.subgroupCode === outOfStockItem.evidence.dataUsed.subgroupCode
      : true;

    return matchesGroup || matchesSubgroup;
  });

  // Sort: availability desc, quality desc, freshness desc, salesVelocity desc
  eligible.sort((a, b) => {
    if (b.availableUnits !== a.availableUnits) return b.availableUnits - a.availableUnits;
    if (b.quality !== a.quality) return b.quality - a.quality;
    if (b.freshness !== a.freshness) return b.freshness - a.freshness;
    return (b.salesVelocity ?? 0) - (a.salesVelocity ?? 0);
  });

  return eligible.slice(0, maxReplacementSuggestions).map(c => ({
    suggestedReference: c.reference,
    productName: c.productName,
    photoUrl: c.photoUrl,
    availableUnits: c.availableUnits,
    suggestedUnits: Math.min(c.availableUnits, outOfStockItem.currentMalletUnits),
    groupCode: c.groupCode,
    subgroupCode: c.subgroupCode,
    sizeClass: c.sizeClass,
    reason: `Reemplazo para ${outOfStockItem.reference} (${outOfStockItem.productName}). Disponible: ${c.availableUnits} und. Calidad: ${Math.round(c.quality * 100)}%.`,
    evidence: buildEvidence(
      "MALLET_REPLACEMENT",
      `srep-${outOfStockItem.salesRepId}-${c.reference}`,
      "Sugerencia de Reemplazo",
      `Referencia ${c.reference} sugerida como reemplazo de ${outOfStockItem.reference} agotada.`,
      {
        replacedReference: outOfStockItem.reference,
        suggestedReference: c.reference,
        availableUnits: c.availableUnits,
        quality: c.quality,
        freshness: c.freshness,
        salesVelocity: c.salesVelocity,
        groupCode: c.groupCode,
        subgroupCode: c.subgroupCode,
        sizeClass: c.sizeClass,
      },
      `Agregar ${c.reference} a la maleta en lugar de ${outOfStockItem.reference}`,
      `Referencia disponible (${c.availableUnits} und) del mismo grupo/subgrupo, con calidad ${Math.round(c.quality * 100)}% y frescura ${Math.round(c.freshness * 100)}%.`,
      Math.min(c.quality, c.freshness, 0.9),
      "info",
    ),
    confidence: Math.min(c.quality, c.freshness, 0.9),
  }));
}

// ── FASE 4: Overdue receivable ──────────────────────────────────────────────

export function evaluateCustomerReceivablesAlert(
  ctx: SalesRepPolicyContext,
  customer: CustomerInput,
  config: SalesRepPolicyPackConfig,
): OverdueReceivableResult {
  const { overdueDaysThreshold, severity, allowOrder, requireAcknowledgement } = config.overdueReceivable;
  const rec = customer.receivables;

  if (!rec || rec.dataStatus !== "AVAILABLE") {
    return {
      salesRepId: ctx.salesRepId,
      customerId: customer.customerId,
      customerName: customer.customerName,
      totalReceivable: 0,
      overdueReceivable: 0,
      maxDaysPastDue: 0,
      oldestOverdueDocument: null,
      oldestOverdueAmount: 0,
      overdueDocumentCount: 0,
      dataStatus: rec?.dataStatus ?? "NOT_AVAILABLE",
      alertSeverity: "info",
      allowOrder: true,
      requireAcknowledgement: false,
      recommendedAction: "Verificar informacion de cartera manualmente",
      evidence: buildEvidence(
        "CUSTOMER_OVERDUE_RECEIVABLE",
        `sror-${ctx.salesRepId}-${customer.customerId}`,
        "Cartera del Cliente",
        `No hay informacion confiable de cartera para ${customer.customerName}.`,
        { customerId: customer.customerId, customerName: customer.customerName, dataStatus: rec?.dataStatus ?? "NOT_AVAILABLE" },
        "Verificar informacion de cartera manualmente",
        "Sin datos confiables de cartera. No se asume que esta al dia.",
        0.3,
        "info",
        ["receivables_data"],
      ),
      confidence: 0.3,
    };
  }

  // STRICTLY GREATER THAN threshold (30 days exactly does NOT trigger)
  const isOverdue = rec.maxDaysPastDue > overdueDaysThreshold;
  const alertSeverity = isOverdue
    ? (rec.maxDaysPastDue > overdueDaysThreshold * 2 ? "critical" : severity)
    : "info";

  return {
    salesRepId: ctx.salesRepId,
    customerId: customer.customerId,
    customerName: customer.customerName,
    totalReceivable: rec.totalBalance,
    overdueReceivable: rec.overdueBalance,
    maxDaysPastDue: rec.maxDaysPastDue,
    oldestOverdueDocument: rec.oldestOverdueDocument,
    oldestOverdueAmount: rec.oldestOverdueAmount,
    overdueDocumentCount: rec.overdueDocumentCount,
    dataStatus: "AVAILABLE",
    alertSeverity,
    allowOrder: isOverdue ? allowOrder : true,
    requireAcknowledgement: isOverdue ? requireAcknowledgement : false,
    recommendedAction: isOverdue
      ? `Revisar cartera vencida de ${rec.maxDaysPastDue} dias ($${rec.overdueBalance.toLocaleString()}) antes de continuar`
      : "Cartera al dia. Continuar normalmente.",
    evidence: buildEvidence(
      "CUSTOMER_OVERDUE_RECEIVABLE",
      `sror-${ctx.salesRepId}-${customer.customerId}`,
      "Cartera del Cliente",
      isOverdue
        ? `Cliente ${customer.customerName} con cartera vencida ${rec.maxDaysPastDue} dias. Monto: $${rec.overdueBalance.toLocaleString()}.`
        : `Cliente ${customer.customerName} con cartera al dia (${rec.maxDaysPastDue} dias).`,
      {
        customerId: customer.customerId,
        customerName: customer.customerName,
        totalReceivable: rec.totalBalance,
        overdueReceivable: rec.overdueBalance,
        maxDaysPastDue: rec.maxDaysPastDue,
        overdueDaysThreshold,
        overdueDocumentCount: rec.overdueDocumentCount,
        isOverdue,
      },
      isOverdue
        ? `Alertar sobre cartera vencida de ${rec.maxDaysPastDue} dias`
        : "Sin accion requerida",
      isOverdue
        ? `Cartera vencida ${rec.maxDaysPastDue} dias supera umbral de ${overdueDaysThreshold} dias. ${allowOrder ? "Pedido permitido con reconocimiento." : "Pedido bloqueado."}`
        : `Cartera dentro del umbral de ${overdueDaysThreshold} dias.`,
      isOverdue ? 0.9 : 0.95,
      alertSeverity === "critical" ? "critical" : alertSeverity === "warning" ? "medium" : "info",
    ),
    confidence: isOverdue ? 0.9 : 0.95,
  };
}

// ── FASE 5: Inactive customer ───────────────────────────────────────────────

export function evaluateCustomerInactivity(
  ctx: SalesRepPolicyContext,
  customer: CustomerInput,
  config: SalesRepPolicyPackConfig,
): InactiveCustomerResult {
  const { inactivityThresholdDays, atRiskThresholdDays, minimumSalesHistoryRequired } = config.inactiveCustomer;

  let inactiveDays: number | null = null;
  let activityStatus: CustomerActivityStatus;
  let priority: "HIGH" | "MEDIUM" | "LOW" = "LOW";

  if (customer.purchaseCount < minimumSalesHistoryRequired && !customer.lastPurchaseAt) {
    activityStatus = "NEVER_PURCHASED";
  } else if (!customer.lastPurchaseAt) {
    activityStatus = "INSUFFICIENT_DATA";
  } else {
    const lastPurchase = new Date(customer.lastPurchaseAt).getTime();
    const now = Date.now();
    inactiveDays = Math.floor((now - lastPurchase) / (1000 * 60 * 60 * 24));

    if (inactiveDays > inactivityThresholdDays) {
      activityStatus = "INACTIVE";
      priority = "HIGH";
    } else if (inactiveDays > atRiskThresholdDays) {
      activityStatus = "AT_RISK";
      priority = "MEDIUM";
    } else {
      activityStatus = "ACTIVE";
      priority = "LOW";
    }
  }

  const recommendedAction =
    activityStatus === "INACTIVE" ? `Contactar cliente ${customer.customerName} — ${inactiveDays} dias sin comprar`
    : activityStatus === "AT_RISK" ? `Programar visita a ${customer.customerName} — ${inactiveDays} dias sin comprar`
    : activityStatus === "NEVER_PURCHASED" ? `Evaluar potencial comercial de ${customer.customerName} (nunca ha comprado)`
    : activityStatus === "INSUFFICIENT_DATA" ? `Verificar historial de compras de ${customer.customerName}`
    : "Sin accion requerida. Cliente activo.";

  const missingData: string[] = [];
  if (!customer.lastPurchaseAt) missingData.push("lastPurchaseAt");
  if (customer.lifetimeSales === null) missingData.push("lifetimeSales");
  if (!customer.receivables) missingData.push("receivables");

  return {
    customerId: customer.customerId,
    customerName: customer.customerName,
    assignedSalesRepId: ctx.salesRepId,
    lastPurchaseAt: customer.lastPurchaseAt,
    inactiveDays,
    purchaseCount: customer.purchaseCount,
    lifetimeSales: customer.lifetimeSales,
    recentReceivablesSummary: customer.receivables ? {
      totalBalance: customer.receivables.totalBalance,
      overdueBalance: customer.receivables.overdueBalance,
      documentCount: customer.receivables.overdueDocumentCount,
    } : null,
    activityStatus,
    priority,
    recommendedAction,
    evidence: buildEvidence(
      "CUSTOMER_INACTIVE",
      `sric-${ctx.salesRepId}-${customer.customerId}`,
      "Inactividad del Cliente",
      activityStatus === "INACTIVE"
        ? `Cliente ${customer.customerName} inactivo ${inactiveDays} dias (umbral: ${inactivityThresholdDays}).`
        : activityStatus === "AT_RISK"
          ? `Cliente ${customer.customerName} en riesgo — ${inactiveDays} dias sin comprar (umbral riesgo: ${atRiskThresholdDays}).`
          : activityStatus === "NEVER_PURCHASED"
            ? `Cliente ${customer.customerName} nunca ha comprado.`
            : activityStatus === "INSUFFICIENT_DATA"
              ? `Datos insuficientes para evaluar actividad de ${customer.customerName}.`
              : `Cliente ${customer.customerName} activo (ultima compra hace ${inactiveDays} dias).`,
      {
        customerId: customer.customerId,
        customerName: customer.customerName,
        assignedSalesRepId: ctx.salesRepId,
        lastPurchaseAt: customer.lastPurchaseAt,
        inactiveDays,
        purchaseCount: customer.purchaseCount,
        lifetimeSales: customer.lifetimeSales,
        inactivityThresholdDays,
        atRiskThresholdDays,
        activityStatus,
      },
      recommendedAction,
      activityStatus === "INACTIVE"
        ? `${inactiveDays} dias sin comprar supera el umbral de ${inactivityThresholdDays} dias. Atencion prioritaria.`
        : activityStatus === "AT_RISK"
          ? `${inactiveDays} dias sin comprar se acerca al umbral de ${inactivityThresholdDays} dias. Accion preventiva.`
          : activityStatus === "NEVER_PURCHASED"
            ? "Cliente nuevo sin historial de compras. No confundir con cliente perdido."
            : activityStatus === "INSUFFICIENT_DATA"
              ? "Sin fecha de ultima compra registrada."
              : `Actividad reciente (${inactiveDays} dias). Sin intervencion requerida.`,
      activityStatus === "INSUFFICIENT_DATA" ? 0.3 : 0.85,
      activityStatus === "INACTIVE" ? "high" : activityStatus === "AT_RISK" ? "medium" : "info",
      missingData,
    ),
    confidence: activityStatus === "INSUFFICIENT_DATA" ? 0.3 : 0.85,
  };
}

// ── FASE 6: Customer priority ───────────────────────────────────────────────

export function evaluateCustomerPriority(
  ctx: SalesRepPolicyContext,
  customer: CustomerInput,
  inactivityResult: InactiveCustomerResult,
  receivableResult: OverdueReceivableResult,
  config: SalesRepPolicyPackConfig,
): CustomerPriorityResult {
  const { weights, highThreshold, mediumThreshold } = config.customerPriority;
  const factors: CustomerPriorityFactor[] = [];

  // Inactivity factor (higher = more urgent)
  const inactivityScore = inactivityResult.activityStatus === "INACTIVE" ? 100
    : inactivityResult.activityStatus === "AT_RISK" ? 70
    : inactivityResult.activityStatus === "NEVER_PURCHASED" ? 50
    : inactivityResult.activityStatus === "INSUFFICIENT_DATA" ? 30
    : 0;
  factors.push({
    factor: "inactivity",
    score: inactivityScore,
    weight: weights.inactivity,
    contribution: inactivityScore * weights.inactivity,
    reason: inactivityResult.activityStatus === "INACTIVE"
      ? `Inactivo ${inactivityResult.inactiveDays} dias`
      : inactivityResult.activityStatus === "AT_RISK"
        ? `En riesgo — ${inactivityResult.inactiveDays} dias`
        : inactivityResult.activityStatus === "NEVER_PURCHASED"
          ? "Nunca ha comprado"
          : inactivityResult.activityStatus === "ACTIVE"
            ? "Activo recientemente"
            : "Sin datos suficientes",
  });

  // Historical sales factor
  const salesScore = customer.lifetimeSales !== null
    ? (customer.lifetimeSales > 10_000_000 ? 100 : customer.lifetimeSales > 5_000_000 ? 70 : customer.lifetimeSales > 1_000_000 ? 40 : 10)
    : 0;
  factors.push({
    factor: "historicalSales",
    score: salesScore,
    weight: weights.historicalSales,
    contribution: salesScore * weights.historicalSales,
    reason: customer.lifetimeSales !== null
      ? `Ventas historicas: $${customer.lifetimeSales.toLocaleString()}`
      : "Sin datos de ventas historicas",
  });

  // Receivables factor (overdue = higher priority)
  const receivablesScore = receivableResult.dataStatus !== "AVAILABLE" ? 30
    : receivableResult.maxDaysPastDue > 60 ? 100
    : receivableResult.maxDaysPastDue > 30 ? 70
    : receivableResult.overdueReceivable > 0 ? 40
    : 0;
  factors.push({
    factor: "receivablesStatus",
    score: receivablesScore,
    weight: weights.receivablesStatus,
    contribution: receivablesScore * weights.receivablesStatus,
    reason: receivableResult.dataStatus !== "AVAILABLE"
      ? "Sin datos de cartera"
      : receivableResult.maxDaysPastDue > 0
        ? `Cartera vencida ${receivableResult.maxDaysPastDue} dias`
        : "Cartera al dia",
  });

  // Order frequency
  const freqScore = customer.purchaseCount >= 10 ? 80 : customer.purchaseCount >= 5 ? 50 : customer.purchaseCount >= 1 ? 20 : 0;
  factors.push({
    factor: "orderFrequency",
    score: freqScore,
    weight: weights.orderFrequency,
    contribution: freqScore * weights.orderFrequency,
    reason: `${customer.purchaseCount} compras registradas`,
  });

  // Recency
  const recencyScore = inactivityResult.inactiveDays !== null
    ? (inactivityResult.inactiveDays <= 30 ? 100 : inactivityResult.inactiveDays <= 60 ? 60 : inactivityResult.inactiveDays <= 90 ? 30 : 10)
    : 0;
  factors.push({
    factor: "recency",
    score: recencyScore,
    weight: weights.recency,
    contribution: recencyScore * weights.recency,
    reason: inactivityResult.inactiveDays !== null
      ? `Ultima compra hace ${inactivityResult.inactiveDays} dias`
      : "Sin fecha de ultima compra",
  });

  // Data quality
  const missingFields = [
    !customer.lastPurchaseAt ? "lastPurchaseAt" : null,
    customer.lifetimeSales === null ? "lifetimeSales" : null,
    !customer.receivables ? "receivables" : null,
  ].filter(Boolean).length;
  const dqScore = missingFields === 0 ? 100 : missingFields === 1 ? 60 : missingFields === 2 ? 30 : 0;
  factors.push({
    factor: "dataQuality",
    score: dqScore,
    weight: weights.dataQuality,
    contribution: dqScore * weights.dataQuality,
    reason: missingFields === 0 ? "Datos completos" : `${missingFields} campos sin datos`,
  });

  const totalScore = Math.round(factors.reduce((sum, f) => sum + f.contribution, 0));
  const priority: CustomerPriorityLevel =
    totalScore >= highThreshold ? "HIGH"
    : totalScore >= mediumThreshold ? "MEDIUM"
    : dqScore === 0 ? "UNRESOLVED"
    : "LOW";

  const topFactors = [...factors].sort((a, b) => b.contribution - a.contribution).slice(0, 3);

  return {
    customerId: customer.customerId,
    customerName: customer.customerName,
    salesRepId: ctx.salesRepId,
    priority,
    totalScore,
    factors,
    recommendedAction: priority === "HIGH"
      ? `Atencion prioritaria: ${topFactors.map(f => f.reason).join(". ")}`
      : priority === "MEDIUM"
        ? `Seguimiento recomendado: ${topFactors[0]?.reason ?? ""}`
        : priority === "UNRESOLVED"
          ? "Completar datos del cliente para evaluar prioridad"
          : "Sin accion urgente",
    evidence: buildEvidence(
      "CUSTOMER_PRIORITY",
      `srcp-${ctx.salesRepId}-${customer.customerId}`,
      "Prioridad Comercial",
      `Cliente ${customer.customerName}: prioridad ${priority} (score ${totalScore}).`,
      {
        customerId: customer.customerId,
        priority,
        totalScore,
        factorSummary: factors.map(f => ({ factor: f.factor, contribution: f.contribution })),
        highThreshold,
        mediumThreshold,
      },
      priority === "HIGH"
        ? `Atencion prioritaria para ${customer.customerName}`
        : priority === "MEDIUM"
          ? `Programar seguimiento para ${customer.customerName}`
          : "Sin accion urgente",
      `Score ${totalScore} (umbral alto: ${highThreshold}, medio: ${mediumThreshold}). Factores principales: ${topFactors.map(f => `${f.factor}=${Math.round(f.contribution)}`).join(", ")}.`,
      dqScore === 0 ? 0.3 : 0.8,
      priority === "HIGH" ? "high" : priority === "MEDIUM" ? "medium" : "info",
    ),
    confidence: dqScore === 0 ? 0.3 : 0.8,
  };
}

// ── FASE 7: Mallet state ────────────────────────────────────────────────────

export function buildSalesRepMalletState(
  ctx: SalesRepPolicyContext,
  malletInput: MalletStateInput,
  outOfStockItems: MalletOutOfStockResult[],
  replacements: MalletReplacementSuggestion[],
): SalesRepMalletState {
  const missingGroups = malletInput.totalGroups - malletInput.completeGroups;

  let status: MalletHealthStatus;
  if (malletInput.completionPercentage >= 100 && outOfStockItems.length === 0) {
    status = "COMPLETE";
  } else if (malletInput.completionPercentage === 0 && malletInput.totalGroups === 0) {
    status = "NO_DATA";
  } else if (outOfStockItems.length > 3 || malletInput.completionPercentage < 50) {
    status = "CRITICAL";
  } else {
    status = "INCOMPLETE";
  }

  return {
    salesRepId: ctx.salesRepId,
    malletId: malletInput.malletId,
    completionPercentage: malletInput.completionPercentage,
    completeGroups: malletInput.completeGroups,
    missingGroups,
    missingEntries: malletInput.missingEntries,
    excessEntries: malletInput.excessEntries,
    outOfStockItems,
    replacementSuggestions: replacements,
    unresolvedItems: malletInput.unresolvedItems,
    status,
    evidence: buildEvidence(
      "MALLET_STATUS",
      `srms-${ctx.salesRepId}`,
      "Estado de Maleta",
      `Maleta ${malletInput.malletId}: ${status}. Completitud: ${malletInput.completionPercentage}%. Agotados: ${outOfStockItems.length}.`,
      {
        salesRepId: ctx.salesRepId,
        malletId: malletInput.malletId,
        completionPercentage: malletInput.completionPercentage,
        completeGroups: malletInput.completeGroups,
        missingGroups,
        missingEntries: malletInput.missingEntries,
        excessEntries: malletInput.excessEntries,
        outOfStockCount: outOfStockItems.length,
        replacementCount: replacements.length,
        unresolvedItems: malletInput.unresolvedItems,
        status,
      },
      status === "COMPLETE" ? "Maleta completa. Sin accion requerida."
        : status === "CRITICAL" ? "Revision urgente de maleta requerida"
        : status === "NO_DATA" ? "Configurar maleta del vendedor"
        : `Completar maleta: ${malletInput.missingEntries} faltantes, ${outOfStockItems.length} agotados`,
      status === "COMPLETE" ? "Todos los grupos completos y sin referencias agotadas."
        : `Completitud ${malletInput.completionPercentage}%. ${outOfStockItems.length} referencias agotadas, ${malletInput.missingEntries} entradas faltantes, ${malletInput.unresolvedItems} sin resolver.`,
      status === "NO_DATA" ? 0.2 : 0.85,
      status === "CRITICAL" ? "high" : status === "INCOMPLETE" ? "medium" : "info",
    ),
    asOf: new Date().toISOString(),
  };
}

// ── FASE 8: Order fulfillment state ─────────────────────────────────────────

export function buildOrderFulfillmentState(
  order: OrderInput,
  config: SalesRepPolicyPackConfig,
): OrderFulfillmentState {
  const currentStatus = resolveOrderStatus(order.status);
  const freshness = resolveFreshness(order.lastSyncAt, config.freshness);

  const milestones = buildMilestones(order, currentStatus);

  return {
    orderId: order.orderId,
    customer: order.customer,
    branch: order.branch,
    createdAt: order.createdAt,
    requestedUnits: order.requestedUnits,
    fulfilledUnits: order.fulfilledUnits,
    invoicedUnits: order.invoicedUnits,
    dispatchedUnits: order.dispatchedUnits,
    deliveredUnits: order.deliveredUnits,
    currentStatus,
    milestones,
    blockers: order.blockers,
    evidence: buildEvidence(
      "ORDER_FULFILLMENT",
      `srof-${order.orderId}`,
      "Seguimiento de Pedido",
      `Pedido ${order.orderId}: ${currentStatus}. ${order.fulfilledUnits}/${order.requestedUnits} und cumplidas.`,
      {
        orderId: order.orderId,
        customer: order.customer,
        currentStatus,
        requestedUnits: order.requestedUnits,
        fulfilledUnits: order.fulfilledUnits,
        invoicedUnits: order.invoicedUnits,
        dispatchedUnits: order.dispatchedUnits,
        deliveredUnits: order.deliveredUnits,
        blockerCount: order.blockers.length,
        freshness,
      },
      currentStatus === "DELIVERED" ? "Pedido entregado. Sin accion."
        : currentStatus === "BLOCKED" ? `Resolver bloqueo en pedido ${order.orderId}`
        : order.blockers.length > 0 ? `Atender ${order.blockers.length} bloqueo(s)`
        : `Dar seguimiento a pedido ${order.orderId}`,
      `Estado: ${currentStatus}. Cumplimiento: ${order.requestedUnits > 0 ? Math.round(order.fulfilledUnits / order.requestedUnits * 100) : 0}%. Frescura: ${freshness}.`,
      freshness === "SIN_DATOS" ? 0.3 : freshness === "DESACTUALIZADO" ? 0.5 : 0.85,
      currentStatus === "BLOCKED" ? "critical" : currentStatus === "UNKNOWN" ? "medium" : "info",
    ),
    freshness,
  };
}

function resolveOrderStatus(raw: string): OrderFulfillmentStatus {
  const normalized = raw.toLowerCase().replace(/[_\s-]+/g, "_");
  const map: Record<string, OrderFulfillmentStatus> = {
    borrador: "DRAFT", draft: "DRAFT",
    enviado: "SUBMITTED", submitted: "SUBMITTED",
    aprobado: "APPROVED", approved: "APPROVED",
    parcialmente_cumplido: "PARTIALLY_FULFILLED", partially_fulfilled: "PARTIALLY_FULFILLED",
    cumplido: "FULFILLED", fulfilled: "FULFILLED",
    facturado: "INVOICED", invoiced: "INVOICED",
    parcialmente_facturado: "PARTIALLY_INVOICED", partially_invoiced: "PARTIALLY_INVOICED",
    despachado: "DISPATCHED", dispatched: "DISPATCHED",
    en_transito: "IN_TRANSIT", in_transit: "IN_TRANSIT",
    entregado: "DELIVERED", delivered: "DELIVERED",
    cancelado: "CANCELLED", cancelled: "CANCELLED",
    bloqueado: "BLOCKED", blocked: "BLOCKED",
    confirmado: "SUBMITTED", pendiente_sag: "SUBMITTED",
    sincronizado: "APPROVED", conflicto: "BLOCKED",
  };
  return map[normalized] ?? "UNKNOWN";
}

function resolveFreshness(lastSyncAt: string | null, config: { todayHours: number; recentHours: number }): DataFreshnessLabel {
  if (!lastSyncAt) return "SIN_DATOS";
  const hours = (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60);
  if (hours <= config.todayHours) return "HOY";
  if (hours <= config.recentHours) return "RECIENTE";
  return "DESACTUALIZADO";
}

function buildMilestones(order: OrderInput, current: OrderFulfillmentStatus): OrderFulfillmentState["milestones"] {
  const statusOrder: OrderFulfillmentStatus[] = [
    "DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_FULFILLED",
    "FULFILLED", "INVOICED", "DISPATCHED", "IN_TRANSIT", "DELIVERED",
  ];
  const currentIdx = statusOrder.indexOf(current);

  return statusOrder.map((s, i) => ({
    status: s,
    reachedAt: i <= currentIdx ? order.createdAt : null,
    confirmed: i <= currentIdx,
    source: i <= currentIdx ? "system" : "pending",
  }));
}

// ── FASE 9: Daily state ─────────────────────────────────────────────────────

export function buildSalesRepDailyState(
  ctx: SalesRepPolicyContext,
  profile: SalesRepProfile,
  malletState: SalesRepMalletState | null,
  overdueAlerts: OverdueReceivableResult[],
  inactiveCustomers: InactiveCustomerResult[],
  orderFollowUps: OrderFulfillmentState[],
  outOfStockAlerts: MalletOutOfStockResult[],
  priorities: CustomerPriorityResult[],
  alerts: SalesRepAlert[],
): SalesRepDailyState {
  // Collect all evidence
  const allEvidence: SalesRepEvidenceItem[] = [];
  if (malletState) allEvidence.push(malletState.evidence);
  for (const a of overdueAlerts) allEvidence.push(a.evidence);
  for (const c of inactiveCustomers) allEvidence.push(c.evidence);
  for (const o of orderFollowUps) allEvidence.push(o.evidence);
  for (const s of outOfStockAlerts) allEvidence.push(s.evidence);
  for (const p of priorities) allEvidence.push(p.evidence);

  // Deduplicate alerts by deduplicationKey
  const seen = new Set<string>();
  const deduped: SalesRepAlert[] = [];
  for (const a of alerts) {
    if (!seen.has(a.deduplicationKey)) {
      seen.add(a.deduplicationKey);
      deduped.push(a);
    }
  }

  // Sort alerts: critical first, then warning, then info
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  deduped.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  return {
    tenantId: ctx.tenantId,
    salesRep: profile,
    malletState,
    customerAlerts: overdueAlerts.filter(a => a.alertSeverity !== "info"),
    overdueReceivableAlerts: overdueAlerts.filter(a => a.alertSeverity !== "info"),
    inactiveCustomers: inactiveCustomers.filter(c => c.activityStatus !== "ACTIVE"),
    orderFollowUps,
    outOfStockAlerts,
    priorities: [...priorities].sort((a, b) => b.totalScore - a.totalScore),
    alerts: deduped,
    evidenceSummary: {
      totalEvidenceItems: allEvidence.length,
      highConfidenceCount: allEvidence.filter(e => e.confidence >= 0.8).length,
      lowConfidenceCount: allEvidence.filter(e => e.confidence < 0.5).length,
      missingDataCount: allEvidence.filter(e => e.missingData.length > 0).length,
      traceIds: allEvidence.map(e => e.traceId),
    },
    generatedAt: new Date().toISOString(),
  };
}
