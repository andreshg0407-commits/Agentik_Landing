/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/catalogos/nuevo/page.tsx
 *
 * MARKETING-STUDIO-CATALOG-BUILDER-01
 *
 * Catalog creator: define filters, sort, groupBy, pricingMode, ctaMode, whatsAppPhone.
 * Server component: passes org context to client creator.
 */

import { redirect }              from "next/navigation";
import { requireOrgAccess }     from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { CatalogCreatorClient }  from "@/components/marketing-studio/catalogs/catalog-creator-client";
import { listAttributeDefinitions } from "@/lib/marketing-studio/products/attribute-definitions/attribute-definition-repository";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function NuevoCatalogoPage({ params }: PageProps) {
  const { orgSlug }              = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  const attributeDefinitions = await listAttributeDefinitions(organization.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", padding: "24px" }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Catálogos",        href: `/${orgSlug}/agentik/marketing-studio/catalogos` },
          { label: "Nuevo catálogo" },
        ]}
        title="Nuevo catálogo"
        subtitle="Define filtros, precios y CTA. Los productos se resuelven dinámicamente."
      />

      <div style={{ flex: 1, marginTop: "24px" }}>
        <CatalogCreatorClient
          orgSlug={orgSlug}
          attributeDefinitions={attributeDefinitions.map(d => ({
            key:   d.key,
            label: d.label,
            type:  d.type,
          }))}
        />
      </div>
    </div>
  );
}
