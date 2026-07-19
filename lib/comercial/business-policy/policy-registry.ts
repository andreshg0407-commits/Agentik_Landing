/**
 * lib/comercial/business-policy/policy-registry.ts
 *
 * Official Policy Registry (FASE 7).
 * Declares which categories exist and their allowed scopes/parameters.
 * No rules — only structure.
 *
 * Sprint: BUSINESS-POLICY-ENGINE-01
 */

import type { PolicyRegistryEntry, PolicyCategory, PolicyScope } from "./policy-types";

// ── Registry Entries ────────────────────────────────────────────────────────

const COVERAGE_ENTRY: PolicyRegistryEntry = {
  category: "COVERAGE",
  label: "Coverage Policies",
  description: "Min/ideal/max stock thresholds per store, product, size, subgroup",
  allowedScopes: ["GLOBAL", "TENANT", "STORE", "PRODUCT", "PRODUCT_CLASS", "SUBGROUP", "SIZE", "REFERENCE"],
  requiredParameters: ["minQty", "idealQty", "maxQty"],
  optionalParameters: ["strategy", "seasonalFactor"],
  version: "1.0.0",
};

const STORE_ENTRY: PolicyRegistryEntry = {
  category: "STORE",
  label: "Store Policies",
  description: "Store classification, operating rules, capacity, opening hours, delivery schedules",
  allowedScopes: ["GLOBAL", "TENANT", "STORE", "BUSINESS_LINE"],
  requiredParameters: [],
  optionalParameters: ["sizeClass", "maxCapacity", "deliveryDays"],
  version: "1.0.0",
};

const REPLENISHMENT_ENTRY: PolicyRegistryEntry = {
  category: "REPLENISHMENT",
  label: "Replenishment Policies",
  description: "Replenishment triggers, approval rules, source warehouse selection",
  allowedScopes: ["GLOBAL", "TENANT", "STORE", "WAREHOUSE", "PRODUCT_CLASS", "BUSINESS_LINE"],
  requiredParameters: [],
  optionalParameters: ["autoApprove", "minTransferQty", "sourceWarehouseId"],
  version: "1.0.0",
};

const ORDER_ENTRY: PolicyRegistryEntry = {
  category: "ORDER",
  label: "Order Policies",
  description: "Order validation, minimum quantities, credit checks, approval thresholds",
  allowedScopes: ["GLOBAL", "TENANT", "CUSTOMER", "VENDOR", "BUSINESS_LINE", "ORDER"],
  requiredParameters: [],
  optionalParameters: ["minOrderValue", "maxOrderValue", "requiresApproval", "creditCheckRequired"],
  version: "1.0.0",
};

const VENDOR_ENTRY: PolicyRegistryEntry = {
  category: "VENDOR",
  label: "Vendor Policies",
  description: "Vendor assignment, territory rules, commission structures, performance thresholds",
  allowedScopes: ["GLOBAL", "TENANT", "VENDOR", "BUSINESS_LINE"],
  requiredParameters: [],
  optionalParameters: ["maxCustomers", "commissionRate", "performanceThreshold"],
  version: "1.0.0",
};

const CUSTOMER_ENTRY: PolicyRegistryEntry = {
  category: "CUSTOMER",
  label: "Customer Policies",
  description: "Customer classification, credit limits, payment terms, visit frequency",
  allowedScopes: ["GLOBAL", "TENANT", "CUSTOMER", "BUSINESS_LINE"],
  requiredParameters: [],
  optionalParameters: ["defaultCreditDays", "maxCreditLimit", "visitFrequencyDays"],
  version: "1.0.0",
};

const INVENTORY_ENTRY: PolicyRegistryEntry = {
  category: "INVENTORY",
  label: "Inventory Policies",
  description: "Inventory aging, rotation thresholds, safety stock, transfer rules",
  allowedScopes: ["GLOBAL", "TENANT", "WAREHOUSE", "STORE", "PRODUCT", "PRODUCT_CLASS", "SUBGROUP"],
  requiredParameters: [],
  optionalParameters: ["maxAgeDays", "safetyStockDays", "rotationTarget"],
  version: "1.0.0",
};

