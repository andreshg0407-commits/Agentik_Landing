/**
 * domains/commercial-domain-descriptors.ts
 *
 * Official domain descriptors for the Commercial Data Layer.
 */

// ── Domain Descriptor ───────────────────────────────────────────────────────

export interface CommercialDomainDescriptor {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly owner: string;
  readonly entityTypes: string[];
  readonly persistenceTypes: string[];
  readonly requiredCapabilities: string[];
  readonly optionalCapabilities: string[];
  readonly defaultFreshness: number;
  readonly defaultMinimumQuality: number;
  readonly consumers: string[];
  readonly active: boolean;
  readonly version: string;
}

// ── Official Domains ────────────────────────────────────────────────────────

export const PRODUCT_DOMAIN: CommercialDomainDescriptor = {
  id: "PRODUCT",
  label: "Product Domain",
  description: "Master data for products: profiles, variants, prices, classifications",
  owner: "commercial-data-layer",
  entityTypes: ["ProductProfile", "ProductVariant", "ProductPrice", "ProductClassification"],
  persistenceTypes: ["REFERENCE"],
  requiredCapabilities: ["PRODUCT_SYNC", "PRODUCT_DISCOVERY"],
  optionalCapabilities: ["PRODUCT_WEBHOOK", "PRODUCT_BULK"],
  defaultFreshness: 86400,
  defaultMinimumQuality: 0.7,
  consumers: ["CoverageEngine", "RotationEngine", "RepurchaseEngine", "MarkdownEngine", "MarketingStudio"],
  active: true,
  version: "1.0.0",
};

export const CUSTOMER_DOMAIN: CommercialDomainDescriptor = {
  id: "CUSTOMER",
  label: "Customer Domain",
  description: "Customer profiles, commercial assignments, credit profiles, branches, receivables, behavior, vendor profiles",
  owner: "commercial-data-layer",
  entityTypes: ["CustomerProfile", "CustomerCommercialAssignment", "CustomerCreditProfile", "CustomerBranch", "CustomerReceivable", "CustomerBehavior", "VendorProfile", "CollectionRecord"],
  persistenceTypes: ["REFERENCE", "SNAPSHOT", "TRANSACTIONAL", "DERIVED"],
  requiredCapabilities: ["CUSTOMER_SYNC", "CUSTOMER_DISCOVERY"],
  optionalCapabilities: ["CUSTOMER_WEBHOOK", "RECEIVABLE_SYNC"],
  defaultFreshness: 86400,
  defaultMinimumQuality: 0.6,
  consumers: ["CustomerIntelligence", "RulesEvidenceEngine", "SalesIntelligence", "CommercialCopilot"],
  active: true,
  version: "2.0.0",
};

export const INVENTORY_DOMAIN: CommercialDomainDescriptor = {
  id: "INVENTORY",
  label: "Inventory Domain",
  description: "Inventory positions, movements, age indices, warehouse profiles",
  owner: "commercial-data-layer",
  entityTypes: ["InventoryPosition", "InventoryMovement", "InventoryAge", "WarehouseProfile"],
  persistenceTypes: ["SNAPSHOT", "EVENT", "REFERENCE", "DERIVED"],
  requiredCapabilities: ["INVENTORY_SYNC", "INVENTORY_DISCOVERY"],
  optionalCapabilities: ["INVENTORY_WEBHOOK", "MOVEMENT_SYNC"],
  defaultFreshness: 900,
  defaultMinimumQuality: 0.75,
  consumers: ["CoverageEngine", "TransferEngine", "RotationEngine", "MarkdownEngine", "ProductionSignalEngine"],
  active: true,
  version: "1.0.0",
};

export const SALES_DOMAIN: CommercialDomainDescriptor = {
  id: "SALES",
  label: "Sales Domain",
  description: "Sales documents, line items, returns, attributions",
  owner: "commercial-data-layer",
  entityTypes: ["SalesDocument", "SaleLine", "SalesReturn", "SalesAttribution"],
  persistenceTypes: ["TRANSACTIONAL", "DERIVED"],
  requiredCapabilities: ["SALES_SYNC", "SALES_DISCOVERY"],
  optionalCapabilities: ["SALES_WEBHOOK", "RETURN_SYNC"],
  defaultFreshness: 1800,
  defaultMinimumQuality: 0.8,
  consumers: ["RotationEngine", "RepurchaseEngine", "MarkdownEngine", "SalesIntelligence", "CommercialCopilot"],
  active: true,
  version: "1.0.0",
};

