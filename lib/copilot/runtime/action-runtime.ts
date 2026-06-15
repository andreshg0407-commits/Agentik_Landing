/**
 * lib/copilot/runtime/action-runtime.ts
 *
 * AGENTIK-ACTION-RUNTIME-01 — Main execution engine.
 * SERVER ONLY — no React imports, no domain-specific dependencies.
 * @server-only
 *
 * This is the top of the dependency stack. It imports all other runtime
 * modules and orchestrates the full execution pipeline.
 *
 * Execution pipeline:
 *   1. Sort steps by `order` (ascending)
 *   2. For each step:
 *      a. Log step_started
 *      b. Check approval gate → if blocked: log, accumulate, apply policy
 *      c. Dispatch to handler → resolve outcome
 *      d. Build RuntimeStepResult from outcome
 *      e. Accumulate result
 *      f. Apply stopOnFirstFailure policy if step failed
 *   3. Assemble ExecutionReport from accumulated results
 *   4. Build RollbackDescriptor (Phase 1: descriptive only)
 *   5. Return ExecutionReport
 *
 * Dependency direction (must never be violated):
 *   runtime-types ← action-dispatcher ← action-runtime
 *               ← approval-gate      ← action-runtime
 *               ← runtime-logger     ← action-runtime
 *               ← rollback-descriptor ← action-runtime
 *
 * Domain adapters (Shopify, Finance, etc.) are OUTSIDE this module.
 * They consume `ActionDispatcher` from the public index.
 */
import "server-only";

import type {
  ExecutionContext,
  RuntimeExecutionPlan,
  RuntimeStepSpec,
  RuntimeStepResult,
  RuntimeExecution,
  ExecutionReport,
  ExecutionAudit,
  ExecutionStatus,
  ExecutionPolicy,
} from "./runtime-types";
import { DEFAULT_EXECUTION_POLICY } from "./runtime-types";

import type { ActionDispatcher }               from "./action-dispatcher";
import type { ApprovalGateConfig }             from "./approval-gate";
import { gateFromPolicyDecision, DEFAULT_APPROVAL_GATE_CONFIG } from "./approval-gate";
import { createRuntimeLogger }                 from "./runtime-logger";
import type { RuntimeLogger }                  from "./runtime-logger";
import { buildRollbackDescriptor }             from "./rollback-descriptor";
import type { RollbackDescriptor }             from "./rollback-descriptor";

import type { PolicyEngine }                   from "@/lib/copilot/policy/policy-engine";
import { createDefaultPolicyEngine }           from "@/lib/copilot/policy/policy-engine";
import { buildPolicyContext }                  from "@/lib/copilot/policy/policy-context";
import type { ExecutionMode, PolicyViolation } from "@/lib/copilot/policy/policy-types";

// ── Execution options ──────────────────────────────────────────────────────────

/**
 * Options for `executeExecutionPlan()`.
 * All fields are optional — safe defaults are applied.
 */
export interface ExecuteOptions {
  /** Execution flow policy (default: stopOnFirstFailure=true, stopOnFirstBlock=false) */
  policy?:          ExecutionPolicy;
  /** Approval gate configuration (default: auto_block) */
  approvalConfig?:  ApprovalGateConfig;
  /**
   * Pre-built PolicyEngine instance to use for authorization decisions.
   * If omitted, `createDefaultPolicyEngine(approvalConfig)` is used.
   */
  policyEngine?:    PolicyEngine;
  /**
   * Execution mode — passed to buildPolicyContext() for each step.
   * Default: "copilot"
   */
  executionMode?:   ExecutionMode;
  /** Suppress console logging (for test environments) */
  silent?:          boolean;
}

// ── Extended report ────────────────────────────────────────────────────────────

/**
 * Extended execution report — includes the rollback descriptor.
 * Returned by `executeExecutionPlan()`.
 *
 * The rollback descriptor is always present (even if empty).
 * In Phase 1 it is descriptive only — nothing is executed on rollback.
 */
export interface ExtendedExecutionReport extends ExecutionReport {
  rollback: RollbackDescriptor;
}

// ── Helper: build step result ──────────────────────────────────────────────────

