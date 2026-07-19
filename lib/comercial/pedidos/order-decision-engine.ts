/**
 * lib/comercial/pedidos/order-decision-engine.ts
 *
 * Order Decision Engine — evaluates all order policies and produces
 * decisions with full evidence.
 *
 * Pure functions — no DB, no Prisma, no side effects.
 * Consumes only:
 *   - OrderPolicyPackConfig (configuration)
 *   - OrderPolicyContext (data)
 *   - SizeInventorySnapshot[] (data)
 *
 * Every evaluation answers three questions:
 *   1. Why did it activate?
 *   2. What data did it use?
 *   3. What action does it recommend and why?
 *
 * Sprint: CASTILLITOS-ORDER-POLICY-PACK-01
 */

import type {
  OrderPolicyType,
  OrderPolicyEvidenceItem,
  CustomerBranchResult,
  CustomerCreditResult,
  AutoSizeDistributionResult,
  SizeDistributionEntry,
  PartialDeliveryResult,
  DeliveryStatus,
  DiscountOverrideResult,
  OrderReadinessResult,
  OrderReadinessCheck,
  OrderReadinessStatus,
  OrderDecisionEvaluationResult,
  OrderPolicyContext,
  SizeInventorySnapshot,
} from "./order-decision-types";

import type { OrderPolicyPackConfig } from "./order-policy-pack-config";

// ── Evidence builder ────────────────────────────────────────────────────────

