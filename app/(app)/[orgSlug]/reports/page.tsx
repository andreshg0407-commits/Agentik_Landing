/**
 * Informes Inteligentes — server page.
 * Mobile-first report copilot for Castillitos.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import ReportsClient        from "./reports-client";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }      = await params;
  await requireOrgAccess(orgSlug);   // auth gate

  return <ReportsClient orgSlug={orgSlug} />;
}
