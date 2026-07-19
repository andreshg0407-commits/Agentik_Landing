// AGENTIK-EXECUTIVE-GOVERNANCE-01 — Phase 14: Governance Narrative Engine

import type {
  GovernanceNarrative,
  GovernanceStatus,
  GovernancePriorityLevel,
} from "./executive-governance-types";

export interface GovernanceNarrativeInput {
  readonly status:           GovernanceStatus;
  readonly complianceScore:  number;
  readonly riskScore:        number;
  readonly policyCount:      number;
  readonly violationCount:   number;
  readonly criticalCount:    number;
  readonly escalationCount:  number;
  readonly exceptionCount:   number;
  readonly findingCount:     number;
  readonly controlCount?:    number;
  readonly topPriority?:     GovernancePriorityLevel;
  readonly limitations?:     string[];
}

const STATUS_LABELS: Record<GovernanceStatus, string> = {
  COMPLIANT:           "cumplimiento total",
  PARTIALLY_COMPLIANT: "cumplimiento parcial",
  NON_COMPLIANT:       "incumplimiento",
  UNDER_REVIEW:        "revisión en curso",
};

export function buildGovernanceNarrative(input: GovernanceNarrativeInput): GovernanceNarrative {
  try {
    const statusLabel = STATUS_LABELS[input.status] ?? "estado desconocido";
    const compPct     = Math.round(input.complianceScore * 100);
    const riskPct     = Math.round(input.riskScore * 100);

    const compliance =
      `El marco de gobernanza presenta estado de ${statusLabel}. ` +
      `Cumplimiento: ${compPct}% sobre ${input.policyCount} política(s) activa(s). ` +
      (input.violationCount === 0
        ? "No se registran violaciones de política."
        : `Se detectaron ${input.violationCount} violación(es)${input.criticalCount > 0 ? `, incluyendo ${input.criticalCount} crítica(s)` : ""}.`);

    const policies =
      `El sistema cuenta con ${input.policyCount} política(s) de gobernanza activas. ` +
      (input.criticalCount > 0
        ? `${input.criticalCount} elemento(s) crítico(s) requieren atención inmediata por autoridad competente.`
        : "Las políticas operan dentro de los parámetros establecidos.");

    const exceptions =
      input.exceptionCount === 0
        ? "No se registran excepciones de gobernanza activas en el período analizado."
        : `Se han identificado ${input.exceptionCount} excepción(es) de gobernanza que requieren justificación formal y aprobación por parte de la autoridad competente.`;

    const escalations =
      input.escalationCount === 0
        ? "No existen escalaciones pendientes de resolución."
        : `${input.escalationCount} escalación(es) activa(s) requieren resolución por la cadena de autoridad. ` +
          (input.criticalCount > 0 ? "La presencia de elementos críticos eleva la urgencia." : "");

    const violations =
      input.violationCount === 0
        ? "No se han registrado violaciones de política en el período analizado."
        : `${input.violationCount} violación(es) detectada(s). ` +
          (input.criticalCount > 0 ? `${input.criticalCount} son de carácter crítico y requieren remediación urgente.` : "Se recomienda revisar los mecanismos de control asociados.");

    const risks =
      `El nivel de riesgo de gobernanza es del ${riskPct}%. ` +
      (riskPct > 70
        ? "Nivel elevado que requiere activación de controles preventivos adicionales."
        : riskPct > 40
        ? "Nivel moderado con exposición controlada."
        : "Nivel aceptable dentro del apetito de riesgo definido.");

    const controls =
      input.controlCount !== undefined
        ? `El sistema cuenta con ${input.controlCount} control(es) de gobernanza activos que respaldan el marco de cumplimiento.`
        : "Los controles de gobernanza están en operación para respaldar el cumplimiento de políticas.";

    const recommendations =
      `Basado en el análisis del período, se sugiere priorizar la atención sobre los elementos de mayor impacto. ` +
      "Todas las recomendaciones son de carácter sugerido y requieren validación humana antes de su implementación.";

    const executive =
      `Desde la perspectiva ejecutiva, el sistema de gobernanza requiere ` +
      (input.criticalCount > 0
        ? "atención inmediata sobre los elementos críticos. Se recomienda convocar sesión de revisión urgente con las autoridades competentes."
        : input.violationCount > 0
        ? "seguimiento estructurado de las violaciones detectadas y activación del plan de remediación."
        : "mantenimiento del nivel operativo y monitoreo preventivo continuo.");

    const limitations =
      [
        "suggestedOnly: true — nunca reemplaza el juicio y la deliberación ejecutiva.",
        "Este análisis es informativo y no constituye decisión ejecutiva.",
        ...(input.limitations ?? []),
      ].join(" | ");

    return {
      compliance,
      policies,
      exceptions,
      escalations,
      violations,
      risks,
      controls,
      recommendations,
      executive,
      limitations,
    };
  } catch {
    return buildEmptyGovernanceNarrative();
  }
}

export function buildEmptyGovernanceNarrative(): GovernanceNarrative {
  return {
    compliance:      "Narrativa no disponible.",
    policies:        "",
    exceptions:      "",
    escalations:     "",
    violations:      "",
    risks:           "",
    controls:        "",
    recommendations: "",
    executive:       "",
    limitations:     "suggestedOnly: true — nunca reemplaza el juicio y la deliberación ejecutiva.",
  };
}
