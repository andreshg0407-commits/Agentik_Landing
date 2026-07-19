/**
 * reasoning-utils.ts
 *
 * BUSINESS-REASONING-FOUNDATION-01
 * Utility functions for the Business Reasoning Engine.
 *
 * No Prisma. No React. No AI. Pure domain helpers.
 */

import type { ReasoningSeverity, EntityRef } from "./reasoning-types";
import type { Observation } from "./observation";
import type { Finding } from "./finding";
import type { Insight } from "./insight";
import type { Risk } from "./risk";
import type { Opportunity } from "./opportunity";
import type { Recommendation } from "./recommendation";
import type { ReasoningChain } from "./reasoning-chain";
import type { ReasoningContext } from "./reasoning-context";

// -- Severity Ordering -----------------------------------------------------

const SEVERITY_ORDER: Record<ReasoningSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/** Sort any array with a severity field (most severe first). */
export function sortBySeverity<T extends { severity: ReasoningSeverity }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

// -- Filtering -------------------------------------------------------------

/** Filter observations that are anomalies. */
export function anomalousObservations(observations: Observation[]): Observation[] {
  return observations.filter(o => o.isAnomaly);
}

/** Filter findings by minimum severity. */
export function findingsAboveSeverity(
  findings: Finding[],
  minSeverity: ReasoningSeverity,
): Finding[] {
  const threshold = SEVERITY_ORDER[minSeverity];
  return findings.filter(f => SEVERITY_ORDER[f.severity] <= threshold);
}

/** Filter risks by minimum probability. */
export function risksAboveProbability(
  risks: Risk[],
  minProbability: number,
): Risk[] {
  return risks.filter(r => r.probability >= minProbability);
}

/** Filter opportunities by minimum estimated value. */
export function highValueOpportunities(
  opportunities: Opportunity[],
  minValue: number,
): Opportunity[] {
  return opportunities.filter(o => (o.estimatedValue ?? 0) >= minValue);
}

// -- Entity Extraction -----------------------------------------------------

/** Extract all unique entity refs from a reasoning context. */
export function extractEntities(ctx: ReasoningContext): EntityRef[] {
  const seen = new Set<string>();
  const result: EntityRef[] = [];

  const add = (ref: EntityRef) => {
    const key = `${ref.entityType}:${ref.entityId}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(ref);
    }
  };

  add(ctx.primaryEntity);
  for (const obs of ctx.observations) add(obs.entity);
  for (const fnd of ctx.findings) {
    add(fnd.primaryEntity);
    fnd.affectedEntities.forEach(add);
  }
  for (const ins of ctx.insights) {
    add(ins.primaryEntity);
    ins.affectedEntities.forEach(add);
  }
  for (const rsk of ctx.risks) {
    add(rsk.primaryEntity);
    rsk.affectedEntities.forEach(add);
  }
  for (const opp of ctx.opportunities) {
    add(opp.primaryEntity);
    opp.affectedEntities.forEach(add);
  }

  return result;
}

// -- Narrative Helpers -----------------------------------------------------

/** Build a plain-text summary of a reasoning chain for logging/debugging. */
export function chainSummary(chain: ReasoningChain): string {
  const lines: string[] = [
    `[${chain.severity.toUpperCase()}] ${chain.title}`,
    `Confianza: ${chain.confidence.score}% (${chain.confidence.level})`,
    `Pasos: ${chain.steps.length}`,
  ];

  for (const step of chain.steps) {
    const indent = "  ".repeat(Math.min(step.order, 5));
    lines.push(`${indent}${step.order}. [${step.type}] ${step.summary} (${step.confidence}%)`);
  }

  if (chain.recommendations.length > 0) {
    lines.push(`Recomendaciones:`);
    for (const rec of chain.recommendations) {
      lines.push(`  - ${rec.title}`);
    }
  }

  return lines.join("\n");
}

/** Build a one-line summary of a reasoning context. */
export function contextOneLiner(ctx: ReasoningContext): string {
  const parts: string[] = [];
  if (ctx.risks.length > 0) parts.push(`${ctx.risks.length} riesgo(s)`);
  if (ctx.opportunities.length > 0) parts.push(`${ctx.opportunities.length} oportunidad(es)`);
  if (ctx.recommendations.length > 0) parts.push(`${ctx.recommendations.length} recomendacion(es)`);
  if (parts.length === 0) parts.push("sin hallazgos");
  return `${ctx.primaryEntity.label}: ${parts.join(", ")} | confianza ${ctx.confidence.score}%`;
}
