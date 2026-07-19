/**
 * lib/comercial/business-policy/templates/store/store-policy-template-registry.ts
 *
 * Official Store Policy Template Registry (FASE 6).
 * Declares the 6 active + 4 planned templates.
 *
 * Sprint: STORE-POLICY-TEMPLATES-01
 */

import type {
  StorePolicyTemplate,
  StorePolicyTemplateType,
  TemplateValidationResult,
} from "./store-policy-template-types";
import { validateTemplate } from "./store-policy-template-validation";

// ── Registry Store ──────────────────────────────────────────────────────────

const registry: Map<string, StorePolicyTemplate> = new Map();

// ── STORE_COVERAGE ──────────────────────────────────────────────────────────

const STORE_COVERAGE: StorePolicyTemplate = {
  templateId: "tpl-store-coverage",
  templateType: "STORE_COVERAGE",
  category: "COVERAGE",
  displayName: "Store Coverage",
  description: "Defines min/ideal/max stock thresholds for products in a store. The foundation for replenishment signals.",
  supportedScopes: ["GLOBAL", "TENANT", "STORE", "PRODUCT_CLASS", "SUBGROUP", "SIZE", "REFERENCE"],
  supportedConditions: [
    { field: "productClass", description: "Product classification", allowedOperators: ["EQUALS", "IN"], valueType: "STRING", required: false },
    { field: "sizeClass", description: "Size classification", allowedOperators: ["EQUALS", "IN"], valueType: "STRING", required: false },
    { field: "businessLine", description: "Business line", allowedOperators: ["EQUALS", "IN"], valueType: "STRING", required: false },
    { field: "subgroup", description: "Product subgroup", allowedOperators: ["EQUALS", "IN"], valueType: "STRING", required: false },
  ],
  supportedActions: [
    { type: "SET_THRESHOLD", target: "stockLevel", description: "Set min/ideal/max stock thresholds", required: true },
  ],
  requiredParameters: [
    { name: "minQty", type: "NUMBER", description: "Minimum acceptable stock quantity", unit: "units", required: true, defaultValue: null, constraints: { min: 0 } },
    { name: "idealQty", type: "NUMBER", description: "Ideal stock quantity", unit: "units", required: true, defaultValue: null, constraints: { min: 0 } },
    { name: "maxQty", type: "NUMBER", description: "Maximum stock quantity", unit: "units", required: true, defaultValue: null, constraints: { min: 0 } },
  ],
  optionalParameters: [
    { name: "strategy", type: "STRING", description: "Coverage strategy", unit: null, required: false, defaultValue: "SUBGROUP", constraints: { allowedValues: ["SUBGROUP", "SIZE", "REFERENCE"] } },
    { name: "seasonalFactor", type: "NUMBER", description: "Seasonal adjustment multiplier", unit: "multiplier", required: false, defaultValue: 1.0, constraints: { min: 0.1, max: 5.0 } },
  ],
  precedenceGroup: "BASE",
  status: "ACTIVE",
  version: "1.0.0",
  metadata: {
    author: "business-policy-platform",
    createdAt: "2026-07-13",
    updatedAt: "2026-07-13",
    usageHint: "Use to define how much stock each store should carry for each product type",
    compatibleEngines: ["CoverageEngine", "ReplenishmentEngine"],
    tags: ["coverage", "stock", "thresholds"],
  },
};

// ── STORE_ASSORTMENT ────────────────────────────────────────────────────────

