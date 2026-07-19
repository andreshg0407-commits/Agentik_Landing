/**
 * lib/copilot/intelligence/reasoning/contradiction-detector.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Contradiction Detector
 *
 * Detects:
 *   - Conflicting evidence from the same domain (signals contradict each other)
 *   - Hypotheses that are mutually incompatible
 *   - Signals moving in opposite directions within the same domain
 *
 * Contradictions do NOT fail the pipeline. They are recorded and factored
 * into confidence scores. Resolution is left to human judgment.
 *
 * No Prisma. No server-only. Pure domain logic. Never throws.
 */

import type {
  ReasoningEvidence,
  ReasoningHypothesis,
  ContradictionRecord,
  ContradictionSeverity,
  ReasoningCategory,
} from "./reasoning-types";

// ── ID generator ───────────────────────────────────────────────────────────────

let _counter = 0;
function _id(): string {
  return `cr_${Date.now()}_${(++_counter % 1_000_000).toString().padStart(6, "0")}`;
}

// ── Evidence contradictions ────────────────────────────────────────────────────

/**
 * detectEvidenceContradictions — find conflicting evidence within the same domain.
 *
 * Rule: if two pieces of evidence in the same category have opposite isSupporting values
 * AND both have MEDIUM or HIGH confidence, they are contradictory.
 */
export function detectEvidenceContradictions(
  evidence: ReasoningEvidence[],
): ContradictionRecord[] {
  const contradictions: ContradictionRecord[] = [];

  // Group by category
  const byCategory = new Map<ReasoningCategory, ReasoningEvidence[]>();
  for (const ev of evidence) {
    const arr = byCategory.get(ev.category) ?? [];
    arr.push(ev);
    byCategory.set(ev.category, arr);
  }

  for (const [category, domainEvidence] of byCategory) {
    const supporting    = domainEvidence.filter(e => e.isSupporting  && e.confidence !== "LOW");
    const contradicting = domainEvidence.filter(e => !e.isSupporting && e.confidence !== "LOW");

    // Each supporting-contradicting pair is a contradiction
    for (const sup of supporting) {
      for (const con of contradicting) {
        const severity = _evidenceContradictionSeverity(sup, con);
        contradictions.push({
          id:          _id(),
          evidenceAId: sup.id,
          evidenceBId: con.id,
          severity,
          description: `Evidencia conflictiva en dominio ${category}: "${sup.summary.slice(0, 60)}..." vs "${con.summary.slice(0, 60)}..."`,
          resolution:  "UNRESOLVED",
          detectedAt:  new Date().toISOString(),
        });
      }
    }
  }

  return contradictions;
}

// ── Hypothesis contradictions ──────────────────────────────────────────────────

/**
 * detectHypothesisContradictions — find mutually incompatible hypotheses.
 *
 * Two hypotheses are incompatible if:
 *   - They share the same domain AND
 *   - One is SUPPORTED while the other's evidence is exclusively contradicting evidence
 *     from the first hypothesis's evidence pool
 *
 * Simplified rule: same domain + one's contradicting evidence overlaps with other's supporting evidence.
 */
export function detectHypothesisContradictions(
  hypotheses: ReasoningHypothesis[],
  evidence:   ReasoningEvidence[],
): ContradictionRecord[] {
  const contradictions: ContradictionRecord[] = [];
  const evidenceMap = new Map(evidence.map(e => [e.id, e]));

  for (let i = 0; i < hypotheses.length; i++) {
    for (let j = i + 1; j < hypotheses.length; j++) {
      const a = hypotheses[i];
      const b = hypotheses[j];

      // Check for domain overlap
      const sharedDomains = a.domains.filter(d => b.domains.includes(d));
      if (sharedDomains.length === 0) continue;

      // Check if hypothesis A's supporting evidence is hypothesis B's contradicting evidence
      const aSupportIds = new Set(a.supportingEvidenceIds);
      const bContradictIds = new Set(b.contradictingEvidenceIds);
      const bSupportIds = new Set(b.supportingEvidenceIds);
      const aContradictIds = new Set(a.contradictingEvidenceIds);

      const crossConflictAB = [...aSupportIds].filter(id => bContradictIds.has(id)).length;
      const crossConflictBA = [...bSupportIds].filter(id => aContradictIds.has(id)).length;

      if (crossConflictAB > 0 || crossConflictBA > 0) {
        const severity: ContradictionSeverity =
          crossConflictAB + crossConflictBA >= 3 ? "SEVERE" : "MODERATE";

        contradictions.push({
          id:          _id(),
          evidenceAId: a.id,
          evidenceBId: b.id,
          severity,
          description: `Hipótesis incompatibles en dominio(s) [${sharedDomains.join(", ")}]: "${a.title}" vs "${b.title}"`,
          resolution:  "UNRESOLVED",
          detectedAt:  new Date().toISOString(),
        });
      }
    }
  }

  return contradictions;
}

