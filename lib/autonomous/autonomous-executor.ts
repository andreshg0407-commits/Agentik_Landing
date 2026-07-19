/**
 * lib/autonomous/autonomous-executor.ts
 *
 * Agentik — Autonomous Operations — Executor
 * Sprint: AGENTIK-AUTONOMOUS-OPERATIONS-01
 *
 * The central orchestrator for autonomous execution.
 *
 * Execution pipeline:
 *   1. Kill switch — isAutonomousModeEnabled()
 *   2. Safety limits — operation count, chain depth, retry count
 *   3. Risk evaluation — evaluateRisk(operation, agent)
 *   4. Policy resolution — resolvePolicy(riskLevel)
 *   5. Decision — allowed / requiresApproval / blocked
 *   6. Execute:
 *      AUTO_ALLOWED      → executeGoal(agentId, context)
 *      APPROVAL_REQUIRED → executeGoal() with approval-creating goal → ESCALATED
 *      MANUAL_ONLY       → BLOCKED (no execution)
 *   7. Audit recording
 *   8. Return AutonomousResult
 *
 * CRITICAL INVARIANTS:
 *   - Never create tasks/approvals/workflows directly.
 *   - All execution MUST go through executeGoal() from agent-runtime.
 *   - Kill switch check is always the FIRST step.
 *   - Never throws — always returns structured AutonomousResult.
 *
 * SERVER-ONLY — imports agent-runtime transitively.
 */
import "server-only";

import { randomUUID }              from "crypto";
import type { AutonomousOperation, AutonomousDecision } from "./autonomous-types";
import type { AutonomousResult }   from "./autonomous-result";
import {
  blockedResult,
  skippedResult,
  escalatedResult,
  completedResult,
  failedResult,
}                                  from "./autonomous-result";
import { isAutonomousModeEnabled } from "./autonomous-feature-flags";
import { checkSafetyLimits }       from "./autonomous-safety";
import { makeAutonomousDecision }  from "./autonomous-risk-engine";
import { AutonomousAuditLog }      from "./autonomous-audit";
import { resolveAgent }            from "../agents/runtime/agent-resolver";
import { executeGoal }             from "../agents/runtime/agent-runtime";
import type { AgentExecutionContext, AgentGoal } from "../agents/runtime/agent-types";

// ── Execution context factory ─────────────────────────────────────────────────

function buildContext(
  operation:      AutonomousOperation,
  goal:           AgentGoal,
  correlationId:  string,
): AgentExecutionContext {
  return {
    orgSlug:  operation.orgSlug,
    actor:    { id: "autonomous_executor", type: "system" },
    goal,
    memory:   {},
    metadata: {
      operationId:      operation.id,
      source:           operation.source,
      correlationId,
      isAutonomous:     true,
      chainDepth:       operation.chainDepth ?? 0,
      retryCount:       operation.retryCount ?? 0,
      idempotencyKey:   operation.idempotencyKey,
    },
  };
}

// ── Approval goal builder ─────────────────────────────────────────────────────

/**
 * Build a goal that forces the agent to CREATE_APPROVAL.
 * Used for APPROVAL_REQUIRED decisions — the agent creates an approval
 * request for the original goal, then humans decide whether to proceed.
 */
function buildApprovalGoal(operation: AutonomousOperation): AgentGoal {
  return {
    type:             operation.goal.type,
    description:      `Aprobación requerida para operación autónoma: ${operation.goal.description}`,
    priority:         "high",  // forces agent planner to use CREATE_APPROVAL step
    targetEntityId:   operation.goal.targetEntityId,
    targetEntityType: operation.goal.targetEntityType,
    metadata: {
      ...operation.goal.metadata,
      autonomousAction:    "CREATE_APPROVAL",
      originalOperationId: operation.id,
      requiresApproval:    true,
    },
  };
}

// ── Extract approval ID from agent result ─────────────────────────────────────

function extractApprovalId(output: Record<string, unknown> | undefined): string | undefined {
  if (!output) return undefined;
  for (const val of Object.values(output)) {
    if (val && typeof val === "object" && "approvalId" in (val as Record<string, unknown>)) {
      return (val as Record<string, unknown>).approvalId as string;
    }
  }
  return undefined;
}

// ── Executor ──────────────────────────────────────────────────────────────────

export interface ExecutorOptions {
  operationCount?: number;
  chainDepth?:     number;
  retryCount?:     number;
}

/**
 * Execute one AutonomousOperation through the full pipeline.
 * Never throws — always returns a structured AutonomousResult.
 */
