/**
 * app/(app)/[orgSlug]/ejecuciones/page.tsx
 *
 * Agentik — Ejecuciones — Server Component
 * Sprint: AGENTIK-WORK-EXECUTION-OBSERVABILITY-01
 *
 * Validates org access, fetches executions from workExecutionService,
 * builds ViewModel, passes to client component.
 * No Prisma here — access only via service.
 */

import { requireOrgAccess }              from "@/lib/auth/org-access";
import { workExecutionService }          from "@/lib/work/live/work-execution-service";
import { buildWorkExecutionViewModel }   from "@/lib/work/live/viewmodel/work-execution-viewmodel";
import { OperationalWorkspaceHeader }   from "@/components/workspace/operational-workspace-header";
import { WorkExecutionClient }          from "./work-execution-client";

export default async function EjecucionesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requireOrgAccess(orgSlug);

  const records = await workExecutionService
    .listExecutions(orgSlug, 100)
    .catch(() => []);

  const viewModel = buildWorkExecutionViewModel(records);
  const { summary } = viewModel;

  const statusSignal =
    summary.failed  > 0 ? "critical" :
    summary.running > 0 ? "warning"  :
    "ok";

  const statusLabel =
    summary.failed > 0
      ? `${summary.failed} fallida${summary.failed !== 1 ? "s" : ""}`
      : summary.running > 0
        ? `${summary.running} en curso`
        : summary.total === 0
          ? "Sin ejecuciones"
          : `${summary.total} total`;

  return (
    <div>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Gestión",     href: `/${orgSlug}/dashboard` },
          { label: "Ejecuciones" },
        ]}
        title="Ejecuciones"
        subtitle="Historial de trabajo ejecutado por agentes y módulos de Agentik."
        status={statusSignal}
        statusLabel={statusLabel}
      />

      <WorkExecutionClient orgSlug={orgSlug} viewModel={viewModel} />
    </div>
  );
}
