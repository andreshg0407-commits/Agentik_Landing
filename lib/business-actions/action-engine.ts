/**
 * action-engine.ts
 *
 * BUSINESS-ACTION-ENGINE-01
 * Action engine contract and in-memory implementation.
 *
 * Converts approved decisions into controlled, auditable actions.
 * Default mode: dry_run. No real side effects.
 *
 * Does NOT call AI. Does NOT query databases. Does NOT modify external state.
 *
 * No Prisma. No React. No AI. No UI. Pure domain types.
 */

import type { BusinessAction } from "./action";
import { buildBusinessAction } from "./action";
import type { ActionPlan } from "./action-plan";
import { buildActionPlan } from "./action-plan";
import type { ActionExecution } from "./action-execution";
import { buildActionExecution, completeExecution } from "./action-execution";
import type { ActionExecutionResult } from "./action-result";
import { buildDryRunResult, buildFailedResult, buildApprovalRequiredResult } from "./action-result";
import type { ActionContext } from "./action-context";
import type { ActionApproval } from "./action-approval";
import { noActionApprovalNeeded, buildActionApproval } from "./action-approval";
import type { ActionPolicy, PolicyCheckResult } from "./action-policy";
import { checkPolicy, defaultSafePolicy } from "./action-policy";
import type { ActionTrace } from "./action-trace";
import { buildActionTrace } from "./action-trace";
import { ActionRegistry, DEFAULT_HANDLERS } from "./action-registry";
import type { ActionType, ExecutionMode } from "./action-types";
import type { BusinessDecision } from "@/lib/business-decisions";
import type { DecisionOption } from "@/lib/business-decisions/decision-option";

// -- Engine Contract ----------------------------------------------------------

/** Action engine contract. */
export interface IActionEngine {
  /** Build an ActionPlan from a BusinessDecision. */
  buildActionPlan(ctx: ActionContext): ActionPlan;

  /** Build BusinessActions from the selected decision option. */
  buildActionsFromDecision(decision: BusinessDecision, option: DecisionOption, ctx: ActionContext): BusinessAction[];

  /** Validate an action against policy. */
  validateAction(action: BusinessAction, policy: ActionPolicy): PolicyCheckResult;

  /** Check if approval is required. */
  checkApproval(action: BusinessAction, policy: ActionPolicy): ActionApproval;

  /** Execute a single action (dry_run by default). */
  executeAction(action: BusinessAction, ctx: ActionContext): ActionExecutionResult;

  /** Execute all actions in a plan (dry_run by default). */
  executePlan(plan: ActionPlan, ctx: ActionContext): ActionExecutionResult[];

  /** Dry-run a single action. */
  dryRunAction(action: BusinessAction): ActionExecutionResult;

  /** Dry-run all actions in a plan. */
  dryRunPlan(plan: ActionPlan): ActionExecutionResult[];
}

// -- In-Memory Implementation -------------------------------------------------

/** In-memory action engine. All execution is dry_run in this sprint. */
export class InMemoryActionEngine implements IActionEngine {
  private readonly registry: ActionRegistry;

  constructor(registry?: ActionRegistry) {
    this.registry = registry ?? new ActionRegistry();
    if (this.registry.size() === 0) {
      this.registry.registerAll(DEFAULT_HANDLERS);
    }
  }

  buildActionPlan(ctx: ActionContext): ActionPlan {
    const decision = ctx.decision;
    const option = ctx.selectedOption;

    if (!decision || !option) {
      return buildActionPlan({
        organizationId: ctx.organizationId,
        title: "Plan de accion vacio",
        description: "Sin decision u opcion seleccionada",
        executionMode: "dry_run",
        policy: ctx.policy,
      });
    }

    const actions = this.buildActionsFromDecision(decision, option, ctx);

    return buildActionPlan({
      organizationId: ctx.organizationId,
      decisionId: decision.decisionId,
      title: `Acciones: ${option.title}`,
      description: `Plan de accion derivado de decision "${decision.title}"`,
      actions,
      executionMode: ctx.executionMode,
      policy: ctx.policy,
    });
  }

  buildActionsFromDecision(
    decision: BusinessDecision,
    option: DecisionOption,
    ctx: ActionContext,
  ): BusinessAction[] {
    const trace = buildActionTrace({
      sourceDecisionId: decision.decisionId,
      sourcePlanId: ctx.plan?.planId ?? null,
      sourceEventIds: ctx.events.map(e => e.eventId),
      sourceSignalIds: ctx.signals.map(s => s.signalId),
    });

    const actions: BusinessAction[] = [];

    // Map strategy to action types
    const actionMap = this.strategyToActions(option.strategy);

    for (const mapping of actionMap) {
      const policy = ctx.policy ?? defaultSafePolicy(ctx.organizationId);
      const policyCheck = checkPolicy(policy, mapping.actionType, ctx.executionMode);

      const approval = policyCheck.requiresApproval
        ? buildActionApproval({
            required: true,
            approvalType: "manager",
            requiredRole: "gerente",
            reason: `Policy "${policy.name}" requiere aprobacion para "${mapping.actionType}"`,
          })
        : noActionApprovalNeeded();

      actions.push(buildBusinessAction({
        organizationId: ctx.organizationId,
        title: mapping.title,
        description: mapping.description,
        actionType: mapping.actionType,
        source: "decision_engine",
        trace,
        decisionId: decision.decisionId,
        planId: ctx.plan?.planId ?? null,
        approval,
        policy,
      }));
    }

    return actions;
  }

