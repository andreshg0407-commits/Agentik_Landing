/**
 * lib/copilot/execution-handlers.ts
 *
 * Agentik Copilot — Safe Execution Handlers V1
 *
 * V1 handlers perform only safe, non-destructive, preparatory operations:
 *
 *   navigate_to_module          → Returns target path for client navigation
 *   create_task_draft           → Simulates creating a task draft
 *   create_budget_draft         → Simulates creating a budget recalibration draft
 *   create_projection_draft     → Simulates creating a close projection
 *   open_reconciliation_context → Returns reconciliation context path
 *   prepare_follow_up           → Simulates preparing a follow-up record
 *   request_human_approval      → Simulates routing to approval queue
 *
 * V2: handlers will write to Prisma and trigger real automations.
 * V1: architecture is real; execution is simulated (no data mutations).
 *
 * Sprint: AGENTIK-COPILOT-EXECUTION-LAYER-01
 */

import type { CopilotExecutionRequest } from "./execution-request";

// ── Handler result ─────────────────────────────────────────────────────────────

export type ExecutionResultStatus =
  | "prepared"
  | "navigated"
  | "draft_created"
  | "approval_requested"
  | "blocked"
  | "unsupported";

export interface ExecutionHandlerResult {
  success:     boolean;
  status:      ExecutionResultStatus;
  message:     string;
  targetPath?: string;       // For navigate/prepare handlers
  draftId?:    string;       // For create_*_draft handlers
  metadata?:   Record<string, unknown>;
}

// ── Handler type ───────────────────────────────────────────────────────────────

type ExecutionHandler = (
  request: CopilotExecutionRequest,
) => Promise<ExecutionHandlerResult>;

// ── Handler implementations ────────────────────────────────────────────────────

const handleNavigateToModule: ExecutionHandler = async (req) => {
  const targetPath = (req.payload["targetPath"] as string | undefined)
    ?? `/${req.orgSlug}/executive`;

  return {
    success:    true,
    status:     "navigated",
    message:    "Navegando al módulo indicado",
    targetPath: targetPath.startsWith("/") ? targetPath : `/${req.orgSlug}${targetPath}`,
    metadata:   { actionId: req.actionId, orgSlug: req.orgSlug },
  };
};

const handleCreateTaskDraft: ExecutionHandler = async (req) => {
  // V1: simulated — no Prisma write
  const draftId = crypto.randomUUID();
  const title   = (req.payload["title"] as string | undefined) ?? "Tarea generada por Copilot";

  return {
    success:    true,
    status:     "draft_created",
    message:    `Borrador de tarea creado: "${title}"`,
    draftId,
    metadata:   {
      actionId:   req.actionId,
      agentId:    req.agentId,
      title,
      module:     req.module,
      source:     req.source,
      // V2: persist to Prisma.CopilotTask
    },
  };
};

const handleCreateBudgetDraft: ExecutionHandler = async (req) => {
  // V1: simulated — no Prisma write
  const draftId = crypto.randomUUID();
  const module  = (req.payload["module"] as string | undefined) ?? req.module;
  const notes   = (req.payload["notes"]  as string | undefined) ?? "";

  return {
    success:    true,
    status:     "draft_created",
    message:    `Borrador de recalibración presupuestal preparado para ${module}`,
    draftId,
    targetPath: `/${req.orgSlug}/finanzas/planeacion`,
    metadata:   {
      actionId: req.actionId,
      agentId:  req.agentId,
      module,
      notes,
      type:     "budget_recalibration",
      // V2: persist to Prisma.BudgetDraft
    },
  };
};

const handleCreateProjectionDraft: ExecutionHandler = async (req) => {
  // V1: simulated — no Prisma write
  const draftId = crypto.randomUUID();
  const module  = (req.payload["module"] as string | undefined) ?? req.module;
  const basis   = (req.payload["basis"]  as string | undefined) ?? "current_velocity";

  return {
    success:    true,
    status:     "draft_created",
    message:    `Proyección de cierre calculada para ${module}`,
    draftId,
    targetPath: `/${req.orgSlug}/finanzas/planeacion`,
    metadata:   {
      actionId: req.actionId,
      agentId:  req.agentId,
      module,
      basis,
      type:     "close_projection",
      // V2: run real projection engine + persist to Prisma
    },
  };
};

