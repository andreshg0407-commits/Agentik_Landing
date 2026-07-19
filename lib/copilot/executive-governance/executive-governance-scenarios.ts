// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 46: Canonical Scenarios (35 scenarios)

import type {
  GovernanceStatus,
  GovernanceDomain,
  GovernancePriorityLevel,
  GovernanceBriefingType,
} from "./executive-governance-types";

export interface GovernanceCanonicalScenario {
  readonly id:            string; // scenario ID — see GOVERNANCE_CANONICAL_SCENARIOS array
  readonly title:         string;
  readonly domain:        GovernanceDomain;
  readonly briefingType:  GovernanceBriefingType;
  readonly expectedStatus: GovernanceStatus;
  readonly severity:      GovernancePriorityLevel;
  readonly inputs: {
    readonly policyCount:     number;
    readonly violationCount:  number;
    readonly escalationCount: number;
    readonly exceptionCount:  number;
    readonly findingCount:    number;
    readonly complianceScore: number;
    readonly riskScore:       number;
  };
  readonly expectedRecommendationCount: number;
  readonly description:   string;
  readonly limitations:   string[];
}

const COMMON_LIMITATIONS = [
  "suggestedOnly: true — validación humana requerida",
  "Escenario canónico para pruebas — no usar en producción sin adaptación",
];

