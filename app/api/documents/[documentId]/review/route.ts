import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireOrgMembership } from "@/lib/api/org-auth";
import { reviewDocument } from "@/lib/finance/review-document";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set<Role>([Role.ORG_ADMIN, Role.MANAGER, Role.OPERATOR]);

export async function POST(
  req: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const body = await req.json().catch(() => null);
  const organizationId: string | undefined = body?.organizationId;

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

  try {
    const result = await reviewDocument(params.documentId, organizationId, auth.user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.message === "DOCUMENT_NOT_FOUND") {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }
      if (e.message === "ALREADY_REVIEWED") {
        return NextResponse.json({ error: "Document is already reviewed" }, { status: 409 });
      }
      if (e.message === "NOT_VALID") {
        return NextResponse.json(
          { error: "Document must have VALID validation status before it can be reviewed" },
          { status: 422 }
        );
      }
    }
    console.error("[documents/review]", e);
    return NextResponse.json({ error: "Review failed" }, { status: 500 });
  }
}
