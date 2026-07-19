/**
 * lib/work/work-executor.ts
 *
 * Agentik — Work Executor (Stub + Preview)
 * Sprint: AGENTIK-WORK-EXECUTION-FOUNDATION-01
 *
 * Executes a WorkExecutionRequest and returns a WorkExecutionResponse.
 * STUB mode: in-memory simulation, no side effects.
 * PREVIEW mode: minimal side effects (e.g. CREATE_TASK persists via taskService).
 * LIVE mode: rejected — not yet implemented.
 *
 * No React. No direct Prisma. Side effects only through service layer.
 */

import type {
  WorkExecutionRequest,
  WorkExecutionResponse,
  WorkArtifact,
  WorkActor,
  WorkArtifactType,
} from "./work-types";
import {
  createWorkItem,
  createWorkExecution,
  createWorkArtifact,
  createWorkResult,
  SYSTEM_WORK_ACTOR,
} from "./work-factory";
import { WORK_TYPE_REGISTRY } from "./work-registry";

// ── Actor resolver ─────────────────────────────────────────────────────────────

function resolveActor(agentId: string): WorkActor {
  const name = agentId.charAt(0).toUpperCase() + agentId.slice(1);
  return { id: agentId, type: agentId === "system" ? "SYSTEM" : "AGENT", name };
}

// ── Artifact type resolver ────────────────────────────────────────────────────

const WORK_TYPE_TO_ARTIFACT: Record<string, WorkArtifactType> = {
  TASK:     "TASK",
  REPORT:   "REPORT",
  DOCUMENT: "DOCUMENT",
  APPROVAL: "APPROVAL",
  ALERT:    "ALERT",
  WORKFLOW: "WORKFLOW_RESULT",
  MESSAGE:  "MESSAGE",
  EXPORT:   "EXPORT",
  IMPORT:   "FILE",
  ANALYSIS: "REPORT",
};

// ── Stub artifact builders ────────────────────────────────────────────────────

function buildStubArtifact(
  request:    WorkExecutionRequest,
  workItemId: string,
  executionId: string,
): WorkArtifact {
  const artifactType = WORK_TYPE_TO_ARTIFACT[request.workType] ?? "FILE";
  const def          = WORK_TYPE_REGISTRY[request.workType];

  return createWorkArtifact({
    workItemId,
    executionId,
    type:        artifactType,
    title:       `${def.label} · ${request.title}`,
    description: `Artefacto simulado generado por ${request.context.agentId}.`,
    payload: {
      stubMode:     true,
      workType:     request.workType,
      orgSlug:      request.context.orgSlug,
      moduleSlug:   request.context.moduleSlug,
      agentId:      request.context.agentId,
      generatedAt:  new Date().toISOString(),
      params:       request.params ?? {},
    },
    mode:        request.mode,
    metadata:    { drawerCategory: request.context.drawerCategory },
  });
}

// ── Main executor ──────────────────────────────────────────────────────────────

export function executeWork(
  request: WorkExecutionRequest,
): WorkExecutionResponse {
  const now  = new Date().toISOString();
  const actor = resolveActor(request.context.agentId);

  // Guard: LIVE mode is not implemented
  if (request.mode === "LIVE") {
    return {
      executedAt: now,
      result: createWorkResult({
        success:  false,
        status:   "FAILED",
        message:  "El modo LIVE de ejecución aún no está habilitado.",
        errors:   ["LIVE execution mode is not yet available."],
      }),
    };
  }

  // Guard: APPROVAL type requires confirmed
  const def = WORK_TYPE_REGISTRY[request.workType];
  if (def.supportsApproval && request.workType === "APPROVAL" && !request.confirmed) {
    return {
      executedAt: now,
      result: createWorkResult({
        success: false,
        status:  "WAITING",
        message: "Esta acción requiere confirmación antes de ejecutarse.",
      }),
    };
  }

  // Build work item
  const workItem = createWorkItem({
    type:        request.workType,
    title:       request.title,
    description: request.description,
    priority:    request.priority ?? "MEDIUM",
    source:      "COPILOT",
    actor,
    context:     request.context,
    metadata:    request.params ?? {},
  });

  // Build execution
  const execution = createWorkExecution({
    workItemId: workItem.id,
    mode:       request.mode,
    actor,
    status:     "RUNNING",
  });

  // Build artifact (for types that produce them)
  const artifacts: WorkArtifact[] = [];
  if (def.supportsArtifacts) {
    const artifact = buildStubArtifact(request, workItem.id, execution.id);
    artifacts.push(artifact);
  }

  // Finalize execution
  const completedExecution = createWorkExecution({
    workItemId: workItem.id,
    mode:       request.mode,
    actor,
    status:     "COMPLETED",
    artifacts,
    metadata:   { ...execution.metadata, completedAt: now },
  });

  // Build stub messages per work type
  const STUB_MESSAGES: Record<string, string> = {
    TASK:     "Tarea preparada correctamente en modo simulación.",
    REPORT:   "Informe ejecutivo simulado generado correctamente.",
    DOCUMENT: "Documento de soporte simulado preparado.",
    APPROVAL: "Solicitud de aprobación simulada enviada.",
    ALERT:    "Alerta operativa simulada registrada.",
    WORKFLOW: "Flujo operativo simulado iniciado.",
    MESSAGE:  "Mensaje simulado preparado.",
    EXPORT:   "Exportación simulada generada.",
    IMPORT:   "Importación simulada procesada.",
    ANALYSIS: "Análisis contextual simulado completado.",
  };

  return {
    executedAt: now,
    result: createWorkResult({
      success:   true,
      status:    "COMPLETED",
      message:   STUB_MESSAGES[request.workType] ?? "Trabajo ejecutado correctamente.",
      workItem,
      execution: completedExecution,
      artifacts,
    }),
  };
}