const handleOpenReconciliationContext: ExecutionHandler = async (req) => {
  const targetPath = (req.payload["targetPath"] as string | undefined)
    ?? `/finanzas/conciliacion`;
  const focus      = (req.payload["focus"] as string | undefined) ?? "exceptions";

  return {
    success:    true,
    status:     "prepared",
    message:    `Contexto de conciliación abierto — enfoque: ${focus}`,
    targetPath: targetPath.startsWith("/") && !targetPath.startsWith(`/${req.orgSlug}`)
      ? `/${req.orgSlug}${targetPath}`
      : targetPath,
    metadata:   {
      actionId: req.actionId,
      agentId:  req.agentId,
      focus,
    },
  };
};

const handlePrepareFollowUp: ExecutionHandler = async (req) => {
  // V1: simulated — no Prisma write
  const draftId    = crypto.randomUUID();
  const entityType = (req.payload["entityType"] as string | undefined) ?? "unknown";
  const entityId   = req.entityId ?? "–";

  return {
    success:  true,
    status:   "prepared",
    message:  `Seguimiento preparado para ${entityType} ${entityId}`,
    draftId,
    metadata: {
      actionId:   req.actionId,
      agentId:    req.agentId,
      entityType,
      entityId,
      // V2: persist to Prisma.FollowUpRecord
    },
  };
};

const handleRequestHumanApproval: ExecutionHandler = async (req) => {
  // V1: simulated — no Prisma write
  const draftId     = crypto.randomUUID();
  const requestType = (req.payload["requestType"] as string | undefined)  ?? "general";
  const description = (req.payload["description"] as string | undefined) ?? req.actionId;
  const priority    = (req.payload["priority"]    as string | undefined) ?? "elevated";

  return {
    success:  true,
    status:   "approval_requested",
    message:  `Solicitud de aprobación enviada: "${description}"`,
    draftId,
    metadata: {
      actionId:    req.actionId,
      agentId:     req.agentId,
      requestType,
      priority,
      orgSlug:     req.orgSlug,
      createdBy:   req.createdBy,
      // V2: persist to Prisma.ApprovalRequest + notify approvers
    },
  };
};

// ── V3 Handler implementations ─────────────────────────────────────────────────
// Each handler: supports audit, governance state, rollback state, execution state machine.

const handleRefreshRuntime: ExecutionHandler = async (req) => {
  // V3: lifecycle execution simulated — no real SAG call yet (V4: trigger re-evaluation)
  const draftId = crypto.randomUUID();
  return {
    success:    true,
    status:     "prepared",
    message:    "Solicitud de actualización del runtime preparada — pendiente de confirmación",
    draftId,
    metadata: {
      actionId:      req.actionId,
      agentId:       req.agentId,
      handlerVersion: "V3",
      rollbackState:  "available",
      governanceCheck: "passed",
      auditCategory:  "runtime_ops",
      // V4: trigger SAG signal-engine re-evaluation via internal API
    },
  };
};

const handleValidateSync: ExecutionHandler = async (req) => {
  // V3: validation lifecycle simulated — returns connector health summary
  const draftId = crypto.randomUUID();
  const module  = (req.payload["module"] as string | undefined) ?? "integrations";
  return {
    success:    true,
    status:     "prepared",
    message:    `Validación de sincronización preparada para ${module}`,
    draftId,
    metadata: {
      actionId:      req.actionId,
      agentId:       req.agentId,
      module,
      handlerVersion: "V3",
      rollbackState:  "available",
      governanceCheck: "passed",
      auditCategory:  "sync_ops",
      // V4: call SAG adapter health check + persist to Prisma.ConnectorHealthLog
    },
  };
};

const handleRequestReview: ExecutionHandler = async (req) => {
  // V3: review request lifecycle simulated — marks operation as pending review
  const draftId     = crypto.randomUUID();
  const reviewType  = (req.payload["reviewType"]  as string | undefined) ?? "operational";
  const description = (req.payload["description"] as string | undefined) ?? req.actionId;
  return {
    success:    true,
    status:     "approval_requested",
    message:    `Solicitud de revisión ${reviewType} enviada: "${description}"`,
    draftId,
    metadata: {
      actionId:       req.actionId,
      agentId:        req.agentId,
      reviewType,
      description,
      handlerVersion: "V3",
      rollbackState:  "available",
      governanceCheck: "passed",
      auditCategory:  "review_ops",
      // V4: persist to Prisma.ReviewRequest + notify reviewer via notification service
    },
  };
};

