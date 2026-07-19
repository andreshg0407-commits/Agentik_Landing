/**
 * /[orgSlug]/produccion/ordenes
 *
 * Production Orders workspace — Server Component.
 * Future: OP list, detail, status, stage progression.
 *
 * Sprint: PRODUCTION-DOMAIN-EXTRACTION-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { EmptyOperationalState } from "@/components/shell/operational-primitives";

export default async function OrdenesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requireOrgAccess(orgSlug);

  return (
    <div>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Produccion", href: `/${orgSlug}/produccion` },
          { label: "Ordenes" },
        ]}
        title="Ordenes de Produccion"
        subtitle="Ordenes activas, en proceso y finalizadas"
      />
      <div style={{ padding: 24 }}>
        <EmptyOperationalState
          message="Ordenes de produccion disponible en el proximo sprint"
          detail="Vista de ordenes con detalle de etapas, consumos y progreso."
        />
      </div>
    </div>
  );
}
