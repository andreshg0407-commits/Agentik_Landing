import type { AlertSeverity, AlertStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── BusinessAlert (CRM / Sales engine) ───────────────────────────────────────

export interface BusinessAlertRow {
  id:          string;
  module:      string;
  type:        string;
  severity:    AlertSeverity;
  status:      string;
  title:       string;
  message:     string | null;
  entityType:  string;
  entityLabel: string;
  period:      string;
  createdAt:   Date;
  updatedAt:   Date;
}

export async function listBusinessAlerts(
  organizationId: string,
  filters?: { status?: string },
): Promise<BusinessAlertRow[]> {
  const db = prisma as unknown as {
    businessAlert: {
      findMany: (args: unknown) => Promise<BusinessAlertRow[]>;
    };
  };
  try {
    return await db.businessAlert.findMany({
      where: {
        organizationId,
        ...(filters?.status ? { status: filters.status } : {}),
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      select: {
        id: true, module: true, type: true, severity: true, status: true,
        title: true, message: true, entityType: true, entityLabel: true,
        period: true, createdAt: true, updatedAt: true,
      },
    });
  } catch {
    // Model not yet migrated — return empty list
    return [];
  }
}

export async function listAlerts(
  organizationId: string,
  filters?: { status?: AlertStatus }
) {
  return prisma.alert.findMany({
    where: {
      organizationId,
      ...(filters?.status ? { status: filters.status } : {}),
    },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      type: true,
      title: true,
      severity: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getAlert(alertId: string, organizationId: string) {
  return prisma.alert.findFirst({
    where: { id: alertId, organizationId },
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      severity: true,
      status: true,
      sourceType: true,
      sourceId: true,
      metadataJson: true,
      resolvedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
