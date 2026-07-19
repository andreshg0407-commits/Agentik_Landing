/**
 * lib/copilot/actions/task-action-adapter.ts
 *
 * Agentik Copilot — CREATE_TASK Action → TaskDraft Adapter
 * Sprint: AGENTIK-TASK-SYSTEM-FOUNDATION-01
 *
 * Converts a Copilot action execution context into a structured TaskDraft.
 * The draft is transient — callers decide whether to persist it.
 *
 * No React. No Prisma. No router.
 */

import type { CopilotActionContext } from "./action-types";
import type {
  TaskDraft,
  TaskCategory,
  TaskPriority,
  TaskSource,
  TaskRelationship,
} from "@/lib/tasks/task-types";
import {
  createTaskDraft,
  createDefaultTaskBusinessContext,
  createTaskRelationship,
} from "@/lib/tasks/task-factory";
import {
  DIEGO_TASK_OWNER,
  SYSTEM_TASK_OWNER,
} from "@/lib/tasks/task-assignment";
import type { DrawerCategoryKey } from "@/lib/copilot/navigation/copilot-action-map";

// ── Context fixtures ──────────────────────────────────────────────────────────

const DRAWER_IMPACT: Partial<Record<DrawerCategoryKey, string>> = {
  attention:        "$4.250.000 pendientes de validación",
  activeWork:       "Proceso activo requiere seguimiento inmediato",
  pendingApprovals: "14 movimientos esperando decisión",
  suggestions:      "Oportunidad de mejora detectada por el agente",
  opportunities:    "Oportunidad de negocio identificada en pipeline",
  followups:        "Seguimiento programado pendiente de confirmar",
  recentActivity:   "Actividad reciente requiere revisión",
  insights:         "Hallazgo de análisis pendiente de evaluación",
};

const DRAWER_RECOMMENDATION: Partial<Record<DrawerCategoryKey, string>> = {
  attention:        "Revisar excepciones detectadas",
  activeWork:       "Verificar estado del proceso y continuar",
  pendingApprovals: "Aprobar o rechazar movimientos pendientes",
  suggestions:      "Aplicar recomendación del agente",
  opportunities:    "Evaluar y capturar oportunidad identificada",
  followups:        "Confirmar seguimiento con la contraparte",
  recentActivity:   "Revisar actividad reciente del módulo",
  insights:         "Analizar hallazgo del contexto operativo",
};

const DRAWER_ENTITY_TYPE: Partial<Record<DrawerCategoryKey, string>> = {
  attention:        "conciliation_exception",
  activeWork:       "active_process",
  pendingApprovals: "approval_item",
  suggestions:      "agent_suggestion",
  opportunities:    "business_opportunity",
  followups:        "followup_item",
  recentActivity:   "activity_event",
  insights:         "insight_item",
};

function resolveEntityId(category: DrawerCategoryKey | string): string {
  const key = (category as DrawerCategoryKey) in DRAWER_ENTITY_TYPE
    ? category as DrawerCategoryKey
    : "activeWork";
  return `fixture_${key}_001`;
}

function resolveNavigationTarget(orgSlug: string, moduleSlug?: string): string {
  const mod = moduleSlug ?? "";
  if (mod.includes("conciliacion"))     return `/${orgSlug}/finanzas/conciliacion`;
  if (mod.includes("tesoreria"))        return `/${orgSlug}/finanzas/tesoreria`;
  if (mod.includes("cierre"))           return `/${orgSlug}/finanzas/cierre`;
  if (mod.includes("planeacion"))       return `/${orgSlug}/finanzas/planeacion`;
  if (mod.includes("documentos"))       return `/${orgSlug}/finanzas/documentos`;
  if (mod.includes("cartera"))          return `/${orgSlug}/finanzas/cartera`;
  if (mod.includes("cobranza"))         return `/${orgSlug}/cobranza`;
  if (mod.includes("comercial"))        return `/${orgSlug}/comercial`;
  if (mod.includes("marketing"))        return `/${orgSlug}/agentik/marketing-studio`;
  return `/${orgSlug}/agentik`;
}

// ── Category mapping ──────────────────────────────────────────────────────────

const DRAWER_TO_TASK_CATEGORY: Record<DrawerCategoryKey, TaskCategory> = {
  attention:        "review",
  activeWork:       "review",
  pendingApprovals: "approval",
  suggestions:      "review",
  opportunities:    "followup",
  followups:        "followup",
  recentActivity:   "general",
  insights:         "investigation",
};

/**
 * Map a drawer category key to the most appropriate TaskCategory.
 */
export function mapDrawerCategoryToTaskCategory(
  category: DrawerCategoryKey | string,
): TaskCategory {
  return DRAWER_TO_TASK_CATEGORY[category as DrawerCategoryKey] ?? "general";
}

// ── Priority mapping ──────────────────────────────────────────────────────────

const DRAWER_TO_TASK_PRIORITY: Partial<Record<DrawerCategoryKey, TaskPriority>> = {
  attention:        "high",
  pendingApprovals: "high",
  opportunities:    "medium",
  insights:         "medium",
  followups:        "medium",
  activeWork:       "medium",
  suggestions:      "low",
  recentActivity:   "low",
};

