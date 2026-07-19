/**
 * lib/comercial/tiendas/store-decision-engine.ts
 *
 * Store Decision Engine — evaluates all store policies and produces
 * decisions with full evidence.
 *
 * Pure functions — no DB, no Prisma, no side effects.
 * Consumes only:
 *   - StorePolicyPackConfig (configuration)
 *   - StoreInventorySnapshot[] (data)
 *   - StoreSalesRecord[] (data)
 *
 * Every evaluation answers three questions:
 *   1. Why did it activate?
 *   2. What data did it use?
 *   3. What action does it recommend and why?
 *
 * Sprint: CASTILLITOS-STORE-POLICY-PACK-01
 */

import type {
  StorePolicyType,
  StorePolicyEvidenceItem,
  TextileCoverageResult,
  GlobalLowStockResult,
  AccessoryCoverageResult,
  SpecialProductResult,
  AutomaticMarkdownResult,
  SlowRotationResult,
  AssortmentSuggestionResult,
  ComparativeReportResult,
  StoreDecisionEvaluationResult,
  StoreInventorySnapshot,
  StoreSalesRecord,
} from "./store-decision-types";

import type { StorePolicyPackConfig } from "./store-policy-pack-config";

// ── Evidence builder ────────────────────────────────────────────────────────

function buildEvidence(
  policyType: StorePolicyType,
  policyId: string,
  policyName: string,
  activationReason: string,
  dataUsed: Record<string, unknown>,
  recommendedAction: string,
  actionRationale: string,
  confidence: number,
  severity: StorePolicyEvidenceItem["severity"],
): StorePolicyEvidenceItem {
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
    evaluatedAt: new Date().toISOString(),
  };
}

// ── FASE 2: Textile Coverage ────────────────────────────────────────────────

export function evaluateTextileCoverage(
  inventory: StoreInventorySnapshot[],
  config: StorePolicyPackConfig,
): TextileCoverageResult[] {
  const { minimumUnits, idealUnits, maximumUnits } = config.textileCoverage;
  const results: TextileCoverageResult[] = [];

  const textileItems = inventory.filter(i => i.productClass === "textile");

  for (const item of textileItems) {
    const current = item.currentUnits;
    let status: TextileCoverageResult["status"];
    let gap: number;

    if (current < minimumUnits) {
      status = "below_minimum";
      gap = minimumUnits - current;
    } else if (current < idealUnits) {
      status = "below_ideal";
      gap = idealUnits - current;
    } else if (current > maximumUnits) {
      status = "above_maximum";
      gap = current - maximumUnits;
    } else {
      status = "ok";
      gap = 0;
    }

    if (status === "ok") continue;

    const severity = status === "below_minimum" ? "high" : status === "above_maximum" ? "medium" : "low";

    results.push({
      storeId: item.storeId,
      storeName: item.storeName,
      referenceCode: item.referenceCode,
      productName: item.productName,
      currentUnits: current,
      minimumUnits,
      idealUnits,
      maximumUnits,
      status,
      gap,
      evidence: buildEvidence(
        "STORE_TEXTILE_COVERAGE",
        `tcp-${item.storeId}-${item.referenceCode}`,
        "Cobertura Textil por Referencia",
        `Referencia ${item.referenceCode} en tienda ${item.storeName} tiene ${current} und, ${status === "below_minimum" ? "por debajo del minimo" : status === "below_ideal" ? "por debajo del ideal" : "por encima del maximo"} (min=${minimumUnits}, ideal=${idealUnits}, max=${maximumUnits})`,
        {
          storeId: item.storeId,
          storeName: item.storeName,
          referenceCode: item.referenceCode,
          currentUnits: current,
          minimumUnits,
          idealUnits,
          maximumUnits,
          productClass: item.productClass,
        },
        status === "below_minimum" || status === "below_ideal"
          ? `Surtir ${gap} und de ${item.referenceCode} a ${item.storeName}`
          : `Considerar transferir ${gap} und de ${item.referenceCode} desde ${item.storeName}`,
        status === "below_minimum"
          ? `Stock actual (${current}) esta por debajo del minimo configurado (${minimumUnits}). Riesgo de agotamiento.`
          : status === "below_ideal"
            ? `Stock actual (${current}) esta por debajo del ideal (${idealUnits}). Oportunidad de mejorar exhibicion.`
            : `Stock actual (${current}) excede el maximo (${maximumUnits}). Capital inmovilizado.`,
        0.95,
        severity,
      ),
    });
  }

  return results;
}

