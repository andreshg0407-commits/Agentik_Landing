import Link from "next/link";
import { RunStatus } from "@prisma/client";
import { requireTenant } from "@/lib/tenant";
import { listRuns } from "@/lib/runs/queries";
import ContextHeader from "@/components/app/context-header";
import { statusLabel } from "@/lib/ui/status-labels";

const STATUS_ORDER: RunStatus[] = ["FAILED", "RUNNING", "QUEUED", "CANCELED", "SUCCEEDED"];

function formatTs(date: Date | null | undefined) {
  if (!date) return "—";
  return date.toISOString().slice(0, 19).replace("T", " ") + " UTC";
}

export default async function RunsPage({
  params,
}: {
  params: { orgSlug: string };
}) {
  const { orgId, orgSlug, projectId } = await requireTenant(params.orgSlug);
  const runs = await listRuns(orgId, projectId);
  const organization = { name: orgSlug };

  const grouped = STATUS_ORDER.map((status) => ({
    status,
    items: runs.filter((r) => r.status === status),
  })).filter((g) => g.items.length > 0);

  return (
    <main>
      <ContextHeader organization={organization} />
      <h1>Ejecuciones</h1>

      {runs.length === 0 ? (
        <p>Sin ejecuciones.</p>
      ) : (
        grouped.map(({ status, items }) => (
          <section key={status}>
            <h2>{statusLabel(status)}</h2>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tipo</th>
                  <th>Estado</th>
                  <th>Proyecto</th>
                  <th>Espacio de trabajo</th>
                  <th>Inicio</th>
                  <th>Fin</th>
                </tr>
              </thead>
              <tbody>
                {items.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <Link href={`/${params.orgSlug}/runs/${run.id}`}>
                        {run.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td>{run.type}</td>
                    <td>{statusLabel(run.status)}</td>
                    <td>{run.project?.name ?? "—"}</td>
                    <td>{run.project?.workspace?.name ?? "—"}</td>
                    <td>{formatTs(run.startedAt)}</td>
                    <td>{formatTs(run.endedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </main>
  );
}