const IMPORT_ENTRY: PolicyRegistryEntry = {
  category: "IMPORT",
  label: "Import Policies",
  description: "Import lead times, minimum order quantities, supplier selection",
  allowedScopes: ["GLOBAL", "TENANT", "PRODUCT", "PRODUCT_CLASS", "VENDOR"],
  requiredParameters: [],
  optionalParameters: ["leadTimeDays", "minImportQty", "preferredSupplier"],
  version: "1.0.0",
};

const MARKDOWN_ENTRY: PolicyRegistryEntry = {
  category: "MARKDOWN",
  label: "Markdown Policies",
  description: "Discount rules, markdown triggers, aging-based pricing, seasonal clearance",
  allowedScopes: ["GLOBAL", "TENANT", "STORE", "PRODUCT", "PRODUCT_CLASS", "SUBGROUP", "SIZE"],
  requiredParameters: [],
  optionalParameters: ["maxDiscountPct", "agingTriggerDays", "seasonalWindow"],
  version: "1.0.0",
};

const ALERT_ENTRY: PolicyRegistryEntry = {
  category: "ALERT",
  label: "Alert Policies",
  description: "Alert thresholds, notification rules, escalation paths",
  allowedScopes: ["GLOBAL", "TENANT", "STORE", "WAREHOUSE", "VENDOR", "CUSTOMER"],
  requiredParameters: [],
  optionalParameters: ["severityThreshold", "escalationDelayMinutes", "notifyChannels"],
  version: "1.0.0",
};

const REPORT_ENTRY: PolicyRegistryEntry = {
  category: "REPORT",
  label: "Report Policies",
  description: "Report scheduling, data retention, aggregation rules",
  allowedScopes: ["GLOBAL", "TENANT", "BUSINESS_LINE"],
  requiredParameters: [],
  optionalParameters: ["retentionDays", "aggregationLevel", "scheduleExpression"],
  version: "1.0.0",
};

const GENERAL_ENTRY: PolicyRegistryEntry = {
  category: "GENERAL",
  label: "General Policies",
  description: "Cross-cutting policies not specific to any single domain",
  allowedScopes: ["GLOBAL", "TENANT"],
  requiredParameters: [],
  optionalParameters: [],
  version: "1.0.0",
};

// ── Registry ────────────────────────────────────────────────────────────────

const REGISTRY: ReadonlyMap<PolicyCategory, PolicyRegistryEntry> = new Map([
  ["COVERAGE", COVERAGE_ENTRY],
  ["STORE", STORE_ENTRY],
  ["REPLENISHMENT", REPLENISHMENT_ENTRY],
  ["ORDER", ORDER_ENTRY],
  ["VENDOR", VENDOR_ENTRY],
  ["CUSTOMER", CUSTOMER_ENTRY],
  ["INVENTORY", INVENTORY_ENTRY],
  ["IMPORT", IMPORT_ENTRY],
  ["MARKDOWN", MARKDOWN_ENTRY],
  ["ALERT", ALERT_ENTRY],
  ["REPORT", REPORT_ENTRY],
  ["GENERAL", GENERAL_ENTRY],
] as const);

// ── Public API ──────────────────────────────────────────────────────────────

export function getRegistryEntry(category: PolicyCategory): PolicyRegistryEntry | null {
  return REGISTRY.get(category) ?? null;
}

export function getAllRegistryEntries(): readonly PolicyRegistryEntry[] {
  return [...REGISTRY.values()];
}

export function isScopeAllowed(category: PolicyCategory, scope: PolicyScope): boolean {
  const entry = REGISTRY.get(category);
  if (!entry) return false;
  return entry.allowedScopes.includes(scope);
}

export function getRequiredParameters(category: PolicyCategory): readonly string[] {
  return REGISTRY.get(category)?.requiredParameters ?? [];
}

export function getOptionalParameters(category: PolicyCategory): readonly string[] {
  return REGISTRY.get(category)?.optionalParameters ?? [];
}
