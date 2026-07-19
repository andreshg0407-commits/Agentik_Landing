// AGENTIK-EXECUTIVE-BRAIN-02
// Phase 6 — Executive Conflict Engine
// Detects incompatible objectives, conflicting risks, contradictory priorities

import type { StrategicMemoryEntry } from "../strategic-memory/strategic-memory-types";
import type {
  ExecutiveConflict,
  ExecutiveDomain,
  ExecutiveConflictType,
  ExecutivePriority,
} from "./executive-brain-types";
import { generateEbv2Id } from "./executive-brain-types";

// ── Conflict detection API ────────────────────────────────────────────────────

export function detectExecutiveConflicts(
  orgSlug: string,
  entries: StrategicMemoryEntry[],
  priorities: ExecutivePriority[]
): ExecutiveConflict[] {
  const conflicts: ExecutiveConflict[] = [];
  const scoped = entries.filter((e) => e.orgSlug === orgSlug && e.status === "ACTIVE");

  conflicts.push(..._detectObjectiveConflicts(orgSlug, scoped));
  conflicts.push(..._detectConstraintGoalConflicts(orgSlug, scoped));
  conflicts.push(..._detectRiskOpportunityTension(orgSlug, scoped));
  conflicts.push(..._detectPriorityConflicts(orgSlug, priorities));
  conflicts.push(..._detectTemporalConflicts(orgSlug, scoped));

  return _deduplicate(conflicts);
}

export function detectObjectiveConflicts(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): ExecutiveConflict[] {
  return _detectObjectiveConflicts(orgSlug, entries.filter((e) => e.orgSlug === orgSlug));
}

export function detectPriorityConflicts(
  orgSlug: string,
  priorities: ExecutivePriority[]
): ExecutiveConflict[] {
  return _detectPriorityConflicts(orgSlug, priorities.filter((p) => p.orgSlug === orgSlug));
}

export function detectRiskOpportunityTension(
  orgSlug: string,
  entries: StrategicMemoryEntry[]
): ExecutiveConflict[] {
  return _detectRiskOpportunityTension(orgSlug, entries.filter((e) => e.orgSlug === orgSlug));
}

// ── Private detectors ─────────────────────────────────────────────────────────

function _detectObjectiveConflicts(
  orgSlug: string,
  scoped: StrategicMemoryEntry[]
): ExecutiveConflict[] {
  const conflicts: ExecutiveConflict[] = [];
  const goals = scoped.filter((e) => e.type === "GOAL" || e.type === "OBJECTIVE");

  for (let i = 0; i < goals.length; i++) {
    for (let j = i + 1; j < goals.length; j++) {
      const a = goals[i];
      const b = goals[j];
      if (a.domain !== b.domain) continue;
      if (_titlesTensionDetected(a.title, b.title)) {
        conflicts.push(_makeConflict(orgSlug, "OBJECTIVE_CONFLICT", a, b, "HIGH",
          `Dos objetivos del dominio ${a.domain} pueden ser incompatibles: '${a.title}' vs '${b.title}'.`
        ));
      }
    }
  }
  return conflicts;
}

function _detectConstraintGoalConflicts(
  orgSlug: string,
  scoped: StrategicMemoryEntry[]
): ExecutiveConflict[] {
  const conflicts: ExecutiveConflict[] = [];
  const goals = scoped.filter((e) => e.type === "GOAL" || e.type === "OBJECTIVE");
  const constraints = scoped.filter((e) => e.type === "CONSTRAINT");

  for (const goal of goals) {
    for (const constraint of constraints) {
      if (goal.domain === constraint.domain || constraint.domain === "CROSS_DOMAIN") {
        conflicts.push(_makeConflict(orgSlug, "CONSTRAINT_GOAL_CONFLICT", goal, constraint, "MEDIUM",
          `La restricción '${constraint.title}' puede limitar el objetivo '${goal.title}' en el dominio ${goal.domain}.`
        ));
      }
    }
  }
  return conflicts;
}

function _detectRiskOpportunityTension(
  orgSlug: string,
  scoped: StrategicMemoryEntry[]
): ExecutiveConflict[] {
  const conflicts: ExecutiveConflict[] = [];
  const risks = scoped.filter((e) => e.type === "RISK" && (e.priority === "HIGH" || e.priority === "CRITICAL"));
  const opportunities = scoped.filter((e) => e.type === "OPPORTUNITY");

  for (const risk of risks) {
    for (const opp of opportunities) {
      if (risk.domain === opp.domain) {
        conflicts.push(_makeConflict(orgSlug, "RISK_OPPORTUNITY_TENSION", opp, risk, "HIGH",
          `La oportunidad '${opp.title}' se produce en el mismo dominio que el riesgo '${risk.title}' (${risk.domain}). Capturarla implica exposición al riesgo.`
        ));
      }
    }
  }
  return conflicts;
}

