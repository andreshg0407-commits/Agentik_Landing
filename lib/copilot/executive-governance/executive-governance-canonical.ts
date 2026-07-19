// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 45: Canonical Cases (35 cases)

import type {
  GovernanceStatus,
  GovernanceDomain,
  GovernancePriorityLevel,
} from "./executive-governance-types";

export interface GovernanceCanonicalCase {
  readonly id:              string; // case ID — see GOVERNANCE_CANONICAL_CASES array
  readonly title:           string;
  readonly domain:          GovernanceDomain;
  readonly status:          GovernanceStatus;
  readonly severity:        GovernancePriorityLevel;
  readonly complianceScore: number;
  readonly riskScore:       number;
  readonly violationCount:  number;
  readonly escalationCount: number;
  readonly description:     string;
  readonly limitations:     string[];
}

const COMMON_LIMITATIONS = [
  "suggestedOnly: true — validación humana requerida",
  "Caso canónico para pruebas — no usar en producción sin adaptación",
];

export const GOVERNANCE_CANONICAL_CASES: GovernanceCanonicalCase[] = [
  // ─── Full Compliance ────────────────────────────────────────────────────────
  {
    id: "CGC_001", title: "Organización en cumplimiento total sin violaciones",
    domain: "CROSS_DOMAIN", status: "COMPLIANT", severity: "LOW",
    complianceScore: 0.95, riskScore: 0.10, violationCount: 0, escalationCount: 0,
    description: "Empresa con políticas activas, sin violaciones y todos los controles operativos.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_002", title: "Cumplimiento financiero con políticas de umbral activas",
    domain: "FINANCIAL", status: "COMPLIANT", severity: "LOW",
    complianceScore: 0.90, riskScore: 0.15, violationCount: 0, escalationCount: 0,
    description: "Todas las transacciones por debajo del umbral de aprobación ejecutiva.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_003", title: "Gobernanza operacional plena con controles automatizados",
    domain: "OPERATIONAL", status: "COMPLIANT", severity: "LOW",
    complianceScore: 0.88, riskScore: 0.12, violationCount: 0, escalationCount: 0,
    description: "Controles automatizados detectando y previniendo violaciones operacionales.",
    limitations: COMMON_LIMITATIONS,
  },
  // ─── Partial Compliance ─────────────────────────────────────────────────────
  {
    id: "CGC_004", title: "Violación menor de política de revelación de información",
    domain: "REGULATORY", status: "PARTIALLY_COMPLIANT", severity: "MEDIUM",
    complianceScore: 0.70, riskScore: 0.35, violationCount: 1, escalationCount: 0,
    description: "Una política de divulgación regulatoria incumplida, sin impacto crítico inmediato.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_005", title: "Excepción temporal de umbral financiero justificada",
    domain: "FINANCIAL", status: "PARTIALLY_COMPLIANT", severity: "HIGH",
    complianceScore: 0.65, riskScore: 0.40, violationCount: 0, escalationCount: 1,
    description: "Excepción temporal al umbral financiero con justificación formal aprobada.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_006", title: "Conflicto de interés declarado sin resolución definitiva",
    domain: "LEGAL", status: "PARTIALLY_COMPLIANT", severity: "HIGH",
    complianceScore: 0.60, riskScore: 0.45, violationCount: 1, escalationCount: 1,
    description: "Conflicto de interés en proceso de evaluación por el comité de ética.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_007", title: "Proveedor crítico sin evaluación completa",
    domain: "OPERATIONAL", status: "PARTIALLY_COMPLIANT", severity: "MEDIUM",
    complianceScore: 0.72, riskScore: 0.30, violationCount: 1, escalationCount: 0,
    description: "Proveedor crítico no evaluado completamente conforme a la política de gestión.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_008", title: "Decisión estratégica sin aprobación del nivel requerido",
    domain: "STRATEGIC", status: "PARTIALLY_COMPLIANT", severity: "HIGH",
    complianceScore: 0.55, riskScore: 0.50, violationCount: 0, escalationCount: 2,
    description: "Decisión estratégica de expansión pendiente de aprobación del Comité Ejecutivo.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_009", title: "Política de tolerancia al riesgo sin revisión anual",
    domain: "RISK", status: "PARTIALLY_COMPLIANT", severity: "MEDIUM",
    complianceScore: 0.68, riskScore: 0.38, violationCount: 0, escalationCount: 0,
    description: "La política de tolerancia al riesgo no ha sido revisada en el plazo establecido.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_010", title: "Control manual con brechas de efectividad detectadas",
    domain: "OPERATIONAL", status: "PARTIALLY_COMPLIANT", severity: "MEDIUM",
    complianceScore: 0.65, riskScore: 0.42, violationCount: 1, escalationCount: 0,
    description: "Control manual de revisión de gastos operativos con brechas en su efectividad.",
    limitations: COMMON_LIMITATIONS,
  },
  // ─── Non-Compliant ──────────────────────────────────────────────────────────
  {
    id: "CGC_011", title: "Múltiples violaciones de política financiera críticas",
    domain: "FINANCIAL", status: "NON_COMPLIANT", severity: "CRITICAL",
    complianceScore: 0.20, riskScore: 0.85, violationCount: 4, escalationCount: 3,
    description: "Cuatro violaciones críticas de política financiera en un período de 30 días.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_012", title: "Violación de autoridad ejecutiva en adquisición",
    domain: "FINANCIAL", status: "NON_COMPLIANT", severity: "CRITICAL",
    complianceScore: 0.15, riskScore: 0.90, violationCount: 1, escalationCount: 2,
    description: "Decisión de adquisición ejecutada sin aprobación del nivel de autoridad requerido.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_013", title: "Incumplimiento regulatorio con exposición legal activa",
    domain: "REGULATORY", status: "NON_COMPLIANT", severity: "CRITICAL",
    complianceScore: 0.25, riskScore: 0.80, violationCount: 2, escalationCount: 2,
    description: "Organización bajo revisión regulatoria activa por incumplimientos documentados.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_014", title: "Conflicto de interés sistémico en decisiones estratégicas",
    domain: "LEGAL", status: "NON_COMPLIANT", severity: "CRITICAL",
    complianceScore: 0.30, riskScore: 0.75, violationCount: 3, escalationCount: 3,
    description: "Patrón sistémico de conflictos de interés no declarados en decisiones clave.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_015", title: "Controles de riesgo colapsados ante evento sistémico",
    domain: "RISK", status: "NON_COMPLIANT", severity: "CRITICAL",
    complianceScore: 0.10, riskScore: 0.95, violationCount: 5, escalationCount: 4,
    description: "Todos los controles de riesgo fallaron ante un evento sistémico imprevisto.",
    limitations: COMMON_LIMITATIONS,
  },
  // ─── Under Review ───────────────────────────────────────────────────────────
  {
    id: "CGC_016", title: "Evaluación de gobernanza en proceso de revisión inicial",
    domain: "CROSS_DOMAIN", status: "UNDER_REVIEW", severity: "LOW",
    complianceScore: 0.50, riskScore: 0.30, violationCount: 0, escalationCount: 0,
    description: "Organización nueva completando la evaluación inicial de su marco de gobernanza.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_017", title: "Política en revisión por cambio regulatorio",
    domain: "REGULATORY", status: "UNDER_REVIEW", severity: "MEDIUM",
    complianceScore: 0.55, riskScore: 0.35, violationCount: 0, escalationCount: 1,
    description: "Política de divulgación en revisión por nuevos requisitos regulatorios.",
    limitations: COMMON_LIMITATIONS,
  },
  // ─── Multi-domain ───────────────────────────────────────────────────────────
  {
    id: "CGC_018", title: "Gobernanza de tecnología con riesgo de ciberseguridad",
    domain: "TECHNOLOGY", status: "PARTIALLY_COMPLIANT", severity: "HIGH",
    complianceScore: 0.58, riskScore: 0.55, violationCount: 1, escalationCount: 1,
    description: "Brechas de gobernanza tecnológica con exposición de ciberseguridad identificada.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_019", title: "Decisión de contratación masiva sin aprobación de RRHH",
    domain: "TALENT", status: "PARTIALLY_COMPLIANT", severity: "MEDIUM",
    complianceScore: 0.62, riskScore: 0.40, violationCount: 1, escalationCount: 0,
    description: "Proceso de contratación masiva iniciado sin aprobación completa de talento.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_020", title: "Expansión comercial sin evaluación de riesgo legal",
    domain: "COMMERCIAL", status: "PARTIALLY_COMPLIANT", severity: "HIGH",
    complianceScore: 0.60, riskScore: 0.48, violationCount: 0, escalationCount: 2,
    description: "Expansión a nuevo mercado sin evaluación formal de riesgo legal y regulatorio.",
    limitations: COMMON_LIMITATIONS,
  },
  // ─── Authority Cases ─────────────────────────────────────────────────────────
  {
    id: "CGC_021", title: "Escalación al CEO por umbral de inversión superado",
    domain: "FINANCIAL", status: "UNDER_REVIEW", severity: "HIGH",
    complianceScore: 0.70, riskScore: 0.40, violationCount: 0, escalationCount: 1,
    description: "Propuesta de inversión supera el umbral CEO (1M+), requiriendo revisión ejecutiva.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_022", title: "Decisión que requiere aprobación de Junta Directiva",
    domain: "STRATEGIC", status: "UNDER_REVIEW", severity: "CRITICAL",
    complianceScore: 0.80, riskScore: 0.30, violationCount: 0, escalationCount: 2,
    description: "Decisión estratégica de alto impacto requiriendo aprobación formal de la Junta.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_023", title: "Control compensatorio activado ante falla de control primario",
    domain: "OPERATIONAL", status: "PARTIALLY_COMPLIANT", severity: "HIGH",
    complianceScore: 0.65, riskScore: 0.45, violationCount: 1, escalationCount: 0,
    description: "Control compensatorio activo cubriendo la brecha del control primario fallido.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_024", title: "Política de datos con brecha de gobernanza de TI",
    domain: "TECHNOLOGY", status: "PARTIALLY_COMPLIANT", severity: "HIGH",
    complianceScore: 0.62, riskScore: 0.50, violationCount: 1, escalationCount: 1,
    description: "Política de datos personales con brechas de implementación tecnológica.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_025", title: "Riesgo de concentración en proveedor único crítico",
    domain: "OPERATIONAL", status: "PARTIALLY_COMPLIANT", severity: "HIGH",
    complianceScore: 0.68, riskScore: 0.55, violationCount: 0, escalationCount: 1,
    description: "Alta concentración de dependencia en proveedor único con riesgo operacional.",
    limitations: COMMON_LIMITATIONS,
  },
  // ─── Exception Cases ─────────────────────────────────────────────────────────
  {
    id: "CGC_026", title: "Excepción de gobernanza no justificable detectada",
    domain: "FINANCIAL", status: "NON_COMPLIANT", severity: "CRITICAL",
    complianceScore: 0.35, riskScore: 0.70, violationCount: 2, escalationCount: 2,
    description: "Excepción de gobernanza sin justificación válida ni aprobación del nivel requerido.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_027", title: "Waiver de política con aprobación ejecutiva documentada",
    domain: "REGULATORY", status: "PARTIALLY_COMPLIANT", severity: "MEDIUM",
    complianceScore: 0.72, riskScore: 0.32, violationCount: 0, escalationCount: 1,
    description: "Waiver formal de política regulatoria con aprobación ejecutiva y evidencia documental.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_028", title: "Reincidencia en violación de proceso operacional",
    domain: "OPERATIONAL", status: "NON_COMPLIANT", severity: "HIGH",
    complianceScore: 0.40, riskScore: 0.65, violationCount: 3, escalationCount: 1,
    description: "Violación de proceso reincidente sin remediación efectiva implementada.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_029", title: "Hallazgo de auditoría sin respuesta en plazo definido",
    domain: "CROSS_DOMAIN", status: "PARTIALLY_COMPLIANT", severity: "HIGH",
    complianceScore: 0.58, riskScore: 0.45, violationCount: 0, escalationCount: 1,
    description: "Hallazgo de auditoría interna sin plan de remediación presentado en el plazo.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_030", title: "Riesgo reputacional por decisión comercial cuestionada",
    domain: "COMMERCIAL", status: "PARTIALLY_COMPLIANT", severity: "HIGH",
    complianceScore: 0.62, riskScore: 0.52, violationCount: 1, escalationCount: 1,
    description: "Decisión comercial sin evaluación de impacto reputacional formal.",
    limitations: COMMON_LIMITATIONS,
  },
  // ─── Advanced ──────────────────────────────────────────────────────────────
  {
    id: "CGC_031", title: "Gobernanza de IA con política en construcción",
    domain: "TECHNOLOGY", status: "UNDER_REVIEW", severity: "MEDIUM",
    complianceScore: 0.50, riskScore: 0.40, violationCount: 0, escalationCount: 0,
    description: "Marco de gobernanza para decisiones asistidas por IA en proceso de definición.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_032", title: "Cumplimiento ambiental con múltiples políticas activas",
    domain: "REGULATORY", status: "COMPLIANT", severity: "LOW",
    complianceScore: 0.86, riskScore: 0.18, violationCount: 0, escalationCount: 0,
    description: "Marco de cumplimiento ambiental con todas las políticas activas y controles operativos.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_033", title: "Crisis de gobernanza: múltiples escalaciones bloqueantes",
    domain: "CROSS_DOMAIN", status: "NON_COMPLIANT", severity: "CRITICAL",
    complianceScore: 0.12, riskScore: 0.92, violationCount: 6, escalationCount: 5,
    description: "Crisis de gobernanza con múltiples escalaciones bloqueantes simultáneas.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_034", title: "Transformación organizacional con gobernanza transitoria",
    domain: "STRATEGIC", status: "UNDER_REVIEW", severity: "MEDIUM",
    complianceScore: 0.60, riskScore: 0.38, violationCount: 0, escalationCount: 2,
    description: "Proceso de transformación organizacional con marco de gobernanza en transición.",
    limitations: COMMON_LIMITATIONS,
  },
  {
    id: "CGC_035", title: "Gobernanza consolidada post-adquisición",
    domain: "CROSS_DOMAIN", status: "PARTIALLY_COMPLIANT", severity: "HIGH",
    complianceScore: 0.65, riskScore: 0.48, violationCount: 2, escalationCount: 2,
    description: "Marco de gobernanza en proceso de consolidación tras adquisición empresarial.",
    limitations: COMMON_LIMITATIONS,
  },
];

export function getGovernanceCanonicalCase(id: string): GovernanceCanonicalCase | undefined {
  return GOVERNANCE_CANONICAL_CASES.find((c) => c.id === id);
}

export function getGovernanceCasesByStatus(status: GovernanceStatus): GovernanceCanonicalCase[] {
  return GOVERNANCE_CANONICAL_CASES.filter((c) => c.status === status);
}

export function getGovernanceCasesByDomain(domain: GovernanceDomain): GovernanceCanonicalCase[] {
  return GOVERNANCE_CANONICAL_CASES.filter((c) => c.domain === domain);
}
