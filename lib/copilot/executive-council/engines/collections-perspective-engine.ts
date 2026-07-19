// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 8: Collections Perspective Engine

import type { ExecutiveOpinion, ExecutiveArgument, ExecutiveFinding, CouncilPriority } from "../executive-council-types";
import { councilConfidenceFromScore } from "../executive-council-types";
import { newOpinionId, newArgumentId, newFindingId } from "../executive-council-identity";
import type { ExecutivePriority, ExecutiveRisk } from "../../executive-brain-v2/executive-brain-types";
import type { StrategicConcern } from "../../strategic-advisor/strategic-advisor-types";

export function buildCollectionsPerspective(
  orgSlug:    string,
  sessionId:  string,
  priorities: ExecutivePriority[],
  risks:      ExecutiveRisk[],
  concerns:   StrategicConcern[]
): ExecutiveOpinion {
  try {
    // Collections spans FINANCE + COMMERCIAL domains
    const collPriorities = priorities.filter((p) =>
      p.orgSlug === orgSlug && (p.domain === "FINANCE" || p.domain === "COMMERCIAL" || p.domain === "CROSS_DOMAIN")
    );
    const collRisks = risks.filter((r) =>
      r.orgSlug === orgSlug && (r.domain === "FINANCE" || r.domain === "COMMERCIAL" || r.domain === "CROSS_DOMAIN")
    );
    const collConcerns = concerns.filter((c) =>
      c.orgSlug === orgSlug && (c.domain === "FINANCE" || c.domain === "COMMERCIAL" || c.domain === "CROSS_DOMAIN")
    );

    const receivablesRisks  = collRisks.filter((r) => r.level === "CRITICAL" || r.level === "HIGH");
    const emergentConcerns  = collConcerns.filter((c) => c.isEmergent);
    const criticalConcerns  = collConcerns.filter((c) => c.severity === "CRITICAL");

    const confidenceScore = Math.min(
      0.88,
      0.4 + (collPriorities.length > 0 ? 0.1 : 0) + (receivablesRisks.length > 0 ? 0.2 : 0) + (emergentConcerns.length > 0 ? 0.15 : 0)
    );

    const priority: CouncilPriority = criticalConcerns.length > 0 || receivablesRisks.length > 1 ? "CRITICAL"
      : receivablesRisks.length > 0 || emergentConcerns.length > 0 ? "HIGH"
      : collConcerns.length > 0 ? "MEDIUM"
      : "LOW";

    const args: ExecutiveArgument[] = [
      ...receivablesRisks.slice(0, 2).map((r) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "OPPOSE" as const,
        claim:       `Riesgo de cartera: ${r.title}`,
        rationale:   r.rationale,
        strength:    "STRONG" as const,
        evidenceIds: r.evidenceIds,
        metadata:    { riskId: r.id },
      })),
      ...emergentConcerns.slice(0, 1).map((c) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "QUALIFY" as const,
        claim:       `Señal emergente de cobranza: ${c.title}`,
        rationale:   c.rationale,
        strength:    "MODERATE" as const,
        evidenceIds: c.evidenceIds,
        metadata:    { concernId: c.id },
      })),
    ];

    const findings: ExecutiveFinding[] = [
      ...criticalConcerns.slice(0, 2).map((c) => ({
        id:          newFindingId(),
        opinionId:   "",
        sessionId,
        orgSlug,
        title:       c.title,
        description: c.description,
        severity:    "CRITICAL" as const,
        perspective: "COLLECTIONS" as const,
        isBlocker:   true,
        evidenceIds: c.evidenceIds,
        metadata:    { concernId: c.id },
      })),
    ];

    const stance = receivablesRisks.length > 1
      ? `Cobranza alerta: ${receivablesRisks.length} riesgos de cartera activos que afectan el flujo`
      : emergentConcerns.length > 0
      ? `Cobranza detecta ${emergentConcerns.length} señal(es) emergente(s) en recuperación`
      : "Cobranza sin alertas críticas; ritmo de recuperación dentro de parámetros";

    const opId = newOpinionId();
    return {
      id:              opId,
      orgSlug,
      sessionId,
      perspective:     "COLLECTIONS",
      title:           "Evaluación Perspectiva de Cobranza",
      stance,
      rationale:       `Análisis basado en ${collPriorities.length} prioridades, ${collRisks.length} riesgos y ${collConcerns.length} preocupaciones de cartera.`,
      confidence:      councilConfidenceFromScore(confidenceScore),
      confidenceScore,
      priority,
      arguments:       args.map((a) => ({ ...a, opinionId: opId })),
      findings:        findings.map((f) => ({ ...f, opinionId: opId })),
      evidenceIds:     [...new Set([...collRisks.flatMap((r) => r.evidenceIds), ...collConcerns.flatMap((c) => c.evidenceIds)].slice(0, 8))],
      metadata:        { engine: "COLLECTIONS_PERSPECTIVE", riskCount: collRisks.length, concernCount: collConcerns.length, emergentCount: emergentConcerns.length },
      generatedAt:     new Date().toISOString(),
    };
  } catch {
    const opId = newOpinionId();
    return {
      id: opId, orgSlug, sessionId, perspective: "COLLECTIONS",
      title: "Evaluación Perspectiva de Cobranza",
      stance: "Perspectiva de cobranza no disponible",
      rationale: "Error al construir perspectiva de cobranza",
      confidence: "LOW", confidenceScore: 0.1, priority: "LOW",
      arguments: [], findings: [], evidenceIds: [],
      metadata: { engine: "COLLECTIONS_PERSPECTIVE", error: true },
      generatedAt: new Date().toISOString(),
    };
  }
}
