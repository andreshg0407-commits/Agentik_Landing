/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/publicaciones/page.tsx
 *
 * MARKETING-PUBLICACIONES-01 — Centro Unificado de Publicaciones
 *
 * Bandeja de control editorial empresarial.
 * Consolida el estado de publicación en redes sociales y canales digitales.
 *
 * Identidad del módulo:
 *   "¿Qué contenido está publicado, programado o pendiente en mis canales digitales?"
 *
 * No crea contenido.
 * No diseña campañas.
 * No ejecuta publicaciones automáticamente.
 */

import { redirect }                   from "next/navigation";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { canAccessMarketingStudio }   from "@/lib/auth/module-access";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";

import { getPublicacionesSummary }    from "@/lib/marketing-studio/publicaciones/publicaciones-service";
import { PublicacionesClient }        from "@/components/marketing-studio/publicaciones/publicaciones-client";

export default async function PublicacionesPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }               = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);

  if (!canAccessMarketingStudio(membership.role)) {
    redirect(`/${orgSlug}/agentik`);
  }

  const data = await getPublicacionesSummary(organization.id);

  const { resumen } = data;

  // Derive header status
  const headerStatus =
    resumen.conError > 0      ? "warning"  as const
    : resumen.programadas > 0 ? "ok"       as const
    : resumen.total === 0     ? "neutral"  as const
    :                           "ok"       as const;

  const headerLabel =
    resumen.conError > 0
      ? `${resumen.conError} publicación${resumen.conError !== 1 ? "es" : ""} con error`
      : resumen.programadas > 0
      ? `${resumen.programadas} programada${resumen.programadas !== 1 ? "s" : ""}`
      : resumen.publicadasHoy > 0
      ? `${resumen.publicadasHoy} publicada${resumen.publicadasHoy !== 1 ? "s" : ""} hoy`
      : "Sin publicaciones activas";

  return (
    <div style={{ maxWidth: 1100, paddingBottom: 64 }}>

      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Publicaciones" },
        ]}
        title="Publicaciones"
        subtitle="Programa, supervisa y administra el contenido publicado en tus canales digitales."
        status={headerStatus}
        statusLabel={headerLabel}
      />

      <PublicacionesClient
        orgSlug={orgSlug}
        initialData={data}
      />

    </div>
  );
}
