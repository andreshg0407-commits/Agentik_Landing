// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 38: Health Check System

import type { DirectionHealth } from "./enterprise-direction-types";

export interface DirectionHealthCheck {
  readonly id:      string;
  readonly label:   string;
  readonly pass:    boolean;
  readonly level:   "ERROR" | "WARN" | "INFO";
}

export interface DirectionHealthReport {
  readonly orgSlug:    string;
  readonly health:     DirectionHealth;
  readonly checks:     DirectionHealthCheck[];
  readonly passCount:  number;
  readonly warnCount:  number;
  readonly errorCount: number;
  readonly score:      number; // 0–1
}

export interface DirectionHealthInputs {
  readonly orgSlug:           string;
  readonly hasNorthStar:      boolean;
  readonly hasObjectives:     boolean;
  readonly hasPriorities:     boolean;
  readonly hasAlignment:      boolean;
  readonly hasDeviations:     boolean;
  readonly hasRecommendations: boolean;
  readonly overallScore:      number;
  readonly confidence:        string;
  readonly errorCount:        number;
}

export function checkDirectionHealth(inputs: DirectionHealthInputs): DirectionHealthReport {
  try {
    const checks: DirectionHealthCheck[] = [
      {
        id:    "HAS_NORTH_STAR",
        label: "Estrella norte definida",
        pass:  inputs.hasNorthStar,
        level: "ERROR",
      },
      {
        id:    "HAS_OBJECTIVES",
        label: "Objetivos estratégicos presentes",
        pass:  inputs.hasObjectives,
        level: "WARN",
      },
      {
        id:    "HAS_PRIORITIES",
        label: "Prioridades identificadas",
        pass:  inputs.hasPriorities,
        level: "WARN",
      },
      {
        id:    "HAS_ALIGNMENT",
        label: "Evaluación de alineamiento disponible",
        pass:  inputs.hasAlignment,
        level: "WARN",
      },
      {
        id:    "HAS_DEVIATIONS",
        label: "Análisis de desviaciones ejecutado",
        pass:  inputs.hasDeviations,
        level: "INFO",
      },
      {
        id:    "HAS_RECOMMENDATIONS",
        label: "Recomendaciones generadas",
        pass:  inputs.hasRecommendations,
        level: "WARN",
      },
      {
        id:    "SCORE_ABOVE_THRESHOLD",
        label: "Score de dirección ≥ 30%",
        pass:  inputs.overallScore >= 0.30,
        level: "WARN",
      },
      {
        id:    "CONFIDENCE_SUFFICIENT",
        label: "Confianza al menos MEDIUM",
        pass:  inputs.confidence === "MEDIUM" || inputs.confidence === "HIGH" || inputs.confidence === "VERY_HIGH",
        level: "INFO",
      },
      {
        id:    "NO_PIPELINE_ERRORS",
        label: "Pipeline sin errores críticos",
        pass:  inputs.errorCount === 0,
        level: "ERROR",
      },
      {
        id:    "SCORE_HEALTHY",
        label: "Score de dirección ≥ 50%",
        pass:  inputs.overallScore >= 0.50,
        level: "INFO",
      },
      {
        id:    "SCORE_EXCELLENT",
        label: "Score de dirección ≥ 70%",
        pass:  inputs.overallScore >= 0.70,
        level: "INFO",
      },
      {
        id:    "HAS_NORTH_STAR_STRONG",
        label: "Estrella norte con confianza ≥ MEDIUM",
        pass:  inputs.hasNorthStar && inputs.confidence !== "LOW",
        level: "INFO",
      },
      {
        id:    "ALIGNMENT_HEALTHY",
        label: "Alineamiento ≥ 50%",
        pass:  inputs.overallScore >= 0.50,
        level: "INFO",
      },
      {
        id:    "PIPELINE_COMPLETE",
        label: "Pipeline de dirección completo",
        pass:  inputs.hasNorthStar && inputs.hasAlignment && inputs.hasRecommendations,
        level: "WARN",
      },
    ];

    const passCount  = checks.filter((c) => c.pass).length;
    const warnCount  = checks.filter((c) => !c.pass && c.level === "WARN").length;
    const errorCount = checks.filter((c) => !c.pass && c.level === "ERROR").length;

    const healthScore = passCount / checks.length;

    let health: DirectionHealth;
    if (errorCount > 0)        health = "CRITICAL";
    else if (healthScore < 0.40) health = "DEGRADED";
    else if (healthScore < 0.20) health = "EMPTY";
    else                         health = "HEALTHY";

    // If no north star and no objectives, it's EMPTY
    if (!inputs.hasNorthStar && !inputs.hasObjectives) health = "EMPTY";

    return { orgSlug: inputs.orgSlug, health, checks, passCount, warnCount, errorCount, score: healthScore };
  } catch {
    return buildEmptyHealthReport(inputs.orgSlug);
  }
}

export function buildDefaultDirectionHealthInputs(orgSlug: string): DirectionHealthInputs {
  return {
    orgSlug,
    hasNorthStar:       false,
    hasObjectives:      false,
    hasPriorities:      false,
    hasAlignment:       false,
    hasDeviations:      false,
    hasRecommendations: false,
    overallScore:       0,
    confidence:         "LOW",
    errorCount:         0,
  };
}

function buildEmptyHealthReport(orgSlug: string): DirectionHealthReport {
  return {
    orgSlug,
    health:     "EMPTY",
    checks:     [],
    passCount:  0,
    warnCount:  0,
    errorCount: 0,
    score:      0,
  };
}
