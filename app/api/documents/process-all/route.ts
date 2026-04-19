import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireOrgMembership } from "@/lib/api/org-auth";
import { processAllPendingFinancialDocuments } from "@/lib/finance/process-document";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set<Role>([Role.ORG_ADMIN, Role.MANAGER, Role.OPERATOR]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const organizationId = body?.organizationId;

  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }

  const auth = await requireOrgMembership(organizationId);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!ALLOWED_ROLES.has(auth.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await processAllPendingFinancialDocuments(organizationId, auth.user.id);

  return NextResponse.json({ ok: true, result });
}
