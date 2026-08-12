/**
 * /[orgSlug]/manager/comercial/inventario — Inventario executive surface.
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 * Consumes canonical inventory availability and coverage truth.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadControlComercial } from "@/lib/comercial/control/control-comercial-loader";
import { buildImportSupplyIntelligence } from "@/lib/comercial/importaciones/import-intelligence-service";
import { assembleCommercialExecutivePA } from "@/lib/comercial/executive/commercial-executive-presentation-assembler";
import { assembleInventarioPA } from "@/lib/comercial/manager/manager-commercial-adapter";
import { InventarioSurfaceClient } from "./inventario-client";

export default async function ManagerInventarioPage({
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
  const inventarioPA = assembleInventarioPA(pa);

  return <InventarioSurfaceClient inventarioPA={inventarioPA} />;
}
