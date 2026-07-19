/**
 * lib/comercial/tiendas/store-needs-types.ts
 *
 * FASE 1 — Domain types for the Store Needs Engine.
 * Pure types — no runtime logic, no Prisma, no imports.
 *
 * Sprint: TIENDAS-INVENTORY-02
 */

import type { StorePolicyScope, StoreProductClass, StoreSizeClass } from "./store-policy-types";

// ── Need status ─────────────────────────────────────────────────────────────

export type NeedStatus = "out" | "low" | "healthy" | "overstock";

// ── Policy source (how the threshold was resolved) ──────────────────────────

export type NeedPolicySource =
  | "variant_override"
  | "reference"
  | "line_subgroup"
  | "subgroup"
  | "line"
  | "class_size"
  | "class"
  | "store_default"
  | "global_default";

// ── Store replenishment need ────────────────────────────────────────────────

export interface StoreNeed {
  // Location
  storeId:        string;
  storeName:      string;
  warehouseId:    string;
  warehouseName:  string;

  // Product identity
  productId:      string;
  referenceCode:  string;
  productName:    string;

  // Classification
  line:           string;
  subgroup:       string;
  productClass:   StoreProductClass;
  sizeClass?:     StoreSizeClass;

  // Variant (textile: populated, bulky: may be empty)
  size:           string;
  color:          string;

  // Quantities
  currentStoreQty:    number;
  minQty:             number;
  idealQty:           number;
  maxQty:             number;
  neededQty:          number;
  mainWarehouseQty:   number;

  // Evaluation
  status:         NeedStatus;
  priorityScore:  number;
  policySource:   NeedPolicySource;
}

// ── Store needs summary (aggregation) ───────────────────────────────────────

export interface StoreNeedsSummary {
  storeId:      string;
  storeName:    string;
  outCount:     number;
  lowCount:     number;
  healthyCount: number;
  overstockCount: number;
  totalNeeds:   number;
  topPriority:  number;
}

export interface LineNeedsSummary {
  line:         string;
  outCount:     number;
  lowCount:     number;
  healthyCount: number;
  overstockCount: number;
}

export interface SubgroupNeedsSummary {
  subgroup:     string;
  outCount:     number;
  lowCount:     number;
  healthyCount: number;
  overstockCount: number;
}

// ── Engine input ────────────────────────────────────────────────────────────

export interface StoreNeedsInput {
  storeId:       string;
  storeName:     string;
  warehouseId:   string;
  warehouseName: string;
}

export interface InventoryItem {
  productId:     string;
  referenceCode: string;
  productName:   string;
  line:          string;
  subgroup:      string;
  category:      string;
  productClass:  StoreProductClass;
  sizeClass?:    StoreSizeClass;
  size:          string;
  color:         string;
  currentQty:    number;
}

export interface MainWarehouseStock {
  referenceCode: string;
  size:          string;
  color:         string;
  availableQty:  number;
}
