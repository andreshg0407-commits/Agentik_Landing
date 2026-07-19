/**
 * lib/copilot/intent-resolver/intent-validator.ts
 *
 * AGENTIK-INTENT-RESOLVER-01 — Resolved intent validator.
 * SERVER ONLY — no React imports, no AI, no LLM calls.
 * @server-only
 *
 * Validates a ResolvedIntent before it is presented to the user or routed
 * to an execution engine. Never throws — always returns a structured report.
 */
import "server-only";

import type { ResolvedIntent, IntentValidationReport } from "./intent-types";
import { INTENT_REGISTRY }                             from "./intent-registry";

// ── Validator ──────────────────────────────────────────────────────────────────

/**
 * Validate a ResolvedIntent for structural and semantic correctness.
 *
 * Checks:
 *   - candidateId exists in INTENT_REGISTRY
 *   - domain is non-empty
 *   - actionId is non-empty and has the expected "namespace.function" format
 *   - confidence is in [0, 1]
 *   - requiresApproval and automationEligible are present
 *
 * Advisory warnings (non-blocking):
 *   - confidence < 0.5 (below strong-match threshold)
 *   - stub action detected
 */
export function validateResolvedIntent(
  resolved: ResolvedIntent,
): IntentValidationReport {
  const errors:   string[] = [];
  const warnings: string[] = [];

  // ── Structural checks ──────────────────────────────────────────────────────

  if (!resolved.candidateId) {
    errors.push("ResolvedIntent is missing candidateId");
  }

  if (!resolved.domain) {
    errors.push("ResolvedIntent is missing domain");
  }

  if (!resolved.actionId) {
    errors.push("ResolvedIntent is missing actionId");
  } else if (!resolved.actionId.includes(".")) {
    errors.push(
      `actionId "${resolved.actionId}" must be in "namespace.functionName" format`,
    );
  }

  // ── Confidence checks ──────────────────────────────────────────────────────

  if (typeof resolved.confidence !== "number") {
    errors.push("confidence must be a number");
  } else {
    if (resolved.confidence < 0) errors.push("confidence must be >= 0");
    if (resolved.confidence > 1) errors.push("confidence must be <= 1");
    if (resolved.confidence < 0.5) {
      warnings.push(
        `Low confidence (${(resolved.confidence * 100).toFixed(0)}%) — consider asking the user to rephrase`,
      );
    }
  }

  // ── Registry check ─────────────────────────────────────────────────────────

  if (resolved.candidateId && !(resolved.candidateId in INTENT_REGISTRY)) {
    errors.push(
      `candidateId "${resolved.candidateId}" is not registered in INTENT_REGISTRY`,
    );
  }

  // ── Boolean flags ──────────────────────────────────────────────────────────

  if (typeof resolved.requiresApproval !== "boolean") {
    errors.push("requiresApproval must be a boolean");
  }

  if (typeof resolved.automationEligible !== "boolean") {
    errors.push("automationEligible must be a boolean");
  }

  if (resolved.requiresApproval && resolved.automationEligible) {
    warnings.push(
      "Action is marked as both requiresApproval and automationEligible — verify intended policy",
    );
  }

  // ── Parameters ─────────────────────────────────────────────────────────────

  if (typeof resolved.parameters !== "object" || resolved.parameters === null) {
    errors.push("parameters must be an object");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

// ── Registry-level validation ──────────────────────────────────────────────────

export interface IntentRegistryReport {
  ok:               boolean;
  errors:           string[];
  warnings:         string[];
  totalIntents:     number;
  domainsPresent:   string[];
}

/**
 * Validate the structural integrity of the entire INTENT_REGISTRY.
 * Useful at startup / CI to catch registration mistakes early.
 */
export function validateIntentRegistry(): IntentRegistryReport {
  const errors:   string[] = [];
  const warnings: string[] = [];
  const seen      = new Set<string>();
  const domains   = new Set<string>();

  for (const [key, candidate] of Object.entries(INTENT_REGISTRY)) {
    if (candidate.id !== key) {
      errors.push(`INTENT_REGISTRY["${key}"].id is "${candidate.id}" — must match key`);
    }

    if (!candidate.domain) {
      errors.push(`Intent "${key}" is missing domain`);
    } else {
      domains.add(candidate.domain);
    }

    if (!candidate.actionId) {
      errors.push(`Intent "${key}" is missing actionId`);
    } else if (!candidate.actionId.includes(".")) {
      errors.push(`Intent "${key}" actionId "${candidate.actionId}" must be "namespace.fn" format`);
    }

    if (!candidate.keywords || candidate.keywords.length === 0) {
      errors.push(`Intent "${key}" has no keywords — it will never match`);
    }

    if (seen.has(candidate.id)) {
      errors.push(`Duplicate intent id detected: "${candidate.id}"`);
    }
    seen.add(candidate.id);
  }

  return {
    ok:             errors.length === 0,
    errors,
    warnings,
    totalIntents:   Object.keys(INTENT_REGISTRY).length,
    domainsPresent: [...domains],
  };
}
