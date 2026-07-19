/**
 * /[orgSlug]/produccion/timeline
 *
 * Production Timeline workspace — Server Component.
 * Future: Timeline visualization, flow analysis, bottleneck detection.
 *
 * Sprint: PRODUCTION-DOMAIN-EXTRACTION-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { EmptyOperationalState } from "@/components/shell/operational-primitives";

export default async function TimelinePage({
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
          { label: "Timeline" },
        ]}
        title="Timeline de Produccion"
        subtitle="Flujo productivo: OP, consumos, etapas y entrada de producto terminado"
      />
      <div style={{ padding: 24 }}>
        <EmptyOperationalState
          message="Timeline de produccion disponible en el proximo sprint"
          detail="Visualizacion del ciclo productivo completo por orden de produccion."
        />
      </div>
    </div>
  );
}
