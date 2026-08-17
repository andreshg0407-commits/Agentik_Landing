/**
 * lib/comercial/clientes/document-source-profiles.ts
 *
 * MULTITENANT-SOURCE-GOVERNANCE-03A8A
 *
 * Multi-tenant document classification via canonical document kinds
 * resolved per-organization source profile using k_sc_codigo_fuente.
 *
 * Rules:
 *   - Each organization has a source profile mapping document prefixes → canonical kinds
 *   - Unknown profile or unknown code → UNKNOWN_DOCUMENT (fail-closed)
 *   - No cross-contamination between tenant profiles
 *   - Canonical kinds are organization-agnostic semantic labels
 *
 * Pure module — NO server-only, NO Prisma, NO infrastructure dependencies.
 */

// ── Collection target classification ────────────────────────────────────────

export type CollectionTarget =
  | "OFFICIAL_INVOICE"
  | "REMISSION"
  | "CUSTOMER_ADVANCE"
  | "UNCLASSIFIED";

// ── Canonical document kinds ─────────────────────────────────────────────────

export type CanonicalDocumentKind =
  | "SALES_INVOICE"
  | "SALES_REMISSION"
  | "SALES_CREDIT_NOTE"
  | "CUSTOMER_RECEIPT"
  | "CUSTOMER_ADVANCE"
  | "UNKNOWN_DOCUMENT";

/** Display labels for canonical document kinds (Spanish) */
export const DOCUMENT_KIND_LABELS: Record<CanonicalDocumentKind, string> = {
  SALES_INVOICE:      "Factura",
  SALES_REMISSION:    "Remisión",
  SALES_CREDIT_NOTE:  "Nota crédito",
  CUSTOMER_RECEIPT:   "Recibo de caja",
  CUSTOMER_ADVANCE:   "Anticipo",
  UNKNOWN_DOCUMENT:   "Documento",
};

// ── Source profile types ─────────────────────────────────────────────────────

export interface DocumentSourceEntry {
  /** The canonical document kind this code maps to */
  kind: CanonicalDocumentKind;
  /** Optional: if true, this code is PENDING validation and excluded from production calculations */
  pending?: boolean;
}

export interface DocumentSourceProfile {
  /** Profile identifier (typically organization slug or SAG database name) */
  profileId: string;
  /** Human-readable profile name */
  name: string;
  /** Profile-specific labels for sales sections */
  salesLabels?: {
    invoiceLabel: string;
    remissionLabel: string;
  };
  /**
   * Map from document prefix (uppercase, from k_sc_codigo_fuente or documento prefix)
   * to canonical document kind.
   */
  prefixMap: Record<string, DocumentSourceEntry>;
  /**
   * Fallback map from SAG tipoDocumento string (exact match) to canonical kind.
   * Used when prefix is not in prefixMap.
   */
  tipoDocumentoMap?: Record<string, CanonicalDocumentKind>;
  /**
   * Map from receipt/collection prefix to the commercial world it applies to.
   * Used to classify recaudos from vw_agentik_recaudos by their target domain.
   * Only CUSTOMER_RECEIPT and CUSTOMER_ADVANCE prefixes should be here.
   */
  collectionTargetMap?: Record<string, CollectionTarget>;
}

// ── Castillitos profile ──────────────────────────────────────────────────────
// Source: FUENTES.xlsx 2026-04-20, confirmed by castillitos-fuentes.ts

