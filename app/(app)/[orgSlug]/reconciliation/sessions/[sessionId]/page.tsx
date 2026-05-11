/**
 * Session detail page — server component.
 *
 * AGENTIK-RECON-SESSIONS-02
 * Hydrates the full session: session metadata + all runs + audit trail.
 */

import { notFound }         from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { getSessionDetail } from "@/lib/reconciliation/session-detail-service";
import SessionDetailClient  from "./session-detail-client";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; sessionId: string }>;
}) {
  const { orgSlug, sessionId } = await params;
  const { organization }       = await requireOrgAccess(orgSlug);

  const data = await getSessionDetail(organization.id, sessionId);
  if (!data) notFound();

  return (
    <SessionDetailClient
      orgSlug={orgSlug}
      session={data.session}
      runs={data.runs}
      events={data.events}
      exceptions={data.exceptions}
      resolutionMap={data.resolutionMap}
    />
  );
}
