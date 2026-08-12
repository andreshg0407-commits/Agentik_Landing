/**
 * /[orgSlug]/manager/comercial/ventas — Ventas executive surface.
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 * Consumes certified sales truth from loadControlComercial.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadControlComercial } from "@/lib/comercial/control/control-comercial-loader";
import { buildImportSupplyIntelligence } from "@/lib/comercial/importaciones/import-intelligence-service";
import { assembleCommercialExecutivePA } from "@/lib/comercial/executive/commercial-executive-presentation-assembler";
import { assembleVentasPA } from "@/lib/comercial/manager/manager-commercial-adapter";
import { VentasSurfaceClient } from "./ventas-client";

export default async function ManagerVentasPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const [snapshot, importIntelligence] = await Promise.all([
    loadControlComercial(orgId, orgSlug),
    buildImportSupplyIntelligence(orgId).catch(() => null),
  ]);

  const pa = assembleCommercialExecutivePA({ snapshot, importIntelligence, orgSlug });
  const ventasPA = assembleVentasPA(pa);

  return <VentasSurfaceClient ventasPA={ventasPA} />;
}
