// AGENTIK-STRATEGIC-ADVISOR-01
// Phase 4 — Strategic Opportunity Engine

import type { StrategicAdvisorContext } from "./strategic-context-builder";
import type { StrategicOpportunityAssessment, StrategicDomain } from "./strategic-advisor-types";
import { generateSaId, confidenceSaFromScore } from "./strategic-advisor-types";

// ── Main exports ──────────────────────────────────────────────────────────────

export function identifyOpportunities(ctx: StrategicAdvisorContext): StrategicOpportunityAssessment[] {
  const opps: StrategicOpportunityAssessment[] = [];

  // From strategic memory active opportunities
  for (const entry of ctx.activeOpportunities) {
    const captureScore = Math.round((entry.confidenceScore * 0.5 + entry.strategicScore * 0.5) * 100) / 100;
    const isIgnored = !ctx.activeGoals.some((g) => g.domain === entry.domain);
    opps.push({
      id:             generateSaId("opp"),
      orgSlug:        ctx.orgSlug,
      title:          entry.title,
      description:    entry.description,
      domain:         entry.domain as StrategicDomain,
      magnitude:      entry.strategicScore >= 0.8 ? "LARGE" : entry.strategicScore >= 0.5 ? "MEDIUM" : "SMALL",
      confidence:     confidenceSaFromScore(entry.confidenceScore),
      confidenceScore: entry.confidenceScore,
      captureScore,
      timeHorizon:    "SHORT_TERM",
      isIgnored,
      rationale:      entry.rationale,
      evidenceIds:    entry.evidenceIds,
      metadata:       { source: "STRATEGIC_MEMORY", entryId: entry.id },
    });
  }

  // From confirmed learning patterns (reinforcementCount >= 3 = strength)
  for (const pattern of ctx.confirmedPatterns.filter((p) => p.reinforcementCount >= 3)) {
    if (opps.some((o) => o.title.includes(pattern.name))) continue;
    const captureScore = Math.round(pattern.confidenceScore * 0.7 * 100) / 100;
    opps.push({
      id:             generateSaId("opp"),
      orgSlug:        ctx.orgSlug,
      title:          `Fortaleza repetida: ${pattern.name}`,
      description:    pattern.description,
      domain:         _mapPatternDomain(pattern.domain),
      magnitude:      pattern.netScore >= 5 ? "LARGE" : "MEDIUM",
      confidence:     confidenceSaFromScore(pattern.confidenceScore),
      confidenceScore: pattern.confidenceScore,
      captureScore,
      timeHorizon:    "MEDIUM_TERM",
      isIgnored:      false,
      rationale:      `Patrón confirmado con ${pattern.reinforcementCount} refuerzos — fortaleza competitiva potencial`,
      evidenceIds:    pattern.evidenceEventIds,
      metadata:       { source: "LEARNING_FRAMEWORK", patternId: pattern.id },
    });
  }

  // From metric rises (positive signals)
  for (const sig of ctx.metricRiseSignals) {
    const captureScore = Math.round(sig.confidence * 0.6 * 100) / 100;
    opps.push({
      id:             generateSaId("opp"),
      orgSlug:        ctx.orgSlug,
      title:          `Tendencia positiva: ${sig.label}`,
      description:    sig.description,
      domain:         _mapSignalDomain(sig.domain),
      magnitude:      "MEDIUM",
      confidence:     confidenceSaFromScore(sig.confidence),
      confidenceScore: sig.confidence,
      captureScore,
      timeHorizon:    "IMMEDIATE",
      isIgnored:      false,
      rationale:      `Señal positiva cross-módulo: ${sig.type}`,
      evidenceIds:    [sig.id],
      metadata:       { source: "REASONING_SIGNAL", signalId: sig.id },
    });
  }

  // From executive brain opportunities (if available)
  for (const exOpp of ctx.executiveFocusAreas.filter((f) => f.impactScore > 0.65)) {
    if (opps.some((o) => o.title === exOpp.title)) continue;
    opps.push({
      id:             generateSaId("opp"),
      orgSlug:        ctx.orgSlug,
      title:          exOpp.title,
      description:    exOpp.rationale,
      domain:         exOpp.domain as StrategicDomain,
      magnitude:      exOpp.impactScore >= 0.85 ? "LARGE" : "MEDIUM",
      confidence:     confidenceSaFromScore(exOpp.compositeScore),
      confidenceScore: exOpp.compositeScore,
      captureScore:   Math.round(exOpp.compositeScore * 0.8 * 100) / 100,
      timeHorizon:    "SHORT_TERM",
      isIgnored:      false,
      rationale:      exOpp.rationale,
      evidenceIds:    exOpp.evidenceIds,
      metadata:       { source: "EXECUTIVE_BRAIN", focusAreaId: exOpp.id },
    });
  }

  return rankOpportunities(opps);
}

export function rankOpportunities(opps: StrategicOpportunityAssessment[]): StrategicOpportunityAssessment[] {
  return [...opps].sort((a, b) => b.captureScore - a.captureScore);
}

// ── Private domain mappers ─────────────────────────────────────────────────────

function _mapPatternDomain(domain: string): StrategicDomain {
  const map: Record<string, StrategicDomain> = {
    FINANCE: "FINANCE", COMMERCIAL: "COMMERCIAL", MARKETING: "MARKETING",
    OPERATIONS: "OPERATIONS", EXECUTIVE: "EXECUTIVE", COMPLIANCE: "COMPLIANCE",
    MEMORY: "CROSS_DOMAIN", CROSS_MODULE: "CROSS_DOMAIN",
  };
  return map[domain] ?? "CROSS_DOMAIN";
}

function _mapSignalDomain(domain: string): StrategicDomain {
  const map: Record<string, StrategicDomain> = {
    FINANCE: "FINANCE", COMMERCIAL: "COMMERCIAL", MARKETING: "MARKETING",
    OPERATIONS: "OPERATIONS", COMPLIANCE: "COMPLIANCE", TECHNOLOGY: "TECHNOLOGY",
    COLLECTIONS: "FINANCE", MEMORY: "CROSS_DOMAIN", GRAPH: "CROSS_DOMAIN",
  };
  return map[domain] ?? "CROSS_DOMAIN";
}