export const GOVERNANCE_CANONICAL_SCENARIOS: GovernanceCanonicalScenario[] = [
  {
    id: "CGS_001", title: "Escenario CEO: empresa en pleno cumplimiento",
    domain: "CROSS_DOMAIN", briefingType: "CEO", expectedStatus: "COMPLIANT", severity: "LOW",
    inputs: { policyCount: 5, violationCount: 0, escalationCount: 0, exceptionCount: 0, findingCount: 0, complianceScore: 0.95, riskScore: 0.10 },
    expectedRecommendationCount: 0,
    description: "CEO recibe informe de gobernanza con cumplimiento completo y sin elementos de atención.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_002", title: "Escenario BOARD: revisión anual de gobernanza corporativa",
    domain: "CROSS_DOMAIN", briefingType: "BOARD", expectedStatus: "PARTIALLY_COMPLIANT", severity: "MEDIUM",
    inputs: { policyCount: 8, violationCount: 2, escalationCount: 1, exceptionCount: 1, findingCount: 3, complianceScore: 0.72, riskScore: 0.35 },
    expectedRecommendationCount: 3,
    description: "Junta revisa estado anual de gobernanza con áreas de mejora identificadas.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_003", title: "Escenario COMPLIANCE: violación crítica de política financiera",
    domain: "FINANCIAL", briefingType: "COMPLIANCE", expectedStatus: "NON_COMPLIANT", severity: "CRITICAL",
    inputs: { policyCount: 5, violationCount: 3, escalationCount: 2, exceptionCount: 0, findingCount: 4, complianceScore: 0.25, riskScore: 0.80 },
    expectedRecommendationCount: 5,
    description: "Equipo de cumplimiento analiza violaciones críticas de política financiera.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_004", title: "Escenario RISK: riesgo sistémico operacional emergente",
    domain: "OPERATIONAL", briefingType: "RISK", expectedStatus: "NON_COMPLIANT", severity: "CRITICAL",
    inputs: { policyCount: 4, violationCount: 2, escalationCount: 3, exceptionCount: 1, findingCount: 5, complianceScore: 0.30, riskScore: 0.85 },
    expectedRecommendationCount: 5,
    description: "Gestión de riesgo identifica patrón sistémico operacional con alta exposición.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_005", title: "Escenario EXECUTIVE: aprobación de iniciativa estratégica",
    domain: "STRATEGIC", briefingType: "EXECUTIVE", expectedStatus: "UNDER_REVIEW", severity: "HIGH",
    inputs: { policyCount: 6, violationCount: 0, escalationCount: 2, exceptionCount: 1, findingCount: 1, complianceScore: 0.75, riskScore: 0.40 },
    expectedRecommendationCount: 2,
    description: "Comité ejecutivo evalúa gobernanza de nueva iniciativa estratégica de expansión.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_006", title: "Escenario CEO: escalación bloqueante por umbral superado",
    domain: "FINANCIAL", briefingType: "CEO", expectedStatus: "PARTIALLY_COMPLIANT", severity: "HIGH",
    inputs: { policyCount: 5, violationCount: 0, escalationCount: 1, exceptionCount: 1, findingCount: 0, complianceScore: 0.70, riskScore: 0.45 },
    expectedRecommendationCount: 1,
    description: "CEO recibe escalación de decisión de inversión que supera umbral de autoridad.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_007", title: "Escenario BOARD: crisis de gobernanza con múltiples incumplimientos",
    domain: "CROSS_DOMAIN", briefingType: "BOARD", expectedStatus: "NON_COMPLIANT", severity: "CRITICAL",
    inputs: { policyCount: 7, violationCount: 5, escalationCount: 4, exceptionCount: 3, findingCount: 8, complianceScore: 0.15, riskScore: 0.90 },
    expectedRecommendationCount: 5,
    description: "Junta Directiva gestiona crisis de gobernanza con múltiples incumplimientos simultáneos.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_008", title: "Escenario COMPLIANCE: auditoría regulatoria inminente",
    domain: "REGULATORY", briefingType: "COMPLIANCE", expectedStatus: "PARTIALLY_COMPLIANT", severity: "HIGH",
    inputs: { policyCount: 6, violationCount: 1, escalationCount: 1, exceptionCount: 0, findingCount: 2, complianceScore: 0.68, riskScore: 0.42 },
    expectedRecommendationCount: 2,
    description: "Preparación para auditoría regulatoria con brechas menores identificadas.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_009", title: "Escenario RISK: riesgo de concentración en proveedor estratégico",
    domain: "OPERATIONAL", briefingType: "RISK", expectedStatus: "PARTIALLY_COMPLIANT", severity: "HIGH",
    inputs: { policyCount: 4, violationCount: 0, escalationCount: 1, exceptionCount: 0, findingCount: 2, complianceScore: 0.72, riskScore: 0.55 },
    expectedRecommendationCount: 2,
    description: "Evaluación de riesgo de concentración en proveedor único estratégico.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_010", title: "Escenario EXECUTIVE: revisión semestral de gobernanza",
    domain: "CROSS_DOMAIN", briefingType: "EXECUTIVE", expectedStatus: "COMPLIANT", severity: "LOW",
    inputs: { policyCount: 8, violationCount: 0, escalationCount: 0, exceptionCount: 0, findingCount: 1, complianceScore: 0.88, riskScore: 0.20 },
    expectedRecommendationCount: 1,
    description: "Revisión semestral del comité ejecutivo con gobernanza en buen estado.",
    limitations: COMMON_LIMITATIONS,
  },
  // Scenarios 11-20
  {
    id: "CGS_011", title: "Escenario CEO: decisión de adquisición bajo revisión de autoridad",
    domain: "STRATEGIC", briefingType: "CEO", expectedStatus: "UNDER_REVIEW", severity: "CRITICAL",
    inputs: { policyCount: 5, violationCount: 0, escalationCount: 3, exceptionCount: 1, findingCount: 0, complianceScore: 0.80, riskScore: 0.35 },
    expectedRecommendationCount: 2,
    description: "CEO evalúa decisión de adquisición que requiere aprobación de Junta Directiva.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_012", title: "Escenario COMPLIANCE: política de datos personales con brechas",
    domain: "TECHNOLOGY", briefingType: "COMPLIANCE", expectedStatus: "PARTIALLY_COMPLIANT", severity: "HIGH",
    inputs: { policyCount: 5, violationCount: 1, escalationCount: 1, exceptionCount: 0, findingCount: 3, complianceScore: 0.62, riskScore: 0.48 },
    expectedRecommendationCount: 3,
    description: "Brechas en política de datos personales identificadas por equipo de cumplimiento.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_013", title: "Escenario RISK: evaluación de riesgo estratégico por expansión",
    domain: "COMMERCIAL", briefingType: "RISK", expectedStatus: "UNDER_REVIEW", severity: "HIGH",
    inputs: { policyCount: 5, violationCount: 0, escalationCount: 2, exceptionCount: 1, findingCount: 2, complianceScore: 0.70, riskScore: 0.50 },
    expectedRecommendationCount: 2,
    description: "Evaluación de riesgo para expansión comercial en mercado nuevo.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_014", title: "Escenario BOARD: política de tolerancia al riesgo en revisión",
    domain: "RISK", briefingType: "BOARD", expectedStatus: "UNDER_REVIEW", severity: "MEDIUM",
    inputs: { policyCount: 6, violationCount: 0, escalationCount: 1, exceptionCount: 0, findingCount: 2, complianceScore: 0.75, riskScore: 0.38 },
    expectedRecommendationCount: 2,
    description: "Junta revisa y actualiza política de tolerancia al riesgo corporativo.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_015", title: "Escenario EXECUTIVE: reporte post-incidente de gobernanza",
    domain: "CROSS_DOMAIN", briefingType: "EXECUTIVE", expectedStatus: "PARTIALLY_COMPLIANT", severity: "HIGH",
    inputs: { policyCount: 6, violationCount: 2, escalationCount: 1, exceptionCount: 1, findingCount: 4, complianceScore: 0.58, riskScore: 0.60 },
    expectedRecommendationCount: 4,
    description: "Informe post-incidente de gobernanza presentado al Comité Ejecutivo.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_016", title: "Escenario CEO: revisión de violación de conflicto de interés",
    domain: "LEGAL", briefingType: "CEO", expectedStatus: "NON_COMPLIANT", severity: "CRITICAL",
    inputs: { policyCount: 5, violationCount: 1, escalationCount: 2, exceptionCount: 0, findingCount: 2, complianceScore: 0.40, riskScore: 0.70 },
    expectedRecommendationCount: 3,
    description: "CEO revisa violación crítica de conflicto de interés con impacto legal.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_017", title: "Escenario COMPLIANCE: onboarding de nueva regulación",
    domain: "REGULATORY", briefingType: "COMPLIANCE", expectedStatus: "UNDER_REVIEW", severity: "MEDIUM",
    inputs: { policyCount: 4, violationCount: 0, escalationCount: 0, exceptionCount: 0, findingCount: 1, complianceScore: 0.65, riskScore: 0.30 },
    expectedRecommendationCount: 1,
    description: "Proceso de adaptación a nueva regulación con políticas en desarrollo.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_018", title: "Escenario RISK: exposición de ciberseguridad sin control activo",
    domain: "TECHNOLOGY", briefingType: "RISK", expectedStatus: "NON_COMPLIANT", severity: "CRITICAL",
    inputs: { policyCount: 4, violationCount: 2, escalationCount: 2, exceptionCount: 0, findingCount: 5, complianceScore: 0.30, riskScore: 0.85 },
    expectedRecommendationCount: 5,
    description: "Evaluación de riesgo identifica exposición de ciberseguridad sin controles mitigantes.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_019", title: "Escenario BOARD: informe anual de gobernanza con fortalezas",
    domain: "CROSS_DOMAIN", briefingType: "BOARD", expectedStatus: "COMPLIANT", severity: "LOW",
    inputs: { policyCount: 10, violationCount: 0, escalationCount: 0, exceptionCount: 0, findingCount: 1, complianceScore: 0.92, riskScore: 0.12 },
    expectedRecommendationCount: 1,
    description: "Informe anual de gobernanza exitoso presentado a Junta con múltiples fortalezas.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_020", title: "Escenario EXECUTIVE: reorganización con gobernanza provisional",
    domain: "STRATEGIC", briefingType: "EXECUTIVE", expectedStatus: "UNDER_REVIEW", severity: "MEDIUM",
    inputs: { policyCount: 5, violationCount: 0, escalationCount: 2, exceptionCount: 2, findingCount: 3, complianceScore: 0.60, riskScore: 0.42 },
    expectedRecommendationCount: 3,
    description: "Reorganización corporativa con marco de gobernanza provisional y transiciones activas.",
    limitations: COMMON_LIMITATIONS,
  },
  // Scenarios 21-35
  {
    id: "CGS_021", title: "Escenario CEO: aprobación urgente por evento de mercado",
    domain: "COMMERCIAL", briefingType: "CEO", expectedStatus: "UNDER_REVIEW", severity: "HIGH",
    inputs: { policyCount: 5, violationCount: 0, escalationCount: 1, exceptionCount: 1, findingCount: 0, complianceScore: 0.78, riskScore: 0.38 },
    expectedRecommendationCount: 1,
    description: "CEO toma decisión urgente por evento de mercado con excepción temporal al proceso.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_022", title: "Escenario COMPLIANCE: revisión de controles detectivos",
    domain: "OPERATIONAL", briefingType: "COMPLIANCE", expectedStatus: "PARTIALLY_COMPLIANT", severity: "MEDIUM",
    inputs: { policyCount: 5, violationCount: 1, escalationCount: 0, exceptionCount: 0, findingCount: 2, complianceScore: 0.68, riskScore: 0.35 },
    expectedRecommendationCount: 2,
    description: "Revisión de efectividad de controles detectivos con brechas menores.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_023", title: "Escenario RISK: riesgo reputacional por decisión pública",
    domain: "COMMERCIAL", briefingType: "RISK", expectedStatus: "PARTIALLY_COMPLIANT", severity: "HIGH",
    inputs: { policyCount: 4, violationCount: 1, escalationCount: 1, exceptionCount: 0, findingCount: 2, complianceScore: 0.65, riskScore: 0.55 },
    expectedRecommendationCount: 2,
    description: "Evaluación de riesgo reputacional ante decisión comercial de alto impacto público.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_024", title: "Escenario BOARD: gobierno de filial con riesgo local",
    domain: "CROSS_DOMAIN", briefingType: "BOARD", expectedStatus: "PARTIALLY_COMPLIANT", severity: "MEDIUM",
    inputs: { policyCount: 6, violationCount: 1, escalationCount: 1, exceptionCount: 1, findingCount: 3, complianceScore: 0.66, riskScore: 0.44 },
    expectedRecommendationCount: 3,
    description: "Junta revisa gobernanza de filial regional con riesgos locales específicos.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_025", title: "Escenario EXECUTIVE: aprobación de política nueva de compensación",
    domain: "TALENT", briefingType: "EXECUTIVE", expectedStatus: "UNDER_REVIEW", severity: "MEDIUM",
    inputs: { policyCount: 5, violationCount: 0, escalationCount: 1, exceptionCount: 0, findingCount: 1, complianceScore: 0.80, riskScore: 0.28 },
    expectedRecommendationCount: 1,
    description: "Comité ejecutivo aprueba nueva política de compensación con revisión de autoridad.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_026", title: "Escenario CEO: incidente de violación de autoridad",
    domain: "FINANCIAL", briefingType: "CEO", expectedStatus: "NON_COMPLIANT", severity: "CRITICAL",
    inputs: { policyCount: 5, violationCount: 1, escalationCount: 3, exceptionCount: 0, findingCount: 2, complianceScore: 0.35, riskScore: 0.75 },
    expectedRecommendationCount: 4,
    description: "CEO gestiona incidente de violación de autoridad financiera con impacto operativo.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_027", title: "Escenario COMPLIANCE: programa de formación en gobernanza",
    domain: "CROSS_DOMAIN", briefingType: "COMPLIANCE", expectedStatus: "COMPLIANT", severity: "LOW",
    inputs: { policyCount: 6, violationCount: 0, escalationCount: 0, exceptionCount: 0, findingCount: 0, complianceScore: 0.90, riskScore: 0.15 },
    expectedRecommendationCount: 0,
    description: "Post-programa de formación en gobernanza con cumplimiento elevado.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_028", title: "Escenario RISK: evaluación de gobernanza para financiamiento externo",
    domain: "FINANCIAL", briefingType: "RISK", expectedStatus: "PARTIALLY_COMPLIANT", severity: "HIGH",
    inputs: { policyCount: 7, violationCount: 1, escalationCount: 1, exceptionCount: 1, findingCount: 3, complianceScore: 0.70, riskScore: 0.45 },
    expectedRecommendationCount: 3,
    description: "Evaluación de gobernanza requerida para proceso de financiamiento externo.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_029", title: "Escenario BOARD: integración de estándares ISO de gobernanza",
    domain: "CROSS_DOMAIN", briefingType: "BOARD", expectedStatus: "UNDER_REVIEW", severity: "MEDIUM",
    inputs: { policyCount: 8, violationCount: 0, escalationCount: 1, exceptionCount: 0, findingCount: 2, complianceScore: 0.75, riskScore: 0.30 },
    expectedRecommendationCount: 2,
    description: "Junta revisa proceso de integración de estándares ISO en marco de gobernanza.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_030", title: "Escenario EXECUTIVE: lanzamiento de producto con revisión regulatoria",
    domain: "COMMERCIAL", briefingType: "EXECUTIVE", expectedStatus: "PARTIALLY_COMPLIANT", severity: "HIGH",
    inputs: { policyCount: 5, violationCount: 0, escalationCount: 1, exceptionCount: 1, findingCount: 2, complianceScore: 0.72, riskScore: 0.42 },
    expectedRecommendationCount: 2,
    description: "Comité ejecutivo revisa gobernanza de lanzamiento de nuevo producto.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_031", title: "Escenario CEO: fusión con revisión exhaustiva de gobernanza",
    domain: "STRATEGIC", briefingType: "CEO", expectedStatus: "UNDER_REVIEW", severity: "CRITICAL",
    inputs: { policyCount: 10, violationCount: 0, escalationCount: 4, exceptionCount: 2, findingCount: 6, complianceScore: 0.65, riskScore: 0.55 },
    expectedRecommendationCount: 5,
    description: "CEO gestiona proceso de fusión con revisión exhaustiva de gobernanza corporativa.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_032", title: "Escenario COMPLIANCE: primer ciclo de gobernanza de startup",
    domain: "CROSS_DOMAIN", briefingType: "COMPLIANCE", expectedStatus: "UNDER_REVIEW", severity: "LOW",
    inputs: { policyCount: 3, violationCount: 0, escalationCount: 0, exceptionCount: 0, findingCount: 2, complianceScore: 0.55, riskScore: 0.25 },
    expectedRecommendationCount: 2,
    description: "Primera evaluación de gobernanza de organización en etapa temprana.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_033", title: "Escenario RISK: evaluación sistémica de riesgos de talento",
    domain: "TALENT", briefingType: "RISK", expectedStatus: "PARTIALLY_COMPLIANT", severity: "HIGH",
    inputs: { policyCount: 4, violationCount: 1, escalationCount: 1, exceptionCount: 0, findingCount: 3, complianceScore: 0.64, riskScore: 0.50 },
    expectedRecommendationCount: 3,
    description: "Evaluación de riesgos de gobernanza de talento con exposición sistémica identificada.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_034", title: "Escenario BOARD: revisión de efectividad de controles preventivos",
    domain: "FINANCIAL", briefingType: "BOARD", expectedStatus: "COMPLIANT", severity: "LOW",
    inputs: { policyCount: 7, violationCount: 0, escalationCount: 0, exceptionCount: 0, findingCount: 1, complianceScore: 0.88, riskScore: 0.18 },
    expectedRecommendationCount: 1,
    description: "Junta valida efectividad de controles preventivos financieros activos.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGS_035", title: "Escenario EXECUTIVE: cierre de auditoría con plan de remediación",
    domain: "CROSS_DOMAIN", briefingType: "EXECUTIVE", expectedStatus: "PARTIALLY_COMPLIANT", severity: "MEDIUM",
    inputs: { policyCount: 6, violationCount: 1, escalationCount: 0, exceptionCount: 0, findingCount: 3, complianceScore: 0.72, riskScore: 0.35 },
    expectedRecommendationCount: 2,
    description: "Cierre formal de auditoría con plan de remediación aprobado por el Comité Ejecutivo.",
    limitations: COMMON_LIMITATIONS,
  },
];

export function getGovernanceCanonicalScenario(id: string): GovernanceCanonicalScenario | undefined {
  return GOVERNANCE_CANONICAL_SCENARIOS.find((s) => s.id === id);
}

export function getGovernanceScenariosByBriefingType(type: GovernanceBriefingType): GovernanceCanonicalScenario[] {
  return GOVERNANCE_CANONICAL_SCENARIOS.filter((s) => s.briefingType === type);
}

export function getGovernanceScenariosByStatus(status: GovernanceStatus): GovernanceCanonicalScenario[] {
  return GOVERNANCE_CANONICAL_SCENARIOS.filter((s) => s.expectedStatus === status);
}
