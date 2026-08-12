/**
 * /[orgSlug]/manager/informes — Scheduled Reports surface.
 *
 * Sprint: AGENTIK-MANAGER-APP-CLOSEOUT-01A (Phase 3)
 *
 * Consumes canonical listScheduledReports() via provider envelope.
 * Provider failure is explicit — never hidden behind `.catch(() => [])`.
 * PA assembled via adapter. No business logic in React.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { getEnabledModules } from "@/lib/tenant/modules";
import { filterModulesByRole } from "@/lib/auth/module-access";
import { listScheduledReports } from "@/lib/scheduled-reports/service";
import { assembleInformesPA, wrapProviderCall, computeEffectiveManagerModules } from "@/lib/comercial/manager/manager-commercial-adapter";
import { InformesClient } from "./informes-client";

export default async function ManagerInformesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  // Effective Manager module set: tenant-entitled ∩ role-permitted ∩ Manager-ready.
  // FAIL CLOSED: reports whose QueryFamily ownership is unknown or whose
  // owning module is disabled/not-Manager-ready are excluded.
  const orgMods = await getEnabledModules(orgId);
  const permitted = filterModulesByRole(orgMods, membership.role);
  const effectiveModules = computeEffectiveManagerModules(permitted);

  const reportsResult = await wrapProviderCall("scheduled_reports", () => listScheduledReports(orgId));

  const informesPA = assembleInformesPA({ reportsResult, effectiveModules });

  return <InformesClient informesPA={informesPA} />;
}
