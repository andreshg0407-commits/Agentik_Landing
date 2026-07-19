import { notFound } from "next/navigation";
import { IntegrationProvider } from "@prisma/client";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { prisma } from "@/lib/prisma";
import ContextHeader from "@/components/app/context-header";
import PyaSyncPanel from "./pya-sync-panel";
import { statusLabel } from "@/lib/ui/status-labels";

async function getPyaIntegration(integrationId: string, organizationId: string) {
  return prisma.integration.findFirst({
    where: { id: integrationId, organizationId, provider: IntegrationProvider.PYA },
    select: { id: true, name: true, status: true, lastSyncedAt: true, lastError: true },
  });
}

export default async function PyaIntegrationPage({
  params,
}: {
  params: { orgSlug: string; integrationId: string };
}) {
  const { organization } = await requireOrgAccess(params.orgSlug);
  const integration = await getPyaIntegration(params.integrationId, organization.id);

  if (!integration) notFound();

  return (
    <main>
      <ContextHeader organization={organization} />
      <h1>Integración PYA</h1>

      <dl>
        <dt>ID</dt>
        <dd>{integration.id}</dd>

        <dt>Nombre</dt>
        <dd>{integration.name ?? "—"}</dd>

        <dt>Estado</dt>
        <dd>{statusLabel(integration.status)}</dd>

        {integration.lastSyncedAt && (
          <>
            <dt>Última sincronización</dt>
            <dd>{integration.lastSyncedAt.toISOString().slice(0, 19).replace("T", " ")} UTC</dd>
          </>
        )}

        {integration.lastError && (
          <>
            <dt>Último error</dt>
            <dd>{integration.lastError}</dd>
          </>
        )}
      </dl>

      <h2>Sincronización manual</h2>
      <PyaSyncPanel
        organizationId={organization.id}
        integrationId={integration.id}
      />
    </main>
  );
}
