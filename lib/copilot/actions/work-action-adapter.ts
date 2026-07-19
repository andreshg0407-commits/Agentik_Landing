/**
 * lib/copilot/actions/work-action-adapter.ts
 *
 * Agentik Copilot — CopilotAction → WorkExecutionRequest Adapter
 * Sprint: AGENTIK-WORK-EXECUTION-FOUNDATION-01
 *
 * Converts Copilot action kinds into WorkExecutionRequests.
 * The adapter bridges the Copilot action layer and the Work execution domain.
 *
 * No React. No Prisma. No side effects.
 */

import type { CopilotActionKind, CopilotActionContext } from "./action-types";
import type {
  WorkType,
  WorkPriority,
  WorkExecutionMode,
  WorkExecutionRequest,
  WorkContext,
} from "@/lib/work/work-types";
import type { DrawerCategoryKey }                       from "@/lib/copilot/navigation/copilot-action-map";

// ── Action → WorkType mapping ─────────────────────────────────────────────────

const ACTION_TO_WORK_TYPE: Record<CopilotActionKind, WorkType> = {
  OPEN_MODULE:       "TASK",       // navigation, not a work kind — fallback
  CREATE_TASK:       "TASK",
  SCHEDULE_FOLLOWUP: "TASK",
  GENERATE_REPORT:   "REPORT",
  CREATE_ALERT:      "ALERT",
  REQUEST_APPROVAL:  "APPROVAL",
  PREPARE_DOCUMENT:  "DOCUMENT",
  RUN_WORKFLOW:      "WORKFLOW",
  SEND_MESSAGE:      "MESSAGE",
};

// ── Action → Priority mapping ─────────────────────────────────────────────────

const ACTION_TO_PRIORITY: Partial<Record<CopilotActionKind, WorkPriority>> = {
  CREATE_TASK:       "MEDIUM",
  SCHEDULE_FOLLOWUP: "MEDIUM",
  GENERATE_REPORT:   "MEDIUM",
  CREATE_ALERT:      "HIGH",
  REQUEST_APPROVAL:  "HIGH",
  PREPARE_DOCUMENT:  "LOW",
  RUN_WORKFLOW:      "HIGH",
  SEND_MESSAGE:      "LOW",
};

// ── Drawer category → priority bump ──────────────────────────────────────────

const CATEGORY_PRIORITY_BUMP: Partial<Record<DrawerCategoryKey, WorkPriority>> = {
  attention:        "HIGH",
  pendingApprovals: "HIGH",
  opportunities:    "MEDIUM",
  insights:         "MEDIUM",
};

// ── Title builders ────────────────────────────────────────────────────────────

const ACTION_TITLE_TEMPLATES: Record<CopilotActionKind, (agentName: string, category: string) => string> = {
  OPEN_MODULE:       (_, cat)    => `Abrir módulo desde ${cat}`,
  CREATE_TASK:       (agent, cat) => `Tarea creada por ${agent} · ${cat}`,
  SCHEDULE_FOLLOWUP: (agent, cat) => `Seguimiento programado por ${agent} · ${cat}`,
  GENERATE_REPORT:   (agent, cat) => `Informe ejecutivo · ${cat} · ${agent}`,
  CREATE_ALERT:      (agent, cat) => `Alerta operativa · ${cat} · ${agent}`,
  REQUEST_APPROVAL:  (_, cat)    => `Solicitud de aprobación · ${cat}`,
  PREPARE_DOCUMENT:  (agent, cat) => `Documento de soporte · ${cat} · ${agent}`,
  RUN_WORKFLOW:      (_, cat)    => `Flujo operativo · ${cat}`,
  SEND_MESSAGE:      (agent, cat) => `Mensaje de ${agent} · ${cat}`,
};

// ── Context mapping ───────────────────────────────────────────────────────────

export function mapCopilotContextToWorkContext(ctx: CopilotActionContext): WorkContext {
  return {
    orgSlug:        ctx.orgSlug,
    agentId:        ctx.agentId,
    moduleSlug:     ctx.moduleSlug,
    drawerCategory: ctx.drawerCategory,
  };
}

// ── Main adapter ──────────────────────────────────────────────────────────────

/**
 * Convert a CopilotActionKind + CopilotActionContext into a WorkExecutionRequest.
 */
export function buildWorkExecutionRequest(
  kind:    CopilotActionKind,
  context: CopilotActionContext,
  mode?:   WorkExecutionMode,
): WorkExecutionRequest {
  const workType    = ACTION_TO_WORK_TYPE[kind];
  const agentName   = context.agentId.charAt(0).toUpperCase() + context.agentId.slice(1);
  const category    = context.drawerCategory ?? "general";

  const titleFn     = ACTION_TITLE_TEMPLATES[kind];
  const title       = titleFn(agentName, category);

  const basePriority = ACTION_TO_PRIORITY[kind] ?? "MEDIUM";
  const bumpPriority = CATEGORY_PRIORITY_BUMP[category as DrawerCategoryKey];
  // Use higher of base vs bump
  const priorityWeight: Record<WorkPriority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  const priority: WorkPriority = bumpPriority && priorityWeight[bumpPriority] > priorityWeight[basePriority]
    ? bumpPriority
    : basePriority;

  return {
    workType,
    title,
    priority,
    mode:    mode ?? "STUB",
    context: mapCopilotContextToWorkContext(context),
    params: {
      actionKind:     kind,
      drawerCategory: context.drawerCategory,
      agentId:        context.agentId,
    },
    // APPROVAL types always require confirmation
    confirmed: workType !== "APPROVAL" ? true : undefined,
  };
}

/**
 * Resolve the WorkType for a given CopilotActionKind.
 * Useful for display and routing without building a full request.
 */
export function resolveWorkTypeForAction(kind: CopilotActionKind): WorkType {
  return ACTION_TO_WORK_TYPE[kind];
}
