/**
 * lib/copilot/intelligence/reasoning/reasoning-readiness.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Readiness Scanner
 *
 * Generates a readiness score (0–100) for the reasoning engine.
 * Checks that all required components are in place and functional.
 *
 * Server-only.
 */

import "server-only";

import { HYPOTHESIS_PATTERNS } from "./hypothesis-engine";
import { REASONING_CATEGORIES } from "./reasoning-types";

// ── Readiness types ────────────────────────────────────────────────────────────

export type ReasoningReadinessStatus = "READY" | "PARTIAL" | "NOT_READY";

export interface ReasoningSubsystemCheck {
  name:    string;
  passed:  boolean;
  message: string;
  weight:  number;   // 1–10 — how critical is this check
}

export interface ReasoningReadinessReport {
  status:     ReasoningReadinessStatus;
  score:      number;        // 0–100
  checks:     ReasoningSubsystemCheck[];
  checkedAt:  string;
  blockers:   string[];      // must-fix issues preventing readiness
  warnings:   string[];      // non-blocking issues
}

// ── scanReasoningReadiness ────────────────────────────────────────────────────

/**
 * scanReasoningReadiness — run all readiness checks and return a score.
 * Never throws.
 */
export function scanReasoningReadiness(): ReasoningReadinessReport {
  const checks: ReasoningSubsystemCheck[] = [];

  // Check 1: Core types available
  checks.push(_check(
    "core_types",
    () => {
      const len = REASONING_CATEGORIES.length;
      if (len < 7) throw new Error(`Only ${len} categories`);
      return `${len} reasoning categories defined`;
    },
    10,
  ));

  // Check 2: Hypothesis patterns
  checks.push(_check(
    "hypothesis_patterns",
    () => {
      const count = HYPOTHESIS_PATTERNS.length;
      if (count < 5) throw new Error(`Only ${count} patterns`);
      return `${count} patterns registered`;
    },
    10,
  ));

  // Check 3: Multi-domain patterns
  checks.push(_check(
    "multi_domain_patterns",
    () => {
      const multi = HYPOTHESIS_PATTERNS.filter(p => p.domains.length >= 2);
      if (multi.length < 3) throw new Error(`Only ${multi.length} multi-domain patterns`);
      return `${multi.length} multi-domain patterns`;
    },
    8,
  ));

  // Check 4: Financial patterns
  checks.push(_check(
    "financial_patterns",
    () => {
      const fin = HYPOTHESIS_PATTERNS.filter(p => p.domains.includes("FINANCIAL"));
      if (fin.length < 2) throw new Error(`Only ${fin.length} financial patterns`);
      return `${fin.length} financial patterns`;
    },
    9,
  ));

  // Check 5: Pipeline function available
  checks.push(_check(
    "pipeline_function",
    () => {
      const { runReasoningPipeline } = require("./reasoning-pipeline");
      if (typeof runReasoningPipeline !== "function") throw new Error("Not available");
      return "runReasoningPipeline available";
    },
    10,
  ));

  // Check 6: Evidence builder
  checks.push(_check(
    "evidence_builder",
    () => {
      const { buildEvidenceFromContext } = require("./evidence-builder");
      if (typeof buildEvidenceFromContext !== "function") throw new Error("Not available");
      return "buildEvidenceFromContext available";
    },
    9,
  ));

  // Check 7: Contradiction detector
  checks.push(_check(
    "contradiction_detector",
    () => {
      const { detectAllContradictions } = require("./contradiction-detector");
      if (typeof detectAllContradictions !== "function") throw new Error("Not available");
      return "detectAllContradictions available";
    },
    8,
  ));

  // Check 8: Confidence engine
  checks.push(_check(
    "confidence_engine",
    () => {
      const { calculateOverallConfidence } = require("./confidence-engine");
      if (typeof calculateOverallConfidence !== "function") throw new Error("Not available");
      return "calculateOverallConfidence available";
    },
    9,
  ));

  // Check 9: Executive impact engine
  checks.push(_check(
    "executive_impact",
    () => {
      const { classifyConclusionImpact } = require("./executive-impact");
      if (typeof classifyConclusionImpact !== "function") throw new Error("Not available");
      return "classifyConclusionImpact available";
    },
    8,
  ));

  // Check 10: Multi-domain resolver
  checks.push(_check(
    "multi_domain_resolver",
    () => {
      const { resolveMultiDomainQuery } = require("./multi-domain-resolver");
      if (typeof resolveMultiDomainQuery !== "function") throw new Error("Not available");
      return "resolveMultiDomainQuery available";
    },
    8,
  ));

  // Check 11: Memory integration
  checks.push(_check(
    "memory_integration",
    () => {
      const { memoryToReasoningSignals } = require("./integrations/reasoning-memory");
      if (typeof memoryToReasoningSignals !== "function") throw new Error("Not available");
      return "Memory integration available";
    },
    6,
  ));

  // Check 12: Playbook integration
  checks.push(_check(
    "playbook_integration",
    () => {
      const { playbookToReasoningSignals } = require("./integrations/reasoning-playbooks");
      if (typeof playbookToReasoningSignals !== "function") throw new Error("Not available");
      return "Playbook integration available";
    },
    6,
  ));

  // Check 13: Executive Brain integration
  checks.push(_check(
    "executive_brain_integration",
    () => {
      const { executiveBrainToReasoningSignals } = require("./integrations/reasoning-executive-brain");
      if (typeof executiveBrainToReasoningSignals !== "function") throw new Error("Not available");
      return "Executive Brain integration available";
    },
    7,
  ));

  // Check 14: Audit integration
  checks.push(_check(
    "audit_integration",
    () => {
      const { createReasoningAuditLog } = require("./integrations/reasoning-audit");
      if (typeof createReasoningAuditLog !== "function") throw new Error("Not available");
      return "Audit integration available";
    },
    6,
  ));

  // Calculate score
  const totalWeight  = checks.reduce((sum, c) => sum + c.weight, 0);
  const passedWeight = checks.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0);
  const score = Math.round((passedWeight / totalWeight) * 100);

  const blockers = checks
    .filter(c => !c.passed && c.weight >= 9)
    .map(c => c.message);

  const warnings = checks
    .filter(c => !c.passed && c.weight < 9)
    .map(c => c.message);

  const status: ReasoningReadinessStatus =
    score >= 90 ? "READY" :
    score >= 60 ? "PARTIAL" :
    "NOT_READY";

  return {
    status,
    score,
    checks,
    checkedAt: new Date().toISOString(),
    blockers,
    warnings,
  };
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function _check(
  name:   string,
  fn:     () => string,
  weight: number,
): ReasoningSubsystemCheck {
  try {
    const message = fn();
    return { name, passed: true, message, weight };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name, passed: false, message: msg, weight };
  }
}
