/**
 * lib/agentik/action-registry.ts
 *
 * Agentik Copilot — centralised action registry.
 *
 * Maps (moduleId, actionType) → a real executor function.
 * Executors run immediately with live DB data and return an ExecutionResult.
 *
 * Return modes:
 *   "executed" — action ran successfully
 *   "task"     — action fell back to ActionTask creation
 *   "chain"    — orchestrated via execution-plans (assembled by copilot-actions)
 *
 * When no executor is registered, executeRegisteredAction returns
 * { mode: "task" } and the caller falls back to generic ActionTask creation.
 *
 * Registered executors (Sprint 5 — refinement):
 *   executive.execute  → executiveExportFlashReport      (real: flash report from executive module)
 *   executive.schedule → executiveExportFlashReport      (real: flash report from executive module)
 *   finance.execute    → financeExportFlashReport        (real: creates + runs ScheduledReport)
 *   finance.schedule   → financeExportFlashReport        (real: creates + runs ScheduledReport)
 *   reports.execute    → reportsShareLatestReport        (real: re-executes most recent report)
 *   reports.schedule   → reportsShareLatestReport        (real: re-executes most recent report)
 *   alerts.escalate    → alertsEscalateCritical          (real: queries live alert, creates URGENT task)
 *   alerts.execute     → alertsEscalateCritical          (real: queries live alert, creates URGENT task)
 *   sales.delegate     → salesCreateCollectionFollowup   (real: queries highest balanceDue, creates task)
 *
 * Removed in Sprint 4 hardening (were stubs returning "executed" dishonestly):
 *   shopify.execute    — all callers removed (out_of_stock_response plan deleted)
 *   marketing.delegate — all callers removed (out_of_stock_response plan deleted)
 *   whatsapp.execute   — all callers removed (out_of_stock_response plan deleted)
 *
 * Note: "sales.execute" is intentionally absent here — it is intercepted upstream
 * by execution-plans.ts chain detection before reaching the registry.
 */

import { prisma }              from "@/lib/prisma";
import { createActionTask }    from "@/lib/actions/service";
import {
  ActionTaskType,
  ActionTaskPriority,
}                              from "@prisma/client";
import {
  createScheduledReport,
  executeScheduledReport,
  listScheduledReports,
}                              from "@/lib/scheduled-reports/service";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExecutorContext {
  orgId:       string;
  orgSlug:     string;
  userId:      string;
  userEmail:   string;
  label:       string;
  description: string;
}

/** Per-step outcome inside a chain execution (assembled by copilot-actions). */
export interface ChainStepResult {
  stepIndex:     number;
  label:         string;
  specialist:    string;
  mode:          "executed" | "delegated" | "task" | "failed";
  resultMessage: string;
  taskId?:       string;
  error?:        string;
}

export interface ExecutionResult {
  mode:          "executed" | "delegated" | "task" | "chain";
  resultMessage: string;
  taskId?:       string;
  detail?:       string;
  /** Populated only when mode === "chain" (assembled upstream). */
  steps?:        ChainStepResult[];
}

type Executor = (ctx: ExecutorContext) => Promise<ExecutionResult>;

// ── Registry map ──────────────────────────────────────────────────────────────

const REGISTRY: Record<string, Executor> = {
  // Executive — flash report from the control tower
  "executive.execute":  executiveExportFlashReport,
  "executive.schedule": executiveExportFlashReport,

  // Finance
  "finance.execute":    financeExportFlashReport,
  "finance.schedule":   financeExportFlashReport,

  // Reports
  "reports.execute":    reportsShareLatestReport,
  "reports.schedule":   reportsShareLatestReport,

  // Alerts
  "alerts.escalate":    alertsEscalateCritical,
  "alerts.execute":     alertsEscalateCritical,

  // Sales — only "delegate" here; "execute" is intercepted as a chain plan
  "sales.delegate":     salesCreateCollectionFollowup,
};

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Attempt to run a registered executor for the given (moduleId, actionType).
 * Returns { mode: "task" } when no executor is registered — the caller then
 * falls back to ActionTask creation.
 */
export async function executeRegisteredAction(
  moduleId:   string,
  actionType: string,
  ctx:        ExecutorContext,
): Promise<ExecutionResult> {
  const key      = `${moduleId}.${actionType}`;
  const executor = REGISTRY[key];
  if (!executor) return { mode: "task", resultMessage: "" };

  return executor(ctx);
}

// ── Executor: executive.export_flash_report ───────────────────────────────────

/**
 * Generates an executive-level flash report from the control tower.
 * Covers KPIs, aging, F1/F2 split, and critical alerts summary.
 * Delegates to the same ScheduledReport engine used by finance.
 */
async function executiveExportFlashReport(ctx: ExecutorContext): Promise<ExecutionResult> {
  const report = await createScheduledReport(ctx.orgId, ctx.userEmail, {
    title:      `Flash Ejecutivo — ${new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}`,
    query:      "KPIs ejecutivos: ventas F1/F2, aging de cartera por segmento, alertas críticas activas, varianza vs presupuesto del período",
    frequency:  "ONCE",
    reportType: "flash_report",
    firstRunAt: new Date(),
  });

  const result = await executeScheduledReport(ctx.orgId, report.id);
  if (!result.ok) {
    throw new Error(result.error ?? "Error al generar el flash ejecutivo");
  }

  return {
    mode:          "executed",
    resultMessage: "Flash ejecutivo generado — disponible en Reportes",
    detail:        `reportId: ${report.id}`,
  };
}

// ── Executor: finance.export_flash_report ─────────────────────────────────────

/**
 * Creates a one-off ScheduledReport and executes it immediately.
 * Sends an in-app notification to the requesting user.
 */
