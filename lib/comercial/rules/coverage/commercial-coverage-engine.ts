/**
 * lib/comercial/rules/coverage/commercial-coverage-engine.ts
 *
 * Commercial Coverage Rules Engine — single source of truth for coverage
 * evaluation and replenishment suggestions.
 *
 * The UI does NOT calculate needs. All suggestions come from this engine.
 *
 * Pipeline:
 *   1. Identify operational world (businessLine → strategy)
 *   2. Resolve applicable rule (precedence-based)
 *   3. Evaluate coverage state (current vs thresholds)
 *   4. Generate suggestion (quantity + action)
 *   5. Build explanation (human-readable)
 *   6. Assess data quality (confidence)
 *
 * Sprint: COMMERCIAL-COVERAGE-RULES-ENGINE-01
 */

import type {
  CommercialCoverageInput,
  CommercialCoverageResult,
  CommercialCoverageEvaluation,
  CommercialCoverageSuggestion,
  CommercialCoverageDataQuality,
  CoverageSuggestionAction,
  ConfidenceLevel,
  DataQualityLevel,
  CommercialCoverageStrategy,
} from "./commercial-coverage-types";
import { resolveRule } from "./commercial-coverage-rule-resolver";
import { evaluateSubgroupStrategy } from "./strategies/subgroup-coverage-strategy";
import { evaluateSizeStrategy } from "./strategies/size-coverage-strategy";
import { buildExplanation } from "./commercial-coverage-explanation";
import { collectEvidence } from "./commercial-evidence-engine";
import { resolveBusinessLine } from "@/lib/comercial/tiendas/store-business-lines";

// ── Strategy resolution ─────────────────────────────────────────────────────

function resolveStrategy(input: CommercialCoverageInput): CommercialCoverageStrategy {
  // Use the business line registry to determine strategy
  const bl = resolveBusinessLine(null); // fallback
  const lineId = input.businessLine.toLowerCase().trim();

  // Textile lines use SUBGROUP
  if (lineId === "castillitos" || lineId === "latin_kids") return "SUBGROUP";

  // Accesorios/Importacion use SIZE
  if (
    lineId === "accesorios_importacion" ||
    lineId === "accesorios" ||
    lineId === "importacion"
  ) return "SIZE";

  // Default: infer from productClass
  if (input.productClass === "textile") return "SUBGROUP";
  return "SIZE";
}

// ── Suggestion calculation ──────────────────────────────────────────────────

function calculateSuggestion(
  evaluation: CommercialCoverageEvaluation,
  input: CommercialCoverageInput,
): CommercialCoverageSuggestion {
  const { state, gapToIdeal, currentCoverage } = evaluation;
  const sourceAvailable = input.sourceAvailableUnits;

  let action: CoverageSuggestionAction;
  let rawSuggestedQty = 0;

  switch (state) {
    case "BELOW_MIN":
      action = "CRITICAL_REPLENISH";
      rawSuggestedQty = gapToIdeal;
      break;

    case "BELOW_IDEAL":
      action = "REPLENISH_TO_IDEAL";
      rawSuggestedQty = gapToIdeal;
      break;

    case "AT_IDEAL":
    case "ABOVE_IDEAL":
      action = "HOLD";
      rawSuggestedQty = 0;
      break;

    case "ABOVE_MAX":
      action = "REDUCE_OR_TRANSFER";
      rawSuggestedQty = 0;
      break;

    case "NO_RULE":
    case "INSUFFICIENT_DATA":
    default:
      action = "NO_ACTION";
      rawSuggestedQty = 0;
      break;
  }

  // Never suggest negative
  rawSuggestedQty = Math.max(0, rawSuggestedQty);

  // Apply source constraint
  let finalSuggestedQty = rawSuggestedQty;
  let unmetQty = 0;
  let sourceConstrained = false;

  if (sourceAvailable != null && rawSuggestedQty > 0) {
    finalSuggestedQty = Math.min(rawSuggestedQty, Math.max(0, sourceAvailable));
    unmetQty = Math.max(0, rawSuggestedQty - finalSuggestedQty);
    sourceConstrained = unmetQty > 0;
  }

  return {
    action,
    rawSuggestedQty,
    finalSuggestedQty,
    unmetQty,
    sourceConstrained,
  };
}

// ── Data quality assessment ─────────────────────────────────────────────────

