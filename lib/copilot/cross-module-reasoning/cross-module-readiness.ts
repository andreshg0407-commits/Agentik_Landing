/**
 * lib/copilot/cross-module-reasoning/cross-module-readiness.ts
 *
 * AGENTIK-INTELLIGENCE-CROSS-MODULE-REASONING-01
 * Readiness gate for the Cross-Module Reasoning layer.
 * Pure domain — no server-only. Evaluates whether a context is ready to reason.
 */

import type { ReasoningContext, ReasoningSourceDomain } from "./cross-module-types";

// ── Readiness types ───────────────────────────────────────────────────────────

export type ReadinessLevel =
  | "READY"          // sufficient signals and domains covered
  | "PARTIAL"        // some signals but limited coverage
  | "INSUFFICIENT"   // too few signals to reason
  | "BLOCKED";       // context invariant violated

export interface ReadinessCheck {
  name:     string;
  passed:   boolean;
  message:  string;
  blocker:  boolean;  // if true, blocks reasoning entirely
}

export interface ReadinessReport {
  orgSlug:    string;
  level:      ReadinessLevel;
  checks:     ReadinessCheck[];
  canReason:  boolean;
  reason:     string;
  checkedAt:  string;
}

// ── Readiness thresholds ──────────────────────────────────────────────────────

export const READINESS_THRESHOLDS = {
  minSignals:       2,
  minDomains:       1,
  minConfidence:    0.10,
  targetSignals:    5,
  targetDomains:    2,
} as const;

// ── Check functions ───────────────────────────────────────────────────────────

function checkOrgSlugPresent(ctx: ReasoningContext): ReadinessCheck {
  const passed = typeof ctx.orgSlug === "string" && ctx.orgSlug.length > 0;
  return {
    name:    "org-slug",
    passed,
    message: passed ? `orgSlug: ${ctx.orgSlug}` : "orgSlug is missing or empty",
    blocker: true,
  };
}

function checkSignalCount(ctx: ReasoningContext): ReadinessCheck {
  const count  = ctx.signals.length;
  const passed = count >= READINESS_THRESHOLDS.minSignals;
  return {
    name:    "signal-count",
    passed,
    message: `${count} signals (min: ${READINESS_THRESHOLDS.minSignals}, target: ${READINESS_THRESHOLDS.targetSignals})`,
    blocker: false,
  };
}

function checkDomainCoverage(ctx: ReasoningContext): ReadinessCheck {
  const domains = [...new Set(ctx.signals.map(s => s.domain))];
  const passed  = domains.length >= READINESS_THRESHOLDS.minDomains;
  return {
    name:    "domain-coverage",
    passed,
    message: `${domains.length} domain(s) covered: ${domains.join(", ")}`,
    blocker: false,
  };
}

function checkTenantIsolation(ctx: ReasoningContext): ReadinessCheck {
  const violations = ctx.signals.filter(s => s.orgSlug !== ctx.orgSlug);
  const passed     = violations.length === 0;
  return {
    name:    "tenant-isolation",
    passed,
    message: passed
      ? "All signals scoped to correct org"
      : `${violations.length} cross-tenant signal(s) detected — blocked`,
    blocker: true,
  };
}

function checkSignalQuality(ctx: ReasoningContext): ReadinessCheck {
  if (ctx.signals.length === 0) {
    return { name: "signal-quality", passed: false, message: "No signals to evaluate", blocker: false };
  }
  const avgConfidence = ctx.signals.reduce((s, sig) => s + sig.confidence, 0) / ctx.signals.length;
  const passed        = avgConfidence >= READINESS_THRESHOLDS.minConfidence;
  return {
    name:    "signal-quality",
    passed,
    message: `Avg confidence: ${avgConfidence.toFixed(2)} (min: ${READINESS_THRESHOLDS.minConfidence})`,
    blocker: false,
  };
}

// ── Main readiness evaluation ─────────────────────────────────────────────────

export function evaluateReadiness(ctx: ReasoningContext): ReadinessReport {
  const checks: ReadinessCheck[] = [
    checkOrgSlugPresent(ctx),
    checkTenantIsolation(ctx),
    checkSignalCount(ctx),
    checkDomainCoverage(ctx),
    checkSignalQuality(ctx),
  ];

  const blocked   = checks.some(c => c.blocker && !c.passed);
  const allPassed = checks.every(c => c.passed);
  const somePassed = checks.filter(c => c.passed).length >= 3;

  let level: ReadinessLevel;
  let canReason: boolean;
  let reason: string;

  if (blocked) {
    level     = "BLOCKED";
    canReason = false;
    reason    = checks.find(c => c.blocker && !c.passed)?.message ?? "Blocking invariant failed";
  } else if (allPassed) {
    level     = "READY";
    canReason = true;
    reason    = `All ${checks.length} readiness checks passed`;
  } else if (somePassed) {
    level     = "PARTIAL";
    canReason = true;
    reason    = "Partial readiness — reasoning will run with limited confidence";
  } else {
    level     = "INSUFFICIENT";
    canReason = false;
    reason    = "Insufficient signals or domain coverage for reasoning";
  }

  return {
    orgSlug:   ctx.orgSlug,
    level,
    checks,
    canReason,
    reason,
    checkedAt: new Date().toISOString(),
  };
}

// ── Domain readiness helpers ───────────────────────────────────────────────────

export function getCoveredDomains(ctx: ReasoningContext): ReasoningSourceDomain[] {
  return [...new Set(ctx.signals.map(s => s.domain))];
}

export function getMissingDomains(
  ctx:             ReasoningContext,
  requiredDomains: ReasoningSourceDomain[],
): ReasoningSourceDomain[] {
  const covered = getCoveredDomains(ctx);
  return requiredDomains.filter(d => !covered.includes(d));
}

export function isReadyForDomain(
  ctx:    ReasoningContext,
  domain: ReasoningSourceDomain,
): boolean {
  return ctx.signals.some(s => s.domain === domain && s.orgSlug === ctx.orgSlug);
}
