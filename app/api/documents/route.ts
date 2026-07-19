import { NextRequest, NextResponse } from "next/server";
import { DocumentType } from "@prisma/client";
import { requireOrgMembership } from "@/lib/api/org-auth";
import { createDocument } from "@/lib/documents/actions";

export const runtime = "nodejs";

const VALID_TYPES = new Set<string>(Object.values(DocumentType));

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { organizationId, workspaceId, projectId, type, title, description, file } = body;

  if (!organizationId || !type || !title) {
    return NextResponse.json(
      { error: "organizationId, type, and title are required" },
      { status: 400 }
    );
  }

  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }

  const auth = await requireOrgMembership(organizationId);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const document = await createDocument(
      {
        organizationId,
        workspaceId: workspaceId ?? null,
        projectId: projectId ?? null,
        type: type as DocumentType,
        title,
        description: description ?? null,
        file: file ?? null,
      },
      auth.user.id
    );

    return NextResponse.json({ ok: true, document }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("createDocument failed:", message);
    return NextResponse.json(
      { error: "Failed to create document", detail: message },
      { status: 500 }
    );
  }
}
