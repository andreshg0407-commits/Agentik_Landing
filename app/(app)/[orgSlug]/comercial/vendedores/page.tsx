/**
 * /[orgSlug]/comercial/vendedores
 *
 * VENDEDORES-360-01 — Vendedor directory + 360 drawer.
 * Server Component: auth + seller directory data → VendedoresClient.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { buildSellerDirectory } from "@/lib/comercial/foundation/seller-directory";
import { buildSellerMetrics } from "@/lib/comercial/foundation/seller-metrics";
import { getSellerAccessStates } from "@/lib/comercial/frontline/seller-access-provisioning";
import { VendedoresClient } from "./vendedores-client";

export default async function VendedoresPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const [directory, metricsReport, accessStates] = await Promise.all([
    buildSellerDirectory(organization.id),
    buildSellerMetrics(organization.id),
    getSellerAccessStates(organization.id),
  ]);

  // Merge directory + metrics into serializable seller cards
  const metricsMap = new Map(
    metricsReport.sellers.map((m) => [m.sellerSlug, m]),
  );

  const sellers = directory.sellers.map((s) => {
    const m = metricsMap.get(s.sellerSlug);
    const access = accessStates.get(s.sellerSlug);
    return {
      sellerName: s.sellerName,
      sellerSlug: s.sellerSlug,
      active: s.active,
      crmQuoteCount: s.crmQuoteCount,
      customerCount: s.customerCount,
      totalCrmAmount: s.totalAmount,
      lastActivityAt: s.lastActivityAt,
      firstActivityAt: s.firstActivityAt,
      // Metrics
      quotesFacturado: m?.quotesFacturado ?? 0,
      quotesPendiente: m?.quotesPendiente ?? 0,
      quotesAnulado: m?.quotesAnulado ?? 0,
      traceabilityRate: m?.traceabilityRate ?? 0,
      daysSinceLastActivity: m?.daysSinceLastActivity ?? null,
      isActive: m?.isActive ?? s.active,
      activityStatus: (m?.activityStatus ?? s.activityStatus) as "activo" | "atencion" | "inactivo",
      // Access state
      accessState: (access?.state ?? "no_access") as "no_access" | "invited" | "active" | "disabled",
      accessEmail: access?.email ?? null,
    };
  });

  return (
    <VendedoresClient
      orgSlug={orgSlug}
      sellers={sellers}
      totalSellers={directory.totalSellers}
      activeSellers={directory.activeSellers}
    />
  );
}
