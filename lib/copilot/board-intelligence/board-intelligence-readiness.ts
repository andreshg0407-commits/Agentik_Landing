// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 35: Readiness Check

export interface BoardReadinessFlags {
  readonly hasExecutiveBrainData:   boolean;
  readonly hasAdvisorData:          boolean;
  readonly hasSimulationData:       boolean;
  readonly hasPlanningData:         boolean;
  readonly hasCouncilData:          boolean;
  readonly hasMemoryData:           boolean;
  readonly hasCrossModuleData:      boolean;
  readonly hasLearningData:         boolean;
}

export interface BoardReadinessResult {
  readonly isReady:        boolean;
  readonly readinessScore: number;
  readonly flags:          BoardReadinessFlags;
  readonly metCount:       number;
  readonly totalCount:     number;
  readonly limitations:    string[];
  readonly checkedAt:      string;
}

export function checkBoardReadiness(flags: BoardReadinessFlags): BoardReadinessResult {
  try {
    const flagValues = Object.values(flags);
    const metCount   = flagValues.filter(Boolean).length;
    const totalCount = flagValues.length;
    const readinessScore = metCount / totalCount;

    // Ready when Executive Brain + Advisor are available (minimum viable inputs)
    const isReady = flags.hasExecutiveBrainData && flags.hasAdvisorData;

    const limitations: string[] = [];
    if (!flags.hasExecutiveBrainData) {
      limitations.push("Sin datos de Executive Brain — análisis de prioridades limitado");
    }
    if (!flags.hasAdvisorData) {
      limitations.push("Sin datos de Strategic Advisor — recomendaciones de contexto no disponibles");
    }
    if (!flags.hasSimulationData) {
      limitations.push("Sin datos de simulaciones — análisis de escenarios no disponible");
    }
    if (!flags.hasPlanningData) {
      limitations.push("Sin datos de planeación estratégica — cobertura de horizontes limitada");
    }
    if (!flags.hasCouncilData) {
      limitations.push("Sin sesiones de Executive Council — perspectiva multi-funcional no disponible");
    }
    if (!flags.hasMemoryData) {
      limitations.push("Sin memoria estratégica — patrones históricos no considerados");
    }
    if (!flags.hasCrossModuleData) {
      limitations.push("Sin razonamiento transversal — correlaciones entre módulos no disponibles");
    }
    if (!flags.hasLearningData) {
      limitations.push("Sin patrones de aprendizaje — ajustes de contexto no aplicados");
    }

    return {
      isReady,
      readinessScore,
      flags,
      metCount,
      totalCount,
      limitations,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return {
      isReady:        false,
      readinessScore: 0,
      flags,
      metCount:       0,
      totalCount:     Object.keys(flags).length,
      limitations:    ["Error interno en verificación de preparación"],
      checkedAt:      new Date().toISOString(),
    };
  }
}

export function buildBoardReadinessFlags(data: {
  hasBrainData?:     boolean;
  hasAdvisorData?:   boolean;
  hasSimData?:       boolean;
  hasPlanningData?:  boolean;
  hasCouncilData?:   boolean;
  hasMemoryData?:    boolean;
  hasCrossModuleData?: boolean;
  hasLearningData?:  boolean;
}): BoardReadinessFlags {
  return {
    hasExecutiveBrainData: data.hasBrainData    ?? false,
    hasAdvisorData:        data.hasAdvisorData  ?? false,
    hasSimulationData:     data.hasSimData      ?? false,
    hasPlanningData:       data.hasPlanningData ?? false,
    hasCouncilData:        data.hasCouncilData  ?? false,
    hasMemoryData:         data.hasMemoryData   ?? false,
    hasCrossModuleData:    data.hasCrossModuleData ?? false,
    hasLearningData:       data.hasLearningData ?? false,
  };
}
