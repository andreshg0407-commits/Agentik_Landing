/**
 * Agentik — scheduled report service.
 *
 * Executes stored report schedules by calling interpret() + runReport() directly.
 * No HTTP calls. No external side-effects.
 */

import { prisma }            from "@/lib/prisma";
import { ScheduleFrequency } from "@prisma/client";
import type { ScheduledReport } from "@prisma/client";
import { interpret }         from "@/lib/reports/interpreter";
import { runReport }         from "@/lib/reports/runners";
import {
  createNotification,
}                            from "@/lib/notifications/service";
import { NotificationType }  from "@prisma/client";
import { sendEmail }         from "@/lib/email/adapter";
import { buildReportEmailHtml, buildReportEmailText } from "./email-payload";

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateScheduledReportInput {
  title:        string;
  query:        string;
  frequency:    ScheduleFrequency;
  recipients?:  string;   // comma-separated email addresses
  reportType?:  string;   // preset slug ("executive_weekly" | "cartera_aging" | "alertas_criticas")
  actionTaskId?: string;
  firstRunAt?:  Date;
}

export async function createScheduledReport(
  organizationId: string,
  createdBy:      string,
  input:          CreateScheduledReportInput,
): Promise<ScheduledReport> {
  const nextRunAt = input.firstRunAt ?? computeNextRun(new Date(), input.frequency);
  return prisma.scheduledReport.create({
    data: {
      organizationId,
      createdBy,
      title:        input.title,
      query:        input.query,
      frequency:    input.frequency,
      recipients:   input.recipients   ?? null,
      reportType:   input.reportType   ?? null,
      actionTaskId: input.actionTaskId ?? null,
      nextRunAt,
    },
  });
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listScheduledReports(
  organizationId: string,
  opts: { activeOnly?: boolean; limit?: number } = {},
): Promise<ScheduledReport[]> {
  return prisma.scheduledReport.findMany({
    where: {
      organizationId,
      ...(opts.activeOnly ? { isActive: true } : {}),
    },
    orderBy: { createdAt: "desc" },
    take:    opts.limit ?? 50,
  });
}

// ── Toggle active ─────────────────────────────────────────────────────────────

export async function toggleScheduledReport(
  organizationId: string,
  reportId:       string,
  isActive:       boolean,
): Promise<ScheduledReport> {
  const existing = await prisma.scheduledReport.findFirst({
    where: { id: reportId, organizationId },
  });
  if (!existing) throw new Error("SCHEDULED_REPORT_NOT_FOUND");
  return prisma.scheduledReport.update({
    where: { id: reportId },
    data:  { isActive },
  });
}

// ── Execute one ───────────────────────────────────────────────────────────────

export async function executeScheduledReport(
  organizationId: string,
  reportId:       string,
): Promise<{ ok: boolean; error?: string }> {
  const report = await prisma.scheduledReport.findFirst({
    where: { id: reportId, organizationId },
  });
  if (!report) throw new Error("SCHEDULED_REPORT_NOT_FOUND");

  try {
    const spec   = await interpret(report.query);
    const result = await runReport(organizationId, spec);

    const summary = {
      title:      result.title,
      rowCount:   Array.isArray(result.rows) ? result.rows.length : 0,
      executedAt: new Date().toISOString(),
    };

    const nextRunAt = computeNextRun(new Date(), report.frequency);

    await prisma.scheduledReport.update({
      where: { id: reportId },
      data:  {
        lastRunAt:  new Date(),
        lastResult: summary,
        lastError:  null,
        runCount:   { increment: 1 },
        nextRunAt:  report.frequency === ScheduleFrequency.ONCE ? null : nextRunAt,
        isActive:   report.frequency === ScheduleFrequency.ONCE ? false : report.isActive,
      },
    });

    // Notify creator (in-app)
    await createNotification({
      organizationId,
      recipientEmail: report.createdBy,
      type:           NotificationType.SCHEDULED_REPORT_READY,
      title:          `Informe listo: ${report.title}`,
      body:           `El informe programado fue ejecutado correctamente (${summary.rowCount} filas).`,
      actionTaskId:   report.actionTaskId ?? undefined,
    });

    // Send email to recipients if configured
    const recipientList = report.recipients
      ? report.recipients.split(",").map(s => s.trim()).filter(Boolean)
      : [];
    if (recipientList.length > 0) {
      await sendEmail({
        to:      recipientList,
        subject: `[Agentik] ${report.title}`,
        html:    buildReportEmailHtml({ title: report.title, frequency: report.frequency }, result),
        text:    buildReportEmailText(result),
      }).catch(err => console.error("[scheduled-reports] email send failed:", err));
    }

    return { ok: true };
  } catch (err) {
    const errorMessage = (err as Error).message ?? "Error desconocido";

    await prisma.scheduledReport.update({
      where: { id: reportId },
      data:  {
        lastRunAt:  new Date(),
        lastError:  errorMessage,
        runCount:   { increment: 1 },
        nextRunAt:  report.frequency === ScheduleFrequency.ONCE ? null : computeNextRun(new Date(), report.frequency),
        isActive:   report.frequency === ScheduleFrequency.ONCE ? false : report.isActive,
      },
    });

    // Notify creator of failure
    await createNotification({
      organizationId,
      recipientEmail: report.createdBy,
      type:           NotificationType.SCHEDULED_REPORT_FAILED,
      title:          `Error en informe: ${report.title}`,
      body:           `El informe programado falló: ${errorMessage}`,
      actionTaskId:   report.actionTaskId ?? undefined,
    });

    return { ok: false, error: errorMessage };
  }
}

// ── Run all due reports (called from cron) ────────────────────────────────────

export async function runDueReports(): Promise<{
  processed: number;
  succeeded: number;
  failed:    number;
}> {
  const due = await prisma.scheduledReport.findMany({
    where: {
      isActive:  true,
      nextRunAt: { lte: new Date() },
    },
    take: 50,
  });

  let succeeded = 0;
  let failed    = 0;

  for (const report of due) {
    const result = await executeScheduledReport(report.organizationId, report.id);
    if (result.ok) succeeded++;
    else           failed++;
  }

  return { processed: due.length, succeeded, failed };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeNextRun(from: Date, frequency: ScheduleFrequency): Date {
  const d = new Date(from);
  switch (frequency) {
    case ScheduleFrequency.WEEKLY:
      d.setDate(d.getDate() + 7);
      return d;
    case ScheduleFrequency.MONTHLY:
      d.setMonth(d.getMonth() + 1);
      return d;
    case ScheduleFrequency.ONCE:
    default:
      return d;
  }
}

export { ScheduleFrequency };
export type { ScheduledReport };
