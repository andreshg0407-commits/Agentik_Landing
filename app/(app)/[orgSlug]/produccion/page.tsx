/**
 * /[orgSlug]/produccion
 *
 * Production Operations Workspace — Server Component wrapper.
 * Auth -> V2 snapshot build -> executive projection -> ProduccionClient.
 *
 * Sprint: PRODUCTION-EXECUTIVE-DASHBOARD-01
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { buildProductionOperationsSnapshot } from "@/lib/production/production-operations-service";
import { buildProductionExecutiveSnapshot } from "@/lib/production/production-executive-service";
import { ProduccionClient } from "./produccion-client";

export default async function ProduccionPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const snapshot = await buildProductionOperationsSnapshot(organization.id, orgSlug);
  const executive = buildProductionExecutiveSnapshot(snapshot);

  return (
    <ProduccionClient
      orgSlug={orgSlug}
      snapshot={snapshot}
      executive={executive}
    />
  );
}
