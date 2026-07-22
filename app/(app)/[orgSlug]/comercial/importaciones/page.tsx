/**
 * /[orgSlug]/comercial/importaciones
 *
 * Importaciones — Server Component wrapper.
 * Loads import intelligence data (references + KPIs + classifications).
 *
 * Sprint: AGENTIK-IMPORTS-AUDIT-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { buildImportSupplyIntelligence } from "@/lib/comercial/importaciones/import-intelligence-service";
import { ImportacionesClient } from "./importaciones-client";

export default async function ImportacionesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }      = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;

  const { items, kpis } = await buildImportSupplyIntelligence(orgId);

  return (
    <ImportacionesClient
      orgSlug={orgSlug}
      items={items}
      kpis={kpis}
    />
  );
}
