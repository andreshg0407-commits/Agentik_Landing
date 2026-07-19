import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getRun } from "@/lib/runs/queries";
import ContextHeader from "@/components/app/context-header";
import { statusLabel } from "@/lib/ui/status-labels";

function formatTs(date: Date | null | undefined) {
  if (!date) return "—";
  return date.toISOString().slice(0, 19).replace("T", " ") + " UTC";
}

export default async function RunDetailPage({
  params,
}: {
  params: { orgSlug: string; runId: string };
}) {
  const { organization } = await requireOrgAccess(params.orgSlug);
  const run = await getRun(params.runId, organization.id);

  if (!run) notFound();

  return (
    <main>
      <ContextHeader organization={organization} />
      <h1>Ejecución</h1>

      <dl>
        <dt>ID</dt>
        <dd>{run.id}</dd>

        <dt>Tipo</dt>
        <dd>{run.type}</dd>

        <dt>Estado</dt>
        <dd>{statusLabel(run.status)}</dd>

        <dt>Intento</dt>
        <dd>
          {run.attempt} / {run.maxAttempts}
        </dd>

        {run.project && (
          <>
            <dt>Proyecto</dt>
            <dd>{run.project.name} ({run.project.key})</dd>
          </>
        )}

        {run.project?.workspace && (
          <>
            <dt>Espacio de trabajo</dt>
            <dd>{run.project.workspace.name}</dd>
          </>
        )}

        {run.traceId && (
          <>
            <dt>ID de traza</dt>
            <dd>{run.traceId}</dd>
          </>
        )}

        {run.idempotencyKey && (
          <>
            <dt>Clave de idempotencia</dt>
            <dd>{run.idempotencyKey}</dd>
          </>
        )}

        <dt>En cola</dt>
        <dd>{formatTs(run.queuedAt)}</dd>

        <dt>Inicio</dt>
        <dd>{formatTs(run.startedAt)}</dd>

        <dt>Fin</dt>
        <dd>{formatTs(run.endedAt)}</dd>

        <dt>Creado</dt>
        <dd>{formatTs(run.createdAt)}</dd>

        <dt>Actualizado</dt>
        <dd>{formatTs(run.updatedAt)}</dd>
      </dl>

      {run.errorJson && (
        <>
          <h2>Error</h2>
          <pre>{JSON.stringify(run.errorJson, null, 2)}</pre>
        </>
      )}

      {run.outputJson && (
        <>
          <h2>Salida</h2>
          <pre>{JSON.stringify(run.outputJson, null, 2)}</pre>
        </>
      )}

      {run.inputJson && (
        <>
          <h2>Entrada</h2>
          <pre>{JSON.stringify(run.inputJson, null, 2)}</pre>
        </>
      )}

      <p>
        <Link href={`/${params.orgSlug}/runs`}>← Volver a ejecuciones</Link>
      </p>
    </main>
  );
}
