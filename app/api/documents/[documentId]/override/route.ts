import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireOrgMembership } from "@/lib/api/org-auth";
import { applyDocumentOverrides, type OverrideFields } from "@/lib/finance/override-document";

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

  // Extract the 12 overrideable fields from the body.
  // Undefined means "not included in this request" — pass-through as-is.
  const overrides: OverrideFields = {};
  const STRING_FIELDS = [
    "issuerName", "issuerId", "receiverName", "receiverId",
    "documentDate", "currency", "invoiceNumber", "dueDate", "cufe",
  ] as const;
  const NUMBER_FIELDS = ["totalAmount", "subtotal", "taxAmount"] as const;

  for (const key of STRING_FIELDS) {
    if (key in body) {
      const v = body[key];
      overrides[key] = v === "" ? null : (typeof v === "string" ? v.trim() : null);
    }
  }
  for (const key of NUMBER_FIELDS) {
    if (key in body) {
      const v = body[key];
      overrides[key] = v === "" || v === null ? null : Number(v);
    }
  }

  if (Object.keys(overrides).length === 0) {
    return NextResponse.json({ error: "No fields to override" }, { status: 400 });
  }

  try {
    const result = await applyDocumentOverrides(
      params.documentId,
      organizationId,
      auth.user.id,
      overrides
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "DOCUMENT_NOT_FOUND") {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    console.error("[documents/override]", e);
    return NextResponse.json({ error: "Override failed" }, { status: 500 });
  }
}
