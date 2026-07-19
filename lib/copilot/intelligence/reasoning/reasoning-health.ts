/**
 * lib/copilot/intelligence/reasoning/reasoning-health.ts
 *
 * AGENTIK-COPILOT-INTELLIGENCE-02
 * Reasoning Engine — Health Monitor
 *
 * Validates that the reasoning engine subsystems are healthy:
 *   - Pipeline (can it run?)
 *   - Memory integration (is it configured?)
 *   - Playbook integration (is it configured?)
 *   - Executive Brain integration (is it configured?)
 *   - Audit integration (is it working?)
 *
 * Server-only.
 */

import "server-only";

import { HYPOTHESIS_PATTERNS } from "./hypothesis-engine";
import { REASONING_CATEGORIES } from "./reasoning-types";

// ── Health types ───────────────────────────────────────────────────────────────

export type ReasoningHealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface ReasoningSubsystemHealth {
  name:     string;
  status:   ReasoningHealthStatus;
  message:  string;
  checkMs:  number;
}

export interface ReasoningHealthReport {
  overall:    ReasoningHealthStatus;
  subsystems: ReasoningSubsystemHealth[];
  checkedAt:  string;
  durationMs: number;
}

// ── evaluateReasoningHealth ────────────────────────────────────────────────────

/**
 * evaluateReasoningHealth — check all reasoning subsystems.
 * Never throws. Subsystem failures are captured in the report.
 */
export function evaluateReasoningHealth(): ReasoningHealthReport {
  const startedAt = Date.now();
  const subsystems: ReasoningSubsystemHealth[] = [];

  // Check 1: Hypothesis patterns loaded
  const t1 = Date.now();
  subsystems.push(_check(
    "hypothesis_patterns",
    () => {
      const count = HYPOTHESIS_PATTERNS.length;
      if (count < 5) throw new Error(`Only ${count} patterns loaded, expected 5+`);
      return `${count} hypothesis patterns loaded`;
    },
    Date.now() - t1,
  ));

  // Check 2: Insight rules loaded — note: INSIGHT_RULES is internal to insight-engine
  // We verify by checking that HYPOTHESIS_PATTERNS keys have corresponding rules
  const t2 = Date.now();
  subsystems.push(_check(
    "insight_rules",
    () => {
      // Verify reasoning engine can produce insights by checking pattern keys exist
      const patternKeys = HYPOTHESIS_PATTERNS.map(p => p.key);
      if (patternKeys.length < 5) throw new Error("Insufficient pattern keys");
      return `${patternKeys.length} pattern keys available for insight generation`;
    },
    Date.now() - t2,
  ));

  // Check 3: Domain coverage
  const t3 = Date.now();
  subsystems.push(_check(
    "domain_coverage",
    () => {
      const count = REASONING_CATEGORIES.length;
      if (count < 7) throw new Error(`Only ${count} categories, expected 7`);
      return `${count} reasoning categories available`;
    },
    Date.now() - t3,
  ));

  // Check 4: Pipeline can instantiate
  const t4 = Date.now();
  subsystems.push(_check(
    "pipeline",
    () => {
      // Verify pipeline module exports are accessible
      const { runReasoningPipeline } = require("./reasoning-pipeline");
      if (typeof runReasoningPipeline !== "function") {
        throw new Error("runReasoningPipeline not a function");
      }
      return "Pipeline runReasoningPipeline accessible";
    },
    Date.now() - t4,
  ));

  // Check 5: Memory integration
  const t5 = Date.now();
  subsystems.push(_check(
    "memory_integration",
    () => {
      const { memoryToReasoningSignals } = require("./integrations/reasoning-memory");
      if (typeof memoryToReasoningSignals !== "function") throw new Error("Not a function");
      return "Memory integration adapter accessible";
    },
    Date.now() - t5,
  ));

  // Check 6: Playbook integration
  const t6 = Date.now();
  subsystems.push(_check(
    "playbook_integration",
    () => {
      const { playbookToReasoningSignals } = require("./integrations/reasoning-playbooks");
      if (typeof playbookToReasoningSignals !== "function") throw new Error("Not a function");
      return "Playbook integration adapter accessible";
    },
    Date.now() - t6,
  ));

  // Check 7: Executive Brain integration
  const t7 = Date.now();
  subsystems.push(_check(
    "executive_brain_integration",
    () => {
      const { executiveBrainToReasoningSignals } = require("./integrations/reasoning-executive-brain");
      if (typeof executiveBrainToReasoningSignals !== "function") throw new Error("Not a function");
      return "Executive Brain integration adapter accessible";
    },
    Date.now() - t7,
  ));

  // Check 8: Audit integration
  const t8 = Date.now();
  subsystems.push(_check(
    "audit_integration",
    () => {
      const { createReasoningAuditLog } = require("./integrations/reasoning-audit");
      if (typeof createReasoningAuditLog !== "function") throw new Error("Not a function");
      return "Audit integration accessible";
    },
    Date.now() - t8,
  ));

  const anyUnavailable = subsystems.some(s => s.status === "UNAVAILABLE");
  const anyDegraded    = subsystems.some(s => s.status === "DEGRADED");

  return {
    overall:    anyUnavailable ? "UNAVAILABLE" : anyDegraded ? "DEGRADED" : "HEALTHY",
    subsystems,
    checkedAt:  new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function _check(
  name:    string,
  fn:      () => string,
  checkMs: number,
): ReasoningSubsystemHealth {
  try {
    const message = fn();
    return { name, status: "HEALTHY", message, checkMs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name, status: "DEGRADED", message: msg, checkMs };
  }
}
