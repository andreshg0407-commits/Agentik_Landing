// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 17: Enterprise Direction Engine
// Main 17-step pipeline. Never executes. Never modifies systems. suggestedOnly throughout.

import type {
  EnterpriseDirection,
  EnterpriseDirectionInput,
  EnterpriseDirectionResult,
  DirectionReport,
  DirectionScore,
  DirectionConfidence,
  DirectionStatus,
  NorthStar,
  StrategicTheme,
  StrategicPillar,
  DirectionObjective,
  DirectionPriority,
  DirectionInitiative,
  DirectionAlignment,
  DirectionDeviation,
  DirectionConflict,
  DirectionSignal,
  DirectionRecommendation,
} from "./enterprise-direction-types";
import { generateDirectionId, generateDirectionReportId } from "./enterprise-direction-identity";
import { buildDefaultNorthStar }        from "./north-star-engine";
import { buildDefaultPillars }          from "./strategic-pillar-engine";
import { evaluateAlignment }            from "./direction-alignment-engine";
import { calculateDeviationPenalty }    from "./direction-deviation-engine";
import { calculateConflictPenalty }     from "./direction-conflict-engine";
import { rankRecommendations }          from "./direction-recommendation-engine";
import { buildDirectionNarrative, buildEmptyNarrative } from "./direction-narrative-engine";
import { buildDirectionDigest }         from "./direction-digest-engine";
import { buildDirectionBriefing }       from "./direction-briefing-engine";

// ─── Pipeline Context ──────────────────────────────────────────────────────────

export interface EnterpriseDirectionContext {
  readonly northStar?:       NorthStar;
  readonly themes?:          StrategicTheme[];
  readonly pillars?:         StrategicPillar[];
  readonly objectives?:      DirectionObjective[];
  readonly priorities?:      DirectionPriority[];
  readonly initiatives?:     DirectionInitiative[];
  readonly deviations?:      DirectionDeviation[];
  readonly conflicts?:       DirectionConflict[];
  readonly signals?:         DirectionSignal[];
  readonly recommendations?: DirectionRecommendation[];
  readonly memoryHints?:     string[];
  readonly learningHints?:   string[];
  readonly forecastHints?:   string[];
}

// ─── Score computation ─────────────────────────────────────────────────────────

export function computeDirectionScore(
  orgSlug: string,
  northStar: NorthStar | null,
  alignment: DirectionAlignment | null,
  priorities: DirectionPriority[],
  initiatives: DirectionInitiative[],
  deviations: DirectionDeviation[],
  conflicts: DirectionConflict[],
  confidence: DirectionConfidence
): DirectionScore {
  try {
    const northStarScore  = northStar?.score ?? 0;
    const alignmentScore  = alignment?.alignmentScore ?? 0;
    const priorityScore   = priorities.length > 0
      ? priorities.reduce((s, p) => s + p.score, 0) / priorities.length
      : 0;
    const initiativeScore = initiatives.length > 0
      ? initiatives.reduce((s, i) => s + i.alignmentScore, 0) / initiatives.length
      : 0;
    const deviationPenalty = calculateDeviationPenalty(deviations);
    const conflictPenalty  = calculateConflictPenalty(conflicts);

    const overallScore = Math.max(0, Math.min(1,
      northStarScore  * 0.25 +
      alignmentScore  * 0.25 +
      priorityScore   * 0.20 +
      initiativeScore * 0.15 +
      (1 - deviationPenalty) * 0.10 +
      (1 - conflictPenalty)  * 0.05
    ));

    return {
      orgSlug,
      overallScore,
      northStarScore,
      alignmentScore,
      priorityScore,
      initiativeScore,
      deviationPenalty,
      conflictPenalty,
      confidence,
    };
  } catch {
    return {
      orgSlug,
      overallScore:     0,
      northStarScore:   0,
      alignmentScore:   0,
      priorityScore:    0,
      initiativeScore:  0,
      deviationPenalty: 0,
      conflictPenalty:  0,
      confidence:       "LOW",
    };
  }
}

