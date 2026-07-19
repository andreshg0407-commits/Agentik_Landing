/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/catalogos/[catalogId]/page.tsx
 *
 * MARKETING-STUDIO-CATALOG-BUILDER-01
 *
 * Catalog detail: live resolved product list, pricingMode respect, WhatsApp CTA.
 * Server component: resolves catalog + products then passes to client.
 */

import { redirect, notFound }    from "next/navigation";
import { requireOrgAccess }     from "@/lib/auth/org-access";
import { canAccessMarketingStudio } from "@/lib/auth/module-access";
import { getCatalogDefinition } from "@/lib/marketing-studio/catalogs/catalog-definition-repository";
import { resolveCatalog }       from "@/lib/marketing-studio/catalogs/catalog-query-service";
import { listPublicLinksForCatalog } from "@/lib/marketing-studio/catalogs/catalog-public-link-repository";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { CatalogDetailClient }  from "@/components/marketing-studio/catalogs/catalog-detail-client";
import {
  CATALOG_STATUS_LABELS,
  PRICING_MODE_LABELS,
}                               from "@/lib/marketing-studio/catalogs/catalog-definition-types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ orgSlug: string; catalogId: string }>;
}

export default async function CatalogDetailPage({ params }: PageProps) {
  const { orgSlug, catalogId }   = await params;
  const { membership, organization } = await requireOrgAccess(orgSlug);
  if (!canAccessMarketingStudio(membership.role)) redirect(`/${orgSlug}/agentik`);

  const definition = await getCatalogDefinition(organization.id, catalogId);
  if (!definition) notFound();

  const [resolved, publicLinks] = await Promise.all([
    resolveCatalog(definition, { limit: 200 }),
    listPublicLinksForCatalog(organization.id, catalogId),
  ]);
  // Use the most recent link (first in list — ordered by createdAt desc)
  const activeLink = publicLinks[0] ?? null;

  const statusLabel = CATALOG_STATUS_LABELS[definition.status];
  const pricingLabel = PRICING_MODE_LABELS[definition.pricingMode];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", padding: "24px" }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Catálogos",        href: `/${orgSlug}/agentik/marketing-studio/catalogos` },
          { label: definition.name },
        ]}
        title={definition.name}
        subtitle={`${resolved.totalCount} productos · ${resolved.layoutResult.sections.length} secciones · ${statusLabel} · ${pricingLabel}`}
      />

      <div style={{ flex: 1, marginTop: "24px" }}>
        <CatalogDetailClient
          orgSlug={orgSlug}
          initialPublicLink={activeLink}
          definition={{
            id:              definition.id,
            name:            definition.name,
            description:     definition.description,
            status:          definition.status,
            filters:         definition.filters,
            sortField:       definition.sortField,
            sortDirection:   definition.sortDirection,
            groupBy:         definition.groupBy,
            pricingMode:     definition.pricingMode,
            ctaMode:         definition.ctaMode,
            whatsAppPhone:   definition.whatsAppPhone,
            layout:          definition.layout,
            groupByCategory: definition.groupByCategory,
            categorySort:    definition.categorySort,
            categoryOrder:   definition.categoryOrder,
            templateKey:     definition.templateKey,
          }}
          initialResolved={{
            items:        resolved.items,
            groups:       resolved.groups,
            totalCount:   resolved.totalCount,
            pricingMode:  resolved.pricingMode,
            layoutResult: resolved.layoutResult,
          }}
        />
      </div>
    </div>
  );
}
