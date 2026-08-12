/**
 * /[orgSlug]/manager/comercial — Commercial subtree entitlement gate.
 *
 * Sprint: AGENTIK-MANAGER-CANONICAL-CONNECTION-PATCH-01
 *
 * Server-side module entitlement enforcement for the entire Commercial subtree.
 * This layout gates ALL routes under /manager/comercial/*:
 *   comercial, ventas, clientes, vendedores, pedidos, tiendas,
 *   inventario, importaciones, seller detail, store detail.
 *
 * Authorization chain (cumulative with parent layout):
 *   1. Parent /manager/layout.tsx: requireOrgAccess + MANAGER_ROLES gate
 *   2. This layout: getEnabledModules + filterModulesByRole → "sales" must be enabled
 *
 * The "sales" module key is the canonical entitlement for the Commercial domain.
 * Direct URL access to /manager/comercial/* with "sales" disabled → redirect.
 *
 * This gate does NOT duplicate the parent role check — it adds the module
 * entitlement layer that the parent layout evaluates only for nav visibility.
 */

import { redirect } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getEnabledModules } from "@/lib/tenant/modules";
import { filterModulesByRole } from "@/lib/auth/module-access";

/** The canonical module key for the Commercial domain. */
const COMMERCIAL_MODULE_KEY = "sales" as const;

export default async function ManagerComercialLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization, membership } = await requireOrgAccess(orgSlug);

  const orgMods = await getEnabledModules(organization.id);
  const permitted = filterModulesByRole(orgMods, membership.role);

  if (!permitted.has(COMMERCIAL_MODULE_KEY)) {
    redirect(`/${orgSlug}/manager`);
  }

  return <>{children}</>;
}