export async function executeAutonomousOperation(
  operation: AutonomousOperation,
  opts:      ExecutorOptions = {},
): Promise<AutonomousResult & { auditLog: AutonomousAuditLog }> {
  const executionId = randomUUID();
  const audit       = new AutonomousAuditLog(operation.id, operation.orgSlug);

  audit.record("operation_created", `Autonomous operation received: ${operation.goal.description}`, {
    operationId: operation.id,
    source:      operation.source,
    agentId:     operation.agentId,
    goalType:    operation.goal.type,
    priority:    operation.goal.priority,
  });

  // ── Step 1: Kill switch ────────────────────────────────────────────────────

  if (!isAutonomousModeEnabled(operation.orgSlug)) {
    const reason = `Autonomous mode is disabled for org "${operation.orgSlug}". Operation skipped.`;
    audit.record("operation_blocked", reason, { reason: "kill_switch_off" });
    const fallbackDecision: AutonomousDecision = {
      allowed: false, requiresApproval: false,
      reason, riskLevel: operation.riskLevel, policy: operation.policy,
    };
    return { ...skippedResult(fallbackDecision, reason), auditLog: audit };
  }

  // ── Step 2: Safety limits ─────────────────────────────────────────────────

  const safety = checkSafetyLimits({
    operationCount: opts.operationCount ?? 0,
    chainDepth:     opts.chainDepth     ?? (operation.chainDepth ?? 0),
    retryCount:     opts.retryCount     ?? (operation.retryCount ?? 0),
  });

  if (!safety.safe) {
    audit.record("operation_blocked", safety.reason, { reason: "safety_limit" });
    const fallbackDecision: AutonomousDecision = {
      allowed: false, requiresApproval: false,
      reason: safety.reason, riskLevel: operation.riskLevel, policy: "MANUAL_ONLY",
    };
    return { ...blockedResult(fallbackDecision, safety.reason), auditLog: audit };
  }

  // ── Step 3: Resolve agent ─────────────────────────────────────────────────

  const agent = resolveAgent(operation.agentId);
  if (!agent) {
    const reason = `Agent "${operation.agentId}" not found in registry.`;
    audit.record("operation_failed", reason, { agentId: operation.agentId });
    const fallbackDecision: AutonomousDecision = {
      allowed: false, requiresApproval: false,
      reason, riskLevel: operation.riskLevel, policy: "MANUAL_ONLY",
    };
    return { ...failedResult(fallbackDecision, reason), auditLog: audit };
  }

  // ── Step 4: Risk + policy evaluation → decision ───────────────────────────

  const decision = makeAutonomousDecision(operation, agent);

  audit.record("decision_made", `Decision: ${decision.policy} — ${decision.reason}`, {
    riskLevel:        decision.riskLevel,
    policy:           decision.policy,
    allowed:          decision.allowed,
    requiresApproval: decision.requiresApproval,
  });

  // ── Step 5: MANUAL_ONLY → BLOCKED ─────────────────────────────────────────

  if (!decision.allowed) {
    const reason = `Operation blocked by policy MANUAL_ONLY: ${decision.reason}`;
    audit.record("operation_blocked", reason, { policy: decision.policy, riskLevel: decision.riskLevel });
    return { ...blockedResult(decision, reason), auditLog: audit };
  }

  // ── Step 6: APPROVAL_REQUIRED → create approval via executeGoal() ─────────

  if (decision.requiresApproval) {
    audit.record("operation_started", "Creating approval request via Agent Runtime.", {
      agentId: operation.agentId,
      reason:  "APPROVAL_REQUIRED",
    });

    try {
      const approvalGoal = buildApprovalGoal(operation);
      const correlationId = `autonomous:${operation.orgSlug}:${operation.id}:approval`;
      const ctx           = buildContext(operation, approvalGoal, correlationId);

      const runtimeResult = await executeGoal(operation.agentId, ctx);

      const approvalId = extractApprovalId(runtimeResult.result?.output);

      if (runtimeResult.success && approvalId) {
        const msg = `Aprobación creada exitosamente: ${approvalId}. Esperando revisión humana.`;
        audit.record("operation_escalated", msg, {
          approvalId,
          executionId,
          agentStatus: runtimeResult.result?.status,
        });
        return { ...escalatedResult(decision, approvalId, msg), executionId, auditLog: audit };
      }

      // Agent ran but didn't produce an approvalId — still escalated
      const fallbackMsg = `Operación escalada para aprobación humana (approvalId no disponible).`;
      audit.record("operation_escalated", fallbackMsg, {
        agentSuccess: runtimeResult.success,
        agentError:   runtimeResult.error,
      });
      return {
        ...escalatedResult(decision, executionId, fallbackMsg),
        executionId,
        auditLog: audit,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error inesperado al crear aprobación.";
      audit.record("operation_failed", msg, { error: msg });
      return { ...failedResult(decision, msg), auditLog: audit };
    }
  }

  // ── Step 7: AUTO_ALLOWED → execute goal via executeGoal() ────────────────

  audit.record("operation_started", `Executing goal autonomously via Agent Runtime (agentId=${operation.agentId}).`, {
    agentId:     operation.agentId,
    goalType:    operation.goal.type,
    executionId,
  });

  try {
    const correlationId = `autonomous:${operation.orgSlug}:${operation.id}:${executionId}`;
    const ctx           = buildContext(operation, operation.goal, correlationId);
    const runtimeResult = await executeGoal(operation.agentId, ctx);

    if (runtimeResult.success) {
      const msg = `Operación completada exitosamente. Pasos ejecutados: ${runtimeResult.result?.executedSteps ?? 0}.`;
      audit.record("operation_completed", msg, {
        executionId,
        agentId:       operation.agentId,
        executedSteps: runtimeResult.result?.executedSteps,
        status:        runtimeResult.result?.status,
      });
      return {
        ...completedResult(decision, executionId, msg),
        auditLog: audit,
      };
    }

    const msg = `Ejecución del agente falló: ${runtimeResult.error ?? "Error desconocido."}`;
    audit.record("operation_failed", msg, {
      executionId,
      agentId:    operation.agentId,
      agentError: runtimeResult.error,
    });
    return { ...failedResult(decision, msg), auditLog: audit };

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error inesperado en ejecución autónoma.";
    audit.record("operation_failed", msg, { executionId, error: msg });
    return { ...failedResult(decision, msg), auditLog: audit };
  }
}
