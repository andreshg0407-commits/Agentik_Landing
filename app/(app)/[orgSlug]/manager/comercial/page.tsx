/**
 * /[orgSlug]/manager/comercial — Commercial Hub.
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * Seven executive surfaces: Ventas, Clientes, Vendedores, Pedidos,
 * Tiendas, Inventario, Importaciones.
 *
 * Reuses canonical data from loadControlComercial + assembleCommercialExecutivePA.
 * No operational navigation. No desktop actions.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadControlComercial } from "@/lib/comercial/control/control-comercial-loader";
import { buildImportSupplyIntelligence } from "@/lib/comercial/importaciones/import-intelligence-service";
import { assembleCommercialExecutivePA } from "@/lib/comercial/executive/commercial-executive-presentation-assembler";
import { assembleCommercialHubPA } from "@/lib/comercial/manager/manager-commercial-adapter";
import { CommercialHubClient } from "./commercial-hub-client";

export default async function ManagerComercialPage({
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

  const pa = assembleCommercialExecutivePA({
    snapshot,
    importIntelligence,
    orgSlug,
  });

  const hubPA = assembleCommercialHubPA({
    snapshot,
    pa,
    orgSlug,
  });

  return <CommercialHubClient orgSlug={orgSlug} hubPA={hubPA} />;
}
