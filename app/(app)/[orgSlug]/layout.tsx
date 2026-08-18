import { headers }    from "next/headers";
import { redirect }  from "next/navigation";
import { requireTenant }                          from "@/lib/tenant";
import { getEnabledModules, resolveModuleForPath } from "@/lib/tenant/modules";
import { filterModulesByRole, isInternalRole, getModulesForRole } from "@/lib/auth/module-access";
import RightOpsRail                               from "@/components/layout/right-ops-rail";
import { TenantSwitcher }                         from "@/components/layout/tenant-switcher";
import { C }                                      from "@/lib/ui/tokens";
import { buildNavDomains }                        from "@/components/shell/module-nav-config";
import { WorkspaceShellClient }                   from "@/components/shell/workspace-shell-client";
import { prisma }                                 from "@/lib/prisma";

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
  // ── Seller confinement gate ─────────────────────────────────────────────────
  // Provisioned sellers (OPERATOR/VIEWER with sellerSlug) are confined to /seller-app.
  // They CANNOT access the enterprise desktop by direct URL navigation.
  // This is the SINGLE enforcement point — no route-by-route checks needed.
  const SELLER_CONFINED_ROLES = new Set(["OPERATOR", "VIEWER"]);
  const pathname    = headers().get("x-invoke-path") ?? "";
  const isSellerApp = pathname.includes(`/${ctx.orgSlug}/seller-app`);

  if (SELLER_CONFINED_ROLES.has(ctx.role) && !isSellerApp) {
    const membership = await prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: ctx.orgId, userId: ctx.userId } },
      select: { permissionsJson: true },
    });
    const perms = membership?.permissionsJson as Record<string, unknown> | null;
    if (perms?.sellerSlug) {
      redirect(`/${ctx.orgSlug}/seller-app`);
    }
  }

  const orgMods = await getEnabledModules(ctx.orgId);

  // SUPER_ADMIN BYPASS: sees all role-permitted modules regardless of tenant
  // entitlements. This is a read-only visibility override — no TenantModule rows,
  // commercial terms, or billing periods are created. Tenant truth is unchanged.
  // ORG_ADMIN/MANAGER: only see the intersection of org-entitled + role-permitted.
  const mods = ctx.role === "SUPER_ADMIN"
    ? getModulesForRole(ctx.role)
    : filterModulesByRole(orgMods, ctx.role);

  // Capability flags
  const showInternal    = isInternalRole(ctx.role);
  const showMarketing   = mods.has("marketing_studio");
  const showPlatformAdmin = ctx.role === "SUPER_ADMIN";

  // ── Route guard ──────────────────────────────────────────────────────────────
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
    orgEntitledModules: orgMods,
  });

  // ── Seller App shell bypass ─────────────────────────────────────────────────
  // /[orgSlug]/seller-app is a dedicated mobile-first viewport.
  // It owns the full screen — no enterprise rails, sidebars, or right panels.
  // All roles (seller, manager, admin) see the Seller App as a standalone surface.
  if (isSellerApp) {
    return <>{children}</>;
  }

  // ── Manager App shell bypass ──────────────────────────────────────────────
  // /[orgSlug]/manager is a dedicated mobile-first manager surface.
  // Own shell, own layout. Authorization handled by manager/layout.tsx.
  const isManagerApp = pathname.includes(`/${ctx.orgSlug}/manager`);
  if (isManagerApp) {
    return <>{children}</>;
  }

  // ── Executive Mobile Shell ────────────────────────────────────────────────
  // ORG_ADMIN / MANAGER get a responsive executive presentation on mobile/tablet.
  // Viewport NEVER grants access — same authorization, different chrome.
  const EXECUTIVE_MOBILE_ROLES = new Set(["ORG_ADMIN", "MANAGER"]);
  const enableMobileShell = EXECUTIVE_MOBILE_ROLES.has(ctx.role);

  let mobileShell: { orgSlug: string; orgName: string } | null = null;
  if (enableMobileShell) {
    const org = await prisma.organization.findUnique({
      where: { id: ctx.orgId },
      select: { name: true },
    });
    mobileShell = { orgSlug: ctx.orgSlug, orgName: org?.name ?? ctx.orgSlug };
  }

  return (
    <>
      <style>{`
        .org-rail { display: flex; flex-direction: column; }
        @media (max-width: 1024px) {
          .org-rail { display: none !important; }
          .ag-has-mobile { flex-direction: column !important; }
          .ag-has-mobile .ag-desktop-only { display: none !important; }
          .ag-has-mobile .ag-mobile-only { display: flex !important; }
          .ag-has-mobile .ag-shell-canvas {
            padding: 0 !important;
            box-shadow: none !important;
          }
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
        mobileShell={mobileShell}
      >
        {children}
      </WorkspaceShellClient>
    </>
  );
}
