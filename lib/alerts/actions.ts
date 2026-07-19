import { AlertStatus, EventStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Merges new fields into the existing metadataJson without losing prior data.
function mergeMetadata(
  existing: unknown,
  next: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing !== null && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  return { ...base, ...next };
}

// alert.created is emitted by the layer that creates alerts (not in v1 scope).
// This helper is the single place that emits alert.* events for status changes.
async function createAlertEvent(
  tx: Omit<typeof prisma, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  params: {
    organizationId: string;
    alertId: string;
    actorUserId: string;
    type: "alert.acknowledged" | "alert.resolved";
    previousStatus: AlertStatus;
    newStatus: AlertStatus;
    now: Date;
  }
) {
  await tx.event.create({
    data: {
      organizationId: params.organizationId,
      type: params.type,
      sourceType: "user",
      sourceId: params.actorUserId,
      payloadJson: {
        alertId: params.alertId,
        actorUserId: params.actorUserId,
        previousStatus: params.previousStatus,
        newStatus: params.newStatus,
      },
      status: EventStatus.PROCESSED,
      processedAt: params.now,
    },
  });
}

export async function acknowledgeAlert(alertId: string, actorUserId: string) {
  const alert = await prisma.alert.findUniqueOrThrow({
    where: { id: alertId },
    select: { id: true, organizationId: true, status: true, metadataJson: true },
  });

  if (alert.status !== AlertStatus.OPEN) {
    throw new Error("ALERT_NOT_OPEN");
  }

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.alert.update({
      where: { id: alertId },
      data: {
        status: AlertStatus.ACKNOWLEDGED,
        metadataJson: mergeMetadata(alert.metadataJson, {
          acknowledgedAt: now.toISOString(),
          acknowledgedBy: actorUserId,
        }) as Prisma.InputJsonValue,
      },
    });

    await createAlertEvent(tx, {
      organizationId: alert.organizationId,
      alertId,
      actorUserId,
      type: "alert.acknowledged",
      previousStatus: AlertStatus.OPEN,
      newStatus: AlertStatus.ACKNOWLEDGED,
      now,
    });

    return updated;
  });
}

export async function resolveAlert(alertId: string, actorUserId: string) {
  const alert = await prisma.alert.findUniqueOrThrow({
    where: { id: alertId },
    select: { id: true, organizationId: true, status: true, metadataJson: true },
  });

  if (alert.status === AlertStatus.RESOLVED) {
    throw new Error("ALERT_ALREADY_RESOLVED");
  }

  const now = new Date();
  const previousStatus = alert.status;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.alert.update({
      where: { id: alertId },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedAt: now,
        metadataJson: mergeMetadata(alert.metadataJson, {
          resolvedAt: now.toISOString(),
          resolvedBy: actorUserId,
        }) as Prisma.InputJsonValue,
      },
    });

    await createAlertEvent(tx, {
      organizationId: alert.organizationId,
      alertId,
      actorUserId,
      type: "alert.resolved",
      previousStatus,
      newStatus: AlertStatus.RESOLVED,
      now,
    });

    return updated;
  });
}
