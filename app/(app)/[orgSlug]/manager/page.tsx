/**
 * /[orgSlug]/manager — Manager Home.
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * Executive cockpit: greeting, estado, attention, modules.
 * All data from canonical sources. No business math in React.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { getEnabledModules } from "@/lib/tenant/modules";
import { filterModulesByRole } from "@/lib/auth/module-access";
import { loadControlComercial } from "@/lib/comercial/control/control-comercial-loader";
import { listBusinessAlerts } from "@/lib/alerts/queries";
import { assembleManagerHomePA, assembleGlobalAttention, wrapProviderCall, buildSourceAvailability, computeEffectiveManagerModules, MANAGER_MODULE_DEFS } from "@/lib/comercial/manager/manager-commercial-adapter";
import { ManagerHomeClient } from "./manager-home-client";

export default async function ManagerHomePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const orgMods = await getEnabledModules(orgId);
  const mods = filterModulesByRole(orgMods, membership.role);

  // Load canonical data — provider failure is explicit, never hidden.
  // BusinessAlert provider failure → degraded attention state, never a reassuring zero badge.
  const [snapshot, alertsResult] = await Promise.all([
    loadControlComercial(orgId, orgSlug),
    wrapProviderCall("business_alerts", () => listBusinessAlerts(orgId, { status: "active" })),
  ]);

  // Effective Manager module set: tenant-entitled ∩ role-permitted ∩ Manager-ready.
  // Only modules in MANAGER_MODULE_DEFS participate in provider filtering.
  const effectiveModules = computeEffectiveManagerModules(mods);

  // Assemble global attention from real alerts.
  // Alert model (system alerts) never enters the Home Attention badge.
  // ORDER_SYNC_FAILED/PENDING remain data/source health, not business attention.
  // BusinessAlert entityKey uses seller-derived identity (mutable sellerSlug) —
  // stable for repeated evaluations of the current key, but not universally
  // immutable across seller renames. Part of SELLER_IDENTITY_STATUS blocker.
  // FAIL CLOSED: alerts from disabled/unmapped/not-Manager-ready modules are excluded.
  const attention = alertsResult.status === "OK"
    ? assembleGlobalAttention({ alerts: alertsResult.items, orgSlug, effectiveModules })
    : [];

  // Assemble Home PA — if alert provider failed, inject degraded source state
  // so executiveState never shows false "STABLE" when attention data is unavailable.
  const alertSourceOverride = alertsResult.status !== "OK"
    ? { alerts: { name: "alerts", status: "UNAVAILABLE" as const, responded: false, lastLoadedAt: null } }
    : undefined;
  const homePA = assembleManagerHomePA({
    orgName: organization.name,
    snapshot,
    attention,
    sourceAvailability: buildSourceAvailability(snapshot, alertSourceOverride),
  });

  // Build module cards from canonical Manager module defs (single source)
  const moduleCards = MANAGER_MODULE_DEFS
    .filter(def => mods.has(def.moduleKey as Parameters<typeof mods.has>[0]))
    .map(def => ({
      id:          def.moduleKey,
      label:       def.label,
      description: def.description,
      accent:      def.accent,
      icon:        def.icon,
      href:        `/${orgSlug}/manager/${def.routeSlug}`,
    }));

  return (
    <ManagerHomeClient
      orgSlug={orgSlug}
      homePA={homePA}
      modules={moduleCards}
    />
  );
}
