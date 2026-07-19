// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 41: Horizon Forecast Models
// Standard projection windows: 30d / 90d / 180d / 365d / 3y / 5y

import type { ForecastHorizon } from "./strategic-forecasting-types";

export type ForecastWindow =
  | "30D"
  | "90D"
  | "180D"
  | "365D"
  | "3Y"
  | "5Y";

export interface HorizonForecastModel {
  readonly window:       ForecastWindow;
  readonly horizon:      ForecastHorizon;
  readonly daysForward:  number;
  readonly label:        string;
  readonly description:  string;
  readonly maxConfidence: number; // 0–1: longer = less confidence
  readonly useCases:     string[];
}

export const HORIZON_MODELS: readonly HorizonForecastModel[] = [
  {
    window:        "30D",
    horizon:       "SHORT_TERM",
    daysForward:   30,
    label:         "30 días",
    description:   "Proyección de muy corto plazo — alta confianza, baja incertidumbre",
    maxConfidence: 0.90,
    useCases:      ["Liquidez operativa", "Cobros del mes", "Riesgos inmediatos"],
  },
  {
    window:        "90D",
    horizon:       "SHORT_TERM",
    daysForward:   90,
    label:         "90 días",
    description:   "Proyección trimestral — confianza razonable, señales tempranas visibles",
    maxConfidence: 0.80,
    useCases:      ["Resultados trimestrales", "Pipeline comercial", "Ejecución de plan"],
  },
  {
    window:        "180D",
    horizon:       "MEDIUM_TERM",
    daysForward:   180,
    label:         "6 meses",
    description:   "Proyección semestral — confianza moderada, tendencias estructurales",
    maxConfidence: 0.70,
    useCases:      ["Revisión estratégica semestral", "Inversiones de capital", "Contrataciones clave"],
  },
  {
    window:        "365D",
    horizon:       "MEDIUM_TERM",
    daysForward:   365,
    label:         "12 meses",
    description:   "Proyección anual — horizonte de plan operativo con mayor incertidumbre",
    maxConfidence: 0.60,
    useCases:      ["Presupuesto anual", "Revisión estratégica", "OKRs y metas"],
  },
  {
    window:        "3Y",
    horizon:       "LONG_TERM",
    daysForward:   365 * 3,
    label:         "3 años",
    description:   "Proyección de mediano-largo plazo — tendencias estratégicas, alta incertidumbre",
    maxConfidence: 0.45,
    useCases:      ["Plan estratégico", "Inversiones de largo plazo", "M&A"],
  },
  {
    window:        "5Y",
    horizon:       "LONG_TERM",
    daysForward:   365 * 5,
    label:         "5 años",
    description:   "Visión estratégica de largo plazo — orientativa, alta incertidumbre inherente",
    maxConfidence: 0.30,
    useCases:      ["Visión de empresa", "Transformación estructural", "Posicionamiento sectorial"],
  },
] as const;

export function getHorizonModel(window: ForecastWindow): HorizonForecastModel | null {
  return HORIZON_MODELS.find((m) => m.window === window) ?? null;
}

export function getHorizonModelsByHorizon(
  horizon: ForecastHorizon
): readonly HorizonForecastModel[] {
  return HORIZON_MODELS.filter((m) => m.horizon === horizon);
}

export function getMaxConfidenceForWindow(window: ForecastWindow): number {
  return getHorizonModel(window)?.maxConfidence ?? 0.3;
}

export function classifyWindowAsHorizon(window: ForecastWindow): ForecastHorizon {
  return getHorizonModel(window)?.horizon ?? "MEDIUM_TERM";
}
