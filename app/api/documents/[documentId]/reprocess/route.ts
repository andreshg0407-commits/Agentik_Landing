import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireOrgMembership } from "@/lib/api/org-auth";
import { reprocessDocument, type ReprocessMode } from "@/lib/finance/reprocess-document";

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
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED_ROLES.has(auth.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Caller may explicitly pass mode; if not, the decision is made here based
  // on whether the document has operator overrides (read by the service).
  // The client sends hasOverrides so the server doesn't need an extra DB read.
  const hasOverrides: boolean = body?.hasOverrides === true;
  const explicitMode: ReprocessMode | undefined =
    body?.mode === "full" || body?.mode === "validation-only"
      ? body.mode
      : undefined;

  const mode: ReprocessMode = explicitMode ?? (hasOverrides ? "validation-only" : "full");

  try {
    const result = await reprocessDocument(params.documentId, organizationId, auth.user.id, mode);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.message === "DOCUMENT_NOT_FOUND") {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }
      if (e.message === "DOCUMENT_ALREADY_REVIEWED") {
        return NextResponse.json(
          { error: "Reviewed documents cannot be reprocessed. Remove the reviewed status first." },
          { status: 409 }
        );
      }
      if (e.message === "NOT_A_FINANCIAL_DOCUMENT") {
        return NextResponse.json(
          { error: "This document type is not processed by the finance pipeline" },
          { status: 422 }
        );
      }
    }
    console.error("[documents/reprocess]", e);
    return NextResponse.json({ error: "Reprocess failed" }, { status: 500 });
  }
}