const STORE_ASSORTMENT: StorePolicyTemplate = {
  templateId: "tpl-store-assortment",
  templateType: "STORE_ASSORTMENT",
  category: "STORE",
  displayName: "Store Assortment",
  description: "Defines which product categories, subgroups, or references a store should carry. Controls the breadth of product offering.",
  supportedScopes: ["GLOBAL", "TENANT", "STORE", "BUSINESS_LINE"],
  supportedConditions: [
    { field: "productClass", description: "Product classification to include/exclude", allowedOperators: ["EQUALS", "IN", "NOT_IN"], valueType: "STRING", required: false },
    { field: "subgroup", description: "Product subgroup to include/exclude", allowedOperators: ["EQUALS", "IN", "NOT_IN"], valueType: "STRING", required: false },
    { field: "businessLine", description: "Business line", allowedOperators: ["EQUALS", "IN"], valueType: "STRING", required: false },
  ],
  supportedActions: [
    { type: "ALLOW", target: "assortment", description: "Allow product categories in store", required: false },
    { type: "RESTRICT", target: "assortment", description: "Restrict product categories from store", required: false },
  ],
  requiredParameters: [],
  optionalParameters: [
    { name: "maxReferences", type: "NUMBER", description: "Maximum distinct references for scope", unit: "references", required: false, defaultValue: null, constraints: { min: 1 } },
    { name: "minReferences", type: "NUMBER", description: "Minimum distinct references for scope", unit: "references", required: false, defaultValue: null, constraints: { min: 0 } },
    { name: "assortmentMode", type: "STRING", description: "Include or exclude mode", unit: null, required: false, defaultValue: "INCLUDE", constraints: { allowedValues: ["INCLUDE", "EXCLUDE"] } },
  ],
  precedenceGroup: "STANDARD",
  status: "ACTIVE",
  version: "1.0.0",
  metadata: {
    author: "business-policy-platform",
    createdAt: "2026-07-13",
    updatedAt: "2026-07-13",
    usageHint: "Use to control which product types each store should carry",
    compatibleEngines: ["CoverageEngine", "AssortmentEngine"],
    tags: ["assortment", "product-mix", "store-profile"],
  },
};

// ── STORE_SIZE_TARGET ───────────────────────────────────────────────────────

const STORE_SIZE_TARGET: StorePolicyTemplate = {
  templateId: "tpl-store-size-target",
  templateType: "STORE_SIZE_TARGET",
  category: "COVERAGE",
  displayName: "Store Size Target",
  description: "Defines target stock distribution by size within a product class or subgroup. Ensures balanced size curves.",
  supportedScopes: ["GLOBAL", "TENANT", "STORE", "PRODUCT_CLASS", "SUBGROUP"],
  supportedConditions: [
    { field: "productClass", description: "Product classification", allowedOperators: ["EQUALS", "IN"], valueType: "STRING", required: false },
    { field: "subgroup", description: "Product subgroup", allowedOperators: ["EQUALS", "IN"], valueType: "STRING", required: false },
  ],
  supportedActions: [
    { type: "SET_VALUE", target: "sizeDistribution", description: "Set target percentage per size", required: true },
  ],
  requiredParameters: [
    { name: "sizeDistribution", type: "JSON", description: "Target distribution by size (e.g., {S: 0.15, M: 0.30, L: 0.30, XL: 0.25})", unit: "percentage", required: true, defaultValue: null, constraints: null },
  ],
  optionalParameters: [
    { name: "tolerance", type: "NUMBER", description: "Acceptable deviation from target", unit: "percentage", required: false, defaultValue: 0.1, constraints: { min: 0, max: 0.5 } },
  ],
  precedenceGroup: "STANDARD",
  status: "ACTIVE",
  version: "1.0.0",
  metadata: {
    author: "business-policy-platform",
    createdAt: "2026-07-13",
    updatedAt: "2026-07-13",
    usageHint: "Use to ensure stores maintain balanced size curves per product type",
    compatibleEngines: ["CoverageEngine", "SizeBalanceEngine"],
    tags: ["size-curve", "distribution", "balance"],
  },
};

// ── STORE_STOCK_RESTRICTION ─────────────────────────────────────────────────

