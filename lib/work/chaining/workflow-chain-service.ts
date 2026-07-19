/**
 * lib/work/chaining/workflow-chain-service.ts
 *
 * Agentik — Workflow Chain Service
 * Sprint: AGENTIK-WORKFLOW-CHAINING-01
 * Hardened: AGENTIK-WORKFLOW-HARDENING-01
 *
 * SERVER-ONLY — orchestrates multi-step business process chains.
 *
 * Hardening features (HARDENING-01):
 *   - Idempotent chain creation via idempotencyKey + DB partial-unique index
 *   - Processing lock (processingExecutionIds in metadataJson)
 *   - Deduplication of approvals (findApprovalByWorkflowStep)
 *   - Deduplication of auto-dispatch executions (findByWorkflowStep)
 *   - Safety limits (max 20 steps, 10 approvals, 10 auto-dispatches)
 *   - Dead-letter audit on failure (chain_continuation_failed)
 *   - Recovery helper for stuck runs (recoverStuckRuns)
 */
import "server-only";

import type { PersistedWorkExecution }    from "../live/persistence/work-execution-repository";
import type { WorkflowChainRun, StuckRunReport } from "./workflow-chain-types";
import type { ChainStartResult, ChainContinueResult, ChainActionResult, ChainQueryResult, ChainListResult } from "./workflow-chain-result";
import { workflowRunRepository }         from "./persistence/workflow-run-repository";
import {
  matchChainForFirstStep,
  resolveNextStep,
  extractChainContextFromPayload,
  isChainTerminal,
  hasExceededStepLimit,
}                                        from "./workflow-chain-router";
import { getChainById }                  from "./workflow-chain-registry";
import {
  createWorkflowChainRun,
  createWorkflowStepResult,
  createWorkflowChainAuditEvent,
  createNextStepPayload,
  advanceRunToStep,
  completeRunStep,
  terminalizeRun,
}                                        from "./workflow-chain-factory";
import type { WorkflowChainDefinition, WorkflowStepDefinition } from "./workflow-chain-types";
import {
  buildIdempotencyKey,
  getHardeningMeta,
  isAlreadyProcessed,
  isCurrentlyProcessing,
  acquireLock,
  releaseLock,
  abortLock,
  hasExceededApprovalLimit,
  hasExceededDispatchLimit,
  incrementApprovalCount,
  incrementDispatchCount,
  buildFailureAuditEvent,
  isRunStuck,
  SAFETY_LIMITS,
}                                        from "./workflow-chain-hardening";

// ── Category mapping ──────────────────────────────────────────────────────────

function chainCategoryToApprovalCategory(
  cat: string,
): "FINANCIAL" | "COMMERCIAL" | "MARKETING" | "COLLECTIONS" | "OPERATIONS" | "CUSTOM" {
  const map: Record<string, "FINANCIAL" | "COMMERCIAL" | "MARKETING" | "COLLECTIONS" | "OPERATIONS"> = {
    FINANCE:    "FINANCIAL",
    COMMERCIAL: "COMMERCIAL",
    MARKETING:  "MARKETING",
    COLLECTIONS:"COLLECTIONS",
    OPERATIONS: "OPERATIONS",
  };
  return map[cat] ?? "CUSTOM";
}

// ── Approval dedup + creation ──────────────────────────────────────────────────

/**
 * Create an approval for a step — with dedup guard.
 * If an active (PENDING/APPROVED) approval already exists for this step+run, returns its ID.
 * Never creates duplicates.
 */
