// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 5: Commercial Perspective Engine

import type { ExecutiveOpinion, ExecutiveArgument, ExecutiveFinding, CouncilPriority } from "../executive-council-types";
import { councilConfidenceFromScore } from "../executive-council-types";
import { newOpinionId, newArgumentId, newFindingId } from "../executive-council-identity";
import type { ExecutivePriority, ExecutiveRisk } from "../../executive-brain-v2/executive-brain-types";
import type { StrategicRecommendation, StrategicConcern } from "../../strategic-advisor/strategic-advisor-types";

export function buildCommercialPerspective(
  orgSlug:    string,
  sessionId:  string,
  priorities: ExecutivePriority[],
  risks:      ExecutiveRisk[],
  recs:       StrategicRecommendation[],
  concerns:   StrategicConcern[]
): ExecutiveOpinion {
  try {
    const commPriorities = priorities.filter((p) =>
      p.orgSlug === orgSlug && (p.domain === "COMMERCIAL" || p.domain === "CROSS_DOMAIN")
    );
    const commRisks = risks.filter((r) =>
      r.orgSlug === orgSlug && (r.domain === "COMMERCIAL" || r.domain === "CROSS_DOMAIN")
    );
    const commRecs = recs.filter((r) =>
      r.orgSlug === orgSlug && (r.domain === "COMMERCIAL" || r.domain === "CROSS_DOMAIN")
    );
    const commConcerns = concerns.filter((c) =>
      c.orgSlug === orgSlug && (c.domain === "COMMERCIAL" || c.domain === "CROSS_DOMAIN")
    );

    const criticalRisks    = commRisks.filter((r) => r.level === "CRITICAL" || r.level === "HIGH");
    const criticalConcerns = commConcerns.filter((c) => c.severity === "CRITICAL" || c.severity === "HIGH");

    const confidenceScore = Math.min(
      0.88,
      0.4 + (commPriorities.length > 0 ? 0.15 : 0) + (commRisks.length > 0 ? 0.15 : 0) + (commRecs.length > 0 ? 0.1 : 0) + (commConcerns.length > 0 ? 0.1 : 0)
    );

    const priority: CouncilPriority = criticalRisks.length > 1 || criticalConcerns.length > 1 ? "CRITICAL"
      : criticalRisks.length > 0 || criticalConcerns.length > 0 ? "HIGH"
      : commPriorities.length > 0 ? "MEDIUM"
      : "LOW";

    const args: ExecutiveArgument[] = [
      ...(criticalConcerns.slice(0, 2).map((c) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "OPPOSE" as const,
        claim:       `Preocupación comercial: ${c.title}`,
        rationale:   c.rationale,
        strength:    "STRONG" as const,
        evidenceIds: c.evidenceIds,
        metadata:    { concernId: c.id },
      }))),
      ...(commRecs.slice(0, 2).map((r) => ({
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

    const findings: ExecutiveFinding[] = [
      ...criticalRisks.slice(0, 2).map((r) => ({
        id:          newFindingId(),
        opinionId:   "",
        sessionId,
        orgSlug,
        title:       r.title,
        description: r.description,
        severity:    r.level === "CRITICAL" ? "CRITICAL" as const : "HIGH" as const,
        perspective: "COMMERCIAL" as const,
        isBlocker:   r.level === "CRITICAL",
        evidenceIds: r.evidenceIds,
        metadata:    { riskId: r.id },
      })),
    ];

    const stance = criticalRisks.length > 0
      ? `Comercial identifica ${criticalRisks.length} riesgo(s) de alto impacto en ingresos y clientes`
      : commConcerns.length > 0
      ? `Comercial señala ${commConcerns.length} preocupación(es) que pueden afectar el crecimiento`
      : "Comercial no detecta bloqueos críticos; se recomienda mantener el impulso de ventas";

    const opId = newOpinionId();
    return {
      id:              opId,
      orgSlug,
      sessionId,
      perspective:     "COMMERCIAL",
      title:           "Evaluación Perspectiva Comercial",
      stance,
      rationale:       `Análisis basado en ${commPriorities.length} prioridades, ${commRisks.length} riesgos, ${commConcerns.length} preocupaciones y ${commRecs.length} recomendaciones comerciales.`,
      confidence:      councilConfidenceFromScore(confidenceScore),
      confidenceScore,
      priority,
      arguments:       args.map((a) => ({ ...a, opinionId: opId })),
      findings:        findings.map((f) => ({ ...f, opinionId: opId })),
      evidenceIds:     [...new Set([...commPriorities.flatMap((p) => p.evidenceIds), ...commRisks.flatMap((r) => r.evidenceIds)].slice(0, 8))],
      metadata:        { engine: "COMMERCIAL_PERSPECTIVE", priorityCount: commPriorities.length, concernCount: commConcerns.length },
      generatedAt:     new Date().toISOString(),
    };
  } catch {
    const opId = newOpinionId();
    return {
      id: opId, orgSlug, sessionId, perspective: "COMMERCIAL",
      title: "Evaluación Perspectiva Comercial",
      stance: "Perspectiva comercial no disponible",
      rationale: "Error al construir perspectiva comercial",
      confidence: "LOW", confidenceScore: 0.1, priority: "LOW",
      arguments: [], findings: [], evidenceIds: [],
      metadata: { engine: "COMMERCIAL_PERSPECTIVE", error: true },
      generatedAt: new Date().toISOString(),
    };
  }
}
