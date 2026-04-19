import { requireWorkspaceAccess } from "@/lib/auth/workspace-access";
import { getWorkspaceDashboardActivity } from "@/lib/dashboard/workspace-activity";
import { getWorkspaceBusinessStatus } from "@/lib/agentik/workspace-activity-engine";
import ContextHeader from "@/components/app/context-header";
import { statusLabel, severityLabel } from "@/lib/ui/status-labels";

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: { orgSlug: string; workspaceSlug: string };
}) {
  const { user, organization, membership, workspace, workspaceMembership } =
    await requireWorkspaceAccess(params.orgSlug, params.workspaceSlug);

  const [activity, { businessStatus }] = await Promise.all([
    getWorkspaceDashboardActivity(workspace.id),
    getWorkspaceBusinessStatus(workspace.id),
  ]);

  return (
    <main>
      <ContextHeader organization={organization} workspace={workspace} />
      <h1>{workspace.name}</h1>
      <p>Organización: {organization.name}</p>
      <p>Usuario: {user.name ?? user.email}</p>
      <p>Rol organización: {membership.role}</p>
      <p>Rol espacio de trabajo: {workspaceMembership.role}</p>

      <section>
        <strong>Estado: {businessStatus.status}</strong>
        <p>{businessStatus.reason}</p>
      </section>

      <h2>Ejecuciones recientes</h2>
      {activity.runs.length === 0 ? (
        <p>Sin actividad reciente.</p>
      ) : (
        <ul>
          {activity.runs.map((run) => (
            <li key={run.id}>{run.type} — {statusLabel(run.status)}</li>
          ))}
        </ul>
      )}

      <h2>Alertas recientes</h2>
      {activity.alerts.length === 0 ? (
        <p>Sin actividad reciente.</p>
      ) : (
        <ul>
          {activity.alerts.map((alert) => (
            <li key={alert.id}>{alert.title} — {severityLabel(alert.severity)} — {statusLabel(alert.status)}</li>
          ))}
        </ul>
      )}

      <h2>Eventos recientes</h2>
      {activity.events.length === 0 ? (
        <p>Sin actividad reciente.</p>
      ) : (
        <ul>
          {activity.events.map((event) => (
            <li key={event.id}>{event.type} — {statusLabel(event.status)}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