function _detectPriorityConflicts(
  orgSlug: string,
  priorities: ExecutivePriority[]
): ExecutiveConflict[] {
  const conflicts: ExecutiveConflict[] = [];
  const critical = priorities.filter((p) => p.level === "CRITICAL");

  if (critical.length >= 2) {
    for (let i = 0; i < critical.length - 1; i++) {
      const a = critical[i];
      const b = critical[i + 1];
      if (a.domain !== b.domain) continue;

      conflicts.push({
        id: generateEbv2Id("conflict"),
        orgSlug,
        type: "PRIORITY_CONFLICT",
        title: `Dos prioridades críticas en ${a.domain}`,
        description: `'${a.title}' y '${b.title}' son ambas críticas en el dominio ${a.domain}. La simultaneidad puede requerir elección explícita.`,
        domain: a.domain,
        severity: "HIGH",
        confidence: "HIGH",
        elementAId: a.id,
        elementATitle: a.title,
        elementBId: b.id,
        elementBTitle: b.title,
        rationale: "Dos prioridades críticas concurrentes en el mismo dominio requieren priorización explícita.",
        metadata: { source: "PRIORITY_ENGINE" },
        detectedAt: new Date().toISOString(),
      });
    }
  }
  return conflicts;
}

function _detectTemporalConflicts(
  orgSlug: string,
  scoped: StrategicMemoryEntry[]
): ExecutiveConflict[] {
  const conflicts: ExecutiveConflict[] = [];
  const commitments = scoped.filter((e) => e.type === "COMMITMENT" && e.validUntil);

  for (let i = 0; i < commitments.length; i++) {
    for (let j = i + 1; j < commitments.length; j++) {
      const a = commitments[i];
      const b = commitments[j];
      if (a.domain !== b.domain) continue;
      if (a.validUntil && b.validUntil && Math.abs(new Date(a.validUntil).getTime() - new Date(b.validUntil).getTime()) < 7 * 24 * 60 * 60 * 1000) {
        conflicts.push(_makeConflict(orgSlug, "TEMPORAL_CONFLICT", a, b, "MEDIUM",
          `Los compromisos '${a.title}' y '${b.title}' vencen en la misma semana en ${a.domain}.`
        ));
      }
    }
  }
  return conflicts;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _makeConflict(
  orgSlug: string,
  type: ExecutiveConflictType,
  a: StrategicMemoryEntry,
  b: StrategicMemoryEntry,
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  description: string
): ExecutiveConflict {
  return {
    id: generateEbv2Id("conflict"),
    orgSlug,
    type,
    title: `${_conflictLabel(type)}: ${a.title} / ${b.title}`,
    description,
    domain: a.domain as ExecutiveDomain,
    severity,
    confidence: "MEDIUM",
    elementAId: a.id,
    elementATitle: a.title,
    elementBId: b.id,
    elementBTitle: b.title,
    rationale: description,
    metadata: { source: "CONFLICT_ENGINE", typeA: a.type, typeB: b.type },
    detectedAt: new Date().toISOString(),
  };
}

function _conflictLabel(type: ExecutiveConflictType): string {
  switch (type) {
    case "OBJECTIVE_CONFLICT": return "Conflicto de objetivos";
    case "PRIORITY_CONFLICT": return "Conflicto de prioridades";
    case "RESOURCE_CONFLICT": return "Conflicto de recursos";
    case "RISK_OPPORTUNITY_TENSION": return "Tensión riesgo-oportunidad";
    case "CONSTRAINT_GOAL_CONFLICT": return "Restricción vs objetivo";
    case "POLICY_ACTION_CONFLICT": return "Política vs acción";
    case "TEMPORAL_CONFLICT": return "Conflicto temporal";
  }
}

function _titlesTensionDetected(titleA: string, titleB: string): boolean {
  // Simple heuristic: contradictory direction words
  const growthWords = ["crecer", "aumentar", "expandir", "invertir"];
  const cutWords = ["reducir", "cortar", "ahorrar", "optimizar", "minimizar"];
  const aLower = titleA.toLowerCase();
  const bLower = titleB.toLowerCase();
  const aIsGrowth = growthWords.some((w) => aLower.includes(w));
  const bIsCut = cutWords.some((w) => bLower.includes(w));
  const aIsCut = cutWords.some((w) => aLower.includes(w));
  const bIsGrowth = growthWords.some((w) => bLower.includes(w));
  return (aIsGrowth && bIsCut) || (aIsCut && bIsGrowth);
}

function _deduplicate(conflicts: ExecutiveConflict[]): ExecutiveConflict[] {
  const seen = new Set<string>();
  return conflicts.filter((c) => {
    const key = `${c.type}:${c.elementAId}:${c.elementBId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
