/**
 * app/(app)/[orgSlug]/tareas/page.tsx
 *
 * Agentik — Tareas — Server Component
 * Sprint: AGENTIK-TASK-INBOX-01
 *
 * Validates org access, fetches tasks from TaskService,
 * builds ViewModel, and passes it to the Client Component.
 * No Prisma here — access only via taskService.
 */

import { requireOrgAccess }          from "@/lib/auth/org-access";
import { taskService }               from "@/lib/tasks/task-service";
import { buildTaskInboxViewModel }   from "@/lib/tasks/viewmodel/task-inbox-viewmodel";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { TaskInboxClient }           from "./task-inbox-client";

export default async function TareasPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requireOrgAccess(orgSlug);

  // Fetch tasks — never fails visually; empty state is handled by the UI
  const listResult = await taskService.listTasks(orgSlug).catch(() => ({
    success: false,
    message: "Error al cargar tareas.",
    tasks:   [],
    totalCount: 0,
  }));

  const viewModel = buildTaskInboxViewModel(listResult.tasks ?? []);

  return (
    <div>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Gestión",   href: `/${orgSlug}/dashboard` },
          { label: "Tareas" },
        ]}
        title="Tareas"
        subtitle="Trabajo operativo generado por agentes y módulos"
        status={viewModel.summary.critical > 0 ? "critical" : viewModel.summary.overdue > 0 ? "warning" : "ok"}
        statusLabel={
          viewModel.summary.critical > 0
            ? `${viewModel.summary.critical} crítica${viewModel.summary.critical !== 1 ? "s" : ""}`
            : viewModel.summary.overdue > 0
              ? `${viewModel.summary.overdue} vencida${viewModel.summary.overdue !== 1 ? "s" : ""}`
              : `${viewModel.summary.total} total`
        }
      />

      <TaskInboxClient orgSlug={orgSlug} viewModel={viewModel} />
    </div>
  );
}
