/**
 * lib/copilot/actions/action-executor.ts
 *
 * Agentik Copilot — Action Executor
 * Sprint: AGENTIK-COPILOT-WORK-EXECUTION-BRIDGE-01
 *
 * Bridges CopilotAction → WorkExecutionRequest → WorkExecutionResponse → CopilotActionResult.
 *
 * Architecture rules:
 *   - Synchronous, client-safe, no Prisma, no TaskService.
 *   - OPEN_MODULE is navigation-only — returns a direct result, bypasses Work layer.
 *   - All other actions are work-backed and route through executeWork().
 *   - Real persistence happens server-side in future sprints.
 *
 * Guards enforced (in order):
 *   1. OPEN_MODULE  → direct return (navigation concerns, not work)
 *   2. disabled     → rejected
 *   3. coming_soon  → rejected with safe message
 *   4. requires confirmation && !confirmed → rejected
 *   5. live mode    → rejected (not yet implemented)
 *   6. work-backed  → Work Execution pipeline
 *   7. fallback     → safe stub
 */

import type {
  CopilotActionKind,
  CopilotActionMode,
  CopilotActionExecutionRequest,
  CopilotActionExecutionResponse,
} from "./action-types";
import { getActionDefinition }               from "./action-registry";
import { buildWorkExecutionRequest }         from "./work-action-adapter";
import { mapWorkResponseToCopilotResult }    from "./action-result-mapper";
import { buildTaskDraftFromCopilotAction }   from "./task-action-adapter";
import { executeWork }                       from "@/lib/work/work-executor";
import type { WorkExecutionMode }            from "@/lib/work/work-types";

// ── Work-backed action set ─────────────────────────────────────────────────────

/**
 * The set of CopilotActionKind values that produce real work.
 * OPEN_MODULE is excluded — it is navigation-only.
 */
const WORK_BACKED_KINDS = new Set<CopilotActionKind>([
  "CREATE_TASK",
  "SCHEDULE_FOLLOWUP",
  "GENERATE_REPORT",
  "CREATE_ALERT",
  "REQUEST_APPROVAL",
  "PREPARE_DOCUMENT",
  "RUN_WORKFLOW",
  "SEND_MESSAGE",
]);

/**
 * Returns true if the given action kind routes through the Work Execution layer.
 * OPEN_MODULE returns false — it is handled by the navigation layer only.
 */
export function isWorkBackedAction(kind: CopilotActionKind): boolean {
  return WORK_BACKED_KINDS.has(kind);
}

// ── Mode converter ─────────────────────────────────────────────────────────────

/** Convert lowercase CopilotActionMode to uppercase WorkExecutionMode. */
function toWorkMode(mode: CopilotActionMode): WorkExecutionMode {
  if (mode === "preview") return "PREVIEW";
  if (mode === "live")    return "LIVE";
  return "STUB";
}

// ── Executor ──────────────────────────────────────────────────────────────────

/**
 * Execute a Copilot action.
 *
 * All work-backed actions route through:
 *   buildWorkExecutionRequest() → executeWork() → mapWorkResponseToCopilotResult()
 *
 * OPEN_MODULE is navigation-only and bypasses the Work layer entirely.
 */
export function executeCopilotAction(
  request: CopilotActionExecutionRequest,
): CopilotActionExecutionResponse {
  const definition = getActionDefinition(request.kind);
  const mode       = request.mode ?? definition.defaultMode;
  const now        = new Date().toISOString();

  // ── Guard 1: OPEN_MODULE — navigation only, not a work action ───────────────
  if (request.kind === "OPEN_MODULE") {
    return {
      definition,
      executedAt: now,
      result: {
        success: true,
        status:  "simulated",
        message: "Módulo listo para navegar.",
      },
    };
  }

  // ── Guard 2: disabled ────────────────────────────────────────────────────────
  if (definition.status === "disabled") {
    return {
      definition,
      executedAt: now,
      result: {
        success: false,
        status:  "disabled",
        message: "Esta acción aún no está disponible en este contexto.",
      },
    };
  }

  // ── Guard 3: coming_soon ─────────────────────────────────────────────────────
  if (definition.status === "coming_soon") {
    return {
      definition,
      executedAt: now,
      result: {
        success: false,
        status:  "coming_soon",
        message: "Esta acción estará disponible próximamente.",
      },
    };
  }

  // ── Guard 4: requires confirmation ──────────────────────────────────────────
  if (definition.requiresConfirmation && request.confirmed !== true) {
    return {
      definition,
      executedAt: now,
      result: {
        success: false,
        status:  "requires_confirmation",
        message: "Esta acción requiere confirmación antes de ejecutarse.",
      },
    };
  }

  // ── Guard 5: live mode ───────────────────────────────────────────────────────
  // REQUEST_APPROVAL uses "live" mode but is intercepted by the drawer before
  // reaching this executor. If it reaches here, return a safe simulated result.
  if (mode === "live" && request.kind !== "REQUEST_APPROVAL") {
    return {
      definition,
      executedAt: now,
      result: {
        success: false,
        status:  "error",
        message: "El modo de ejecución real aún no está habilitado.",
      },
    };
  }

  // ── Work-backed execution ────────────────────────────────────────────────────
  if (isWorkBackedAction(request.kind)) {
    const workRequest  = buildWorkExecutionRequest(request.kind, request.context, toWorkMode(mode));
    const workResponse = executeWork(workRequest);
    let   result       = mapWorkResponseToCopilotResult(workResponse, workRequest.workType);

    // CREATE_TASK: augment metadata with TaskDraft for backward compatibility.
    // task-action-adapter imports only from pure task-factory / task-assignment — no Prisma.
    if (request.kind === "CREATE_TASK" && result.success) {
      const taskDraft = buildTaskDraftFromCopilotAction(request.context);
      result = {
        ...result,
        metadata: {
          ...result.metadata,
          taskDraft: taskDraft as unknown as Record<string, unknown>,
        },
      };
    }

    // REQUEST_APPROVAL: drawer intercepts this before reaching the executor.
    // If it reaches here (e.g. from a non-drawer call site), return a safe
    // simulated result so callers are not broken.
    if (request.kind === "REQUEST_APPROVAL") {
      return {
        definition,
        executedAt: now,
        result: {
          success: true,
          status:  "simulated",
          message: "Solicitud de aprobación pendiente — usa el drawer para crear una aprobación real.",
        },
      };
    }

    return { definition, executedAt: now, result };
  }

  // ── Fallback (should not be reached with current action set) ─────────────────
  return {
    definition,
    executedAt: now,
    result: {
      success: true,
      status:  "simulated",
      message: "Acción ejecutada correctamente.",
    },
  };
}