const STORE_STOCK_RESTRICTION: StorePolicyTemplate = {
  templateId: "tpl-store-stock-restriction",
  templateType: "STORE_STOCK_RESTRICTION",
  category: "STORE",
  displayName: "Store Stock Restriction",
  description: "Imposes hard limits on stock levels. Prevents over-stocking or forces minimum safety stock regardless of coverage rules.",
  supportedScopes: ["GLOBAL", "TENANT", "STORE", "WAREHOUSE", "PRODUCT_CLASS", "SUBGROUP", "REFERENCE"],
  supportedConditions: [
    { field: "productClass", description: "Product classification", allowedOperators: ["EQUALS", "IN"], valueType: "STRING", required: false },
    { field: "storeSizeClass", description: "Store size classification", allowedOperators: ["EQUALS", "IN"], valueType: "STRING", required: false },
    { field: "warehouseId", description: "Source warehouse", allowedOperators: ["EQUALS", "IN"], valueType: "STRING", required: false },
  ],
  supportedActions: [
    { type: "RESTRICT", target: "stockLevel", description: "Apply hard stock limit", required: true },
  ],
  requiredParameters: [],
  optionalParameters: [
    { name: "absoluteMax", type: "NUMBER", description: "Absolute maximum units allowed", unit: "units", required: false, defaultValue: null, constraints: { min: 0 } },
    { name: "absoluteMin", type: "NUMBER", description: "Absolute minimum units required (safety stock)", unit: "units", required: false, defaultValue: null, constraints: { min: 0 } },
    { name: "blockReplenishment", type: "BOOLEAN", description: "Block all replenishment to this scope", unit: null, required: false, defaultValue: false, constraints: null },
  ],
  precedenceGroup: "RESTRICTION",
  status: "ACTIVE",
  version: "1.0.0",
  metadata: {
    author: "business-policy-platform",
    createdAt: "2026-07-13",
    updatedAt: "2026-07-13",
    usageHint: "Use to impose hard stock limits that override coverage rules",
    compatibleEngines: ["CoverageEngine", "ReplenishmentEngine", "TransferEngine"],
    tags: ["restriction", "safety-stock", "hard-limit"],
  },
};

// ── STORE_PRODUCT_EXCEPTION ─────────────────────────────────────────────────

const STORE_PRODUCT_EXCEPTION: StorePolicyTemplate = {
  templateId: "tpl-store-product-exception",
  templateType: "STORE_PRODUCT_EXCEPTION",
  category: "COVERAGE",
  displayName: "Store Product Exception",
  description: "Overrides coverage rules for specific products or references. Use for special items that need custom treatment.",
  supportedScopes: ["STORE", "REFERENCE", "PRODUCT"],
  supportedConditions: [
    { field: "referenceCode", description: "Specific product reference", allowedOperators: ["EQUALS", "IN"], valueType: "STRING", required: true },
    { field: "storeId", description: "Specific store", allowedOperators: ["EQUALS", "IN"], valueType: "STRING", required: false },
  ],
  supportedActions: [
    { type: "OVERRIDE", target: "coverageRule", description: "Override the coverage rule for this product", required: true },
  ],
  requiredParameters: [
    { name: "minQty", type: "NUMBER", description: "Exception minimum quantity", unit: "units", required: true, defaultValue: null, constraints: { min: 0 } },
    { name: "idealQty", type: "NUMBER", description: "Exception ideal quantity", unit: "units", required: true, defaultValue: null, constraints: { min: 0 } },
    { name: "maxQty", type: "NUMBER", description: "Exception maximum quantity", unit: "units", required: true, defaultValue: null, constraints: { min: 0 } },
  ],
  optionalParameters: [
    { name: "reason", type: "STRING", description: "Reason for the exception", unit: null, required: false, defaultValue: null, constraints: null },
    { name: "expiresAt", type: "STRING", description: "ISO date when exception expires", unit: null, required: false, defaultValue: null, constraints: null },
  ],
  precedenceGroup: "EXCEPTION",
  status: "ACTIVE",
  version: "1.0.0",
  metadata: {
    author: "business-policy-platform",
    createdAt: "2026-07-13",
    updatedAt: "2026-07-13",
    usageHint: "Use for products that need different thresholds than the general rule",
    compatibleEngines: ["CoverageEngine"],
    tags: ["exception", "override", "product-specific"],
  },
};

