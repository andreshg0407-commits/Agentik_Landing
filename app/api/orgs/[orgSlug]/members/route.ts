/**
 * /api/orgs/[orgSlug]/members
 *
 * Sprint: AGENTIK-TENANT-USER-ADMIN-01
 *
 * GET  — list organization members
 * POST — create/provision a new org member
 *
 * Authorization: SUPER_ADMIN / AGENTIK_ADMIN only.
 * Server-side validation — never trust client role/orgId.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import { hasPlatformConsoleAccess } from "@/lib/auth/module-access";
import { listOrgMembers, createOrgMember } from "@/lib/auth/member-admin";
import type { CreateMemberInput } from "@/lib/auth/member-admin";
import type { Role } from "@prisma/client";

// ── GET /api/orgs/[orgSlug]/members ─────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug } = await params;
    const { organization, membership, platformRole } = await requireOrgAccess(orgSlug);

    if (!hasPlatformConsoleAccess(platformRole)) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
    }

    const result = await listOrgMembers(organization.id, membership.role);
    if (!result.ok) {
      return NextResponse.json({ error: result.error, detail: result.detail }, { status: 403 });
    }

    return NextResponse.json({ members: result.data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ORG_NOT_FOUND") return NextResponse.json({ error: msg }, { status: 404 });
    if (msg === "ACCESS_DENIED") return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

// ── POST /api/orgs/[orgSlug]/members ────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  try {
    const { orgSlug } = await params;
    const { organization, membership, platformRole } = await requireOrgAccess(orgSlug);

    if (!hasPlatformConsoleAccess(platformRole)) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 403 });
    }

    const body = await req.json() as Partial<CreateMemberInput>;

    if (!body.email || !body.name || !body.password || !body.role) {
      return NextResponse.json(
        { error: "INVALID_INPUT", detail: "email, name, password, and role are required." },
        { status: 400 },
      );
    }

    const input: CreateMemberInput = {
      email: body.email,
      name: body.name,
      password: body.password,
      role: body.role as Role,
    };

    const result = await createOrgMember(organization.id, membership.role, input);
    if (!result.ok) {
      const status = result.error === "UNAUTHORIZED" ? 403
        : result.error === "CANNOT_GRANT_HIGHER_ROLE" || result.error === "CANNOT_GRANT_INTERNAL_ROLE" ? 403
        : result.error === "EMAIL_ALREADY_EXISTS_IN_ORG" ? 409
        : 400;
      return NextResponse.json({ error: result.error, detail: result.detail }, { status });
    }

    return NextResponse.json({ member: result.data }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "UNKNOWN";
    if (msg === "UNAUTHENTICATED") return NextResponse.json({ error: msg }, { status: 401 });
    if (msg === "ORG_NOT_FOUND") return NextResponse.json({ error: msg }, { status: 404 });
    if (msg === "ACCESS_DENIED") return NextResponse.json({ error: msg }, { status: 403 });
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
