/**
 * lib/comercial/maletas/assortment-catalog/index.ts
 *
 * Public barrel for Mallet Assortment Catalog.
 *
 * Sprint: CASTILLITOS-MALLET-POLICIES-01
 */

// ── Types ───────────────────────────────────────────────────────────────────

export type {
  AssortmentCatalogStatus,
  CommercialWorld,
  ImportSizeClass,
  MalletAssortmentStatus,
  SuggestionType,
  DataQualityLevel,
  CatalogValidationSeverity,
  MalletAssortmentEvidence,
  MalletAssortmentEntryEvidence,
  MalletAssortmentEvaluationEvidence,
  MalletAssortmentEntry,
  MalletAssortmentGroup,
  MalletAssortmentCatalog,
  MalletGroupEntryResult,
  MalletGroupResult,
  MalletAssortmentSuggestion,
  MalletAssortmentEvaluation,
  MalletCurrentItem,
  AvailableInventoryItem,
  MalletAssortmentEvaluationInput,
  CatalogRegistryEntry,
  CatalogListFilter,
  CatalogValidationIssue,
  CatalogValidationResult,
} from "./mallet-assortment-types";

// ── Catalog Registry ────────────────────────────────────────────────────────

export type { RegisterCatalogResult } from "./mallet-assortment-catalog";

export {
  registerCatalog,
  getCatalog,
  listCatalogs,
  resolveActiveCatalogs,
  resolveCatalogForBrand,
  _clearCatalogStore,
  _resetCatalogStore,
} from "./mallet-assortment-catalog";

// ── Castillitos Catalogs ────────────────────────────────────────────────────

export {
  buildCastillitosTextilCatalog,
  buildLatinKidsTextilCatalog,
  buildImportAccesoriosCatalog,
  CS_GROUPS,
  LT_GROUPS,
  IMPORT_GROUPS,
} from "./castillitos-mallet-assortment-catalog";

// ── Validation ──────────────────────────────────────────────────────────────

export {
  validateCatalog,
  validateEvaluationInput,
} from "./mallet-assortment-validation";

// ── Evaluator ───────────────────────────────────────────────────────────────

export {
  evaluateMalletAssortment,
} from "./mallet-assortment-evaluator";

// ── Evidence ────────────────────────────────────────────────────────────────

export {
  buildAssortmentEvaluationEvidence,
  assortmentEvidenceToCommercialEvidence,
  buildAssortmentNarrative,
  buildCatalogEvidenceSummary,
} from "./mallet-assortment-evidence";
