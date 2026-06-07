/**
 * lib/copilot/cross-module-reasoning/contradiction-engine.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Contradiction Engine
 *
 * Detects incompatible signals, conflicting hypotheses, and
 * contradictory explanations. Deterministic. No AI.
 */

import type {
  ReasoningSignal,
  ReasoningHypothesis,
  ContradictionRecord,
  ContradictionSeverity,
} from "./cross-module-types";
import { generateCmrId } from "./cross-module-types";

// ── Signal contradiction detection ────────────────────────────────────────────

export function detectSignalContradictions(
  orgSlug: string,
  signals: ReasoningSignal[],
): ContradictionRecord[] {
  const scoped = signals.filter(s => s.orgSlug === orgSlug);
  const records: ContradictionRecord[] = [];

  for (let i = 0; i < scoped.length; i++) {
    for (let j = i + 1; j < scoped.length; j++) {
      const a = scoped[i];
      const b = scoped[j];

      const record = _checkSignalContradiction(orgSlug, a, b);
      if (record) records.push(record);
    }
  }

  return records;
}

function _checkSignalContradiction(
  orgSlug: string,
  a: ReasoningSignal,
  b: ReasoningSignal,
): ContradictionRecord | null {
  // Same domain, opposite directions = contradiction
  if (
    a.domain === b.domain &&
    a.direction && b.direction &&
    a.direction !== b.direction &&
    a.direction !== "STABLE" && b.direction !== "STABLE" &&
    a.direction !== "VOLATILE" && b.direction !== "VOLATILE"
  ) {
    const severity: ContradictionSeverity =
      (a.severity === "CRITICAL" || b.severity === "CRITICAL") ? "SEVERE" :
      (a.severity === "HIGH"     || b.severity === "HIGH")     ? "MODERATE" :
      "MINOR";

    return {
      id:         generateCmrId("ctr"),
      orgSlug,
      entityA:    a.id,
      entityB:    b.id,
      entityType: "SIGNAL",
      severity,
      explanation: `Signal "${a.label}" (${a.direction}) contradicts "${b.label}" (${b.direction}) in domain ${a.domain}.`,
      resolution:  _resolveByWeight(a, b),
      detectedAt:  new Date().toISOString(),
    };
  }

  return null;
}

function _resolveByWeight(
  a: ReasoningSignal,
  b: ReasoningSignal,
): ContradictionRecord["resolution"] {
  const SEVERITY_WEIGHT: Record<string, number> = {
    CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1,
  };
  const wa = SEVERITY_WEIGHT[a.severity] ?? 2;
  const wb = SEVERITY_WEIGHT[b.severity] ?? 2;

  if (wa !== wb) return "RESOLVED_BY_WEIGHT";
  if (a.source !== b.source) return "RESOLVED_BY_SOURCE";
  return "UNRESOLVED";
}

// ── Hypothesis contradiction detection ───────────────────────────────────────

