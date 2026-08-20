/**
 * /api/orgs/[orgSlug]/members/[memberId]
 *
 * Sprint: AGENTIK-TENANT-USER-ADMIN-01
 *
 * PATCH — update member role or status (activate/disable)
 *
 * Authorization: SUPER_ADMIN / AGENTIK_ADMIN only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { hasPlatformConsoleAccess } from "@/lib/auth/module-access";
import { updateOrgMember } from "@/lib/auth/member-admin";
import type { UpdateMemberInput } from "@/lib/auth/member-admin";
import type { Role } from "@prisma/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string; memberId: string }> },
) {
  try {
    const { orgSlug, memberId } = await params;
    const { organization, membership, platformRole } = await requireOrgAccess(orgSlug);

    if (!hasPlatformConsoleAccess(platformRole)) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
    }

    const body = await req.json() as Partial<UpdateMemberInput>;

    const input: UpdateMemberInput = {};
    if (body.role) input.role = body.role as Role;
    if (body.status) input.status = body.status as "ACTIVE" | "DISABLED";

    const result = await updateOrgMember(organization.id, membership.role, memberId, input);
    if (!result.ok) {
      const status = result.error === "MEMBERSHIP_NOT_FOUND" ? 404
        : result.error === "UNAUTHORIZED" || result.error === "CANNOT_GRANT_HIGHER_ROLE" || result.error === "CANNOT_GRANT_INTERNAL_ROLE" ? 403
        : 400;
      return NextResponse.json({ error: result.error, detail: result.detail }, { status });
    }

    return NextResponse.json({ member: result.data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ORG_NOT_FOUND") return NextResponse.json({ error: msg }, { status: 404 });
    if (msg === "ACCESS_DENIED") return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
