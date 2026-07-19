/**
 * /[orgSlug]/agentik/marketing-studio/pauta
 *
 * MARKETING-ADS-01 — Redirect legacy route
 *
 * "Pauta IA" ha sido renombrado a "Anuncios".
 * Este redirect mantiene compatibilidad con enlaces anteriores.
 */

import { redirect }                   from "next/navigation";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { canAccessMarketingStudio }   from "@/lib/auth/module-access";

export default async function PautaPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }    = await params;
  const { membership } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  // "Pauta IA" renombrado a "Anuncios" — MARKETING-ADS-01
  redirect(`/${orgSlug}/agentik/marketing-studio/anuncios`);
}
