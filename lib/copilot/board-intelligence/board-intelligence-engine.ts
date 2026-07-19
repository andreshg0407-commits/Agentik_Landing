// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 15: Main Pipeline

import type {
  BoardSession,
  BoardReport,
  BoardIntelligenceInput,
  BoardIntelligenceResult,
  BoardFinding,
  BoardRisk,
  BoardOpportunity,
  BoardConcern,
  BoardPriority,
  BoardRecommendation,
  BoardGovernanceAssessment,
  BoardStrategicAssessment,
  BoardAlignment,
  BoardDecisionCandidate,
  BoardResolution,
  BoardNarrative,
  BoardDigest,
  BoardBriefing,
  BoardConfidence,
} from "./board-intelligence-types";
import { boardConfidenceFromScore } from "./board-intelligence-types";
import { generateBoardSessionId, generateBoardReportId } from "./board-intelligence-identity";
import { buildGovernanceAssessment } from "./governance-assessment-engine";
import { buildStrategicAssessment }   from "./strategic-assessment-engine";
import { identifyBoardRisks, rankBoardRisks, deduplicateBoardRisks } from "./board-risk-engine";
import { identifyBoardOpportunities, rankBoardOpportunities, deduplicateBoardOpportunities } from "./board-opportunity-engine";
import { identifyBoardConcerns, rankBoardConcerns, deduplicateBoardConcerns } from "./board-concern-engine";
import { identifyBoardPriorities, rankBoardPriorities, deduplicateBoardPriorities } from "./board-priority-engine";
import { evaluateAlignment } from "./board-alignment-engine";
import { buildDecisionCandidates, rankDecisionCandidates } from "./decision-candidate-engine";
import { buildBoardRecommendations, rankBoardRecommendations, deduplicateBoardRecommendations } from "./board-recommendation-engine";
import { buildResolution } from "./board-resolution-engine";
import { buildBoardNarrative } from "./board-narrative-engine";
import { buildBoardDigest, buildDigestTitle, buildDigestHeadline } from "./board-digest-engine";
import { buildBoardBriefing } from "./board-briefing-engine";
import { identifyBoardFindings, rankBoardFindings, deduplicateBoardFindings } from "./board-finding-engine";

import type { RawRiskSignal }           from "./board-risk-engine";
import type { RawOpportunitySignal }    from "./board-opportunity-engine";
import type { RawConcernSignal }        from "./board-concern-engine";
import type { RawPrioritySignal }       from "./board-priority-engine";
import type { RawDecisionSignal }       from "./decision-candidate-engine";
import type { RawRecommendationSignal } from "./board-recommendation-engine";
import type { RawFindingSignal }        from "./board-finding-engine";
import type { GovernanceInput }         from "./governance-assessment-engine";
import type { StrategicAssessmentInput } from "./strategic-assessment-engine";
import type { AlignmentInput }          from "./board-alignment-engine";

// ── Pipeline context ────────────────────────────────────────────────────────

export interface BoardIntelligenceContext {
  readonly governanceInput?:   Omit<GovernanceInput, "orgSlug" | "sessionId">;
  readonly strategicInput?:    Omit<StrategicAssessmentInput, "orgSlug" | "sessionId">;
  readonly alignmentInput?:    Omit<AlignmentInput, "orgSlug" | "sessionId">;
  readonly riskSignals?:       RawRiskSignal[];
  readonly opportunitySignals?: RawOpportunitySignal[];
  readonly concernSignals?:    RawConcernSignal[];
  readonly prioritySignals?:   RawPrioritySignal[];
  readonly decisionSignals?:   RawDecisionSignal[];
  readonly recommendationSignals?: RawRecommendationSignal[];
  readonly findingSignals?:    RawFindingSignal[];
}

// ── Score helper ────────────────────────────────────────────────────────────

