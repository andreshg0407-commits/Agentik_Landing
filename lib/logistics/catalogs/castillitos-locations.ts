/**
 * castillitos-locations.ts
 *
 * INVENTORY-LOCATION-MODEL-01 — Phase 5: Castillitos Location Catalog.
 * Evidence-based classification of all known Castillitos warehouses (bodegas).
 *
 * Sources:
 *   - CASTILLITOS_BODEGAS (castillitos-overrides.ts) — 37 registered, confirmed 2026-04-08
 *   - CASTILLITOS_SELLER_WAREHOUSES (maleta-replacement-engine.ts) — 5 sellers (40/Fredy missing)
 *   - BODEGA-DISCOVERY-01 — 10 unregistered bodegas found in ProductInventoryLevel
 *   - TRANSFER-DISCOVERY-01 — Transfer flow evidence (01→stores, 01→sellers, 04→01, containers→24→01)
 *   - ProductInventoryLevel data — variant counts and stock quantities
 */

import type {
  InventoryLocation,
  InventoryLocationRelationship,
  InventoryLocationHierarchy,
} from "../inventory-location-types";

// ── Catalog ─────────────────────────────────────────────────────────────────

/** All known Castillitos inventory locations, classified by evidence. */
export const CASTILLITOS_LOCATIONS: InventoryLocation[] = [
  // ── MAIN WAREHOUSE ─────────────────────────────────────────────────────
  {
    code: "01", name: "BODEGA PRINCIPAL",
    locationType: "MAIN_WAREHOUSE", role: "DISTRIBUTION_HUB",
    capabilities: [
      "HOLDS_SELLABLE_STOCK", "CAN_RECEIVE_TRANSFERS", "CAN_DISPATCH_TRANSFERS",
      "CAN_REPLENISH", "CAN_TRIGGER_PRODUCTION", "CAN_TRIGGER_PORTFOLIO_REPLACEMENT",
      "CAN_TRIGGER_STORE_REPLENISHMENT",
    ],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + CASTILLITOS_CONFIG.defaultWarehouse + 50,311 variants + distribution hub evidence" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "INVENTORY_DATA", description: "50,311 variants, net -1,102,387 (heavy outflow = distribution)", source: "BODEGA-DISCOVERY-01" },
      { type: "TRANSFER_DATA", description: "Origin for TR/TM to stores, sellers, franchises", source: "TRANSFER-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: null, parentLocationCode: null,
  },

  // ── PRODUCTION ─────────────────────────────────────────────────────────
  {
    code: "04", name: "PRODUCTO EN PROCESO",
    locationType: "PRODUCTION", role: "PRODUCTION_STAGE",
    capabilities: ["HOLDS_PRODUCTION_STOCK", "CAN_RECEIVE_TRANSFERS", "CAN_DISPATCH_TRANSFERS", "CAN_PRODUCE"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + 1.3M units positive stock + 48,349 variants + production fuentes" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "INVENTORY_DATA", description: "48,349 variants, net +1,318,904 (largest stock)", source: "BODEGA-DISCOVERY-01" },
      { type: "PRODUCTION_DATA", description: "2,983 products shared with 01 (production→warehouse flow)", source: "TRANSFER-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: null, parentLocationCode: null,
  },

  // ── RAW MATERIAL ───────────────────────────────────────────────────────
  {
    code: "05", name: "MATERIA PRIMA",
    locationType: "RAW_MATERIAL", role: "RAW_MATERIAL_STORAGE",
    capabilities: ["HOLDS_RAW_MATERIAL", "CAN_DISPATCH_TRANSFERS"],
    status: "INACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + naming pattern. No data in ProductInventoryLevel" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "Name 'MATERIA PRIMA' = raw material", source: "BODEGA-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: null, parentLocationCode: null,
  },
  {
    code: "06", name: "TELAS",
    locationType: "RAW_MATERIAL", role: "RAW_MATERIAL_STORAGE",
    capabilities: ["HOLDS_RAW_MATERIAL", "CAN_DISPATCH_TRANSFERS"],
    status: "INACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + naming pattern. No data" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "Name 'TELAS' = fabrics (raw material)", source: "BODEGA-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: null, parentLocationCode: null,
  },
  {
    code: "07", name: "RETAZOS",
    locationType: "RAW_MATERIAL", role: "RAW_MATERIAL_STORAGE",
    capabilities: ["HOLDS_RAW_MATERIAL"],
    status: "INACTIVE",
    confidence: { level: "MEDIUM", reason: "Master registry + naming pattern. Could be waste/remnants" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "Name 'RETAZOS' = remnants/scraps", source: "BODEGA-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: null, parentLocationCode: null,
  },

  // ── STORES ─────────────────────────────────────────────────────────────
  {
    code: "00", name: "BODEGA CENTRO",
    locationType: "STORE", role: "SELLING_LOCATION",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_SELL", "CAN_BE_REPLENISHED", "CAN_RECEIVE_TRANSFERS"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + SaleRecord data + 1,275 positive stock variants" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "SALE_DATA", description: "Present in SaleRecord as store", source: "BODEGA-DISCOVERY-01" },
      { type: "INVENTORY_DATA", description: "10,323 variants, 1,275 with positive stock", source: "BODEGA-DISCOVERY-01" },
      { type: "TRANSFER_DATA", description: "73% product overlap with 01", source: "TRANSFER-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: "centro", parentLocationCode: "01",
  },
  {
    code: "02", name: "BODEGA SANDIEGO",
    locationType: "STORE", role: "SELLING_LOCATION",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_SELL", "CAN_BE_REPLENISHED", "CAN_RECEIVE_TRANSFERS"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + SaleRecord data + 992 positive stock variants" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "SALE_DATA", description: "Present in SaleRecord as store", source: "BODEGA-DISCOVERY-01" },
      { type: "INVENTORY_DATA", description: "15,883 variants, 992 with positive stock", source: "BODEGA-DISCOVERY-01" },
      { type: "TRANSFER_DATA", description: "73% product overlap with 01", source: "TRANSFER-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: "sandiego", parentLocationCode: "01",
  },
  {
    code: "03", name: "BODEGA MAYORCA",
    locationType: "STORE", role: "SELLING_LOCATION",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_SELL", "CAN_BE_REPLENISHED", "CAN_RECEIVE_TRANSFERS"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + 99% overlap with 01 + 715 positive stock variants" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "INVENTORY_DATA", description: "7,484 variants, 715 with positive stock", source: "BODEGA-DISCOVERY-01" },
      { type: "TRANSFER_DATA", description: "99% product overlap with 01 — almost all stock from principal", source: "TRANSFER-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: "mayorca", parentLocationCode: "01",
  },
  {
    code: "23", name: "GRAN PLAZA",
    locationType: "STORE", role: "SELLING_LOCATION",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_SELL", "CAN_BE_REPLENISHED", "CAN_RECEIVE_TRANSFERS"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + 932 positive stock variants + SaleRecord" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "INVENTORY_DATA", description: "7,999 variants, 932 with positive stock", source: "BODEGA-DISCOVERY-01" },
      { type: "TRANSFER_DATA", description: "66% product overlap with 01", source: "TRANSFER-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: "gran-plaza", parentLocationCode: "01",
  },
  {
    code: "29", name: "BODEGA CALDAS",
    locationType: "STORE", role: "SELLING_LOCATION",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_SELL", "CAN_BE_REPLENISHED", "CAN_RECEIVE_TRANSFERS"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + 886 positive stock variants" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "INVENTORY_DATA", description: "5,811 variants, 886 with positive stock", source: "BODEGA-DISCOVERY-01" },
      { type: "TRANSFER_DATA", description: "57% product overlap with 01", source: "TRANSFER-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: "caldas", parentLocationCode: "01",
  },

  // ── SELLER PORTFOLIOS (MALETAS) ────────────────────────────────────────
  {
    code: "35", name: "VEND ORLANDO",
    locationType: "PORTFOLIO", role: "PORTFOLIO_LOCATION",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_SELL", "CAN_BE_REPLENISHED", "CAN_RECEIVE_TRANSFERS"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + CASTILLITOS_SELLER_WAREHOUSES + naming 'VEND'" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "Prefix 'VEND' = vendedor", source: "BODEGA-DISCOVERY-01" },
      { type: "MANUAL_OVERRIDE", description: "Listed in CASTILLITOS_SELLER_WAREHOUSES", source: "maleta-replacement-engine.ts" },
    ],
    sellerName: "Orlando", sellerId: "ORLANDO", storeSlug: null, parentLocationCode: "01",
  },
  {
    code: "36", name: "VEND CARLOS LEON",
    locationType: "PORTFOLIO", role: "PORTFOLIO_LOCATION",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_SELL", "CAN_BE_REPLENISHED", "CAN_RECEIVE_TRANSFERS"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + CASTILLITOS_SELLER_WAREHOUSES" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "Prefix 'VEND' = vendedor", source: "BODEGA-DISCOVERY-01" },
      { type: "MANUAL_OVERRIDE", description: "Listed in CASTILLITOS_SELLER_WAREHOUSES", source: "maleta-replacement-engine.ts" },
    ],
    sellerName: "Carlos Leon", sellerId: "CARLOS_LEON", storeSlug: null, parentLocationCode: "01",
  },
  {
    code: "37", name: "VEND LUIS",
    locationType: "PORTFOLIO", role: "PORTFOLIO_LOCATION",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_SELL", "CAN_BE_REPLENISHED", "CAN_RECEIVE_TRANSFERS"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + CASTILLITOS_SELLER_WAREHOUSES" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "Prefix 'VEND' = vendedor", source: "BODEGA-DISCOVERY-01" },
    ],
    sellerName: "Luis", sellerId: "LUIS", storeSlug: null, parentLocationCode: "01",
  },
  {
    code: "38", name: "VEND NESTOR",
    locationType: "PORTFOLIO", role: "PORTFOLIO_LOCATION",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_SELL", "CAN_BE_REPLENISHED", "CAN_RECEIVE_TRANSFERS"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + CASTILLITOS_SELLER_WAREHOUSES" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "Prefix 'VEND' = vendedor", source: "BODEGA-DISCOVERY-01" },
    ],
    sellerName: "Nestor", sellerId: "NESTOR", storeSlug: null, parentLocationCode: "01",
  },
  {
    code: "39", name: "VEND CARLOS VILLA",
    locationType: "PORTFOLIO", role: "PORTFOLIO_LOCATION",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_SELL", "CAN_BE_REPLENISHED", "CAN_RECEIVE_TRANSFERS"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + CASTILLITOS_SELLER_WAREHOUSES" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "Prefix 'VEND' = vendedor", source: "BODEGA-DISCOVERY-01" },
    ],
    sellerName: "Carlos Villa", sellerId: "CARLOS_VILLA", storeSlug: null, parentLocationCode: "01",
  },
  {
    code: "40", name: "VEND FREDY",
    locationType: "PORTFOLIO", role: "PORTFOLIO_LOCATION",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_SELL", "CAN_BE_REPLENISHED", "CAN_RECEIVE_TRANSFERS"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + naming 'VEND'. NOTE: Missing from CASTILLITOS_SELLER_WAREHOUSES — needs addition" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "Prefix 'VEND' = vendedor", source: "BODEGA-DISCOVERY-01" },
      { type: "DISCOVERY", description: "Missing from CASTILLITOS_SELLER_WAREHOUSES — flagged in TRANSFER-DISCOVERY-01", source: "TRANSFER-DISCOVERY-01" },
    ],
    sellerName: "Fredy", sellerId: "FREDY", storeSlug: null, parentLocationCode: "01",
  },

  // ── FRANCHISES ─────────────────────────────────────────────────────────
  ...([
    { code: "08", name: "F1 - PAQUE BERRIO", variants: 383 },
    { code: "09", name: "F3 - BOLIVAR", variants: 467 },
    { code: "10", name: "F6 - BELLO", variants: 434 },
    { code: "11", name: "F7 - ARMENIA", variants: 328 },
    { code: "12", name: "F9 - PEREIRA", variants: 319 },
    { code: "13", name: "F16 - CENT MAY BOGOT", variants: 344 },
    { code: "14", name: "F17 - MAYORCA", variants: 342 },
    { code: "15", name: "F10 - IBAGUE", variants: 353 },
    { code: "21", name: "F19 - MONTERIA", variants: 0 },
  ] as const).map(({ code, name, variants }): InventoryLocation => ({
    code, name,
    locationType: "FRANCHISE", role: "SELLING_LOCATION",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_SELL", "CAN_BE_REPLENISHED", "CAN_RECEIVE_TRANSFERS"],
    status: variants > 0 ? "ACTIVE" : "INACTIVE",
    confidence: { level: "HIGH", reason: `Master registry + 'F' naming prefix. ${variants} variants in DB` },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "Prefix 'F' + number + city = franchise", source: "BODEGA-DISCOVERY-01" },
      ...(variants > 0 ? [{ type: "INVENTORY_DATA" as const, description: `${variants} variants (all negative qty = historical outflow)`, source: "BODEGA-DISCOVERY-01" }] : []),
    ],
    sellerName: null, sellerId: null, storeSlug: null, parentLocationCode: "01",
  })),

  // ── IMPORT / STAGING ───────────────────────────────────────────────────
  {
    code: "24", name: "IMPORTACION",
    locationType: "STAGING", role: "IMPORT_STAGING",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_RECEIVE_TRANSFERS", "CAN_DISPATCH_TRANSFERS"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + 24,912 positive units + staging flow evidence" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "INVENTORY_DATA", description: "2,131 variants, 24,912 positive units", source: "BODEGA-DISCOVERY-01" },
      { type: "TRANSFER_DATA", description: "Containers feed into 24, then 24 feeds 01", source: "TRANSFER-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: null, parentLocationCode: null,
  },

  ...([
    { code: "42", name: "IMPO CONTENEDOR 6", qty: 368 },
    { code: "43", name: "IMPO CONTENEDOR 7", qty: 4424 },
    { code: "44", name: "IMPO CONTENEDOR 7-1", qty: 36069 },
    { code: "45", name: "IMPO CONTENEDOR 7-2", qty: 8620 },
    { code: "46", name: "IMPO CONTENEDOR 7-3", qty: 14901 },
  ] as const).map(({ code, name, qty }): InventoryLocation => ({
    code, name,
    locationType: "IMPORT", role: "IMPORT_STAGING",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_DISPATCH_TRANSFERS"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: `Master registry + 'IMPO CONTENEDOR' prefix + ${qty} positive units` },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "'IMPO CONTENEDOR' = import container", source: "BODEGA-DISCOVERY-01" },
      { type: "INVENTORY_DATA", description: `${qty} positive units = goods pending distribution`, source: "BODEGA-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: null, parentLocationCode: "24",
  })),

  // ── SPECIAL PURPOSE ────────────────────────────────────────────────────
  {
    code: "16", name: "MUESTRAS",
    locationType: "SERVICE", role: "TEMPORARY_HOLD",
    capabilities: ["HOLDS_SAMPLES"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + 62 variants (sample inventory)" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "'MUESTRAS' = samples", source: "BODEGA-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: null, parentLocationCode: null,
  },
  {
    code: "18", name: "ARREGLOS",
    locationType: "SERVICE", role: "RETURN_LOCATION",
    capabilities: ["CAN_RECEIVE_TRANSFERS"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + 'ARREGLOS' = repairs" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "'ARREGLOS' = repairs/alterations", source: "BODEGA-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: null, parentLocationCode: null,
  },
  {
    code: "19", name: "SEGUNDAS Y SALDOS",
    locationType: "SERVICE", role: "RETURN_LOCATION",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_SELL"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + 'SEGUNDAS Y SALDOS' = seconds/clearance" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "'SEGUNDAS Y SALDOS' = seconds and clearance", source: "BODEGA-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: null, parentLocationCode: null,
  },
  {
    code: "20", name: "TEMPORAL FLAMINGO",
    locationType: "TEMPORARY", role: "TEMPORARY_HOLD",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_RECEIVE_TRANSFERS", "CAN_DISPATCH_TRANSFERS"],
    status: "INACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + 'TEMPORAL' in name + 691 variants (all negative = historical)" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "'TEMPORAL' = temporary", source: "BODEGA-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: null, parentLocationCode: null,
  },
  {
    code: "28", name: "PLAN SEPARE",
    locationType: "SERVICE", role: "TEMPORARY_HOLD",
    capabilities: ["HOLDS_SELLABLE_STOCK"],
    status: "ACTIVE",
    confidence: { level: "HIGH", reason: "Master registry + 'PLAN SEPARE' = layaway" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "'PLAN SEPARE' = layaway plan", source: "BODEGA-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: null, parentLocationCode: null,
  },
  {
    code: "41", name: "DEXCATO. MC",
    locationType: "STORE", role: "SELLING_LOCATION",
    capabilities: ["HOLDS_SELLABLE_STOCK", "CAN_SELL", "CAN_BE_REPLENISHED", "CAN_RECEIVE_TRANSFERS"],
    status: "ACTIVE",
    confidence: { level: "MEDIUM", reason: "Master registry + name suggests outlet/discount. 354 variants" },
    source: { system: "SAG", entity: "BODEGAS", confirmedAt: "2026-04-08" },
    evidence: [
      { type: "MASTER_REGISTRY", description: "Listed in CASTILLITOS_BODEGAS", source: "castillitos-overrides.ts" },
      { type: "NAMING_PATTERN", description: "'DEXCATO' likely 'descuento' = discount/outlet", source: "BODEGA-DISCOVERY-01" },
      { type: "INVENTORY_DATA", description: "354 variants", source: "BODEGA-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: null, parentLocationCode: "01",
  },

  // ── UNKNOWN (discovered in DB, not in master registry) ─────────────────
  ...([
    { code: "22", qty: -8403,  hypothesis: "Inactive/renamed bodega (gap between 21-23)" },
    { code: "26", qty: 49109,  hypothesis: "Bulk container or special warehouse (high qty, few variants)" },
    { code: "27", qty: 33247,  hypothesis: "Similar to 26 — container or staging" },
    { code: "30", qty: 6143,   hypothesis: "Dispatch zone or staging (post-Caldas range)" },
    { code: "31", qty: 368,    hypothesis: "Specific container (very few variants)" },
    { code: "32", qty: 4424,   hypothesis: "Container or temporary area" },
    { code: "33", qty: 7275,   hypothesis: "Container or temporary area" },
    { code: "34", qty: 7998,   hypothesis: "Container or temporary area" },
    { code: "48", qty: 9175,   hypothesis: "Import container (follows 42-46 pattern)" },
    { code: "49", qty: 13506,  hypothesis: "Import container (follows 42-46 pattern)" },
  ] as const).map(({ code, qty, hypothesis }): InventoryLocation => ({
    code, name: `UNKNOWN (${code})`,
    locationType: "UNKNOWN", role: "UNKNOWN_ROLE",
    capabilities: qty > 0
      ? ["HOLDS_SELLABLE_STOCK", "CAN_DISPATCH_TRANSFERS"]
      : ["CAN_RECEIVE_TRANSFERS"],
    status: "UNVERIFIED",
    confidence: { level: "LOW", reason: `Found in ProductInventoryLevel but NOT in CASTILLITOS_BODEGAS. Hypothesis: ${hypothesis}` },
    source: { system: "SAG", entity: "ProductInventoryLevel", confirmedAt: null },
    evidence: [
      { type: "DISCOVERY", description: `Found in ProductInventoryLevel with qty=${qty}`, source: "BODEGA-DISCOVERY-01" },
      { type: "CODE_RANGE", description: hypothesis, source: "BODEGA-DISCOVERY-01" },
    ],
    sellerName: null, sellerId: null, storeSlug: null, parentLocationCode: null,
  })),
];

// ── Phase 6: Location Relationships ──────────────────────────────────────────

export const CASTILLITOS_LOCATION_RELATIONSHIPS: InventoryLocationRelationship[] = [
  // Production → Principal
  { sourceLocationCode: "04", targetLocationCode: "01", relationshipType: "FEEDS", confidence: "HIGH", evidence: "2,983 products shared (TRANSFER-DISCOVERY-01 Phase 5). ET fuente 116 = Entrada Producto Terminado" },

  // Raw material → Production
  { sourceLocationCode: "05", targetLocationCode: "04", relationshipType: "FEEDS", confidence: "HIGH", evidence: "CN fuente 80 = Consumos Insumos y Telas moves 05→04" },
  { sourceLocationCode: "06", targetLocationCode: "04", relationshipType: "FEEDS", confidence: "HIGH", evidence: "CN fuente 80 = Consumos Insumos y Telas moves 06→04" },

  // Principal → Stores
  { sourceLocationCode: "01", targetLocationCode: "00", relationshipType: "REPLENISHES", confidence: "HIGH", evidence: "73% product overlap. TR fuente 34 (TRANSFER-DISCOVERY-01)" },
  { sourceLocationCode: "01", targetLocationCode: "02", relationshipType: "REPLENISHES", confidence: "HIGH", evidence: "73% product overlap. TR fuente 34" },
  { sourceLocationCode: "01", targetLocationCode: "03", relationshipType: "REPLENISHES", confidence: "HIGH", evidence: "99% product overlap. TR fuente 34" },
  { sourceLocationCode: "01", targetLocationCode: "23", relationshipType: "REPLENISHES", confidence: "HIGH", evidence: "66% product overlap. TR fuente 34" },
  { sourceLocationCode: "01", targetLocationCode: "29", relationshipType: "REPLENISHES", confidence: "HIGH", evidence: "57% product overlap. TR fuente 34" },

  // Principal → Seller portfolios (via TM fuente 206)
  { sourceLocationCode: "01", targetLocationCode: "35", relationshipType: "SUPPLIES", confidence: "HIGH", evidence: "TM fuente 206 = Traslado de Maletas. VEND ORLANDO" },
  { sourceLocationCode: "01", targetLocationCode: "36", relationshipType: "SUPPLIES", confidence: "HIGH", evidence: "TM fuente 206. VEND CARLOS LEON" },
  { sourceLocationCode: "01", targetLocationCode: "37", relationshipType: "SUPPLIES", confidence: "HIGH", evidence: "TM fuente 206. VEND LUIS" },
  { sourceLocationCode: "01", targetLocationCode: "38", relationshipType: "SUPPLIES", confidence: "HIGH", evidence: "TM fuente 206. VEND NESTOR" },
  { sourceLocationCode: "01", targetLocationCode: "39", relationshipType: "SUPPLIES", confidence: "HIGH", evidence: "TM fuente 206. VEND CARLOS VILLA" },
  { sourceLocationCode: "01", targetLocationCode: "40", relationshipType: "SUPPLIES", confidence: "HIGH", evidence: "TM fuente 206. VEND FREDY" },

  // Principal → Franchises
  ...["08", "09", "10", "11", "12", "13", "14", "15", "21"].map((code) => ({
    sourceLocationCode: "01",
    targetLocationCode: code,
    relationshipType: "SUPPLIES" as const,
    confidence: "MEDIUM" as const,
    evidence: "Franchise receives stock from principal via TR fuente 34. Historical outflow only",
  })),

  // Import flow: Containers → Staging → Principal
  ...["42", "43", "44", "45", "46"].map((code) => ({
    sourceLocationCode: code,
    targetLocationCode: "24",
    relationshipType: "FEEDS" as const,
    confidence: "HIGH" as const,
    evidence: "Import container feeds staging area 24 (TRANSFER-DISCOVERY-01 Phase 8)",
  })),
  { sourceLocationCode: "24", targetLocationCode: "01", relationshipType: "FEEDS", confidence: "HIGH", evidence: "Staging 24 feeds principal 01 after nationalization" },
];

// ── Phase 7: Location Hierarchy ──────────────────────────────────────────────

export const CASTILLITOS_LOCATION_HIERARCHY: InventoryLocationHierarchy[] = [
  {
    groupName: "HUB PRINCIPAL",
    groupType: "HUB",
    locationCodes: ["01"],
    parentGroup: null,
  },
  {
    groupName: "PRODUCCION",
    groupType: "PRODUCTION",
    locationCodes: ["04", "05", "06", "07"],
    parentGroup: null,
  },
  {
    groupName: "TIENDAS PROPIAS",
    groupType: "SALES",
    locationCodes: ["00", "02", "03", "23", "29", "41"],
    parentGroup: "HUB PRINCIPAL",
  },
  {
    groupName: "MALETAS VENDEDORES",
    groupType: "PORTFOLIOS",
    locationCodes: ["35", "36", "37", "38", "39", "40"],
    parentGroup: "HUB PRINCIPAL",
  },
  {
    groupName: "FRANQUICIAS",
    groupType: "SALES",
    locationCodes: ["08", "09", "10", "11", "12", "13", "14", "15", "21"],
    parentGroup: "HUB PRINCIPAL",
  },
  {
    groupName: "IMPORTACIONES",
    groupType: "IMPORTS",
    locationCodes: ["24", "42", "43", "44", "45", "46"],
    parentGroup: null,
  },
  {
    groupName: "SOPORTE",
    groupType: "SUPPORT",
    locationCodes: ["16", "18", "19", "20", "28"],
    parentGroup: null,
  },
];
