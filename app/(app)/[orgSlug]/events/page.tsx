import Link from "next/link";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { listEvents } from "@/lib/events/queries";
import ContextHeader from "@/components/app/context-header";
import { statusLabel } from "@/lib/ui/status-labels";

export default async function EventsPage({
  params,
}: {
  params: { orgSlug: string };
}) {
  const { organization } = await requireOrgAccess(params.orgSlug);
  const events = await listEvents(organization.id);

  return (
    <main>
      <ContextHeader organization={organization} />
      <h1>Eventos</h1>

      {events.length === 0 ? (
        <p>Sin eventos.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Origen</th>
              <th>Proyecto</th>
              <th>Creado</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>
                  <Link href={`/${params.orgSlug}/events/${event.id}`}>
                    {event.type}
                  </Link>
                </td>
                <td>{statusLabel(event.status)}</td>
                <td>
                  {event.sourceType
                    ? `${event.sourceType}${event.sourceId ? ` — ${event.sourceId.slice(0, 8)}` : ""}`
                    : "—"}
                </td>
                <td>{event.project?.name ?? "—"}</td>
                <td>{event.createdAt.toISOString().slice(0, 19).replace("T", " ")} UTC</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
