/**
 * /[orgSlug]/produccion/alertas
 *
 * Production Alerts workspace — Server Component.
 * Future: Operational alerts, delay warnings, stalled OP detection.
 *
 * Sprint: PRODUCTION-DOMAIN-EXTRACTION-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { EmptyOperationalState } from "@/components/shell/operational-primitives";

export default async function AlertasPage({
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
          { label: "Alertas" },
        ]}
        title="Alertas de Produccion"
        subtitle="Alertas operativas: retrasos, OPs detenidas, consumos anomalos"
      />
      <div style={{ padding: 24 }}>
        <EmptyOperationalState
          message="Alertas de produccion disponible en el proximo sprint"
          detail="Deteccion de retrasos, ordenes detenidas, cuellos de botella y consumos anomalos."
        />
      </div>
    </div>
  );
}