// ── FASE 3: Global Low Stock (Rule 36) ──────────────────────────────────────

export function evaluateGlobalLowStock(
  inventory: StoreInventorySnapshot[],
  config: StorePolicyPackConfig,
): GlobalLowStockResult[] {
  const { threshold, allowedStoreIds, allowedStoreNames } = config.globalLowStock;
  const results: GlobalLowStockResult[] = [];

  const textileItems = inventory.filter(i => i.productClass === "textile");

  // Group by reference
  const byRef = new Map<string, StoreInventorySnapshot[]>();
  for (const item of textileItems) {
    const existing = byRef.get(item.referenceCode) ?? [];
    existing.push(item);
    byRef.set(item.referenceCode, existing);
  }

  for (const [refCode, items] of byRef) {
    const totalUnits = items.reduce((sum, i) => sum + i.currentUnits, 0);

    if (totalUnits > threshold) continue;

    const transferOutStores = items
      .filter(i => !allowedStoreIds.includes(i.storeId) && i.currentUnits > 0)
      .map(i => ({
        storeId: i.storeId,
        storeName: i.storeName,
        currentUnits: i.currentUnits,
        suggestedAction: "transfer_out" as const,
      }));

    if (transferOutStores.length === 0) continue;

    const productName = items[0]?.productName ?? refCode;

    results.push({
      referenceCode: refCode,
      productName,
      totalUnitsAllWarehouses: totalUnits,
      threshold,
      allowedStores: allowedStoreNames,
      transferOutStores,
      evidence: buildEvidence(
        "STORE_GLOBAL_LOW_STOCK",
        `gls-${refCode}`,
        "Regla 36 — Stock Global Bajo",
        `Referencia ${refCode} tiene ${totalUnits} und en total (umbral: ${threshold}). Solo debe permanecer en ${allowedStoreNames.join(" y ")}.`,
        {
          referenceCode: refCode,
          totalUnitsAllWarehouses: totalUnits,
          threshold,
          allowedStoreIds,
          storeBreakdown: items.map(i => ({
            storeId: i.storeId,
            storeName: i.storeName,
            units: i.currentUnits,
          })),
        },
        `Transferir stock de ${transferOutStores.map(s => s.storeName).join(", ")} hacia ${allowedStoreNames.join("/")}`,
        `Con solo ${totalUnits} und en total (umbral ${threshold}), la referencia debe concentrarse en las tiendas de mayor rotacion (${allowedStoreNames.join(", ")}) para maximizar la probabilidad de venta.`,
        0.9,
        "high",
      ),
    });
  }

  return results;
}

// ── FASE 4: Accessory Coverage ──────────────────────────────────────────────

