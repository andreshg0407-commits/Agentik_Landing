"use server";

/**
 * lib/agentik/copilot-actions.ts
 *
 * Server actions for the Agentik Copilot persistent rail.
 *
 * sendCopilotMessage  — calls Claude with module context + conversation history,
 *                       returns AI message + up to 3 suggested actions.
 * executeCopilotAction — materialises a suggested action as an ActionTask
 *                        in the bandeja de acciones.
 *
 * When ANTHROPIC_API_KEY is absent the module returns a graceful fallback so
 * the rail always renders without crashing.
 */

import Anthropic                 from "@anthropic-ai/sdk";
import { requireOrgAccess }      from "@/lib/auth/org-access";
import {
  createActionTask,
  updateActionStatus,
  ActionTaskType,
  ActionTaskStatus,
  ActionTaskPriority,
}                                from "@/lib/actions/service";
import {
  executeRegisteredAction,
  type ExecutorContext,
  type ChainStepResult,
}                                from "@/lib/agentik/action-registry";
import {
  resolveChainPlan,
  type ChainPlan,
}                                from "@/lib/agentik/execution-plans";
import type {
  ModuleContext,
  CopilotActionType,
}                                from "@/lib/agentik/copilot-context";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role:    "user" | "assistant";
  content: string;
}

export interface CopilotSuggestedAction {
  type:        CopilotActionType;
  label:       string;
  description: string;
}

export interface CopilotResponse {
  message:          string;
  suggestedActions: CopilotSuggestedAction[];
  specialist:       string;
}

type ActionResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: string };

// ── Anthropic client (lazy — only instantiated if API key present) ─────────────

function getAnthropic() {
  return new Anthropic(); // reads ANTHROPIC_API_KEY from env automatically
}

// ── sendCopilotMessage ────────────────────────────────────────────────────────

export async function sendCopilotMessage(
  orgSlug:       string,
  moduleContext: ModuleContext,
  history:       ConversationMessage[],
  userMessage:   string,
): Promise<ActionResult<CopilotResponse>> {
  try {
    await requireOrgAccess(orgSlug); // auth guard

    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        ok:   true,
        data: {
          message:          `Recibí tu consulta sobre ${moduleContext.moduleLabel}. Configura ANTHROPIC_API_KEY para habilitar la inteligencia completa de Agentik Copilot.`,
          suggestedActions: [{
            type:        "recommend",
            label:       `Ver ${moduleContext.moduleLabel}`,
            description: `Ir directamente al módulo ${moduleContext.moduleLabel}`,
          }],
          specialist: moduleContext.specialist,
        },
      };
    }

    const systemPrompt = buildSystemPrompt(moduleContext);

    const messages: Anthropic.MessageParam[] = [
      ...history.map(m => ({
        role:    m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: userMessage },
    ];

    const response = await getAnthropic().messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 800,
      system:     systemPrompt,
      messages,
    });

    const block = response.content[0];
    if (block.type !== "text") {
      return { ok: false, error: "Respuesta inesperada del orquestador." };
    }

    return { ok: true, data: parseResponse(block.text, moduleContext) };

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de orquestación";
    console.error("[copilot-actions/send]", msg);
    return { ok: false, error: msg };
  }
}

// ── executeCopilotAction ──────────────────────────────────────────────────────

// Re-export so the client component only imports from one place
export type { ChainStepResult };

export interface ExecuteActionResult {
  mode:          "executed" | "delegated" | "task" | "chain";
  resultMessage: string;
  taskId?:       string;
  /** Populated only when mode === "chain" */
  steps?:        ChainStepResult[];
}

/**
 * Hybrid executor — three-tier resolution:
 *   1. Chain plan  — orchestrates N steps across modules (Sprint 3)
 *   2. Registry    — single real executor (Sprint 2)
 *   3. ActionTask  — generic task fallback (Sprint 1)
 */
