/**
 * lib/comercial/semantic/imports/index.ts
 *
 * Public barrel for the import semantic layer.
 *
 * Sprint: IMPORT-SEMANTIC-MAPPING-01
 */

// Types
export type {
  ImportDocumentSemanticType,
  ImportMovementSemanticType,
  InventoryEffect,
  MappingStatus,
  WarehouseSemanticType,
  CommercialPriceSemanticType,
  ClassificationEvidence,
  ImportSemanticClassificationResult,
  ImportDocumentInput,
} from "./import-semantic-types";

// Config
export type {
  DocumentSemanticMapping,
  WarehouseSemanticMapping,
  PriceSemanticMapping,
  ImportSemanticTenantConfig,
} from "./import-semantic-config";
export {
  registerTenantConfig,
  getTenantConfig,
  listRegisteredTenants,
} from "./import-semantic-config";

// Classifier
export { classifyImportDocument } from "./import-semantic-classifier";

// Castillitos mapping (auto-registers on import)
export { CASTILLITOS_IMPORT_CONFIG } from "./import-semantic-mapping";