export function evaluateAccessoryCoverage(
  inventory: StoreInventorySnapshot[],
  config: StorePolicyPackConfig,
): AccessoryCoverageResult[] {
  const { idealBySize } = config.accessoryCoverage;
  const results: AccessoryCoverageResult[] = [];

  const accessoryItems = inventory.filter(
    i => i.productClass === "accessory" || i.productClass === "bulky",
  );

  for (const item of accessoryItems) {
    const sizeClass = item.sizeClass ?? "small";
    const ideal = idealBySize[sizeClass] ?? idealBySize.small;
    const current = item.currentUnits;

    let status: AccessoryCoverageResult["status"];
    let gap: number;

    if (current < ideal) {
      status = "below";
      gap = ideal - current;
    } else if (current > ideal) {
      status = "above";
      gap = current - ideal;
    } else {
      status = "ok";
      gap = 0;
    }

    if (status === "ok") continue;

    results.push({
      storeId: item.storeId,
      storeName: item.storeName,
      referenceCode: item.referenceCode,
      productName: item.productName,
      sizeClass,
      currentUnits: current,
      idealUnits: ideal,
      status,
      gap,
      evidence: buildEvidence(
        "STORE_ACCESSORY_COVERAGE",
        `acc-${item.storeId}-${item.referenceCode}`,
        "Cobertura Accesorios por Tamano",
        `Accesorio ${item.referenceCode} (tamano: ${sizeClass}) en ${item.storeName} tiene ${current} und, ideal es ${ideal}`,
        {
          storeId: item.storeId,
          storeName: item.storeName,
          referenceCode: item.referenceCode,
          sizeClass,
          currentUnits: current,
          idealUnits: ideal,
        },
        status === "below"
          ? `Surtir ${gap} und de ${item.referenceCode} a ${item.storeName}`
          : `Considerar transferir ${gap} und de ${item.referenceCode} desde ${item.storeName}`,
        status === "below"
          ? `Stock (${current}) por debajo del ideal para accesorios tamano ${sizeClass} (${ideal} und).`
          : `Stock (${current}) por encima del ideal para tamano ${sizeClass} (${ideal} und).`,
        0.9,
        status === "below" ? "medium" : "low",
      ),
    });
  }

  return results;
}

// ── FASE 5: Special Products ────────────────────────────────────────────────

export function evaluateSpecialProducts(
  inventory: StoreInventorySnapshot[],
  config: StorePolicyPackConfig,
): SpecialProductResult[] {
  const { referencePatterns, idealByStore, defaultIdeal } = config.specialProducts;
  const results: SpecialProductResult[] = [];

  for (const item of inventory) {
    const isSpecial = referencePatterns.some(pattern =>
      item.referenceCode.toUpperCase().includes(pattern) ||
      item.productName.toUpperCase().includes(pattern),
    );
    if (!isSpecial) continue;

    const ideal = idealByStore[item.storeId] ?? defaultIdeal;
    const current = item.currentUnits;

    let status: SpecialProductResult["status"];
    let gap: number;

    if (current < ideal) {
      status = "below";
      gap = ideal - current;
    } else if (current > ideal) {
      status = "above";
      gap = current - ideal;
    } else {
      status = "ok";
      gap = 0;
    }

    if (status === "ok") continue;

    const severity = ideal === 0 && current > 0 ? "high" : status === "below" ? "medium" : "low";

    results.push({
      storeId: item.storeId,
      storeName: item.storeName,
      referenceCode: item.referenceCode,
      productName: item.productName,
      currentUnits: current,
      idealUnits: ideal,
      status,
      gap,
      evidence: buildEvidence(
        "STORE_SPECIAL_PRODUCT",
        `sp-${item.storeId}-${item.referenceCode}`,
        "Producto Especial — Estado Ideal",
        ideal === 0 && current > 0
          ? `Producto especial ${item.referenceCode} no debe estar en ${item.storeName} (ideal=0, actual=${current})`
          : `Producto especial ${item.referenceCode} en ${item.storeName}: actual=${current}, ideal=${ideal}`,
        {
          storeId: item.storeId,
          storeName: item.storeName,
          referenceCode: item.referenceCode,
          productName: item.productName,
          currentUnits: current,
          idealUnits: ideal,
          isSpecialProduct: true,
        },
        ideal === 0 && current > 0
          ? `Transferir ${current} und de ${item.referenceCode} desde ${item.storeName} a tienda autorizada`
          : status === "below"
            ? `Surtir ${gap} und de ${item.referenceCode} a ${item.storeName}`
            : `Reducir ${gap} und de ${item.referenceCode} en ${item.storeName}`,
        ideal === 0
          ? `Este producto especial solo debe estar en tiendas autorizadas (${Object.keys(idealByStore).join(", ")}). ${item.storeName} no esta autorizada.`
          : `Producto especial con estado ideal configurado de ${ideal} und para ${item.storeName}.`,
        0.95,
        severity,
      ),
    });
  }

  return results;
}

