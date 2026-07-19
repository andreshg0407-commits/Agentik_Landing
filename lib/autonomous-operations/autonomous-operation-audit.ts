/**
 * lib/autonomous-operations/autonomous-operation-audit.ts
 *
 * Agentik — Autonomous Operations Audit & Validation
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * Validation helpers and audit event factory.
 * Never throws — always returns structured results.
 *
 * Pure domain. No Prisma. No React. No Next.
 */

import type {
  AutonomousOperationAuditEvent,
  AutonomousOperationEventType,
  AutonomousOperationPlanId,
  AutonomousOperationPlan,
} from "./autonomous-operation-types";

// ── Validation result ─────────────────────────────────────────────────────────

export interface AutonomousOperationValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

// ── Input validator ───────────────────────────────────────────────────────────

export function validateAutonomousOperationInput(input: unknown): AutonomousOperationValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["input must be a non-null object"], warnings };
  }

  const i = input as Record<string, unknown>;

  if (!i.orgSlug       || typeof i.orgSlug       !== "string") errors.push("orgSlug is required");
  if (!i.agentId       || typeof i.agentId       !== "string") errors.push("agentId is required");
  if (!i.agentName     || typeof i.agentName     !== "string") errors.push("agentName is required");
  if (!i.agentDomain   || typeof i.agentDomain   !== "string") errors.push("agentDomain is required");
  if (!i.runtimeMode   || typeof i.runtimeMode   !== "string") errors.push("runtimeMode is required");
  if (!i.proposedAction || typeof i.proposedAction !== "object") {
    errors.push("proposedAction is required");
  } else {
    const pa = i.proposedAction as Record<string, unknown>;
    if (!pa.id    || typeof pa.id    !== "string") errors.push("proposedAction.id is required");
    if (!pa.type  || typeof pa.type  !== "string") errors.push("proposedAction.type is required");
    if (typeof pa.score !== "number")              errors.push("proposedAction.score must be a number");
    if (typeof pa.score === "number" && (pa.score < 0 || pa.score > 100)) {
      errors.push(`proposedAction.score must be 0–100, got ${pa.score}`);
    }
  }

  if (!Array.isArray(i.metadata) && typeof i.metadata !== "object") {
    warnings.push("metadata should be an object");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Plan validator ────────────────────────────────────────────────────────────

export function validateAutonomousOperationPlan(plan: unknown): AutonomousOperationValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!plan || typeof plan !== "object") {
    return { valid: false, errors: ["plan must be a non-null object"], warnings };
  }

  const p = plan as Record<string, unknown>;

  if (!p.id           || typeof p.id           !== "string") errors.push("plan.id is required");
  if (!p.agentId      || typeof p.agentId      !== "string") errors.push("plan.agentId is required");
  if (!p.orgSlug      || typeof p.orgSlug      !== "string") errors.push("plan.orgSlug is required");
  if (!p.status       || typeof p.status       !== "string") errors.push("plan.status is required");
  if (!p.decision     || typeof p.decision     !== "string") errors.push("plan.decision is required");
  if (!p.riskLevel    || typeof p.riskLevel    !== "string") errors.push("plan.riskLevel is required");
  if (!p.actionType   || typeof p.actionType   !== "string") errors.push("plan.actionType is required");
  if (!p.targetDomain || typeof p.targetDomain !== "string") errors.push("plan.targetDomain is required");
  if (!p.title        || typeof p.title        !== "string") errors.push("plan.title is required");

  if (typeof p.requiresApproval         !== "boolean") warnings.push("plan.requiresApproval should be boolean");
  if (typeof p.requiresHumanConfirmation !== "boolean") warnings.push("plan.requiresHumanConfirmation should be boolean");
  if (typeof p.canAutoExecute           !== "boolean") warnings.push("plan.canAutoExecute should be boolean");

  return { valid: errors.length === 0, errors, warnings };
}

// ── Run audit ─────────────────────────────────────────────────────────────────

export function auditAutonomousOperationRun(
  _planId: AutonomousOperationPlanId,
  results: {
    decision:      string;
    status:        string;
    errors:        string[];
    warnings:      string[];
    hasTaskDraft:  boolean;
    hasApprovalDraft: boolean;
  },
): AutonomousOperationValidationResult {
  const errors:   string[] = [...results.errors];
  const warnings: string[] = [...results.warnings];

  if (results.decision === "BLOCK" && results.errors.length === 0) {
    warnings.push("Operation was blocked but no specific error was recorded");
  }
  if (results.status === "READY_TO_EXECUTE" && !results.hasTaskDraft && !results.hasApprovalDraft) {
    warnings.push("Plan is READY_TO_EXECUTE but has no draft artifacts");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Audit event factory ───────────────────────────────────────────────────────

let _counter = 0;

export function createAutonomousOperationAuditEvent(
  planId:    AutonomousOperationPlanId,
  agentId:   string,
  orgSlug:   string,
  event:     AutonomousOperationEventType,
  message:   string,
  metadata?: Record<string, unknown>,
): AutonomousOperationAuditEvent {
  _counter++;
  return {
    id:         `aoe_${Date.now()}_${(_counter).toString(36)}`,
    planId,
    agentId,
    orgSlug,
    event,
    message,
    metadata,
    occurredAt: new Date().toISOString(),
  };
}

// ── Plan audit append (pure helper) ──────────────────────────────────────────

export function appendPlanAuditEvent(
  plan:      AutonomousOperationPlan,
  event:     AutonomousOperationEventType,
  message:   string,
  metadata?: Record<string, unknown>,
): AutonomousOperationPlan {
  const auditEvent = createAutonomousOperationAuditEvent(
    plan.id, plan.agentId, plan.orgSlug, event, message, metadata,
  );
  return {
    ...plan,
    auditTrail: [...plan.auditTrail, auditEvent],
  };
}
