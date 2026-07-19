/**
 * lib/comercial/maletas/assortment-catalog/mallet-assortment-types.ts
 *
 * Canonical types for Mallet Assortment Catalogs (Derroteros de Maleta).
 *
 * CRITICAL SCOPE: These catalogs define the target composition of MALETAS
 * (vendor suitcases) only. They do NOT apply to tiendas (stores).
 * Store policies use separate coverage/rotation/assortment rules.
 *
 * Pure types — no runtime logic, no Prisma, no UI imports.
 *
 * Sprint: CASTILLITOS-MALLET-POLICIES-01
 */

// ── Catalog Status ──────────────────────────────────────────────────────────

export type AssortmentCatalogStatus = "DRAFT" | "ACTIVE" | "DEPRECATED";

// ── Commercial Worlds ───────────────────────────────────────────────────────

export type CommercialWorld = "TEXTIL" | "IMPORTACION";

// ── Size Class (Import only) ────────────────────────────────────────────────

export type ImportSizeClass = "PEQUENO" | "MEDIANO" | "GRANDE";

// ── Evaluation Status ───────────────────────────────────────────────────────

export type MalletAssortmentStatus =
  | "COMPLETE"
  | "INCOMPLETE"
  | "OVER_ASSORTED"
  | "CONFLICTED"
  | "INSUFFICIENT_DATA";

// ── Suggestion Types ────────────────────────────────────────────────────────

export type SuggestionType = "ADD" | "REMOVE" | "SWAP";

// ── Evidence ────────────────────────────────────────────────────────────────

export interface MalletAssortmentEvidence {
  readonly domain: "MALLET_ASSORTMENT";
  readonly traceId: string;
  readonly tenantId: string;
  readonly catalogId: string;
  readonly source: string;
  readonly confidence: number;
  readonly observedAt: Date;
  readonly note: string | null;
}

export interface MalletAssortmentEntryEvidence {
  readonly source: string;
  readonly confidence: number;
  readonly note: string | null;
}

export interface MalletAssortmentEvaluationEvidence {
  readonly domain: "MALLET_ASSORTMENT_EVALUATION";
  readonly traceId: string;
  readonly tenantId: string;
  readonly catalogId: string;
  readonly catalogVersion: string;
  readonly malletId: string;
  readonly groupsEvaluated: number;
  readonly entriesEvaluated: number;
  readonly dataQuality: DataQualityLevel;
  readonly unresolvedReasons: readonly string[];
  readonly observedAt: Date;
  readonly note: string | null;
}

export type DataQualityLevel = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

// ── Catalog Entities ────────────────────────────────────────────────────────

export interface MalletAssortmentEntry {
  readonly subgroupCode: string | null;
  readonly subgroupName: string;
  readonly targetUnits: number;
  readonly minUnits: number | null;
  readonly maxUnits: number | null;
  readonly priority: number;
  readonly active: boolean;
  readonly evidence: MalletAssortmentEntryEvidence;
  /**
   * SAG integration key — exact value(s) from SAG SUBGRUPOS.sc_detalle_subgrupo.
   * Separated from subgroupCode (internal identifier) to avoid dual-use.
   * Array form when multiple SAG subgrupos map to a single commercial need.
   * null = no confirmed SAG mapping (REQUIERE_DECISION_COMERCIAL).
   * Sprint: MALETAS-TEXTIL-DERROTERO-SAG-MATCH-01
   */
  readonly sagSubgrupo: string | string[] | null;
}

export interface MalletAssortmentGroup {
  readonly groupCode: string;
  readonly groupName: string;
  readonly entries: readonly MalletAssortmentEntry[];
  /**
   * SAG integration key — exact value from SAG GRUPOS.sc_detalle_grupo.
   * Used for Castillitos matching (grupo + subgrupo). null for Latin Kids / Import.
   * Sprint: MALETAS-TEXTIL-DERROTERO-SAG-MATCH-01
   */
  readonly sagGrupo: string | null;
}

export interface MalletAssortmentCatalog {
  readonly catalogId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly commercialWorld: CommercialWorld;
  readonly brand: string | null;
  readonly version: string;
  readonly status: AssortmentCatalogStatus;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
  readonly groups: readonly MalletAssortmentGroup[];
  readonly source: string;
  readonly evidence: MalletAssortmentEvidence;
  readonly createdAt: Date;
  readonly activatedAt: Date | null;
}