// ── FASE 6: Automatic Markdowns ─────────────────────────────────────────────

export function evaluateAutomaticMarkdowns(
  inventory: StoreInventorySnapshot[],
  config: StorePolicyPackConfig,
): AutomaticMarkdownResult[] {
  const { applicableStoreIds, tiers } = config.automaticMarkdown;
  const results: AutomaticMarkdownResult[] = [];

  // Sort tiers descending (highest months first)
  const sortedTiers = [...tiers].sort((a, b) => b.monthsThreshold - a.monthsThreshold);

  const applicableItems = inventory.filter(
    i => applicableStoreIds.includes(i.storeId) && (i.daysInStore ?? 0) > 0 && i.currentUnits > 0,
  );

  for (const item of applicableItems) {
    const days = item.daysInStore ?? 0;
    const months = Math.floor(days / 30);

    // Find the highest applicable tier
    const tier = sortedTiers.find(t => months >= t.monthsThreshold);
    if (!tier) continue;

    const markdown = [
      `## Sugerencia de Descuento`,
      ``,
      `**Referencia:** ${item.referenceCode}`,
      `**Producto:** ${item.productName}`,
      `**Tienda:** ${item.storeName}`,
      `**Dias en tienda:** ${days} (${months} meses)`,
      `**Inventario actual:** ${item.currentUnits} und`,
      `**Descuento sugerido:** ${tier.discountPct}%`,
      ``,
      `### Politica aplicada`,
      `Segun la politica de descuentos automaticos:`,
      ...tiers.map(t => `- ${t.monthsThreshold} meses → ${t.discountPct}%`),
      ``,
      `> Este descuento es una **sugerencia**. Requiere aprobacion antes de aplicarse.`,
    ].join("\n");

    results.push({
      storeId: item.storeId,
      storeName: item.storeName,
      referenceCode: item.referenceCode,
      productName: item.productName,
      daysInStore: days,
      monthsInStore: months,
      currentUnits: item.currentUnits,
      suggestedDiscountPct: tier.discountPct,
      suggestedMarkdown: markdown,
      evidence: buildEvidence(
        "STORE_AUTOMATIC_MARKDOWN",
        `md-${item.storeId}-${item.referenceCode}`,
        "Descuento Automatico por Antiguedad",
        `${item.referenceCode} en ${item.storeName} lleva ${months} meses (${days} dias). Aplica descuento de ${tier.discountPct}%.`,
        {
          storeId: item.storeId,
          storeName: item.storeName,
          referenceCode: item.referenceCode,
          daysInStore: days,
          monthsInStore: months,
          currentUnits: item.currentUnits,
          tierApplied: tier,
          allTiers: tiers,
        },
        `Sugerir descuento de ${tier.discountPct}% para ${item.referenceCode} en ${item.storeName}`,
        `El producto lleva ${months} meses en tienda con ${item.currentUnits} und sin vender. Segun politica de descuentos: ${tier.monthsThreshold} meses = ${tier.discountPct}%.`,
        0.85,
        months >= 9 ? "high" : months >= 6 ? "medium" : "low",
      ),
    });
  }

  return results;
}

// ── FASE 7: Slow Rotation ───────────────────────────────────────────────────

