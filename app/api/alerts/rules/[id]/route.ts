/**
 * PATCH /api/alerts/rules/[id]
 *
 * Toggle an alert rule's status between ACTIVE and PAUSED.
 * Body: { organizationId: string; status: "ACTIVE" | "PAUSED" }
 *
 * Scoped to the organization — prevents cross-org mutation.
 * No new business logic: only flips RuleStatus in the Rule model.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgMembership }       from "@/lib/api/org-auth";
import { prisma }                     from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await req.json().catch(() => null);
  const { organizationId, status } = body ?? {};

  if (!organizationId || !["ACTIVE", "PAUSED"].includes(status)) {
    return NextResponse.json(
      { error: "organizationId and status (ACTIVE|PAUSED) are required" },
      { status: 400 },
    );
  }

  const auth = await requireOrgMembership(organizationId);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify rule belongs to this org before mutating
  const rule = await prisma.rule.findFirst({
    where: { id: params.id, organizationId },
    select: { id: true },
  });

  if (!rule) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  const updated = await prisma.rule.update({
    where: { id: params.id },
    data:  { status },
    select: { id: true, status: true },
  });

  return NextResponse.json({ ok: true, rule: updated });
}
