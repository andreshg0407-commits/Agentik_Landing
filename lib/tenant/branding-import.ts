/**
 * lib/tenant/branding-import.ts
 *
 * Server-side branding asset upload + AI extraction service.
 *
 * Handles:
 *   1. Upload logos (PNG/JPG/SVG/WebP) and brand manuals (PDF) to R2
 *   2. Extract branding data from uploaded PDF via AI Layer
 *   3. Return extracted fields for user review before saving
 *
 * Sprint: TENANT-BRANDING-IMPORT-01
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { BrandingUpsertInput } from "./branding";

// ── R2 Env ──────────────────────────────────────────────────────────────────

function getEnv() {
  const accountId       = process.env.R2_ACCOUNT_ID        ?? "";
  const accessKeyId     = process.env.R2_ACCESS_KEY_ID     ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? "";
  const bucket          = process.env.R2_BUCKET            ?? "";
  const publicBaseUrl   = (process.env.R2_PUBLIC_BASE_URL  ?? "").replace(/\/+$/, "");
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

function getClient(env: ReturnType<typeof getEnv>): S3Client {
  if (!env.accountId || !env.accessKeyId || !env.secretAccessKey) {
    throw new Error("Missing R2 credentials");
  }
  return new S3Client({
    region:   "auto",
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.accessKeyId, secretAccessKey: env.secretAccessKey },
  });
}

// ── MIME handling ────────────────────────────────────────────────────────────

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg":      "jpg",
  "image/jpg":       "jpg",
  "image/png":       "png",
  "image/webp":      "webp",
  "image/svg+xml":   "svg",
  "application/pdf": "pdf",
};

const LOGO_MIMES  = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/svg+xml"]);
const PDF_MIMES   = new Set(["application/pdf"]);
const ALL_ALLOWED = new Set([...LOGO_MIMES, ...PDF_MIMES]);

export function isAllowedMime(mime: string): boolean {
  return ALL_ALLOWED.has(mime.toLowerCase());
}
export function isLogoMime(mime: string): boolean {
  return LOGO_MIMES.has(mime.toLowerCase());
}
export function isPdfMime(mime: string): boolean {
  return PDF_MIMES.has(mime.toLowerCase());
}

// ── Upload result ───────────────────────────────────────────────────────────

export interface BrandingUploadResult {
  url:      string;
  key:      string;
  bytes:    number;
  mimeType: string;
  role:     "logo" | "logo_dark" | "logo_mono" | "brand_manual";
}

// ── Upload a branding asset to R2 ───────────────────────────────────────────

export async function uploadBrandingAsset(input: {
  buffer:   Buffer;
  mimeType: string;
  fileName: string;
  orgSlug:  string;
  role:     "logo" | "logo_dark" | "logo_mono" | "brand_manual";
}): Promise<BrandingUploadResult> {
  const env = getEnv();
  if (!env.bucket) throw new Error("Missing R2_BUCKET");
  if (!env.publicBaseUrl) throw new Error("Missing R2_PUBLIC_BASE_URL");

  const maxBytes = Number(process.env.MAX_UPLOAD_MB ?? 20) * 1024 * 1024;
  if (input.buffer.byteLength > maxBytes) {
    throw new Error(`Archivo muy grande: ${(input.buffer.byteLength / 1024 / 1024).toFixed(1)} MB (max ${process.env.MAX_UPLOAD_MB ?? 20} MB)`);
  }

  const s3    = getClient(env);
  const now   = new Date();
  const yyyy  = String(now.getUTCFullYear());
  const mm    = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext   = MIME_TO_EXT[input.mimeType.toLowerCase()] ?? input.fileName.split(".").pop()?.toLowerCase() ?? "bin";
  const uuid  = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const safe  = input.orgSlug.replace(/[^a-zA-Z0-9_-]/g, "_");

  const key = `branding/${safe}/${yyyy}/${mm}/${input.role}-${uuid}.${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket:       env.bucket,
    Key:          key,
    Body:         input.buffer,
    ContentType:  input.mimeType,
    CacheControl: "public, max-age=31536000, immutable",
  }));

  return {
    url:      `${env.publicBaseUrl}/${key}`,
    key,
    bytes:    input.buffer.byteLength,
    mimeType: input.mimeType,
    role:     input.role,
  };
}

// ── AI extraction from brand manual ─────────────────────────────────────────

export interface BrandingExtraction {
  commercialName?: string;
  legalName?: string;
  taxId?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  website?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  documentFooter?: string;
  socialInstagram?: string;
  socialFacebook?: string;
  socialWhatsapp?: string;
  fonts?: string[];
  logoUsageNotes?: string;
  confidence: "high" | "medium" | "low";
}

const EXTRACTION_SYSTEM_PROMPT = `You are a brand identity extraction specialist. The user will provide text extracted from a brand manual PDF.

Extract the following fields if present. Return ONLY a JSON object with these keys:

{
  "commercialName": "...",
  "legalName": "...",
  "taxId": "...",
  "address": "...",
  "city": "...",
  "country": "...",
  "phone": "...",
  "email": "...",
  "website": "...",
  "primaryColor": "#XXXXXX",
  "secondaryColor": "#XXXXXX",
  "accentColor": "#XXXXXX",
  "documentFooter": "...",
  "socialInstagram": "...",
  "socialFacebook": "...",
  "socialWhatsapp": "...",
  "fonts": ["Font Name 1", "Font Name 2"],
  "logoUsageNotes": "Brief summary of logo usage rules",
  "confidence": "high" | "medium" | "low"
}

Rules:
- Colors MUST be hex format (#XXXXXX). If RGB values given, convert to hex.
- If a field is not found, omit it entirely (do not include null or empty string).
- confidence: "high" = found explicit values, "medium" = inferred from context, "low" = guessed or sparse data.
- Do not invent data. Only extract what is explicitly stated.
- For documentFooter, compose a professional footer using the company info found.`;

/**
 * Extract branding data from PDF text content using AI Layer.
 * Returns extracted fields for user review before applying.
 */
