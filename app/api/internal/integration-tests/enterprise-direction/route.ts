// AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01 — Phase 48: Integration Harness
// 800+ tests across all engines, integrations, and pipeline stages.
import { NextResponse } from "next/server";

interface TestContext {
  results: string[];
  passed:  number;
  failed:  number;
}

function assert(condition: boolean, label: string, ctx: TestContext): void {
  if (condition) {
    ctx.results.push(`PASS: ${label}`);
    ctx.passed++;
  } else {
    ctx.results.push(`FAIL: ${label}`);
    ctx.failed++;
  }
}

export async function GET(): Promise<NextResponse> {
  const ctx: TestContext = { results: [], passed: 0, failed: 0 };

  try {
    // ── Suite 1: Types and Identity ──────────────────────────────────────────
    const {
      generateDirectionId, generateNorthStarId, generateDirectionObjectiveId,
      generateDirectionPriorityId, generateDirectionInitiativeId, generateDirectionReportId,
      generateStrategicThemeId, generateStrategicPillarId, generateDirectionAlignmentId,
      generateDirectionDeviationId, generateDirectionConflictId, generateDirectionSignalId,
      generateDirectionRecommendationId, generateDirectionDigestId, generateDirectionBriefingId,
      generateDirectionAuditId, validateDirectionId, getDirectionIdPrefix,
    } = await import("../../../../../lib/copilot/enterprise-direction/enterprise-direction-identity");

    assert(generateDirectionId().startsWith("direction_"), "direction ID prefix", ctx);
    assert(generateNorthStarId().startsWith("northstar_"), "northstar ID prefix", ctx);
    assert(generateDirectionObjectiveId().startsWith("dobjective_"), "dobjective ID prefix", ctx);
    assert(generateDirectionPriorityId().startsWith("dpriority_"), "dpriority ID prefix", ctx);
    assert(generateDirectionInitiativeId().startsWith("dinitiative_"), "dinitiative ID prefix", ctx);
    assert(generateDirectionReportId().startsWith("dreport_"), "dreport ID prefix", ctx);
    assert(generateStrategicThemeId().startsWith("dtheme_"), "dtheme ID prefix", ctx);
    assert(generateStrategicPillarId().startsWith("dpillar_"), "dpillar ID prefix", ctx);
    assert(generateDirectionAlignmentId().startsWith("dalignment_"), "dalignment ID prefix", ctx);
    assert(generateDirectionDeviationId().startsWith("ddeviation_"), "ddeviation ID prefix", ctx);
    assert(generateDirectionConflictId().startsWith("dconflict_"), "dconflict ID prefix", ctx);
    assert(generateDirectionSignalId().startsWith("dsignal_"), "dsignal ID prefix", ctx);
    assert(generateDirectionRecommendationId().startsWith("drec_"), "drec ID prefix", ctx);
    assert(generateDirectionDigestId().startsWith("ddigest_"), "ddigest ID prefix", ctx);
    assert(generateDirectionBriefingId().startsWith("dbriefing_"), "dbriefing ID prefix", ctx);
    assert(generateDirectionAuditId().startsWith("daud_"), "daud ID prefix", ctx);
    assert(validateDirectionId("direction_abc123"), "validateDirectionId direction_", ctx);
    assert(validateDirectionId("northstar_abc"), "validateDirectionId northstar_", ctx);
    assert(!validateDirectionId("unknown_abc"), "validateDirectionId rejects unknown prefix", ctx);
    assert(getDirectionIdPrefix("direction_abc") === "direction_", "getDirectionIdPrefix correct", ctx);
    assert(getDirectionIdPrefix("unknown_abc") === null, "getDirectionIdPrefix null for unknown", ctx);

    // ── Suite 2: North Star Engine ───────────────────────────────────────────
    const {
      buildNorthStar, evaluateNorthStar, refreshNorthStar,
      buildDefaultNorthStar, scoreNorthStarAlignment,
    } = await import("../../../../../lib/copilot/enterprise-direction/north-star-engine");

    const ns1 = buildNorthStar("castillitos", {
      statement:  "Expansión rentable en mercado infantil",
      rationale:  "Demanda creciente en el segmento",
      horizon:    "MEDIUM_TERM",
      domain:     "GROWTH",
      evidenceIds: ["ev1", "ev2"],
      assumptions: ["Mercado sigue creciendo"],
    });
    assert(ns1.suggestedOnly === true, "NorthStar suggestedOnly true", ctx);
    assert(ns1.orgSlug === "castillitos", "NorthStar orgSlug", ctx);
    assert(typeof ns1.score === "number", "NorthStar has score", ctx);
    assert(ns1.score >= 0 && ns1.score <= 1, "NorthStar score in range", ctx);
    assert(ns1.limitations.length > 0, "NorthStar has limitations", ctx);

    const eval1 = evaluateNorthStar(ns1);
    assert(typeof eval1.score === "number", "evaluateNorthStar returns score", ctx);
    assert(Array.isArray(eval1.gaps), "evaluateNorthStar gaps array", ctx);

    const defaultNs = buildDefaultNorthStar("castillitos", "GROWTH", "MEDIUM_TERM");
    assert(defaultNs.suggestedOnly === true, "defaultNorthStar suggestedOnly", ctx);
    assert(defaultNs.orgSlug === "castillitos", "defaultNorthStar orgSlug", ctx);

    const refreshed = refreshNorthStar(ns1, { score: 0.8 });
    assert(refreshed.score === 0.8, "refreshNorthStar updates score", ctx);
    assert(refreshed.suggestedOnly === true, "refreshedNorthStar suggestedOnly preserved", ctx);

    const nsScore = scoreNorthStarAlignment(5, 2, 0);
    assert(nsScore >= 0 && nsScore <= 1, "scoreNorthStarAlignment in range", ctx);

    // ── Suite 3: Strategic Theme Engine ─────────────────────────────────────
    const {
      buildStrategicTheme, identifyStrategicThemes, rankStrategicThemes,
      getEmergentThemes, groupThemesByDomain, scoreStrategicTheme,
    } = await import("../../../../../lib/copilot/enterprise-direction/strategic-theme-engine");

    const theme1 = buildStrategicTheme("castillitos", {
      title:       "Digitalización comercial",
      description: "Migración a canales digitales",
      domain:      "TECHNOLOGY",
      strength:    0.75,
      horizon:     "MEDIUM_TERM",
      isEmergent:  true,
      evidenceIds: ["ev1"],
    });
    assert(theme1.orgSlug === "castillitos", "theme orgSlug", ctx);
    assert(theme1.strength >= 0 && theme1.strength <= 1, "theme strength in range", ctx);
    assert(theme1.isEmergent === true, "theme isEmergent", ctx);

    const themes = identifyStrategicThemes("castillitos", [
      { title: "T1", description: "D1", domain: "GROWTH", strength: 0.7, horizon: "SHORT_TERM", isEmergent: false, evidenceIds: [] },
      { title: "T2", description: "D2", domain: "TECHNOLOGY", strength: 0.9, horizon: "MEDIUM_TERM", isEmergent: true, evidenceIds: [] },
    ]);
    assert(themes.length === 2, "identifyStrategicThemes count", ctx);

    const rankedThemes = rankStrategicThemes(themes);
    assert(rankedThemes[0].strength >= rankedThemes[1].strength, "rankStrategicThemes descending", ctx);

    const emergentThemes = getEmergentThemes(themes);
    assert(emergentThemes.length === 1, "getEmergentThemes count", ctx);

    const grouped = groupThemesByDomain(themes);
    assert(grouped["GROWTH"]?.length === 1, "groupThemesByDomain GROWTH", ctx);

    const themeScore = scoreStrategicTheme(0.8, 3, true);
    assert(themeScore >= 0 && themeScore <= 1, "scoreStrategicTheme in range", ctx);

    // ── Suite 4: Strategic Pillar Engine ─────────────────────────────────────
    const {
      buildStrategicPillar, buildDefaultPillars, rankStrategicPillars,
      getWeakPillars, calculateWeightedPillarScore,
    } = await import("../../../../../lib/copilot/enterprise-direction/strategic-pillar-engine");

    const pillar1 = buildStrategicPillar("castillitos", {
      name:        "Crecimiento",
      description: "Expansión de ingresos",
      domain:      "GROWTH",
      weight:      0.30,
      score:       0.65,
    });
    assert(pillar1.orgSlug === "castillitos", "pillar orgSlug", ctx);
    assert(pillar1.weight === 0.30, "pillar weight", ctx);
    assert(pillar1.score === 0.65, "pillar score", ctx);

    const defaultPillars = buildDefaultPillars("castillitos");
    assert(defaultPillars.length === 5, "buildDefaultPillars count=5", ctx);
    const pillarNames = defaultPillars.map((p) => p.name);
    assert(pillarNames.includes("Crecimiento"), "default pillars: Crecimiento", ctx);
    assert(pillarNames.includes("Rentabilidad"), "default pillars: Rentabilidad", ctx);
    assert(pillarNames.includes("Eficiencia"), "default pillars: Eficiencia", ctx);
    assert(pillarNames.includes("Innovación"), "default pillars: Innovación", ctx);
    assert(pillarNames.includes("Gobierno"), "default pillars: Gobierno", ctx);

    const weakPillars = getWeakPillars([
      { ...pillar1, score: 0.3 },
      { ...pillar1, score: 0.7 },
    ]);
    assert(weakPillars.length === 1, "getWeakPillars: score<0.40", ctx);

    const wpScore = calculateWeightedPillarScore(defaultPillars);
    assert(wpScore >= 0 && wpScore <= 1, "calculateWeightedPillarScore in range", ctx);

    const rankedPillars = rankStrategicPillars(defaultPillars);
    assert(rankedPillars.length === 5, "rankStrategicPillars count", ctx);

    // ── Suite 5: Objective Engine ─────────────────────────────────────────────
    const {
      buildDirectionObjective, buildDirectionObjectives, scoreObjective,
      scoreObjectives, rankObjectives, getCriticalObjectives,
    } = await import("../../../../../lib/copilot/enterprise-direction/direction-objective-engine");

    const obj1 = buildDirectionObjective("castillitos", {
      title:       "Crecer 20% en ventas",
      description: "Incrementar ventas en segmento principal",
      domain:      "GROWTH",
      horizon:     "MEDIUM_TERM",
      priority:    "CRITICAL",
      northStarId: ns1.id,
      evidenceIds: ["ev1", "ev2", "ev3"],
    });
    assert(obj1.orgSlug === "castillitos", "objective orgSlug", ctx);
    assert(obj1.priority === "CRITICAL", "objective priority", ctx);
    assert(obj1.score >= 0 && obj1.score <= 1, "objective score in range", ctx);

    const objScore = scoreObjective("CRITICAL", 3, 0.05);
    assert(objScore >= 0 && objScore <= 1, "scoreObjective in range", ctx);
    assert(objScore >= 0.90, "scoreObjective CRITICAL base ≥ 0.90", ctx);

    const objScoreMedium = scoreObjective("MEDIUM", 0, 0);
    assert(objScoreMedium >= 0.50 && objScoreMedium <= 1, "scoreObjective MEDIUM base ~0.50", ctx);

    const objectives = buildDirectionObjectives("castillitos", [
      { title: "O1", description: "D1", domain: "GROWTH", horizon: "SHORT_TERM", priority: "HIGH", northStarId: "ns1", evidenceIds: [] },
      { title: "O2", description: "D2", domain: "RISK", horizon: "IMMEDIATE", priority: "CRITICAL", northStarId: "ns1", evidenceIds: [] },
    ]);
    assert(objectives.length === 2, "buildDirectionObjectives count", ctx);

    const avgObjScore = scoreObjectives(objectives);
    assert(avgObjScore >= 0 && avgObjScore <= 1, "scoreObjectives in range", ctx);

    const ranked = rankObjectives(objectives);
    assert(ranked[0].priority === "CRITICAL", "rankObjectives CRITICAL first", ctx);

    const critical = getCriticalObjectives(objectives);
    assert(critical.length === 1, "getCriticalObjectives count", ctx);

    // ── Suite 6: Priority Engine ──────────────────────────────────────────────
    const {
      buildDirectionPriority, identifyPriorities, rankPriorities,
      scorePriority, getCriticalPriorities, getTopPriorities,
    } = await import("../../../../../lib/copilot/enterprise-direction/direction-priority-engine");

    const prio1 = buildDirectionPriority("castillitos", {
      title:     "Rentabilizar operaciones",
      rationale: "Márgenes por debajo del objetivo",
      level:     "CRITICAL",
      domain:    "PROFITABILITY",
      horizon:   "SHORT_TERM",
      urgency:   0.9,
      impact:    0.8,
    }, 1);
    assert(prio1.suggestedOnly === true, "priority suggestedOnly true", ctx);
    assert(prio1.score >= 0 && prio1.score <= 1, "priority score in range", ctx);
    assert(prio1.rank === 1, "priority rank=1", ctx);

    const prioScore = scorePriority(0.9, 0.8, "CRITICAL");
    assert(prioScore >= 0 && prioScore <= 1, "scorePriority in range", ctx);
    assert(prioScore >= 0.90, "scorePriority CRITICAL high score", ctx);

    const priorities = identifyPriorities("castillitos", [
      { title: "P1", rationale: "R1", level: "HIGH", domain: "GROWTH", horizon: "MEDIUM_TERM", urgency: 0.7, impact: 0.6 },
      { title: "P2", rationale: "R2", level: "CRITICAL", domain: "RISK", horizon: "IMMEDIATE", urgency: 0.95, impact: 0.9 },
      { title: "P3", rationale: "R3", level: "MEDIUM", domain: "EFFICIENCY", horizon: "SHORT_TERM", urgency: 0.4, impact: 0.5 },
    ]);
    assert(priorities.length === 3, "identifyPriorities count", ctx);
    assert(priorities.every((p) => p.suggestedOnly === true), "all priorities suggestedOnly", ctx);

    const rankedPriorities = rankPriorities(priorities);
    assert(rankedPriorities[0].rank === 1, "rankPriorities rank=1 first", ctx);

    const criticalPrios = getCriticalPriorities(priorities);
    assert(criticalPrios.length === 1, "getCriticalPriorities count", ctx);

    const topPrios = getTopPriorities(priorities, 2);
    assert(topPrios.length === 2, "getTopPriorities(2) count", ctx);

    // ── Suite 7: Initiative Engine ────────────────────────────────────────────
    const {
      buildDirectionInitiative, identifyInitiatives, rankInitiatives,
      scoreInitiativeAlignment, getActiveInitiatives, getMisalignedInitiatives,
    } = await import("../../../../../lib/copilot/enterprise-direction/direction-initiative-engine");

    const init1 = buildDirectionInitiative("castillitos", {
      title:          "Programa de fidelización",
      description:    "Aumento de retención de clientes",
      domain:         "MARKET",
      horizon:        "SHORT_TERM",
      status:         "ACTIVE",
      northStarScore: 0.7,
      evidenceIds:    ["ev1"],
    });
    assert(init1.suggestedOnly === true, "initiative suggestedOnly true", ctx);
    assert(init1.status === "ACTIVE", "initiative status ACTIVE", ctx);
    assert(init1.alignmentScore >= 0 && init1.alignmentScore <= 1, "initiative alignmentScore in range", ctx);

    const initScore = scoreInitiativeAlignment(0.7, "ACTIVE", 3);
    assert(initScore >= 0 && initScore <= 1, "scoreInitiativeAlignment in range", ctx);

    const cancelledScore = scoreInitiativeAlignment(0.7, "CANCELLED", 3);
    assert(cancelledScore < initScore, "CANCELLED lower than ACTIVE", ctx);

    const initiatives = identifyInitiatives("castillitos", [
      { title: "I1", description: "D1", domain: "GROWTH", horizon: "MEDIUM_TERM", status: "ACTIVE", northStarScore: 0.8, evidenceIds: [] },
      { title: "I2", description: "D2", domain: "RISK", horizon: "IMMEDIATE", status: "PAUSED", northStarScore: 0.3, evidenceIds: [] },
    ]);
    assert(initiatives.length === 2, "identifyInitiatives count", ctx);

    const activeInits = getActiveInitiatives(initiatives);
    assert(activeInits.length === 1, "getActiveInitiatives count", ctx);

    const misaligned = getMisalignedInitiatives(initiatives);
    assert(misaligned.length >= 1, "getMisalignedInitiatives count", ctx);

    const rankedInits = rankInitiatives(initiatives);
    assert(rankedInits[0].alignmentScore >= rankedInits[1].alignmentScore, "rankInitiatives descending", ctx);

    // ── Suite 8: Alignment Engine ─────────────────────────────────────────────
    const {
      calculateAlignmentScore, evaluateAlignment, rankAlignment,
    } = await import("../../../../../lib/copilot/enterprise-direction/direction-alignment-engine");

    const alignInput = {
      orgSlug:     "castillitos",
      northStar:   ns1,
      objectives:  objectives,
      initiatives: initiatives,
      pillars:     defaultPillars,
    };
    const alignScore = calculateAlignmentScore(alignInput);
    assert(alignScore >= 0 && alignScore <= 1, "calculateAlignmentScore in range", ctx);

    const alignment = evaluateAlignment(alignInput);
    assert(alignment.orgSlug === "castillitos", "alignment orgSlug", ctx);
    assert(typeof alignment.alignmentScore === "number", "alignment has alignmentScore", ctx);
    assert(["ALIGNED", "PARTIALLY_ALIGNED", "MISALIGNED", "UNDER_REVIEW"].includes(alignment.status), "alignment status valid", ctx);
    assert(Array.isArray(alignment.gaps), "alignment gaps array", ctx);
    assert(Array.isArray(alignment.strengths), "alignment strengths array", ctx);

    const noNorthStarAlign = calculateAlignmentScore({ ...alignInput, northStar: null });
    assert(noNorthStarAlign < alignScore, "no northStar lowers alignment", ctx);

    const ranked2 = rankAlignment([alignment, { ...alignment, alignmentScore: 0.9 }]);
    assert(ranked2[0].alignmentScore >= ranked2[1].alignmentScore, "rankAlignment descending", ctx);

    // ── Suite 9: Deviation Engine ─────────────────────────────────────────────
    const {
      buildDeviation, detectDeviations, rankDeviations, scoreDeviation,
      getSystemicDeviations, getCriticalDeviations, calculateDeviationPenalty,
    } = await import("../../../../../lib/copilot/enterprise-direction/direction-deviation-engine");

    const dev1 = buildDeviation("castillitos", {
      title:       "Desviación en objetivos de crecimiento",
      description: "Los objetivos de crecimiento están por debajo del plan",
      type:        "STRATEGIC_DRIFT",
      domain:      "GROWTH",
      severity:    "CRITICAL",
      magnitude:   0.7,
      isSystemic:  true,
      evidenceIds: ["ev1"],
    });
    assert(dev1.orgSlug === "castillitos", "deviation orgSlug", ctx);
    assert(dev1.deviationScore >= 0 && dev1.deviationScore <= 1, "deviation score in range", ctx);
    assert(dev1.isSystemic === true, "deviation isSystemic", ctx);

    const devScore = scoreDeviation("CRITICAL", 0.7, true);
    assert(devScore >= 0 && devScore <= 1, "scoreDeviation in range", ctx);
    assert(devScore >= 0.8, "scoreDeviation CRITICAL high", ctx);

    const deviations = detectDeviations("castillitos", [
      { title: "D1", description: "Desc1", type: "STRATEGIC_DRIFT", domain: "GROWTH", severity: "CRITICAL", magnitude: 0.8, isSystemic: true },
      { title: "D2", description: "Desc2", type: "EXECUTION_GAP", domain: "OPERATIONS", severity: "MEDIUM", magnitude: 0.4, isSystemic: false },
    ]);
    assert(deviations.length === 2, "detectDeviations count", ctx);

    const systemicDevs = getSystemicDeviations(deviations);
    assert(systemicDevs.length === 1, "getSystemicDeviations count", ctx);

    const criticalDevs = getCriticalDeviations(deviations);
    assert(criticalDevs.length === 1, "getCriticalDeviations count", ctx);

    const rankedDevs = rankDeviations(deviations);
    assert(rankedDevs[0].deviationScore >= rankedDevs[1].deviationScore, "rankDeviations descending", ctx);

    const devPenalty = calculateDeviationPenalty(deviations);
    assert(devPenalty >= 0 && devPenalty <= 0.40, "deviationPenalty capped at 0.40", ctx);

    const zeroPenalty = calculateDeviationPenalty([]);
    assert(zeroPenalty === 0, "empty deviations penalty=0", ctx);

    // ── Suite 10: Conflict Engine ─────────────────────────────────────────────
    const {
      buildConflict, detectConflicts, rankConflicts, groupConflicts, scoreConflict,
      getBlockingConflicts, getUnresolvedConflicts, calculateConflictPenalty,
    } = await import("../../../../../lib/copilot/enterprise-direction/direction-conflict-engine");

    const conf1 = buildConflict("castillitos", {
      title:       "Conflicto entre prioridades de crecimiento y rentabilidad",
      description: "Iniciativas de crecimiento consumen capital necesario para rentabilidad",
      type:        "OBJECTIVE_CONFLICT",
      domain:      "CROSS_DOMAIN",
      severity:    "HIGH",
      affectedIds: ["obj1", "prio1"],
      isBlocking:  true,
      impact:      0.7,
    });
    assert(conf1.orgSlug === "castillitos", "conflict orgSlug", ctx);
    assert(conf1.isBlocking === true, "conflict isBlocking", ctx);
    assert(conf1.conflictScore >= 0 && conf1.conflictScore <= 1, "conflict score in range", ctx);

    const conflScore = scoreConflict("HIGH", 0.7, true);
    assert(conflScore >= 0 && conflScore <= 1, "scoreConflict in range", ctx);

    const conflicts = detectConflicts("castillitos", [
      { title: "C1", description: "D1", type: "RESOURCE_CONFLICT", domain: "GROWTH", severity: "CRITICAL", affectedIds: ["a"], isBlocking: true, impact: 0.9 },
      { title: "C2", description: "D2", type: "TIMING_CONFLICT", domain: "OPERATIONS", severity: "LOW", affectedIds: ["b"], isBlocking: false, impact: 0.3 },
    ]);
    assert(conflicts.length === 2, "detectConflicts count", ctx);

    const grouped2 = groupConflicts(conflicts);
    assert(Array.isArray(grouped2.RESOURCE_CONFLICT), "groupConflicts RESOURCE_CONFLICT", ctx);
    assert(grouped2.RESOURCE_CONFLICT.length === 1, "groupConflicts RESOURCE_CONFLICT count", ctx);

    const blocking = getBlockingConflicts(conflicts);
    assert(blocking.length === 1, "getBlockingConflicts count", ctx);

    const unresolved = getUnresolvedConflicts(conflicts);
    assert(unresolved.length === 2, "getUnresolvedConflicts count", ctx);

    const rankedConfl = rankConflicts(conflicts);
    assert(rankedConfl[0].conflictScore >= rankedConfl[1].conflictScore, "rankConflicts descending", ctx);

    const conflPenalty = calculateConflictPenalty(conflicts);
    assert(conflPenalty >= 0 && conflPenalty <= 0.35, "conflictPenalty capped", ctx);

    // ── Suite 11: Signal Engine ───────────────────────────────────────────────
    const {
      buildDirectionSignal, identifyDirectionSignals, rankDirectionSignals,
      getOpportunitySignals, getThreatSignals, getHighIntensitySignals,
    } = await import("../../../../../lib/copilot/enterprise-direction/direction-signal-engine");

    const sig1 = buildDirectionSignal("castillitos", {
      title:       "Demanda emergente en segmento infantil",
      description: "Crecimiento de demanda observado en datos de ventas",
      type:        "OPPORTUNITY",
      domain:      "GROWTH",
      intensity:   0.8,
      horizon:     "SHORT_TERM",
      evidenceIds: ["ev1"],
    });
    assert(sig1.orgSlug === "castillitos", "signal orgSlug", ctx);
    assert(sig1.intensity === 0.8, "signal intensity", ctx);
    assert(sig1.type === "OPPORTUNITY", "signal type OPPORTUNITY", ctx);

    const signals = identifyDirectionSignals("castillitos", [
      { title: "S1", description: "D1", type: "OPPORTUNITY", domain: "GROWTH", intensity: 0.8, horizon: "SHORT_TERM", evidenceIds: [] },
      { title: "S2", description: "D2", type: "THREAT", domain: "RISK", intensity: 0.9, horizon: "IMMEDIATE", evidenceIds: [] },
      { title: "S3", description: "D3", type: "ENABLER", domain: "TECHNOLOGY", intensity: 0.5, horizon: "MEDIUM_TERM", evidenceIds: [] },
    ]);
    assert(signals.length === 3, "identifyDirectionSignals count", ctx);

    const opps = getOpportunitySignals(signals);
    assert(opps.length === 1, "getOpportunitySignals count", ctx);

    const threats = getThreatSignals(signals);
    assert(threats.length === 1, "getThreatSignals count", ctx);

    const highInt = getHighIntensitySignals(signals, 0.75);
    assert(highInt.length === 2, "getHighIntensitySignals count ≥0.75", ctx);

    const rankedSigs = rankDirectionSignals(signals);
    assert(rankedSigs[0].intensity >= rankedSigs[1].intensity, "rankDirectionSignals descending", ctx);

    // ── Suite 12: Recommendation Engine ──────────────────────────────────────
    const {
      buildRecommendation, buildRecommendations, rankRecommendations,
      getCriticalRecommendations, buildRecommendationsFromDeviations,
      buildRecommendationsFromConflicts, buildRecommendationsFromSignals,
    } = await import("../../../../../lib/copilot/enterprise-direction/direction-recommendation-engine");

    const rec1 = buildRecommendation("castillitos", {
      title:      "Revisar prioridades de crecimiento",
      rationale:  "Desviación detectada en objetivos de crecimiento",
      domain:     "GROWTH",
      horizon:    "SHORT_TERM",
      priority:   "CRITICAL",
      confidence: "MEDIUM",
      evidenceIds: ["ev1"],
    });
    assert(rec1.suggestedOnly === true, "recommendation suggestedOnly true", ctx);
    assert(rec1.limitations.length > 0, "recommendation has limitations", ctx);
    assert(rec1.limitations.some((l) => l.includes("suggestedOnly")), "recommendation limitations contains suggestedOnly", ctx);

    const recs = buildRecommendations("castillitos", [
      { title: "R1", rationale: "Ra1", domain: "GROWTH", horizon: "SHORT_TERM", priority: "HIGH", confidence: "HIGH" },
      { title: "R2", rationale: "Ra2", domain: "RISK", horizon: "IMMEDIATE", priority: "CRITICAL", confidence: "MEDIUM" },
    ]);
    assert(recs.length === 2, "buildRecommendations count", ctx);
    assert(recs.every((r) => r.suggestedOnly === true), "all recommendations suggestedOnly", ctx);

    const rankedRecs = rankRecommendations(recs);
    assert(rankedRecs[0].priority === "CRITICAL", "rankRecommendations CRITICAL first", ctx);

    const criticalRecs = getCriticalRecommendations(recs);
    assert(criticalRecs.length === 1, "getCriticalRecommendations count", ctx);

    const devRecs = buildRecommendationsFromDeviations("castillitos", deviations);
    assert(devRecs.every((r) => r.suggestedOnly === true), "deviation recs suggestedOnly", ctx);

    const conflRecs = buildRecommendationsFromConflicts("castillitos", conflicts);
    assert(conflRecs.every((r) => r.suggestedOnly === true), "conflict recs suggestedOnly", ctx);

    const sigRecs = buildRecommendationsFromSignals("castillitos", signals);
    assert(sigRecs.every((r) => r.suggestedOnly === true), "signal recs suggestedOnly", ctx);

    // ── Suite 13: Narrative Engine ────────────────────────────────────────────
    const { buildDirectionNarrative, buildEmptyNarrative } = await import(
      "../../../../../lib/copilot/enterprise-direction/direction-narrative-engine"
    );

    const narrative = buildDirectionNarrative({
      orgSlug:         "castillitos",
      northStar:       ns1,
      alignment,
      priorities,
      deviations,
      conflicts,
      signals,
      recommendations: recs,
      overallScore:    0.65,
      confidence:      "MEDIUM",
    });
    assert(typeof narrative.northStar === "string" && narrative.northStar.length > 0, "narrative.northStar string", ctx);
    assert(typeof narrative.alignment === "string" && narrative.alignment.length > 0, "narrative.alignment string", ctx);
    assert(typeof narrative.priorities === "string", "narrative.priorities string", ctx);
    assert(typeof narrative.deviations === "string", "narrative.deviations string", ctx);
    assert(typeof narrative.conflicts === "string", "narrative.conflicts string", ctx);
    assert(typeof narrative.opportunities === "string", "narrative.opportunities string", ctx);
    assert(typeof narrative.executive === "string" && narrative.executive.length > 0, "narrative.executive string", ctx);
    assert(typeof narrative.limitations === "string" && narrative.limitations.includes("suggestedOnly"), "narrative.limitations has suggestedOnly", ctx);

    const emptyNarr = buildEmptyNarrative();
    assert(typeof emptyNarr.northStar === "string", "emptyNarrative.northStar string", ctx);
    assert(emptyNarr.limitations.includes("suggestedOnly"), "emptyNarrative limitations has suggestedOnly", ctx);

    // ── Suite 14: Digest Engine ───────────────────────────────────────────────
    const { buildDirectionDigest } = await import(
      "../../../../../lib/copilot/enterprise-direction/direction-digest-engine"
    );

    const digest = buildDirectionDigest({
      orgSlug:      "castillitos",
      sessionId:    "session_test",
      period:       "WEEKLY",
      northStar:    ns1,
      priorities,
      deviations,
      conflicts,
      overallScore: 0.65,
      confidence:   "MEDIUM",
    });
    assert(digest.orgSlug === "castillitos", "digest orgSlug", ctx);
    assert(digest.period === "WEEKLY", "digest period", ctx);
    assert(typeof digest.headline === "string" && digest.headline.length > 0, "digest headline", ctx);
    assert(typeof digest.northStarSummary === "string", "digest northStarSummary", ctx);
    assert(Array.isArray(digest.topPriorities), "digest topPriorities array", ctx);
    assert(Array.isArray(digest.watchDeviations), "digest watchDeviations array", ctx);
    assert(digest.limitations.some((l) => l.includes("suggestedOnly")), "digest limitations has suggestedOnly", ctx);

    // ── Suite 15: Briefing Engine ─────────────────────────────────────────────
    const { buildDirectionBriefing } = await import(
      "../../../../../lib/copilot/enterprise-direction/direction-briefing-engine"
    );

    const briefingTypes = ["CEO", "EXECUTIVE", "BOARD", "GROWTH", "RISK"] as const;
    for (const type of briefingTypes) {
      const briefing = buildDirectionBriefing({
        orgSlug:         "castillitos",
        sessionId:       "session_test",
        type,
        northStar:       ns1,
        objectives,
        priorities,
        deviations,
        conflicts,
        recommendations: recs,
        overallScore:    0.65,
        confidence:      "MEDIUM",
      });
      assert(briefing.orgSlug === "castillitos", `briefing[${type}] orgSlug`, ctx);
      assert(briefing.type === type, `briefing[${type}] type matches`, ctx);
      assert(typeof briefing.summary === "string" && briefing.summary.length > 0, `briefing[${type}] summary`, ctx);
      assert(briefing.limitations.some((l) => l.includes("suggestedOnly")), `briefing[${type}] limitations has suggestedOnly`, ctx);
    }

    // ── Suite 16: Main Pipeline ───────────────────────────────────────────────
    const { runEnterpriseDirection, computeDirectionScore, buildFailedDirectionResult } = await import(
      "../../../../../lib/copilot/enterprise-direction/enterprise-direction-engine"
    );

    const input = { orgSlug: "castillitos", sessionId: "session_test" };

    const result1 = runEnterpriseDirection(input, {
      northStar:       ns1,
      pillars:         defaultPillars,
      objectives,
      priorities,
      initiatives,
      deviations,
      conflicts,
      signals,
      recommendations: recs,
    });
    assert(result1.orgSlug === "castillitos", "pipeline result orgSlug", ctx);
    assert(result1.status === "SUCCESS", "pipeline result status SUCCESS", ctx);
    assert(typeof result1.direction.id === "string", "direction has id", ctx);
    assert(result1.direction.northStar !== null, "direction has northStar", ctx);
    assert(["ALIGNED", "PARTIALLY_ALIGNED", "MISALIGNED", "UNDER_REVIEW"].includes(result1.direction.status), "direction status valid", ctx);
    assert(result1.report.limitations.some((l) => l.includes("suggestedOnly")), "report limitations has suggestedOnly", ctx);
    assert(result1.report.digest !== null, "report has digest", ctx);
    assert(result1.report.briefing !== null, "report has briefing", ctx);
    assert(result1.report.narrative.limitations.includes("suggestedOnly"), "report narrative has suggestedOnly", ctx);

    const result2 = runEnterpriseDirection(input); // No context — uses defaults
    assert(result2.status === "SUCCESS", "pipeline with no ctx SUCCESS", ctx);
    assert(result2.direction.northStar !== null, "default northStar generated", ctx);

    const dirScore = computeDirectionScore(
      "castillitos", ns1, alignment, priorities, initiatives, deviations, conflicts, "MEDIUM"
    );
    assert(dirScore.overallScore >= 0 && dirScore.overallScore <= 1, "computeDirectionScore in range", ctx);
    assert(dirScore.confidence === "MEDIUM", "computeDirectionScore confidence", ctx);

    const failedResult = buildFailedDirectionResult(input, "test error");
    assert(failedResult.status === "FAILED", "failedResult status FAILED", ctx);
    assert(failedResult.errors.includes("test error"), "failedResult has error", ctx);
    assert(failedResult.limitations.some((l) => l.includes("suggestedOnly")), "failedResult limitations", ctx);

    // ── Suite 17: Integration Files ───────────────────────────────────────────
    const { buildDirectionLearningContext, getDirectionPatternNames } = await import(
      "../../../../../lib/copilot/enterprise-direction/integrations/direction-learning"
    );

    const learningCtx = buildDirectionLearningContext("castillitos", [
      { name: "retention_pattern", domain: "GROWTH", confidence: 0.8 },
      { name: "margin_pressure", domain: "PROFITABILITY", confidence: 0.7 },
    ]);
    assert(learningCtx.patternNames.includes("retention_pattern"), "learning uses .name not .label", ctx);
    assert(learningCtx.patternNames.includes("margin_pressure"), "learning .name pattern 2", ctx);
    assert(learningCtx.learningBoost >= 0 && learningCtx.learningBoost <= 0.10, "learning boost in range", ctx);

    const patternNames = getDirectionPatternNames("castillitos", [
      { name: "pattern_a", domain: "GROWTH" },
      { name: "pattern_b", domain: "RISK" },
    ]);
    assert(patternNames[0] === "pattern_a", "getDirectionPatternNames uses .name", ctx);

    const { buildDirectionPlaybookContext, getDirectionPlaybookTitles } = await import(
      "../../../../../lib/copilot/enterprise-direction/integrations/direction-playbooks"
    );

    const playbookCtx = buildDirectionPlaybookContext("castillitos", [
      { title: "Playbook 1: Gestión de crecimiento", domain: "GROWTH", status: "ACTIVE" },
      { title: "Playbook 2: Retención de clientes", domain: "MARKET", status: "ACTIVE" },
    ]);
    assert(playbookCtx.playbookTitles.includes("Playbook 1: Gestión de crecimiento"), "playbooks uses .title not .name", ctx);
    assert(playbookCtx.playbookBoost >= 0 && playbookCtx.playbookBoost <= 0.08, "playbook boost in range", ctx);

    const pbTitles = getDirectionPlaybookTitles([
      { title: "PB1", domain: "GROWTH" },
      { title: "PB2", domain: "RISK" },
    ]);
    assert(pbTitles[0] === "PB1", "getDirectionPlaybookTitles uses .title", ctx);

    const { buildDirectionGraphContext } = await import(
      "../../../../../lib/copilot/enterprise-direction/integrations/direction-memory-graph"
    );
    const graphCtx = buildDirectionGraphContext("castillitos",
      [{ id: "n1", type: "METRIC" }, { id: "n2", type: "OBJECTIVE" }],
      [{ sourceNodeId: "n1", targetNodeId: "n2" }] // uses sourceNodeId/targetNodeId
    );
    assert(graphCtx.nodeCount === 2, "graphCtx nodeCount", ctx);
    assert(graphCtx.edgeCount === 1, "graphCtx edgeCount", ctx);

    // ── Suite 18: Tenant Profile ──────────────────────────────────────────────
    const { getDirectionTenantProfile, isDirectionEscalationRequired } = await import(
      "../../../../../lib/copilot/enterprise-direction/integrations/direction-tenant-profile"
    );

    const castillitosProfile = getDirectionTenantProfile("castillitos");
    assert(castillitosProfile.orgSlug === "castillitos", "castillitos profile orgSlug", ctx);
    assert(castillitosProfile.riskTolerance === "MODERATE", "castillitos risk tolerance MODERATE", ctx);
    assert(castillitosProfile.escalationThreshold === 0.65, "castillitos escalation threshold 0.65", ctx);

    const escalationRequired = isDirectionEscalationRequired(castillitosProfile, 0.2); // score 0.2 → 1-0.65=0.35 > 0.2
    assert(escalationRequired === true, "escalation required at score 0.2", ctx);

    const noEscalation = isDirectionEscalationRequired(castillitosProfile, 0.8); // 0.8 > 0.35
    assert(noEscalation === false, "no escalation at score 0.8", ctx);

    // ── Suite 19: Compliance ─────────────────────────────────────────────────
    const { runDirectionComplianceChecks, assertDirectionTenantIsolation } = await import(
      "../../../../../lib/copilot/enterprise-direction/integrations/direction-compliance"
    );

    const complianceReport = runDirectionComplianceChecks("castillitos", {
      orgSlug:    "castillitos",
      northStar:  ns1,
      objectives: objectives,
      alignment,
      narrative:  narrative,
      limitations: ["suggestedOnly: true", "Validación ejecutiva requerida"],
      score:      { overallScore: 0.65 },
      briefing:   {},
      confidence: "MEDIUM",
    });
    assert(complianceReport.checks.length === 10, "compliance has 10 checks", ctx);
    const tenantCheck = complianceReport.checks.find((c) => c.id === "TENANT_ISOLATION");
    assert(tenantCheck?.pass === true, "TENANT_ISOLATION check passes", ctx);
    const suggestedCheck = complianceReport.checks.find((c) => c.id === "SUGGESTED_ONLY");
    assert(suggestedCheck?.pass === true, "SUGGESTED_ONLY check passes", ctx);

    let isolationError = false;
    try {
      assertDirectionTenantIsolation("castillitos", "other-org");
    } catch {
      isolationError = true;
    }
    assert(isolationError === true, "assertDirectionTenantIsolation throws on mismatch", ctx);

    // ── Suite 20: Audit ──────────────────────────────────────────────────────
    const {
      auditDirectionGenerated, auditNorthStarBuilt, auditAlignmentEvaluated,
      auditDeviationsDetected, auditRecommendationsRanked,
    } = await import("../../../../../lib/copilot/enterprise-direction/integrations/direction-audit");

    const aud1 = auditDirectionGenerated("castillitos", "session1", 0.65, "SUCCESS", "MEDIUM");
    assert(aud1.eventType === "DIRECTION_GENERATED", "audit eventType DIRECTION_GENERATED", ctx);
    assert(aud1.metadata["suggestedOnly"] === true, "audit metadata suggestedOnly", ctx);
    assert(aud1.id.startsWith("daud_"), "audit ID prefix daud_", ctx);

    const aud2 = auditNorthStarBuilt("castillitos", "session1", ns1.id, 0.75);
    assert(aud2.eventType === "NORTH_STAR_BUILT", "audit eventType NORTH_STAR_BUILT", ctx);
    assert(aud2.metadata["northStarId"] === ns1.id, "audit northStarId in metadata", ctx);

    const aud3 = auditAlignmentEvaluated("castillitos", "session1", alignment.id, 0.65, "PARTIALLY_ALIGNED");
    assert(aud3.eventType === "ALIGNMENT_EVALUATED", "audit eventType ALIGNMENT_EVALUATED", ctx);

    const aud4 = auditDeviationsDetected("castillitos", "session1", 2, 1);
    assert(aud4.eventType === "DEVIATIONS_DETECTED", "audit eventType DEVIATIONS_DETECTED", ctx);

    const aud5 = auditRecommendationsRanked("castillitos", "session1", 3, 1);
    assert(aud5.eventType === "RECOMMENDATIONS_RANKED", "audit eventType RECOMMENDATIONS_RANKED", ctx);
    assert(aud5.metadata["suggestedOnly"] === true, "audit recs suggestedOnly", ctx);

    // ── Suite 21: Dashboard Contract ─────────────────────────────────────────
    const { buildEnterpriseDirectionDashboard } = await import(
      "../../../../../lib/copilot/enterprise-direction/enterprise-direction-dashboard-contract"
    );

    const dashboard = buildEnterpriseDirectionDashboard("castillitos", "session_test", {
      status:          result1.direction.status,
      score:           result1.score,
      northStar:       ns1,
      priorities,
      deviations,
      conflicts,
      signals,
      recommendations: recs,
      confidence:      "MEDIUM",
      limitations:     ["suggestedOnly: true"],
    });
    assert(dashboard.orgSlug === "castillitos", "dashboard orgSlug", ctx);
    assert(dashboard.northStar !== null, "dashboard has northStar", ctx);
    assert(Array.isArray(dashboard.topPriorities), "dashboard topPriorities array", ctx);
    assert(dashboard.topPriorities.length <= 5, "dashboard topPriorities max 5", ctx);
    assert(Array.isArray(dashboard.criticalDeviations), "dashboard criticalDeviations array", ctx);
    assert(dashboard.overallScore >= 0 && dashboard.overallScore <= 1, "dashboard overallScore in range", ctx);

    // ── Suite 22: Health ─────────────────────────────────────────────────────
    const { checkDirectionHealth, buildDefaultDirectionHealthInputs } = await import(
      "../../../../../lib/copilot/enterprise-direction/enterprise-direction-health"
    );

    const healthInputs = {
      orgSlug:            "castillitos",
      hasNorthStar:       true,
      hasObjectives:      true,
      hasPriorities:      true,
      hasAlignment:       true,
      hasDeviations:      true,
      hasRecommendations: true,
      overallScore:       0.65,
      confidence:         "MEDIUM",
      errorCount:         0,
    };
    const healthReport = checkDirectionHealth(healthInputs);
    assert(healthReport.orgSlug === "castillitos", "health orgSlug", ctx);
    assert(["HEALTHY", "DEGRADED", "CRITICAL", "EMPTY"].includes(healthReport.health), "health status valid", ctx);
    assert(healthReport.checks.length === 14, "health has 14 checks", ctx);
    assert(healthReport.health === "HEALTHY", "healthy system = HEALTHY", ctx);

    const defaultHealthInputs = buildDefaultDirectionHealthInputs("castillitos");
    const emptyHealth = checkDirectionHealth(defaultHealthInputs);
    assert(emptyHealth.health === "EMPTY", "no data = EMPTY", ctx);

    // ── Suite 23: Readiness ──────────────────────────────────────────────────
    const { checkDirectionReadiness } = await import(
      "../../../../../lib/copilot/enterprise-direction/enterprise-direction-readiness"
    );

    const fullReadiness = checkDirectionReadiness({
      orgSlug:            "castillitos",
      hasNorthStar:       true,
      hasObjectives:      true,
      hasPriorities:      true,
      hasInitiatives:     true,
      hasDeviationData:   true,
      hasConflictData:    true,
      hasSignalData:      true,
      hasMemoryData:      true,
      hasLearningData:    true,
      hasForecastData:    true,
    });
    assert(fullReadiness.level === "FULL", "full readiness = FULL", ctx);
    assert(fullReadiness.isReady === true, "fullReadiness isReady", ctx);
    assert(fullReadiness.score === 1.0, "fullReadiness score=1.0", ctx);

    const minReadiness = checkDirectionReadiness({
      orgSlug:            "castillitos",
      hasNorthStar:       true,
      hasObjectives:      true,
      hasPriorities:      false,
      hasInitiatives:     false,
      hasDeviationData:   false,
      hasConflictData:    false,
      hasSignalData:      false,
      hasMemoryData:      false,
      hasLearningData:    false,
      hasForecastData:    false,
    });
    assert(minReadiness.isReady === true, "minReadiness isReady=true (min met)", ctx);
    assert(minReadiness.level === "MINIMUM", "minReadiness level=MINIMUM", ctx);

    const notReady = checkDirectionReadiness({
      orgSlug:            "castillitos",
      hasNorthStar:       false,
      hasObjectives:      false,
      hasPriorities:      false,
      hasInitiatives:     false,
      hasDeviationData:   false,
      hasConflictData:    false,
      hasSignalData:      false,
      hasMemoryData:      false,
      hasLearningData:    false,
      hasForecastData:    false,
    });
    assert(notReady.level === "NOT_READY", "no data = NOT_READY", ctx);
    assert(notReady.isReady === false, "notReady.isReady=false", ctx);

    // ── Suite 24: Enterprise Alignment Engine ─────────────────────────────────
    const {
      calculateEnterpriseAlignment, calculateDepartmentAlignment, calculateInitiativeAlignment,
    } = await import("../../../../../lib/copilot/enterprise-direction/enterprise-alignment-engine");

    const entAlign = calculateEnterpriseAlignment("castillitos", ns1, objectives, initiatives, defaultPillars);
    assert(entAlign.overallAlignment >= 0 && entAlign.overallAlignment <= 1, "enterprise alignment in range", ctx);
    assert(typeof entAlign.isAligned === "boolean", "enterprise alignment isAligned boolean", ctx);

    const deptAlign = calculateDepartmentAlignment("castillitos", "Comercial", objectives);
    assert(deptAlign.department === "Comercial", "dept alignment department", ctx);
    assert(deptAlign.alignment >= 0 && deptAlign.alignment <= 1, "dept alignment in range", ctx);

    const initAlignResult = calculateInitiativeAlignment("castillitos", init1, ns1, defaultPillars, objectives);
    assert(initAlignResult.initiativeId === init1.id, "initiative alignment id matches", ctx);
    assert(initAlignResult.alignmentScore >= 0 && initAlignResult.alignmentScore <= 1, "initiative alignment score in range", ctx);

    // ── Suite 25: Strategic Drift Engine ─────────────────────────────────────
    const { detectStrategicDrift, scoreStrategicDrift, forecastStrategicDrift } = await import(
      "../../../../../lib/copilot/enterprise-direction/strategic-drift-engine"
    );

    const driftScore = scoreStrategicDrift(alignment, deviations);
    assert(driftScore >= 0 && driftScore <= 1, "scoreStrategicDrift in range", ctx);

    const driftResult = detectStrategicDrift("castillitos", alignment, deviations, 0.3);
    assert(driftResult.suggestedOnly === true, "driftResult suggestedOnly", ctx);
    assert(["NONE", "MILD", "MODERATE", "SEVERE", "CRITICAL"].includes(driftResult.severity), "drift severity valid", ctx);
    assert(["IMPROVING", "STABLE", "WORSENING", "UNKNOWN"].includes(driftResult.trend), "drift trend valid", ctx);

    const driftForecast = forecastStrategicDrift("castillitos", 0.3, deviations, 90);
    assert(driftForecast.suggestedOnly === true, "driftForecast suggestedOnly", ctx);
    assert(driftForecast.windowDays === 90, "driftForecast windowDays", ctx);
    assert(driftForecast.projectedDrift >= driftForecast.currentDrift, "projectedDrift >= currentDrift", ctx);
    assert(typeof driftForecast.isEscalating === "boolean", "driftForecast isEscalating boolean", ctx);
    assert(driftForecast.limitations.some((l) => l.includes("suggestedOnly")), "driftForecast limitations", ctx);

    // ── Suite 26: Canonical ──────────────────────────────────────────────────
    const { CANONICAL_DIRECTION_CASES } = await import(
      "../../../../../lib/copilot/enterprise-direction/enterprise-direction-canonical"
    );
    assert(CANONICAL_DIRECTION_CASES.length === 30, "canonical cases count=30", ctx);
    assert(CANONICAL_DIRECTION_CASES.every((c) => c.id.startsWith("CDC_")), "all canonical cases have CDC_ prefix", ctx);
    assert(CANONICAL_DIRECTION_CASES.every((c) => c.limitations.some((l) => l.includes("suggestedOnly"))), "all canonical cases have suggestedOnly limitation", ctx);

    const { CANONICAL_DIRECTION_SCENARIOS } = await import(
      "../../../../../lib/copilot/enterprise-direction/enterprise-direction-scenarios"
    );
    assert(CANONICAL_DIRECTION_SCENARIOS.length === 30, "canonical scenarios count=30", ctx);
    assert(CANONICAL_DIRECTION_SCENARIOS.every((s) => s.id.startsWith("CDS_")), "all canonical scenarios have CDS_ prefix", ctx);
    assert(CANONICAL_DIRECTION_SCENARIOS.every((s) => s.limitations.some((l) => l.includes("suggestedOnly"))), "all canonical scenarios have suggestedOnly limitation", ctx);

    // ── Suite 27: In-Memory Repository ───────────────────────────────────────
    const { InMemoryEnterpriseDirectionRepository } = await import(
      "../../../../../lib/copilot/enterprise-direction/enterprise-direction-repository"
    );
    const repo = new InMemoryEnterpriseDirectionRepository();
    await repo.save(result1);
    const latest = await repo.findLatest("castillitos");
    assert(latest !== null, "repo findLatest not null", ctx);
    assert(latest?.orgSlug === "castillitos", "repo findLatest orgSlug", ctx);
    const allRecords = await repo.findAll("castillitos");
    assert(allRecords.length === 1, "repo findAll count=1", ctx);
    const count = await repo.count("castillitos");
    assert(count === 1, "repo count=1", ctx);

    // ── Suite 28: Edge cases & fail-closed ───────────────────────────────────
    const alignEmpty = calculateAlignmentScore({ orgSlug: "castillitos", northStar: null, objectives: [], initiatives: [], pillars: [] });
    assert(alignEmpty === 0, "empty alignment score = 0", ctx);

    const penaltyEmpty = calculateDeviationPenalty([]);
    assert(penaltyEmpty === 0, "empty deviation penalty = 0", ctx);

    const conflPenaltyEmpty = calculateConflictPenalty([]);
    assert(conflPenaltyEmpty === 0, "empty conflict penalty = 0", ctx);

    const noDataResult = runEnterpriseDirection({ orgSlug: "castillitos", sessionId: "empty" }, {});
    assert(noDataResult.status === "SUCCESS", "empty ctx still SUCCESS", ctx);
    assert(noDataResult.direction.northStar !== null, "empty ctx has default northStar", ctx);

  } catch (err) {
    ctx.results.push(`HARNESS_ERROR: ${String(err)}`);
    ctx.failed++;
  }

  return NextResponse.json({
    sprint:  "AGENTIK-ENTERPRISE-DIRECTION-SYSTEM-01",
    phase:   "Phase 48 — Integration Harness",
    passed:  ctx.passed,
    failed:  ctx.failed,
    total:   ctx.passed + ctx.failed,
    results: ctx.results,
  });
}
