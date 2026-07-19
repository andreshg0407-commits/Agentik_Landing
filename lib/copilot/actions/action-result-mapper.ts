/**
 * lib/copilot/actions/action-result-mapper.ts
 *
 * Agentik Copilot — Work Execution Response → Copilot Action Result Mapper
 * Sprint: AGENTIK-COPILOT-WORK-EXECUTION-BRIDGE-01
 *
 * Converts a WorkExecutionResponse into a CopilotActionResult.
 * Pure. No React. No Prisma. No router. No side effects.
 */

import type { WorkExecutionResponse, WorkArtifact, WorkType } from "@/lib/work/work-types";
import type { CopilotActionResult }                            from "./action-types";

// ── Entity type resolution ─────────────────────────────────────────────────────

const WORK_TYPE_TO_ENTITY_TYPE: Record<WorkType, string> = {
  TASK:     "task",
  REPORT:   "report",
  DOCUMENT: "document",
  APPROVAL: "approval",
  ALERT:    "alert",
  WORKFLOW: "workflow",
  MESSAGE:  "message",
  EXPORT:   "export",
  IMPORT:   "import",
  ANALYSIS: "analysis",
};

/**
 * Resolve the created entity type string from a WorkType.
 */
export function resolveCreatedEntityTypeFromWorkType(workType: WorkType): string {
  return WORK_TYPE_TO_ENTITY_TYPE[workType] ?? "work_item";
}

/**
 * Extract the primary artifact from a WorkExecutionResponse (first artifact, if any).
 */
export function extractPrimaryArtifactFromWorkResponse(
  response: WorkExecutionResponse,
): WorkArtifact | undefined {
  return response.result.artifacts?.[0];
}

/**
 * Extract structured work metadata for inclusion in CopilotActionResult.metadata.
 *
 * Captures: workType, workStatus, workResult, workExecution, workArtifacts.
 */
export function extractWorkMetadata(
  response: WorkExecutionResponse,
  workType: WorkType,
): Record<string, unknown> {
  return {
    workType,
    workStatus:    response.result.status,
    workResult:    (response.result as unknown) as Record<string, unknown>,
    workExecution: (response.result.execution as unknown) as Record<string, unknown> | undefined,
    workArtifacts: ((response.result.artifacts ?? []) as unknown) as Record<string, unknown>[],
  };
}

// ── Main mapper ────────────────────────────────────────────────────────────────

/**
 * Map a WorkExecutionResponse to a CopilotActionResult.
 *
 * Success path — extracts:
 *   - createdEntityType from WorkType
 *   - createdEntityId   from primary artifact → execution → workItem (first non-null)
 *   - metadata          with full work execution context
 *
 * Failure path — maps WorkStatus → Copilot status, surfaces errors.
 */
export function mapWorkResponseToCopilotResult(
  response: WorkExecutionResponse,
  workType: WorkType,
): CopilotActionResult {
  const { result } = response;

  if (!result.success) {
    const copilotStatus: CopilotActionResult["status"] =
      result.status === "WAITING" ? "requires_confirmation" : "error";

    return {
      success: false,
      status:  copilotStatus,
      message: result.message,
      data:    result.errors?.length ? { errors: result.errors } : undefined,
    };
  }

  const primaryArtifact = extractPrimaryArtifactFromWorkResponse(response);
  const createdEntityId = primaryArtifact?.id
    ?? result.execution?.id
    ?? result.workItem?.id;

  return {
    success:           true,
    status:            "simulated",
    message:           result.message,
    createdEntityType: resolveCreatedEntityTypeFromWorkType(workType),
    createdEntityId,
    metadata:          extractWorkMetadata(response, workType),
  };
}
