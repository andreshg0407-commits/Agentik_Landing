/**
 * /[orgSlug]/manager/tareas — Executive Tasks surface.
 *
 * Sprint: AGENTIK-MANAGER-APP-CLOSEOUT-01A (Phase 3)
 *
 * Consumes canonical listActionTasks() via provider envelope.
 * Provider failure is explicit — never hidden behind `.catch(() => [])`.
 * PA assembled via adapter. No business logic in React.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { getEnabledModules } from "@/lib/tenant/modules";
import { filterModulesByRole } from "@/lib/auth/module-access";
import { listActionTasks } from "@/lib/actions/service";
import { assembleTareasPA, wrapProviderCall, computeEffectiveManagerModules } from "@/lib/comercial/manager/manager-commercial-adapter";
import { TareasClient } from "./tareas-client";

export default async function ManagerTareasPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  // Effective Manager module set: tenant-entitled ∩ role-permitted ∩ Manager-ready.
  // FAIL CLOSED: tasks from disabled/unmapped/not-Manager-ready modules are excluded.
  const orgMods = await getEnabledModules(orgId);
  const permitted = filterModulesByRole(orgMods, membership.role);
  const effectiveModules = computeEffectiveManagerModules(permitted);

  const tasksResult = await wrapProviderCall("action_tasks", () => listActionTasks(orgId));

  const tareasPA = assembleTareasPA({ tasksResult, effectiveModules });

  return <TareasClient tareasPA={tareasPA} />;
}
