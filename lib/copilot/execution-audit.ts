/**
 * lib/copilot/execution-audit.ts
 *
 * Agentik Copilot — Execution Audit Trail V1
 *
 * Every Copilot action execution is recorded here.
 * V1: interface contract + mock adapter (console output only).
 * V2: adapter backed by Prisma.CopilotExecutionLog.
 *
 * Design principles:
 *   - The audit contract is PERMANENT — never remove fields.
 *   - The adapter is swappable — swap mock → real without touching callers.
 *   - Audit entries are append-only — no updates, no deletes.
 *   - Failures are also audited — every attempt, successful or not.
 *
 * Sprint: AGENTIK-COPILOT-EXECUTION-LAYER-01
 */

import type { ExecutionResultStatus } from "./execution-handlers";

// ── V2: Audit event types (bundle lifecycle + governance) ─────────────────────

export type CopilotAuditEventType =
  | "action_executed"     // V1: a Copilot action was dispatched
  | "action_blocked"      // V1: a Copilot action was blocked by policy
  | "action_confirmed"    // V1: user confirmed an action
  | "bundle_created"      // V2: an execution bundle was prepared
  | "bundle_blocked"      // V2: a bundle was blocked by dependencies
  | "approval_requested"  // V2: an approval request was generated
  | "approval_granted"    // V2: an approval was granted by an operator
  | "execution_queued"    // V2: a bundle entered the execution queue
  | "execution_paused"    // V2: execution was suspended mid-run
  | "governance_denied";  // V2: governance engine denied execution

// ── Audit entry ────────────────────────────────────────────────────────────────

export interface CopilotExecutionAuditEntry {
  // Identity
  id:                  string;   // Unique audit record ID
  executionRequestId:  string;   // References CopilotExecutionRequest.id
  actionId:            string;   // References CopilotExecutableAction.id
  // V2 additions
  eventType?:          CopilotAuditEventType; // Specific lifecycle event
  bundleId?:           string;   // References ExecutionBundle.id
  approvalLevel?:      string;   // Approval level at time of event
  governanceDecision?: string;   // "allowed" | "denied" | "conditional"

  // Agent + actor
  agentId:             string;
  userId?:             string;   // Operator who confirmed/approved
  orgSlug:             string;

  // Context
  module:              string;
  entityType?:         string;
  entityId?:           string;

  // Policy snapshot
  policyStatus:        string;   // ExecutionStatus at time of execution
  policyAllowed:       boolean;
  policyReason?:       string;

  // Result
  resultStatus:        ExecutionResultStatus;
  resultMessage:       string;
  targetPath?:         string;
  draftId?:            string;

  // Signal context
  sourceSignalId?:     string;
  confidence?:         number;   // 0–100

  // Safety
  safetyMessage?:      string;

  // Timestamp
  timestamp:           string;   // ISO 8601
}

// ── Adapter contract ───────────────────────────────────────────────────────────

export interface CopilotAuditAdapter {
  /**
   * Records an execution audit entry.
   * Implementations MUST be fire-and-forget safe (never throw to caller).
   */
  record(entry: CopilotExecutionAuditEntry): Promise<void>;

  /**
   * Retrieves recent entries for a given org + module.
   * V1 mock returns empty array; V2 queries Prisma.
   */
  getRecent(
    orgSlug: string,
    module:  string,
    limit?:  number,
  ): Promise<CopilotExecutionAuditEntry[]>;
}

// ── Mock adapter (V1) ──────────────────────────────────────────────────────────
//
// Logs to console only.
// In V2, replace with PrismaAuditAdapter that writes to CopilotExecutionLog.

class MockAuditAdapter implements CopilotAuditAdapter {
  async record(entry: CopilotExecutionAuditEntry): Promise<void> {
    if (process.env.NODE_ENV === "development") {
      console.log("[Copilot Audit]", {
        id:             entry.id,
        action:         entry.actionId,
        agent:          entry.agentId,
        org:            entry.orgSlug,
        module:         entry.module,
        result:         entry.resultStatus,
        policy:         entry.policyStatus,
        timestamp:      entry.timestamp,
      });
    }
    // V2: await prisma.copilotExecutionLog.create({ data: entry })
  }

  async getRecent(
    _orgSlug: string,
    _module:  string,
    _limit:   number = 20,
  ): Promise<CopilotExecutionAuditEntry[]> {
    // V2: return prisma.copilotExecutionLog.findMany({ where: { orgSlug, module }, take: limit })
    return [];
  }
}

// ── Singleton adapter ──────────────────────────────────────────────────────────

export const auditAdapter: CopilotAuditAdapter = new MockAuditAdapter();

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Records a Copilot execution audit entry.
 * Fire-and-forget safe — errors are swallowed to never block execution.
 */
/**
 * Records a bundle lifecycle audit event.
 * Convenience wrapper for V2 bundle events.
 */
export async function auditBundleEvent(params: {
  eventType:       CopilotAuditEventType;
  bundleId:        string;
  agentId:         string;
  orgSlug:         string;
  module:          string;
  approvalLevel?:  string;
  governanceDecision?: string;
  reason?:         string;
}): Promise<void> {
  return auditExecution({
    executionRequestId:   `bundle-${params.bundleId}`,
    actionId:             params.bundleId,
    agentId:              params.agentId,
    orgSlug:              params.orgSlug,
    module:               params.module,
    policyStatus:         "ready",
    policyAllowed:        true,
    policyReason:         params.reason,
    resultStatus:         "prepared",
    resultMessage:        `${params.eventType}: ${params.bundleId}`,
    eventType:            params.eventType,
    bundleId:             params.bundleId,
    approvalLevel:        params.approvalLevel,
    governanceDecision:   params.governanceDecision,
  });
}

export async function auditExecution(
  entry: Omit<CopilotExecutionAuditEntry, "id" | "timestamp">,
): Promise<void> {
  try {
    await auditAdapter.record({
      ...entry,
      id:        crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Audit failures MUST NOT crash execution — silently swallow
    if (process.env.NODE_ENV === "development") {
      console.warn("[Copilot Audit] Failed to record entry — check adapter");
    }
  }
}
