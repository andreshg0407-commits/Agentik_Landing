/**
 * POST /api/orgs/[orgSlug]/branding/import
 *
 * Multipart FormData endpoint for uploading brand assets and
 * extracting identity from brand manuals via AI.
 *
 * Fields:
 *   logo         — File (PNG/JPG/SVG/WebP) — main logo
 *   logo_dark    — File — dark variant
 *   logo_mono    — File — monochrome variant
 *   brand_manual — File (PDF) — brand identity manual
 *
 * Response:
 *   { uploads: BrandingUploadResult[], extraction: BrandingExtraction | null }
 *
 * Sprint: TENANT-BRANDING-IMPORT-01
 */

import { NextRequest, NextResponse } from "next/server";
import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  uploadBrandingAsset,
  isAllowedMime,
  isLogoMime,
  isPdfMime,
  extractBrandingFromText,
  type BrandingUploadResult,
  type BrandingExtraction,
} from "@/lib/tenant/branding-import";

const ROLES = ["logo", "logo_dark", "logo_mono", "brand_manual"] as const;
type AssetRole = typeof ROLES[number];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ orgSlug: string }> },
) {
  const { orgSlug } = await params;
  await requireOrgAccess(orgSlug);

  const formData = await req.formData();

  const uploads: BrandingUploadResult[] = [];
  const errors: { field: string; error: string }[] = [];
  let pdfText: string | null = null;

  for (const role of ROLES) {
    const file = formData.get(role) as File | null;
    if (!file || file.size === 0) continue;

    const mime = file.type.toLowerCase();

    // Validate MIME
    if (!isAllowedMime(mime)) {
      errors.push({ field: role, error: `Tipo de archivo no permitido: ${mime}` });
      continue;
    }

    // Logos must be images, brand_manual must be PDF
    if (role === "brand_manual" && !isPdfMime(mime)) {
      errors.push({ field: role, error: "El manual de marca debe ser PDF" });
      continue;
    }
    if (role !== "brand_manual" && !isLogoMime(mime)) {
      errors.push({ field: role, error: "Los logos deben ser imagen (PNG, JPG, SVG, WebP)" });
      continue;
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());

      // Upload to R2
      const result = await uploadBrandingAsset({
        buffer,
        mimeType: mime,
        fileName: file.name,
        orgSlug,
        role,
      });
      uploads.push(result);

      // Extract text from PDF for AI analysis
      if (role === "brand_manual") {
        pdfText = extractTextFromPdfBuffer(buffer);
      }
    } catch (e: any) {
      errors.push({ field: role, error: e.message ?? "Error al subir archivo" });
    }
  }

  // AI extraction from brand manual
  let extraction: BrandingExtraction | null = null;
  if (pdfText && pdfText.length > 50) {
    try {
      extraction = await extractBrandingFromText(pdfText, orgSlug);
    } catch {
      // AI extraction failed — non-blocking, user can fill manually
    }
  }

  if (errors.length > 0 && uploads.length === 0) {
    return NextResponse.json({ uploads, extraction, errors }, { status: 422 });
  }

  return NextResponse.json({ uploads, extraction, errors });
}

// ── Lightweight PDF text extraction ─────────────────────────────────────────

/**
 * Extracts readable text from a PDF buffer using a simple stream-based parser.
 * No external dependencies — works with most text-based PDFs.
 * For image-heavy PDFs, returns whatever text is embedded.
 */
function extractTextFromPdfBuffer(buffer: Buffer): string {
  const content = buffer.toString("latin1");
  const texts: string[] = [];

  // Extract text between BT (Begin Text) and ET (End Text) operators
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match: RegExpExecArray | null;

  while ((match = btEtRegex.exec(content)) !== null) {
    const block = match[1];

    // Extract text from Tj, TJ, and ' operators
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch: RegExpExecArray | null;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      texts.push(decodePdfString(tjMatch[1]));
    }

    // TJ arrays: [(text1) kerning (text2) ...]
    const tjArrayRegex = /\[((?:\([^)]*\)|[^[\]])*)\]\s*TJ/g;
    let arrMatch: RegExpExecArray | null;
    while ((arrMatch = tjArrayRegex.exec(block)) !== null) {
      const inner = arrMatch[1];
      const parts = /\(([^)]*)\)/g;
      let p: RegExpExecArray | null;
      while ((p = parts.exec(inner)) !== null) {
        texts.push(decodePdfString(p[1]));
      }
    }
  }

  // Also try to extract from stream objects (for compressed text)
  const streamRegex = /stream\r?\n([\s\S]*?)endstream/g;
  while ((match = streamRegex.exec(content)) !== null) {
    const streamContent = match[1];
    // Look for readable ASCII sequences
    const readable = streamContent.replace(/[^\x20-\x7E\n\r]/g, " ").replace(/\s{3,}/g, " ").trim();
    if (readable.length > 20) {
      // Check if it looks like actual text (has word-like patterns)
      const wordCount = readable.split(/\s+/).filter(w => w.length > 2 && /[a-zA-Z]/.test(w)).length;
      if (wordCount > 5) {
        texts.push(readable);
      }
    }
  }

  return texts.join(" ").replace(/\s+/g, " ").trim();
}

function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}
