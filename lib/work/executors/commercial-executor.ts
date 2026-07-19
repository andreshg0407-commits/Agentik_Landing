/**
 * lib/work/executors/commercial-executor.ts
 *
 * Agentik — Commercial Module Executor
 * Sprint: AGENTIK-MULTI-MODULE-EXECUTORS-01
 *
 * SERVER-ONLY — handles commercial operations domain actions.
 * Actions: PORTFOLIO_TRANSFER | ORDER_RELEASE | PRICE_UPDATE
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

const ACTION_TYPES = ["PORTFOLIO_TRANSFER", "ORDER_RELEASE", "PRICE_UPDATE"] as const;

const ACTION_MESSAGES: Record<string, string> = {
  PORTFOLIO_TRANSFER: "Transferencia de cartera ejecutada y asignada.",
  ORDER_RELEASE:      "Pedido liberado y enviado a preparación.",
  PRICE_UPDATE:       "Actualización de precio registrada y aplicada.",
};

const ACTION_WARNINGS: Record<string, string> = {
  PORTFOLIO_TRANSFER: "Transferencia stub — integración SAG pendiente.",
  ORDER_RELEASE:      "Liberación stub — motor de pedidos pendiente.",
  PRICE_UPDATE:       "Actualización de precio stub — catálogo pendiente.",
};

class CommercialExecutor implements ModuleExecutor {
  readonly module           = "comercial";
  readonly supportedActions = [...ACTION_TYPES] as string[];
  readonly supportsRetry    = false;

  canHandle(actionType: string): boolean {
    return (ACTION_TYPES as readonly string[]).includes(actionType);
  }

  async execute(ctx: ModuleExecutorContext): Promise<ModuleExecutorResult> {
    const executedAt = new Date().toISOString();

    return {
      success:    true,
      actionType: ctx.actionType,
      module:     this.module,
      message:    ACTION_MESSAGES[ctx.actionType] ?? `Acción comercial "${ctx.actionType}" registrada.`,
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
      errors.push(`CommercialExecutor no soporta actionType "${ctx.actionType}". Soportados: ${ACTION_TYPES.join(", ")}`);
    }
    if (!ctx.orgSlug?.trim())    errors.push("orgSlug es requerido.");
    if (!ctx.approvalId?.trim()) errors.push("approvalId es requerido.");
    return { valid: errors.length === 0, errors };
  }

  async healthCheck(): Promise<ModuleExecutorHealth> {
    return {
      module:    this.module,
      healthy:   true,
      message:   "CommercialExecutor operativo (modo stub).",
      checkedAt: new Date().toISOString(),
    };
  }
}

export const commercialExecutor = new CommercialExecutor();
