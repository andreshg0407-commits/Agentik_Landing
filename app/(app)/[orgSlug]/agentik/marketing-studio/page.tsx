/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/page.tsx
 *
 * MARKETING-NAV-CLEANUP-01 — Hub eliminado
 *
 * El concepto de "Hub" ha sido eliminado del módulo Marketing Studio.
 * El rail lateral jerárquico actúa como índice de navegación principal.
 *
 * Redirige directamente al primer módulo de producción: Foto Estudio.
 * Admin y plataforma acceden a presets/tenants/intake desde la sección
 * "Administración" en el rail de plataforma.
 */
import { redirect }                  from "next/navigation";
import { requireOrgAccess }          from "@/lib/auth/org-access";
import { canAccessMarketingStudio }  from "@/lib/auth/module-access";

export default async function MarketingStudioPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }    = await params;
  const { membership } = await requireOrgAccess(orgSlug);

  if (!canAccessMarketingStudio(membership.role)) {
    redirect(`/${orgSlug}/dashboard`);
  }

  redirect(`/${orgSlug}/agentik/marketing-studio/foto-estudio/new`);
}
