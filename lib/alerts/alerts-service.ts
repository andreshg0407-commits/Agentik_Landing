import type { AlertStatus } from "@prisma/client";
import { listAlerts, getAlert } from "./queries";
import { acknowledgeAlert, resolveAlert } from "./actions";

// Service layer adds org scoping to every operation.
// The underlying actions (queries.ts / actions.ts) accept any alertId;
// this layer ensures the alert actually belongs to the given organization
// before delegating, preventing cross-org data access.

export async function serviceListAlerts(
  organizationId: string,
  filters?: { status?: AlertStatus }
) {
  return listAlerts(organizationId, filters);
}

export async function serviceGetAlert(alertId: string, organizationId: string) {
  const alert = await getAlert(alertId, organizationId);
  if (!alert) throw new Error("ALERT_NOT_FOUND");
  return alert;
}

export async function serviceAcknowledgeAlert(
  alertId: string,
  organizationId: string,
  actorUserId: string
) {
  const existing = await getAlert(alertId, organizationId);
  if (!existing) throw new Error("ALERT_NOT_FOUND");
  return acknowledgeAlert(alertId, actorUserId);
}

export async function serviceResolveAlert(
  alertId: string,
  organizationId: string,
  actorUserId: string
) {
  const existing = await getAlert(alertId, organizationId);
  if (!existing) throw new Error("ALERT_NOT_FOUND");
  return resolveAlert(alertId, actorUserId);
}
