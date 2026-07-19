// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 4: Finance Perspective Engine

import type { ExecutiveOpinion, ExecutiveArgument, ExecutiveFinding, CouncilPriority } from "../executive-council-types";
import { councilConfidenceFromScore } from "../executive-council-types";
import { newOpinionId, newArgumentId, newFindingId } from "../executive-council-identity";
import type { ExecutivePriority, ExecutiveRisk } from "../../executive-brain-v2/executive-brain-types";
import type { StrategicRecommendation } from "../../strategic-advisor/strategic-advisor-types";

export function buildFinancePerspective(
  orgSlug:    string,
  sessionId:  string,
  priorities: ExecutivePriority[],
  risks:      ExecutiveRisk[],
  recs:       StrategicRecommendation[]
): ExecutiveOpinion {
  try {
    const financePriorities = priorities.filter((p) =>
      p.orgSlug === orgSlug && (p.domain === "FINANCE" || p.domain === "CROSS_DOMAIN")
    );
    const financeRisks = risks.filter((r) =>
      r.orgSlug === orgSlug && (r.domain === "FINANCE" || r.domain === "CROSS_DOMAIN")
    );
    const financeRecs = recs.filter((r) =>
      r.orgSlug === orgSlug && (r.domain === "FINANCE" || r.domain === "CROSS_DOMAIN")
    );

    const criticalRisks    = financeRisks.filter((r) => r.level === "CRITICAL" || r.level === "HIGH");
    const criticalPriority = financePriorities.find((p) => p.level === "CRITICAL");

    const confidenceScore = Math.min(
      0.9,
      0.4 + (financePriorities.length > 0 ? 0.2 : 0) + (financeRisks.length > 0 ? 0.15 : 0) + (financeRecs.length > 0 ? 0.15 : 0)
    );

    const priority: CouncilPriority = criticalRisks.length > 0 ? "CRITICAL"
      : criticalPriority ? "HIGH"
      : financePriorities.length > 0 ? "MEDIUM"
      : "LOW";

    const args: ExecutiveArgument[] = [
      ...(criticalRisks.slice(0, 2).map((r) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "OPPOSE" as const,
        claim:       `Riesgo financiero crítico: ${r.title}`,
        rationale:   r.rationale,
        strength:    "STRONG" as const,
        evidenceIds: r.evidenceIds,
        metadata:    { riskId: r.id },
      }))),
      ...(financeRecs.slice(0, 2).map((r) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "SUPPORT" as const,
        claim:       r.title,
        rationale:   r.rationale,
        strength:    "MODERATE" as const,
        evidenceIds: r.evidenceIds,
        metadata:    { recId: r.id },
      }))),
    ];

    const findings: ExecutiveFinding[] = criticalRisks.slice(0, 2).map((r) => ({
      id:          newFindingId(),
      opinionId:   "",
      sessionId,
      orgSlug,
      title:       r.title,
      description: r.description,
      severity:    r.level === "CRITICAL" ? "CRITICAL" as const : "HIGH" as const,
      perspective: "FINANCE" as const,
      isBlocker:   r.level === "CRITICAL",
      evidenceIds: r.evidenceIds,
      metadata:    { riskId: r.id },
    }));

    const stance = criticalRisks.length > 0
      ? `Finanzas detecta ${criticalRisks.length} riesgo(s) crítico(s) que requieren acción prioritaria`
      : financePriorities.length > 0
      ? `Finanzas alinea con ${financePriorities.length} prioridad(es) financiera(s) activas`
      : "Finanzas no detecta señales financieras críticas en el contexto actual";

    const opId = newOpinionId();
    return {
      id:              opId,
      orgSlug,
      sessionId,
      perspective:     "FINANCE",
      title:           "Evaluación Perspectiva Financiera",
      stance,
      rationale:       `Análisis basado en ${financePriorities.length} prioridades, ${financeRisks.length} riesgos y ${financeRecs.length} recomendaciones financieras.`,
      confidence:      councilConfidenceFromScore(confidenceScore),
      confidenceScore,
      priority,
      arguments:       args.map((a) => ({ ...a, opinionId: opId })),
      findings:        findings.map((f) => ({ ...f, opinionId: opId })),
      evidenceIds:     [...new Set([...financePriorities.flatMap((p) => p.evidenceIds), ...financeRisks.flatMap((r) => r.evidenceIds)].slice(0, 8))],
      metadata:        { engine: "FINANCE_PERSPECTIVE", priorityCount: financePriorities.length, riskCount: financeRisks.length },
      generatedAt:     new Date().toISOString(),
    };
  } catch {
    const opId = newOpinionId();
    return {
      id: opId, orgSlug, sessionId, perspective: "FINANCE",
      title: "Evaluación Perspectiva Financiera",
      stance: "Perspectiva financiera no disponible",
      rationale: "Error al construir perspectiva financiera",
      confidence: "LOW", confidenceScore: 0.1, priority: "LOW",
      arguments: [], findings: [], evidenceIds: [],
      metadata: { engine: "FINANCE_PERSPECTIVE", error: true },
      generatedAt: new Date().toISOString(),
    };
  }
}
