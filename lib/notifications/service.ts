/**
 * Agentik — internal notification service.
 * No external delivery channels. All notifications are stored in DB only.
 */

import { prisma }           from "@/lib/prisma";
import { NotificationType } from "@prisma/client";
import type { Notification } from "@prisma/client";

// ── Create ────────────────────────────────────────────────────────────────────

export async function createNotification(input: {
  organizationId: string;
  recipientEmail: string;
  type:           NotificationType;
  title:          string;
  body?:          string;
  actionTaskId?:  string;
}): Promise<Notification> {
  return prisma.notification.create({ data: input });
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listNotifications(
  organizationId: string,
  recipientEmail: string,
  opts: { limit?: number; unreadOnly?: boolean } = {},
): Promise<Notification[]> {
  return prisma.notification.findMany({
    where: {
      organizationId,
      recipientEmail,
      ...(opts.unreadOnly ? { isRead: false } : {}),
    },
    orderBy: { createdAt: "desc" },
    take:    opts.limit ?? 50,
  });
}

// ── Unread count ──────────────────────────────────────────────────────────────

export async function getUnreadCount(
  organizationId: string,
  recipientEmail: string,
): Promise<number> {
  return prisma.notification.count({
    where: { organizationId, recipientEmail, isRead: false },
  });
}

// ── Mark read ─────────────────────────────────────────────────────────────────

export async function markNotificationRead(
  organizationId: string,
  notifId:        string,
): Promise<Notification> {
  // Verify ownership before updating
  const existing = await prisma.notification.findFirst({
    where: { id: notifId, organizationId },
  });
  if (!existing) throw new Error("NOTIFICATION_NOT_FOUND");
  return prisma.notification.update({
    where: { id: notifId },
    data:  { isRead: true, readAt: new Date() },
  });
}

export async function markAllRead(
  organizationId: string,
  recipientEmail: string,
): Promise<{ count: number }> {
  const result = await prisma.notification.updateMany({
    where: { organizationId, recipientEmail, isRead: false },
    data:  { isRead: true, readAt: new Date() },
  });
  return { count: result.count };
}

// ── Action-task triggers ──────────────────────────────────────────────────────

export async function notifyAssigned(
  organizationId: string,
  actionTaskId:   string,
  assignedTo:     string,
  taskTitle:      string,
  assignedBy:     string,
): Promise<void> {
  if (!assignedTo || assignedTo === assignedBy) return;
  await createNotification({
    organizationId,
    recipientEmail: assignedTo,
    type:           NotificationType.ACTION_ASSIGNED,
    title:          `Se te asignó una acción`,
    body:           `"${taskTitle}" fue asignada por ${assignedBy}.`,
    actionTaskId,
  });
}

export async function notifyReassigned(
  organizationId: string,
  actionTaskId:   string,
  newAssignee:    string,
  taskTitle:      string,
  reassignedBy:   string,
): Promise<void> {
  if (!newAssignee || newAssignee === reassignedBy) return;
  await createNotification({
    organizationId,
    recipientEmail: newAssignee,
    type:           NotificationType.ACTION_REASSIGNED,
    title:          `Acción reasignada a ti`,
    body:           `"${taskTitle}" fue reasignada a ti por ${reassignedBy}.`,
    actionTaskId,
  });
}

export async function notifyCompleted(
  organizationId: string,
  actionTaskId:   string,
  createdBy:      string,
  taskTitle:      string,
  completedBy:    string,
): Promise<void> {
  if (!createdBy || createdBy === completedBy) return;
  await createNotification({
    organizationId,
    recipientEmail: createdBy,
    type:           NotificationType.ACTION_COMPLETED,
    title:          `Acción completada`,
    body:           `"${taskTitle}" fue completada por ${completedBy}.`,
    actionTaskId,
  });
}

export { NotificationType };
export type { Notification };
