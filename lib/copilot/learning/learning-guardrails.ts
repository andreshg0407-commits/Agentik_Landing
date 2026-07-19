// AGENTIK-INTELLIGENCE-AGENT-LEARNING-FRAMEWORK-01
// Learning guardrails — enforce safety constraints, never auto-apply critical changes

import type {
  LearningEvent,
  LearningPattern,
  LearningAdjustment,
  LearningDomain,
} from "./learning-types";

export type GuardrailViolation =
  | "NO_EVIDENCE"
  | "CROSS_TENANT_VIOLATION"
  | "INSUFFICIENT_EVENTS"
  | "CRITICAL_AUTO_CHANGE"
  | "DEPRECATED_PATTERN"
  | "UNKNOWN_DOMAIN";

export interface GuardrailResult {
  readonly passed: boolean;
  readonly violations: GuardrailViolation[];
  readonly warnings: string[];
}

const MIN_EVENTS_FOR_PATTERN_CREATION = 1;
const MIN_EVENTS_FOR_ADJUSTMENT = 2;
const CRITICAL_MAGNITUDE_THRESHOLD = 0.25;

export function validateLearningEvent(
  event: LearningEvent,
  expectedOrgSlug: string
): GuardrailResult {
  const violations: GuardrailViolation[] = [];
  const warnings: string[] = [];

  if (event.orgSlug !== expectedOrgSlug) {
    violations.push("CROSS_TENANT_VIOLATION");
  }

  if (!event.referenceId || event.referenceId.trim() === "") {
    violations.push("NO_EVIDENCE");
  }

  if (event.confidenceScore < 0.1) {
    warnings.push("Very low confidence score — signal may be unreliable");
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings,
  };
}

export function validatePatternCreation(
  orgSlug: string,
  seedEventOrgSlug: string,
  evidenceEventIds: string[]
): GuardrailResult {
  const violations: GuardrailViolation[] = [];
  const warnings: string[] = [];

  if (orgSlug !== seedEventOrgSlug) {
    violations.push("CROSS_TENANT_VIOLATION");
  }

  if (evidenceEventIds.length < MIN_EVENTS_FOR_PATTERN_CREATION) {
    violations.push("NO_EVIDENCE");
  }

  return { passed: violations.length === 0, violations, warnings };
}

export function validateAdjustmentApplication(
  adjustment: LearningAdjustment,
  patternEventCount: number
): GuardrailResult {
  const violations: GuardrailViolation[] = [];
  const warnings: string[] = [];

  if (patternEventCount < MIN_EVENTS_FOR_ADJUSTMENT) {
    violations.push("INSUFFICIENT_EVENTS");
  }

  if (adjustment.magnitude >= CRITICAL_MAGNITUDE_THRESHOLD) {
    violations.push("CRITICAL_AUTO_CHANGE");
    warnings.push(
      `Adjustment magnitude ${(adjustment.magnitude * 100).toFixed(1)}% exceeds critical threshold. Manual approval required.`
    );
  }

  return { passed: violations.length === 0, violations, warnings };
}

export function validateCrossTenantIsolation(
  events: LearningEvent[],
  orgSlug: string
): GuardrailResult {
  const violations: GuardrailViolation[] = [];
  const warnings: string[] = [];
  const foreign = events.filter((e) => e.orgSlug !== orgSlug);

  if (foreign.length > 0) {
    violations.push("CROSS_TENANT_VIOLATION");
    warnings.push(`${foreign.length} events from foreign tenants detected and blocked`);
  }

  return { passed: violations.length === 0, violations, warnings };
}

export function filterTenantEvents(
  events: LearningEvent[],
  orgSlug: string
): LearningEvent[] {
  return events.filter((e) => e.orgSlug === orgSlug);
}

export function filterTenantPatterns(
  patterns: LearningPattern[],
  orgSlug: string
): LearningPattern[] {
  return patterns.filter((p) => p.orgSlug === orgSlug);
}

export function assertTenantIsolation(
  orgSlug: string,
  entityOrgSlug: string,
  entityType: string
): void {
  if (orgSlug !== entityOrgSlug) {
    throw new Error(
      `Tenant isolation violation: ${entityType} belongs to "${entityOrgSlug}", not "${orgSlug}"`
    );
  }
}
