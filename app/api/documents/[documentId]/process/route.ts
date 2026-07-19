import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireOrgMembership } from "@/lib/api/org-auth";
import { processFinancialDocument } from "@/lib/finance/process-document";

export const runtime = "nodejs";

const ALLOWED_ROLES = new Set<Role>([Role.ORG_ADMIN, Role.MANAGER, Role.OPERATOR]);

export async function POST(
  req: NextRequest,
  { params }: { params: { documentId: string } }
) {
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

  try {
    const result = await processFinancialDocument(
      params.documentId,
      organizationId,
      auth.user.id
    );
    return NextResponse.json({ ok: true, result });
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.message === "DOCUMENT_NOT_FOUND") {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }
      if (e.message === "NOT_A_FINANCIAL_DOCUMENT") {
        return NextResponse.json(
          { error: "This document type is not processed by the finance pipeline" },
          { status: 422 }
        );
      }
      if (e.message === "DOCUMENT_ALREADY_REVIEWED") {
        return NextResponse.json(
          { error: "Document has been reviewed and cannot be reprocessed automatically" },
          { status: 409 }
        );
      }
    }
    console.error("[finance/process-document]", e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
