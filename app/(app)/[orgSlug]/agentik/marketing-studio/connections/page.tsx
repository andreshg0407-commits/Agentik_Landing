/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/connections/page.tsx
 *
 * MARKETING-CONNECTIONS-01 — Centro de Integraciones de Marketing y Publicidad
 *
 * Responde: "¿Qué servicios están conectados, con qué permisos y están listos para trabajar?"
 *
 * Reutiliza infraestructura existente:
 *   - IntegrationConnection (Prisma)
 *   - TenantAdsConfig (Prisma)
 *   - listConnectionsByProvider (integration-repository)
 *   - getAdsAccountsConfig (ads-accounts-config-service)
 *
 * Los secretos permanecen exclusivamente en el Vault — nunca expuestos a la UI.
 */

import { redirect }                   from "next/navigation";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { canAccessMarketingStudio }   from "@/lib/auth/module-access";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";

import { getConnectionsSummary }      from "@/lib/marketing-studio/connections/connections-service";
import { ConnectionsClient }          from "@/components/marketing-studio/connections/connections-client";

export default async function ConnectionsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }               = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);

  if (!canAccessMarketingStudio(membership.role)) {
    redirect(`/${orgSlug}/agentik`);
  }

  const data = await getConnectionsSummary(organization.id);
  const { resumen } = data;

  const headerStatus =
    resumen.requierenAtencion > 0 ? "warning" as const
    : resumen.activas > 0         ? "ok"      as const
    :                               "neutral" as const;

  const headerLabel =
    resumen.requierenAtencion > 0
      ? `${resumen.requierenAtencion} integración${resumen.requierenAtencion !== 1 ? "es" : ""} con problema`
      : resumen.activas > 0
      ? `${resumen.activas} integración${resumen.activas !== 1 ? "es" : ""} activa${resumen.activas !== 1 ? "s" : ""}`
      : "Sin integraciones activas";

  return (
    <div style={{ maxWidth: 1100, paddingBottom: 64 }}>

      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Conexiones" },
        ]}
        title="Centro de Integraciones"
        subtitle="Estado operativo de todas las plataformas externas conectadas a Agentik"
        status={headerStatus}
        statusLabel={headerLabel}
      />

      <ConnectionsClient
        orgSlug={orgSlug}
        initialData={data}
      />

    </div>
  );
}
