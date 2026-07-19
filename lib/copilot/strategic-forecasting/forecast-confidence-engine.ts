// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 9: Confidence Engine

import type {
  ForecastConfidence,
  ForecastConfidenceLevel,
  ForecastEvidence,
} from "./strategic-forecasting-types";

export interface ConfidenceInputs {
  readonly signalCount:      number;
  readonly trendCount:       number;
  readonly trajectoryCount:  number;
  readonly scenarioCount:    number;
  readonly evidenceCount:    number;
  readonly assumptionCount:  number;
  readonly criticalAssumptions: number; // unvalidated critical ones
  readonly moduleCount:      number; // how many upstream modules fed data
  readonly orgSlug:          string;
}

export function computeConfidenceScore(inputs: ConfidenceInputs): number {
  try {
    let score = 0;

    // Data richness (up to 0.40)
    const signalNorm  = Math.min(1, inputs.signalCount / 10)     * 0.10;
    const trendNorm   = Math.min(1, inputs.trendCount / 5)       * 0.08;
    const trajNorm    = Math.min(1, inputs.trajectoryCount / 4)  * 0.08;
    const scenNorm    = Math.min(1, inputs.scenarioCount / 4)     * 0.07;
    const evNorm      = Math.min(1, inputs.evidenceCount / 8)     * 0.07;
    score += signalNorm + trendNorm + trajNorm + scenNorm + evNorm;

    // Module coverage (up to 0.30)
    const modNorm = Math.min(1, inputs.moduleCount / 7) * 0.30;
    score += modNorm;

    // Assumption penalty (up to -0.20)
    const critPenalty = Math.min(0.20, inputs.criticalAssumptions * 0.05);
    score -= critPenalty;

    // Assumption breadth (up to 0.10)
    const assumptionBonus = Math.min(0.10, inputs.assumptionCount * 0.02);
    score += assumptionBonus;

    // Module coverage floor bonus (at least 2 modules)
    if (inputs.moduleCount >= 2) score += 0.05;

    return Math.max(0, Math.min(1, score));
  } catch {
    return 0;
  }
}

export function confidenceLevelFromScore(score: number): ForecastConfidenceLevel {
  try {
    if (score >= 0.85) return "VERY_HIGH";
    if (score >= 0.70) return "HIGH";
    if (score >= 0.50) return "MEDIUM";
    if (score >= 0.30) return "LOW";
    return "INSUFFICIENT";
  } catch {
    return "INSUFFICIENT";
  }
}

export function computeForecastConfidence(inputs: ConfidenceInputs): ForecastConfidence {
  try {
    const score       = computeConfidenceScore(inputs);
    const level       = confidenceLevelFromScore(score);
    const limitations: string[] = [];

    if (inputs.moduleCount < 3) {
      limitations.push("Cobertura de módulos limitada — se recomienda conectar más fuentes");
    }
    if (inputs.evidenceCount < 3) {
      limitations.push("Evidencias insuficientes para alta confianza");
    }
    if (inputs.criticalAssumptions > 0) {
      limitations.push(`${inputs.criticalAssumptions} supuesto(s) crítico(s) sin validar`);
    }
    if (inputs.signalCount < 3) {
      limitations.push("Señales escasas — proyección preliminar");
    }

    return {
      level,
      score,
      evidenceCount: inputs.evidenceCount,
      limitations,
      rationale: buildConfidenceRationale(score, inputs),
    };
  } catch {
    return buildEmptyConfidence();
  }
}

export function buildEvidenceRecord(
  id: string,
  description: string,
  sourceModule: string,
  confidenceScore: number,
  dataPoints: number
): ForecastEvidence {
  try {
    const strength =
      confidenceScore >= 0.7 ? "STRONG"   :
      confidenceScore >= 0.4 ? "MODERATE" :
      "WEAK";
    return {
      id,
      description,
      sourceModule,
      strength,
      dataPoints: Math.max(0, dataPoints),
      asOfDate:   new Date().toISOString().slice(0, 10),
    };
  } catch {
    return {
      id,
      description: "",
      sourceModule: "unknown",
      strength:    "WEAK",
      dataPoints:  0,
      asOfDate:    new Date().toISOString().slice(0, 10),
    };
  }
}

export function mergeConfidences(
  a: ForecastConfidence,
  b: ForecastConfidence
): ForecastConfidence {
  try {
    const score       = (a.score + b.score) / 2;
    const level       = confidenceLevelFromScore(score);
    const evidenceCount = a.evidenceCount + b.evidenceCount;
    const limitations = [...new Set([...a.limitations, ...b.limitations])];
    return {
      level,
      score,
      evidenceCount,
      limitations,
      rationale: `Combinación de ${a.rationale} y ${b.rationale}`,
    };
  } catch {
    return buildEmptyConfidence();
  }
}

function buildConfidenceRationale(
  score: number,
  inputs: ConfidenceInputs
): string {
  const pct = (score * 100).toFixed(0);
  return (
    `Score ${pct}% basado en ${inputs.signalCount} señales, ` +
    `${inputs.trendCount} tendencias, ${inputs.evidenceCount} evidencias, ` +
    `${inputs.moduleCount} módulos conectados`
  );
}

export function buildEmptyConfidence(): ForecastConfidence {
  return {
    level:         "INSUFFICIENT",
    score:         0,
    evidenceCount: 0,
    limitations:   ["Sin datos suficientes para calcular confianza"],
    rationale:     "Confianza no calculable",
  };
}
