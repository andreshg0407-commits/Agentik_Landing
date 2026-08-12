/**
 * /[orgSlug]/manager/comercial/importaciones — Importaciones executive surface.
 *
 * Sprint: AGENTIK-MANAGER-APP-CANONICAL-INTEGRATION-01
 *
 * Reuses canonical import intelligence and decision engine.
 * Low rotation uses the locked calendar-month semantics.
 * SIN_FECHA_DE_ACTIVIDAD_IMPORTACION is a separate truth state.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadControlComercial } from "@/lib/comercial/control/control-comercial-loader";
import { buildImportSupplyIntelligence } from "@/lib/comercial/importaciones/import-intelligence-service";
import { assembleCommercialExecutivePA } from "@/lib/comercial/executive/commercial-executive-presentation-assembler";
import { assembleImportacionesPA } from "@/lib/comercial/manager/manager-commercial-adapter";
import { ImportacionesSurfaceClient } from "./importaciones-client";

export default async function ManagerImportacionesPage({
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
  const importacionesPA = assembleImportacionesPA(pa);

  return <ImportacionesSurfaceClient importacionesPA={importacionesPA} />;
}