export async function executeCopilotAction(
  orgSlug:     string,
  moduleId:    string,
  actionType:  CopilotActionType,
  label:       string,
  description: string,
): Promise<ActionResult<ExecuteActionResult>> {
  try {
    const { user, organization } = await requireOrgAccess(orgSlug);
    const userEmail = user.email ?? user.id;

    const registryKey = `${moduleId}.${actionType}`;

    const ctx: ExecutorContext = {
      orgId:       organization.id,
      orgSlug,
      userId:      user.id,
      userEmail,
      label,
      description,
    };

    // ── 1. Chain plan ─────────────────────────────────────────────────────────
    const plan = resolveChainPlan(registryKey);
    if (plan) {
      const steps = await runChain(plan, ctx);
      const taskId = await persistChainAudit(organization.id, userEmail, plan, steps);
      const executed   = steps.filter(s => s.mode === "executed").length;
      const delegated  = steps.filter(s => s.mode === "delegated").length;
      const tasked     = steps.filter(s => s.mode === "task").length;
      const failed     = steps.filter(s => s.mode === "failed").length;
      const total      = plan.steps.length;

      const parts: string[] = [];
      if (executed  > 0) parts.push(`${executed} ejecutado${executed  > 1 ? "s" : ""}`);
      if (delegated > 0) parts.push(`${delegated} delegado${delegated > 1 ? "s" : ""}`);
      if (tasked    > 0) parts.push(`${tasked} en bandeja`);
      if (failed    > 0) parts.push(`${failed} fallido${failed    > 1 ? "s" : ""}`);

      return {
        ok:   true,
        data: {
          mode:          "chain",
          resultMessage: `${plan.planLabel} — ${parts.join(", ")} de ${total} pasos`,
          taskId,
          steps,
        },
      };
    }

    // ── 2. Single registry executor ───────────────────────────────────────────
    const registered = await executeRegisteredAction(moduleId, actionType, ctx);

    if (registered.mode === "executed") {
      return {
        ok:   true,
        data: {
          mode:          "executed",
          resultMessage: registered.resultMessage,
          taskId:        registered.taskId,
        },
      };
    }

    // ── 3. Generic ActionTask fallback ────────────────────────────────────────
    const task = await createActionTask(organization.id, userEmail, {
      title:        label,
      description,
      actionType:   mapActionType(actionType),
      sourceModule: "agentik_copilot",
      priority:     ActionTaskPriority.HIGH,
    });

    return {
      ok:   true,
      data: {
        mode:          "task",
        resultMessage: "Creado en bandeja de acciones",
        taskId:        task.id,
      },
    };

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al ejecutar acción";
    console.error("[copilot-actions/execute]", msg);
    return { ok: false, error: msg };
  }
}

// ── Chain execution engine ────────────────────────────────────────────────────

/**
 * Runs each step of a ChainPlan sequentially.
 * failSoft steps: on error, creates a fallback ActionTask and continues.
 * Hard steps: on error, records failure and stops the chain.
 */
async function runChain(
  plan: ChainPlan,
  ctx:  ExecutorContext,
): Promise<ChainStepResult[]> {
  const results: ChainStepResult[] = [];

  for (const step of plan.steps) {
    const stepCtx: ExecutorContext = {
      ...ctx,
      label:       step.label,
      description: `${plan.planLabel} — ${step.label}`,
    };

    try {
      const result = await executeRegisteredAction(
        step.registryKey.split(".")[0],
        step.registryKey.split(".")[1],
        stepCtx,
      );

      // Collapse nested "chain" to "executed"; all other modes pass through as-is
      const stepMode = result.mode === "chain" ? "executed" : result.mode;
      results.push({
        stepIndex:     results.length,
        label:         step.label,
        specialist:    step.specialist,
        mode:          stepMode,
        resultMessage: result.resultMessage,
        taskId:        result.taskId,
      });

    } catch (e) {
      const error = e instanceof Error ? e.message : "Error en el paso";

      if (step.failSoft) {
        // Degrade to ActionTask and continue
        let fallbackTaskId: string | undefined;
        try {
          const fallback = await createActionTask(ctx.orgId, ctx.userEmail, {
            title:        `[Fallback] ${step.label}`,
            description:  `Paso fallido en flujo "${plan.planLabel}". Delegado manualmente. Error: ${error}`,
            actionType:   ActionTaskType.CREAR_TAREA_COMERCIAL,
            sourceModule: "agentik_copilot",
            priority:     ActionTaskPriority.HIGH,
          });
          fallbackTaskId = fallback.id;
        } catch {
          // Fallback task creation also failed — record as failed
        }

        results.push({
          stepIndex:     results.length,
          label:         step.label,
          specialist:    step.specialist,
          mode:          fallbackTaskId ? "task" : "failed",
          resultMessage: fallbackTaskId ? "Delegado a bandeja (paso fallido)" : error,
          taskId:        fallbackTaskId,
          error,
        });
      } else {
        // Hard failure — record and stop
        results.push({
          stepIndex:     results.length,
          label:         step.label,
          specialist:    step.specialist,
          mode:          "failed",
          resultMessage: error,
          error,
        });
        break;
      }
    }
  }

  return results;
}

/**
 * Creates an audit ActionTask (COMPLETED) with the full chain execution
 * summary persisted in payloadJson for the audit trail and mobile replay.
 */
