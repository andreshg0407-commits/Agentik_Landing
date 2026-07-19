// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 34 — Future Compatibility
// Planned capabilities — not yet implemented

export type ExecutiveBrainFutureCapability =
  | "BOARD_INTELLIGENCE"
  | "STRATEGIC_ADVISOR_AI"
  | "EXECUTIVE_FORECASTING"
  | "EXECUTIVE_SIMULATIONS"
  | "AUTONOMOUS_PLANNING"
  | "EXECUTIVE_SCENARIO_MODELING"
  | "CROSS_COMPANY_BENCHMARKING"
  | "REGULATORY_GOAL_ALIGNMENT"
  | "BOARD_LEVEL_REPORTING"
  | "STRATEGIC_DRIFT_DETECTION";

export const EXECUTIVE_BRAIN_FUTURE_CAPABILITIES: ExecutiveBrainFutureCapability[] = [
  "BOARD_INTELLIGENCE",
  "STRATEGIC_ADVISOR_AI",
  "EXECUTIVE_FORECASTING",
  "EXECUTIVE_SIMULATIONS",
  "AUTONOMOUS_PLANNING",
  "EXECUTIVE_SCENARIO_MODELING",
  "CROSS_COMPANY_BENCHMARKING",
  "REGULATORY_GOAL_ALIGNMENT",
  "BOARD_LEVEL_REPORTING",
  "STRATEGIC_DRIFT_DETECTION",
];

export interface FutureCapabilitySpec {
  readonly id: ExecutiveBrainFutureCapability;
  readonly name: string;
  readonly description: string;
  readonly sprint: string;
  readonly dependencies: string[];
}

export const FUTURE_CAPABILITY_REGISTRY: FutureCapabilitySpec[] = [
  {
    id: "BOARD_INTELLIGENCE",
    name: "Board Intelligence",
    description: "Genera informes ejecutivos de nivel directivo con perspectiva empresarial completa.",
    sprint: "AGENTIK-BOARD-INTELLIGENCE-01",
    dependencies: ["EXECUTIVE_BRAIN_V2", "STRATEGIC_MEMORY"],
  },
  {
    id: "STRATEGIC_ADVISOR_AI",
    name: "Strategic Advisor AI",
    description: "Agente autónomo de asesoramiento estratégico basado en memoria histórica y aprendizaje.",
    sprint: "AGENTIK-STRATEGIC-ADVISOR-01",
    dependencies: ["EXECUTIVE_BRAIN_V2", "LEARNING_FRAMEWORK", "AGENT_RUNTIME"],
  },
  {
    id: "EXECUTIVE_FORECASTING",
    name: "Executive Forecasting",
    description: "Proyecciones ejecutivas basadas en patrones históricos y señales actuales.",
    sprint: "AGENTIK-EXECUTIVE-FORECASTING-01",
    dependencies: ["EXECUTIVE_BRAIN_V2", "LEARNING_FRAMEWORK"],
  },
  {
    id: "EXECUTIVE_SIMULATIONS",
    name: "Executive Simulations",
    description: "Simulaciones de escenarios ejecutivos para evaluar decisiones antes de tomarlas.",
    sprint: "AGENTIK-EXECUTIVE-SIMULATIONS-01",
    dependencies: ["EXECUTIVE_BRAIN_V2", "SCENARIO_ENGINE"],
  },
  {
    id: "AUTONOMOUS_PLANNING",
    name: "Autonomous Planning",
    description: "Generación autónoma de planes ejecutivos con aprobación humana obligatoria.",
    sprint: "AGENTIK-AUTONOMOUS-PLANNING-01",
    dependencies: ["EXECUTIVE_BRAIN_V2", "AGENT_RUNTIME", "APPROVAL_LAYER"],
  },
  {
    id: "EXECUTIVE_SCENARIO_MODELING",
    name: "Executive Scenario Modeling",
    description: "Modelado de escenarios estratégicos para planificación.",
    sprint: "AGENTIK-SCENARIO-MODELING-01",
    dependencies: ["EXECUTIVE_BRAIN_V2"],
  },
  {
    id: "CROSS_COMPANY_BENCHMARKING",
    name: "Cross-Company Benchmarking",
    description: "Comparación de métricas ejecutivas con benchmarks de la industria.",
    sprint: "AGENTIK-BENCHMARKING-01",
    dependencies: ["EXECUTIVE_BRAIN_V2", "EXTERNAL_DATA_LAYER"],
  },
  {
    id: "REGULATORY_GOAL_ALIGNMENT",
    name: "Regulatory Goal Alignment",
    description: "Verificación automática de alineación de objetivos con marcos regulatorios.",
    sprint: "AGENTIK-REGULATORY-ALIGNMENT-01",
    dependencies: ["EXECUTIVE_BRAIN_V2", "COMPLIANCE"],
  },
  {
    id: "BOARD_LEVEL_REPORTING",
    name: "Board-Level Reporting",
    description: "Generación de informes formales de nivel de junta directiva.",
    sprint: "AGENTIK-BOARD-REPORTING-01",
    dependencies: ["BOARD_INTELLIGENCE", "EXECUTIVE_BRAIN_V2"],
  },
  {
    id: "STRATEGIC_DRIFT_DETECTION",
    name: "Strategic Drift Detection",
    description: "Detección de desviación estratégica respecto a los objetivos declarados.",
    sprint: "AGENTIK-STRATEGIC-DRIFT-01",
    dependencies: ["EXECUTIVE_BRAIN_V2", "STRATEGIC_MEMORY"],
  },
];

export function getFutureCapability(
  id: ExecutiveBrainFutureCapability
): FutureCapabilitySpec | undefined {
  return FUTURE_CAPABILITY_REGISTRY.find((c) => c.id === id);
}
