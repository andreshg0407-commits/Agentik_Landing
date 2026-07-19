/**
 * lib/work/executors/finance-executor.ts
 *
 * Agentik — Finance Module Executor
 * Sprint: AGENTIK-MULTI-MODULE-EXECUTORS-01
 *
 * SERVER-ONLY — handles financial domain actions.
 * Actions: RECONCILIATION | TREASURY_TRANSFER | PAYMENT_APPROVAL
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

const ACTION_TYPES = ["RECONCILIATION", "TREASURY_TRANSFER", "PAYMENT_APPROVAL"] as const;

const ACTION_MESSAGES: Record<string, string> = {
  RECONCILIATION:    "Conciliación registrada y movimientos marcados como conciliados.",
  TREASURY_TRANSFER: "Transferencia de tesorería autorizada y registrada.",
  PAYMENT_APPROVAL:  "Pago aprobado y enviado para procesamiento.",
};

const ACTION_WARNINGS: Record<string, string> = {
  RECONCILIATION:    "Conciliación real pendiente — requiere conexión con motor SAG.",
  TREASURY_TRANSFER: "Transferencia stub — integración bancaria pendiente.",
  PAYMENT_APPROVAL:  "Aprobación stub — integración de pagos pendiente.",
};

class FinanceExecutor implements ModuleExecutor {
  readonly module           = "finanzas";
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
      message:    ACTION_MESSAGES[ctx.actionType] ?? `Acción financiera "${ctx.actionType}" registrada.`,
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
      errors.push(`FinanceExecutor no soporta actionType "${ctx.actionType}". Soportados: ${ACTION_TYPES.join(", ")}`);
    }
    if (!ctx.orgSlug?.trim())    errors.push("orgSlug es requerido.");
    if (!ctx.approvalId?.trim()) errors.push("approvalId es requerido.");
    return { valid: errors.length === 0, errors };
  }

  async healthCheck(): Promise<ModuleExecutorHealth> {
    return {
      module:    this.module,
      healthy:   true,
      message:   "FinanceExecutor operativo (modo stub).",
      checkedAt: new Date().toISOString(),
    };
  }
}

export const financeExecutor = new FinanceExecutor();