function makeStepResult(
  spec:           RuntimeStepSpec,
  status:         ExecutionStatus,
  startedAt:      Date,
  opts: {
    approvalStatus?: RuntimeStepResult["approvalStatus"];
    data?:           unknown;
    error?:          string;
    warnings?:       string[];
    auditNote?:      string;
    // Policy fields
    policyDecision?: RuntimeStepResult["policyDecision"];
    policyReasons?:  RuntimeStepResult["policyReasons"];
    evaluatedRules?: RuntimeStepResult["evaluatedRules"];
    deniedByPolicy?: boolean;
  } = {},
): RuntimeStepResult {
  const finishedAt = new Date();
  return {
    stepId:          spec.stepId,
    actionId:        spec.actionId,
    domain:          spec.domain,
    displayName:     spec.displayName,
    status,
    approvalStatus:  opts.approvalStatus ?? "not_required",
    startedAt,
    finishedAt,
    durationMs:      finishedAt.getTime() - startedAt.getTime(),
    data:            opts.data,
    error:           opts.error,
    warnings:        opts.warnings ?? [],
    auditNote:       opts.auditNote,
    policyDecision:  opts.policyDecision,
    policyReasons:   opts.policyReasons,
    evaluatedRules:  opts.evaluatedRules,
    deniedByPolicy:  opts.deniedByPolicy,
  };
}

// ── Helper: build execution report ────────────────────────────────────────────

function buildReport(
  ctx:         ExecutionContext,
  plan:        RuntimeExecutionPlan,
  execution:   RuntimeExecution,
  logger:      RuntimeLogger,
): ExecutionReport {
  const results = execution.results;

  const completedSteps   = results.filter(r => r.status === "completed").length;
  const failedSteps      = results.filter(r => r.status === "failed").length;
  const skippedSteps     = results.filter(r => r.status === "skipped").length;
  const blockedSteps     = results.filter(r => r.status === "blocked").length;
  const awaitingApproval = results.filter(r => r.status === "awaiting_approval").length;
  const cancelledSteps   = results.filter(r => r.status === "cancelled").length;

  const errors   = results.filter(r => r.error).map(r => r.error!);
  const warnings = logger.getWarnings();

  const overallStatus: ExecutionStatus =
    failedSteps > 0      ? "failed"           :
    blockedSteps > 0     ? "blocked"          :
    awaitingApproval > 0 ? "awaiting_approval" :
    cancelledSteps > 0   ? "cancelled"        :
    completedSteps === plan.steps.length ? "completed" :
    "failed"; // catch-all

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - execution.startedAt.getTime();

  const domainsCalled = [...new Set(results.map(r => r.domain))];
  const approvalRequired = results.some(r => r.approvalStatus !== "not_required");
  const approvalGated    = results.some(r => r.approvalStatus === "pending");

  // Policy aggregates
  const deniedByPolicy   = results.filter(r => r.deniedByPolicy === true).length;
  const policyViolations: PolicyViolation[] = results.flatMap(r => {
    if (!r.policyReasons) return [];
    return r.policyReasons
      .filter(reason => reason.effect === "deny" || reason.effect === "require_approval")
      .map(reason => ({
        ruleId:      reason.ruleId,
        ruleName:    reason.ruleName,
        explanation: reason.explanation,
        severity:    reason.effect === "deny" ? ("high" as const) : ("medium" as const),
      }));
  });

  const audit: ExecutionAudit = {
    initiatedBy:      ctx.userId,
    requestedAt:      ctx.requestedAt,
    completedAt:      finishedAt,
    intentSource:     ctx.metadata?.intentSource as string | undefined,
    domainsCalled,
    approvalRequired,
    approvalGated,
    planTitle:        plan.title,
  };

  return {
    executionId:      ctx.executionId,
    correlationId:    ctx.correlationId,
    tenantId:         ctx.tenantId,
    startedAt:        execution.startedAt,
    finishedAt,
    durationMs,
    overallStatus,
    totalSteps:       plan.steps.length,
    completedSteps,
    failedSteps,
    skippedSteps,
    blockedSteps,
    awaitingApproval,
    cancelledSteps,
    stepResults:      results,
    errors,
    warnings,
    audit,
    deniedByPolicy,
    policyViolations,
  };
}

// ── Main engine ────────────────────────────────────────────────────────────────

/**
 * Execute a complete RuntimeExecutionPlan.
 *
 * This is the only public entry point for the runtime engine.
 * It is fully async and never throws — all errors are captured in the report.
 *
 * @param plan       - The ordered execution plan (from intent resolver or planning layer)
 * @param ctx        - The execution context (tenantId, userId, executionId, …)
 * @param dispatcher - The initialized action dispatcher (with domain providers registered)
 * @param options    - Optional: policy, approval config, silent mode
 *
 * @returns ExtendedExecutionReport — always, even on total failure
 */
