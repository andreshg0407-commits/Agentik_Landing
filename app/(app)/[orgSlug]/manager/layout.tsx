/**
 * /[orgSlug]/manager — Manager App layout.
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * Standalone mobile-first shell for ORG_ADMIN / MANAGER.
 * Parent layout.tsx bypasses the desktop WorkspaceShellClient for /manager routes.
 *
 * Authorization:
 *   - Only ORG_ADMIN and MANAGER may enter.
 *   - Non-authorized roles → redirect to org root.
 *   - Device never grants permission.
 */

import { redirect } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getEnabledModules } from "@/lib/tenant/modules";
import { filterModulesByRole } from "@/lib/auth/module-access";
import { MANAGER_MODULE_DEFS } from "@/lib/comercial/manager/manager-commercial-adapter";
import { ManagerAppShell, type ManagerModule } from "./manager-app-shell";

const MANAGER_ROLES = new Set(["ORG_ADMIN", "MANAGER"]);

export default async function ManagerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrgAccess(orgSlug);

  if (!MANAGER_ROLES.has(membership.role)) {
    redirect(`/${orgSlug}`);
  }

  // Build entitled + permitted module list for hamburger (from canonical single source)
  const orgMods = await getEnabledModules(organization.id);
  const mods = filterModulesByRole(orgMods, membership.role);

  const modules: ManagerModule[] = MANAGER_MODULE_DEFS
    .filter(def => mods.has(def.moduleKey as Parameters<typeof mods.has>[0]))
    .map(def => ({
      id:    def.moduleKey,
      label: def.label,
      href:  `/${orgSlug}/manager/${def.routeSlug}`,
    }));

  return (
    <ManagerAppShell
      orgSlug={orgSlug}
      orgName={organization.name}
      modules={modules}
    >
      {children}
    </ManagerAppShell>
  );
}
