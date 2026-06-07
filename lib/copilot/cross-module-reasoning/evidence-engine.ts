/**
 * lib/copilot/cross-module-reasoning/evidence-engine.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Evidence Engine
 *
 * Collects, organizes, scores, and validates evidence from signals.
 * Deterministic. Fail-closed. No AI.
 */

import type {
  ReasoningEvidence,
  ReasoningEvidenceType,
  ReasoningSignal,
  ReasoningSourceDomain,
} from "./cross-module-types";
import { generateCmrId } from "./cross-module-types";

// ── Build evidence from a signal ──────────────────────────────────────────────

export function signalToEvidence(signal: ReasoningSignal): ReasoningEvidence {
  return {
    id:          generateCmrId("ev"),
    orgSlug:     signal.orgSlug,
    type:        "SIGNAL" as ReasoningEvidenceType,
    domain:      signal.domain,
    label:       signal.label,
    description: signal.description,
    strength:    _severityToStrength(signal.severity),
    reliability: signal.confidence,
    sourceRef:   signal.id,
    sourceType:  "signal",
    metadata:    { signalType: signal.type, direction: signal.direction },
    collectedAt: new Date().toISOString(),
  };
}

// ── Collect evidence from a set of signals ────────────────────────────────────

export function collectEvidence(
  orgSlug: string,
  signals: ReasoningSignal[],
  additionalItems?: Partial<ReasoningEvidence>[],
): ReasoningEvidence[] {
  const fromSignals = signals
    .filter(s => s.orgSlug === orgSlug)
    .map(signalToEvidence);

  const fromAdditional = (additionalItems ?? []).map(item => ({
    id:          item.id ?? generateCmrId("ev"),
    orgSlug:     item.orgSlug ?? orgSlug,
    type:        item.type ?? ("METRIC" as ReasoningEvidenceType),
    domain:      item.domain ?? ("EXECUTIVE" as ReasoningSourceDomain),
    label:       item.label ?? "Unknown evidence",
    description: item.description ?? "",
    strength:    item.strength ?? 0.5,
    reliability: item.reliability ?? 0.5,
    sourceRef:   item.sourceRef ?? "",
    sourceType:  item.sourceType ?? "unknown",
    metadata:    item.metadata ?? {},
    collectedAt: item.collectedAt ?? new Date().toISOString(),
  }));

  return [...fromSignals, ...fromAdditional];
}

// ── Rank evidence by combined strength + reliability ─────────────────────────

export function rankEvidence(evidence: ReasoningEvidence[]): ReasoningEvidence[] {
  return [...evidence].sort((a, b) => {
    const scoreA = (a.strength * 0.6) + (a.reliability * 0.4);
    const scoreB = (b.strength * 0.6) + (b.reliability * 0.4);
    return scoreB - scoreA;
  });
}

// ── Validate single evidence item ─────────────────────────────────────────────

export interface EvidenceValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

export function validateEvidence(ev: ReasoningEvidence): EvidenceValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!ev.id)         errors.push("Evidence missing id");
  if (!ev.orgSlug)    errors.push("Evidence missing orgSlug");
  if (!ev.label)      errors.push("Evidence missing label");
  if (!ev.sourceRef)  warnings.push("Evidence missing sourceRef (provenance)");
  if (!ev.sourceType) warnings.push("Evidence missing sourceType");

  if (ev.strength < 0 || ev.strength > 1) {
    warnings.push(`Evidence strength ${ev.strength} out of 0–1 range`);
  }
  if (ev.reliability < 0 || ev.reliability > 1) {
    warnings.push(`Evidence reliability ${ev.reliability} out of 0–1 range`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Build evidence set (validate + filter invalids) ───────────────────────────

export interface EvidenceSet {
  orgSlug:       string;
  items:         ReasoningEvidence[];
  totalCount:    number;
  validCount:    number;
  invalidCount:  number;
  avgStrength:   number;
  avgReliability: number;
  builtAt:       string;
}

export function buildEvidenceSet(
  orgSlug: string,
  evidence: ReasoningEvidence[],
): EvidenceSet {
  const scoped = evidence.filter(e => e.orgSlug === orgSlug);
  const valid  = scoped.filter(e => validateEvidence(e).valid);
  const ranked = rankEvidence(valid);

  const avgStrength    = ranked.length > 0
    ? ranked.reduce((s, e) => s + e.strength, 0) / ranked.length
    : 0;
  const avgReliability = ranked.length > 0
    ? ranked.reduce((s, e) => s + e.reliability, 0) / ranked.length
    : 0;

  return {
    orgSlug,
    items:         ranked,
    totalCount:    scoped.length,
    validCount:    valid.length,
    invalidCount:  scoped.length - valid.length,
    avgStrength,
    avgReliability,
    builtAt:       new Date().toISOString(),
  };
}

// ── Filter by domain ──────────────────────────────────────────────────────────

export function filterEvidenceByDomain(
  evidence: ReasoningEvidence[],
  domain: ReasoningSourceDomain,
): ReasoningEvidence[] {
  return evidence.filter(e => e.domain === domain);
}

// ── Filter by type ────────────────────────────────────────────────────────────

export function filterEvidenceByType(
  evidence: ReasoningEvidence[],
  type: ReasoningEvidenceType,
): ReasoningEvidence[] {
  return evidence.filter(e => e.type === type);
}

// ── Evidence score ────────────────────────────────────────────────────────────

export function scoreEvidence(ev: ReasoningEvidence): number {
  return (ev.strength * 0.6) + (ev.reliability * 0.4);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _severityToStrength(severity: string): number {
  switch (severity) {
    case "CRITICAL": return 1.0;
    case "HIGH":     return 0.75;
    case "MEDIUM":   return 0.5;
    case "LOW":      return 0.25;
    default:         return 0.5;
  }
}