function buildEvidence(
  policyType: OrderPolicyType,
  policyId: string,
  policyName: string,
  activationReason: string,
  dataUsed: Record<string, unknown>,
  recommendedAction: string,
  actionRationale: string,
  confidence: number,
  severity: OrderPolicyEvidenceItem["severity"],
): OrderPolicyEvidenceItem {
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

// ── FASE 2: Customer Branch ─────────────────────────────────────────────────

export function evaluateCustomerBranch(
  ctx: OrderPolicyContext,
): CustomerBranchResult {
  const { branches, customerId, customerName, selectedBranchCode } = ctx;

  if (branches.length === 0) {
    return {
      customerId,
      customerName,
      branches: [],
      selectedBranch: null,
      selectionMode: "no_branches",
      evidence: buildEvidence(
        "ORDER_CUSTOMER_BRANCH",
        `ocb-${customerId}`,
        "Seleccion de Sucursal",
        `Cliente ${customerName} no tiene sucursales registradas.`,
        { customerId, customerName, branchCount: 0 },
        "Registrar sucursal del cliente antes de continuar",
        "Sin sucursal no se puede determinar la direccion de entrega.",
        0.5,
        "medium",
      ),
    };
  }

  if (branches.length === 1) {
    const branch = branches[0];
    return {
      customerId,
      customerName,
      branches,
      selectedBranch: branch,
      selectionMode: "auto_single",
      evidence: buildEvidence(
        "ORDER_CUSTOMER_BRANCH",
        `ocb-${customerId}`,
        "Seleccion de Sucursal",
        `Cliente ${customerName} tiene una unica sucursal (${branch.name}). Seleccionada automaticamente.`,
        {
          customerId, customerName, branchCount: 1,
          selectedBranch: branch.branchCode,
          selectedBranchName: branch.name,
          address: branch.address,
          city: branch.city,
        },
        `Usar sucursal "${branch.name}" para despacho`,
        "Sucursal unica — seleccion automatica sin ambiguedad.",
        1.0,
        "info",
      ),
    };
  }

  // Multiple branches — check if one is pre-selected
  const selected = selectedBranchCode
    ? branches.find(b => b.branchCode === selectedBranchCode) ?? null
    : null;

  return {
    customerId,
    customerName,
    branches,
    selectedBranch: selected,
    selectionMode: "requires_selection",
    evidence: buildEvidence(
      "ORDER_CUSTOMER_BRANCH",
      `ocb-${customerId}`,
      "Seleccion de Sucursal",
      `Cliente ${customerName} tiene ${branches.length} sucursales. ${selected ? `Sucursal "${selected.name}" preseleccionada.` : "Se requiere seleccion."}`,
      {
        customerId, customerName,
        branchCount: branches.length,
        availableBranches: branches.map(b => ({ code: b.branchCode, name: b.name, city: b.city })),
        selectedBranch: selected?.branchCode ?? null,
      },
      selected
        ? `Confirmar sucursal "${selected.name}" o seleccionar otra`
        : `Seleccionar una de las ${branches.length} sucursales disponibles`,
      `El cliente tiene multiples puntos de entrega. La politica no asume — se requiere seleccion explicita.`,
      selected ? 0.9 : 0.3,
      selected ? "info" : "medium",
    ),
  };
}

// ── FASE 3: Customer Credit ─────────────────────────────────────────────────

export function evaluateCustomerCredit(
  ctx: OrderPolicyContext,
  config: OrderPolicyPackConfig,
): CustomerCreditResult {
  const { customerId, customerName, credit } = ctx;
  const { warningDaysPastDue, criticalDaysPastDue } = config.customerCredit;
  const { totalReceivable, overdueReceivable, maxDaysPastDue } = credit;

  const alerts: CustomerCreditResult["alerts"] = [];
  let creditStatus: CustomerCreditResult["creditStatus"] = "approved";

  if (maxDaysPastDue >= criticalDaysPastDue) {
    creditStatus = "blocked";
    alerts.push({
      message: `Cartera vencida ${maxDaysPastDue} dias (umbral critico: ${criticalDaysPastDue} dias). Monto vencido: $${overdueReceivable.toLocaleString()}.`,
      severity: "critical",
      daysPastDue: maxDaysPastDue,
    });
  } else if (maxDaysPastDue >= warningDaysPastDue) {
    creditStatus = "warning";
    alerts.push({
      message: `Cartera vencida ${maxDaysPastDue} dias (umbral: ${warningDaysPastDue} dias). Monto vencido: $${overdueReceivable.toLocaleString()}.`,
      severity: "warning",
      daysPastDue: maxDaysPastDue,
    });
  }

  const severity = creditStatus === "blocked" ? "critical"
    : creditStatus === "warning" ? "high"
    : "info";

  return {
    customerId,
    customerName,
    totalReceivable,
    overdueReceivable,
    maxDaysPastDue,
    creditStatus,
    alerts,
    evidence: buildEvidence(
      "ORDER_CUSTOMER_CREDIT",
      `occ-${customerId}`,
      "Validacion Cartera del Cliente",
      creditStatus === "approved"
        ? `Cliente ${customerName} sin cartera vencida significativa. Cartera total: $${totalReceivable.toLocaleString()}.`
        : `Cliente ${customerName} con cartera vencida de ${maxDaysPastDue} dias. Monto vencido: $${overdueReceivable.toLocaleString()}.`,
      {
        customerId, customerName,
        totalReceivable, overdueReceivable, maxDaysPastDue,
        warningThreshold: warningDaysPastDue,
        criticalThreshold: criticalDaysPastDue,
        creditStatus,
      },
      creditStatus === "approved"
        ? "Continuar con el pedido"
        : creditStatus === "warning"
          ? `Alertar al vendedor sobre cartera vencida de ${maxDaysPastDue} dias`
          : `Revisar cartera vencida de ${maxDaysPastDue} dias antes de confirmar`,
      creditStatus === "approved"
        ? "Sin cartera vencida significativa. No se requiere accion."
        : `La cartera vencida de ${maxDaysPastDue} dias supera el umbral de ${creditStatus === "blocked" ? criticalDaysPastDue : warningDaysPastDue} dias. ${creditStatus === "blocked" ? "Nivel critico — requiere revision de gerencia." : "Se genera alerta informativa."}`,
      creditStatus === "approved" ? 0.95 : 0.9,
      severity,
    ),
  };
}

// ── FASE 4: Auto Size Distribution ──────────────────────────────────────────

export function evaluateAutoSizeDistribution(
  referenceCode: string,
  productName: string,
  requestedUnits: number,
  sizeInventory: SizeInventorySnapshot,
  config: OrderPolicyPackConfig,
): AutoSizeDistributionResult {
  const { maxUnitsPerSize, minSizesForBalance, redistributeOnMissing } = config.autoSizeDistribution;

  const availableSizes = sizeInventory.sizes.filter(s => s.availableUnits > 0);
  const totalAvailable = availableSizes.reduce((sum, s) => sum + s.availableUnits, 0);

  if (availableSizes.length === 0) {
    return {
      referenceCode,
      productName,
      requestedUnits,
      totalAllocated: 0,
      unallocated: requestedUnits,
      distribution: sizeInventory.sizes.map(s => ({
        size: s.size,
        sizeName: s.sizeName,
        availableUnits: s.availableUnits,
        allocatedUnits: 0,
        reason: "Sin inventario disponible",
      })),
      balanced: false,
      evidence: buildEvidence(
        "ORDER_AUTO_SIZE_DISTRIBUTION",
        `oasd-${referenceCode}`,
        "Distribucion Automatica por Tallas",
        `Referencia ${referenceCode} sin inventario en ninguna talla.`,
        { referenceCode, productName, requestedUnits, totalAvailable: 0, sizesWithStock: 0 },
        "No se puede distribuir — sin inventario",
        "Ninguna talla tiene inventario disponible para esta referencia.",
        0.95,
        "high",
      ),
    };
  }

  // Balanced distribution algorithm
  const distribution: SizeDistributionEntry[] = [];
  let remaining = Math.min(requestedUnits, totalAvailable);
  const sizeCount = availableSizes.length;

  // Phase 1: equal distribution (floor)
  const basePerSize = Math.floor(remaining / sizeCount);
  const tempAlloc = new Map<string, number>();

  for (const s of availableSizes) {
    const alloc = Math.min(basePerSize, s.availableUnits, maxUnitsPerSize);
    tempAlloc.set(s.size, alloc);
    remaining -= alloc;
  }

  // Phase 2: distribute remainder one by one (round-robin)
  if (remaining > 0) {
    const sortedSizes = [...availableSizes].sort((a, b) => b.availableUnits - a.availableUnits);
    for (const s of sortedSizes) {
      if (remaining <= 0) break;
      const current = tempAlloc.get(s.size) ?? 0;
      const canAdd = Math.min(remaining, s.availableUnits - current, maxUnitsPerSize - current);
      if (canAdd > 0) {
        tempAlloc.set(s.size, current + canAdd);
        remaining -= canAdd;
      }
    }
  }

  let totalAllocated = 0;

  for (const s of sizeInventory.sizes) {
    const allocated = tempAlloc.get(s.size) ?? 0;
    totalAllocated += allocated;

    let reason: string;
    if (s.availableUnits === 0) {
      reason = redistributeOnMissing
        ? "Sin inventario — redistribuido a otras tallas"
        : "Sin inventario — talla omitida";
    } else if (allocated === s.availableUnits) {
      reason = "Inventario completo asignado";
    } else if (allocated > 0) {
      reason = "Distribucion equilibrada";
    } else {
      reason = "No asignado en esta distribucion";
    }

    distribution.push({
      size: s.size,
      sizeName: s.sizeName,
      availableUnits: s.availableUnits,
      allocatedUnits: allocated,
      reason,
    });
  }

  const balanced = availableSizes.length >= minSizesForBalance;

  return {
    referenceCode,
    productName,
    requestedUnits,
    totalAllocated,
    unallocated: requestedUnits - totalAllocated,
    distribution,
    balanced,
    evidence: buildEvidence(
      "ORDER_AUTO_SIZE_DISTRIBUTION",
      `oasd-${referenceCode}`,
      "Distribucion Automatica por Tallas",
      `Distribucion de ${requestedUnits} und de ${referenceCode} en ${availableSizes.length} tallas disponibles. Asignadas: ${totalAllocated}.`,
      {
        referenceCode, productName, requestedUnits,
        totalAvailable, sizesWithStock: availableSizes.length,
        totalSizes: sizeInventory.sizes.length,
        totalAllocated, unallocated: requestedUnits - totalAllocated,
        balanced,
        distribution: distribution.map(d => ({ size: d.size, allocated: d.allocatedUnits, available: d.availableUnits })),
      },
      totalAllocated === requestedUnits
        ? `Distribucion completa: ${totalAllocated} und en ${availableSizes.length} tallas`
        : `Distribucion parcial: ${totalAllocated} de ${requestedUnits} und. Deficit: ${requestedUnits - totalAllocated} und.`,
      `Algoritmo de nivelacion: distribuye equitativamente entre tallas disponibles, evita concentrar inventario. ${remaining > 0 ? `No se pudo completar — inventario insuficiente.` : "Todas las unidades asignadas."}`,
      totalAllocated === requestedUnits ? 0.95 : 0.7,
      totalAllocated === requestedUnits ? "info" : totalAllocated > 0 ? "medium" : "high",
    ),
  };
}

// ── FASE 5: Partial Delivery ────────────────────────────────────────────────

export function evaluatePartialDelivery(
  ctx: OrderPolicyContext,
  config: OrderPolicyPackConfig,
): PartialDeliveryResult {
  const { orderId, lines } = ctx;
  const { partialDeliveryEnabled, backorderEnabled } = config.partialDelivery;

  const lineDetails: PartialDeliveryResult["lineDetails"] = [];
  let fulfillableLines = 0;
  let backorderLines = 0;

  for (const line of lines) {
    const available = line.availableUnits ?? 0;
    const requested = line.quantity;
    const fulfillable = Math.min(requested, available);
    const backorder = requested - fulfillable;

    let status: DeliveryStatus;
    if (fulfillable >= requested) {
      status = "COMPLETE";
      fulfillableLines++;
    } else if (fulfillable > 0 && partialDeliveryEnabled) {
      status = "PARTIAL";
      fulfillableLines++;
      if (backorder > 0 && backorderEnabled) backorderLines++;
    } else {
      status = "BACKORDER";
      backorderLines++;
    }

    lineDetails.push({
      referenceCode: line.referenceCode,
      size: line.size,
      color: line.color,
      requestedQty: requested,
      availableQty: available,
      fulfillableQty: fulfillable,
      backorderQty: backorder,
      status,
    });
  }

  let deliveryStatus: DeliveryStatus;
  if (lineDetails.every(l => l.status === "COMPLETE")) {
    deliveryStatus = "COMPLETE";
  } else if (lineDetails.some(l => l.status === "COMPLETE" || l.status === "PARTIAL")) {
    deliveryStatus = "PARTIAL";
  } else {
    deliveryStatus = "BACKORDER";
  }

  const severity = deliveryStatus === "COMPLETE" ? "info"
    : deliveryStatus === "PARTIAL" ? "medium"
    : "high";

  return {
    orderId,
    totalLines: lines.length,
    fulfillableLines,
    backorderLines,
    deliveryStatus,
    lineDetails,
    evidence: buildEvidence(
      "ORDER_PARTIAL_DELIVERY",
      `opd-${orderId}`,
      "Despacho Parcial",
      deliveryStatus === "COMPLETE"
        ? `Todas las lineas tienen inventario completo.`
        : `${fulfillableLines} de ${lines.length} lineas con inventario completo/parcial. ${backorderLines} en backorder.`,
      {
        orderId, totalLines: lines.length,
        fulfillableLines, backorderLines, deliveryStatus,
        partialDeliveryEnabled, backorderEnabled,
      },
      deliveryStatus === "COMPLETE"
        ? "Despachar pedido completo"
        : deliveryStatus === "PARTIAL"
          ? `Despachar parcial (${fulfillableLines} lineas) y generar backorder para ${backorderLines} lineas`
          : "Generar backorder completo — sin inventario disponible",
      deliveryStatus === "COMPLETE"
        ? "Todo el inventario solicitado esta disponible."
        : `Inventario insuficiente para ${backorderLines} lineas. ${partialDeliveryEnabled ? "Despacho parcial habilitado." : "Despacho parcial deshabilitado — requiere inventario completo."}`,
      deliveryStatus === "COMPLETE" ? 0.95 : 0.8,
      severity,
    ),
  };
}

// ── FASE 6: Discount Override ───────────────────────────────────────────────

export function evaluateDiscountOverride(
  ctx: OrderPolicyContext,
  config: OrderPolicyPackConfig,
): DiscountOverrideResult | null {
  const { orderId, discount, discountOverride } = ctx;
  const { overrideAllowed, requireReason } = config.discountOverride;

  if (!discountOverride) return null;

  const hasReason = !!discountOverride.reason && discountOverride.reason.trim().length > 0;
  const valid = overrideAllowed && (!requireReason || hasReason);

  return {
    orderId,
    overrideApplied: valid,
    originalDiscount: discount,
    overriddenBy: discountOverride.by,
    overriddenAt: discountOverride.at,
    reason: discountOverride.reason,
    evidence: buildEvidence(
      "ORDER_DISCOUNT_OVERRIDE",
      `odo-${orderId}`,
      "Omision de Descuento",
      valid
        ? `Descuento omitido por ${discountOverride.by}. Motivo: ${discountOverride.reason}`
        : `Intento de omitir descuento ${!overrideAllowed ? "no permitido por politica" : "sin motivo (requerido)"}.`,
      {
        orderId,
        originalDiscount: discount,
        overriddenBy: discountOverride.by,
        overriddenAt: discountOverride.at,
        reason: discountOverride.reason,
        overrideAllowed, requireReason,
        valid,
      },
      valid
        ? "Descuento omitido — registro de trazabilidad completo"
        : requireReason && !hasReason
          ? "Proporcionar motivo para la omision del descuento"
          : "Omision de descuento no permitida por politica",
      valid
        ? `Trazabilidad: usuario=${discountOverride.by}, fecha=${discountOverride.at}, motivo="${discountOverride.reason}".`
        : `La politica ${!overrideAllowed ? "no permite" : "requiere motivo para"} omisiones de descuento.`,
      valid ? 0.95 : 0.3,
      valid ? "info" : "high",
    ),
  };
}

// ── FASE 7: Order Readiness ─────────────────────────────────────────────────

export function evaluateOrderReadiness(
  ctx: OrderPolicyContext,
  branchResult: CustomerBranchResult,
  creditResult: CustomerCreditResult,
  deliveryResult: PartialDeliveryResult,
  config: OrderPolicyPackConfig,
): OrderReadinessResult {
  const { orderId, totalValue, totalUnits, lines } = ctx;
  const { minOrderValue, minOrderUnits, creditBlocksSubmission, branchRequiredForSubmission } = config.orderReadiness;

  const checks: OrderReadinessCheck[] = [];

  // Branch check
  if (branchResult.selectionMode === "no_branches") {
    checks.push({
      dimension: "Sucursal",
      status: branchRequiredForSubmission ? "blocked" : "warning",
      message: "Cliente sin sucursales registradas.",
    });
  } else if (branchResult.selectionMode === "requires_selection" && !branchResult.selectedBranch) {
    checks.push({
      dimension: "Sucursal",
      status: branchRequiredForSubmission ? "blocked" : "warning",
      message: `${branchResult.branches.length} sucursales disponibles. Seleccionar una.`,
    });
  } else {
    checks.push({
      dimension: "Sucursal",
      status: "ok",
      message: branchResult.selectedBranch
        ? `Sucursal: ${branchResult.selectedBranch.name}`
        : "Sucursal unica seleccionada.",
    });
  }

  // Customer info
  if (!ctx.customerId || !ctx.customerName) {
    checks.push({ dimension: "Cliente", status: "blocked", message: "Cliente no seleccionado." });
  } else {
    checks.push({ dimension: "Cliente", status: "ok", message: `Cliente: ${ctx.customerName}` });
  }

  // Credit check
  if (creditResult.creditStatus === "blocked" && creditBlocksSubmission) {
    checks.push({
      dimension: "Cartera",
      status: "blocked",
      message: `Cartera vencida ${creditResult.maxDaysPastDue} dias. Bloqueado por politica.`,
    });
  } else if (creditResult.creditStatus === "warning") {
    checks.push({
      dimension: "Cartera",
      status: "warning",
      message: `Cartera vencida ${creditResult.maxDaysPastDue} dias. Alerta informativa.`,
    });
  } else if (creditResult.creditStatus === "blocked") {
    checks.push({
      dimension: "Cartera",
      status: "warning",
      message: `Cartera vencida ${creditResult.maxDaysPastDue} dias. No bloquea por politica.`,
    });
  } else {
    checks.push({ dimension: "Cartera", status: "ok", message: "Cartera al dia." });
  }

  // Inventory check
  if (deliveryResult.deliveryStatus === "BACKORDER") {
    checks.push({ dimension: "Inventario", status: "warning", message: "Sin inventario para ninguna linea." });
  } else if (deliveryResult.deliveryStatus === "PARTIAL") {
    checks.push({
      dimension: "Inventario",
      status: "warning",
      message: `${deliveryResult.backorderLines} lineas sin inventario completo.`,
    });
  } else {
    checks.push({ dimension: "Inventario", status: "ok", message: "Inventario disponible para todas las lineas." });
  }

  // Lines
  if (lines.length === 0) {
    checks.push({ dimension: "Referencias", status: "blocked", message: "El pedido no tiene lineas." });
  } else {
    checks.push({ dimension: "Referencias", status: "ok", message: `${lines.length} lineas en el pedido.` });
  }

  // Sizes
  const linesWithoutSize = lines.filter(l => !l.size);
  if (linesWithoutSize.length > 0) {
    checks.push({
      dimension: "Tallas",
      status: "warning",
      message: `${linesWithoutSize.length} lineas sin talla especificada.`,
    });
  } else {
    checks.push({ dimension: "Tallas", status: "ok", message: "Todas las lineas con talla." });
  }

  // Minimum values
  if (totalValue < minOrderValue && minOrderValue > 0) {
    checks.push({
      dimension: "Valor",
      status: "blocked",
      message: `Valor total ($${totalValue.toLocaleString()}) menor al minimo ($${minOrderValue.toLocaleString()}).`,
    });
  }
  if (totalUnits < minOrderUnits) {
    checks.push({
      dimension: "Unidades",
      status: "blocked",
      message: `Total unidades (${totalUnits}) menor al minimo (${minOrderUnits}).`,
    });
  }

  // Determine overall status
  const hasBlocked = checks.some(c => c.status === "blocked");
  const hasWarning = checks.some(c => c.status === "warning");

  let status: OrderReadinessStatus;
  if (hasBlocked) status = "BLOCKED";
  else if (hasWarning) status = "WARNING";
  else status = "READY";

  return {
    orderId,
    status,
    checks,
    canSubmit: !hasBlocked,
    evidence: buildEvidence(
      "ORDER_READINESS",
      `or-${orderId}`,
      "Evaluacion de Preparacion del Pedido",
      `Pedido ${orderId}: ${status}. ${checks.filter(c => c.status !== "ok").length} dimensiones con observaciones.`,
      {
        orderId, status,
        totalChecks: checks.length,
        passed: checks.filter(c => c.status === "ok").length,
        warnings: checks.filter(c => c.status === "warning").length,
        blocked: checks.filter(c => c.status === "blocked").length,
        checkSummary: checks.map(c => ({ dimension: c.dimension, status: c.status })),
      },
      status === "READY"
        ? "Pedido listo para enviar"
        : status === "WARNING"
          ? "Pedido puede enviarse con advertencias"
          : "Pedido bloqueado — resolver dimensiones antes de enviar",
      `Evaluacion de ${checks.length} dimensiones: ${checks.filter(c => c.status === "ok").length} ok, ${checks.filter(c => c.status === "warning").length} advertencias, ${checks.filter(c => c.status === "blocked").length} bloqueos.`,
      status === "READY" ? 0.95 : status === "WARNING" ? 0.8 : 0.5,
      status === "READY" ? "info" : status === "WARNING" ? "medium" : "high",
    ),
  };
}

// ── Full evaluation ─────────────────────────────────────────────────────────

export function evaluateOrderPolicyPack(
  config: OrderPolicyPackConfig,
  ctx: OrderPolicyContext,
  sizeInventories: SizeInventorySnapshot[],
): OrderDecisionEvaluationResult {
  const branch = evaluateCustomerBranch(ctx);
  const credit = evaluateCustomerCredit(ctx, config);

  const autoSizeDistributions: AutoSizeDistributionResult[] = [];
  for (const inv of sizeInventories) {
    const line = ctx.lines.find(l => l.referenceCode === inv.referenceCode);
    if (!line) continue;
    autoSizeDistributions.push(
      evaluateAutoSizeDistribution(
        inv.referenceCode,
        inv.productName,
        line.quantity,
        inv,
        config,
      ),
    );
  }

  const delivery = evaluatePartialDelivery(ctx, config);
  const discountOverride = evaluateDiscountOverride(ctx, config);
  const readiness = evaluateOrderReadiness(ctx, branch, credit, delivery, config);

  const allEvidence: OrderPolicyEvidenceItem[] = [
    branch.evidence,
    credit.evidence,
    ...autoSizeDistributions.map(r => r.evidence),
    delivery.evidence,
    ...(discountOverride ? [discountOverride.evidence] : []),
    readiness.evidence,
  ];

  return {
    tenantId: config.tenantId,
    evaluatedAt: new Date().toISOString(),
    policyPackVersion: config.version,
    branch,
    credit,
    autoSizeDistributions,
    delivery,
    discountOverride,
    readiness,
    allEvidence,
  };
}