export async function extractBrandingFromText(
  pdfText: string,
  orgSlug: string,
): Promise<BrandingExtraction> {
  // Dynamic import to keep this file loadable in contexts where ai-layer isn't available
  const { aiLayerService } = await import("@/lib/ai-layer/server");

  const response = await aiLayerService.generate({
    callerModule: "tenant-branding",
    orgSlug,
    requiredCapabilities: ["TEXT_GENERATION", "JSON_OUTPUT"],
    routingStrategy: "BEST_QUALITY",
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    userPrompt: `Extract branding identity from this brand manual content:\n\n${pdfText.slice(0, 30000)}`,
    jsonMode: true,
    temperature: 0,
    maxOutputTokens: 2000,
    metadata: { purpose: "branding-extraction" },
  });

  if (!response.success || !response.parsedJson) {
    return { confidence: "low" };
  }

  const raw = response.parsedJson as Record<string, unknown>;
  const result: BrandingExtraction = { confidence: "medium" };

  // Map known fields, validating types
  const stringFields = [
    "commercialName", "legalName", "taxId", "address", "city", "country",
    "phone", "email", "website", "primaryColor", "secondaryColor", "accentColor",
    "documentFooter", "socialInstagram", "socialFacebook", "socialWhatsapp",
    "logoUsageNotes",
  ] as const;

  for (const f of stringFields) {
    if (typeof raw[f] === "string" && (raw[f] as string).length > 0) {
      (result as any)[f] = raw[f];
    }
  }

  // Validate color fields
  const hexRe = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  for (const c of ["primaryColor", "secondaryColor", "accentColor"] as const) {
    if (result[c] && !hexRe.test(result[c]!)) {
      delete result[c];
    }
  }

  if (Array.isArray(raw.fonts)) {
    result.fonts = raw.fonts.filter((f): f is string => typeof f === "string");
  }

  if (raw.confidence === "high" || raw.confidence === "medium" || raw.confidence === "low") {
    result.confidence = raw.confidence;
  }

  return result;
}

/**
 * Convert extraction result to BrandingUpsertInput (only non-empty fields).
 */
export function extractionToUpsertInput(
  extraction: BrandingExtraction,
  logoUrls?: { logoUrl?: string; logoDarkUrl?: string; logoMonoUrl?: string },
): BrandingUpsertInput {
  const input: BrandingUpsertInput = {};

  const fields = [
    "commercialName", "legalName", "taxId", "address", "city", "country",
    "phone", "email", "website", "primaryColor", "secondaryColor", "accentColor",
    "documentFooter", "socialInstagram", "socialFacebook", "socialWhatsapp",
  ] as const;

  for (const f of fields) {
    const val = extraction[f];
    if (typeof val === "string" && val.length > 0) {
      (input as any)[f] = val;
    }
  }

  if (logoUrls?.logoUrl) input.logoUrl = logoUrls.logoUrl;
  if (logoUrls?.logoDarkUrl) input.logoDarkUrl = logoUrls.logoDarkUrl;
  if (logoUrls?.logoMonoUrl) input.logoMonoUrl = logoUrls.logoMonoUrl;

  return input;
}