export const CASTILLITOS_PROFILE: DocumentSourceProfile = {
  profileId: "castillitos",
  name: "Castillitos (LUDISAM)",
  salesLabels: {
    invoiceLabel: "Facturación oficial (F1)",
    remissionLabel: "Remisiones (F2)",
  },
  prefixMap: {
    // Remisiones
    "F2": { kind: "SALES_REMISSION" },
    "F3": { kind: "SALES_REMISSION" },
    // Facturas electrónicas (por canal)
    "FE": { kind: "SALES_INVOICE" },
    "FD": { kind: "SALES_INVOICE" },
    "FC": { kind: "SALES_INVOICE" },
    "FG": { kind: "SALES_INVOICE" },
    "FA": { kind: "SALES_INVOICE" },
    "FW": { kind: "SALES_INVOICE" },
    // Facturas históricas
    "F1": { kind: "SALES_INVOICE" },
    "VC": { kind: "SALES_INVOICE" },
    "V1": { kind: "SALES_INVOICE" },
    "V2": { kind: "SALES_INVOICE" },
    "V3": { kind: "SALES_INVOICE" },
    "V4": { kind: "SALES_INVOICE" },
    "V5": { kind: "SALES_INVOICE" },
    "V6": { kind: "SALES_INVOICE" },
    "FF": { kind: "SALES_INVOICE" },
    "FX": { kind: "SALES_INVOICE" },
    // Notas crédito (por canal)
    "NE": { kind: "SALES_CREDIT_NOTE" },
    "NC": { kind: "SALES_CREDIT_NOTE" },
    "ND": { kind: "SALES_CREDIT_NOTE" },
    "NF": { kind: "SALES_CREDIT_NOTE" },
    "NS": { kind: "SALES_CREDIT_NOTE" },
    "NT": { kind: "SALES_CREDIT_NOTE" },
    "NG": { kind: "SALES_CREDIT_NOTE" },
    "NA": { kind: "SALES_CREDIT_NOTE" },
    "NW": { kind: "SALES_CREDIT_NOTE" },
    "NX": { kind: "SALES_CREDIT_NOTE" },
    "D1": { kind: "SALES_CREDIT_NOTE" },
    "D2": { kind: "SALES_CREDIT_NOTE" },
    "2D": { kind: "SALES_CREDIT_NOTE" },
    "3D": { kind: "SALES_CREDIT_NOTE" },
    "4D": { kind: "SALES_CREDIT_NOTE" },
    "5D": { kind: "SALES_CREDIT_NOTE" },
    "6D": { kind: "SALES_CREDIT_NOTE" },
    "D3": { kind: "SALES_CREDIT_NOTE" },
    // Recibos de caja
    "R1": { kind: "CUSTOMER_RECEIPT" },
    "R2": { kind: "CUSTOMER_RECEIPT" },
    "RS": { kind: "CUSTOMER_RECEIPT" },
    // Anticipos
    "AN": { kind: "CUSTOMER_ADVANCE" },
    "A1": { kind: "CUSTOMER_ADVANCE" },
  },
  tipoDocumentoMap: {
    "Factura":       "SALES_INVOICE",
    "Nota Crédito":  "SALES_CREDIT_NOTE",
    "Nota crédito":  "SALES_CREDIT_NOTE",
  },
  collectionTargetMap: {
    "R1": "OFFICIAL_INVOICE",
    "R2": "REMISSION",
    "RS": "OFFICIAL_INVOICE",
    "AN": "CUSTOMER_ADVANCE",
    "A1": "CUSTOMER_ADVANCE",
  },
};

// ── Ludisam profile ──────────────────────────────────────────────────────────
// Source: SAG LUDISAM database, codes confirmed via FUENTES discovery

export const LUDISAM_PROFILE: DocumentSourceProfile = {
  profileId: "ludisam",
  name: "Ludisam",
  salesLabels: {
    invoiceLabel: "Facturación oficial (F7)",
    remissionLabel: "Remisiones (RE)",
  },
  prefixMap: {
    "RE": { kind: "SALES_REMISSION" },
    "F7": { kind: "SALES_INVOICE" },
    "N7": { kind: "SALES_CREDIT_NOTE" },
    "2R": { kind: "CUSTOMER_RECEIPT" },
    "1R": { kind: "CUSTOMER_RECEIPT" },
    // 0R = PENDING — excluded from production calculations until validated
    "0R": { kind: "UNKNOWN_DOCUMENT", pending: true },
  },
  tipoDocumentoMap: {
    "Factura":       "SALES_INVOICE",
    "Nota Crédito":  "SALES_CREDIT_NOTE",
    "Nota crédito":  "SALES_CREDIT_NOTE",
  },
  collectionTargetMap: {
    "2R": "REMISSION",
    "1R": "OFFICIAL_INVOICE",
  },
};

// ── Profile registry ─────────────────────────────────────────────────────────

const PROFILE_REGISTRY = new Map<string, DocumentSourceProfile>([
  ["castillitos", CASTILLITOS_PROFILE],
  ["ludisam",     LUDISAM_PROFILE],
]);

/**
 * Get a document source profile by ID.
 * Returns null for unknown profiles (fail-closed).
 */
export function getDocumentSourceProfile(profileId: string): DocumentSourceProfile | null {
  return PROFILE_REGISTRY.get(profileId.toLowerCase()) ?? null;
}

/**
 * Get sales section labels for a profile. Returns defaults for unknown profiles.
 */
export function getSalesProfileLabels(profileId: string): {
  invoiceLabel: string; remissionLabel: string; profileName: string;
} {
  const profile = getDocumentSourceProfile(profileId);
  if (!profile) {
    return { invoiceLabel: "Facturación oficial", remissionLabel: "Remisiones", profileName: "Desconocido" };
  }
  return {
    invoiceLabel: profile.salesLabels?.invoiceLabel ?? "Facturación oficial",
    remissionLabel: profile.salesLabels?.remissionLabel ?? "Remisiones",
    profileName: profile.name,
  };
}

