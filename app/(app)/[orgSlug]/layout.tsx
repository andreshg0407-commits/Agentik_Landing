import { headers } from "next/headers";
import { requireTenant }                          from "@/lib/tenant";
import { getEnabledModules, resolveModuleForPath } from "@/lib/tenant/modules";
import { filterModulesByRole, isInternalRole }    from "@/lib/auth/module-access";
import { WorkspaceShellClient }                   from "@/components/shell/workspace-shell-client";
import { TenantSwitcher }                         from "@/components/layout/tenant-switcher";
import { buildNavDomains }                        from "@/components/shell/module-nav-config";
import RightOpsRail                               from "@/components/layout/right-ops-rail";
import { C }                                      from "@/lib/ui/tokens";

// ── Role → accent color for the sidebar badge ────────────────────────────────

const ROLE_ACCENT: Record<string, string> = {
  SUPER_ADMIN:   "#1e1e2e",
  AGENTIK_ADMIN: "#1e1e2e",
  ORG_ADMIN:     C.blueDark,
  MANAGER:       "#0369a1",
  BILLING:       "#b45309",
};

// ── Layout ─────────────────────────────────────────────────────────────────────

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params:   Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx  = await requireTenant(orgSlug);
  const orgMods = await getEnabledModules(ctx.orgId);

  // Intersect org-level feature flags with role-based visibility
  const mods = filterModulesByRole(orgMods, ctx.role);

  // Capability flags
  const showInternal      = isInternalRole(ctx.role);
  const showPlatformAdmin = ctx.role === "SUPER_ADMIN";

  // ── Route guard ──────────────────────────────────────────────────────────────
  const pathname    = headers().get("x-invoke-path") ?? "";
  const routeModule = resolveModuleForPath(ctx.orgSlug, pathname);
  const isBlocked   = routeModule !== null && !mods.has(routeModule);

  // ── Build navigation config ────────────────────────────────────────────────
  const domains = buildNavDomains({
    orgSlug:         ctx.orgSlug,
    hasDashboard:    mods.has("dashboard"),
    hasTorreControl: mods.has("torre_control"),
    hasFinance:      mods.has("finance"),
    hasCollections:  mods.has("collections"),
    hasSales:        mods.has("sales"),
    hasMarketing:    mods.has("marketing"),
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

  return (
    <WorkspaceShellClient
      domains={domains}
      tenantHeader={
        <TenantSwitcher
          currentOrgSlug={ctx.orgSlug}
          projectKey={ctx.projectKey}
          showSwitcher={showInternal}
        />
      }
      roleBadge={{
        label:  ctx.role,
        accent: ROLE_ACCENT[ctx.role] ?? C.inkLight,
      }}
      railContent={
        <RightOpsRail
          orgSlug={ctx.orgSlug}
          orgId={ctx.orgId}
          pathname={pathname}
          role={ctx.role}
        />
      }
      isBlocked={isBlocked}
    >
      {children}
    </WorkspaceShellClient>
  );
}
