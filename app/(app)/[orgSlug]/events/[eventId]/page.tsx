import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getEvent } from "@/lib/events/queries";
import ContextHeader from "@/components/app/context-header";
import { statusLabel } from "@/lib/ui/status-labels";

export default async function EventDetailPage({
  params,
}: {
  params: { orgSlug: string; eventId: string };
}) {
  const { organization } = await requireOrgAccess(params.orgSlug);
  const event = await getEvent(params.eventId, organization.id);

  if (!event) notFound();

  return (
    <main>
      <ContextHeader organization={organization} />
      <h1>{event.type}</h1>

      <dl>
        <dt>Estado</dt>
        <dd>{statusLabel(event.status)}</dd>

        {event.sourceType && (
          <>
            <dt>Origen</dt>
            <dd>
              {event.sourceType}
              {event.sourceId ? ` — ${event.sourceId}` : ""}
            </dd>
          </>
        )}

        {event.project && (
          <>
            <dt>Proyecto</dt>
            <dd>{event.project.name} ({event.project.key})</dd>
          </>
        )}

        {event.runId && (
          <>
            <dt>Ejecución</dt>
            <dd>
              <Link href={`/${params.orgSlug}/runs/${event.runId}`}>
                {event.runId}
              </Link>
            </dd>
          </>
        )}

        {event.traceId && (
          <>
            <dt>ID de traza</dt>
            <dd>{event.traceId}</dd>
          </>
        )}

        <dt>Creado</dt>
        <dd>{event.createdAt.toISOString().slice(0, 19).replace("T", " ")} UTC</dd>

        {event.processedAt && (
          <>
            <dt>Procesado</dt>
            <dd>{event.processedAt.toISOString().slice(0, 19).replace("T", " ")} UTC</dd>
          </>
        )}
      </dl>

      {event.payloadJson !== null && (
        <>
          <h2>Carga útil</h2>
          <pre>{JSON.stringify(event.payloadJson, null, 2)}</pre>
        </>
      )}

      {event.errorJson !== null && (
        <>
          <h2>Error</h2>
          <pre>{JSON.stringify(event.errorJson, null, 2)}</pre>
        </>
      )}

      <p>
        <Link href={`/${params.orgSlug}/events`}>← Volver a eventos</Link>
      </p>
    </main>
  );
}
