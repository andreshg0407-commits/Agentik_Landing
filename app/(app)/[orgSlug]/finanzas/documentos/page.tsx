/**
 * /[orgSlug]/finanzas/documentos
 *
 * Centro Documental Financiero — Server Component wrapper.
 * Handles auth + delegates rendering to DocumentosClient (interactive layer).
 *
 * Sprint: AGENTIK-FINANCE-DOCS-V1-01
 */

import { requireOrgAccess }   from "@/lib/auth/org-access";
import { DocumentosClient }   from "./documentos-client";

export default async function DocumentosPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  await requireOrgAccess(orgSlug);
  return <DocumentosClient orgSlug={orgSlug} />;
}
