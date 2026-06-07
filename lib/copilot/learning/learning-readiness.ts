// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning readiness evaluation

import type { LearningContext } from "./learning-types";

export type LearningReadinessLevel =
  | "READY"
  | "PARTIAL"
  | "INSUFFICIENT"
  | "BLOCKED";

export interface LearningReadinessCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly isBlocker: boolean;
  readonly message: string;
}

export interface LearningReadinessReport {
  readonly level: LearningReadinessLevel;
  readonly checks: LearningReadinessCheck[];
  readonly warnings: string[];
  readonly evaluatedAt: string; // ISO8601
}

export const LEARNING_READINESS_THRESHOLDS = {
  minEvents: 1,
  minDomains: 1,
  minEventConfidence: 0.3,
} as const;

export function evaluateLearningReadiness(
  context: LearningContext
): LearningReadinessReport {
  const checks: LearningReadinessCheck[] = [];
  const warnings: string[] = [];

  // 1. orgSlug present (blocker)
  const hasOrgSlug = Boolean(context.orgSlug && context.orgSlug.trim() !== "");
  checks.push({
    name: "orgSlug_present",
    passed: hasOrgSlug,
    isBlocker: true,
    message: hasOrgSlug
      ? "orgSlug is present"
      : "orgSlug is missing — learning cannot proceed",
  });

  // 2. Tenant isolation (blocker)
  const foreignEvents = context.recentEvents.filter(
    (e) => e.orgSlug !== context.orgSlug
  );
  const isTenantIsolated = foreignEvents.length === 0;
  if (!isTenantIsolated) {
    warnings.push(`${foreignEvents.length} foreign tenant events detected`);
  }
  checks.push({
    name: "tenant_isolation",
    passed: isTenantIsolated,
    isBlocker: true,
    message: isTenantIsolated
      ? "Tenant isolation maintained"
      : `Cross-tenant violation: ${foreignEvents.length} foreign events`,
  });

  // 3. Minimum events
  const hasMinEvents =
    context.recentEvents.length >= LEARNING_READINESS_THRESHOLDS.minEvents;
  checks.push({
    name: "min_events",
    passed: hasMinEvents,
    isBlocker: false,
    message: hasMinEvents
      ? `${context.recentEvents.length} events available`
      : `Insufficient events (${context.recentEvents.length} / ${LEARNING_READINESS_THRESHOLDS.minEvents} required)`,
  });

  // 4. Domain coverage
  const hasDomains =
    context.domains.length >= LEARNING_READINESS_THRESHOLDS.minDomains;
  checks.push({
    name: "domain_coverage",
    passed: hasDomains,
    isBlocker: false,
    message: hasDomains
      ? `${context.domains.length} domains active`
      : `No active domains configured`,
  });

  // 5. Event quality
  const highQualityEvents = context.recentEvents.filter(
    (e) => e.confidenceScore >= LEARNING_READINESS_THRESHOLDS.minEventConfidence
  );
  const hasQualitySignals = highQualityEvents.length > 0;
  if (!hasQualitySignals && context.recentEvents.length > 0) {
    warnings.push("All events below minimum confidence threshold");
  }
  checks.push({
    name: "event_quality",
    passed: hasQualitySignals,
    isBlocker: false,
    message: hasQualitySignals
      ? `${highQualityEvents.length} high-quality events`
      : "No events meet minimum confidence threshold",
  });

  // Compute readiness level
  const blockersFailed = checks.filter((c) => c.isBlocker && !c.passed).length;
  const nonBlockersFailed = checks.filter((c) => !c.isBlocker && !c.passed).length;
  const allPassed = checks.every((c) => c.passed);

  let level: LearningReadinessLevel;
  if (blockersFailed > 0) {
    level = "BLOCKED";
  } else if (allPassed) {
    level = "READY";
  } else if (nonBlockersFailed >= 2) {
    level = "INSUFFICIENT";
  } else {
    level = "PARTIAL";
  }

  return {
    level,
    checks,
    warnings,
    evaluatedAt: new Date().toISOString(),
  };
}
