/**
 * lib/marketing-studio/bulk-import/asset-role-mapper.ts
 *
 * MARKETING-STUDIO-BULK-IMPORT-01
 *
 * Rule engine for classifying image filenames into ProductAssetLink roles.
 *
 * ── Rules (applied in order, first match wins) ───────────────────────────────
 *   hero     — front, frontal, principal, hero, main, cover, portada
 *   raw_back — back, trasera, rear, posterior, atras
 *   raw_detail — detail, detalle, zoom, close, closeup, acercamiento
 *   video    — .mp4, .mov extensions OR "video" in name
 *   document — .pdf extension OR "ficha", "tech", "documento" in name
 *   gallery  — everything else (safe default)
 *
 * ── Extension note ────────────────────────────────────────────────────────────
 *   New rules can be added to ROLE_RULES without touching the classifier function.
 *   Order matters — more specific rules must come before generic ones.
 */

export type DetectedRole =
  | "hero"
  | "raw_back"
  | "raw_detail"
  | "gallery"
  | "video"
  | "document";

interface RoleRule {
  role:     DetectedRole;
  /** Match against normalized filename (lowercased, no extension) */
  patterns: RegExp[];
  /** Match against file extension (lowercased, with dot) */
  extensions?: string[];
}

const ROLE_RULES: RoleRule[] = [
  // ── Documents ──────────────────────────────────────────────────────────────
  {
    role:       "document",
    patterns:   [/ficha/, /techn/, /document/, /spec/, /catalogo/, /catalogue/],
    extensions: [".pdf"],
  },
  // ── Videos ─────────────────────────────────────────────────────────────────
  {
    role:       "video",
    patterns:   [/^vid/, /video/, /reel/, /clip/],
    extensions: [".mp4", ".mov", ".avi", ".webm"],
  },
  // ── Hero (primary/front image) ─────────────────────────────────────────────
  {
    role: "hero",
    patterns: [
      /^front/, /^frontal/, /^principal/, /^hero/, /^main/, /^cover/,
      /^portada/, /^primary/, /^1$/, /^\d{0,2}front/, /^0+1/,
    ],
  },
  // ── Back view ─────────────────────────────────────────────────────────────
  {
    role: "raw_back",
    patterns: [
      /back/, /trasera/, /rear/, /posterior/, /atras/, /espalda/, /behind/,
    ],
  },
  // ── Detail / zoom ─────────────────────────────────────────────────────────
  {
    role: "raw_detail",
    patterns: [
      /detail/, /detalle/, /zoom/, /close/, /acercamiento/, /textura/, /texture/,
    ],
  },
  // ── Gallery (catch-all) — must be last ────────────────────────────────────
  {
    role:     "gallery",
    patterns: [/.*/],
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * classifyAssetRole — returns the DetectedRole for a given filename.
 *
 * Algorithm:
 *   1. Normalize filename: lowercase, strip extension.
 *   2. For each rule in order: test extension match first, then pattern match.
 *   3. Return role of first matching rule.
 */
export function classifyAssetRole(fileName: string): DetectedRole {
  const dotIdx    = fileName.lastIndexOf(".");
  const ext       = dotIdx !== -1 ? fileName.slice(dotIdx).toLowerCase() : "";
  const baseName  = dotIdx !== -1 ? fileName.slice(0, dotIdx).toLowerCase() : fileName.toLowerCase();
  // Strip common numbering prefixes/suffixes for pattern matching
  const normalized = baseName.replace(/[_\-\s]+/g, "_").replace(/[^a-z0-9_]/g, "");

  for (const rule of ROLE_RULES) {
    // Extension match (any extension in the rule's list)
    if (rule.extensions && rule.extensions.includes(ext)) {
      return rule.role;
    }
    // Pattern match on normalized base name
    if (rule.patterns.some(p => p.test(normalized))) {
      return rule.role;
    }
  }

  return "gallery";
}

/**
 * isImportableFile — returns true for file types accepted by the import flow.
 * Mirrors the ALLOWED_MIMES in the assets upload route.
 */
export function isImportableFile(fileName: string): boolean {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  return IMPORTABLE_EXTENSIONS.has(ext);
}

export const IMPORTABLE_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp",
  ".mp4", ".mov",
  ".pdf",
]);

export const IMPORTABLE_MIMES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "video/mp4", "video/quicktime",
  "application/pdf",
]);

/**
 * mimeFromExtension — returns MIME type from file extension for zip-extracted files.
 */
export function mimeFromExtension(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const map: Record<string, string> = {
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".webp": "image/webp",
    ".mp4":  "video/mp4",
    ".mov":  "video/quicktime",
    ".pdf":  "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}

/** Returns all role rules — used by the wizard to display the mapping table */
export function getRoleRulesSummary(): { role: DetectedRole; examples: string[] }[] {
  return [
    { role: "hero",       examples: ["frontal.jpg", "front.jpg", "hero.jpg", "principal.jpg", "main.jpg"] },
    { role: "raw_back",   examples: ["trasera.jpg", "back.jpg", "rear.jpg", "posterior.jpg"] },
    { role: "raw_detail", examples: ["detalle.jpg", "detail.jpg", "zoom.jpg", "closeup.jpg"] },
    { role: "video",      examples: ["video.mp4", "reel.mov", "clip.mp4"] },
    { role: "document",   examples: ["ficha.pdf", "documento.pdf", "catalogo.pdf"] },
    { role: "gallery",    examples: ["imagen2.jpg", "extra1.jpg", "photo.jpg", "(todo lo demás)"] },
  ];
}