/**
 * Map a drawer category to a sensible default TaskPriority.
 */
export function mapActionPriorityToTaskPriority(
  drawerCategory: DrawerCategoryKey | string,
): TaskPriority {
  return DRAWER_TO_TASK_PRIORITY[drawerCategory as DrawerCategoryKey] ?? "medium";
}

// ── Source resolver ───────────────────────────────────────────────────────────

function resolveTaskSource(context: CopilotActionContext): TaskSource {
  const mod = context.moduleSlug ?? "";
  if (mod.includes("finanzas") || mod.includes("conciliacion") || mod.includes("tesoreria")) return "finance";
  if (mod.includes("cobranza") || mod.includes("cartera"))  return "collections";
  if (mod.includes("comercial"))                            return "commercial";
  if (mod.includes("marketing"))                            return "marketing";
  if (mod.includes("inventario"))                           return "inventory";
  return "copilot";
}

// ── Title builder ─────────────────────────────────────────────────────────────

const CATEGORY_TASK_TITLES: Record<DrawerCategoryKey, string> = {
  attention:        "Revisar hallazgo de conciliación",
  activeWork:       "Dar seguimiento a proceso activo",
  pendingApprovals: "Completar proceso de aprobación",
  suggestions:      "Aplicar recomendación del agente",
  opportunities:    "Capturar oportunidad detectada",
  followups:        "Confirmar seguimiento programado",
  recentActivity:   "Revisar actividad reciente",
  insights:         "Analizar hallazgo del contexto",
};

function resolveTaskTitle(
  context:  CopilotActionContext,
  agentName: string,
): string {
  const cat    = context.drawerCategory as DrawerCategoryKey | undefined;
  const base   = cat ? CATEGORY_TASK_TITLES[cat] : "Tarea de seguimiento";
  return `${base} · ${agentName}`;
}

// ── Adapter functions ─────────────────────────────────────────────────────────

/**
 * Build a TaskDraft from a Copilot CREATE_TASK action context.
 * The agent is inferred from context.agentId.
 */
export function buildTaskDraftFromCopilotAction(
  context: CopilotActionContext,
): TaskDraft {
  const agentName = context.agentId.charAt(0).toUpperCase() + context.agentId.slice(1);
  const agentOwner =
    context.agentId === "diego" ? DIEGO_TASK_OWNER
    : context.agentId === "system" ? SYSTEM_TASK_OWNER
    : { id: context.agentId, type: "agent" as const, name: agentName };

  const category: DrawerCategoryKey | string = context.drawerCategory ?? "general";
  const taskCategory = mapDrawerCategoryToTaskCategory(category);
  const priority     = mapActionPriorityToTaskPriority(category);
  const source       = resolveTaskSource(context);

  const relationships: TaskRelationship[] = [
    createTaskRelationship(
      "created_from_copilot",
      "copilot_action",
      `copilot_create_task_${Date.now()}`,
      `Acción Copilot · ${context.drawerCategory ?? "general"}`,
    ),
  ];

  if (context.moduleSlug) {
    relationships.push(
      createTaskRelationship(
        "related_to_module",
        "module",
        context.moduleSlug,
        context.moduleSlug,
      ),
    );
  }

  const cat       = (context.drawerCategory ?? "activeWork") as DrawerCategoryKey;
  const entityType = DRAWER_ENTITY_TYPE[cat] ?? "task_item";

  return createTaskDraft({
    title:    resolveTaskTitle(context, agentName),
    description: `Tarea generada por ${agentName} desde el contexto de Copilot en ${context.moduleSlug || "la aplicación"}.`,
    priority,
    source,
    category: taskCategory,
    owner:    agentOwner,
    relationships,
    businessContext: {
      orgSlug:              context.orgSlug,
      module:               context.moduleSlug,
      sourceAgentId:        context.agentId,
      sourceAgentName:      agentName,
      sourceDrawerCategory: context.drawerCategory,
      entityType,
      entityId:             resolveEntityId(cat),
      navigationTarget:     resolveNavigationTarget(context.orgSlug, context.moduleSlug),
      impactSummary:        DRAWER_IMPACT[cat],
      recommendation:       DRAWER_RECOMMENDATION[cat],
    },
    createdBy: agentOwner,
    metadata: {
      generatedByAgent: context.agentId,
      drawerCategory:   context.drawerCategory,
      moduleSlug:       context.moduleSlug,
    },
  });
}

/**
 * Build a TaskDraft from a simplified drawer context object.
 * Alias for scenarios where the caller has only drawer data.
 */
export function buildTaskDraftFromDrawerContext(opts: {
  orgSlug:         string;
  agentId:         string;
  moduleSlug:      string;
  drawerCategory?: string;
}): TaskDraft {
  return buildTaskDraftFromCopilotAction({
    orgSlug:        opts.orgSlug,
    agentId:        opts.agentId,
    moduleSlug:     opts.moduleSlug,
    drawerCategory: opts.drawerCategory,
  });
}
