/**
 * lib/comercial/rules/coverage/commercial-evidence-engine.ts
 *
 * Evidence Engine — collects structured evidence for every coverage decision.
 *
 * Evidence is collected FIRST, then explanation is derived FROM evidence.
 * Never the reverse.
 *
 * Pipeline:
 *   Input → Evidence Collection → Explanation Generation
 *
 * Sprint: COMMERCIAL-RULES-EVIDENCE-01
 */

import type { CommercialCoverageInput, CommercialCoverageEvaluation, CommercialCoverageSuggestion, CommercialCoverageDataQuality } from "./commercial-coverage-types";
import type {
  CommercialEvidence,
  CommercialEvidenceItem,
  ConfidenceFactor,
  DecisionTraceStep,
  DiscardedRuleEvidence,
  RuleEvidence,
  InventoryEvidence,
  StoreEvidence,
  ProductEvidence,
  StrategyEvidence,
  CalculationEvidence,
  ConfidenceEvidence,
  MissingDataEvidence,
  FallbackEvidence,
  WarningEvidence,
} from "./commercial-evidence-types";

// ── Evidence collection ─────────────────────────────────────────────────────

export function collectEvidence(
  input: CommercialCoverageInput,
  evaluation: CommercialCoverageEvaluation,
  suggestion: CommercialCoverageSuggestion,
  dataQuality: CommercialCoverageDataQuality,
): CommercialEvidence {
  const items: CommercialEvidenceItem[] = [];
  const missingData: string[] = [];

  // 1. Store evidence
  items.push(buildStoreEvidence(input));

  // 2. Product evidence
  items.push(buildProductEvidence(input));

  // 3. Strategy evidence
  items.push(buildStrategyEvidence(input, evaluation));

  // 4. Rule evidence
  items.push(buildRuleEvidence(input, evaluation));

  // 5. Inventory evidence
  items.push(buildInventoryEvidence(input));

  // 6. Calculation evidence
  items.push(buildCalculationEvidence(evaluation, suggestion));

  // 7. Confidence evidence
  const confidenceFactors = buildConfidenceFactors(input, evaluation, dataQuality);
  items.push(buildConfidenceEvidence(dataQuality, confidenceFactors));

  // 8. Missing data evidence
  const missing = detectMissingData(input, evaluation);
  if (missing.length > 0) {
    missingData.push(...missing);
    items.push(buildMissingDataEvidence(missing, evaluation));
  }

  // 9. Fallback evidence (if applicable)
  if (evaluation.state === "NO_RULE") {
    items.push(buildFallbackEvidence(evaluation));
  }

  // 10. Warning evidence (if applicable)
  if (suggestion.sourceConstrained) {
    items.push(buildWarningEvidence("SOURCE_CONSTRAINED", `Disponibilidad en origen limitada: solo ${input.sourceAvailableUnits ?? 0} unidades disponibles de ${suggestion.rawSuggestedQty} necesarias`));
  }

  if (evaluation.state === "ABOVE_MAX") {
    items.push(buildWarningEvidence("ABOVE_MAX", `Producto supera el maximo configurado (${evaluation.maxQty}). Considerar transferencia o reduccion.`));
  }

  // 11. Decision trace
  const decisionTrace = buildDecisionTrace(input, evaluation, suggestion);

  return {
    items,
    confidenceFactors,
    missingData,
    decisionTrace,
    collectedAt: new Date().toISOString(),
  };
}

// ── Individual evidence builders ────────────────────────────────────────────

function buildStoreEvidence(input: CommercialCoverageInput): StoreEvidence {
  return {
    type: "STORE",
    source: "COMMERCIAL_DATA_LAYER",
    label: "Tienda evaluada",
    confirmed: true,
    data: {
      storeId: input.storeId,
      storeName: input.storeName,
    },
  };
}

