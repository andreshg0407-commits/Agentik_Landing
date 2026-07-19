// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 7 — Executive Opportunity Engine
// Detects ignored opportunities, repeated strengths, competitive advantages, growth potential

import type { StrategicMemoryEntry } from "../strategic-memory/strategic-memory-types";
import type { LearningPattern } from "../learning/learning-types";
import type {
  ExecutiveOpportunity,
  ExecutiveDomain,
  ExecutiveOpportunityMagnitude,
} from "./executive-brain-types";
import {
  generateEbv2Id,
  confidenceFromScore,
  opportunityMagnitudeFromScore,
} from "./executive-brain-types";

// ── Opportunity Engine API ────────────────────────────────────────────────────

export interface OpportunityEngineInput {
  readonly orgSlug: string;
  readonly strategicEntries: StrategicMemoryEntry[];
  readonly confirmedPatterns: LearningPattern[];
}

export function detectExecutiveOpportunities(
  input: OpportunityEngineInput
): ExecutiveOpportunity[] {
  const { orgSlug } = input;
  const opportunities: ExecutiveOpportunity[] = [];

  opportunities.push(..._fromStrategicMemory(orgSlug, input.strategicEntries));
  opportunities.push(..._fromIgnoredOpportunities(orgSlug, input.strategicEntries));
  opportunities.push(..._fromRepeatedStrengths(orgSlug, input.confirmedPatterns));
  opportunities.push(..._fromGrowthPotential(orgSlug, input.strategicEntries));

  return _deduplicate(opportunities).sort((a, b) => b.captureScore - a.captureScore);
}

export function findIgnoredOpportunities(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): ExecutiveOpportunity[] {
  return _fromIgnoredOpportunities(orgSlug, entries);
}

export function findRepeatedStrengths(
  orgSlug: string,
  patterns: LearningPattern[]
): ExecutiveOpportunity[] {
  return _fromRepeatedStrengths(orgSlug, patterns);
}

export function findGrowthPotential(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): ExecutiveOpportunity[] {
  return _fromGrowthPotential(orgSlug, entries);
}

// ── Private detectors ─────────────────────────────────────────────────────────

function _fromStrategicMemory(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): ExecutiveOpportunity[] {
  return entries
    .filter(
      (e) =>
        e.orgSlug === orgSlug &&
        e.status === "ACTIVE" &&
        e.type === "OPPORTUNITY" &&
        e.strategicScore >= 0.35
    )
    .map((e) => ({
      id: generateEbv2Id("opp"),
      orgSlug,
      title: e.title,
      description: e.description,
      domain: e.domain as ExecutiveDomain,
      magnitude: opportunityMagnitudeFromScore(e.strategicScore),
      confidence: confidenceFromScore(e.confidenceScore),
      confidenceScore: e.confidenceScore,
      captureScore: Math.round((e.confidenceScore * 0.5 + e.strategicScore * 0.5) * 100) / 100,
      rationale: e.rationale,
      evidenceIds: e.evidenceIds,
      metadata: { source: "STRATEGIC_MEMORY", entryId: e.id },
    }));
}

function _fromIgnoredOpportunities(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): ExecutiveOpportunity[] {
  // Opportunities that have ASSUMPTION entries without corresponding GOAL
  const opportunityEntries = entries.filter(
    (e) => e.orgSlug === orgSlug && e.type === "OPPORTUNITY" && e.status === "ACTIVE"
  );
  const goalTitles = new Set(
    entries
      .filter((e) => e.orgSlug === orgSlug && e.type === "GOAL" && e.status === "ACTIVE")
      .map((e) => e.domain)
  );

  return opportunityEntries
    .filter((opp) => !goalTitles.has(opp.domain))
    .map((opp) => ({
      id: generateEbv2Id("opp"),
      orgSlug,
      title: `Oportunidad sin objetivo asociado: ${opp.title}`,
      description: `Esta oportunidad en ${opp.domain} no tiene un objetivo estratégico alineado. Podría estar siendo ignorada.`,
      domain: opp.domain as ExecutiveDomain,
      magnitude: "MEDIUM" as ExecutiveOpportunityMagnitude,
      confidence: confidenceFromScore(opp.confidenceScore * 0.7),
      confidenceScore: opp.confidenceScore * 0.7,
      captureScore: 0.4,
      rationale: "Oportunidad detectada sin objetivo estratégico correspondiente",
      evidenceIds: opp.evidenceIds,
      metadata: { source: "GAP_ANALYSIS", entryId: opp.id },
    }));
}