async function persistChainAudit(
  orgId:     string,
  userEmail: string,
  plan:      ChainPlan,
  steps:     ChainStepResult[],
): Promise<string> {
  const executedCount  = steps.filter(s => s.mode === "executed").length;
  const delegatedCount = steps.filter(s => s.mode === "delegated").length;
  const taskedCount    = steps.filter(s => s.mode === "task").length;
  const failedCount    = steps.filter(s => s.mode === "failed").length;
  const now           = new Date().toISOString();

  const auditPayload: Record<string, unknown> = {
    planKey:         plan.planKey,
    planLabel:       plan.planLabel,
    stepsTotal:      plan.steps.length,
    stepsExecuted:   executedCount,
    stepsDelegated:  delegatedCount,
    stepsTasked:     taskedCount,
    stepsFailed:     failedCount,
    executedAt:     now,
    steps:          steps.map(s => ({
      stepIndex:     s.stepIndex,
      label:         s.label,
      specialist:    s.specialist,
      mode:          s.mode,
      resultMessage: s.resultMessage,
      taskId:        s.taskId ?? null,
      error:         s.error ?? null,
    })),
  };

  const auditTask = await createActionTask(orgId, userEmail, {
    title:        plan.planLabel,
    description:  plan.description,
    actionType:   ActionTaskType.GENERAR_INFORME,
    sourceModule: "agentik_copilot",
    priority:     ActionTaskPriority.HIGH,
    payloadJson:  auditPayload,
  });

  // Mark completed immediately — this is an audit record, not a pending task
  await updateActionStatus(orgId, auditTask.id, ActionTaskStatus.COMPLETED, {
    result: {
      stepsExecuted:  executedCount,
      stepsDelegated: delegatedCount,
      stepsTasked:    taskedCount,
      stepsFailed:    failedCount,
      completedAt:    now,
    },
  });

  return auditTask.id;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSystemPrompt(ctx: ModuleContext): string {
  const actionsList = ctx.availableActions.join(", ");

  return `Eres Agentik Copilot — el orquestador de inteligencia empresarial de Agentik Enterprise.

Módulo actual: ${ctx.moduleLabel} (${ctx.moduleId})
Descripción: ${ctx.description}
Especialista asignado: ${ctx.specialist}
Contexto técnico: ${ctx.systemHints}

Tu misión:
1. Analizar la consulta en el contexto exacto de este módulo
2. Responder en 2–4 oraciones — preciso, accionable, estratégico
3. Proponer hasta 3 acciones concretas al final

Estilo de respuesta: como un CFO que piensa como un CTO.
Idioma: español colombiano empresarial. Sin introducciones largas. Sin saludos.

Al terminar tu respuesta principal, incluye este bloque JSON (obligatorio):

<actions>
[
  {
    "type": "<tipo — debe ser uno de: ${actionsList}>",
    "label": "<máximo 4 palabras>",
    "description": "<qué hace, 1 oración>"
  }
]
</actions>

Máximo 3 acciones. El tipo DEBE ser uno de: ${actionsList}.`;
}

function parseResponse(text: string, ctx: ModuleContext): CopilotResponse {
  const match   = text.match(/<actions>([\s\S]*?)<\/actions>/);
  const message = text.replace(/<actions>[\s\S]*?<\/actions>/, "").trim();

  let suggestedActions: CopilotSuggestedAction[] = [];

  if (match) {
    try {
      const raw = JSON.parse(match[1].trim());
      if (Array.isArray(raw)) {
        suggestedActions = raw.slice(0, 3).map(a => ({
          type:        (ctx.availableActions.includes(a.type) ? a.type : "recommend") as CopilotActionType,
          label:       String(a.label ?? "Acción"),
          description: String(a.description ?? ""),
        }));
      }
    } catch {
      // JSON parse failed — fallback below
    }
  }

  if (suggestedActions.length === 0) {
    suggestedActions = [{
      type:        "recommend",
      label:       `Ver ${ctx.moduleLabel}`,
      description: `Explorar el módulo ${ctx.moduleLabel}`,
    }];
  }

  return { message, suggestedActions, specialist: ctx.specialist };
}

function mapActionType(type: CopilotActionType): ActionTaskType {
  const map: Record<CopilotActionType, ActionTaskType> = {
    ask:       ActionTaskType.CREAR_TAREA_COMERCIAL,
    recommend: ActionTaskType.ABRIR_ALERTA_OPERATIVA,
    execute:   ActionTaskType.CREAR_TAREA_COMERCIAL,
    delegate:  ActionTaskType.ASIGNAR_SEGUIMIENTO_VENDEDOR,
    escalate:  ActionTaskType.ESCALAR_A_GERENCIA,
    schedule:  ActionTaskType.PROGRAMAR_INFORME,
  };
  return map[type] ?? ActionTaskType.CREAR_TAREA_COMERCIAL;
}
