/**
 * lib/agents/runtime/agent-runtime-audit.ts
 *
 * Agentik — Agent Runtime Audit & Validation
 * Sprint: AGENTIK-AGENT-RUNTIME-01
 *
 * Validation helpers and audit event factory for the Agent Runtime.
 * Never throws — always returns structured results.
 *
 * Pure domain. No Prisma. No React. No Next.
 */

import type { AgentRuntimeAuditEvent, AgentRuntimeEventType, AgentRunId, AgentId } from "./agent-runtime-types";

// ── Validation result ─────────────────────────────────────────────────────────

export interface AgentRuntimeValidationResult {
  valid:    boolean;
  errors:   string[];
  warnings: string[];
}

// ── Validators ────────────────────────────────────────────────────────────────

export function validateAgentRuntimeContext(ctx: unknown): AgentRuntimeValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!ctx || typeof ctx !== "object") {
    return { valid: false, errors: ["context must be a non-null object"], warnings };
  }

  const c = ctx as Record<string, unknown>;

  if (!c.orgSlug       || typeof c.orgSlug     !== "string") errors.push("orgSlug is required");
  if (!c.agentProfile  || typeof c.agentProfile !== "object") errors.push("agentProfile is required");
  if (!c.module        || typeof c.module       !== "string") errors.push("module is required");
  if (!c.businessDate  || typeof c.businessDate !== "string") errors.push("businessDate is required");
  if (!c.runtimeMode   || typeof c.runtimeMode  !== "string") errors.push("runtimeMode is required");

  if (!Array.isArray(c.signals)) {
    errors.push("signals must be an array");
  } else if ((c.signals as unknown[]).length === 0) {
    warnings.push("signals array is empty — runtime will produce no proposed actions");
  }

  if (!Array.isArray(c.activeTasks))      warnings.push("activeTasks should be an array");
  if (!Array.isArray(c.pendingApprovals)) warnings.push("pendingApprovals should be an array");

  return { valid: errors.length === 0, errors, warnings };
}

export function validateAgentProfile(profile: unknown): AgentRuntimeValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!profile || typeof profile !== "object") {
    return { valid: false, errors: ["agentProfile must be a non-null object"], warnings };
  }

  const p = profile as Record<string, unknown>;

  if (!p.agentId     || typeof p.agentId     !== "string") errors.push("agentProfile.agentId is required");
  if (!p.name        || typeof p.name        !== "string") errors.push("agentProfile.name is required");
  if (!p.domain      || typeof p.domain      !== "string") errors.push("agentProfile.domain is required");
  if (typeof p.isActive !== "boolean")                    errors.push("agentProfile.isActive is required");
  if (!p.isActive)                                        errors.push("agentProfile.isActive must be true");

  if (!Array.isArray(p.allowedActionTypes))  warnings.push("allowedActionTypes should be an array");
  if (!Array.isArray(p.allowedDomains))      warnings.push("allowedDomains should be an array");

  return { valid: errors.length === 0, errors, warnings };
}

export function validateProposedAction(action: unknown): AgentRuntimeValidationResult {
  const errors:   string[] = [];
  const warnings: string[] = [];

  if (!action || typeof action !== "object") {
    return { valid: false, errors: ["proposedAction must be a non-null object"], warnings };
  }

  const a = action as Record<string, unknown>;

  if (!a.id           || typeof a.id           !== "string") errors.push("action.id is required");
  if (!a.type         || typeof a.type         !== "string") errors.push("action.type is required");
  if (!a.label        || typeof a.label        !== "string") errors.push("action.label is required");
  if (!a.targetDomain || typeof a.targetDomain !== "string") errors.push("action.targetDomain is required");
  if (typeof a.score  !== "number")                         errors.push("action.score must be a number");
  if (typeof a.score  === "number" && (a.score < 0 || a.score > 100)) {
    errors.push(`action.score must be 0–100, got ${a.score}`);
  }
  if (typeof a.requiresApproval !== "boolean") {
    warnings.push("action.requiresApproval should be a boolean");
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function auditAgentRuntimeRun(
  _runId: AgentRunId,
  results: {
    signalCount:       number;
    actionCount:       number;
    filteredCount:     number;
    errors:            string[];
    warnings:          string[];
  },
): AgentRuntimeValidationResult {
  const errors:   string[] = [...results.errors];
  const warnings: string[] = [...results.warnings];

  if (results.signalCount === 0) {
    warnings.push("Agent runtime had no signals to analyze");
  }
  if (results.actionCount === 0 && results.signalCount > 0) {
    warnings.push("No proposed actions generated despite signals — check permissions and mode");
  }
  if (results.filteredCount > 0) {
    warnings.push(`${results.filteredCount} recommendation(s) filtered by permission/mode constraints`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Audit event factory ───────────────────────────────────────────────────────

let _counter = 0;

export function createAgentRuntimeAuditEvent(
  runId:     AgentRunId,
  agentId:   AgentId,
  event:     AgentRuntimeEventType,
  message:   string,
  metadata?: Record<string, unknown>,
): AgentRuntimeAuditEvent {
  _counter++;
  return {
    id:         `arae_${Date.now()}_${(_counter).toString(36)}`,
    runId,
    agentId,
    event,
    message,
    metadata,
    occurredAt: new Date().toISOString(),
  };
}
