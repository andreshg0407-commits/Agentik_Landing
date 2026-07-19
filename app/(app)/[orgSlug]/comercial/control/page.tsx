/**
 * /[orgSlug]/comercial/control
 *
 * Control Comercial — executive dashboard server page.
 * Auth -> loadControlComercial -> serialized props -> ControlClient.
 *
 * Sprint: COMMERCIAL-PRODUCTION-READINESS-01 — Phase 9
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { loadControlComercial } from "@/lib/comercial/control/control-comercial-loader";
import { ControlClient } from "./control-client";

export default async function ControlComercialPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { organization } = await requireOrgAccess(orgSlug);

  const snapshot = await loadControlComercial(organization.id, orgSlug);

  return <ControlClient orgSlug={orgSlug} snapshot={snapshot} />;
}
