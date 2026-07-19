/**
 * /[orgSlug]/produccion/consumos
 *
 * Material Consumption workspace — Server Component.
 * Future: CN analysis, raw material tracking, cost attribution.
 *
 * Sprint: PRODUCTION-DOMAIN-EXTRACTION-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { EmptyOperationalState } from "@/components/shell/operational-primitives";

export default async function ConsumosPage({
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
          { label: "Consumos" },
        ]}
        title="Consumos de Material"
        subtitle="Materias primas, insumos y consumos por orden de produccion"
      />
      <div style={{ padding: 24 }}>
        <EmptyOperationalState
          message="Consumos de material disponible en el proximo sprint"
          detail="Analisis de consumos de materias primas e insumos con trazabilidad a ordenes de produccion."
        />
      </div>
    </div>
  );
}