function buildProductEvidence(input: CommercialCoverageInput): ProductEvidence {
  return {
    type: "PRODUCT",
    source: "COMMERCIAL_DATA_LAYER",
    label: "Producto evaluado",
    confirmed: true,
    data: {
      referenceCode: input.referenceCode,
      productName: input.productName,
      productClass: input.productClass,
      businessLine: input.businessLine,
      subgroup: input.subgroup ?? null,
      sizeClass: input.sizeClass ?? null,
      category: input.category ?? null,
      color: input.color ?? null,
    },
  };
}

function buildStrategyEvidence(input: CommercialCoverageInput, evaluation: CommercialCoverageEvaluation): StrategyEvidence {
  return {
    type: "STRATEGY",
    source: "COVERAGE_STRATEGY",
    label: `Estrategia: ${evaluation.strategy === "SUBGROUP" ? "Por subgrupo" : "Por tamano"}`,
    confirmed: true,
    data: {
      businessLine: input.businessLine,
      coverageStrategy: evaluation.strategy,
      sizeClass: input.sizeClass ?? null,
      subgroup: input.subgroup ?? null,
      resolvedFrom: input.businessLine,
    },
  };
}

function buildRuleEvidence(input: CommercialCoverageInput, evaluation: CommercialCoverageEvaluation): RuleEvidence {
  const rule = evaluation.ruleMatch.selectedRule;
  const discardedRules: DiscardedRuleEvidence[] = evaluation.ruleMatch.discardedRules.map(d => ({
    ruleId: d.rule.id,
    scope: d.rule.scope,
    priority: d.rule.priority ?? 0,
    strategy: d.rule.coverageStrategy ?? "",
    matched: evaluation.ruleMatch.candidateRules.includes(d.rule),
    rejectionReason: d.rejectionReason,
    specificityRank: d.specificityRank,
    storeSpecific: !!d.rule.storeId,
    candidateValues: {
      min: d.rule.minQty ?? 0,
      ideal: d.rule.idealQty ?? 0,
      max: d.rule.maxQty ?? 0,
    },
  }));

  return {
    type: "RULE",
    source: "STORE_POLICY",
    label: rule ? `Regla aplicada: ${rule.scope} (prioridad ${rule.priority})` : "Sin regla aplicable",
    confirmed: !!rule,
    data: {
      ruleId: rule?.id ?? "",
      scope: rule?.scope ?? "none",
      priority: rule?.priority ?? 0,
      strategy: evaluation.strategy,
      storeId: rule?.storeId ?? "",
      minQty: rule?.minQty ?? 0,
      idealQty: rule?.idealQty ?? 0,
      maxQty: rule?.maxQty ?? 0,
      candidateCount: evaluation.ruleMatch.candidateRules.length,
      hadConflict: evaluation.ruleMatch.hadConflict,
      selectionReason: evaluation.ruleMatch.selectionReason,
      discardedRules,
    },
  };
}

function buildInventoryEvidence(input: CommercialCoverageInput): InventoryEvidence {
  return {
    type: "INVENTORY",
    source: "INVENTORY_SNAPSHOT",
    label: "Inventario actual",
    confirmed: input.currentUnits > 0 || input.availableUnits != null,
    data: {
      currentUnits: input.currentUnits,
      reservedUnits: input.reservedUnits ?? 0,
      availableUnits: input.availableUnits ?? input.currentUnits,
      incomingUnits: input.incomingUnits ?? 0,
      sourceAvailableUnits: input.sourceAvailableUnits ?? null,
    },
  };
}

function buildCalculationEvidence(evaluation: CommercialCoverageEvaluation, suggestion: CommercialCoverageSuggestion): CalculationEvidence {
  return {
    type: "CALCULATION",
    source: "CALCULATED",
    label: `Calculo: ${suggestion.action}`,
    confirmed: true,
    data: {
      currentCoverage: evaluation.currentCoverage,
      minQty: evaluation.minQty,
      idealQty: evaluation.idealQty,
      maxQty: evaluation.maxQty,
      gapToMin: evaluation.gapToMin,
      gapToIdeal: evaluation.gapToIdeal,
      excessOverMax: evaluation.excessOverMax,
      rawSuggestedQty: suggestion.rawSuggestedQty,
      finalSuggestedQty: suggestion.finalSuggestedQty,
      sourceConstrained: suggestion.sourceConstrained,
      unmetQty: suggestion.unmetQty,
      state: evaluation.state,
      action: suggestion.action,
    },
  };
}