async function financeExportFlashReport(ctx: ExecutorContext): Promise<ExecutionResult> {
  const report = await createScheduledReport(ctx.orgId, ctx.userEmail, {
    title:      `Flash Report — ${new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}`,
    query:      "ventas e ingresos del mes actual con varianza vs período anterior",
    frequency:  "ONCE",
    reportType: "flash_report",
    firstRunAt: new Date(),
  });

  const result = await executeScheduledReport(ctx.orgId, report.id);
  if (!result.ok) {
    throw new Error(result.error ?? "Error al generar el flash report");
  }

  return {
    mode:          "executed",
    resultMessage: "Flash report generado — disponible en Reportes",
    detail:        `reportId: ${report.id}`,
  };
}

// ── Executor: reports.share_latest_report ─────────────────────────────────────

/**
 * Finds the most recently run active ScheduledReport and re-executes it,
 * sending its results to all configured recipients.
 * Falls back to { mode: "task" } when no report has ever run.
 */
async function reportsShareLatestReport(ctx: ExecutorContext): Promise<ExecutionResult> {
  const reports  = await listScheduledReports(ctx.orgId, { activeOnly: true, limit: 20 });
  const withRuns = reports.filter(r => r.lastRunAt !== null);

  if (withRuns.length === 0) {
    // No report has run yet — signal task fallback
    return { mode: "task", resultMessage: "" };
  }

  const latest = withRuns.sort(
    (a, b) => (b.lastRunAt?.getTime() ?? 0) - (a.lastRunAt?.getTime() ?? 0),
  )[0];

  const result = await executeScheduledReport(ctx.orgId, latest.id);
  if (!result.ok) {
    throw new Error(result.error ?? "Error al ejecutar el informe");
  }

  return {
    mode:          "executed",
    resultMessage: `"${latest.title}" compartido con los destinatarios`,
    detail:        `reportId: ${latest.id}`,
  };
}

// ── Executor: alerts.escalate_critical ────────────────────────────────────────

/**
 * Finds the most critical open alert (business alert preferred, then system alert)
 * and creates an URGENT ESCALAR_A_GERENCIA ActionTask targeting it.
 */
async function alertsEscalateCritical(ctx: ExecutorContext): Promise<ExecutionResult> {
  let alertTitle = "Alerta crítica";
  let alertId:   string | undefined;

  // Prefer BusinessAlert (sales engine alerts)
  try {
    const biz = await (prisma as unknown as Record<string, {
      findFirst: (a: unknown) => Promise<{ id: string; title: string } | null>;
    }>).businessAlert.findFirst({
      where:   { organizationId: ctx.orgId, severity: "CRITICAL", status: "OPEN" },
      orderBy: { createdAt: "desc" },
      select:  { id: true, title: true },
    });
    if (biz) { alertId = biz.id; alertTitle = biz.title; }
  } catch {
    // businessAlert model not yet migrated — fall through to system alerts
  }

  // Fall back to system alert
  if (!alertId) {
    const sys = await prisma.alert.findFirst({
      where:   { organizationId: ctx.orgId, severity: "CRITICAL", status: "OPEN" },
      orderBy: { createdAt: "desc" },
      select:  { id: true, title: true },
    });
    if (sys) { alertId = sys.id; alertTitle = sys.title; }
  }

  const task = await createActionTask(ctx.orgId, ctx.userEmail, {
    title:        `Escalación gerencial: ${alertTitle}`,
    description:  ctx.description || "Alerta crítica identificada por Agentik Copilot. Requiere atención inmediata de gerencia.",
    actionType:   ActionTaskType.ESCALAR_A_GERENCIA,
    targetType:   alertId ? "alert" : undefined,
    targetId:     alertId,
    targetLabel:  alertTitle,
    sourceModule: "agentik_copilot",
    priority:     ActionTaskPriority.URGENT,
  });

  return {
    mode:          "executed",
    resultMessage: `Escalación enviada a gerencia: "${alertTitle}"`,
    taskId:        task.id,
    detail:        `taskId: ${task.id}`,
  };
}

// ── Executor: sales.create_collection_followup ────────────────────────────────

/**
 * Queries the customer with the highest outstanding balance and creates
 * a HIGH-priority CREAR_ACCION_COBRANZA ActionTask targeting them.
 */
async function salesCreateCollectionFollowup(ctx: ExecutorContext): Promise<ExecutionResult> {
  let customerName = "cartera vencida";
  let customerId:  string | undefined;

  try {
    const top = await (prisma as unknown as Record<string, {
      findFirst: (a: unknown) => Promise<{
        customerId: string | null;
        customerName: string;
        balanceDue: unknown;
      } | null>;
    }>).customerReceivable.findFirst({
      where:   { organizationId: ctx.orgId, balanceDue: { gt: 0 } },
      orderBy: { balanceDue: "desc" },
      select:  { customerId: true, customerName: true, balanceDue: true },
    });
    if (top) {
      customerName = top.customerName;
      customerId   = top.customerId ?? undefined;
    }
  } catch {
    // CustomerReceivable model not yet available — proceed with generic task
  }

  const task = await createActionTask(ctx.orgId, ctx.userEmail, {
    title:        `Cobranza prioritaria: ${customerName}`,
    description:  ctx.description || "Cliente identificado por Agentik Copilot con el mayor saldo vencido. Acción de cobranza requerida.",
    actionType:   ActionTaskType.CREAR_ACCION_COBRANZA,
    targetType:   customerId ? "customer" : undefined,
    targetId:     customerId,
    targetLabel:  customerName,
    sourceModule: "agentik_copilot",
    priority:     ActionTaskPriority.HIGH,
  });

  return {
    mode:          "executed",
    resultMessage: `Cobranza iniciada: "${customerName}"`,
    taskId:        task.id,
    detail:        `taskId: ${task.id}`,
  };
}

