/**
 * /[orgSlug]/manager/alertas — Executive Alerts surface.
 *
 * Sprint: AGENTIK-MANAGER-APP-CLOSEOUT-01A (Phase 3)
 *
 * Consumes canonical listBusinessAlerts() + listAlerts() via provider envelopes.
 * Provider failure is explicit — never hidden behind `.catch(() => [])`.
 * PA assembled via adapter. No business logic in React.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { getEnabledModules } from "@/lib/tenant/modules";
import { filterModulesByRole } from "@/lib/auth/module-access";
import { listBusinessAlerts, listAlerts } from "@/lib/alerts/queries";
import { assembleAlertasPA, wrapProviderCall, computeEffectiveManagerModules } from "@/lib/comercial/manager/manager-commercial-adapter";
import { AlertasClient } from "./alertas-client";

export default async function ManagerAlertasPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  // Effective Manager module set: tenant-entitled ∩ role-permitted ∩ Manager-ready.
  // FAIL CLOSED: alerts from disabled/unmapped/not-Manager-ready modules are excluded.
  const orgMods = await getEnabledModules(orgId);
  const permitted = filterModulesByRole(orgMods, membership.role);
  const effectiveModules = computeEffectiveManagerModules(permitted);

  // Wrap each provider in an explicit result envelope.
  // Provider failure surfaces as SOURCE_UNAVAILABLE, not "Sin pendientes".
  const [businessAlerts, systemAlerts] = await Promise.all([
    wrapProviderCall("business_alerts", () =>
      listBusinessAlerts(orgId).then(alerts =>
        alerts.map(a => ({
          id: a.id,
          severity: a.severity ?? "info",
          module: a.module ?? "general",
          type: a.type ?? undefined,
          title: a.title,
          message: a.message ?? null,
          entityLabel: a.entityLabel ?? undefined,
          createdAt: a.createdAt,
        })),
      ),
    ),
    wrapProviderCall("system_alerts", () =>
      listAlerts(orgId).then(alerts =>
        alerts.map(a => ({
          id: a.id,
          severity: a.severity ?? "info",
          type: a.type ?? "system",
          title: a.title,
          message: a.message ?? null,
          createdAt: a.createdAt,
        })),
      ),
    ),
  ]);

  const alertasPA = assembleAlertasPA({ businessAlerts, systemAlerts, effectiveModules });

  return <AlertasClient alertasPA={alertasPA} />;
}
