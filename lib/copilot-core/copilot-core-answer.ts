/**
 * lib/copilot-core/copilot-core-answer.ts
 *
 * Copilot Core Foundation — Answer Contract Validation
 * Sprint: COPILOT-CORE-FOUNDATION-01A
 *
 * Pure validation for CopilotAnswer and FactRef invariants.
 * No generation of actual answers — that belongs to a future phase.
 */

import type {
  CopilotAnswer,
  FactRef,
  TruthState,
  CopilotWarning,
} from "./copilot-core-types";

// ── Truth State Resolution ───────────────────────────────────────────────────

/**
 * Determines the valid truth state for an answer based on its facts.
 *
 * INVARIANT: An answer with zero facts CANNOT be VERIFIED.
 */
export function resolveTruthState(
  facts: readonly FactRef[],
  requestedState: TruthState,
): TruthState {
  // No facts → cannot be verified
  if (facts.length === 0) {
    return "DATA_UNVERIFIED";
  }

  // If any fact is unverified, overall cannot be verified
  if (facts.some((f) => f.truthState === "DATA_UNVERIFIED")) {
    return requestedState === "VERIFIED" ? "PARTIAL" : requestedState;
  }

  // If some are partial, overall is at most partial
  if (facts.some((f) => f.truthState === "PARTIAL")) {
    return requestedState === "VERIFIED" ? "PARTIAL" : requestedState;
  }

  return requestedState;
}

// ── Answer Validation ────────────────────────────────────────────────────────

export interface AnswerValidationResult {
  readonly valid:    boolean;
  readonly errors:   readonly string[];
  readonly warnings: readonly CopilotWarning[];
}

/**
 * Validates a CopilotAnswer against its invariants.
 *
 * - Every FactRef.organizationId must match answer.organizationId.
 * - truthState "VERIFIED" requires at least one fact.
 * - Low-confidence facts generate warnings.
 */
export function validateAnswer(answer: CopilotAnswer): AnswerValidationResult {
  const errors: string[] = [];
  const warnings: CopilotWarning[] = [];

  if (!answer.answerId || answer.answerId.length === 0) {
    errors.push("Missing answerId");
  }
  if (!answer.organizationId || answer.organizationId.length === 0) {
    errors.push("Missing organizationId");
  }
  if (!answer.requestId || answer.requestId.length === 0) {
    errors.push("Missing requestId");
  }
  if (!answer.capabilityId || answer.capabilityId.length === 0) {
    errors.push("Missing capabilityId");
  }

  // Fact org-match check
  for (const fact of answer.facts) {
    if (fact.organizationId !== answer.organizationId) {
      errors.push(
        `FactRef ${fact.sourceRecordId} organizationId "${fact.organizationId}" ` +
        `does not match answer organizationId "${answer.organizationId}"`,
      );
    }
  }

  // Truth state invariant
  if (answer.truthState === "VERIFIED" && answer.facts.length === 0) {
    errors.push("Cannot declare VERIFIED with zero facts");
  }

  // Warnings for low-confidence facts
  const lowConfidence = answer.facts.filter((f) => f.confidence < 0.5);
  if (lowConfidence.length > 0) {
    warnings.push({
      code:    "LOW_CONFIDENCE",
      message: `${lowConfidence.length} fact(s) below 50% confidence`,
    });
  }

  // Warning for no facts
  if (answer.facts.length === 0) {
    warnings.push({
      code:    "NO_FACTS",
      message: "Answer has no supporting facts",
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}
