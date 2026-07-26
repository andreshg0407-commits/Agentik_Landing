/**
 * lib/comercial/tiendas/classification-types.ts
 *
 * Types for canonical inventory classification per reference.
 * Used by the classification service, backfill, and needs engine.
 *
 * Sprint: AGENTIK-STORES-INVENTORY-CLASSIFICATION-COMPLETENESS-01
 */

// ── Classification quality ──────────────────────────────────────────────────

export type ClassificationCompleteness =
  | "CONFIRMED"       // all required fields present for this line
  | "PARTIAL"         // some required fields missing, but line is known
  | "UNCLASSIFIED";   // line unknown — cannot participate in replacements

// ── Canonical line ──────────────────────────────────────────────────────────

export type CanonicalNeedLine =
  | "CASTILLITOS"
  | "LATIN_KIDS"
  | "ACCESSORIES"
  | "UNCLASSIFIED";

// ── World ───────────────────────────────────────────────────────────────────

export type ClassificationWorld = "TEXTILE" | "IMPORT" | "UNKNOWN";

// ── Variant ─────────────────────────────────────────────────────────────────

export interface ClassificationVariant {
  size: string | null;
  color: string | null;
  qty: number;
}

// ── Per-reference classification ────────────────────────────────────────────

export interface StoreReferenceClassification {
  reference: string;
  canonicalLine: CanonicalNeedLine;
  world: ClassificationWorld;
  group: string | null;
  subgroup: string | null;
  sizeClass: "small" | "medium" | "large" | null;
  variants: ClassificationVariant[];
  totalQty: number;
  classificationSource: string;
  classificationQuality: ClassificationCompleteness;
  missingFields: string[];
}

// ── Completeness rules per line (SEXTO) ─────────────────────────────────────

/**
 * Returns the list of required fields for a given canonical line.
 * Missing fields = required fields not present.
 */
export function getRequiredFields(line: CanonicalNeedLine, world: ClassificationWorld): string[] {
  switch (line) {
    case "CASTILLITOS":
      // Castillitos uses SAME_GROUP_AND_SUBGROUP matching
      return ["canonicalLine", "group", "subgroup"];
    case "LATIN_KIDS":
      // Latin Kids uses SAME_SUBGROUP matching — group not required
      return ["canonicalLine", "subgroup"];
    case "ACCESSORIES":
      // Accessories uses SAME_SIZE_CLASS matching — sizeClass required
      return ["canonicalLine", "sizeClass"];
    case "UNCLASSIFIED":
      return ["canonicalLine"];
  }
}

/**
 * Evaluate classification completeness for a reference.
 */
export function evaluateCompleteness(
  line: CanonicalNeedLine,
  world: ClassificationWorld,
  fields: {
    canonicalLine: boolean;
    group: boolean;
    subgroup: boolean;
    sizeClass: boolean;
  },
): { quality: ClassificationCompleteness; missingFields: string[] } {
  const required = getRequiredFields(line, world);
  const missing: string[] = [];

  for (const field of required) {
    switch (field) {
      case "canonicalLine": if (!fields.canonicalLine) missing.push("canonicalLine"); break;
      case "group": if (!fields.group) missing.push("group"); break;
      case "subgroup": if (!fields.subgroup) missing.push("subgroup"); break;
      case "sizeClass": if (!fields.sizeClass) missing.push("sizeClass"); break;
    }
  }

  if (!fields.canonicalLine) return { quality: "UNCLASSIFIED", missingFields: missing };
  if (missing.length === 0) return { quality: "CONFIRMED", missingFields: [] };
  return { quality: "PARTIAL", missingFields: missing };
}
