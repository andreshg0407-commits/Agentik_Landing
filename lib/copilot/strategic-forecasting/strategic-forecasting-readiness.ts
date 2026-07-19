// AGENTIK-STRATEGIC-FORECASTING-01 — Phase 35: Readiness Check
// isReady = hasSignalData && hasTrendData (minimum viable inputs)

export interface StrategicForecastingReadinessFlags {
  readonly hasSignalData:       boolean;
  readonly hasTrendData:        boolean;
  readonly hasTrajectoryData:   boolean;
  readonly hasRiskData:         boolean;
  readonly hasOpportunityData:  boolean;
  readonly hasExecutiveBrainData: boolean;
  readonly hasMemoryData:       boolean;
  readonly hasBoardData:        boolean;
  readonly hasLearningData:     boolean;
  readonly hasReasoningData:    boolean;
}

export interface StrategicForecastingReadinessResult {
  readonly isReady:     boolean;
  readonly readyLevel:  "FULL" | "PARTIAL" | "MINIMUM" | "NOT_READY";
  readonly missingFlags: string[];
  readonly presentFlags: string[];
  readonly readinessScore: number; // 0–1
  readonly recommendation: string;
}

export function checkForecastingReadiness(
  flags: StrategicForecastingReadinessFlags
): StrategicForecastingReadinessResult {
  try {
    // Minimum viable: signal + trend data
    const isReady = flags.hasSignalData && flags.hasTrendData;

    const allFlags: Array<[keyof StrategicForecastingReadinessFlags, string]> = [
      ["hasSignalData",         "Signal data"],
      ["hasTrendData",          "Trend data"],
      ["hasTrajectoryData",     "Trajectory data"],
      ["hasRiskData",           "Risk data"],
      ["hasOpportunityData",    "Opportunity data"],
      ["hasExecutiveBrainData", "Executive Brain data"],
      ["hasMemoryData",         "Strategic Memory data"],
      ["hasBoardData",          "Board Intelligence data"],
      ["hasLearningData",       "Learning data"],
      ["hasReasoningData",      "Cross-Module Reasoning data"],
    ];

    const present: string[] = [];
    const missing: string[] = [];
    for (const [key, label] of allFlags) {
      if (flags[key]) present.push(label);
      else missing.push(label);
    }

    const readinessScore = present.length / allFlags.length;

    const readyLevel: "FULL" | "PARTIAL" | "MINIMUM" | "NOT_READY" =
      readinessScore >= 0.9 ? "FULL"      :
      readinessScore >= 0.6 ? "PARTIAL"   :
      isReady               ? "MINIMUM"   :
      "NOT_READY";

    const recommendation =
      readyLevel === "FULL"      ? "El módulo de proyección estratégica está completamente equipado." :
      readyLevel === "PARTIAL"   ? `Se recomienda conectar: ${missing.slice(0, 3).join(", ")}.` :
      readyLevel === "MINIMUM"   ? "Proyección disponible con datos mínimos. Conectar más fuentes mejora confianza." :
      "Se requieren al menos datos de señales y tendencias para activar proyecciones.";

    return {
      isReady,
      readyLevel,
      missingFlags: missing,
      presentFlags:  present,
      readinessScore,
      recommendation,
    };
  } catch {
    return {
      isReady:        false,
      readyLevel:     "NOT_READY",
      missingFlags:   ["Error al calcular readiness"],
      presentFlags:   [],
      readinessScore: 0,
      recommendation: "Error interno en evaluación de readiness.",
    };
  }
}

export function buildForecastingReadinessFlags(
  data: Partial<StrategicForecastingReadinessFlags>
): StrategicForecastingReadinessFlags {
  return {
    hasSignalData:       data.hasSignalData       ?? false,
    hasTrendData:        data.hasTrendData        ?? false,
    hasTrajectoryData:   data.hasTrajectoryData   ?? false,
    hasRiskData:         data.hasRiskData         ?? false,
    hasOpportunityData:  data.hasOpportunityData  ?? false,
    hasExecutiveBrainData: data.hasExecutiveBrainData ?? false,
    hasMemoryData:       data.hasMemoryData       ?? false,
    hasBoardData:        data.hasBoardData        ?? false,
    hasLearningData:     data.hasLearningData     ?? false,
    hasReasoningData:    data.hasReasoningData    ?? false,
  };
}
