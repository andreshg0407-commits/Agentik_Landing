"use server";

import { requireOrgAccess }      from "@/lib/auth/org-access";
import {
  createActionTask,
  listActionTasks,
  getActionTaskStats,
  completeActionTask,
  cancelActionTask,
  assignActionTask,
  rescheduleActionTask,
  type CreateActionInput,
  type ActionTask,
  type ActionTaskStats,
}                                from "@/lib/actions/service";
import { ActionTaskStatus }      from "@prisma/client";
import {
  listNotifications,
  markNotificationRead,
  markAllRead,
  notifyAssigned,
  notifyReassigned,
  notifyCompleted,
  type Notification,
}                                from "@/lib/notifications/service";
import {
  createScheduledReport,
  listScheduledReports,
  toggleScheduledReport,
  type CreateScheduledReportInput,
  type ScheduledReport,
}                                from "@/lib/scheduled-reports/service";

type ActionResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: string };

// ── Auth guard ────────────────────────────────────────────────────────────────

async function withAccess<T>(
  orgSlug: string,
  fn: (orgId: string, userEmail: string) => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    const { user, organization } = await requireOrgAccess(orgSlug);
    const data = await fn(organization.id, user.email ?? user.id);
    return { ok: true, data };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "UNAUTHENTICATED") return { ok: false, error: "No autenticado" };
    if (msg === "ACCESS_DENIED")   return { ok: false, error: "Acceso denegado" };
    if (msg === "ORG_NOT_FOUND")   return { ok: false, error: "Organización no encontrada" };
    console.error("[action-tasks]", e);
    return { ok: false, error: msg };
  }
}

// ── ActionTask server actions ─────────────────────────────────────────────────

export async function serverCreateAction(
  orgSlug: string,
  input:   CreateActionInput,
): Promise<ActionResult<ActionTask>> {
  return withAccess(orgSlug, async (orgId, userEmail) => {
    const task = await createActionTask(orgId, userEmail, input);
    // Notify assignee if different from creator
    if (input.assignedTo) {
      await notifyAssigned(orgId, task.id, input.assignedTo, task.title, userEmail).catch(() => {});
    }
    return task;
  });
}

export async function serverListActions(
  orgSlug: string,
  filter?: { status?: ActionTaskStatus; limit?: number },
): Promise<ActionResult<{ tasks: ActionTask[]; stats: ActionTaskStats }>> {
  return withAccess(orgSlug, async (orgId) => {
    const [tasks, stats] = await Promise.all([
      listActionTasks(orgId, filter),
      getActionTaskStats(orgId),
    ]);
    return { tasks, stats };
  });
}

export async function serverCompleteAction(
  orgSlug:  string,
  actionId: string,
  result?:  Record<string, unknown>,
): Promise<ActionResult<ActionTask>> {
  return withAccess(orgSlug, async (orgId, userEmail) => {
    const task = await completeActionTask(orgId, actionId, result);
    // Notify creator if different from completer
    await notifyCompleted(orgId, task.id, task.createdBy, task.title, userEmail).catch(() => {});
    return task;
  });
}

export async function serverCancelAction(
  orgSlug:  string,
  actionId: string,
): Promise<ActionResult<ActionTask>> {
  return withAccess(orgSlug, (orgId) =>
    cancelActionTask(orgId, actionId)
  );
}

export async function serverAssignAction(
  orgSlug:    string,
  actionId:   string,
  assignedTo: string,
): Promise<ActionResult<ActionTask>> {
  return withAccess(orgSlug, async (orgId, userEmail) => {
    const task = await assignActionTask(orgId, actionId, assignedTo);
    // Notify new assignee (treat as reassignment since task already exists)
    await notifyReassigned(orgId, task.id, assignedTo, task.title, userEmail).catch(() => {});
    return task;
  });
}

export async function serverRescheduleAction(
  orgSlug:  string,
  actionId: string,
  dueAt:    Date | null,
): Promise<ActionResult<ActionTask>> {
  return withAccess(orgSlug, (orgId) =>
    rescheduleActionTask(orgId, actionId, dueAt)
  );
}

// ── Notification server actions ───────────────────────────────────────────────

export async function serverListNotifications(
  orgSlug:    string,
  unreadOnly: boolean = false,
): Promise<ActionResult<Notification[]>> {
  return withAccess(orgSlug, (orgId, userEmail) =>
    listNotifications(orgId, userEmail, { unreadOnly })
  );
}

export async function serverMarkNotifRead(
  orgSlug: string,
  notifId: string,
): Promise<ActionResult<Notification>> {
  return withAccess(orgSlug, (orgId) =>
    markNotificationRead(orgId, notifId)
  );
}

export async function serverMarkAllNotifsRead(
  orgSlug: string,
): Promise<ActionResult<{ count: number }>> {
  return withAccess(orgSlug, (orgId, userEmail) =>
    markAllRead(orgId, userEmail)
  );
}

// ── Scheduled report server actions ──────────────────────────────────────────

export async function serverCreateScheduledReport(
  orgSlug: string,
  input:   CreateScheduledReportInput,
): Promise<ActionResult<ScheduledReport>> {
  return withAccess(orgSlug, (orgId, userEmail) =>
    createScheduledReport(orgId, userEmail, input)
  );
}

export async function serverListScheduledReports(
  orgSlug:    string,
  activeOnly: boolean = false,
): Promise<ActionResult<ScheduledReport[]>> {
  return withAccess(orgSlug, (orgId) =>
    listScheduledReports(orgId, { activeOnly })
  );
}

export async function serverToggleScheduledReport(
  orgSlug:  string,
  reportId: string,
  isActive: boolean,
): Promise<ActionResult<ScheduledReport>> {
  return withAccess(orgSlug, (orgId) =>
    toggleScheduledReport(orgId, reportId, isActive)
  );
}
