// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 10: Risk Perspective Engine

import type { ExecutiveOpinion, ExecutiveArgument, ExecutiveFinding, CouncilPriority } from "../executive-council-types";
import { councilConfidenceFromScore } from "../executive-council-types";
import { newOpinionId, newArgumentId, newFindingId } from "../executive-council-identity";
import type { ExecutiveRisk } from "../../executive-brain-v2/executive-brain-types";
import type { StrategicRiskAssessment } from "../../strategic-advisor/strategic-advisor-types";

export function buildRiskPerspective(
  orgSlug:      string,
  sessionId:    string,
  execRisks:    ExecutiveRisk[],
  advisorRisks: StrategicRiskAssessment[]
): ExecutiveOpinion {
  try {
    const orgExecRisks    = execRisks.filter((r) => r.orgSlug === orgSlug);
    const orgAdvisorRisks = advisorRisks.filter((r) => r.orgSlug === orgSlug);

    const criticalExec    = orgExecRisks.filter((r) => r.level === "CRITICAL");
    const highExec        = orgExecRisks.filter((r) => r.level === "HIGH");
    const criticalAdvisor = orgAdvisorRisks.filter((r) => r.level === "CRITICAL");

    const totalCritical = criticalExec.length + criticalAdvisor.length;
    const totalHigh     = highExec.length + orgAdvisorRisks.filter((r) => r.level === "HIGH").length;

    const confidenceScore = Math.min(
      0.92,
      0.45 + (orgExecRisks.length > 0 ? 0.2 : 0) + (orgAdvisorRisks.length > 0 ? 0.15 : 0)
    );

    const priority: CouncilPriority = totalCritical > 1 ? "CRITICAL"
      : totalCritical > 0 ? "HIGH"
      : totalHigh > 0 ? "HIGH"
      : orgExecRisks.length > 0 ? "MEDIUM"
      : "LOW";

    const args: ExecutiveArgument[] = [
      ...criticalExec.slice(0, 2).map((r) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "OPPOSE" as const,
        claim:       `[CRÍTICO] ${r.title}`,
        rationale:   r.rationale,
        strength:    "STRONG" as const,
        evidenceIds: r.evidenceIds,
        metadata:    { riskId: r.id, compositeRisk: r.compositeRisk },
      })),
      ...highExec.slice(0, 2).map((r) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "OPPOSE" as const,
        claim:       `[ALTO] ${r.title}`,
        rationale:   r.rationale,
        strength:    "MODERATE" as const,
        evidenceIds: r.evidenceIds,
        metadata:    { riskId: r.id, compositeRisk: r.compositeRisk },
      })),
      ...(orgExecRisks.length > 0 && orgAdvisorRisks.length > 0 ? [{
        id:          newArgumentId(),
        opinionId:   "",
        type:        "CLARIFY" as const,
        claim:       `Perfil de riesgo combinado: ${orgExecRisks.length + orgAdvisorRisks.length} riesgos identificados`,
        rationale:   `${totalCritical} críticos, ${totalHigh} altos de ${orgExecRisks.length + orgAdvisorRisks.length} totales`,
        strength:    "MODERATE" as const,
        evidenceIds: [],
        metadata:    {},
      }] : []),
    ];

    const findings: ExecutiveFinding[] = [
      ...criticalExec.slice(0, 2).map((r) => ({
        id:          newFindingId(),
        opinionId:   "",
        sessionId,
        orgSlug,
        title:       r.title,
        description: r.description,
        severity:    "CRITICAL" as const,
        perspective: "RISK" as const,
        isBlocker:   r.compositeRisk >= 0.8,
        evidenceIds: r.evidenceIds,
        metadata:    { riskId: r.id, compositeRisk: r.compositeRisk },
      })),
    ];

    const stance = totalCritical > 1
      ? `Riesgo alerta: ${totalCritical} riesgos críticos activos requieren decisión ejecutiva inmediata`
      : totalCritical > 0
      ? `Riesgo detecta 1 riesgo crítico con impacto transversal`
      : totalHigh > 0
      ? `Riesgo monitorea ${totalHigh} riesgo(s) de alto impacto con tendencia a escalar`
      : `Perfil de riesgo controlado: ${orgExecRisks.length + orgAdvisorRisks.length} riesgos bajo seguimiento`;

    const opId = newOpinionId();
    return {
      id:              opId,
      orgSlug,
      sessionId,
      perspective:     "RISK",
      title:           "Evaluación Perspectiva de Riesgo",
      stance,
      rationale:       `Análisis basado en ${orgExecRisks.length} riesgos ejecutivos y ${orgAdvisorRisks.length} riesgos del asesor estratégico. Críticos: ${totalCritical}. Altos: ${totalHigh}.`,
      confidence:      councilConfidenceFromScore(confidenceScore),
      confidenceScore,
      priority,
      arguments:       args.map((a) => ({ ...a, opinionId: opId })),
      findings:        findings.map((f) => ({ ...f, opinionId: opId })),
      evidenceIds:     [...new Set([...orgExecRisks.flatMap((r) => r.evidenceIds), ...orgAdvisorRisks.flatMap((r) => r.evidenceIds)].slice(0, 10))],
      metadata:        { engine: "RISK_PERSPECTIVE", totalCritical, totalHigh, totalRisks: orgExecRisks.length + orgAdvisorRisks.length },
      generatedAt:     new Date().toISOString(),
    };
  } catch {
    const opId = newOpinionId();
    return {
      id: opId, orgSlug, sessionId, perspective: "RISK",
      title: "Evaluación Perspectiva de Riesgo",
      stance: "Perspectiva de riesgo no disponible",
      rationale: "Error al construir perspectiva de riesgo",
      confidence: "LOW", confidenceScore: 0.1, priority: "LOW",
      arguments: [], findings: [], evidenceIds: [],
      metadata: { engine: "RISK_PERSPECTIVE", error: true },
      generatedAt: new Date().toISOString(),
    };
  }
}
