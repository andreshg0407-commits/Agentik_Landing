/**
 * lib/work/executors/collections-executor.ts
 *
 * Agentik — Collections Module Executor
 * Sprint: AGENTIK-MULTI-MODULE-EXECUTORS-01
 *
 * SERVER-ONLY — handles collections/AR recovery domain actions.
 * Actions: PAYMENT_PLAN | FOLLOW_UP | COLLECTION_CAMPAIGN
 *
 * Current state: stub — real Prisma integration in future sprint.
 */
// NOTE: When real Prisma integration is added to this executor, add:
// import "server-only";
// The server-only boundary is enforced at the registry level (module-executor-registry.ts).

import type {
  ModuleExecutor,
  ModuleExecutorContext,
  ModuleExecutorResult,
  ModuleExecutorHealth,
} from "./module-executor-contract";

const ACTION_TYPES = ["PAYMENT_PLAN", "FOLLOW_UP", "COLLECTION_CAMPAIGN"] as const;

const ACTION_MESSAGES: Record<string, string> = {
  PAYMENT_PLAN:        "Plan de pago configurado y asignado al cliente.",
  FOLLOW_UP:           "Seguimiento de cartera registrado y gestión iniciada.",
  COLLECTION_CAMPAIGN: "Campaña de cobranza activada para el segmento seleccionado.",
};

const ACTION_WARNINGS: Record<string, string> = {
  PAYMENT_PLAN:        "Plan de pago stub — integración con cartera pendiente.",
  FOLLOW_UP:           "Seguimiento stub — gestión de contacto pendiente.",
  COLLECTION_CAMPAIGN: "Campaña stub — motor de campañas pendiente.",
};

class CollectionsExecutor implements ModuleExecutor {
  readonly module           = "cobranza";
  readonly supportedActions = [...ACTION_TYPES] as string[];
  readonly supportsRetry    = true;

  canHandle(actionType: string): boolean {
    return (ACTION_TYPES as readonly string[]).includes(actionType);
  }

  async execute(ctx: ModuleExecutorContext): Promise<ModuleExecutorResult> {
    const executedAt = new Date().toISOString();

    return {
      success:    true,
      actionType: ctx.actionType,
      module:     this.module,
      message:    ACTION_MESSAGES[ctx.actionType] ?? `Acción de cobranza "${ctx.actionType}" registrada.`,
      output: {
        stub:        true,
        module:      this.module,
        actionType:  ctx.actionType,
        approvalId:  ctx.approvalId,
        orgSlug:     ctx.orgSlug,
        entityType:  ctx.entityType,
        entityId:    ctx.entityId,
        executedAt,
      },
      errors:     [],
      warnings:   [ACTION_WARNINGS[ctx.actionType] ?? "Executor en modo stub."],
      executedAt,
      isStub:     true,
    };
  }

  validate(ctx: ModuleExecutorContext): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!this.canHandle(ctx.actionType)) {
      errors.push(`CollectionsExecutor no soporta actionType "${ctx.actionType}". Soportados: ${ACTION_TYPES.join(", ")}`);
    }
    if (!ctx.orgSlug?.trim())    errors.push("orgSlug es requerido.");
    if (!ctx.approvalId?.trim()) errors.push("approvalId es requerido.");
    return { valid: errors.length === 0, errors };
  }

  async healthCheck(): Promise<ModuleExecutorHealth> {
    return {
      module:    this.module,
      healthy:   true,
      message:   "CollectionsExecutor operativo (modo stub).",
      checkedAt: new Date().toISOString(),
    };
  }
}

export const collectionsExecutor = new CollectionsExecutor();
