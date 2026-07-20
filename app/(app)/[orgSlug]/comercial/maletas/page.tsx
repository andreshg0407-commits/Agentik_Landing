/**
 * /[orgSlug]/comercial/maletas
 *
 * Maletas Comerciales — Centro de Control Operativo de Muestras.
 *
 * Sprint: VENDOR-SAMPLE-LEDGER-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadVendorSampleData } from "@/lib/comercial/maletas/vendor-sample-loader";
import { MaletasClient } from "./maletas-client";

export default async function MaletasPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const data = await loadVendorSampleData(organization.id);

  return (
    <MaletasClient
      orgSlug={orgSlug}
      vendors={data.vendors}
      summary={data.summary}
      coverageGaps={data.coverageGaps}
      productionSuggestions={data.productionSuggestions}
      intelligence={data.intelligence}
      accessorySummary={data.accessorySummary}
      source={data.source}
      loadedAt={data.loadedAt}
      assortmentEvaluations={data.assortmentEvaluations}
      productionThresholds={data.productionThresholds}
      coverageResult={data.coverageResult}
    />
  );
}
