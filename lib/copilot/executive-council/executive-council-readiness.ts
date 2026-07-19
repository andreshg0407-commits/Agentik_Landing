// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 36: Readiness Check

export interface CouncilReadinessFlags {
  readonly hasExecutiveBrainData:  boolean;
  readonly hasAdvisorData:         boolean;
  readonly hasSimulationData:      boolean;
  readonly hasPlanningData:        boolean;
  readonly hasMemoryData:          boolean;
  readonly hasCrossModuleData:     boolean;
}

export interface CouncilReadinessRequirement {
  readonly name:   string;
  readonly met:    boolean;
  readonly reason: string;
}

export interface CouncilReadinessReport {
  readonly orgSlug:       string;
  readonly ready:         boolean;
  readonly score:         number; // 0–1
  readonly requirements:  CouncilReadinessRequirement[];
  readonly checkedAt:     string;
}

export function checkExecutiveCouncilReadiness(
  orgSlug: string,
  flags:   CouncilReadinessFlags
): CouncilReadinessReport {
  const requirements: CouncilReadinessRequirement[] = [
    {
      name:   "Executive Brain V2",
      met:    flags.hasExecutiveBrainData,
      reason: flags.hasExecutiveBrainData
        ? "Prioridades y riesgos ejecutivos disponibles"
        : "Sin datos del Executive Brain V2 — perspectivas financiera y de riesgo limitadas",
    },
    {
      name:   "Strategic Advisor",
      met:    flags.hasAdvisorData,
      reason: flags.hasAdvisorData
        ? "Recomendaciones y preocupaciones estratégicas disponibles"
        : "Sin datos del Asesor Estratégico — perspectiva comercial y estratégica limitada",
    },
    {
      name:   "Strategic Simulations",
      met:    flags.hasSimulationData,
      reason: flags.hasSimulationData
        ? "Simulaciones de escenarios disponibles"
        : "Sin simulaciones — contexto de escenarios incompleto",
    },
    {
      name:   "Strategic Planning",
      met:    flags.hasPlanningData,
      reason: flags.hasPlanningData
        ? "Planes y objetivos estratégicos disponibles"
        : "Sin datos de planeación — perspectiva estratégica incompleta",
    },
    {
      name:   "Strategic Memory",
      met:    flags.hasMemoryData,
      reason: flags.hasMemoryData
        ? "Memoria estratégica disponible"
        : "Sin memoria estratégica — contexto histórico no disponible",
    },
    {
      name:   "Cross-Module Reasoning",
      met:    flags.hasCrossModuleData,
      reason: flags.hasCrossModuleData
        ? "Razonamiento transversal disponible"
        : "Sin razonamiento cross-module — perspectivas aisladas",
    },
  ];

  const metCount = requirements.filter((r) => r.met).length;
  const score    = Math.round(metCount / requirements.length * 100) / 100;
  const ready    = metCount >= 2; // Minimum: Executive Brain + Advisor

  return { orgSlug, ready, score, requirements, checkedAt: new Date().toISOString() };
}

export function isExecutiveCouncilReady(report: CouncilReadinessReport): boolean {
  return report.ready;
}

export function buildReadinessFromFlags(
  orgSlug: string,
  flags:   Partial<CouncilReadinessFlags>
): CouncilReadinessReport {
  const full: CouncilReadinessFlags = {
    hasExecutiveBrainData:  flags.hasExecutiveBrainData  ?? false,
    hasAdvisorData:         flags.hasAdvisorData         ?? false,
    hasSimulationData:      flags.hasSimulationData      ?? false,
    hasPlanningData:        flags.hasPlanningData         ?? false,
    hasMemoryData:          flags.hasMemoryData           ?? false,
    hasCrossModuleData:     flags.hasCrossModuleData      ?? false,
  };
  return checkExecutiveCouncilReadiness(orgSlug, full);
}