  validateAction(action: BusinessAction, policy: ActionPolicy): PolicyCheckResult {
    return checkPolicy(policy, action.actionType, "dry_run");
  }

  checkApproval(action: BusinessAction, policy: ActionPolicy): ActionApproval {
    const check = checkPolicy(policy, action.actionType, "dry_run");
    if (check.requiresApproval) {
      return buildActionApproval({
        required: true,
        approvalType: "manager",
        requiredRole: "gerente",
        reason: `Policy requiere aprobacion para "${action.actionType}"`,
      });
    }
    return noActionApprovalNeeded();
  }

  executeAction(action: BusinessAction, ctx: ActionContext): ActionExecutionResult {
    const policy = ctx.policy ?? defaultSafePolicy(ctx.organizationId);
    const policyCheck = checkPolicy(policy, action.actionType, ctx.executionMode);

    // Policy blocks
    if (!policyCheck.allowed) {
      return buildFailedResult({
        message: `Accion bloqueada por policy`,
        error: policyCheck.reason,
      });
    }

    // Approval required but not approved
    if (action.approval.required && action.approval.status !== "approved") {
      return buildApprovalRequiredResult({
        message: `Accion "${action.title}" requiere aprobacion de ${action.approval.requiredRole}`,
      });
    }

    // Force dry_run
    if (policyCheck.forceDryRun || ctx.executionMode === "dry_run") {
      return this.dryRunAction(action);
    }

    // In this sprint, everything runs as dry_run regardless
    return this.dryRunAction(action);
  }

  executePlan(plan: ActionPlan, ctx: ActionContext): ActionExecutionResult[] {
    return plan.actions.map(action => this.executeAction(action, ctx));
  }

  dryRunAction(action: BusinessAction): ActionExecutionResult {
    const handler = this.registry.getHandler(action.actionType);
    if (handler) {
      return handler.dryRun(action);
    }

    // No handler — generic dry run
    return buildDryRunResult({
      message: `[DRY RUN] "${action.title}" (tipo: ${action.actionType}) — sin handler registrado`,
      output: { actionId: action.actionId, actionType: action.actionType },
    });
  }

  dryRunPlan(plan: ActionPlan): ActionExecutionResult[] {
    return plan.actions.map(action => this.dryRunAction(action));
  }

  // -- Private helpers --------------------------------------------------------

  private strategyToActions(strategy: string): Array<{ actionType: ActionType; title: string; description: string }> {
    switch (strategy) {
      case "remove_portfolio_sample":
        return [
          { actionType: "portfolio_remove_reference", title: "Retirar referencia de maleta", description: "Retirar muestra agotada de maletas activas" },
          { actionType: "vendor_contact_request", title: "Notificar vendedor", description: "Informar al vendedor del retiro de muestra" },
          { actionType: "timeline_append", title: "Registrar en timeline", description: "Agregar evento a timeline ejecutivo" },
        ];
      case "produce":
        return [
          { actionType: "production_review_request", title: "Revisar produccion", description: "Solicitar revision de OPs abiertas" },
          { actionType: "timeline_append", title: "Registrar en timeline", description: "Agregar revision a timeline" },
        ];
      case "transfer_inventory":
        return [
          { actionType: "inventory_transfer_suggestion", title: "Sugerir traslado", description: "Sugerir traslado de inventario entre bodegas" },
          { actionType: "alert_create", title: "Crear alerta", description: "Alerta de traslado sugerido para logistica" },
          { actionType: "timeline_append", title: "Registrar en timeline", description: "Agregar sugerencia a timeline" },
        ];
      case "contact_vendor":
        return [
          { actionType: "vendor_contact_request", title: "Contactar vendedor", description: "Solicitar contacto con vendedores afectados" },
          { actionType: "task_create", title: "Crear tarea", description: "Tarea de seguimiento con vendedor" },
        ];
      case "contact_customer":
        return [
          { actionType: "customer_contact_request", title: "Contactar cliente", description: "Solicitar contacto con clientes afectados" },
          { actionType: "task_create", title: "Crear tarea", description: "Tarea de seguimiento con cliente" },
        ];
      case "escalate_to_management":
        return [
          { actionType: "alert_create", title: "Alerta a gerencia", description: "Crear alerta critica para gerencia" },
          { actionType: "notification_send", title: "Notificar gerencia", description: "Enviar notificacion a gerencia" },
          { actionType: "dashboard_update", title: "Actualizar dashboard", description: "Agregar situacion critica a dashboard ejecutivo" },
        ];
      case "wait_for_production":
        return [
          { actionType: "production_review_request", title: "Verificar produccion", description: "Verificar estado de produccion en curso" },
          { actionType: "timeline_append", title: "Registrar espera", description: "Documentar decision de esperar produccion" },
        ];
      case "review_data":
        return [
          { actionType: "data_refresh_request", title: "Solicitar actualizacion", description: "Solicitar actualizacion de datos desde fuente" },
          { actionType: "manual_review_request", title: "Revision manual", description: "Solicitar revision manual de datos" },
        ];
      case "do_nothing":
        return [
          { actionType: "timeline_append", title: "Documentar no-accion", description: "Registrar decision de no intervenir" },
        ];
      default:
        return [
          { actionType: "manual_review_request", title: "Revision manual", description: `Estrategia "${strategy}" requiere revision manual` },
        ];
    }
  }
}
