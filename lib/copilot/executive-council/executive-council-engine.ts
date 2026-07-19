// AGENTIK-EXECUTIVE-COUNCIL-01 — Phase 17: Executive Council Engine (Main Pipeline)
// Multi-perspective deliberation. Never executes. All recommendations suggestedOnly: true.

import type {
  ExecutiveCouncilInput,
  ExecutiveCouncilSession,
  ExecutiveCouncilReport,
  ExecutiveCouncilBriefing,
  ExecutiveCouncilDigest,
  ExecutiveCouncilResult,
  ExecutiveOpinion,
  ExecutiveFinding,
  CouncilPerspective,
} from "./executive-council-types";
import { councilConfidenceFromScore, sortRecommendationsByPriority, sortFindingsBySeverity } from "./executive-council-types";
import {
  newCouncilId,
  newReportId,
  newBriefingId,
  newDigestId,
} from "./executive-council-identity";
import { buildOpinionSet, buildPlaceholderOpinion } from "./opinion-engine";
import { buildConsensus } from "./consensus-engine";
import { detectDisagreements } from "./disagreement-engine";
import { buildResolution } from "./resolution-engine";
import { DEFAULT_COUNCIL_PERSPECTIVES } from "./perspective-registry";
import type { ExecutivePriority, ExecutiveRisk, ExecutiveOpportunity, ExecutiveFocusArea } from "../executive-brain-v2/executive-brain-types";
import type { StrategicRecommendation, StrategicConcern, StrategicRiskAssessment } from "../strategic-advisor/strategic-advisor-types";
import type { StrategicPlan } from "../strategic-planning/strategic-planning-types";

import { buildFinancePerspective } from "./engines/finance-perspective-engine";
import { buildCommercialPerspective } from "./engines/commercial-perspective-engine";
import { buildOperationsPerspective } from "./engines/operations-perspective-engine";
import { buildMarketingPerspective } from "./engines/marketing-perspective-engine";
import { buildCollectionsPerspective } from "./engines/collections-perspective-engine";
import { buildStrategyPerspective } from "./engines/strategy-perspective-engine";
import { buildRiskPerspective } from "./engines/risk-perspective-engine";
import { buildCompliancePerspective } from "./engines/compliance-perspective-engine";

// ── Council context (all input data the engine consumes) ──────────────────────

export interface CouncilContext {
  readonly priorities:    ExecutivePriority[];
  readonly risks:         ExecutiveRisk[];
  readonly opportunities: ExecutiveOpportunity[];
  readonly focusAreas:    ExecutiveFocusArea[];
  readonly recs:          StrategicRecommendation[];
  readonly concerns:      StrategicConcern[];
  readonly advisorRisks:  StrategicRiskAssessment[];
  readonly plans:         StrategicPlan[];
}

function buildAllOpinions(
  orgSlug:     string,
  sessionId:   string,
  perspectives: CouncilPerspective[],
  ctx:         CouncilContext
): ExecutiveOpinion[] {
  const opinionBuilders: Record<CouncilPerspective, () => ExecutiveOpinion> = {
    FINANCE:     () => buildFinancePerspective(orgSlug, sessionId, ctx.priorities, ctx.risks, ctx.recs),
    COMMERCIAL:  () => buildCommercialPerspective(orgSlug, sessionId, ctx.priorities, ctx.risks, ctx.recs, ctx.concerns),
    OPERATIONS:  () => buildOperationsPerspective(orgSlug, sessionId, ctx.priorities, ctx.risks, ctx.focusAreas),
    MARKETING:   () => buildMarketingPerspective(orgSlug, sessionId, ctx.priorities, ctx.risks, ctx.opportunities),
    COLLECTIONS: () => buildCollectionsPerspective(orgSlug, sessionId, ctx.priorities, ctx.risks, ctx.concerns),
    STRATEGY:    () => buildStrategyPerspective(orgSlug, sessionId, ctx.priorities, ctx.recs, ctx.concerns, ctx.plans),
    RISK:        () => buildRiskPerspective(orgSlug, sessionId, ctx.risks, ctx.advisorRisks),
    COMPLIANCE:  () => buildCompliancePerspective(orgSlug, sessionId, ctx.priorities, ctx.risks),
    EXECUTIVE:   () => buildPlaceholderOpinion(orgSlug, sessionId, "EXECUTIVE"),
    CUSTOM:      () => buildPlaceholderOpinion(orgSlug, sessionId, "CUSTOM"),
  };

  return perspectives.map((p) => {
    try {
      return opinionBuilders[p]();
    } catch {
      return buildPlaceholderOpinion(orgSlug, sessionId, p);
    }
  });
}

function buildReport(
  orgSlug:  string,
  session:  ExecutiveCouncilSession
): ExecutiveCouncilReport {
  const allFindings: ExecutiveFinding[] = session.opinions.flatMap((o) => o.findings);
  const topRecs  = sortRecommendationsByPriority(session.recommendations).slice(0, 5);
  const keyFinds = sortFindingsBySeverity(allFindings).slice(0, 5);

  const executiveSummary = session.outcome === "CONSENSUS"
    ? `El Consejo Ejecutivo alcanzó consenso (${Math.round((session.consensus?.agreementScore ?? 0) * 100)}%) sobre "${session.topic}". Se generaron ${session.recommendations.length} recomendaciones.`
    : session.outcome === "PARTIAL_CONSENSUS"
    ? `Consenso parcial sobre "${session.topic}". ${session.disagreements.length} desacuerdo(s) subsisten entre perspectivas.`
    : session.outcome === "ESCALATION_REQUIRED"
    ? `Se requiere escalación ejecutiva para "${session.topic}". Bloqueos críticos identificados.`
    : `Sin consenso sobre "${session.topic}". Las perspectivas presentan posiciones divergentes que requieren revisión.`;

  return {
    id:                       newReportId(),
    orgSlug,
    session,
    executiveSummary,
    keyFindings:              keyFinds,
    topRecommendations:       topRecs,
    unresolvedDisagreements:  session.disagreements.filter((d) => !d.canBeResolved),
    councilScore:             session.sessionScore,
    confidence:               session.confidence,
    generatedAt:              new Date().toISOString(),
  };
}