function deriveStatus(score: DirectionScore): DirectionStatus {
  if (score.overallScore >= 0.70) return "ALIGNED";
  if (score.overallScore >= 0.50) return "PARTIALLY_ALIGNED";
  if (score.overallScore >= 0.30) return "MISALIGNED";
  return "UNDER_REVIEW";
}

function deriveConfidence(
  ctx: EnterpriseDirectionContext
): DirectionConfidence {
  const evidenceCount =
    (ctx.objectives?.flatMap((o) => o.evidenceIds).length ?? 0) +
    (ctx.priorities?.flatMap((p) => p.evidenceIds).length ?? 0);
  if (evidenceCount >= 20) return "VERY_HIGH";
  if (evidenceCount >= 10) return "HIGH";
  if (evidenceCount >= 5)  return "MEDIUM";
  return "LOW";
}

// ─── Report builder ────────────────────────────────────────────────────────────

function buildReport(
  input: EnterpriseDirectionInput,
  ctx: EnterpriseDirectionContext,
  northStar: NorthStar,
  alignment: DirectionAlignment | null,
  score: DirectionScore,
  confidence: DirectionConfidence,
  recommendations: DirectionRecommendation[]
): DirectionReport {
  const themes       = ctx.themes      ?? [];
  const pillars      = ctx.pillars     ?? [];
  const objectives   = ctx.objectives  ?? [];
  const priorities   = ctx.priorities  ?? [];
  const initiatives  = ctx.initiatives ?? [];
  const deviations   = ctx.deviations  ?? [];
  const conflicts    = ctx.conflicts   ?? [];
  const signals      = ctx.signals     ?? [];

  const narrative = buildDirectionNarrative({
    orgSlug:         input.orgSlug,
    northStar:       northStar,
    alignment,
    priorities,
    deviations,
    conflicts,
    signals,
    recommendations,
    overallScore:    score.overallScore,
    confidence,
  });

  const digest = buildDirectionDigest({
    orgSlug:      input.orgSlug,
    sessionId:    input.sessionId,
    period:       "WEEKLY",
    northStar:    northStar,
    priorities,
    deviations,
    conflicts,
    overallScore: score.overallScore,
    confidence,
  });

  const briefing = buildDirectionBriefing({
    orgSlug:         input.orgSlug,
    sessionId:       input.sessionId,
    type:            "EXECUTIVE",
    northStar:       northStar,
    objectives,
    priorities,
    deviations,
    conflicts,
    recommendations,
    overallScore:    score.overallScore,
    confidence,
  });

  return {
    id:              generateDirectionReportId(),
    orgSlug:         input.orgSlug,
    sessionId:       input.sessionId,
    title:           `Dirección Estratégica — ${new Date().toISOString().split("T")[0]}`,
    northStar,
    themes,
    pillars,
    objectives,
    priorities,
    initiatives,
    alignment,
    deviations,
    conflicts,
    signals,
    recommendations,
    score,
    narrative,
    digest,
    briefing,
    limitations:     [
      "suggestedOnly: true — todo el contenido es indicativo",
      "Validación ejecutiva requerida antes de tomar decisiones",
      "Los datos pueden estar incompletos o desactualizados",
    ],
    createdAt:       new Date().toISOString(),
  };
}

// ─── Main pipeline ─────────────────────────────────────────────────────────────