async function createApprovalForStep(
  chain:   WorkflowChainDefinition,
  step:    WorkflowStepDefinition,
  run:     WorkflowChainRun,
  orgSlug: string,
): Promise<{ approvalId: string | null; wasDuplicate: boolean }> {
  try {
    // Dedup guard: check if approval already exists for this step in this run
    const { findApprovalByWorkflowStep } = await import("@/lib/approvals/persistence/approval-prisma-repository");
    const existing = await findApprovalByWorkflowStep(run.id, step.id);
    if (existing) {
      return { approvalId: existing.id, wasDuplicate: true };
    }

    const { approvalService }           = await import("@/lib/approvals/approval-service");
    const { createApprovalRequest, SYSTEM_APPROVER, createApprovalActor, createApprovalRelationship } =
      await import("@/lib/approvals/approval-factory");

    const approval = createApprovalRequest({
      title:       `${step.label} — autorización requerida`,
      description: `El flujo "${chain.name}" requiere aprobación para continuar con: ${step.description}`,
      priority:    "HIGH",
      source:      "AGENT",
      category:    chainCategoryToApprovalCategory(chain.category),
      requestor:   SYSTEM_APPROVER,
      approver:    createApprovalActor("manager", "USER", "Gerencia"),
      context: {
        orgSlug,
        module:           step.module,
        entityType:       "workflow_step",
        entityId:         step.id,
        navigationTarget: `/${orgSlug}/aprobaciones`,
        impactSummary:    step.description,
        recommendation:   `Aprobar para continuar el flujo de trabajo: ${chain.name}`,
        metadata: {
          actionType:    step.actionType,
          chainId:       chain.id,
          workflowRunId: run.id,
          stepId:        step.id,
        },
      },
      relationships: [
        createApprovalRelationship("workflow_chain", "workflow", run.id, chain.name),
        createApprovalRelationship("workflow_step",  "step",     step.id, step.label),
      ],
    });

    const result = await approvalService.createApprovalFromRequest(approval);
    return { approvalId: result.success ? (result.approval?.id ?? null) : null, wasDuplicate: false };
  } catch (err) {
    console.warn("[workflow-chain-service] Could not create approval for step:", err);
    return { approvalId: null, wasDuplicate: false };
  }
}

// ── Auto-dispatch (no approval needed) ───────────────────────────────────────

/**
 * Dispatch a step execution — with dedup guard.
 * If a non-failed execution already exists for this workflowRunId+stepId, skips dispatch.
 */