export function detectHypothesisContradictions(
  orgSlug: string,
  hypotheses: ReasoningHypothesis[],
): ContradictionRecord[] {
  const scoped = hypotheses.filter(h => h.orgSlug === orgSlug);
  const records: ContradictionRecord[] = [];

  // Known conflicting category pairs
  const CONFLICTING_PAIRS: Array<[string, string]> = [
    ["SALES", "OPPORTUNITY"],      // Sales drop conflicts with growth opportunity
    ["CASH_FLOW", "OPPORTUNITY"],  // Cash flow drop conflicts with growth opportunity
    ["RISK", "OPPORTUNITY"],       // Risk and opportunity hypotheses may conflict
  ];

  for (let i = 0; i < scoped.length; i++) {
    for (let j = i + 1; j < scoped.length; j++) {
      const a = scoped[i];
      const b = scoped[j];

      const isConflicting = CONFLICTING_PAIRS.some(
        ([x, y]) =>
          (a.category === x && b.category === y) ||
          (a.category === y && b.category === x),
      );

      if (!isConflicting) continue;

      // Only flag if both are supported
      if (!a.supported || !b.supported) continue;

      const severity: ContradictionSeverity =
        a.confidence.score >= 0.7 && b.confidence.score >= 0.7 ? "SEVERE" :
        a.confidence.score >= 0.4 || b.confidence.score >= 0.4 ? "MODERATE" :
        "MINOR";

      records.push({
        id:         generateCmrId("ctr"),
        orgSlug,
        entityA:    a.id,
        entityB:    b.id,
        entityType: "HYPOTHESIS",
        severity,
        explanation: `Hypothesis "${a.title}" (${a.category}) appears to contradict "${b.title}" (${b.category}). Both supported but logically incompatible.`,
        resolution:  a.confidence.score > b.confidence.score
          ? "RESOLVED_BY_WEIGHT"
          : b.confidence.score > a.confidence.score
            ? "RESOLVED_BY_WEIGHT"
            : "UNRESOLVED",
        detectedAt: new Date().toISOString(),
      });
    }
  }

  return records;
}

// ── Resolve contradictions ────────────────────────────────────────────────────

export interface ContradictionResolution {
  contradiction:     ContradictionRecord;
  resolvedEntityId:  string | null;   // winner, or null if unresolved
  rejectedEntityId:  string | null;   // loser, or null if unresolved
  explanation:       string;
}

export function resolveContradictions(
  contradictions: ContradictionRecord[],
  hypotheses: ReasoningHypothesis[],
): ContradictionResolution[] {
  return contradictions.map(c => {
    if (c.resolution !== "UNRESOLVED" && c.entityType === "HYPOTHESIS") {
      // Pick winner by confidence score
      const hA = hypotheses.find(h => h.id === c.entityA);
      const hB = hypotheses.find(h => h.id === c.entityB);

      if (hA && hB) {
        const winner = hA.confidence.score >= hB.confidence.score ? hA : hB;
        const loser  = winner === hA ? hB : hA;
        return {
          contradiction:    c,
          resolvedEntityId: winner.id,
          rejectedEntityId: loser.id,
          explanation:      `Contradiction resolved by confidence: "${winner.title}" wins with score ${winner.confidence.score.toFixed(2)}.`,
        };
      }
    }

    return {
      contradiction:    c,
      resolvedEntityId: null,
      rejectedEntityId: null,
      explanation:      `Contradiction unresolved: insufficient information to determine winner.`,
    };
  });
}

// ── Apply contradictions to hypotheses ───────────────────────────────────────

export function applyContradictions(
  hypotheses: ReasoningHypothesis[],
  contradictions: ContradictionRecord[],
): ReasoningHypothesis[] {
  const contradictedIds = new Set<string>();

  for (const c of contradictions) {
    if (c.severity === "SEVERE") {
      // Mark both as contradicted; downstream picks the stronger one
      contradictedIds.add(c.entityA);
      contradictedIds.add(c.entityB);
    }
  }

  return hypotheses.map(h => ({
    ...h,
    contradicted: contradictedIds.has(h.id) ? true : h.contradicted,
  }));
}

// ── Contradiction summary ─────────────────────────────────────────────────────

export interface ContradictionSummary {
  total:     number;
  severe:    number;
  moderate:  number;
  minor:     number;
  resolved:  number;
  unresolved: number;
}

export function summarizeContradictions(
  records: ContradictionRecord[],
): ContradictionSummary {
  return {
    total:      records.length,
    severe:     records.filter(c => c.severity === "SEVERE").length,
    moderate:   records.filter(c => c.severity === "MODERATE").length,
    minor:      records.filter(c => c.severity === "MINOR").length,
    resolved:   records.filter(c => c.resolution !== "UNRESOLVED").length,
    unresolved: records.filter(c => c.resolution === "UNRESOLVED").length,
  };
}