export function runEnterpriseDirection(
  input: EnterpriseDirectionInput,
  ctx: EnterpriseDirectionContext = {}
): EnterpriseDirectionResult {
  try {
    // Step 1: Resolve North Star
    const northStar: NorthStar = ctx.northStar
      ?? buildDefaultNorthStar(input.orgSlug, input.domain ?? "CROSS_DOMAIN", input.horizon ?? "MEDIUM_TERM");

    // Step 2: Resolve pillars
    const pillars: StrategicPillar[] = ctx.pillars?.length
      ? ctx.pillars
      : buildDefaultPillars(input.orgSlug);

    // Step 3: Collect objectives / priorities / initiatives
    const objectives  = ctx.objectives  ?? [];
    const priorities  = ctx.priorities  ?? [];
    const initiatives = ctx.initiatives ?? [];
    const deviations  = ctx.deviations  ?? [];
    const conflicts   = ctx.conflicts   ?? [];
    const signals     = ctx.signals     ?? [];

    // Step 4: Evaluate alignment
    const alignment: DirectionAlignment = evaluateAlignment({
      orgSlug:    input.orgSlug,
      northStar,
      objectives,
      initiatives,
      pillars,
    });

    // Step 5: Derive confidence
    const confidence = deriveConfidence(ctx);

    // Step 6: Rank recommendations
    const rawRecs    = ctx.recommendations ?? [];
    const recommendations: DirectionRecommendation[] = rankRecommendations(rawRecs);

    // Step 7: Compute score
    const score = computeDirectionScore(
      input.orgSlug,
      northStar,
      alignment,
      priorities,
      initiatives,
      deviations,
      conflicts,
      confidence
    );

    // Step 8: Derive status
    const status = deriveStatus(score);

    // Step 9: Build report (includes narrative, digest, briefing)
    const ctxWithPillars: EnterpriseDirectionContext = { ...ctx, pillars };
    const report = buildReport(input, ctxWithPillars, northStar, alignment, score, confidence, recommendations);

    // Step 10: Build EnterpriseDirection
    const direction: EnterpriseDirection = {
      id:          generateDirectionId(),
      orgSlug:     input.orgSlug,
      status,
      northStar,
      score,
      report,
      confidence,
      limitations: report.limitations,
      metadata:    input.metadata ?? {},
      createdAt:   new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    };

    return {
      orgSlug:     input.orgSlug,
      sessionId:   input.sessionId,
      direction,
      report,
      score,
      status:      "SUCCESS",
      limitations: report.limitations,
      errors:      [],
      createdAt:   new Date().toISOString(),
    };
  } catch (err) {
    return buildFailedDirectionResult(input, String(err));
  }
}

export function buildFailedDirectionResult(
  input: EnterpriseDirectionInput,
  error: string
): EnterpriseDirectionResult {
  const emptyScore: DirectionScore = {
    orgSlug:          input.orgSlug,
    overallScore:     0,
    northStarScore:   0,
    alignmentScore:   0,
    priorityScore:    0,
    initiativeScore:  0,
    deviationPenalty: 0,
    conflictPenalty:  0,
    confidence:       "LOW",
  };

  const emptyNorthStar = buildDefaultNorthStar(input.orgSlug, "CROSS_DOMAIN", "MEDIUM_TERM");
  const limitations    = ["suggestedOnly: true", "Error en pipeline de dirección estratégica"];

  const emptyReport: DirectionReport = {
    id:              generateDirectionReportId(),
    orgSlug:         input.orgSlug,
    sessionId:       input.sessionId,
    title:           "Reporte no disponible",
    northStar:       emptyNorthStar,
    themes:          [],
    pillars:         [],
    objectives:      [],
    priorities:      [],
    initiatives:     [],
    alignment:       null,
    deviations:      [],
    conflicts:       [],
    signals:         [],
    recommendations: [],
    score:           emptyScore,
    narrative:       buildEmptyNarrative(),
    digest:          null,
    briefing:        null,
    limitations,
    createdAt:       new Date().toISOString(),
  };

  const emptyDirection: EnterpriseDirection = {
    id:          generateDirectionId(),
    orgSlug:     input.orgSlug,
    status:      "UNDER_REVIEW",
    northStar:   emptyNorthStar,
    score:       emptyScore,
    report:      emptyReport,
    confidence:  "LOW",
    limitations,
    metadata:    {},
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  };

  return {
    orgSlug:     input.orgSlug,
    sessionId:   input.sessionId,
    direction:   emptyDirection,
    report:      emptyReport,
    score:       emptyScore,
    status:      "FAILED",
    limitations,
    errors:      [error],
    createdAt:   new Date().toISOString(),
  };
}
