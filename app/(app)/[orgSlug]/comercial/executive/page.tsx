/**
 * /[orgSlug]/comercial/executive
 *
 * Commercial Executive — mobile/tablet presentation for ORG_ADMIN/MANAGER.
 *
 * Sprint: AGENTIK-COMMERCIAL-MOBILE-EXECUTIVE-B01 / B02
 *
 * Same domain truth, same permissions, same canonical services.
 * Different presentation for narrow/tablet viewports.
 *
 * Authorization: normal tenant/module authorization via requireOrgAccess.
 * Viewport NEVER grants authorization — it determines HOW the authorized
 * Commercial product is presented, not WHAT data the user may access.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadControlComercial } from "@/lib/comercial/control/control-comercial-loader";
import { buildImportSupplyIntelligence } from "@/lib/comercial/importaciones/import-intelligence-service";
import { assembleCommercialExecutivePA } from "@/lib/comercial/executive/commercial-executive-presentation-assembler";
import { CommercialExecutiveClient } from "./executive-client";

export default async function CommercialExecutivePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId = organization.id;

  const [snapshot, importIntelligence] = await Promise.all([
    loadControlComercial(orgId, orgSlug),
    buildImportSupplyIntelligence(orgId).catch(() => null),
  ]);

  const pa = assembleCommercialExecutivePA({
    snapshot,
    importIntelligence,
    orgSlug,
  });

  return <CommercialExecutiveClient orgSlug={orgSlug} pa={pa} />;
}
