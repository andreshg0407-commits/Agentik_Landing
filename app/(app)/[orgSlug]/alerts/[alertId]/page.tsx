import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getAlert } from "@/lib/alerts/queries";
import ContextHeader from "@/components/app/context-header";
import { severityLabel, statusLabel } from "@/lib/ui/status-labels";

export default async function AlertDetailPage({
  params,
}: {
  params: { orgSlug: string; alertId: string };
}) {
  const { organization } = await requireOrgAccess(params.orgSlug);
  const alert = await getAlert(params.alertId, organization.id);

  if (!alert) notFound();

  return (
    <main>
      <ContextHeader organization={organization} />
      <h1>{alert.title}</h1>

      <dl>
        <dt>Gravedad</dt>
        <dd>{severityLabel(alert.severity)}</dd>

        <dt>Estado</dt>
        <dd>{statusLabel(alert.status)}</dd>

        <dt>Tipo</dt>
        <dd>{alert.type}</dd>

        {alert.message && (
          <>
            <dt>Mensaje</dt>
            <dd>{alert.message}</dd>
          </>
        )}

        {alert.sourceType && (
          <>
            <dt>Origen</dt>
            <dd>
              {alert.sourceType}
              {alert.sourceId ? ` — ${alert.sourceId}` : ""}
            </dd>
          </>
        )}

        <dt>Creada</dt>
        <dd>{alert.createdAt.toISOString().slice(0, 19).replace("T", " ")} UTC</dd>

        {alert.resolvedAt && (
          <>
            <dt>Resuelta</dt>
            <dd>{alert.resolvedAt.toISOString().slice(0, 19).replace("T", " ")} UTC</dd>
          </>
        )}
      </dl>

      <p>
        <Link href={`/${params.orgSlug}/alerts`}>← Volver a alertas</Link>
      </p>
    </main>
  );
}