// ── STORE_DEVIATION_ALERT ───────────────────────────────────────────────────

const STORE_DEVIATION_ALERT: StorePolicyTemplate = {
  templateId: "tpl-store-deviation-alert",
  templateType: "STORE_DEVIATION_ALERT",
  category: "ALERT",
  displayName: "Store Deviation Alert",
  description: "Triggers alerts when store metrics deviate from policy targets. Monitors coverage, rotation, and aging.",
  supportedScopes: ["GLOBAL", "TENANT", "STORE", "PRODUCT_CLASS"],
  supportedConditions: [
    { field: "deviationType", description: "Type of deviation to monitor", allowedOperators: ["EQUALS", "IN"], valueType: "STRING", required: true },
    { field: "storeSizeClass", description: "Store size classification", allowedOperators: ["EQUALS", "IN"], valueType: "STRING", required: false },
  ],
  supportedActions: [
    { type: "NOTIFY", target: "alert", description: "Generate alert notification", required: true },
  ],
  requiredParameters: [
    { name: "deviationThreshold", type: "NUMBER", description: "Percentage deviation that triggers alert", unit: "percentage", required: true, defaultValue: null, constraints: { min: 0, max: 1.0 } },
  ],
  optionalParameters: [
    { name: "severity", type: "STRING", description: "Alert severity", unit: null, required: false, defaultValue: "WARNING", constraints: { allowedValues: ["INFO", "WARNING", "CRITICAL"] } },
    { name: "cooldownMinutes", type: "NUMBER", description: "Minimum minutes between alerts", unit: "minutes", required: false, defaultValue: 60, constraints: { min: 1 } },
    { name: "monitoredMetrics", type: "JSON", description: "Which metrics to monitor", unit: null, required: false, defaultValue: null, constraints: null },
  ],
  precedenceGroup: "ALERT",
  status: "ACTIVE",
  version: "1.0.0",
  metadata: {
    author: "business-policy-platform",
    createdAt: "2026-07-13",
    updatedAt: "2026-07-13",
    usageHint: "Use to monitor store health and trigger alerts when policies are violated",
    compatibleEngines: ["AlertEngine", "CoverageEngine"],
    tags: ["alert", "monitoring", "deviation"],
  },
};

// ── PLANNED TEMPLATES (stubs) ───────────────────────────────────────────────

const STORE_TRANSFER: StorePolicyTemplate = {
  templateId: "tpl-store-transfer",
  templateType: "STORE_TRANSFER",
  category: "REPLENISHMENT",
  displayName: "Store Transfer",
  description: "Defines rules for inter-store and warehouse-to-store transfers. Controls source selection and approval thresholds.",
  supportedScopes: ["GLOBAL", "TENANT", "STORE", "WAREHOUSE"],
  supportedConditions: [],
  supportedActions: [],
  requiredParameters: [],
  optionalParameters: [],
  precedenceGroup: "STANDARD",
  status: "PLANNED",
  version: "0.1.0",
  metadata: { author: "business-policy-platform", createdAt: "2026-07-13", updatedAt: "2026-07-13", usageHint: "Planned — not yet available for instantiation", compatibleEngines: ["TransferEngine"], tags: ["transfer", "planned"] },
};

const STORE_ROTATION: StorePolicyTemplate = {
  templateId: "tpl-store-rotation",
  templateType: "STORE_ROTATION",
  category: "INVENTORY",
  displayName: "Store Rotation",
  description: "Defines target rotation rates and aging thresholds per store. Drives markdown and transfer decisions.",
  supportedScopes: ["GLOBAL", "TENANT", "STORE", "PRODUCT_CLASS"],
  supportedConditions: [],
  supportedActions: [],
  requiredParameters: [],
  optionalParameters: [],
  precedenceGroup: "STANDARD",
  status: "PLANNED",
  version: "0.1.0",
  metadata: { author: "business-policy-platform", createdAt: "2026-07-13", updatedAt: "2026-07-13", usageHint: "Planned — not yet available for instantiation", compatibleEngines: ["RotationEngine"], tags: ["rotation", "planned"] },
};

