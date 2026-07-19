/**
 * /[orgSlug]/produccion/etapas
 *
 * Production Stages workspace — Server Component.
 * Future: Stage activation view, profile selection, gap analysis.
 *
 * Sprint: PRODUCTION-DOMAIN-EXTRACTION-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { EmptyOperationalState } from "@/components/shell/operational-primitives";

export default async function EtapasPage({
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
          { label: "Etapas" },
        ]}
        title="Etapas de Produccion"
        subtitle="15 etapas canonicas, perfiles productivos y analisis de brechas"
      />
      <div style={{ padding: 24 }}>
        <EmptyOperationalState
          message="Etapas de produccion disponible en el proximo sprint"
          detail="Activacion de etapas, perfiles productivos y deteccion de brechas."
        />
      </div>
    </div>
  );
}