export function evaluateSlowRotation(
  inventory: StoreInventorySnapshot[],
  config: StorePolicyPackConfig,
): SlowRotationResult[] {
  const { minimumDaysThreshold } = config.slowRotation;
  const { tiers } = config.automaticMarkdown;
  const results: SlowRotationResult[] = [];

  const sortedTiers = [...tiers].sort((a, b) => b.monthsThreshold - a.monthsThreshold);

  const slowItems = inventory.filter(
    i => (i.daysInStore ?? 0) >= minimumDaysThreshold && i.currentUnits > 0,
  );

  for (const item of slowItems) {
    const days = item.daysInStore ?? 0;
    const months = Math.floor(days / 30);

    const tier = sortedTiers.find(t => months >= t.monthsThreshold);
    const discountPct = tier?.discountPct ?? 0;

    results.push({
      storeId: item.storeId,
      storeName: item.storeName,
      referenceCode: item.referenceCode,
      productName: item.productName,
      daysInStore: days,
      monthsInStore: months,
      currentUnits: item.currentUnits,
      suggestedDiscountPct: discountPct,
      evidence: buildEvidence(
        "STORE_SLOW_ROTATION",
        `sr-${item.storeId}-${item.referenceCode}`,
        "Baja Rotacion en Tienda",
        `${item.referenceCode} en ${item.storeName} lleva ${days} dias (${months} meses) con ${item.currentUnits} und sin vender.`,
        {
          storeId: item.storeId,
          storeName: item.storeName,
          referenceCode: item.referenceCode,
          daysInStore: days,
          monthsInStore: months,
          currentUnits: item.currentUnits,
          minimumDaysThreshold,
          suggestedDiscountPct: discountPct,
        },
        discountPct > 0
          ? `Aplicar descuento de ${discountPct}% o transferir a tienda con mayor rotacion`
          : `Monitorear rotacion — aun no alcanza umbral de descuento`,
        `Producto lleva ${days} dias en tienda (umbral de alerta: ${minimumDaysThreshold} dias). ${item.currentUnits} und inmovilizadas.`,
        0.85,
        days >= 270 ? "high" : days >= 180 ? "medium" : "low",
      ),
    });
  }

  return results;
}

// ── FASE 8: Assortment Suggestion ───────────────────────────────────────────

export function evaluateAssortmentSuggestion(
  inventory: StoreInventorySnapshot[],
  salesHistory: StoreSalesRecord[],
  config: StorePolicyPackConfig,
): AssortmentSuggestionResult[] {
  const results: AssortmentSuggestionResult[] = [];

  // Group inventory by store
  const storeIds = [...new Set(inventory.map(i => i.storeId))];

  for (const storeId of storeIds) {
    const storeItems = inventory.filter(i => i.storeId === storeId);
    const storeSales = salesHistory.filter(s => s.storeId === storeId);

    // Find items that are low/out of stock
    const { minimumUnits } = config.textileCoverage;
    const needsReplenishment = storeItems.filter(i => i.currentUnits < minimumUnits);

    if (needsReplenishment.length === 0) continue;

    // Prioritize by THIS store's sales history (not global)
    const salesByRef = new Map<string, number>();
    for (const sale of storeSales) {
      salesByRef.set(sale.referenceCode, (salesByRef.get(sale.referenceCode) ?? 0) + sale.unitsSold);
    }

    const suggestions = needsReplenishment
      .map(item => ({
        referenceCode: item.referenceCode,
        productName: item.productName,
        storeSalesCount: salesByRef.get(item.referenceCode) ?? 0,
        suggestedQty: config.textileCoverage.idealUnits - item.currentUnits,
        reason: salesByRef.has(item.referenceCode)
          ? `Venta historica en esta tienda: ${salesByRef.get(item.referenceCode)} und. Stock actual bajo.`
          : `Sin historial de ventas en esta tienda. Surtir con base en cobertura minima.`,
      }))
      .sort((a, b) => b.storeSalesCount - a.storeSalesCount);

    const storeName = storeItems[0]?.storeName ?? storeId;

    results.push({
      storeId,
      storeName,
      suggestions,
      evidence: buildEvidence(
        "STORE_ASSORTMENT_SUGGESTION",
        `as-${storeId}`,
        "Sugerencia de Surtido por Historial",
        `Tienda ${storeName} tiene ${needsReplenishment.length} referencias por debajo del minimo. Sugerencias priorizadas por ventas de ESTA tienda.`,
        {
          storeId,
          storeName,
          totalNeedsReplenishment: needsReplenishment.length,
          totalSuggestions: suggestions.length,
          topReferences: suggestions.slice(0, 5).map(s => s.referenceCode),
          usedStoreSalesHistory: true,
          usedGlobalSales: false,
        },
        `Surtir ${suggestions.length} referencias priorizando las de mayor venta historica en ${storeName}`,
        `Las sugerencias se basan exclusivamente en el historial de ventas de ${storeName}, no en ventas globales. Esto asegura que cada tienda reciba lo que realmente vende.`,
        storeSales.length > 0 ? 0.85 : 0.5,
        "medium",
      ),
    });
  }

  return results;
}