const STORE_MARKDOWN: StorePolicyTemplate = {
  templateId: "tpl-store-markdown",
  templateType: "STORE_MARKDOWN",
  category: "MARKDOWN",
  displayName: "Store Markdown",
  description: "Defines markdown triggers based on aging, rotation, and seasonality. Controls discount bands.",
  supportedScopes: ["GLOBAL", "TENANT", "STORE", "PRODUCT_CLASS", "SUBGROUP"],
  supportedConditions: [],
  supportedActions: [],
  requiredParameters: [],
  optionalParameters: [],
  precedenceGroup: "STANDARD",
  status: "PLANNED",
  version: "0.1.0",
  metadata: { author: "business-policy-platform", createdAt: "2026-07-13", updatedAt: "2026-07-13", usageHint: "Planned — not yet available for instantiation", compatibleEngines: ["MarkdownEngine"], tags: ["markdown", "planned"] },
};

const STORE_CAPACITY: StorePolicyTemplate = {
  templateId: "tpl-store-capacity",
  templateType: "STORE_CAPACITY",
  category: "STORE",
  displayName: "Store Capacity",
  description: "Defines physical capacity constraints per store. Limits total units or total references.",
  supportedScopes: ["GLOBAL", "TENANT", "STORE"],
  supportedConditions: [],
  supportedActions: [],
  requiredParameters: [],
  optionalParameters: [],
  precedenceGroup: "RESTRICTION",
  status: "PLANNED",
  version: "0.1.0",
  metadata: { author: "business-policy-platform", createdAt: "2026-07-13", updatedAt: "2026-07-13", usageHint: "Planned — not yet available for instantiation", compatibleEngines: ["CapacityEngine"], tags: ["capacity", "planned"] },
};

// ── Seed Registry ───────────────────────────────────────────────────────────

function seedRegistry(): void {
  if (registry.size > 0) return;
  for (const tpl of [
    STORE_COVERAGE, STORE_ASSORTMENT, STORE_SIZE_TARGET,
    STORE_STOCK_RESTRICTION, STORE_PRODUCT_EXCEPTION, STORE_DEVIATION_ALERT,
    STORE_TRANSFER, STORE_ROTATION, STORE_MARKDOWN, STORE_CAPACITY,
  ]) {
    registry.set(tpl.templateId, tpl);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function registerTemplate(template: StorePolicyTemplate): TemplateValidationResult {
  seedRegistry();
  const validation = validateTemplate(template);
  if (!validation.valid) return validation;

  if (registry.has(template.templateId)) {
    return {
      valid: false,
      issues: [{ field: "templateId", message: `Template "${template.templateId}" already registered`, severity: "ERROR" }],
    };
  }

  registry.set(template.templateId, template);
  return validation;
}

export function getTemplate(templateId: string): StorePolicyTemplate | null {
  seedRegistry();
  return registry.get(templateId) ?? null;
}

export function getTemplateByType(templateType: StorePolicyTemplateType): StorePolicyTemplate | null {
  seedRegistry();
  for (const tpl of registry.values()) {
    if (tpl.templateType === templateType) return tpl;
  }
  return null;
}

export function listTemplates(filter?: { status?: StorePolicyTemplate["status"] }): readonly StorePolicyTemplate[] {
  seedRegistry();
  let templates = [...registry.values()];
  if (filter?.status) {
    templates = templates.filter(t => t.status === filter.status);
  }
  return templates;
}

export function resolveTemplate(templateType: StorePolicyTemplateType): StorePolicyTemplate | null {
  seedRegistry();
  const tpl = getTemplateByType(templateType);
  if (!tpl) return null;
  if (tpl.status === "PLANNED") return null;
  if (tpl.status === "DEPRECATED") return null;
  return tpl;
}

export function _clearTemplateRegistry(): void {
  registry.clear();
}

// Re-export validateTemplate for convenience
export { validateTemplate } from "./store-policy-template-validation";
