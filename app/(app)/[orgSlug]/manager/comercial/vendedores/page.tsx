/**
 * /[orgSlug]/manager/comercial/vendedores — Vendedores executive surface.
 *
 * Sprint: AGENTIK-MANAGER-M2A-P0
 *
 * Seller directory + metrics provide both the KPI count and the card list.
 * The KPI "Vendedores operativos" is derived from the SAME fail-closed
 * filtered universe (activo + atencion) as the rendered card list.
 * No loadControlComercial. No separate count query.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { buildSellerDirectory } from "@/lib/comercial/foundation/seller-directory";
import { buildSellerMetrics } from "@/lib/comercial/foundation/seller-metrics";
import { assembleVendedoresPAFromNarrow } from "@/lib/comercial/manager/manager-commercial-adapter";
import { VendedoresSurfaceClient } from "./vendedores-client";

export default async function ManagerVendedoresPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const [directory, metricsReport] = await Promise.all([
    buildSellerDirectory(orgId),
    buildSellerMetrics(orgId),
  ]);

  // Merge directory + metrics
  const metricsMap = new Map(metricsReport.sellers.map(m => [m.sellerSlug, m]));
  const sellers = directory.sellers.map(s => {
    const m = metricsMap.get(s.sellerSlug);
    return {
      sellerName: s.sellerName,
      sellerSlug: s.sellerSlug,
      activityStatus: (m?.activityStatus ?? s.activityStatus) as "activo" | "atencion" | "inactivo",
      crmQuoteCount: s.crmQuoteCount,
      customerCount: s.customerCount,
      totalCrmAmount: s.totalAmount,
      daysSinceLastActivity: m?.daysSinceLastActivity ?? null,
    };
  });

  const vendedoresPA = assembleVendedoresPAFromNarrow({ sellers, orgSlug });

  return <VendedoresSurfaceClient vendedoresPA={vendedoresPA} />;
}