function _fromRepeatedStrengths(
  orgSlug: string,
  patterns: LearningPattern[]
): ExecutiveOpportunity[] {
  return patterns
    .filter(
      (p) =>
        p.orgSlug === orgSlug &&
        p.status === "REINFORCED" &&
        p.reinforcementCount >= 3 &&
        p.confidenceScore >= 0.6
    )
    .map((p) => ({
      id: generateEbv2Id("opp"),
      orgSlug,
      title: `Fortaleza repetida: ${p.name}`,
      description: `El patrón '${p.name}' se ha reforzado ${p.reinforcementCount} veces. Representa una ventaja competitiva potencial.`,
      domain: _mapLearningDomain(p.domain),
      magnitude: p.reinforcementCount >= 7 ? "LARGE" as ExecutiveOpportunityMagnitude : "MEDIUM" as ExecutiveOpportunityMagnitude,
      confidence: confidenceFromScore(p.confidenceScore),
      confidenceScore: p.confidenceScore,
      captureScore: Math.round(Math.min(p.reinforcementCount / 10, 1) * p.confidenceScore * 100) / 100,
      rationale: `Patrón reforzado sistemáticamente — fortaleza organizacional confirmada`,
      evidenceIds: p.evidenceEventIds,
      metadata: { source: "LEARNING_PATTERN", patternId: p.id, reinforcements: p.reinforcementCount },
    }));
}

function _fromGrowthPotential(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): ExecutiveOpportunity[] {
  // Lessons + insights that suggest positive potential
  const growthEntries = entries.filter(
    (e) =>
      e.orgSlug === orgSlug &&
      e.status === "ACTIVE" &&
      (e.type === "LESSON" || e.type === "INSIGHT") &&
      e.strategicScore >= 0.5 &&
      e.priority !== "LOW"
  );

  return growthEntries.slice(0, 3).map((e) => ({
    id: generateEbv2Id("opp"),
    orgSlug,
    title: `Potencial de crecimiento: ${e.title}`,
    description: e.description,
    domain: e.domain as ExecutiveDomain,
    magnitude: "MEDIUM" as ExecutiveOpportunityMagnitude,
    confidence: confidenceFromScore(e.confidenceScore * 0.8),
    confidenceScore: e.confidenceScore * 0.8,
    captureScore: Math.round(e.strategicScore * 0.7 * 100) / 100,
    rationale: `Basado en ${e.type === "LESSON" ? "aprendizaje" : "insight"} confirmado: ${e.rationale}`,
    evidenceIds: e.evidenceIds,
    metadata: { source: "GROWTH_ANALYSIS", entryId: e.id, entryType: e.type },
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _mapLearningDomain(domain: string): ExecutiveDomain {
  const map: Record<string, ExecutiveDomain> = {
    FINANCE: "FINANCE", COMMERCIAL: "COMMERCIAL", MARKETING: "MARKETING",
    OPERATIONS: "OPERATIONS", EXECUTIVE: "EXECUTIVE", COMPLIANCE: "COMPLIANCE",
    MEMORY: "CROSS_DOMAIN", CROSS_MODULE: "CROSS_DOMAIN",
  };
  return map[domain] ?? "CROSS_DOMAIN";
}

function _deduplicate(opps: ExecutiveOpportunity[]): ExecutiveOpportunity[] {
  const seen = new Set<string>();
  return opps.filter((o) => {
    if (seen.has(o.title)) return false;
    seen.add(o.title);
    return true;
  });
}