/**
 * Resolve the collection target for a receipt document prefix.
 * Uses the profile's collectionTargetMap. UNCLASSIFIED if prefix is unknown.
 * Returns null for unknown profiles (caller should treat as PROFILE_UNRESOLVED).
 */
export function resolveCollectionTarget(
  profileId: string,
  documentPrefix: string,
): CollectionTarget | null {
  const profile = getDocumentSourceProfile(profileId);
  if (!profile) return null; // unknown profile
  if (!profile.collectionTargetMap) return "UNCLASSIFIED";
  const prefix = documentPrefix.slice(0, 2).toUpperCase();
  return profile.collectionTargetMap[prefix] ?? "UNCLASSIFIED";
}

/**
 * Determine if a document prefix represents a credit note (NC) — never a recaudo.
 * Uses the canonical document kind system: SALES_CREDIT_NOTE is not a collection.
 */
export function isDocumentCreditNote(profileId: string, documentPrefix: string): boolean {
  const result = resolveCanonicalDocumentKind(profileId, { documento: documentPrefix, tipoDocumento: "" });
  return result.kind === "SALES_CREDIT_NOTE";
}

// ── Resolver ─────────────────────────────────────────────────────────────────

export interface DocumentClassificationInput {
  /** Document number (e.g. "F2-8484", "D2-1234") */
  documento: string;
  /** SAG TIPO_DOCUMENTO value (e.g. "Factura", "Nota Crédito") */
  tipoDocumento: string;
}

export interface DocumentClassificationResult {
  /** Canonical document kind */
  kind: CanonicalDocumentKind;
  /** Display label in Spanish */
  label: string;
  /** True if this code is marked PENDING in the profile */
  pending: boolean;
}

/**
 * Resolve canonical document kind for a given document using the specified profile.
 *
 * Resolution order:
 *   1. Extract 2-char prefix from documento → look up in profile.prefixMap
 *   2. Match tipoDocumento against profile.tipoDocumentoMap
 *   3. Fall through → UNKNOWN_DOCUMENT (fail-closed)
 *
 * Unknown profileId → UNKNOWN_DOCUMENT for all documents.
 */
export function resolveCanonicalDocumentKind(
  profileId: string,
  input: DocumentClassificationInput,
): DocumentClassificationResult {
  const profile = getDocumentSourceProfile(profileId);

  if (!profile) {
    return {
      kind: "UNKNOWN_DOCUMENT",
      label: DOCUMENT_KIND_LABELS.UNKNOWN_DOCUMENT,
      pending: false,
    };
  }

  // 1. Try prefix match
  const prefix = input.documento.slice(0, 2).toUpperCase();
  const prefixEntry = profile.prefixMap[prefix];
  if (prefixEntry) {
    return {
      kind: prefixEntry.kind,
      label: DOCUMENT_KIND_LABELS[prefixEntry.kind],
      pending: prefixEntry.pending ?? false,
    };
  }

  // 2. Try tipoDocumento fallback
  if (profile.tipoDocumentoMap) {
    const tipoKind = profile.tipoDocumentoMap[input.tipoDocumento];
    if (tipoKind) {
      return {
        kind: tipoKind,
        label: DOCUMENT_KIND_LABELS[tipoKind],
        pending: false,
      };
    }
  }

  // 3. Fail-closed
  return {
    kind: "UNKNOWN_DOCUMENT",
    label: DOCUMENT_KIND_LABELS.UNKNOWN_DOCUMENT,
    pending: false,
  };
}

// ── Organization → Source Profile registry ───────────────────────────────────
//
// Static mapping from organization slug → source profile ID.
// Same pattern as TENANT_TRUTH_STATUS in receivable-truth-status.ts.
//
// A new tenant MUST be explicitly registered here to get document classification.
// Unknown org → null → UNKNOWN_DOCUMENT for all documents (fail-closed).
//
// This is a pure function — NO Prisma, NO DB. Server-side callers resolve
// the orgSlug before calling, just like isReceivableDataCertified().

const ORG_SOURCE_PROFILE_REGISTRY: Record<string, string> = {
  castillitos: "castillitos",
  // Future tenants register here explicitly:
  // "ludisam-direct": "ludisam",
};

/**
 * Resolve the source profile ID for a given organization slug.
 * Returns null for unknown orgs (fail-closed — documents will classify as UNKNOWN_DOCUMENT).
 *
 * This is the ONLY authorized way to obtain a sourceProfileId.
 * Callers MUST NOT hardcode profile IDs or use orgSlug as a profile ID directly.
 */
export function resolveOrgSourceProfileId(orgSlug: string): string | null {
  return ORG_SOURCE_PROFILE_REGISTRY[orgSlug] ?? null;
}