async function dispatchStepExecution(
  step:    WorkflowStepDefinition,
  run:     WorkflowChainRun,
  orgSlug: string,
  previousExecutionId: string,
): Promise<{ executionId: string | null; wasDuplicate: boolean }> {
  try {
    const { workExecutionRepository } = await import("../live/persistence/work-execution-repository");

    // Dedup guard: check if this step was already dispatched in this run
    const existing = await workExecutionRepository.findByWorkflowStep(run.id, step.id);
    if (existing) {
      return { executionId: existing.id, wasDuplicate: true };
    }

    const { createExecutionJob }   = await import("../live/work-execution-factory");
    const { dispatchJobDirectly }  = await import("../live/work-execution-dispatcher");

    const chainPayloadMeta = createNextStepPayload({
      chainId:             run.chainId,
      workflowRunId:       run.id,
      stepId:              step.id,
      previousExecutionId,
      stepTemplate:        step.payloadTemplate,
    });

    const job = createExecutionJob({
      executorType: "TASK_ASSIGNMENT",
      trigger:      "APPROVAL_APPROVED",
      orgSlug,
      approvalId:   run.triggerApprovalId ?? run.triggerExecutionId,
      payload: {
        params:  chainPayloadMeta,
        trigger: {
          approvalId:     run.triggerApprovalId ?? run.id,
          approvalTitle:  `${run.chainName} — ${step.label}`,
          approvalStatus: "APPROVED",
          approvedBy:     "workflow-chain",
          approvedAt:     new Date().toISOString(),
          approvedByType: "SYSTEM",
          orgSlug,
          module:         step.module,
          entityType:     "workflow_step",
          entityId:       step.id,
        },
        metadata: {
          workflowRunId:       run.id,
          chainId:             run.chainId,
          stepId:              step.id,
          previousExecutionId,
        },
      },
      metadata: {
        workflowRunId:       run.id,
        chainId:             run.chainId,
        stepId:              step.id,
        isChainStep:         true,
        previousExecutionId,
      },
    });

    job.module     = step.module;
    job.actionType = step.actionType;

    try {
      await workExecutionRepository.createExecution(job);
    } catch (e) {
      console.warn("[workflow-chain-service] Could not persist chain step job:", e);
    }

    await dispatchJobDirectly(job);
    return { executionId: job.id, wasDuplicate: false };
  } catch (err) {
    console.warn("[workflow-chain-service] Could not dispatch step execution:", err);
    return { executionId: null, wasDuplicate: false };
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export const workflowChainService = {

  /**
   * Called when a COMPLETED WorkExecution may be the first step of a chain.
   *
   * Hardening:
   *   - Uses createRunIdempotent (idempotencyKey = workflow:${chainId}:${executionId})
   *   - Dedup: if run already exists for this key, returns early
   *   - Approval dedup before creating approval for step 2
   *   - Safety limits on approval count and dispatch count
   */
  async startChainFromExecution(
    execution: PersistedWorkExecution,
    orgSlug:   string,
  ): Promise<ChainStartResult> {
    try {
      if (execution.status !== "COMPLETED") {
        return { started: false, chainMatched: false, message: "Ejecución no completada — no inicia cadena." };
      }

      // Match chain by first step
      const match = matchChainForFirstStep(execution.module, execution.actionType);
      if (!match) {
        return { started: false, chainMatched: false, message: "Ninguna cadena activa aplica para este tipo de ejecución." };
      }

      const { chain, matchedStep } = match;

      // Build idempotencyKey — deterministic, stable
      const idempotencyKey = buildIdempotencyKey(chain.id, execution.id);

      // Create chain run — idempotent (returns existing if already created)
      let run = createWorkflowChainRun({
        chainId:            chain.id,
        chainName:          chain.name,
        orgSlug,
        triggerExecutionId: execution.id,
        firstStepId:        matchedStep.id,
        metadata:           { idempotencyKey },
      });

      const { run: persistedRun, wasCreated } = await workflowRunRepository.createRunIdempotent(
        run,
        orgSlug,
        idempotencyKey,
      );

      if (!wasCreated) {
        // Idempotency hit — run already exists
        run = persistedRun;
        run.auditTrail.push(createWorkflowChainAuditEvent({
          runId:       run.id,
          event:       "idempotency_hit",
          executionId: execution.id,
          message:     `Cadena ya iniciada (idempotencyKey: ${idempotencyKey}).`,
        }));
        await workflowRunRepository.updateRun(run);
        return {
          started: false, chainMatched: true, workflowRunId: run.id,
          chainId: chain.id, chainName: chain.name,
          message: "Cadena ya iniciada para esta ejecución (idempotency hit).",
        };
      }

      run = persistedRun;

      // Mark step 1 as COMPLETED (it already ran)
      const step1Result = createWorkflowStepResult({
        stepId:      matchedStep.id,
        status:      "COMPLETED",
        executionId: execution.id,
        message:     `Step "${matchedStep.label}" completado por ejecución ${execution.id}.`,
        completedAt: new Date().toISOString(),
      });
      run = completeRunStep(run, matchedStep.id, step1Result);

      // Acquire processing lock for step 1
      run = acquireLock(run, execution.id);

      // Add start audit event
      run.auditTrail.push(createWorkflowChainAuditEvent({
        runId:       run.id,
        event:       "chain_started",
        stepId:      matchedStep.id,
        executionId: execution.id,
        message:     `Cadena "${chain.name}" iniciada por ejecución ${execution.id}.`,
      }));

      // Process next step
      const nextDecision = resolveNextStep(chain, matchedStep.id, run.completedStepIds);

      if (!nextDecision) {
        run = releaseLock(run, execution.id);
        run = terminalizeRun(run, "COMPLETED");
        run.auditTrail.push(createWorkflowChainAuditEvent({
          runId:   run.id,
          event:   "chain_completed",
          message: `Cadena "${chain.name}" completada (step único).`,
        }));
        await workflowRunRepository.updateRun(run);
        return {
          started: true, chainMatched: true, workflowRunId: run.id,
          chainId: chain.id, chainName: chain.name,
          message: `Cadena "${chain.name}" completada.`,
        };
      }

      const { nextStep, nextStatus } = nextDecision;

      // Step limit guard
      if (hasExceededStepLimit(run)) {
        run = releaseLock(run, execution.id);
        run = terminalizeRun(run, "BLOCKED");
        run.auditTrail.push(createWorkflowChainAuditEvent({
          runId: run.id, event: "chain_safety_limit_reached",
          message: `Límite de ${SAFETY_LIMITS.MAX_STEP_RESULTS} steps alcanzado.`,
        }));
        await workflowRunRepository.updateRun(run);
        return {
          started: false, chainMatched: true, workflowRunId: run.id,
          message: "Límite de steps excedido. Cadena bloqueada.",
          errors: ["MAX_STEPS_EXCEEDED"],
        };
      }

      if (nextStatus === "WAITING_APPROVAL") {
        // Safety limit: approvals
        if (hasExceededApprovalLimit(run)) {
          run = releaseLock(run, execution.id);
          run = terminalizeRun(run, "BLOCKED");
          run.auditTrail.push(createWorkflowChainAuditEvent({
            runId: run.id, event: "chain_safety_limit_reached",
            message: `Límite de ${SAFETY_LIMITS.MAX_APPROVALS} aprobaciones alcanzado.`,
          }));
          await workflowRunRepository.updateRun(run);
          return { started: false, chainMatched: true, workflowRunId: run.id, message: "Límite de aprobaciones excedido." };
        }

        const { approvalId, wasDuplicate } = await createApprovalForStep(chain, nextStep, run, orgSlug);
        run = advanceRunToStep(run, nextStep.id, "RUNNING");

        if (wasDuplicate) {
          run.auditTrail.push(createWorkflowChainAuditEvent({
            runId: run.id, event: "duplicate_approval_prevented",
            stepId: nextStep.id, approvalId: approvalId ?? undefined,
            message: `Aprobación duplicada prevenida para "${nextStep.label}".`,
          }));
        } else {
          run = incrementApprovalCount(run);
        }

        const stepResult = createWorkflowStepResult({
          stepId:     nextStep.id,
          status:     "WAITING_APPROVAL",
          approvalId: approvalId ?? undefined,
          message:    `Step "${nextStep.label}" esperando aprobación.`,
        });
        run.stepResults.push(stepResult);
        run.auditTrail.push(createWorkflowChainAuditEvent({
          runId: run.id, event: "approval_requested",
          stepId: nextStep.id, approvalId: approvalId ?? undefined,
          message: `Aprobación ${wasDuplicate ? "existente reutilizada" : "requerida"} para "${nextStep.label}".`,
        }));
        run = releaseLock(run, execution.id);
        await workflowRunRepository.updateRun(run);

        return {
          started: true, chainMatched: true, workflowRunId: run.id,
          chainId: chain.id, chainName: chain.name,
          currentStep: nextStep.id, nextStatus: "RUNNING",
          message: `Cadena iniciada. Esperando aprobación para "${nextStep.label}".`,
        };
      }

      if (nextStatus === "READY") {
        // Safety limit: dispatches
        if (hasExceededDispatchLimit(run)) {
          run = releaseLock(run, execution.id);
          run = terminalizeRun(run, "BLOCKED");
          run.auditTrail.push(createWorkflowChainAuditEvent({
            runId: run.id, event: "chain_safety_limit_reached",
            message: `Límite de ${SAFETY_LIMITS.MAX_AUTO_DISPATCHES} dispatches alcanzado.`,
          }));
          await workflowRunRepository.updateRun(run);
          return { started: false, chainMatched: true, workflowRunId: run.id, message: "Límite de dispatches excedido." };
        }

        run = advanceRunToStep(run, nextStep.id, "RUNNING");
        const { executionId: execId, wasDuplicate } = await dispatchStepExecution(
          nextStep, run, orgSlug, execution.id,
        );

        if (wasDuplicate) {
          run.auditTrail.push(createWorkflowChainAuditEvent({
            runId: run.id, event: "duplicate_execution_prevented",
            stepId: nextStep.id, executionId: execId ?? undefined,
            message: `Ejecución duplicada prevenida para "${nextStep.label}".`,
          }));
        } else {
          run = incrementDispatchCount(run);
        }

        const stepResult = createWorkflowStepResult({
          stepId:      nextStep.id,
          status:      "RUNNING",
          executionId: execId ?? undefined,
          message:     `Step "${nextStep.label}" despachado${wasDuplicate ? " (existente)" : " automáticamente"}.`,
          startedAt:   new Date().toISOString(),
        });
        run.stepResults.push(stepResult);
        run.auditTrail.push(createWorkflowChainAuditEvent({
          runId: run.id, event: "step_started",
          stepId: nextStep.id, executionId: execId ?? undefined,
          message: `Step "${nextStep.label}" ejecutado. Job: ${execId ?? "error"}.`,
        }));
        run = releaseLock(run, execution.id);
        await workflowRunRepository.updateRun(run);

        return {
          started: true, chainMatched: true, workflowRunId: run.id,
          chainId: chain.id, chainName: chain.name,
          currentStep: nextStep.id, nextStatus: "RUNNING",
          message: `Cadena iniciada. Step "${nextStep.label}" en ejecución.`,
        };
      }

      // BLOCKED
      run = releaseLock(run, execution.id);
      run = advanceRunToStep(run, nextStep.id, "BLOCKED");
      await workflowRunRepository.updateRun(run);
      return { started: false, chainMatched: true, workflowRunId: run.id, message: nextDecision.reason };

    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado en startChainFromExecution.";
      console.error("[workflow-chain-service] startChainFromExecution error:", err);
      return { started: false, chainMatched: false, message, errors: [message] };
    }
  },

  /**
   * Called when ANY WorkExecution completes.
   * Checks if it's part of a chain (via payload metadata), then continues the chain.
   *
   * Hardening:
   *   - Processing lock prevents concurrent duplicate processing
   *   - processedExecutionIds guard prevents re-processing the same executionId
   *   - Approval dedup before creating new approval for next step
   *   - Execution dedup before dispatching next step
   *   - Safety limits (approvals + dispatches)
   *   - Dead-letter audit event on failure
   *   - Fire-and-forget safe — never throws
   */
  async continueChainAfterExecution(
    execution: PersistedWorkExecution,
    orgSlug:   string,
  ): Promise<ChainContinueResult> {
    let runForDeadLetter: WorkflowChainRun | null = null;

    try {
      if (execution.status !== "COMPLETED" || !execution.success) {
        return { continued: false, message: "Ejecución no completada exitosamente." };
      }

      const chainCtx = extractChainContextFromPayload(execution.payloadJson);

      if (!chainCtx) {
        // Not a chain step — try starting a new chain
        const startResult = await this.startChainFromExecution(execution, orgSlug);
        return {
          continued:   startResult.started,
          workflowRunId: startResult.workflowRunId,
          chainId:     startResult.chainId,
          message:     startResult.message,
          errors:      startResult.errors,
        };
      }

      // This IS a chain step — continue the existing run
      let run = await workflowRunRepository.findById(chainCtx.workflowRunId);
      if (!run) {
        return { continued: false, message: `WorkflowRun ${chainCtx.workflowRunId} no encontrado.` };
      }

      runForDeadLetter = run;

      // Guard: terminal chain
      if (isChainTerminal(run)) {
        return { continued: false, workflowRunId: run.id, message: "Cadena ya está en estado terminal." };
      }

      // Hard anti-duplicate: already processed
      if (isAlreadyProcessed(run, execution.id)) {
        run.auditTrail.push(createWorkflowChainAuditEvent({
          runId: run.id, event: "idempotency_hit",
          executionId: execution.id,
          message: `Ejecución ${execution.id} ya procesada en esta cadena.`,
        }));
        await workflowRunRepository.updateRun(run);
        return { continued: false, workflowRunId: run.id, message: "Ejecución ya procesada en esta cadena." };
      }

      // Soft concurrent lock: currently processing
      if (isCurrentlyProcessing(run, execution.id)) {
        return { continued: false, workflowRunId: run.id, message: "Ejecución en proceso concurrente — ignorando duplicado." };
      }

      const chain = getChainById(chainCtx.chainId);
      if (!chain) {
        return { continued: false, workflowRunId: run.id, message: `Cadena ${chainCtx.chainId} no encontrada en registry.` };
      }

      // Acquire processing lock
      run = acquireLock(run, execution.id);
      await workflowRunRepository.updateRun(run);

      // Mark current step COMPLETED
      const currentStepResult = createWorkflowStepResult({
        stepId:      chainCtx.stepId,
        status:      "COMPLETED",
        executionId: execution.id,
        message:     `Step completado por ejecución ${execution.id}.`,
        completedAt: new Date().toISOString(),
      });

      let updatedRun = completeRunStep(run, chainCtx.stepId, currentStepResult);
      updatedRun.auditTrail.push(createWorkflowChainAuditEvent({
        runId:       updatedRun.id,
        event:       "step_completed",
        stepId:      chainCtx.stepId,
        executionId: execution.id,
        message:     `Step "${chainCtx.stepId}" completado.`,
      }));

      runForDeadLetter = updatedRun;

      // Resolve next step
      const nextDecision = resolveNextStep(chain, chainCtx.stepId, updatedRun.completedStepIds);

      if (!nextDecision) {
        updatedRun = releaseLock(updatedRun, execution.id);
        updatedRun = terminalizeRun(updatedRun, "COMPLETED");
        updatedRun.auditTrail.push(createWorkflowChainAuditEvent({
          runId:   updatedRun.id,
          event:   "chain_completed",
          message: `Cadena "${chain.name}" completada exitosamente.`,
        }));
        await workflowRunRepository.updateRun(updatedRun);
        return {
          continued: true, workflowRunId: updatedRun.id, chainId: chain.id,
          stepCompleted: chainCtx.stepId,
          message: `Cadena "${chain.name}" completada.`,
        };
      }

      // Step limit guard
      if (hasExceededStepLimit(updatedRun)) {
        updatedRun = releaseLock(updatedRun, execution.id);
        updatedRun = terminalizeRun(updatedRun, "BLOCKED");
        updatedRun.auditTrail.push(createWorkflowChainAuditEvent({
          runId: updatedRun.id, event: "chain_safety_limit_reached",
          message: `Límite de ${SAFETY_LIMITS.MAX_STEP_RESULTS} steps alcanzado.`,
        }));
        await workflowRunRepository.updateRun(updatedRun);
        return { continued: false, workflowRunId: updatedRun.id, message: "Límite de steps excedido.", errors: ["MAX_STEPS_EXCEEDED"] };
      }

      const { nextStep, nextStatus } = nextDecision;

      if (nextStatus === "WAITING_APPROVAL") {
        // Safety limit: approvals
        if (hasExceededApprovalLimit(updatedRun)) {
          updatedRun = releaseLock(updatedRun, execution.id);
          updatedRun = terminalizeRun(updatedRun, "BLOCKED");
          updatedRun.auditTrail.push(createWorkflowChainAuditEvent({
            runId: updatedRun.id, event: "chain_safety_limit_reached",
            message: `Límite de ${SAFETY_LIMITS.MAX_APPROVALS} aprobaciones alcanzado.`,
          }));
          await workflowRunRepository.updateRun(updatedRun);
          return { continued: false, workflowRunId: updatedRun.id, message: "Límite de aprobaciones excedido." };
        }

        const { approvalId, wasDuplicate } = await createApprovalForStep(chain, nextStep, updatedRun, orgSlug);
        updatedRun = advanceRunToStep(updatedRun, nextStep.id, "RUNNING");

        if (wasDuplicate) {
          updatedRun.auditTrail.push(createWorkflowChainAuditEvent({
            runId: updatedRun.id, event: "duplicate_approval_prevented",
            stepId: nextStep.id, approvalId: approvalId ?? undefined,
            message: `Aprobación duplicada prevenida para "${nextStep.label}".`,
          }));
        } else {
          updatedRun = incrementApprovalCount(updatedRun);
        }

        updatedRun.stepResults.push(createWorkflowStepResult({
          stepId:     nextStep.id,
          status:     "WAITING_APPROVAL",
          approvalId: approvalId ?? undefined,
          message:    `Step "${nextStep.label}" esperando aprobación.`,
        }));
        updatedRun.auditTrail.push(createWorkflowChainAuditEvent({
          runId: updatedRun.id, event: "approval_requested",
          stepId: nextStep.id, approvalId: approvalId ?? undefined,
          message: `Aprobación ${wasDuplicate ? "existente reutilizada" : "solicitada"} para "${nextStep.label}".`,
        }));
        updatedRun = releaseLock(updatedRun, execution.id);
        await workflowRunRepository.updateRun(updatedRun);
        return {
          continued: true, workflowRunId: updatedRun.id, chainId: chain.id,
          stepCompleted: chainCtx.stepId, nextStep: nextStep.id,
          nextStatus: "WAITING_APPROVAL", approvalId: approvalId ?? undefined,
          message: `Cadena en espera. Aprobación ${wasDuplicate ? "existente" : "requerida"} para "${nextStep.label}".`,
        };
      }

      if (nextStatus === "READY") {
        // Safety limit: dispatches
        if (hasExceededDispatchLimit(updatedRun)) {
          updatedRun = releaseLock(updatedRun, execution.id);
          updatedRun = terminalizeRun(updatedRun, "BLOCKED");
          updatedRun.auditTrail.push(createWorkflowChainAuditEvent({
            runId: updatedRun.id, event: "chain_safety_limit_reached",
            message: `Límite de ${SAFETY_LIMITS.MAX_AUTO_DISPATCHES} dispatches alcanzado.`,
          }));
          await workflowRunRepository.updateRun(updatedRun);
          return { continued: false, workflowRunId: updatedRun.id, message: "Límite de dispatches excedido." };
        }

        updatedRun = advanceRunToStep(updatedRun, nextStep.id, "RUNNING");
        const { executionId: execId, wasDuplicate } = await dispatchStepExecution(
          nextStep, updatedRun, orgSlug, execution.id,
        );

        if (wasDuplicate) {
          updatedRun.auditTrail.push(createWorkflowChainAuditEvent({
            runId: updatedRun.id, event: "duplicate_execution_prevented",
            stepId: nextStep.id, executionId: execId ?? undefined,
            message: `Ejecución duplicada prevenida para "${nextStep.label}".`,
          }));
        } else {
          updatedRun = incrementDispatchCount(updatedRun);
        }

        updatedRun.stepResults.push(createWorkflowStepResult({
          stepId:      nextStep.id,
          status:      "RUNNING",
          executionId: execId ?? undefined,
          message:     `Step "${nextStep.label}" despachado${wasDuplicate ? " (existente)" : ""}.`,
          startedAt:   new Date().toISOString(),
        }));
        updatedRun.auditTrail.push(createWorkflowChainAuditEvent({
          runId: updatedRun.id, event: "step_started",
          stepId: nextStep.id, executionId: execId ?? undefined,
          message: `Step "${nextStep.label}" ejecutado. Job: ${execId ?? "error"}.`,
        }));
        updatedRun = releaseLock(updatedRun, execution.id);
        await workflowRunRepository.updateRun(updatedRun);
        return {
          continued: true, workflowRunId: updatedRun.id, chainId: chain.id,
          stepCompleted: chainCtx.stepId, nextStep: nextStep.id,
          nextStatus: "RUNNING", executionDispatched: !wasDuplicate,
          message: `Step "${nextStep.label}" en ejecución${wasDuplicate ? " (dedup)" : ""}.`,
        };
      }

      // BLOCKED
      updatedRun = releaseLock(updatedRun, execution.id);
      updatedRun = advanceRunToStep(updatedRun, nextStep.id, "BLOCKED");
      await workflowRunRepository.updateRun(updatedRun);
      return {
        continued: false, workflowRunId: updatedRun.id,
        stepCompleted: chainCtx.stepId, nextStep: nextStep.id, nextStatus,
        message: nextDecision.reason,
      };

    } catch (err) {
      const message = err instanceof Error ? err.message : "Error inesperado en continueChainAfterExecution.";
      console.error("[workflow-chain-service] continueChainAfterExecution error:", err);

      // Phase 10 — Dead-letter: write chain_continuation_failed audit event
      if (runForDeadLetter) {
        try {
          const failEvent = buildFailureAuditEvent(runForDeadLetter.id, execution.id, err);
          const aborted   = abortLock(runForDeadLetter, execution.id);
          aborted.auditTrail.push(failEvent);
          await workflowRunRepository.updateRun(aborted);
        } catch {
          // Silently absorb — dead-letter write failure must never propagate
        }
      }

      return { continued: false, message, errors: [message] };
    }
  },

  /**
   * Cancel a running chain run.
   */
  async cancelChain(runId: string): Promise<ChainActionResult> {
    try {
      const run = await workflowRunRepository.findById(runId);
      if (!run) return { success: false, workflowRunId: runId, chainId: "", currentStatus: "CANCELLED", message: "Run no encontrado." };
      if (isChainTerminal(run)) return { success: false, workflowRunId: runId, chainId: run.chainId, currentStatus: run.status as any, message: "Run ya está en estado terminal." };

      const updated = terminalizeRun(run, "CANCELLED");
      updated.auditTrail.push(createWorkflowChainAuditEvent({
        runId,
        event:   "chain_cancelled",
        message: "Cadena cancelada manualmente.",
      }));
      await workflowRunRepository.updateRun(updated);

      return { success: true, workflowRunId: runId, chainId: run.chainId, previousStatus: run.status as any, currentStatus: "CANCELLED", message: "Cadena cancelada." };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error cancelando cadena.";
      return { success: false, workflowRunId: runId, chainId: "", currentStatus: "CANCELLED", message, errors: [message] };
    }
  },

  /**
   * Get a single workflow run.
   */
  async getWorkflowRun(runId: string): Promise<ChainQueryResult> {
    try {
      const run = await workflowRunRepository.findById(runId);
      return { found: !!run, run: run ?? undefined };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Error consultando run.";
      return { found: false, error };
    }
  },

  /**
   * List workflow runs for an org.
   */
  async listWorkflowRunsForOrg(orgSlug: string, limit?: number): Promise<ChainListResult> {
    try {
      const runs = await workflowRunRepository.listByOrg(orgSlug, limit);
      return { runs, total: runs.length };
    } catch {
      return { runs: [], total: 0 };
    }
  },

  /**
   * Phase 11 — Recovery helper.
   * Finds WorkflowRuns that appear stuck (RUNNING > 15min, BLOCKED > 5min).
   * Read-only: never mutates data. Returns a diagnostic report only.
   */
  async recoverStuckRuns(orgSlug: string): Promise<StuckRunReport[]> {
    try {
      const candidates = await workflowRunRepository.listStuckRuns(orgSlug);
      const reports: StuckRunReport[] = [];

      for (const run of candidates) {
        const { stuck, reason, recommendedAction } = isRunStuck(run);
        if (!stuck) continue;

        const lastAuditEvent = run.auditTrail.length > 0
          ? run.auditTrail[run.auditTrail.length - 1]
          : null;

        const updatedMs    = new Date(run.updatedAt).getTime();
        const staleSinceMs = Date.now() - updatedMs;

        reports.push({
          runId:             run.id,
          chainId:           run.chainId,
          chainName:         run.chainName,
          status:            run.status,
          currentStepId:     run.currentStepId,
          lastAuditEvent,
          staleSinceMs,
          recommendedAction,
        });
      }

      return reports;
    } catch (err) {
      console.warn("[workflow-chain-service] recoverStuckRuns error:", err);
      return [];
    }
  },

};