function computeSessionScore(
  governance:    BoardGovernanceAssessment,
  strategic:     BoardStrategicAssessment,
  risks:         BoardRisk[],
  priorities:    BoardPriority[]
): number {
  try {
    const govScore  = governance.governanceScore;
    const stratScore = strategic.strategicScore;
    const criticalRisks = risks.filter((r) => r.severity === "CRITICAL").length;
    const riskPenalty   = Math.min(0.20, criticalRisks * 0.05);
    const criticalPrios = priorities.filter((p) => p.level === "CRITICAL").length;
    const prioPenalty   = Math.min(0.10, criticalPrios * 0.03);
    return Math.max(0, Math.min(1, govScore * 0.45 + stratScore * 0.45 - riskPenalty - prioPenalty + 0.10));
  } catch {
    return 0.5;
  }
}

// ── Main entry point ────────────────────────────────────────────────────────

export function runBoardIntelligence(
  input: BoardIntelligenceInput,
  ctx:   BoardIntelligenceContext
): BoardIntelligenceResult {
  const startMs = Date.now();

  try {
    if (!input.orgSlug || !input.topic) {
      return {
        id:          generateBoardSessionId(),
        orgSlug:     input.orgSlug ?? "unknown",
        status:      "FAILED",
        durationMs:  Date.now() - startMs,
        completedAt: new Date().toISOString(),
        error:       "orgSlug and topic are required",
      };
    }

    const sessionId = generateBoardSessionId();

    // Phase A — Governance + Strategic assessments
    const governance: BoardGovernanceAssessment = buildGovernanceAssessment({
      orgSlug: input.orgSlug,
      sessionId,
      ...ctx.governanceInput,
    });
    const strategic: BoardStrategicAssessment = buildStrategicAssessment({
      orgSlug: input.orgSlug,
      sessionId,
      ...ctx.strategicInput,
    });

    // Phase B — Entity identification
    const rawRisks  = deduplicateBoardRisks(rankBoardRisks(identifyBoardRisks(input.orgSlug, sessionId, ctx.riskSignals ?? [])));
    const rawOpps   = deduplicateBoardOpportunities(rankBoardOpportunities(identifyBoardOpportunities(input.orgSlug, sessionId, ctx.opportunitySignals ?? [])));
    const rawConcerns = deduplicateBoardConcerns(rankBoardConcerns(identifyBoardConcerns(input.orgSlug, sessionId, ctx.concernSignals ?? [])));
    const rawPriorities = deduplicateBoardPriorities(rankBoardPriorities(identifyBoardPriorities(input.orgSlug, sessionId, ctx.prioritySignals ?? [])));
    const rawFindings = deduplicateBoardFindings(rankBoardFindings(identifyBoardFindings(input.orgSlug, sessionId, ctx.findingSignals ?? [])));
    const rawRecs   = deduplicateBoardRecommendations(rankBoardRecommendations(buildBoardRecommendations(input.orgSlug, sessionId, ctx.recommendationSignals ?? [])));

    // Phase C — Alignment
    const alignment: BoardAlignment = evaluateAlignment({
      orgSlug:         input.orgSlug,
      sessionId,
      strategicScore:  strategic.strategicScore,
      governanceScore: governance.governanceScore,
      executionScore:  strategic.executionReadiness,
      ...ctx.alignmentInput,
    });

    // Phase D — Decision candidates + resolution
    const decisionCandidates: BoardDecisionCandidate[] = rankDecisionCandidates(
      buildDecisionCandidates(input.orgSlug, sessionId, ctx.decisionSignals ?? [], governance)
    );

    const resolution: BoardResolution = buildResolution({
      orgSlug:             input.orgSlug,
      sessionId,
      title:               `Resolución: ${input.topic}`,
      summary:             `Resolución sugerida para: ${input.topic}`,
      recommendations:     rawRecs,
      decisionCandidates,
      risks:               rawRisks,
      governance,
      evidenceIds:         rawFindings.flatMap((f) => f.evidenceIds),
      limitations:         ["Esta resolución es sugerida y requiere validación humana"],
    });

    // Phase E — Narrative
    const narrative: BoardNarrative = buildBoardNarrative({
      orgSlug:          input.orgSlug,
      sessionId,
      topic:            input.topic,
      governance,
      strategic,
      topRisks:         rawRisks.slice(0, 5),
      topOpportunities: rawOpps.slice(0, 5),
      topPriorities:    rawPriorities.slice(0, 5),
      resolution,
    });

    // Phase F — Digest + Briefing (optional)
    const digest: BoardDigest | null = input.digestPeriod
      ? buildBoardDigest({
          orgSlug:             input.orgSlug,
          period:              input.digestPeriod,
          title:               buildDigestTitle(input.orgSlug, input.digestPeriod, input.topic),
          headline:            buildDigestHeadline(governance, strategic, rawRisks),
          topPriorities:       rawPriorities.slice(0, 5),
          topRisks:            rawRisks.slice(0, 5),
          topOpportunities:    rawOpps.slice(0, 5),
          topRecommendations:  rawRecs.slice(0, 5),
          governance,
          strategic,
          metadata:            input.metadata,
        })
      : null;

    const briefing: BoardBriefing | null = input.briefingType
      ? buildBoardBriefing({
          orgSlug:             input.orgSlug,
          type:                input.briefingType,
          topic:               input.topic,
          topPriorities:       rawPriorities.slice(0, 5),
          topRisks:            rawRisks.slice(0, 5),
          topOpportunities:    rawOpps.slice(0, 5),
          topRecommendations:  rawRecs.slice(0, 5),
          topFindings:         rawFindings.slice(0, 5),
          governance,
          strategic,
          metadata:            input.metadata,
        })
      : null;

    // Phase G — Report
    const reportId = generateBoardReportId();
    const report: BoardReport = {
      id:               reportId,
      orgSlug:          input.orgSlug,
      sessionId,
      title:            `Informe de Junta: ${input.topic}`,
      executiveSummary: narrative.executive,
      governance,
      strategic,
      topFindings:      rawFindings.slice(0, 10),
      topRisks:         rawRisks.slice(0, 10),
      topOpportunities: rawOpps.slice(0, 10),
      topConcerns:      rawConcerns.slice(0, 10),
      topPriorities:    rawPriorities.slice(0, 10),
      topRecommendations: rawRecs.slice(0, 10),
      resolution,
      alignment,
      boardScore:       computeSessionScore(governance, strategic, rawRisks, rawPriorities),
      confidence:       boardConfidenceFromScore(governance.governanceScore),
      limitations:      [
        ...governance.limitations,
        ...strategic.limitations,
        "Análisis basado en datos disponibles al momento de generación",
      ],
      generatedAt:      new Date().toISOString(),
    };

    // Phase H — Session
    const sessionScore = computeSessionScore(governance, strategic, rawRisks, rawPriorities);
    const confidence: BoardConfidence = boardConfidenceFromScore(sessionScore);

    const session: BoardSession = {
      id:                 sessionId,
      orgSlug:            input.orgSlug,
      title:              input.topic,
      topic:              input.topic,
      governance,
      strategic,
      findings:           rawFindings,
      risks:              rawRisks,
      opportunities:      rawOpps,
      concerns:           rawConcerns,
      priorities:         rawPriorities,
      alignment,
      decisionCandidates,
      resolution,
      recommendations:    rawRecs,
      narrative,
      digest,
      briefing,
      report,
      sessionScore,
      boardScore:         report.boardScore,
      confidence,
      limitations:        report.limitations,
      metadata:           input.metadata ?? {},
      conductedAt:        new Date().toISOString(),
    };

    return {
      id:          sessionId,
      orgSlug:     input.orgSlug,
      status:      "SUCCESS",
      session,
      report,
      briefing:    briefing ?? undefined,
      digest:      digest ?? undefined,
      durationMs:  Date.now() - startMs,
      completedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      id:          generateBoardSessionId(),
      orgSlug:     input.orgSlug ?? "unknown",
      status:      "FAILED",
      durationMs:  Date.now() - startMs,
      completedAt: new Date().toISOString(),
      error:       err instanceof Error ? err.message : "Unknown error in board intelligence pipeline",
    };
  }
}
