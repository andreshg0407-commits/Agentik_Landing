/**
 * lib/autonomous/index.ts
 *
 * Agentik — Autonomous Operations — Client-Safe Barrel
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * CLIENT-SAFE: exports only pure domain symbols.
 * Do NOT export anything that imports server-only, Prisma, or agent-runtime.
 *
 * Server-side executor:
 *   import { executeAutonomousOperation } from "@/lib/autonomous/autonomous-executor";
 */

// ── Core types ────────────────────────────────────────────────────────────────
export type {
  AutonomousRiskLevel,
  AutonomousPolicy,
  AutonomousExecutionStatus,
  AutonomousOperation,
  AutonomousExecution,
  AutonomousDecision,
} from "./autonomous-types";

// ── Result ────────────────────────────────────────────────────────────────────
export type { AutonomousResult } from "./autonomous-result";
export {
  blockedResult,
  skippedResult,
  escalatedResult,
  completedResult,
  failedResult,
} from "./autonomous-result";

// ── Events ────────────────────────────────────────────────────────────────────
export type { AutonomousEventType, AutonomousEvent } from "./autonomous-events";
export { createAutonomousEvent } from "./autonomous-events";

// ── Policy engine ─────────────────────────────────────────────────────────────
export {
  resolvePolicy,
  isAutoAllowed,
  requiresApproval,
  isBlocked,
  POLICY_RULES,
} from "./autonomous-policy-engine";
export type { PolicyResolution } from "./autonomous-policy-engine";

// ── Risk engine ───────────────────────────────────────────────────────────────
export { evaluateRisk, makeAutonomousDecision } from "./autonomous-risk-engine";
export type { RiskEvaluation } from "./autonomous-risk-engine";

// ── Audit log ─────────────────────────────────────────────────────────────────
export { AutonomousAuditLog } from "./autonomous-audit";
export type { AutonomousAuditEntry } from "./autonomous-audit";

// ── Safety ────────────────────────────────────────────────────────────────────
export {
  MAX_OPERATIONS_PER_RUN,
  MAX_CHAIN_DEPTH,
  MAX_AUTONOMOUS_RETRIES,
  hasExceededOperationLimit,
  hasExceededDepth,
  hasExceededRetryLimit,
  checkSafetyLimits,
} from "./autonomous-safety";
export type { SafetyCheckResult } from "./autonomous-safety";

// ── Feature flags / kill switch ───────────────────────────────────────────────
export {
  isAutonomousModeEnabled,
  enableAutonomousMode,
  disableAutonomousMode,
  getEnabledTenants,
} from "./autonomous-feature-flags";

// ── Recovery ──────────────────────────────────────────────────────────────────
export {
  isExecutionStuck,
  isTerminalStatus,
  isRetryable,
  assessRecovery,
} from "./autonomous-recovery";
export type { RecoveryAssessment, AutonomousRecoveryAction } from "./autonomous-recovery";
