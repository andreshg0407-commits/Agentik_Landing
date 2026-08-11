/**
 * /[orgSlug]/comercial
 *
 * Commercial module entry point — viewport-aware routing.
 *
 * Sprint: AGENTIK-COMMERCIAL-MOBILE-EXECUTIVE-B01.1
 *
 * Authorization is resolved FIRST (requireOrgAccess).
 * Viewport detection (user-agent) only determines WHICH presentation
 * the authorized user receives — it NEVER grants or denies access.
 *
 * Mobile/tablet → /comercial/executive (executive presentation)
 * Desktop      → /comercial/control   (operational dashboard)
 */

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireOrgAccess } from "@/lib/auth/org-access";

const MOBILE_TABLET_RE = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i;

export default async function ComercialEntryPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;

  // Authorization first — viewport never grants access
  await requireOrgAccess(orgSlug);

  const headersList = await headers();
  const ua = headersList.get("user-agent") ?? "";
  const isMobileOrTablet = MOBILE_TABLET_RE.test(ua);

  if (isMobileOrTablet) {
    redirect(`/${orgSlug}/comercial/executive`);
  } else {
    redirect(`/${orgSlug}/comercial/control`);
  }
}
