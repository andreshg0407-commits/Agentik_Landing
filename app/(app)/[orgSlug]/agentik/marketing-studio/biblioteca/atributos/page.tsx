/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/biblioteca/atributos/page.tsx
 *
 * MARKETING-STUDIO-PRODUCT-ATTRIBUTES-01
 *
 * Attribute Definition Manager — org-level catalog for what product attributes
 * exist, their types, required status, sort order, and valid options.
 *
 * Server component: fetches definitions server-side then passes to client.
 */

import { requireOrgAccess }         from "@/lib/auth/org-access";
import { listAttributeDefinitions } from "@/lib/marketing-studio/products/attribute-definitions/attribute-definition-repository";
import { AttributeDefinitionsClient } from "@/components/marketing-studio/library/attribute-definitions-client";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

export default async function AttributeDefinitionsPage({ params }: PageProps) {
  const { orgSlug }    = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const definitions = await listAttributeDefinitions(organization.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", padding: "24px" }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Biblioteca",       href: `/${orgSlug}/agentik/marketing-studio/biblioteca` },
          { label: "Atributos" },
        ]}
        title="Atributos de producto"
        subtitle={`${definitions.length} definiciones configuradas para este org`}
      />

      <div style={{ flex: 1, marginTop: "24px" }}>
        <AttributeDefinitionsClient
          orgSlug={orgSlug}
          initialDefinitions={definitions.map(d => ({
            id:          d.id,
            key:         d.key,
            label:       d.label,
            type:        d.type,
            required:    d.required,
            sortOrder:   d.sortOrder,
            helpText:    d.helpText,
            destination: d.destination,
            options:     d.options.map(o => ({
              id:          o.id,
              definitionId: o.definitionId,
              value:       o.value,
              label:       o.label,
              sortOrder:   o.sortOrder,
            })),
          }))}
        />
      </div>
    </div>
  );
}
