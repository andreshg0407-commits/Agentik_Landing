/**
 * lib/comercial/semantic/imports/import-semantic-types.ts
 *
 * Canonical semantic types for import/purchase document lifecycle.
 *
 * These types are ERP-agnostic and tenant-agnostic.
 * The functional layer consumes these types — never raw ERP codes.
 *
 * Sprint: IMPORT-SEMANTIC-MAPPING-01
 */

// ── Document semantic type ──────────────────────────────────────────────────
// What kind of document is this?

export type ImportDocumentSemanticType =
  | "IMPORT_INVOICE"
  | "IMPORT_PROVISION"
  | "IMPORT_EXPENSE"
  | "IMPORT_LIQUIDATION"
  | "IMPORT_RETURN"
  | "IMPORT_RECEIPT"
  | "GOODS_BREAKDOWN"
  | "DOMESTIC_PURCHASE_INVOICE"
  | "PURCHASE_SUPPORT_DOCUMENT"
  | "INVENTORY_ADJUSTMENT"
  | "PHYSICAL_INVENTORY"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "CUSTOMER_ORDER"
  | "CUSTOMER_INVOICE"
  | "CUSTOMER_RETURN"
  | "UNKNOWN";

// ── Movement semantic type ──────────────────────────────────────────────────
// What operational effect does this movement produce?

export type ImportMovementSemanticType =
  | "PURCHASE"
  | "IMPORT"
  | "RECEIPT"
  | "PROVISION"
  | "COST_ALLOCATION"
  | "RETURN"
  | "ADJUSTMENT"
  | "TRANSFER"
  | "SALE"
  | "INVENTORY_COUNT"
  | "UNKNOWN";

// ── Inventory effect ────────────────────────────────────────────────────────

export type InventoryEffect =
  | "INCREASE"
  | "DECREASE"
  | "TRANSFORM"
  | "NONE"
  | "UNKNOWN";

// ── Mapping confidence ──────────────────────────────────────────────────────

export type MappingStatus =
  | "CONFIRMED"
  | "PROBABLE"
  | "UNKNOWN"
  | "EXCLUDED";

// ── Warehouse semantic type ─────────────────────────────────────────────────

export type WarehouseSemanticType =
  | "IMPORT_STAGING"
  | "IMPORT_CONTAINER"
  | "MAIN_WAREHOUSE"
  | "STORE"
  | "SELLER_BAG"
  | "TRANSIT"
  | "PRODUCTION"
  | "RAW_MATERIAL"
  | "RETURNS"
  | "SAMPLES"
  | "WEB"
  | "UNKNOWN";

// ── Price semantic type ─────────────────────────────────────────────────────

export type CommercialPriceSemanticType =
  | "RETAIL"
  | "WHOLESALE"
  | "PROMOTION"
  | "DISTRIBUTOR"
  | "COST"
  | "UNKNOWN";

// ── Evidence ────────────────────────────────────────────────────────────────

export interface ClassificationEvidence {
  /** Human-readable description of this evidence */
  description: string;
  /** Weight in [0..1] — higher = stronger signal */
  weight: number;
  /** Where this evidence comes from */
  source: "MAPPING_ID" | "MAPPING_CODE" | "MAPPING_NAME" | "QUANTITY_SIGN" | "WAREHOUSE" | "PROVIDER" | "CANCELLED_STATUS" | "RULE" | "DEFAULT";
}

// ── Classification result ───────────────────────────────────────────────────

export interface ImportSemanticClassificationResult {
  documentSemanticType: ImportDocumentSemanticType;
  movementSemanticType: ImportMovementSemanticType;

  /** Confidence in [0..1] */
  confidence: number;

  /** Evidence chain — how the classification was determined */
  evidence: ClassificationEvidence[];

  /** Tenant context */
  tenantId: string;
  erpSource: string;

  /** Original ERP identifiers */
  externalDocumentTypeId: string;
  externalDocumentCode: string;
  externalDocumentName: string;

  // ── Declared effects ──────────────────────────────────────────────────

  inventoryEffect: InventoryEffect;
  /** Does this document represent a purchase of goods? */
  purchaseEffect: boolean;
  /** Does this document relate to an import operation? */
  importEffect: boolean;

  // ── Business counting rules ───────────────────────────────────────────

  /** Should this count as a valid import receipt for date/batch tracking? */
  shouldCountAsImportReceipt: boolean;
  /** Should this count as a repurchase (distinct import batch)? */
  shouldCountAsRepurchase: boolean;
  /** Should quantities be included in totalImported? */
  shouldCountInTotalImported: boolean;
  /** Should this affect commercial stock calculations? */
  shouldAffectCommercialStock: boolean;

  // ── Unresolved issues ─────────────────────────────────────────────────

  /** Reasons the classification may be incomplete or unreliable */
  unresolvedReasons: string[];

  /** Version of the rule set used */
  ruleVersion: string;
}

// ── Classifier input ────────────────────────────────────────────────────────

export interface ImportDocumentInput {
  tenantId: string;
  erp: string;
  /** ERP-specific document type ID (e.g., "182" for SAG ka_ni_fuente) */
  sourceId: string;
  /** ERP-specific document type code (e.g., "FI") */
  sourceCode: string;
  /** ERP-specific document type name (e.g., "FACTURA DE IMPORTACION NACIONAL") */
  sourceName: string;
  /** Document number within the ERP */
  documentNumber: string;
  /** Document date (ISO string) */
  documentDate: string;
  /** Line quantity (positive = in, negative = out) */
  quantity: number;
  /** Warehouse ID in the ERP */
  warehouseId: string;
  /** Provider/third-party ID */
  providerId: string;
  /** Provider name */
  providerName: string;
  /** Whether the document is cancelled/voided */
  cancelled: boolean;
  /** Additional ERP-specific metadata */
  metadata: Record<string, unknown>;
}