function assessDataQuality(
  input: CommercialCoverageInput,
  evaluation: CommercialCoverageEvaluation,
): CommercialCoverageDataQuality {
  const factors: string[] = [];
  let confidence = 1.0;

  // Rule quality
  let ruleQuality: DataQualityLevel = "UNAVAILABLE";
  if (evaluation.ruleMatch.selectedRule) {
    ruleQuality = "CONFIRMED";
    factors.push("Regla exacta encontrada");
  } else {
    confidence -= 0.4;
    factors.push("Sin regla aplicable");
  }

  // Inventory quality
  let inventoryQuality: DataQualityLevel = "CONFIRMED";
  if (input.currentUnits === 0 && input.availableUnits == null) {
    inventoryQuality = "ESTIMATED";
    confidence -= 0.1;
    factors.push("Inventario sin confirmacion reciente");
  }

  // Size class quality
  let sizeClassQuality: DataQualityLevel = "UNAVAILABLE";
  if (evaluation.strategy === "SIZE") {
    if (input.sizeClass) {
      sizeClassQuality = "CONFIRMED";
      factors.push("Tamano clasificado");
    } else {
      sizeClassQuality = "UNAVAILABLE";
      confidence -= 0.3;
      factors.push("Tamano no clasificado");
    }
  } else {
    sizeClassQuality = "CONFIRMED"; // Not applicable for SUBGROUP
  }

  // Subgroup quality
  let subgroupQuality: DataQualityLevel = "UNAVAILABLE";
  if (evaluation.strategy === "SUBGROUP") {
    if (input.subgroup) {
      subgroupQuality = "CONFIRMED";
      factors.push("Subgrupo confirmado");
    } else {
      subgroupQuality = "UNAVAILABLE";
      confidence -= 0.2;
      factors.push("Subgrupo no asignado");
    }
  } else {
    subgroupQuality = "CONFIRMED"; // Not applicable for SIZE
  }

  // Conflict penalty
  if (evaluation.ruleMatch.hadConflict) {
    confidence -= 0.15;
    factors.push("Conflicto entre reglas");
  }

  // Source availability
  if (input.sourceAvailableUnits != null) {
    factors.push("Disponibilidad origen confirmada");
  }

  confidence = Math.max(0, Math.min(1, confidence));

  let confidenceLevel: ConfidenceLevel;
  if (confidence >= 0.7) confidenceLevel = "HIGH";
  else if (confidence >= 0.4) confidenceLevel = "MEDIUM";
  else confidenceLevel = "LOW";

  const unresolvedReason =
    evaluation.state === "INSUFFICIENT_DATA"
      ? evaluation.strategy === "SIZE" && !input.sizeClass
        ? "Referencia sin tamano clasificado"
        : evaluation.strategy === "SUBGROUP" && !input.subgroup
        ? "Referencia sin subgrupo asignado"
        : "Datos insuficientes"
      : undefined;

  return {
    confidence,
    confidenceLevel,
    inventoryQuality,
    ruleQuality,
    sizeClassQuality,
    subgroupQuality,
    factors,
    unresolvedReason,
  };
}

// ── Main engine entry point ─────────────────────────────────────────────────

export function evaluateCoverage(input: CommercialCoverageInput): CommercialCoverageResult {
  // 1. Resolve strategy
  const strategy = resolveStrategy(input);

  // 2. Resolve rule
  const ruleMatch = resolveRule(input);

  // 3. Evaluate coverage
  let evaluation: CommercialCoverageEvaluation;
  if (strategy === "SUBGROUP") {
    evaluation = evaluateSubgroupStrategy(input, ruleMatch);
  } else {
    evaluation = evaluateSizeStrategy(input, ruleMatch);
  }

  // 4. Calculate suggestion
  const suggestion = calculateSuggestion(evaluation, input);

  // 5. Build explanation
  const explanation = buildExplanation(input, evaluation, suggestion);

  // 6. Assess data quality
  const dataQuality = assessDataQuality(input, evaluation);

  // 7. Collect structured evidence
  const evidence = collectEvidence(input, evaluation, suggestion, dataQuality);

  return {
    input,
    evaluation,
    suggestion,
    explanation,
    dataQuality,
    evidence,
    evaluatedAt: new Date().toISOString(),
  };
}

// ── Batch evaluation ────────────────────────────────────────────────────────

export function evaluateCoverageBatch(inputs: CommercialCoverageInput[]): CommercialCoverageResult[] {
  return inputs.map(evaluateCoverage);
}