function buildBriefing(
  orgSlug:  string,
  session:  ExecutiveCouncilSession
): ExecutiveCouncilBriefing {
  const allFindings = session.opinions.flatMap((o) => o.findings);
  const topRecs     = sortRecommendationsByPriority(session.recommendations).slice(0, 3);
  const keyFinds    = sortFindingsBySeverity(allFindings).slice(0, 3);

  const headline = session.outcome === "CONSENSUS"
    ? `Consenso ejecutivo alcanzado — ${topRecs[0]?.title ?? session.topic}`
    : session.outcome === "ESCALATION_REQUIRED"
    ? `Escalación requerida — decisión ejecutiva pendiente`
    : `Deliberación del consejo — ${session.topic}`;

  return {
    id:                  newBriefingId(),
    orgSlug,
    title:               `Briefing del Consejo — ${session.topic}`,
    headline,
    summary:             session.resolution?.description ?? "Sin resolución disponible",
    topRecommendations:  topRecs,
    keyFindings:         keyFinds,
    unresolvedCount:     session.disagreements.filter((d) => !d.canBeResolved).length,
    councilScore:        session.sessionScore,
    confidence:          session.confidence,
    metadata:            { sessionId: session.id },
    generatedAt:         new Date().toISOString(),
  };
}

function buildDigest(
  orgSlug:  string,
  session:  ExecutiveCouncilSession
): ExecutiveCouncilDigest {
  const topRecs = sortRecommendationsByPriority(session.recommendations).slice(0, 3);

  return {
    id:                  newDigestId(),
    orgSlug,
    title:               `Digest del Consejo`,
    headline:            `${session.outcome} — ${session.topic}`,
    outcome:             session.outcome,
    topRecommendations:  topRecs,
    councilScore:        session.sessionScore,
    confidence:          session.confidence,
    metadata:            { sessionId: session.id },
    generatedAt:         new Date().toISOString(),
  };
}

// ── Main engine entry point ────────────────────────────────────────────────────

export function runExecutiveCouncil(
  input: ExecutiveCouncilInput,
  ctx:   CouncilContext
): ExecutiveCouncilResult {
  const startMs = Date.now();

  try {
    const { orgSlug, topic } = input;
    if (!orgSlug || !topic) {
      return {
        id:          newCouncilId(),
        orgSlug:     orgSlug ?? "",
        status:      "FAILED",
        durationMs:  Date.now() - startMs,
        completedAt: new Date().toISOString(),
        error:       "orgSlug and topic are required",
      };
    }

    const perspectives = input.perspectives ?? DEFAULT_COUNCIL_PERSPECTIVES;
    const sessionId    = newCouncilId();

    // Step 1 — Build opinions from all perspectives
    const opinions     = buildAllOpinions(orgSlug, sessionId, perspectives, ctx);
    const opinionSet   = buildOpinionSet(orgSlug, opinions);

    // Step 2 — Consensus
    const consensus    = buildConsensus(orgSlug, sessionId, opinions, topic);

    // Step 3 — Disagreements
    const disagreements = detectDisagreements(orgSlug, sessionId, opinions);

    // Step 4 — Resolution
    const resolution   = buildResolution(orgSlug, sessionId, topic, opinions, consensus, disagreements);

    // Step 5 — Compute session score
    const sessionScore = Math.round(
      Math.min(0.95, consensus.agreementScore * 0.5 + opinionSet.averageConfidence * 0.5) * 100
    ) / 100;

    // Step 6 — Assemble session
    const session: ExecutiveCouncilSession = {
      id:              sessionId,
      orgSlug,
      title:           `Sesión del Consejo Ejecutivo — ${topic}`,
      topic,
      perspectives,
      opinions,
      consensus,
      disagreements,
      resolution,
      recommendations: resolution.recommendations,
      sessionScore,
      outcome:         consensus.outcome,
      confidence:      councilConfidenceFromScore(opinionSet.averageConfidence),
      limitations:     resolution.limitations,
      metadata:        {
        engine:            "EXECUTIVE_COUNCIL",
        perspectiveCount:  perspectives.length,
        opinionCount:      opinions.length,
        disagreementCount: disagreements.length,
      },
      conductedAt:     new Date().toISOString(),
    };

    // Step 7 — Reporting
    const report   = buildReport(orgSlug, session);
    const briefing = buildBriefing(orgSlug, session);

    return {
      id:          session.id,
      orgSlug,
      status:      "SUCCESS",
      session,
      report,
      briefing,
      durationMs:  Date.now() - startMs,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      id:          newCouncilId(),
      orgSlug:     input.orgSlug ?? "",
      status:      "FAILED",
      durationMs:  Date.now() - startMs,
      completedAt: new Date().toISOString(),
      error:       err instanceof Error ? err.message : "Unknown error",
    };
  }
}
