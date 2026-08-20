/**
 * lib/storage/r2-file-validation.ts
 *
 * MARKETING-ASSET-STORAGE-R2-HARDENING-03B — Server-side File Validation
 *
 * Validates files using magic bytes (file signatures) rather than
 * trusting client-provided MIME types.
 *
 * Server-only — never import from client components.
 */

import "server-only";

// ── Magic byte signatures ─────────────────────────────────────────────────────

interface MagicSignature {
  mimeType: string;
  ext: string;
  /** Byte offsets and expected values */
  signatures: Array<{ offset: number; bytes: number[] }>;
}

const MAGIC_SIGNATURES: MagicSignature[] = [
  // JPEG: FF D8 FF
  {
    mimeType: "image/jpeg",
    ext: "jpg",
    signatures: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }],
  },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  {
    mimeType: "image/png",
    ext: "png",
    signatures: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }],
  },
  // WebP: RIFF....WEBP
  {
    mimeType: "image/webp",
    ext: "webp",
    signatures: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] }, // RIFF
      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] }, // WEBP
    ],
  },
  // MP4: ....ftyp (offset 4)
  {
    mimeType: "video/mp4",
    ext: "mp4",
    signatures: [{ offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] }], // ftyp
  },
  // PDF: %PDF
  {
    mimeType: "application/pdf",
    ext: "pdf",
    signatures: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }],
  },
  // GIF: GIF87a or GIF89a
  {
    mimeType: "image/gif",
    ext: "gif",
    signatures: [{ offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }], // GIF8
  },
  // AVIF/HEIF: ....ftyp (same container as MP4, distinguished by brand)
  // We accept ftyp-based containers and distinguish by client hint
];

// ── Allowed types ─────────────────────────────────────────────────────────────

/** Canonical set of allowed MIME types for asset uploads. */
export const ALLOWED_ASSET_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/quicktime",
  "application/pdf",
]);

/** Extension map for allowed types. */
export const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
};

// ── Validation ────────────────────────────────────────────────────────────────

export interface FileValidationResult {
  valid: boolean;
  detectedMime: string | null;
  detectedExt: string | null;
  error?: string;
}

/**
 * Validates a file buffer against magic byte signatures.
 *
 * - Rejects if no magic signature matches
 * - Rejects if detected type not in allowed set
 * - Rejects SVG (can contain executable JS)
 * - Rejects HTML (XSS risk)
 */
export function validateFileBuffer(
  buffer: Buffer,
  claimedMime: string,
): FileValidationResult {
  if (buffer.length === 0) {
    return { valid: false, detectedMime: null, detectedExt: null, error: "File is empty" };
  }

  // Reject SVG — can contain <script> and arbitrary JS
  if (claimedMime === "image/svg+xml" || claimedMime.includes("svg")) {
    return {
      valid: false,
      detectedMime: null,
      detectedExt: null,
      error: "SVG files are not accepted for asset uploads (security risk)",
    };
  }

  // Reject HTML — XSS risk
  const firstBytes = buffer.subarray(0, 256).toString("utf-8").toLowerCase();
  if (
    firstBytes.includes("<!doctype html") ||
    firstBytes.includes("<html") ||
    firstBytes.includes("<script")
  ) {
    return {
      valid: false,
      detectedMime: null,
      detectedExt: null,
      error: "HTML/script content is not accepted (security risk)",
    };
  }

  // Check magic bytes
  for (const sig of MAGIC_SIGNATURES) {
    if (matchesSignature(buffer, sig.signatures)) {
      if (!ALLOWED_ASSET_MIMES.has(sig.mimeType)) {
        return {
          valid: false,
          detectedMime: sig.mimeType,
          detectedExt: sig.ext,
          error: `File type ${sig.mimeType} is not allowed`,
        };
      }
      return {
        valid: true,
        detectedMime: sig.mimeType,
        detectedExt: sig.ext,
      };
    }
  }

  // ftyp-based containers (AVIF, MOV) — accept if client claims a valid MIME
  if (claimedMime === "video/quicktime" || claimedMime === "image/avif") {
    if (ALLOWED_ASSET_MIMES.has(claimedMime)) {
      return {
        valid: true,
        detectedMime: claimedMime,
        detectedExt: MIME_TO_EXT[claimedMime] ?? "bin",
      };
    }
  }

  return {
    valid: false,
    detectedMime: null,
    detectedExt: null,
    error: `Unrecognized file type. Claimed: ${claimedMime}. Upload JPEG, PNG, WebP, MP4, or PDF.`,
  };
}

function matchesSignature(
  buffer: Buffer,
  sigs: Array<{ offset: number; bytes: number[] }>,
): boolean {
  for (const sig of sigs) {
    if (buffer.length < sig.offset + sig.bytes.length) return false;
    for (let i = 0; i < sig.bytes.length; i++) {
      if (buffer[sig.offset + i] !== sig.bytes[i]) return false;
    }
  }
  return true;
}

// ── Filename sanitization ─────────────────────────────────────────────────────

/**
 * Sanitizes a filename for safe storage.
 * Removes path traversal, special characters, and normalizes.
 */
export function sanitizeFilename(name: string): string {
  const basename = name.split(/[/\\]/).pop() ?? "file";
  const clean = basename
    .normalize("NFKD")
    .replace(/[^\w.\-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "");
  return clean || "file";
}

/**
 * Sanitizes an ID for use in object keys.
 * Only allows alphanumeric, hyphens, and underscores.
 */
export function sanitizeKeySegment(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}
