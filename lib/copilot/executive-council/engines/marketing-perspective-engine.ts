// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 7: Marketing Perspective Engine

import type { ExecutiveOpinion, ExecutiveArgument, ExecutiveFinding, CouncilPriority } from "../executive-council-types";
import { councilConfidenceFromScore } from "../executive-council-types";
import { newOpinionId, newArgumentId, newFindingId } from "../executive-council-identity";
import type { ExecutivePriority, ExecutiveRisk, ExecutiveOpportunity } from "../../executive-brain-v2/executive-brain-types";

export function buildMarketingPerspective(
  orgSlug:       string,
  sessionId:     string,
  priorities:    ExecutivePriority[],
  risks:         ExecutiveRisk[],
  opportunities: ExecutiveOpportunity[]
): ExecutiveOpinion {
  try {
    const mktPriorities = priorities.filter((p) =>
      p.orgSlug === orgSlug && (p.domain === "MARKETING" || p.domain === "CROSS_DOMAIN")
    );
    const mktRisks = risks.filter((r) =>
      r.orgSlug === orgSlug && (r.domain === "MARKETING" || r.domain === "CROSS_DOMAIN")
    );
    const mktOpps = opportunities.filter((o) =>
      o.orgSlug === orgSlug && (o.domain === "MARKETING" || o.domain === "CROSS_DOMAIN")
    );

    const largeOpps = mktOpps.filter((o) => o.magnitude === "LARGE" || o.magnitude === "TRANSFORMATIONAL");
    const highRisks = mktRisks.filter((r) => r.level === "CRITICAL" || r.level === "HIGH");

    const confidenceScore = Math.min(
      0.85,
      0.4 + (mktPriorities.length > 0 ? 0.15 : 0) + (mktOpps.length > 0 ? 0.15 : 0) + (mktRisks.length > 0 ? 0.1 : 0)
    );

    const priority: CouncilPriority = highRisks.length > 0 ? "HIGH"
      : largeOpps.length > 0 ? "HIGH"
      : mktPriorities.length > 0 ? "MEDIUM"
      : "LOW";

    const args: ExecutiveArgument[] = [
      ...largeOpps.slice(0, 2).map((o) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "SUPPORT" as const,
        claim:       `Oportunidad de marketing: ${o.title}`,
        rationale:   o.rationale,
        strength:    o.magnitude === "TRANSFORMATIONAL" ? "STRONG" as const : "MODERATE" as const,
        evidenceIds: o.evidenceIds,
        metadata:    { opportunityId: o.id },
      })),
      ...highRisks.slice(0, 1).map((r) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "OPPOSE" as const,
        claim:       `Riesgo de marketing: ${r.title}`,
        rationale:   r.rationale,
        strength:    "STRONG" as const,
        evidenceIds: r.evidenceIds,
        metadata:    { riskId: r.id },
      })),
    ];

    const findings: ExecutiveFinding[] = highRisks.slice(0, 1).map((r) => ({
      id:          newFindingId(),
      opinionId:   "",
      sessionId,
      orgSlug,
      title:       r.title,
      description: r.description,
      severity:    r.level === "CRITICAL" ? "CRITICAL" as const : "HIGH" as const,
      perspective: "MARKETING" as const,
      isBlocker:   false,
      evidenceIds: r.evidenceIds,
      metadata:    { riskId: r.id },
    }));

    const stance = largeOpps.length > 0
      ? `Marketing identifica ${largeOpps.length} oportunidad(es) de alto impacto para el crecimiento`
      : highRisks.length > 0
      ? `Marketing alerta sobre ${highRisks.length} riesgo(s) en posicionamiento o adquisición`
      : "Marketing no reporta bloqueos; condiciones favorables para activación de campañas";

    const opId = newOpinionId();
    return {
      id:              opId,
      orgSlug,
      sessionId,
      perspective:     "MARKETING",
      title:           "Evaluación Perspectiva de Marketing",
      stance,
      rationale:       `Análisis basado en ${mktPriorities.length} prioridades, ${mktRisks.length} riesgos y ${mktOpps.length} oportunidades de marketing.`,
      confidence:      councilConfidenceFromScore(confidenceScore),
      confidenceScore,
      priority,
      arguments:       args.map((a) => ({ ...a, opinionId: opId })),
      findings:        findings.map((f) => ({ ...f, opinionId: opId })),
      evidenceIds:     [...new Set([...mktPriorities.flatMap((p) => p.evidenceIds), ...mktOpps.flatMap((o) => o.evidenceIds)].slice(0, 8))],
      metadata:        { engine: "MARKETING_PERSPECTIVE", oppCount: mktOpps.length, riskCount: mktRisks.length },
      generatedAt:     new Date().toISOString(),
    };
  } catch {
    const opId = newOpinionId();
    return {
      id: opId, orgSlug, sessionId, perspective: "MARKETING",
      title: "Evaluación Perspectiva de Marketing",
      stance: "Perspectiva de marketing no disponible",
      rationale: "Error al construir perspectiva de marketing",
      confidence: "LOW", confidenceScore: 0.1, priority: "LOW",
      arguments: [], findings: [], evidenceIds: [],
      metadata: { engine: "MARKETING_PERSPECTIVE", error: true },
      generatedAt: new Date().toISOString(),
    };
  }
}
