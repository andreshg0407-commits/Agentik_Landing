// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 6: Operations Perspective Engine

import type { ExecutiveOpinion, ExecutiveArgument, ExecutiveFinding, CouncilPriority } from "../executive-council-types";
import { councilConfidenceFromScore } from "../executive-council-types";
import { newOpinionId, newArgumentId, newFindingId } from "../executive-council-identity";
import type { ExecutivePriority, ExecutiveRisk, ExecutiveFocusArea } from "../../executive-brain-v2/executive-brain-types";

export function buildOperationsPerspective(
  orgSlug:    string,
  sessionId:  string,
  priorities: ExecutivePriority[],
  risks:      ExecutiveRisk[],
  focusAreas: ExecutiveFocusArea[]
): ExecutiveOpinion {
  try {
    const opsPriorities = priorities.filter((p) =>
      p.orgSlug === orgSlug && (p.domain === "OPERATIONS" || p.domain === "CROSS_DOMAIN")
    );
    const opsRisks = risks.filter((r) =>
      r.orgSlug === orgSlug && (r.domain === "OPERATIONS" || r.domain === "CROSS_DOMAIN")
    );
    const opsFocus = focusAreas.filter((f) =>
      f.orgSlug === orgSlug && (f.domain === "OPERATIONS" || f.domain === "CROSS_DOMAIN")
    );

    const criticalRisks = opsRisks.filter((r) => r.level === "CRITICAL" || r.level === "HIGH");
    const topFocus      = opsFocus.slice(0, 2);

    const confidenceScore = Math.min(
      0.87,
      0.4 + (opsPriorities.length > 0 ? 0.15 : 0) + (opsRisks.length > 0 ? 0.15 : 0) + (opsFocus.length > 0 ? 0.15 : 0)
    );

    const priority: CouncilPriority = criticalRisks.length > 0 ? "HIGH"
      : opsPriorities.length > 2 ? "MEDIUM"
      : "LOW";

    const args: ExecutiveArgument[] = [
      ...topFocus.map((f) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "QUALIFY" as const,
        claim:       `Foco operativo: ${f.title}`,
        rationale:   f.rationale,
        strength:    "MODERATE" as const,
        evidenceIds: f.evidenceIds,
        metadata:    { focusId: f.id },
      })),
      ...criticalRisks.slice(0, 2).map((r) => ({
        id:          newArgumentId(),
        opinionId:   "",
        type:        "OPPOSE" as const,
        claim:       `Riesgo operativo: ${r.title}`,
        rationale:   r.rationale,
        strength:    "STRONG" as const,
        evidenceIds: r.evidenceIds,
        metadata:    { riskId: r.id },
      })),
    ];

    const findings: ExecutiveFinding[] = criticalRisks.slice(0, 2).map((r) => ({
      id:          newFindingId(),
      opinionId:   "",
      sessionId,
      orgSlug,
      title:       r.title,
      description: r.description,
      severity:    r.level === "CRITICAL" ? "CRITICAL" as const : "HIGH" as const,
      perspective: "OPERATIONS" as const,
      isBlocker:   r.level === "CRITICAL",
      evidenceIds: r.evidenceIds,
      metadata:    { riskId: r.id },
    }));

    const stance = criticalRisks.length > 0
      ? `Operaciones detecta ${criticalRisks.length} riesgo(s) que limitan la capacidad de ejecución`
      : opsFocus.length > 0
      ? `Operaciones enfoca en ${opsFocus[0].title} como área prioritaria`
      : "Operaciones sin bloqueos críticos; capacidad de ejecución disponible";

    const opId = newOpinionId();
    return {
      id:              opId,
      orgSlug,
      sessionId,
      perspective:     "OPERATIONS",
      title:           "Evaluación Perspectiva Operativa",
      stance,
      rationale:       `Análisis basado en ${opsPriorities.length} prioridades, ${opsRisks.length} riesgos y ${opsFocus.length} áreas de foco operativo.`,
      confidence:      councilConfidenceFromScore(confidenceScore),
      confidenceScore,
      priority,
      arguments:       args.map((a) => ({ ...a, opinionId: opId })),
      findings:        findings.map((f) => ({ ...f, opinionId: opId })),
      evidenceIds:     [...new Set([...opsPriorities.flatMap((p) => p.evidenceIds), ...opsRisks.flatMap((r) => r.evidenceIds)].slice(0, 8))],
      metadata:        { engine: "OPERATIONS_PERSPECTIVE", focusCount: opsFocus.length, riskCount: opsRisks.length },
      generatedAt:     new Date().toISOString(),
    };
  } catch {
    const opId = newOpinionId();
    return {
      id: opId, orgSlug, sessionId, perspective: "OPERATIONS",
      title: "Evaluación Perspectiva Operativa",
      stance: "Perspectiva operativa no disponible",
      rationale: "Error al construir perspectiva operativa",
      confidence: "LOW", confidenceScore: 0.1, priority: "LOW",
      arguments: [], findings: [], evidenceIds: [],
      metadata: { engine: "OPERATIONS_PERSPECTIVE", error: true },
      generatedAt: new Date().toISOString(),
    };
  }
}
