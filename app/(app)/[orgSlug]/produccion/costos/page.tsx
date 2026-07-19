/**
 * /[orgSlug]/produccion/costos
 *
 * Production Cost workspace — Server Component.
 * Future: Cost per OP, cost per reference, material cost breakdown.
 *
 * Sprint: PRODUCTION-DOMAIN-EXTRACTION-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { EmptyOperationalState } from "@/components/shell/operational-primitives";

export default async function CostosPage({
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
          { label: "Costos" },
        ]}
        title="Costos de Produccion"
        subtitle="Costos por orden, referencia y material"
      />
      <div style={{ padding: 24 }}>
        <EmptyOperationalState
          message="Costos de produccion disponible en el proximo sprint"
          detail="Analisis de costos de produccion con desglose por orden, referencia y material."
        />
      </div>
    </div>
  );
}