// ── FASE 9: Comparative Report ──────────────────────────────────────────────

export function evaluateComparativeReport(
  salesHistory: StoreSalesRecord[],
): ComparativeReportResult | null {
  if (salesHistory.length === 0) return null;

  // Top selling store
  const salesByStore = new Map<string, { storeName: string; total: number }>();
  for (const s of salesHistory) {
    const existing = salesByStore.get(s.storeId) ?? { storeName: s.storeName, total: 0 };
    existing.total += s.unitsSold;
    salesByStore.set(s.storeId, existing);
  }

  const topSelling = [...salesByStore.entries()]
    .sort((a, b) => b[1].total - a[1].total)[0];

  // Top rotation store (lowest avg days to sell)
  const rotationByStore = new Map<string, { storeName: string; totalDays: number; count: number }>();
  for (const s of salesHistory) {
    if (s.avgDaysToSell <= 0) continue;
    const existing = rotationByStore.get(s.storeId) ?? { storeName: s.storeName, totalDays: 0, count: 0 };
    existing.totalDays += s.avgDaysToSell;
    existing.count += 1;
    rotationByStore.set(s.storeId, existing);
  }

  const topRotation = [...rotationByStore.entries()]
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => (a[1].totalDays / a[1].count) - (b[1].totalDays / b[1].count))[0];

  // Top margin store
  const marginByStore = new Map<string, { storeName: string; totalMargin: number }>();
  for (const s of salesHistory) {
    const margin = s.revenue - s.cost;
    const existing = marginByStore.get(s.storeId) ?? { storeName: s.storeName, totalMargin: 0 };
    existing.totalMargin += margin;
    marginByStore.set(s.storeId, existing);
  }

  const topMargin = [...marginByStore.entries()]
    .sort((a, b) => b[1].totalMargin - a[1].totalMargin)[0];

  // Cross-store opportunities
  const salesByRefStore = new Map<string, Map<string, { storeName: string; sales: number }>>();
  for (const s of salesHistory) {
    if (!salesByRefStore.has(s.referenceCode)) salesByRefStore.set(s.referenceCode, new Map());
    const refMap = salesByRefStore.get(s.referenceCode)!;
    const existing = refMap.get(s.storeId) ?? { storeName: s.storeName, sales: 0 };
    existing.sales += s.unitsSold;
    refMap.set(s.storeId, existing);
  }

  const crossStoreOpportunities: ComparativeReportResult["crossStoreOpportunities"] = [];

  for (const [refCode, storeMap] of salesByRefStore) {
    const entries = [...storeMap.entries()].sort((a, b) => b[1].sales - a[1].sales);
    if (entries.length < 2) continue;

    const [strongId, strongData] = entries[0];
    const [weakId, weakData] = entries[entries.length - 1];

    const gap = strongData.sales - weakData.sales;
    if (gap < 3) continue;

    const productName = salesHistory.find(s => s.referenceCode === refCode)?.productName ?? refCode;

    crossStoreOpportunities.push({
      referenceCode: refCode,
      productName,
      strongStore: { storeId: strongId, storeName: strongData.storeName, sales: strongData.sales },
      weakStore: { storeId: weakId, storeName: weakData.storeName, sales: weakData.sales },
      gap,
    });
  }

  crossStoreOpportunities.sort((a, b) => b.gap - a.gap);

  return {
    topSellingStore: topSelling
      ? { storeId: topSelling[0], storeName: topSelling[1].storeName, totalSales: topSelling[1].total }
      : null,
    topRotationStore: topRotation
      ? {
          storeId: topRotation[0],
          storeName: topRotation[1].storeName,
          avgDaysToSell: Math.round(topRotation[1].totalDays / topRotation[1].count),
        }
      : null,
    topMarginStore: topMargin
      ? { storeId: topMargin[0], storeName: topMargin[1].storeName, grossMargin: topMargin[1].totalMargin }
      : null,
    crossStoreOpportunities: crossStoreOpportunities.slice(0, 20),
    evidence: buildEvidence(
      "STORE_COMPARATIVE_REPORT",
      "cr-global",
      "Informe Comparativo de Tiendas",
      `Comparacion de ${salesByStore.size} tiendas. ${crossStoreOpportunities.length} oportunidades cruzadas encontradas.`,
      {
        totalStores: salesByStore.size,
        totalReferences: salesByRefStore.size,
        totalCrossOpportunities: crossStoreOpportunities.length,
      },
      crossStoreOpportunities.length > 0
        ? `Revisar ${crossStoreOpportunities.length} referencias con potencial de venta cruzada entre tiendas`
        : `Sin oportunidades de venta cruzada identificadas`,
      `Comparacion basada en ventas reales por tienda. Oportunidades cruzadas identifican referencias que venden bien en una tienda pero no en otra.`,
      salesHistory.length > 10 ? 0.8 : 0.5,
      "info",
    ),
  };
}