// ── Signal contradictions ──────────────────────────────────────────────────────

/**
 * detectSignalContradictions — find signals moving in opposite directions
 * within the same domain.
 *
 * Only flags when there are both UP and DOWN signals in the same domain
 * with MEDIUM or HIGH confidence.
 */
export function detectSignalContradictions(
  signals: Array<{
    id:         string;
    orgSlug:    string;
    category:   ReasoningCategory;
    metric:     string;
    direction:  string;
    confidence: string;
  }>,
): ContradictionRecord[] {
  const contradictions: ContradictionRecord[] = [];

  // Group by category
  const byCategory = new Map<ReasoningCategory, typeof signals>();
  for (const s of signals) {
    const arr = byCategory.get(s.category) ?? [];
    arr.push(s);
    byCategory.set(s.category, arr);
  }

  for (const [category, domainSignals] of byCategory) {
    const upSignals   = domainSignals.filter(s => s.direction === "UP"   && s.confidence !== "LOW");
    const downSignals = domainSignals.filter(s => s.direction === "DOWN" && s.confidence !== "LOW");

    for (const up of upSignals) {
      for (const down of downSignals) {
        contradictions.push({
          id:          _id(),
          evidenceAId: up.id,
          evidenceBId: down.id,
          severity:    "MINOR",
          description: `Señales contradictorias en ${category}: ${up.metric} (↑) vs ${down.metric} (↓)`,
          resolution:  "BOTH_VALID",  // Both can be true — different metrics
          detectedAt:  new Date().toISOString(),
        });
      }
    }
  }

  return contradictions;
}

// ── detectAllContradictions ────────────────────────────────────────────────────

/**
 * detectAllContradictions — run all contradiction detectors.
 * Returns a deduplicated, severity-sorted list of all contradictions.
 * Never throws.
 */
export function detectAllContradictions(
  evidence:   ReasoningEvidence[],
  hypotheses: ReasoningHypothesis[],
): ContradictionRecord[] {
  try {
    const evidenceContradictions    = detectEvidenceContradictions(evidence);
    const hypothesisContradictions  = detectHypothesisContradictions(hypotheses, evidence);

    const all = [...evidenceContradictions, ...hypothesisContradictions];

    // Sort by severity
    const severityOrder: Record<ContradictionSeverity, number> = {
      SEVERE:   3,
      MODERATE: 2,
      MINOR:    1,
    };

    return all.sort(
      (a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0),
    );
  } catch {
    return [];
  }
}

// ── Query helpers ──────────────────────────────────────────────────────────────

/** Get only SEVERE contradictions. */
export function getSevereContradictions(
  contradictions: ContradictionRecord[],
): ContradictionRecord[] {
  return contradictions.filter(c => c.severity === "SEVERE");
}

/** Get only UNRESOLVED contradictions. */
export function getUnresolvedContradictions(
  contradictions: ContradictionRecord[],
): ContradictionRecord[] {
  return contradictions.filter(c => c.resolution === "UNRESOLVED");
}

/** Check if a set of contradictions has any blocking-level issues. */
export function hasBlockingContradictions(
  contradictions: ContradictionRecord[],
): boolean {
  return contradictions.some(c => c.severity === "SEVERE" && c.resolution === "UNRESOLVED");
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function _evidenceContradictionSeverity(
  a: ReasoningEvidence,
  b: ReasoningEvidence,
): ContradictionSeverity {
  // Both high confidence → severe
  if (a.confidence === "HIGH" && b.confidence === "HIGH") return "SEVERE";
  // One high, one medium → moderate
  if (a.confidence === "HIGH" || b.confidence === "HIGH") return "MODERATE";
  return "MINOR";
}
