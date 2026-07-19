/**
 * lib/comercial/rules/coverage/commercial-coverage-explanation.ts
 *
 * Human-readable explanation generator for coverage evaluations.
 *
 * Sprint: COMMERCIAL-COVERAGE-RULES-ENGINE-01
 */

import type {
  CommercialCoverageInput,
  CommercialCoverageEvaluation,
  CommercialCoverageSuggestion,
  CommercialCoverageExplanation,
} from "./commercial-coverage-types";
import { SIZE_LABEL } from "./commercial-coverage-config";

export function buildExplanation(
  input: CommercialCoverageInput,
  evaluation: CommercialCoverageEvaluation,
  suggestion: CommercialCoverageSuggestion,
): CommercialCoverageExplanation {
  const { state, strategy, minQty, idealQty, maxQty, currentCoverage } = evaluation;
  const { finalSuggestedQty, sourceConstrained, unmetQty } = suggestion;

  const limitations: string[] = [];
  let summary: string;

  // Build rule name for explanation
  const rule = evaluation.ruleMatch.selectedRule;
  let ruleName = "sin regla";
  if (rule) {
    if (strategy === "SUBGROUP") {
      const sub = rule.subgroup || "todos los subgrupos";
      const line = rule.line || input.businessLine;
      ruleName = `Textil ${line} / ${sub}`;
    } else {
      const sz = rule.sizeClass ? SIZE_LABEL[rule.sizeClass] ?? rule.sizeClass : "—";
      ruleName = `Accesorios / Importacion ${sz}`;
    }
  }

  switch (state) {
    case "BELOW_MIN":
      summary = `Se sugieren ${finalSuggestedQty} unidades porque la regla ${ruleName} define un ideal de ${idealQty} y la tienda tiene ${currentCoverage} disponibles.`;
      break;

    case "BELOW_IDEAL":
      summary = `Se sugieren ${finalSuggestedQty} unidades para alcanzar el ideal de ${idealQty} (actualmente ${currentCoverage}).`;
      break;

    case "AT_IDEAL":
      summary = `No se sugiere surtido porque la tienda tiene ${currentCoverage} unidades y el ideal configurado es ${idealQty}.`;
      break;

    case "ABOVE_IDEAL":
      summary = `No se sugiere surtido porque la tienda tiene ${currentCoverage} unidades, por encima del ideal de ${idealQty} y dentro del maximo de ${maxQty}.`;
      break;

    case "ABOVE_MAX":
      summary = `No se sugiere surtido porque la tienda tiene ${currentCoverage} unidades y supera el maximo configurado de ${maxQty}.`;
      break;

    case "NO_RULE":
      summary = `No se encontro una regla de cobertura aplicable para este producto.`;
      limitations.push("Sin regla configurada");
      break;

    case "INSUFFICIENT_DATA":
      if (strategy === "SIZE" && !input.sizeClass) {
        summary = `No se pudo calcular cobertura porque la referencia no tiene tamano clasificado.`;
        limitations.push("Tamano no clasificado");
      } else if (strategy === "SUBGROUP" && !input.subgroup) {
        summary = `No se pudo calcular cobertura porque la referencia no tiene subgrupo asignado.`;
        limitations.push("Subgrupo no asignado");
      } else {
        summary = `Datos insuficientes para evaluar cobertura.`;
        limitations.push("Datos incompletos");
      }
      break;

    default:
      summary = `Estado de cobertura no determinado.`;
  }

  if (sourceConstrained && unmetQty > 0) {
    summary += ` Disponibilidad limitada en origen: faltan ${unmetQty} unidades.`;
    limitations.push(`Origen insuficiente (faltan ${unmetQty})`);
  }

  return {
    summary,
    details: {
      strategy: strategy === "SUBGROUP" ? "Por subgrupo" : "Por tamano",
      ruleName,
      currentUnits: currentCoverage,
      minQty,
      idealQty,
      maxQty,
      suggestedQty: finalSuggestedQty,
      sourceAvailable: input.sourceAvailableUnits ?? null,
      limitations,
    },
  };
}