// ── Full evaluation ─────────────────────────────────────────────────────────

export function evaluateStorePolicyPack(
  config: StorePolicyPackConfig,
  inventory: StoreInventorySnapshot[],
  salesHistory: StoreSalesRecord[],
): StoreDecisionEvaluationResult {
  const textileCoverage = evaluateTextileCoverage(inventory, config);
  const globalLowStock = evaluateGlobalLowStock(inventory, config);
  const accessoryCoverage = evaluateAccessoryCoverage(inventory, config);
  const specialProducts = evaluateSpecialProducts(inventory, config);
  const automaticMarkdowns = evaluateAutomaticMarkdowns(inventory, config);
  const slowRotation = evaluateSlowRotation(inventory, config);
  const assortmentSuggestions = evaluateAssortmentSuggestion(inventory, salesHistory, config);
  const comparativeReport = evaluateComparativeReport(salesHistory);

  const allEvidence: StorePolicyEvidenceItem[] = [
    ...textileCoverage.map(r => r.evidence),
    ...globalLowStock.map(r => r.evidence),
    ...accessoryCoverage.map(r => r.evidence),
    ...specialProducts.map(r => r.evidence),
    ...automaticMarkdowns.map(r => r.evidence),
    ...slowRotation.map(r => r.evidence),
    ...assortmentSuggestions.map(r => r.evidence),
    ...(comparativeReport ? [comparativeReport.evidence] : []),
  ];

  return {
    tenantId: config.tenantId,
    evaluatedAt: new Date().toISOString(),
    policyPackVersion: config.version,
    textileCoverage,
    globalLowStock,
    accessoryCoverage,
    specialProducts,
    automaticMarkdowns,
    slowRotation,
    assortmentSuggestions,
    comparativeReport,
    allEvidence,
  };
}
