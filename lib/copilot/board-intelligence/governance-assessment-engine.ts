// AGENTIK-BOARD-INTELLIGENCE-01 — Phase 3: Governance Assessment Engine

import type {
  BoardGovernanceAssessment,
  BoardConfidence,
  GovernanceStatus,
} from "./board-intelligence-types";
import {
  boardConfidenceFromScore,
  governanceStatusFromScore,
} from "./board-intelligence-types";

// ── Inputs ──────────────────────────────────────────────────────────────────

export interface GovernanceInput {
  readonly orgSlug:         string;
  readonly sessionId:       string;
  readonly riskScore?:      number;   // 0–1 from risk layer
  readonly complianceScore?: number;  // 0–1 from compliance layer
  readonly controlScore?:   number;   // 0–1 from control checks
  readonly alignmentScore?: number;   // 0–1 strategic alignment
  readonly concerns?:       string[];
  readonly strengths?:      string[];
  readonly limitations?:    string[];
}

// ── Scoring ─────────────────────────────────────────────────────────────────

export function scoreGovernance(input: GovernanceInput): number {
  try {
    const riskComponent       = Math.max(0, 1 - (input.riskScore       ?? 0.4));
    const complianceComponent =              (input.complianceScore     ?? 0.6);
    const controlComponent    =              (input.controlScore        ?? 0.6);
    const alignmentComponent  =              (input.alignmentScore      ?? 0.6);

    const score = (
      riskComponent       * 0.30 +
      complianceComponent * 0.25 +
      controlComponent    * 0.25 +
      alignmentComponent  * 0.20
    );
    return Math.max(0, Math.min(1, score));
  } catch {
    return 0.5;
  }
}

export function rankGovernanceConcerns(concerns: string[]): string[] {
  try {
    if (!concerns || concerns.length === 0) return [];
    // Severity keywords drive ranking
    const CRITICAL_WORDS = ["crítico", "crítica", "critical", "fraude", "incumplimiento"];
    const HIGH_WORDS     = ["alto", "alta", "high", "riesgo", "risk", "urgente"];

    return [...concerns].sort((a, b) => {
      const aLow = a.toLowerCase();
      const bLow = b.toLowerCase();
      const aScore =
        CRITICAL_WORDS.some((w) => aLow.includes(w)) ? 2 :
        HIGH_WORDS.some((w) => aLow.includes(w))     ? 1 : 0;
      const bScore =
        CRITICAL_WORDS.some((w) => bLow.includes(w)) ? 2 :
        HIGH_WORDS.some((w) => bLow.includes(w))     ? 1 : 0;
      return bScore - aScore;
    });
  } catch {
    return concerns ?? [];
  }
}

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildGovernanceAssessment(
  input: GovernanceInput
): BoardGovernanceAssessment {
  try {
    const governanceScore = scoreGovernance(input);
    const riskScore       = Math.max(0, Math.min(1, input.riskScore       ?? 0.4));
    const controlScore    = Math.max(0, Math.min(1, input.controlScore    ?? 0.6));
    const alignmentScore  = Math.max(0, Math.min(1, input.alignmentScore  ?? 0.6));
    const complianceScore = Math.max(0, Math.min(1, input.complianceScore ?? 0.6));
    const status: GovernanceStatus = governanceStatusFromScore(governanceScore);
    const confidence: BoardConfidence = boardConfidenceFromScore(governanceScore);

    const concerns    = rankGovernanceConcerns(input.concerns   ?? []);
    const strengths   = input.strengths  ?? [];
    const limitations = input.limitations ?? ["Governance assessment based on available signals only"];

    return {
      orgSlug:        input.orgSlug,
      sessionId:      input.sessionId,
      status,
      governanceScore,
      riskScore,
      controlScore,
      alignmentScore,
      complianceScore,
      concerns,
      strengths,
      limitations,
      confidence,
      assessedAt:     new Date().toISOString(),
    };
  } catch {
    return buildEmptyGovernanceAssessment(input.orgSlug, input.sessionId);
  }
}

export function buildEmptyGovernanceAssessment(
  orgSlug:   string,
  sessionId: string
): BoardGovernanceAssessment {
  return {
    orgSlug,
    sessionId,
    status:          "ADEQUATE",
    governanceScore: 0.5,
    riskScore:       0.4,
    controlScore:    0.5,
    alignmentScore:  0.5,
    complianceScore: 0.5,
    concerns:        [],
    strengths:       [],
    limitations:     ["Insufficient data for governance assessment"],
    confidence:      "LOW",
    assessedAt:      new Date().toISOString(),
  };
}

export function mergeGovernanceAssessments(
  base:     BoardGovernanceAssessment,
  override: Partial<GovernanceInput>
): BoardGovernanceAssessment {
  try {
    return buildGovernanceAssessment({
      orgSlug:         base.orgSlug,
      sessionId:       base.sessionId,
      riskScore:       override.riskScore      ?? base.riskScore,
      complianceScore: override.complianceScore ?? base.complianceScore,
      controlScore:    override.controlScore    ?? base.controlScore,
      alignmentScore:  override.alignmentScore  ?? base.alignmentScore,
      concerns:        [...base.concerns,   ...(override.concerns   ?? [])],
      strengths:       [...base.strengths,  ...(override.strengths  ?? [])],
      limitations:     [...base.limitations, ...(override.limitations ?? [])],
    });
  } catch {
    return base;
  }
}
