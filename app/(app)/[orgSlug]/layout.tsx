import { headers }    from "next/headers";
import { redirect }  from "next/navigation";
import { requireTenant }                          from "@/lib/tenant";
import { getEnabledModules, resolveModuleForPath } from "@/lib/tenant/modules";
import { filterModulesByRole, isInternalRole }    from "@/lib/auth/module-access";
import RightOpsRail                               from "@/components/layout/right-ops-rail";
import { TenantSwitcher }                         from "@/components/layout/tenant-switcher";
import { C }                                      from "@/lib/ui/tokens";
import { buildNavDomains }                        from "@/components/shell/module-nav-config";
import { WorkspaceShellClient }                   from "@/components/shell/workspace-shell-client";

// ── Role → badge accent ───────────────────────────────────────────────────────

const ROLE_ACCENT: Record<string, string> = {
  SUPER_ADMIN:   "#0f172a",
  AGENTIK_ADMIN: "#0f172a",
  ORG_ADMIN:     "#7c3aed",
  MANAGER:       "#0369a1",
  BILLING:       "#d97706",
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

  let ctx;
  try {
    ctx = await requireTenant(orgSlug);
  } catch (err: unknown) {
    // Expired/invalid session → redirect to login with callback
    if (err instanceof Error && err.message === "UNAUTHENTICATED") {
      const pathname = headers().get("x-invoke-path") ?? `/${orgSlug}`;
      redirect(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
    }
    // ORG_NOT_FOUND, FORBIDDEN_NOT_MEMBER, FORBIDDEN_ROLE → re-throw (existing policy)
    throw err;
  }
  const orgMods = await getEnabledModules(ctx.orgId);

  // Intersect org-level feature flags with role-based visibility
  const mods = filterModulesByRole(orgMods, ctx.role);

  // Capability flags
  const showInternal    = isInternalRole(ctx.role);
  const showMarketing   = mods.has("marketing_studio");
  const showPlatformAdmin = ctx.role === "SUPER_ADMIN";

  // ── Route guard ──────────────────────────────────────────────────────────────
  const pathname    = headers().get("x-invoke-path") ?? "";
  const routeModule = resolveModuleForPath(ctx.orgSlug, pathname);
  const isBlocked   = routeModule !== null && !mods.has(routeModule);
  // ────────────────────────────────────────────────────────────────────────────

  const domains = buildNavDomains({
    orgSlug:           ctx.orgSlug,
    hasDashboard:      mods.has("dashboard"),
    hasTorreControl:   mods.has("torre_control"),
    hasFinance:        mods.has("finance"),
    hasCollections:    mods.has("collections"),
    hasSales:          mods.has("sales"),
    hasMarketing:      showMarketing,
    hasAlerts:         mods.has("alerts"),
    hasDocuments:      mods.has("documents"),
    hasKnowledge:      mods.has("knowledge"),
    hasProduction:     mods.has("production"),
    hasAgentik:        mods.has("agentik"),
    hasIntegrations:   mods.has("integrations"),
    hasRuns:           mods.has("runs"),
    hasSettings:       mods.has("settings"),
    showInternal,
    showPlatformAdmin,
  });

  // ── Seller App shell bypass ─────────────────────────────────────────────────
  // /[orgSlug]/seller-app is a dedicated mobile-first viewport.
  // It owns the full screen — no enterprise rails, sidebars, or right panels.
  // All roles (seller, manager, admin) see the Seller App as a standalone surface.
  const isSellerApp = pathname.includes(`/${ctx.orgSlug}/seller-app`);

  if (isSellerApp) {
    return <>{children}</>;
  }

  return (
    <>
      <style>{`
        .org-rail { display: flex; flex-direction: column; }
        @media (max-width: 1024px) {
          .org-rail { display: none !important; }
        }
      `}</style>
      <WorkspaceShellClient
        domains={domains}
        tenantHeader={
          <TenantSwitcher
            currentOrgSlug={ctx.orgSlug}
            projectKey={ctx.projectKey}
            showSwitcher={showInternal}
          />
        }
        roleBadge={{ label: ctx.role, accent: ROLE_ACCENT[ctx.role] ?? C.inkLight }}
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
    </>
  );
}
