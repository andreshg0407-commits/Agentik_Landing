/**
 * app/(app)/[orgSlug]/agentik/tenant-modules/page.tsx
 *
 * Tenant module management — SUPER_ADMIN / AGENTIK_ADMIN only.
 *
 * Sprint: AGENTIK-TENANT-MODULE-ENTITLEMENTS-BILLING-01
 *
 * Shows all modules with entitlement state, activation controls,
 * commercial terms, and a multi-currency billing preview sidebar.
 */

import { redirect } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { getEntitlements } from "@/lib/tenant/module-entitlements";
import { buildPreviewFromEntitlements } from "@/lib/tenant/billing-preview";
import { getAllModuleCatalogEntries } from "@/lib/tenant/module-catalog";
import { TenantModulesClient } from "./tenant-modules-client";

export default async function TenantModulesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireTenant(orgSlug);

  // Gate: platform authority only (User.platformRole, NOT Membership.role)
  if (ctx.platformRole !== "SUPER_ADMIN" && ctx.platformRole !== "AGENTIK_ADMIN") {
    redirect(`/${orgSlug}`);
  }

  const entitlements = await getEntitlements(ctx.orgId);
  const billingPreview = buildPreviewFromEntitlements(ctx.orgId, entitlements);
  const catalog = getAllModuleCatalogEntries();

  // Serialize for client
  const modulesData = catalog.map(entry => {
    const ent = entitlements.find(e => e.moduleKey === entry.key);
    return {
      key:              entry.key,
      name:             entry.name,
      description:      entry.description,
      category:         entry.category,
      sellable:         entry.sellable,
      enabled:          ent?.enabled ?? false,
      currentTerm:      ent?.currentTerm ?? null,
      currentPeriod:    ent?.currentPeriod ?? null,
    };
  });

  return (
    <TenantModulesClient
      orgSlug={orgSlug}
      modules={modulesData}
      billingPreview={{
        period:             billingPreview.period,
        activeModuleCount:  billingPreview.activeModuleCount,
        hasMixedCurrencies: billingPreview.hasMixedCurrencies,
        subtotals:          billingPreview.subtotals,
        lineItems: billingPreview.lineItems.map(li => ({
          moduleKey:         li.moduleKey,
          moduleName:        li.moduleName,
          monthlyPriceCents: li.monthlyPriceCents,
          currency:          li.currency,
        })),
      }}
    />
  );
}
