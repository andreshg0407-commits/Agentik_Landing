import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireOrgMembership } from "@/lib/api/org-auth";
import { indexDocumentAsKnowledge } from "@/lib/documents/knowledge-actions";

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
    const knowledgeItem = await indexDocumentAsKnowledge(
      params.documentId,
      organizationId,
      auth.user.id
    );
    return NextResponse.json({ ok: true, knowledgeItem });
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.message === "DOCUMENT_NOT_FOUND") {
        return NextResponse.json({ error: "Document not found" }, { status: 404 });
      }
      if (e.message === "NO_USABLE_CONTENT") {
        return NextResponse.json(
          { error: "Document has no usable content to index (add a description)" },
          { status: 422 }
        );
      }
    }
    console.error("indexDocumentAsKnowledge failed:", e);
    return NextResponse.json({ error: "Failed to index document" }, { status: 500 });
  }
}
