/**
 * scripts/validate-tiendas-performance-load.ts
 *
 * Validation for TIENDAS-PERFORMANCE-LOAD-01
 *
 * Usage: npx tsx scripts/validate-tiendas-performance-load.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean) {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else    { fail++; console.log(`  FAIL  ${label}`); }
}

function fileContains(rel: string, text: string): boolean {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return false;
  return fs.readFileSync(fp, "utf-8").includes(text);
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

console.log("=== TIENDAS-PERFORMANCE-LOAD-01 Validation ===\n");

const service = "lib/comercial/tiendas/store-replenishment-service.ts";
const adapter = "lib/comercial/tiendas/sag-store-adapter.ts";
const route   = "app/api/orgs/[orgSlug]/comercial/tiendas/route.ts";
const client  = "app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx";

// 1. Batch inventory query (N+1 elimination)
console.log("CHECK 1: Batch inventory query");
check("loadBatchStoreInventory exists in adapter", fileContains(adapter, "loadBatchStoreInventory"));
check("Batch uses warehouseId: { in: } pattern", fileContains(adapter, "warehouseId: { in:"));
check("Performance markers in adapter", fileContains(adapter, "[TIENDAS_PERF]"));

// 2. In-memory TTL cache
console.log("\nCHECK 2: In-memory TTL cache");
check("getCached function exists", fileContains(service, "function getCached"));
check("setCache function exists", fileContains(service, "function setCache"));
check("TTL_DATA constant", fileContains(service, "TTL_DATA"));
check("TTL_POLICIES constant", fileContains(service, "TTL_POLICIES"));
check("Cache uses Map", fileContains(service, "new Map<string, CacheEntry"));
check("Cache checks expiration", fileContains(service, "expiresAt"));

// 3. Shared data+policy resolver
console.log("\nCHECK 3: Shared data+policy resolver");
check("resolveDataAndPolicies function exists", fileContains(service, "async function resolveDataAndPolicies"));
check("resolveData function exists", fileContains(service, "async function resolveData"));
check("Performance markers in service", fileContains(service, "[TIENDAS_PERF]"));

// 4. Per-tab lazy service functions
console.log("\nCHECK 4: Per-tab lazy service functions");
check("getStoreSummary exported", fileContains(service, "export async function getStoreSummary"));
check("getStoreShortages exported", fileContains(service, "export async function getStoreShortages"));
check("getStoreSuggestionsLazy exported", fileContains(service, "export async function getStoreSuggestionsLazy"));
check("getStoreTextileCoverage exported", fileContains(service, "export async function getStoreTextileCoverage"));
check("getStoreMainWarehouse exported", fileContains(service, "export async function getStoreMainWarehouse"));
check("getStoreInventoryPaginated exported", fileContains(service, "export async function getStoreInventoryPaginated"));

// 5. Textile coverage NOT in getStoreDetail
console.log("\nCHECK 5: Textile coverage lazy loaded");
check("textileCoverage removed from getStoreDetail return", !fileContains(service, "return { store, health, shortages, suggestions, rules, mainWarehouse: data.mainStock, assortmentNeeds, textileCoverage }"));
check("Textile coverage comment in getStoreDetail", fileContains(service, "Textile coverage NOT computed here"));

// 6. API route per-tab actions
console.log("\nCHECK 6: API route per-tab actions");
check("store_summary action", fileContains(route, '"store_summary"'));
check("store_inventory action", fileContains(route, '"store_inventory"'));
check("store_shortages action", fileContains(route, '"store_shortages"'));
check("store_suggestions action", fileContains(route, '"store_suggestions"'));
check("store_textile_coverage action", fileContains(route, '"store_textile_coverage"'));
check("store_main_warehouse action", fileContains(route, '"store_main_warehouse"'));
check("stock_lookup action preserved", fileContains(route, '"stock_lookup"'));
check("store_detail legacy action preserved", fileContains(route, '"store_detail"'));

// 7. Client: lazy drawer open
console.log("\nCHECK 7: Client lazy drawer open");
check("openStore uses store_summary", fileContains(client, 'action: "store_summary"'));
check("openStore does NOT use store_detail", !fileContains(client, 'action: "store_detail"'));
check("StoreSummaryData interface", fileContains(client, "interface StoreSummaryData"));
check("selectedStore uses StoreSummaryData", fileContains(client, "useState<StoreSummaryData | null>"));

// 8. Client: self-loading tabs
console.log("\nCHECK 8: Client self-loading tabs");
check("ShortagesTab has orgSlug prop", fileContains(client, "ShortagesTab orgSlug={orgSlug} storeId={store.id}"));
check("SuggestionsTab has orgSlug prop", fileContains(client, "SuggestionsTab orgSlug={orgSlug} storeId={store.id}"));
check("TextileCoverageTab has orgSlug prop", fileContains(client, "TextileCoverageTab orgSlug={orgSlug} storeId={store.id}"));
check("MainWarehouseTab has orgSlug prop", fileContains(client, "MainWarehouseTab orgSlug={orgSlug}"));

// 9. Client: tabs fetch their own data
console.log("\nCHECK 9: Tabs fetch own data");
check("ShortagesTab fetches store_shortages", fileContains(client, 'action: "store_shortages"'));
check("SuggestionsTab fetches store_suggestions", fileContains(client, 'action: "store_suggestions"'));
check("TextileCoverageTab fetches store_textile_coverage", fileContains(client, 'action: "store_textile_coverage"'));
check("MainWarehouseTab fetches store_main_warehouse", fileContains(client, 'action: "store_main_warehouse"'));
check("InventarioTab fetches store_inventory", fileContains(client, 'action: "store_inventory"'));

// 10. Client: loading states
console.log("\nCHECK 10: Loading states");
check("ShortagesTab shows loading", fileContains(client, "Cargando faltantes"));
check("SuggestionsTab shows loading", fileContains(client, "Cargando sugerencias"));
check("TextileCoverageTab shows loading", fileContains(client, "Cargando cobertura textil"));
check("MainWarehouseTab shows loading", fileContains(client, "Cargando bodega principal"));

// 11. Proposal creation loads suggestions on demand
console.log("\nCHECK 11: Proposal creation");
check("handleCreateProposal takes StoreSummaryData", fileContains(client, "handleCreateProposal(summary: StoreSummaryData)"));
check("Proposal loads suggestions on demand", fileContains(client, 'action: "store_suggestions", storeId: summary.store.id'));

// 12. No StoreDetailData in client state
console.log("\nCHECK 12: Clean separation");
check("StoreDetailData NOT in client state", !fileContains(client, "useState<StoreDetailData"));
check("useEffect imported for lazy loading", fileContains(client, "useEffect"));
check("tiendaApi helper exists", fileContains(client, "async function tiendaApi"));

// 13. Pagination support
console.log("\nCHECK 13: Pagination support");
check("getStoreInventoryPaginated accepts limit/offset/search", fileContains(service, "limit?: number; offset?: number; search?: string"));
check("API route passes pagination params", fileContains(route, "body.limit"));

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
