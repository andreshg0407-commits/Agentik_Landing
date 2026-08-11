/**
 * app/(app)/[orgSlug]/page.tsx
 *
 * Enterprise launcher — authenticated module discovery surface.
 *
 * Sprint: AGENTIK-GLOBAL-AUTH-POST-LOGIN-LAUNCHER-01
 *
 * After login, enterprise users land here. Shows available modules
 * based on org enablement + role permissions. Sellers are redirected
 * to /seller-app (confinement preserved).
 *
 * Module visibility source of truth:
 *   Layer 1 — getEnabledModules(orgId)        [tenant feature flags]
 *   Layer 2 — filterModulesByRole(mods, role)  [role-based gate]
 *   Layer 3 — buildNavDomains(opts)            [navigation config]
 *
 * Same route for desktop and mobile. Responsive layout.
 * Device does NOT change authorization or module visibility.
 */

import { redirect }      from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { prisma }        from "@/lib/prisma";
import { getEnabledModules }                    from "@/lib/tenant/modules";
import { filterModulesByRole, isInternalRole }  from "@/lib/auth/module-access";
import { buildNavDomains }                      from "@/components/shell/module-nav-config";
import { EnterpriseLauncherClient }             from "./enterprise-launcher-client";

const SELLER_ROLES = new Set(["OPERATOR", "VIEWER"]);

export default async function OrgRootPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireTenant(orgSlug);

  // ── Seller confinement (UNCHANGED) ──────────────────────────────────────────
  if (SELLER_ROLES.has(ctx.role)) {
    const membership = await prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: ctx.orgId, userId: ctx.userId } },
      select: { permissionsJson: true },
    });
    const perms = membership?.permissionsJson as Record<string, unknown> | null;
    if (perms?.sellerSlug) {
      redirect(`/${orgSlug}/seller-app`);
    }
  }

  // ── Module visibility (same source of truth as layout sidebar) ─────────────
  const orgMods = await getEnabledModules(ctx.orgId);
  const mods = filterModulesByRole(orgMods, ctx.role);
  const showInternal = isInternalRole(ctx.role);
  const showMarketing = mods.has("marketing_studio");
  const showPlatformAdmin = ctx.role === "SUPER_ADMIN";

  const domains = buildNavDomains({
    orgSlug,
    hasDashboard:    mods.has("dashboard"),
    hasTorreControl: mods.has("torre_control"),
    hasFinance:      mods.has("finance"),
    hasCollections:  mods.has("collections"),
    hasSales:        mods.has("sales"),
    hasMarketing:    showMarketing,
    hasAlerts:       mods.has("alerts"),
    hasDocuments:    mods.has("documents"),
    hasKnowledge:    mods.has("knowledge"),
    hasProduction:   mods.has("production"),
    hasAgentik:      mods.has("agentik"),
    hasIntegrations: mods.has("integrations"),
    hasRuns:         mods.has("runs"),
    hasSettings:     mods.has("settings"),
    showInternal,
    showPlatformAdmin,
  });

  // Resolve org display name
  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { name: true },
  });
  const orgName = org?.name ?? orgSlug;

  // Serialize for client: domain id, label, accent, and navigable items (non-disabled, non-header)
  const launcherDomains = domains
    .filter(d => d.id !== "configuracion" && d.id !== "internal")
    .map(d => ({
      id:    d.id,
      label: d.label,
      accent: d.accent,
      items: d.items
        .filter(item => !item.isSectionHeader && !item.disabled && item.href !== "#")
        .map(item => ({ label: item.label, href: item.href })),
    }))
    .filter(d => d.items.length > 0);

  return (
    <EnterpriseLauncherClient
      orgSlug={orgSlug}
      orgName={orgName}
      role={ctx.role}
      domains={launcherDomains}
    />
  );
}
