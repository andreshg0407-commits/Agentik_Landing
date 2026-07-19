// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 11: Compliance Perspective Engine

import type { ExecutiveOpinion, ExecutiveArgument, ExecutiveFinding, CouncilPriority } from "../executive-council-types";
import { councilConfidenceFromScore } from "../executive-council-types";
import { newOpinionId, newArgumentId, newFindingId } from "../executive-council-identity";
import type { ExecutivePriority, ExecutiveRisk } from "../../executive-brain-v2/executive-brain-types";

export function buildCompliancePerspective(
  orgSlug:    string,
  sessionId:  string,
  priorities: ExecutivePriority[],
  risks:      ExecutiveRisk[]
): ExecutiveOpinion {
  try {
    const compPriorities = priorities.filter((p) =>
      p.orgSlug === orgSlug && (p.domain === "COMPLIANCE" || p.domain === "CROSS_DOMAIN")
    );
    const compRisks = risks.filter((r) =>
      r.orgSlug === orgSlug && (r.domain === "COMPLIANCE" || r.domain === "CROSS_DOMAIN")
    );

    const criticalCompRisks = compRisks.filter((r) => r.level === "CRITICAL");
    const highCompRisks     = compRisks.filter((r) => r.level === "HIGH");
    const highMitigations   = compRisks.filter((r) => r.mitigationSuggestions.length > 0);

    const confidenceScore = Math.min(
      0.9,
      0.45 + (compPriorities.length > 0 ? 0.15 : 0) + (compRisks.length > 0 ? 0.2 : 0)
    );

    const priority: CouncilPriority = criticalCompRisks.length > 0 ? "CRITICAL"
      : highCompRisks.length > 0 ? "HIGH"
      : compPriorities.length > 0 ? "MEDIUM"
      : "LOW";

    const args: ExecutiveArgument[] = [
      ...criticalCompRisks.slice(0, 2).map((r) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "OPPOSE" as const,
        claim:       `[COMPLIANCE CRÍTICO] ${r.title}`,
        rationale:   r.rationale,
        strength:    "STRONG" as const,
        evidenceIds: r.evidenceIds,
        metadata:    { riskId: r.id },
      })),
      ...highMitigations.slice(0, 1).map((r) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "CLARIFY" as const,
        claim:       `Mitigación disponible para: ${r.title}`,
        rationale:   r.mitigationSuggestions[0] ?? "Ver mitigaciones sugeridas",
        strength:    "MODERATE" as const,
        evidenceIds: r.evidenceIds,
        metadata:    { riskId: r.id },
      })),
      ...compPriorities.slice(0, 1).map((p) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "QUALIFY" as const,
        claim:       `Prioridad de cumplimiento: ${p.title}`,
        rationale:   p.rationale,
        strength:    "MODERATE" as const,
        evidenceIds: p.evidenceIds,
        metadata:    { priorityId: p.id },
      })),
    ];

    const findings: ExecutiveFinding[] = criticalCompRisks.slice(0, 2).map((r) => ({
      id:          newFindingId(),
      opinionId:   "",
      sessionId,
      orgSlug,
      title:       r.title,
      description: r.description,
      severity:    "CRITICAL" as const,
      perspective: "COMPLIANCE" as const,
      isBlocker:   true,
      evidenceIds: r.evidenceIds,
      metadata:    { riskId: r.id },
    }));

    const stance = criticalCompRisks.length > 0
      ? `Cumplimiento detecta ${criticalCompRisks.length} violación(es) crítica(s) que bloquean la ejecución`
      : highCompRisks.length > 0
      ? `Cumplimiento monitorea ${highCompRisks.length} riesgo(s) regulatorio(s) que requieren atención`
      : "Cumplimiento sin alertas críticas; perfil regulatorio dentro de parámetros";

    const opId = newOpinionId();
    return {
      id:              opId,
      orgSlug,
      sessionId,
      perspective:     "COMPLIANCE",
      title:           "Evaluación Perspectiva de Cumplimiento",
      stance,
      rationale:       `Análisis basado en ${compPriorities.length} prioridades y ${compRisks.length} riesgos de cumplimiento. Críticos: ${criticalCompRisks.length}. Altos: ${highCompRisks.length}.`,
      confidence:      councilConfidenceFromScore(confidenceScore),
      confidenceScore,
      priority,
      arguments:       args.map((a) => ({ ...a, opinionId: opId })),
      findings:        findings.map((f) => ({ ...f, opinionId: opId })),
      evidenceIds:     [...new Set([...compPriorities.flatMap((p) => p.evidenceIds), ...compRisks.flatMap((r) => r.evidenceIds)].slice(0, 8))],
      metadata:        { engine: "COMPLIANCE_PERSPECTIVE", criticalCount: criticalCompRisks.length, highCount: highCompRisks.length },
      generatedAt:     new Date().toISOString(),
    };
  } catch {
    const opId = newOpinionId();
    return {
      id: opId, orgSlug, sessionId, perspective: "COMPLIANCE",
      title: "Evaluación Perspectiva de Cumplimiento",
      stance: "Perspectiva de cumplimiento no disponible",
      rationale: "Error al construir perspectiva de cumplimiento",
      confidence: "LOW", confidenceScore: 0.1, priority: "LOW",
      arguments: [], findings: [], evidenceIds: [],
      metadata: { engine: "COMPLIANCE_PERSPECTIVE", error: true },
      generatedAt: new Date().toISOString(),
    };
  }
}
