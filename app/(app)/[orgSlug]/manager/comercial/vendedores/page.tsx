/**
 * /[orgSlug]/manager/comercial/vendedores — Vendedores executive surface.
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 * Consumes seller directory + metrics from canonical foundation.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { buildSellerDirectory } from "@/lib/comercial/foundation/seller-directory";
import { buildSellerMetrics } from "@/lib/comercial/foundation/seller-metrics";
import { loadControlComercial } from "@/lib/comercial/control/control-comercial-loader";
import { buildImportSupplyIntelligence } from "@/lib/comercial/importaciones/import-intelligence-service";
import { assembleCommercialExecutivePA } from "@/lib/comercial/executive/commercial-executive-presentation-assembler";
import { assembleVendedoresPA } from "@/lib/comercial/manager/manager-commercial-adapter";
import { VendedoresSurfaceClient } from "./vendedores-client";

export default async function ManagerVendedoresPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const [directory, metricsReport, snapshot, importIntelligence] = await Promise.all([
    buildSellerDirectory(orgId),
    buildSellerMetrics(orgId),
    loadControlComercial(orgId, orgSlug),
    buildImportSupplyIntelligence(orgId).catch(() => null),
  ]);

  const pa = assembleCommercialExecutivePA({ snapshot, importIntelligence, orgSlug });

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

  const vendedoresPA = assembleVendedoresPA({ pa, sellers, orgSlug });

  return <VendedoresSurfaceClient vendedoresPA={vendedoresPA} />;
}