export const PURCHASING_IMPORT_DOMAIN: CommercialDomainDescriptor = {
  id: "PURCHASING_IMPORT",
  label: "Purchasing & Import Domain",
  description: "Production orders, entries, material consumption, imports, suppliers",
  owner: "commercial-data-layer",
  entityTypes: ["ProductionOrder", "ProductionEntry", "MaterialConsumption", "ProductionTimeline", "ImportReceipt", "SupplierProfile"],
  persistenceTypes: ["TRANSACTIONAL", "EVENT", "DERIVED", "REFERENCE"],
  requiredCapabilities: ["PRODUCTION_SYNC"],
  optionalCapabilities: ["IMPORT_MANUAL_ENTRY", "SUPPLIER_SYNC"],
  defaultFreshness: 86400,
  defaultMinimumQuality: 0.65,
  consumers: ["ProductionSignalEngine", "RepurchaseEngine"],
  active: true,
  version: "1.0.0",
};

export const STORE_OPERATIONS_DOMAIN: CommercialDomainDescriptor = {
  id: "STORE_OPERATIONS",
  label: "Store Operations Domain",
  description: "Store profiles, coverage rules, evaluations, transfers, store inventory",
  owner: "commercial-data-layer",
  entityTypes: ["StoreProfile", "StoreCoverageRule", "StoreCoverageEvaluation", "StoreTransferProposal", "StoreInventoryPosition"],
  persistenceTypes: ["REFERENCE", "SNAPSHOT", "DERIVED", "TRANSACTIONAL"],
  requiredCapabilities: ["STORE_INVENTORY_SYNC"],
  optionalCapabilities: ["COVERAGE_EVALUATION", "TRANSFER_PROPOSAL"],
  defaultFreshness: 900,
  defaultMinimumQuality: 0.75,
  consumers: ["CoverageEngine", "RulesEvidenceEngine", "TransferEngine"],
  active: true,
  version: "1.0.0",
};

// ── Future Domains (registered but inactive) ────────────────────────────────

export const PRODUCTION_DOMAIN: CommercialDomainDescriptor = {
  id: "PRODUCTION",
  label: "Production Domain",
  description: "Production planning and scheduling (future extraction from Purchasing)",
  owner: "commercial-data-layer",
  entityTypes: [],
  persistenceTypes: [],
  requiredCapabilities: [],
  optionalCapabilities: [],
  defaultFreshness: 86400,
  defaultMinimumQuality: 0.6,
  consumers: [],
  active: false,
  version: "0.0.1",
};

export const RECEIVABLES_DOMAIN: CommercialDomainDescriptor = {
  id: "RECEIVABLES",
  label: "Receivables Domain",
  description: "Standalone receivables management (future extraction from Customer)",
  owner: "commercial-data-layer",
  entityTypes: [],
  persistenceTypes: [],
  requiredCapabilities: [],
  optionalCapabilities: [],
  defaultFreshness: 3600,
  defaultMinimumQuality: 0.7,
  consumers: [],
  active: false,
  version: "0.0.1",
};

export const WORKFORCE_DOMAIN: CommercialDomainDescriptor = {
  id: "WORKFORCE",
  label: "Workforce Domain",
  description: "Vendor assignments, territories, performance (future)",
  owner: "commercial-data-layer",
  entityTypes: [],
  persistenceTypes: [],
  requiredCapabilities: [],
  optionalCapabilities: [],
  defaultFreshness: 86400,
  defaultMinimumQuality: 0.6,
  consumers: [],
  active: false,
  version: "0.0.1",
};

export const LOGISTICS_DOMAIN: CommercialDomainDescriptor = {
  id: "LOGISTICS",
  label: "Logistics Domain",
  description: "Shipping, delivery, transport (future)",
  owner: "commercial-data-layer",
  entityTypes: [],
  persistenceTypes: [],
  requiredCapabilities: [],
  optionalCapabilities: [],
  defaultFreshness: 1800,
  defaultMinimumQuality: 0.6,
  consumers: [],
  active: false,
  version: "0.0.1",
};

// ── All Official Descriptors ────────────────────────────────────────────────

export const ALL_DOMAIN_DESCRIPTORS: CommercialDomainDescriptor[] = [
  PRODUCT_DOMAIN,
  CUSTOMER_DOMAIN,
  INVENTORY_DOMAIN,
  SALES_DOMAIN,
  PURCHASING_IMPORT_DOMAIN,
  STORE_OPERATIONS_DOMAIN,
  PRODUCTION_DOMAIN,
  RECEIVABLES_DOMAIN,
  WORKFORCE_DOMAIN,
  LOGISTICS_DOMAIN,
];
