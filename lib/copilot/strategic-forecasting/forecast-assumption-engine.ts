// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 10: Assumption Engine

import type {
  ForecastAssumption,
  ForecastDomain,
} from "./strategic-forecasting-types";
import { generateForecastAssumptionId } from "./strategic-forecasting-identity";

export interface RawAssumptionInput {
  readonly description: string;
  readonly domain:      ForecastDomain;
  readonly criticality: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  readonly validated:   boolean;
  readonly risk:        string;
}

export function buildAssumption(input: RawAssumptionInput): ForecastAssumption {
  try {
    return {
      id:          generateForecastAssumptionId(),
      description: input.description,
      domain:      input.domain,
      criticality: input.criticality,
      validated:   input.validated,
      risk:        input.risk,
    };
  } catch {
    return {
      id:          generateForecastAssumptionId(),
      description: input.description ?? "",
      domain:      input.domain ?? "CROSS_DOMAIN",
      criticality: "LOW",
      validated:   false,
      risk:        "Desconocido",
    };
  }
}

export function extractAssumptions(
  inputs: RawAssumptionInput[]
): ForecastAssumption[] {
  try {
    return inputs.map(buildAssumption);
  } catch {
    return [];
  }
}

export function validateAssumptions(
  assumptions: ForecastAssumption[]
): { valid: ForecastAssumption[]; invalid: ForecastAssumption[] } {
  try {
    return {
      valid:   assumptions.filter((a) => a.validated),
      invalid: assumptions.filter((a) => !a.validated),
    };
  } catch {
    return { valid: [], invalid: assumptions };
  }
}

export function rankAssumptions(
  assumptions: ForecastAssumption[]
): ForecastAssumption[] {
  try {
    const order: Record<string, number> = {
      CRITICAL: 0,
      HIGH:     1,
      MEDIUM:   2,
      LOW:      3,
    };
    return [...assumptions].sort(
      (a, b) => (order[a.criticality] ?? 3) - (order[b.criticality] ?? 3)
    );
  } catch {
    return assumptions;
  }
}

export function getCriticalUnvalidatedAssumptions(
  assumptions: ForecastAssumption[]
): ForecastAssumption[] {
  try {
    return assumptions.filter(
      (a) => a.criticality === "CRITICAL" && !a.validated
    );
  } catch {
    return [];
  }
}

export function countUnvalidatedCritical(
  assumptions: ForecastAssumption[]
): number {
  return getCriticalUnvalidatedAssumptions(assumptions).length;
}

export function getAssumptionsByDomain(
  assumptions: ForecastAssumption[],
  domain: ForecastDomain
): ForecastAssumption[] {
  try {
    return assumptions.filter((a) => a.domain === domain);
  } catch {
    return [];
  }
}

export function buildDefaultAssumptions(
  domain: ForecastDomain
): ForecastAssumption[] {
  try {
    const defaults: RawAssumptionInput[] = [
      {
        description: "Las condiciones macroeconómicas se mantienen estables durante el horizonte de proyección",
        domain,
        criticality: "HIGH",
        validated:   false,
        risk:        "Volatilidad macroeconómica podría invalidar todos los escenarios",
      },
      {
        description: "La organización mantiene su capacidad operativa sin disrupciones mayores",
        domain,
        criticality: "MEDIUM",
        validated:   false,
        risk:        "Disrupciones operativas pueden alterar trayectorias proyectadas",
      },
      {
        description: "Los datos históricos disponibles son representativos del comportamiento futuro",
        domain,
        criticality: "MEDIUM",
        validated:   false,
        risk:        "Cambios estructurales pueden romper patrones históricos",
      },
    ];
    return defaults.map(buildAssumption);
  } catch {
    return [];
  }
}
