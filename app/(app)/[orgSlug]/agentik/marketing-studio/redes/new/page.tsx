/**
 * /[orgSlug]/agentik/marketing-studio/redes/new
 *
 * AGENTIK-MARKETING-PUBLISHER-01 — Compositor de publicación IA
 *
 * Distribution Composer — workspace operativo de publicación multi-canal.
 * No backend changes. No rails touched. Auth gate: canAccessMarketingStudio.
 */

import { redirect }                   from "next/navigation";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { canAccessMarketingStudio }   from "@/lib/auth/module-access";
import { listConnectionsByProvider }  from "@/lib/integrations/integration-repository";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { T }                          from "@/lib/ui/tokens";
import { PublicationComposer }        from "./composer";
import type { ComposerAccountEntry }  from "./composer";

export default async function NewPublicationPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }    = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  // Fetch real connected accounts for composer channel picker
  const grouped = await listConnectionsByProvider(organization.id);
  const SOCIAL_PROVIDERS = ["meta_instagram", "meta_facebook", "tiktok", "youtube", "meta_whatsapp", "shopify"];
  const connectedAccounts: ComposerAccountEntry[] = SOCIAL_PROVIDERS.flatMap(provider => {
    const accounts = grouped[provider] ?? [];
    return accounts
      .filter(a => a.status === "connected")
      .map(a => ({
        id:           a.id,
        provider,
        label:        a.externalAccountName ?? provider,
        connected:    true,
        isPrimary:    a.isPrimary,
        accountName:  a.externalAccountName,
        accountHandle: a.accountHandle,
      }));
  });

  return (
    <div style={{ maxWidth: 1040, fontFamily: T.mono }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio`        },
          { label: "Publicaciones",    href: `/${orgSlug}/agentik/marketing-studio/redes`  },
          { label: "Nueva publicación"                                                       },
        ]}
        title="Nueva publicación"
        subtitle="Compositor operativo de distribución IA multi-canal"
        status="ok"
        statusLabel="Composer activo"
        contextualBackHref={`/${orgSlug}/agentik/marketing-studio/redes`}
        contextualBackLabel="Volver a Distribución de Contenido"
      />
      <PublicationComposer orgSlug={orgSlug} connectedAccounts={connectedAccounts} />
    </div>
  );
}
