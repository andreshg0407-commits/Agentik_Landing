/**
 * /[orgSlug]/manager/comercial/importaciones — Importaciones executive surface.
 *
 * Sprint: AGENTIK-MANAGER-M2A-P0
 *
 * Reuses canonical import intelligence and decision engine.
 * No loadControlComercial — importaciones uses ZERO snapshot fields.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadNarrowImportaciones } from "@/lib/comercial/manager/manager-narrow-loaders";
import { assembleImportacionesPAFromNarrowLoader } from "@/lib/comercial/manager/manager-commercial-adapter";
import { ImportacionesSurfaceClient } from "./importaciones-client";

export default async function ManagerImportacionesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const narrowData = await loadNarrowImportaciones(organization.id);
  const importacionesPA = assembleImportacionesPAFromNarrowLoader(narrowData);

  return <ImportacionesSurfaceClient importacionesPA={importacionesPA} />;
}
