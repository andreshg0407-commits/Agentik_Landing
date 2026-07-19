import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { DocumentType } from "@prisma/client";
import { requireOrgMembership } from "@/lib/api/org-auth";
import { createDocument } from "@/lib/documents/actions";

// ── Config ────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

/** Max accepted file size (10 MB). */
const MAX_BYTES = 10 * 1024 * 1024;

/** MIME types accepted. Others are rejected before writing to disk. */
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "text/xml",
  "application/xml",
  "text/plain",
  "image/jpeg",
  "image/png",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
]);

// ── Type inference ────────────────────────────────────────────────────────────

/**
 * Infers a DocumentType from filename keywords and MIME type.
 * Priority: filename keywords > MIME type > default PDF.
 */
function inferDocumentType(filename: string, mimeType: string): DocumentType {
  const lower = filename.toLowerCase();

  if (/factura|invoice|cfdi|comprobante/.test(lower)) {
    return mimeType.includes("xml") ? "XML" : "COMMERCIAL_DOCUMENT";
  }
  if (/extracto|estado.?de.?cuenta|bank.?statement|bancario/.test(lower)) {
    return "BANK_STATEMENT";
  }
  if (/declaraci[oó]n|tributar|impuesto|dian|tax/.test(lower)) {
    return "TAX_DOCUMENT";
  }
  if (/soporte|voucher|contable|accounting/.test(lower)) {
    return "ACCOUNTING_SUPPORT";
  }
  if (/contrato|orden.?de.?compra|purchase.?order|remisi[oó]n/.test(lower)) {
    return "COMMERCIAL_DOCUMENT";
  }
  if (mimeType === "text/xml" || mimeType === "application/xml") return "XML";
  if (mimeType === "application/pdf") return "PDF";

  return "PDF"; // safe default for financial documents
}

/** Removes path traversal characters and limits length. */
function sanitizeFilename(name: string): string {
  return name
    .replace(/[^\w.\-]/g, "_")  // keep word chars, dot, dash
    .replace(/\.{2,}/g, "_")    // collapse consecutive dots
    .slice(0, 200);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file           = formData.get("file") as File | null;
  const organizationId = formData.get("organizationId") as string | null;
  const description    = (formData.get("description") as string | null)?.trim() || null;
  const typeOverride   = formData.get("type") as string | null;
  const workspaceId    = (formData.get("workspaceId") as string | null) || null;
  const projectId      = (formData.get("projectId")   as string | null) || null;

  if (!file || !file.name) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!organizationId) {
    return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File exceeds the ${MAX_BYTES / 1024 / 1024} MB limit` },
      { status: 413 }
    );
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json(
      { error: `File type not allowed: ${mimeType}` },
      { status: 415 }
    );
  }

  // Auth
  const auth = await requireOrgMembership(organizationId);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Resolve document type
  const docType: DocumentType =
    typeOverride && Object.values(DocumentType).includes(typeOverride as DocumentType)
      ? (typeOverride as DocumentType)
      : inferDocumentType(file.name, mimeType);

  // Write file to public/uploads/
  // NOTE: local filesystem only — replace with R2/S3 for production.
  const sanitized  = sanitizeFilename(file.name);
  const uniqueName = `${randomUUID()}-${sanitized}`;
  const uploadDir  = join(process.cwd(), "public", "uploads");
  const filePath   = join(uploadDir, uniqueName);

  await mkdir(uploadDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  try {
    const document = await createDocument(
      {
        organizationId,
        workspaceId,
        projectId,
        type:        docType,
        title:       file.name,          // original filename as title — user can rename later
        description,
        file: {
          name:      file.name,
          url:       `/uploads/${uniqueName}`, // served by Next.js static file handler
          mimeType,
          sizeBytes: file.size,
        },
      },
      auth.user.id
    );

    return NextResponse.json({ ok: true, document }, { status: 201 });
  } catch (e) {
    // Remove the uploaded file if document creation fails to avoid orphans
    await unlink(filePath).catch(() => {});
    const message = e instanceof Error ? e.message : String(e);
    console.error("[documents/upload]", message);
    return NextResponse.json(
      { error: "Failed to create document", detail: message },
      { status: 500 }
    );
  }
}