function buildConfidenceEvidence(dataQuality: CommercialCoverageDataQuality, factors: ConfidenceFactor[]): ConfidenceEvidence {
  return {
    type: "SOURCE",
    source: "CALCULATED",
    label: `Confianza: ${dataQuality.confidenceLevel} (${(dataQuality.confidence * 100).toFixed(0)}%)`,
    confirmed: true,
    data: {
      confidence: dataQuality.confidence,
      confidenceLevel: dataQuality.confidenceLevel,
      factors,
    },
  };
}

function buildMissingDataEvidence(missing: string[], evaluation: CommercialCoverageEvaluation): MissingDataEvidence {
  const impact = evaluation.state === "INSUFFICIENT_DATA"
    ? "Impide calculo de cobertura"
    : "Reduce confianza de la recomendacion";
  return {
    type: "MISSING_DATA",
    source: "COMMERCIAL_DATA_LAYER",
    label: `Datos faltantes: ${missing.join(", ")}`,
    confirmed: true,
    data: {
      missingFields: missing,
      impact,
    },
  };
}

function buildFallbackEvidence(evaluation: CommercialCoverageEvaluation): FallbackEvidence {
  return {
    type: "FALLBACK",
    source: "SYSTEM_DEFAULT",
    label: "Se aplico comportamiento por defecto",
    confirmed: true,
    data: {
      reason: evaluation.ruleMatch.selectionReason,
      fallbackApplied: "NO_ACTION (sin regla)",
    },
  };
}

function buildWarningEvidence(code: string, message: string): WarningEvidence {
  return {
    type: "WARNING",
    source: "CALCULATED",
    label: message,
    confirmed: true,
    data: { code, message },
  };
}

// ── Missing data detection ──────────────────────────────────────────────────

function detectMissingData(input: CommercialCoverageInput, evaluation: CommercialCoverageEvaluation): string[] {
  const missing: string[] = [];

  if (evaluation.strategy === "SIZE" && !input.sizeClass) {
    missing.push("sizeClass");
  }
  if (evaluation.strategy === "SUBGROUP" && !input.subgroup) {
    missing.push("subgroup");
  }
  if (!input.color) missing.push("color");
  if (!input.category) missing.push("category");
  if (input.sourceAvailableUnits == null) missing.push("sourceAvailableUnits");

  return missing;
}

// ── Decision trace ──────────────────────────────────────────────────────────