export async function executeExecutionPlan(
  plan:       RuntimeExecutionPlan,
  ctx:        ExecutionContext,
  dispatcher: ActionDispatcher,
  options:    ExecuteOptions = {},
): Promise<ExtendedExecutionReport> {

  const policy         = options.policy         ?? DEFAULT_EXECUTION_POLICY;
  const approvalConfig = options.approvalConfig  ?? DEFAULT_APPROVAL_GATE_CONFIG;
  const policyEngine   = options.policyEngine   ?? createDefaultPolicyEngine(approvalConfig);
  const executionMode  = options.executionMode  ?? "copilot";
  const logger         = createRuntimeLogger(ctx, { silent: options.silent ?? false });

  const startedAt = new Date();

  // Clear dispatcher context cache for this execution
  dispatcher.clearContextCache();

  // Sort steps by order
  const sortedSteps = [...plan.steps].sort((a, b) => a.order - b.order);

  // Initialize in-flight execution state
  const execution: RuntimeExecution = {
    executionId:  ctx.executionId,
    correlationId: ctx.correlationId,
    tenantId:     ctx.tenantId,
    status:       "running",
    plan,
    results:      [],
    startedAt,
  };

  logger.log({
    eventType:   "execution_started",
    message:     `Starting execution of plan "${plan.title}" (${sortedSteps.length} steps)`,
  });

  let shouldStop = false;

  // ── Step loop ──────────────────────────────────────────────────────────────

  for (const spec of sortedSteps) {
    const stepStart = new Date();

    // ── Already stopped: skip remaining steps ──────────────────────────────
    if (shouldStop) {
      const skipped = makeStepResult(spec, "skipped", stepStart, {
        auditNote: "Skipped due to policy (stopOnFirstFailure or stopOnFirstBlock).",
      });
      execution.results.push(skipped);
      logger.log({
        eventType: "step_skipped",
        stepId:    spec.stepId,
        actionId:  spec.actionId,
        domain:    spec.domain,
        status:    "skipped",
        message:   "Step skipped — execution stopped by policy.",
      });
      continue;
    }

    logger.log({
      eventType: "step_started",
      stepId:    spec.stepId,
      actionId:  spec.actionId,
      domain:    spec.domain,
      status:    "running",
      message:   `Starting step "${spec.displayName}"`,
    });

    // ── Policy Engine evaluation ────────────────────────────────────────────
    const policyCtx    = buildPolicyContext(spec, ctx, executionMode);
    const policyResult = policyEngine.evaluate(policyCtx);
    const gate         = gateFromPolicyDecision(policyResult);

    // Common policy fields for any step result produced below
    const policyFields = {
      policyDecision: policyResult.decision,
      policyReasons:  policyResult.reasons,
      evaluatedRules: policyResult.evaluatedRuleIds,
      deniedByPolicy: policyResult.decision === "deny",
    };

    // ── Approval gate / deny ────────────────────────────────────────────────
    if (gate.shouldBlock) {
      // "deny" → blocked status; "require_approval" → awaiting_approval
      const stepStatus = policyResult.decision === "deny" ? "blocked" : "awaiting_approval";
      const approvalSt = policyResult.decision === "deny" ? "denied"  : "pending";

      const blocked = makeStepResult(spec, stepStatus, stepStart, {
        approvalStatus: approvalSt,
        auditNote:      gate.reason,
        warnings:       [gate.reason],
        ...policyFields,
      });
      execution.results.push(blocked);

      logger.log({
        eventType: stepStatus === "blocked" ? "step_blocked" : "step_approval_pending",
        stepId:    spec.stepId,
        actionId:  spec.actionId,
        domain:    spec.domain,
        status:    stepStatus,
        message:   gate.reason,
      });

      if (policy.stopOnFirstBlock || policyResult.decision === "deny") {
        logger.log({
          eventType: "policy_stop_on_block",
          stepId:    spec.stepId,
          message:   policyResult.decision === "deny"
            ? "Stopping execution — step denied by Policy Engine."
            : "Stopping execution — stopOnFirstBlock policy triggered.",
        });
        shouldStop = true;
      }
      continue;
    }

    // ── Dispatch ───────────────────────────────────────────────────────────
    const outcome = await dispatcher.dispatch(spec, ctx);

    switch (outcome.kind) {
      case "not_found": {
        const blocked = makeStepResult(spec, "blocked", stepStart, {
          error:          `Action "${outcome.actionId}" not found in dispatcher registry (domain: ${outcome.domain}).`,
          approvalStatus: gate.status,
          auditNote:      "Action not registered in any domain provider.",
          ...policyFields,
        });
        execution.results.push(blocked);
        logger.log({
          eventType: "dispatcher_not_found",
          stepId:    spec.stepId,
          actionId:  spec.actionId,
          domain:    spec.domain,
          status:    "blocked",
          message:   blocked.error,
        });
        if (policy.stopOnFirstFailure) {
          logger.log({
            eventType: "policy_stop_on_failure",
            message:   "Stopping execution — stopOnFirstFailure policy triggered after blocked step.",
          });
          shouldStop = true;
        }
        break;
      }

      case "context_error": {
        const failed = makeStepResult(spec, "failed", stepStart, {
          error:          `Domain context error for "${outcome.domain}": ${outcome.reason}`,
          approvalStatus: gate.status,
          auditNote:      "Domain context could not be resolved.",
          ...policyFields,
        });
        execution.results.push(failed);
        logger.log({
          eventType: "dispatcher_context_error",
          stepId:    spec.stepId,
          actionId:  spec.actionId,
          domain:    spec.domain,
          status:    "failed",
          message:   failed.error,
        });
        if (policy.stopOnFirstFailure) {
          logger.log({
            eventType: "policy_stop_on_failure",
            message:   "Stopping execution — stopOnFirstFailure policy triggered after context error.",
          });
          shouldStop = true;
        }
        break;
      }

      case "handler_error": {
        const failed = makeStepResult(spec, "failed", stepStart, {
          error:          outcome.error,
          approvalStatus: gate.status,
          auditNote:      "Handler threw an unhandled exception.",
          ...policyFields,
        });
        execution.results.push(failed);
        logger.log({
          eventType: "dispatcher_handler_error",
          stepId:    spec.stepId,
          actionId:  spec.actionId,
          domain:    spec.domain,
          status:    "failed",
          message:   outcome.error,
        });
        if (policy.stopOnFirstFailure) {
          logger.log({
            eventType: "policy_stop_on_failure",
            message:   "Stopping execution — stopOnFirstFailure policy triggered after handler error.",
          });
          shouldStop = true;
        }
        break;
      }

      case "success": {
        const { result } = outcome;
        if (!result.success) {
          // Handler returned success=false (business-level failure)
          const failed = makeStepResult(spec, "failed", stepStart, {
            error:          result.error ?? "Handler returned success=false without an error message.",
            data:           result.data,
            warnings:       result.warnings,
            approvalStatus: gate.status,
            auditNote:      result.auditNote,
            ...policyFields,
          });
          execution.results.push(failed);
          logger.log({
            eventType: "step_failed",
            stepId:    spec.stepId,
            actionId:  spec.actionId,
            domain:    spec.domain,
            status:    "failed",
            message:   failed.error,
          });
          if (policy.stopOnFirstFailure) {
            logger.log({
              eventType: "policy_stop_on_failure",
              message:   "Stopping execution — stopOnFirstFailure policy triggered after step failure.",
            });
            shouldStop = true;
          }
        } else {
          const completed = makeStepResult(spec, "completed", stepStart, {
            data:           result.data,
            warnings:       result.warnings,
            approvalStatus: gate.status,
            auditNote:      result.auditNote,
            ...policyFields,
          });
          execution.results.push(completed);
          logger.log({
            eventType:  "step_completed",
            stepId:     spec.stepId,
            actionId:   spec.actionId,
            domain:     spec.domain,
            status:     "completed",
            durationMs: completed.durationMs,
            message:    `Step "${spec.displayName}" completed successfully.`,
          });
        }
        break;
      }
    }
  }

  // ── Finalize execution ─────────────────────────────────────────────────────

  execution.finishedAt = new Date();

  const report = buildReport(ctx, plan, execution, logger);

  logger.log({
    eventType:  "execution_completed",
    status:     report.overallStatus,
    durationMs: report.durationMs,
    message:
      `Execution complete: ${report.completedSteps}/${report.totalSteps} steps completed ` +
      `| ${report.failedSteps} failed | ${report.skippedSteps} skipped ` +
      `| ${report.awaitingApproval} awaiting approval`,
  });

  // ── Phase 1: build rollback descriptor (descriptive only) ─────────────────

  const rollback = buildRollbackDescriptor(ctx, execution.results);

  return { ...report, rollback };
}
