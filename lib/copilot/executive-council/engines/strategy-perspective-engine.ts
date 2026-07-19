// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 9: Strategy Perspective Engine

import type { ExecutiveOpinion, ExecutiveArgument, ExecutiveFinding, CouncilPriority } from "../executive-council-types";
import { councilConfidenceFromScore } from "../executive-council-types";
import { newOpinionId, newArgumentId, newFindingId } from "../executive-council-identity";
import type { ExecutivePriority } from "../../executive-brain-v2/executive-brain-types";
import type { StrategicRecommendation, StrategicConcern } from "../../strategic-advisor/strategic-advisor-types";
import type { StrategicPlan } from "../../strategic-planning/strategic-planning-types";

export function buildStrategyPerspective(
  orgSlug:    string,
  sessionId:  string,
  priorities: ExecutivePriority[],
  recs:       StrategicRecommendation[],
  concerns:   StrategicConcern[],
  plans:      StrategicPlan[]
): ExecutiveOpinion {
  try {
    const stratPriorities = priorities.filter((p) =>
      p.orgSlug === orgSlug && (p.domain === "EXECUTIVE" || p.domain === "CROSS_DOMAIN")
    );
    const stratRecs = recs.filter((r) =>
      r.orgSlug === orgSlug && (r.priority === "CRITICAL" || r.priority === "HIGH")
    );
    const stratConcerns = concerns.filter((c) =>
      c.orgSlug === orgSlug && (c.isLatent || c.severity === "HIGH" || c.severity === "CRITICAL")
    );
    const activePlans = plans.filter((p) =>
      p.orgSlug === orgSlug && p.status === "ACTIVE"
    );

    const criticalPriorities = stratPriorities.filter((p) => p.level === "CRITICAL");
    const misalignedConcerns = stratConcerns.filter((c) => c.isLatent);

    const confidenceScore = Math.min(
      0.9,
      0.4 + (stratPriorities.length > 0 ? 0.15 : 0) + (stratRecs.length > 0 ? 0.15 : 0) + (activePlans.length > 0 ? 0.15 : 0)
    );

    const priority: CouncilPriority = criticalPriorities.length > 0 ? "CRITICAL"
      : stratRecs.length > 2 ? "HIGH"
      : activePlans.length > 0 ? "MEDIUM"
      : "LOW";

    const args: ExecutiveArgument[] = [
      ...stratRecs.slice(0, 2).map((r) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "SUPPORT" as const,
        claim:       r.title,
        rationale:   r.rationale,
        strength:    r.priority === "CRITICAL" ? "STRONG" as const : "MODERATE" as const,
        evidenceIds: r.evidenceIds,
        metadata:    { recId: r.id },
      })),
      ...misalignedConcerns.slice(0, 1).map((c) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "QUALIFY" as const,
        claim:       `Preocupación estratégica latente: ${c.title}`,
        rationale:   c.rationale,
        strength:    "MODERATE" as const,
        evidenceIds: c.evidenceIds,
        metadata:    { concernId: c.id },
      })),
    ];

    const findings: ExecutiveFinding[] = criticalPriorities.slice(0, 2).map((p) => ({
      id:          newFindingId(),
      opinionId:   "",
      sessionId,
      orgSlug,
      title:       p.title,
      description: p.rationale,
      severity:    "CRITICAL" as const,
      perspective: "STRATEGY" as const,
      isBlocker:   false,
      evidenceIds: p.evidenceIds,
      metadata:    { priorityId: p.id },
    }));

    const stance = activePlans.length > 0
      ? `Estrategia alinea ${activePlans.length} plan(es) activo(s) con ${stratRecs.length} recomendación(es) de alto impacto`
      : criticalPriorities.length > 0
      ? `Estrategia detecta ${criticalPriorities.length} prioridad(es) crítica(s) sin plan de ejecución`
      : "Estrategia sin alertas urgentes; mantener orientación de largo plazo";

    const opId = newOpinionId();
    return {
      id:              opId,
      orgSlug,
      sessionId,
      perspective:     "STRATEGY",
      title:           "Evaluación Perspectiva Estratégica",
      stance,
      rationale:       `Análisis basado en ${stratPriorities.length} prioridades, ${stratRecs.length} recomendaciones, ${activePlans.length} planes activos y ${stratConcerns.length} preocupaciones estratégicas.`,
      confidence:      councilConfidenceFromScore(confidenceScore),
      confidenceScore,
      priority,
      arguments:       args.map((a) => ({ ...a, opinionId: opId })),
      findings:        findings.map((f) => ({ ...f, opinionId: opId })),
      evidenceIds:     [...new Set([...stratPriorities.flatMap((p) => p.evidenceIds), ...stratRecs.flatMap((r) => r.evidenceIds)].slice(0, 8))],
      metadata:        { engine: "STRATEGY_PERSPECTIVE", planCount: activePlans.length, recCount: stratRecs.length },
      generatedAt:     new Date().toISOString(),
    };
  } catch {
    const opId = newOpinionId();
    return {
      id: opId, orgSlug, sessionId, perspective: "STRATEGY",
      title: "Evaluación Perspectiva Estratégica",
      stance: "Perspectiva estratégica no disponible",
      rationale: "Error al construir perspectiva estratégica",
      confidence: "LOW", confidenceScore: 0.1, priority: "LOW",
      arguments: [], findings: [], evidenceIds: [],
      metadata: { engine: "STRATEGY_PERSPECTIVE", error: true },
      generatedAt: new Date().toISOString(),
    };
  }
}