// ── Evaluation Results ──────────────────────────────────────────────────────

export interface MalletGroupEntryResult {
  readonly subgroupCode: string | null;
  readonly subgroupName: string;
  readonly targetUnits: number;
  readonly currentUnits: number;
  readonly delta: number;
  readonly complete: boolean;
  readonly excess: boolean;
  readonly matchedReferences: readonly string[];
}

export interface MalletGroupResult {
  readonly groupCode: string;
  readonly groupName: string;
  readonly entryResults: readonly MalletGroupEntryResult[];
  readonly completeEntries: number;
  readonly missingEntries: number;
  readonly excessEntries: number;
  readonly unresolvedEntries: number;
  readonly groupCompletion: number;
}

export interface MalletAssortmentSuggestion {
  readonly type: SuggestionType;
  readonly groupCode: string;
  readonly groupName: string;
  readonly subgroupCode: string | null;
  readonly subgroupName: string;
  readonly reference: string | null;
  readonly description: string | null;
  readonly photoUrl: string | null;
  readonly availableUnits: number;
  readonly suggestedQty: number;
  readonly reason: string;
  readonly confidence: number;
  readonly evidence: MalletAssortmentEntryEvidence;
}

export interface MalletAssortmentEvaluation {
  readonly malletId: string;
  readonly vendorId: string;
  readonly catalogId: string;
  readonly catalogVersion: string;
  readonly commercialWorld: CommercialWorld;
  readonly brand: string | null;
  readonly groupResults: readonly MalletGroupResult[];
  readonly completeEntries: number;
  readonly missingEntries: number;
  readonly excessEntries: number;
  readonly unresolvedEntries: number;
  readonly overallCompletion: number;
  readonly status: MalletAssortmentStatus;
  readonly suggestions: readonly MalletAssortmentSuggestion[];
  readonly evidence: MalletAssortmentEvaluationEvidence;
  readonly confidence: number;
  readonly evaluatedAt: Date;
}

// ── Evaluator Input ─────────────────────────────────────────────────────────

export interface MalletCurrentItem {
  readonly reference: string;
  readonly description: string;
  readonly line: string;
  readonly groupCode: string | null;
  readonly subgroupCode: string | null;
  readonly subgroupName: string | null;
  readonly sizeClass: ImportSizeClass | null;
  readonly units: number;
  readonly photoUrl: string | null;
}

export interface AvailableInventoryItem {
  readonly reference: string;
  readonly description: string;
  readonly line: string;
  readonly groupCode: string | null;
  readonly subgroupCode: string | null;
  readonly subgroupName: string | null;
  readonly sizeClass: ImportSizeClass | null;
  readonly availableUnits: number;
  readonly photoUrl: string | null;
  readonly quality: number;
}

export interface MalletAssortmentEvaluationInput {
  readonly tenantId: string;
  readonly malletId: string;
  readonly vendorId: string;
  readonly currentItems: readonly MalletCurrentItem[];
  readonly catalog: MalletAssortmentCatalog;
  readonly productData: readonly MalletCurrentItem[];
  readonly availableInventory: readonly AvailableInventoryItem[];
  readonly asOf: Date;
  readonly traceId: string;
}

// ── Catalog Registry ────────────────────────────────────────────────────────

export interface CatalogRegistryEntry {
  readonly catalog: MalletAssortmentCatalog;
  readonly registeredAt: Date;
}

export interface CatalogListFilter {
  readonly tenantId: string;
  readonly status?: AssortmentCatalogStatus;
  readonly commercialWorld?: CommercialWorld;
  readonly brand?: string;
}

// ── Validation ──────────────────────────────────────────────────────────────

export type CatalogValidationSeverity = "ERROR" | "WARNING" | "INFO";

export interface CatalogValidationIssue {
  readonly field: string;
  readonly message: string;
  readonly severity: CatalogValidationSeverity;
}

export interface CatalogValidationResult {
  readonly valid: boolean;
  readonly issues: readonly CatalogValidationIssue[];
}
