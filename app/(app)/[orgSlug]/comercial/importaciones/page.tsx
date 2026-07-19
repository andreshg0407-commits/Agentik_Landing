/**
 * /[orgSlug]/comercial/importaciones
 *
 * Importaciones — Server Component wrapper.
 * Loads import references and summary, passes to client.
 *
 * Sprint: COMPRAS-IMPORTACIONES-MVP-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { listImportedReferences, getImportSummary } from "@/lib/comercial/importaciones/import-service";
import { ImportacionesClient } from "./importaciones-client";

export default async function ImportacionesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }      = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;

  const [references, summary] = await Promise.all([
    listImportedReferences(orgId),
    getImportSummary(orgId),
  ]);

  return (
    <ImportacionesClient
      orgSlug={orgSlug}
      references={references}
      summary={summary}
    />
  );
}