const handleGenerateSummary: ExecutionHandler = async (req) => {
  // V3: generates a mock executive summary — no LLM call yet (V4: invoke Claude)
  const draftId  = crypto.randomUUID();
  const module   = req.module ?? "executive";
  const scope    = (req.payload["scope"] as string | undefined) ?? "session";
  return {
    success:    true,
    status:     "draft_created",
    message:    `Resumen ejecutivo preparado — alcance: ${scope}, módulo: ${module}`,
    draftId,
    targetPath: `/${req.orgSlug}/executive`,
    metadata: {
      actionId:       req.actionId,
      agentId:        req.agentId,
      module,
      scope,
      handlerVersion: "V3",
      rollbackState:  "available",
      governanceCheck: "passed",
      auditCategory:  "reporting_ops",
      // V4: invoke Claude API with session context → persist to Prisma.ExecutiveSummary
    },
  };
};

const handleTriggerFollowup: ExecutionHandler = async (req) => {
  // V3: follow-up lifecycle activation simulated — no WhatsApp/CRM call yet (V4)
  const draftId     = crypto.randomUUID();
  const entityType  = (req.payload["entityType"]  as string | undefined) ?? "cartera";
  const entityId    = req.entityId ?? "–";
  const channelHint = (req.payload["channel"] as string | undefined) ?? "whatsapp";
  return {
    success:    true,
    status:     "prepared",
    message:    `Seguimiento activado para ${entityType} ${entityId} — canal: ${channelHint}`,
    draftId,
    metadata: {
      actionId:       req.actionId,
      agentId:        req.agentId,
      entityType,
      entityId,
      channelHint,
      handlerVersion: "V3",
      rollbackState:  "not_supported",  // External comm cannot be rolled back in V3
      governanceCheck: "passed",
      auditCategory:  "commercial_ops",
      // V4: trigger Mila WhatsApp workflow via n8n + persist to Prisma.FollowUpRecord
    },
  };
};

// ── Handler dispatch map ───────────────────────────────────────────────────────

const HANDLERS: Record<string, ExecutionHandler> = {
  // V1 handlers
  navigate_to_module:          handleNavigateToModule,
  create_task_draft:           handleCreateTaskDraft,
  create_budget_draft:         handleCreateBudgetDraft,
  create_projection_draft:     handleCreateProjectionDraft,
  open_reconciliation_context: handleOpenReconciliationContext,
  prepare_follow_up:           handlePrepareFollowUp,
  request_human_approval:      handleRequestHumanApproval,
  // V3 handlers
  refresh_runtime:             handleRefreshRuntime,
  validate_sync:               handleValidateSync,
  request_review:              handleRequestReview,
  generate_summary:            handleGenerateSummary,
  trigger_followup:            handleTriggerFollowup,
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Executes a Copilot action request through the appropriate handler.
 *
 * Guards:
 *   - If policy says blocked or requires_approval → never executes
 *   - If handler not found → returns unsupported result
 *   - All errors are caught — never throws to the caller
 */
export async function executeAction(
  request:    CopilotExecutionRequest,
  handlerKey: string,
): Promise<ExecutionHandlerResult> {
  // ── Safety guard: respect policy ─────────────────────────────────────────
  if (!request.policy.allowed) {
    return {
      success: false,
      status:  "blocked",
      message: request.policy.reason ?? "Ejecución bloqueada por política de seguridad",
    };
  }

  // ── Dispatch to handler ───────────────────────────────────────────────────
  const handler = HANDLERS[handlerKey];

  if (!handler) {
    return {
      success: false,
      status:  "unsupported",
      message: `Handler "${handlerKey}" no implementado en V1`,
    };
  }

  try {
    return await handler(request);
  } catch (err) {
    return {
      success: false,
      status:  "blocked",
      message: err instanceof Error ? err.message : "Error inesperado en la ejecución",
    };
  }
}
