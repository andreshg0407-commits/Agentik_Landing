/**
 * lib/decisions/decision-audit.ts
 *
 * Agentik — Decision Engine Audit & Validation
 * Sprint: AGENTIK-DECISION-ENGINE-01
 *
 * Validation helpers and audit event factory for the Decision Engine.
 * Never throws — always returns structured results.
 *
 * Pure domain. No Prisma. No React. No Next.
 */

import type { DecisionAuditEvent, DecisionEventType, DecisionRunId } from "./decision-types";

// ── Validation result ─────────────────────────────────────────────────────────

export interface AuditValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

// ── Validators ────────────────────────────────────────────────────────────────

export function validateDecisionContext(ctx: unknown): AuditValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!ctx || typeof ctx !== "object") {
    return { valid: false, errors: ["context must be a non-null object"], warnings };
  }

  const c = ctx as Record<string, unknown>;

  if (!c.orgSlug  || typeof c.orgSlug  !== "string") errors.push("orgSlug is required");
  if (!c.agentId  || typeof c.agentId  !== "string") errors.push("agentId is required");
  if (!c.agentName|| typeof c.agentName !== "string") errors.push("agentName is required");
  if (!c.module   || typeof c.module   !== "string") errors.push("module is required");
  if (!c.businessDate || typeof c.businessDate !== "string") errors.push("businessDate is required");

  if (!Array.isArray(c.signals)) {
    errors.push("signals must be an array");
  } else if ((c.signals as unknown[]).length === 0) {
    warnings.push("signals array is empty — engine will produce no recommendations");
  }

  if (!Array.isArray(c.activeTasks))      warnings.push("activeTasks should be an array");
  if (!Array.isArray(c.pendingApprovals)) warnings.push("pendingApprovals should be an array");
  if (!Array.isArray(c.recentExecutions)) warnings.push("recentExecutions should be an array");
  if (!Array.isArray(c.workflowRuns))     warnings.push("workflowRuns should be an array");

  return { valid: errors.length === 0, errors, warnings };
}

export function validateDecisionSignal(signal: unknown): AuditValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!signal || typeof signal !== "object") {
    return { valid: false, errors: ["signal must be a non-null object"], warnings };
  }

  const s = signal as Record<string, unknown>;

  if (!s.id         || typeof s.id         !== "string") errors.push("signal.id is required");
  if (!s.type       || typeof s.type       !== "string") errors.push("signal.type is required");
  if (!s.domain     || typeof s.domain     !== "string") errors.push("signal.domain is required");
  if (!s.severity   || typeof s.severity   !== "string") errors.push("signal.severity is required");
  if (!s.title      || typeof s.title      !== "string") errors.push("signal.title is required");
  if (!s.detectedAt || typeof s.detectedAt !== "string") errors.push("signal.detectedAt is required");

  if (!s.description || typeof s.description !== "string") {
    warnings.push("signal.description is recommended");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateDecisionRecommendation(rec: unknown): AuditValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!rec || typeof rec !== "object") {
    return { valid: false, errors: ["recommendation must be a non-null object"], warnings };
  }

  const r = rec as Record<string, unknown>;

  if (!r.id         || typeof r.id         !== "string") errors.push("recommendation.id is required");
  if (!r.actionType || typeof r.actionType !== "string") errors.push("recommendation.actionType is required");
  if (!r.domain     || typeof r.domain     !== "string") errors.push("recommendation.domain is required");

  if (typeof r.score !== "number") {
    errors.push("recommendation.score must be a number");
  } else if (r.score < 0 || r.score > 100) {
    errors.push(`recommendation.score must be 0–100, got ${r.score}`);
  }

  if (!r.reasoning || typeof r.reasoning !== "string") {
    warnings.push("recommendation.reasoning is recommended for explainability");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function auditDecisionRun(
  _runId: DecisionRunId,
  results: {
    signalCount:         number;
    recommendationCount: number;
    dismissedCount:      number;
    errors:              string[];
    warnings:            string[];
  },
): AuditValidationResult {
  const errors:   string[] = [...results.errors];
  const warnings: string[] = [...results.warnings];

  if (results.signalCount === 0) {
    warnings.push("Decision run had no signals to evaluate");
  }
  if (results.recommendationCount === 0 && results.signalCount > 0) {
    warnings.push("No recommendations generated despite signals — check rule conditions");
  }
  if (results.dismissedCount > results.signalCount * 0.8 && results.signalCount > 2) {
    warnings.push("More than 80% of signals were dismissed — rule conditions may be too restrictive");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Audit event factory ───────────────────────────────────────────────────────

let _counter = 0;

export function createDecisionAuditEvent(
  runId:     DecisionRunId,
  event:     DecisionEventType,
  message:   string,
  metadata?: Record<string, unknown>,
): DecisionAuditEvent {
  _counter++;
  return {
    id:         `dae_${Date.now()}_${(_counter).toString(36)}`,
    runId,
    event,
    message,
    metadata,
    occurredAt: new Date().toISOString(),
  };
}
