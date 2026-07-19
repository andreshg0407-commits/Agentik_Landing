/**
 * lib/comercial/semantic/imports/import-semantic-config.ts
 *
 * Multi-tenant configuration for import semantic mapping.
 *
 * Each tenant/ERP combination provides its own mapping of
 * external document types to semantic types.
 *
 * Sprint: IMPORT-SEMANTIC-MAPPING-01
 */

import type {
  ImportDocumentSemanticType,
  ImportMovementSemanticType,
  InventoryEffect,
  MappingStatus,
  WarehouseSemanticType,
  CommercialPriceSemanticType,
} from "./import-semantic-types";

// ── Document mapping entry ──────────────────────────────────────────────────

export interface DocumentSemanticMapping {
  /** ERP-specific document type ID (e.g., "182" for SAG ka_ni_fuente) */
  externalId: string;
  /** ERP-specific document type code (e.g., "FI") */
  externalCode: string;
  /** ERP-specific document type name */
  externalName: string;

  /** Canonical semantic type */
  semanticType: ImportDocumentSemanticType;
  /** Canonical movement type */
  movementType: ImportMovementSemanticType;

  /** Base confidence for this mapping [0..1] */
  confidence: number;

  /** Declared effects */
  inventoryEffect: InventoryEffect;
  countAsImportReceipt: boolean;
  countAsRepurchase: boolean;
  countInTotalImported: boolean;
  affectsCommercialStock: boolean;

  /** Validation state */
  status: MappingStatus;
  /** Human notes about this mapping */
  notes: string;
  /** Whether this mapping is active for classification */
  enabled: boolean;
}

// ── Warehouse mapping entry ─────────────────────────────────────────────────

export interface WarehouseSemanticMapping {
  /** ERP warehouse ID */
  externalId: string;
  /** ERP warehouse code */
  externalCode: string;
  /** ERP warehouse name */
  externalName: string;
  /** Semantic type */
  semanticType: WarehouseSemanticType;
  /** Validation state */
  status: MappingStatus;
  /** Notes */
  notes: string;
}

// ── Price mapping entry ─────────────────────────────────────────────────────

export interface PriceSemanticMapping {
  /** ERP price field name (e.g., "nd_precio1") */
  externalField: string;
  /** Semantic type */
  semanticType: CommercialPriceSemanticType;
  /** Validation state */
  status: MappingStatus;
  /** Notes */
  notes: string;
}

// ── Tenant config ───────────────────────────────────────────────────────────

export interface ImportSemanticTenantConfig {
  tenantId: string;
  erp: string;
  version: string;

  documentMappings: DocumentSemanticMapping[];
  warehouseMappings: WarehouseSemanticMapping[];
  priceMappings: PriceSemanticMapping[];

  /** Code aliases — alternative codes that resolve to the same mapping */
  codeAliases: Record<string, string>;
  /** Name patterns — regex fallback resolution, sorted by specificity at runtime.
   *  Optional `priority` overrides length-based specificity (higher = checked first). */
  namePatterns: { pattern: string; semanticType: ImportDocumentSemanticType; confidence: number; priority?: number }[];
}

// ── Config registry ─────────────────────────────────────────────────────────

const registry = new Map<string, ImportSemanticTenantConfig>();

/** Register a tenant config */
export function registerTenantConfig(config: ImportSemanticTenantConfig): void {
  registry.set(config.tenantId, config);
}

/** Get a tenant config. Returns undefined if not registered. */
export function getTenantConfig(tenantId: string): ImportSemanticTenantConfig | undefined {
  return registry.get(tenantId);
}

/** List all registered tenant IDs */
export function listRegisteredTenants(): string[] {
  return [...registry.keys()];
}