function buildDecisionTrace(
  input: CommercialCoverageInput,
  evaluation: CommercialCoverageEvaluation,
  suggestion: CommercialCoverageSuggestion,
): DecisionTraceStep[] {
  const trace: DecisionTraceStep[] = [];

  // Step 1: Business line resolved
  trace.push({
    step: "BUSINESS_LINE_RESOLVED",
    status: input.businessLine ? "OK" : "WARNING",
    summary: input.businessLine
      ? `Linea de negocio: ${input.businessLine}`
      : "Linea de negocio no identificada",
    data: { businessLine: input.businessLine, productClass: input.productClass },
  });

  // Step 2: Strategy resolved
  trace.push({
    step: "STRATEGY_RESOLVED",
    status: "OK",
    summary: `Estrategia: ${evaluation.strategy}`,
    data: { strategy: evaluation.strategy },
  });

  // Step 3: Rules evaluated
  const totalRules = input.activeRules.length;
  const candidateCount = evaluation.ruleMatch.candidateRules.length;
  trace.push({
    step: "RULES_EVALUATED",
    status: totalRules === 0 ? "WARNING" : "OK",
    summary: `${candidateCount} de ${totalRules} reglas coinciden`,
    data: { totalRules, candidateCount, discardedCount: evaluation.ruleMatch.discardedRules.length },
  });

  // Step 4: Rule selected
  const rule = evaluation.ruleMatch.selectedRule;
  trace.push({
    step: "RULE_SELECTED",
    status: rule ? (evaluation.ruleMatch.hadConflict ? "WARNING" : "OK") : "DEGRADED",
    summary: rule
      ? `Regla seleccionada: ${rule.scope} (id: ${rule.id})`
      : "Sin regla aplicable — fallback",
    data: rule
      ? { ruleId: rule.id, scope: rule.scope, hadConflict: evaluation.ruleMatch.hadConflict }
      : { reason: evaluation.ruleMatch.selectionReason },
  });

  // Step 5: Inventory evaluated
  trace.push({
    step: "INVENTORY_EVALUATED",
    status: "OK",
    summary: `Cobertura actual: ${evaluation.currentCoverage} unidades → estado ${evaluation.state}`,
    data: { currentCoverage: evaluation.currentCoverage, state: evaluation.state },
  });

  // Step 6: Suggestion calculated
  trace.push({
    step: "SUGGESTION_CALCULATED",
    status: suggestion.action === "NO_ACTION" ? "SKIPPED" : "OK",
    summary: suggestion.rawSuggestedQty > 0
      ? `Sugerencia: ${suggestion.rawSuggestedQty} unidades (${suggestion.action})`
      : `Sin accion requerida (${suggestion.action})`,
    data: { action: suggestion.action, rawSuggestedQty: suggestion.rawSuggestedQty },
  });

  // Step 7: Source constraint applied
  trace.push({
    step: "SOURCE_CONSTRAINT_APPLIED",
    status: suggestion.sourceConstrained ? "WARNING" : (input.sourceAvailableUnits == null ? "SKIPPED" : "OK"),
    summary: suggestion.sourceConstrained
      ? `Origen limitado: ${suggestion.finalSuggestedQty} de ${suggestion.rawSuggestedQty} disponibles`
      : input.sourceAvailableUnits == null
        ? "Sin datos de disponibilidad en origen"
        : "Origen con stock suficiente",
    data: { sourceConstrained: suggestion.sourceConstrained, finalSuggestedQty: suggestion.finalSuggestedQty, unmetQty: suggestion.unmetQty },
  });

  // Step 8: Result finalized
  trace.push({
    step: "RESULT_FINALIZED",
    status: "OK",
    summary: `Resultado: ${suggestion.action} — ${suggestion.finalSuggestedQty} unidades`,
  });

  return trace;
}

// ── Confidence factors ──────────────────────────────────────────────────────

function buildConfidenceFactors(
  input: CommercialCoverageInput,
  evaluation: CommercialCoverageEvaluation,
  dataQuality: CommercialCoverageDataQuality,
): ConfidenceFactor[] {
  const factors: ConfidenceFactor[] = [];

  // Inventory confirmed
  factors.push({
    label: "Inventario confirmado",
    satisfied: input.currentUnits > 0 || input.availableUnits != null,
    impact: 0.1,
  });

  // Rule found
  factors.push({
    label: "Regla especifica encontrada",
    satisfied: !!evaluation.ruleMatch.selectedRule,
    impact: 0.3,
  });

  // Size/subgroup confirmed
  if (evaluation.strategy === "SIZE") {
    factors.push({
      label: "Tamano clasificado",
      satisfied: !!input.sizeClass,
      impact: 0.25,
    });
  } else {
    factors.push({
      label: "Subgrupo confirmado",
      satisfied: !!input.subgroup,
      impact: 0.2,
    });
  }

  // Source availability confirmed
  factors.push({
    label: "Disponibilidad origen confirmada",
    satisfied: input.sourceAvailableUnits != null,
    impact: 0.1,
  });

  // No conflict
  factors.push({
    label: "Sin conflicto de reglas",
    satisfied: !evaluation.ruleMatch.hadConflict,
    impact: 0.1,
  });

  return factors;
}
