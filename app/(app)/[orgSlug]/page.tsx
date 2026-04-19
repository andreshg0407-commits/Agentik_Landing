/**
 * app/(app)/[orgSlug]/page.tsx
 *
 * Org root — role-based home redirect.
 *
 * Visiting /<orgSlug> (with no sub-path) redirects the authenticated user
 * to their natural home module based on their membership role.
 * The redirect is server-side (no flash of content).
 *
 * All auth and membership validation is handled by requireTenant.
 * If the user is unauthenticated or not a member, requireTenant throws
 * and Next.js propagates the error to the nearest error boundary.
 */

import { redirect }      from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { getRoleHome }   from "@/lib/auth/role-home";

export default async function OrgRootPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx  = await requireTenant(orgSlug);
  const home = getRoleHome(ctx.role);
  redirect(`/${orgSlug}/${home}`);
}
