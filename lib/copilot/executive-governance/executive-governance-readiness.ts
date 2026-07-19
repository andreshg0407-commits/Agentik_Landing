// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 40: Governance Readiness

export type GovernanceReadinessLevel =
  | "FULL"
  | "PARTIAL"
  | "MINIMUM"
  | "NOT_READY";

export interface GovernanceReadinessReport {
  readonly orgSlug:    string;
  readonly level:      GovernanceReadinessLevel;
  readonly score:      number; // 0–1
  readonly reasons:    string[];
  readonly missing:    string[];
  readonly isReady:    boolean;
}

export interface GovernanceReadinessInputs {
  readonly hasPolicies:        boolean;
  readonly hasControls:        boolean;
  readonly hasAuthority:       boolean;
  readonly hasAssessment:      boolean;
  readonly hasViolationsChecked: boolean;
  readonly hasEscalationPaths: boolean;
  readonly hasBriefing:        boolean;
  readonly policyCount:        number;
  readonly controlCount:       number;
}

// Minimum readiness = hasPolicies && hasAuthority
export function checkGovernanceReadiness(
  orgSlug: string,
  inputs: GovernanceReadinessInputs
): GovernanceReadinessReport {
  try {
    const missing: string[]  = [];
    const reasons: string[]  = [];

    if (!inputs.hasPolicies) missing.push("Políticas de gobernanza");
    if (!inputs.hasControls) missing.push("Controles operativos");
    if (!inputs.hasAuthority) missing.push("Modelo de autoridad");
    if (!inputs.hasAssessment) missing.push("Evaluación de gobernanza");
    if (!inputs.hasViolationsChecked) missing.push("Verificación de violaciones");
    if (!inputs.hasEscalationPaths) missing.push("Rutas de escalación");
    if (!inputs.hasBriefing) missing.push("Informe ejecutivo");
    if (inputs.policyCount === 0) missing.push("Políticas activas");

    // Minimum requirement: hasPolicies && hasAuthority
    const meetsMinimum = inputs.hasPolicies && inputs.hasAuthority;

    const readyItems = [
      inputs.hasPolicies,
      inputs.hasControls,
      inputs.hasAuthority,
      inputs.hasAssessment,
      inputs.hasViolationsChecked,
      inputs.hasEscalationPaths,
      inputs.hasBriefing,
      inputs.policyCount > 0,
    ];
    const passedCount = readyItems.filter(Boolean).length;
    const score       = passedCount / readyItems.length;

    if (!meetsMinimum) {
      reasons.push("No cumple el mínimo de políticas y autoridad definidas");
    } else if (score >= 0.875) {
      reasons.push("Sistema de gobernanza completamente configurado");
    } else if (score >= 0.625) {
      reasons.push("Sistema de gobernanza parcialmente configurado");
    } else {
      reasons.push("Sistema de gobernanza en configuración mínima");
    }

    const level: GovernanceReadinessLevel =
      !meetsMinimum    ? "NOT_READY"
      : score >= 0.875 ? "FULL"
      : score >= 0.625 ? "PARTIAL"
      : "MINIMUM";

    return {
      orgSlug,
      level,
      score,
      reasons,
      missing,
      isReady: meetsMinimum,
    };
  } catch {
    return {
      orgSlug,
      level:   "NOT_READY",
      score:   0,
      reasons: ["Error al evaluar preparación"],
      missing: ["Error en verificación"],
      isReady: false,
    };
  }
}
