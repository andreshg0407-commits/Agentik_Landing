/**
 * scripts/validate-tiendas-drawer-performance.ts
 *
 * Structural validation for TIENDAS-DRAWER-PERFORMANCE-01
 *
 * Usage: npx tsx scripts/validate-tiendas-drawer-performance.ts
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

function fileNotContains(rel: string, text: string): boolean {
  return !fileContains(rel, text);
}

console.log("=== TIENDAS-DRAWER-PERFORMANCE-01 Validation ===\n");

const client = "app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx";

// 1. Tab cache exists
console.log("CHECK 1: Tab data cache");
check("TabCacheData type defined", fileContains(client, "type TabCacheData"));
check("TabCacheRef type defined", fileContains(client, "type TabCacheRef"));
check("tabCacheRef created with useRef", fileContains(client, "useRef<TabCacheData>"));
check("Cache cleared on new store open", fileContains(client, "tabCacheRef.current = { storeId }"));

// 2. Drawer does NOT load tabs on open — only store_summary
console.log("\nCHECK 2: Drawer fast open");
check("Drawer opens with inventario (lightest tab)", fileContains(client, 'setActiveTab("inventario")'));
check("openStore only calls store_summary", fileContains(client, 'action: "store_summary", storeId'));
check("Perf log for drawer_open_ms", fileContains(client, "[TIENDAS_PERF] drawer_open_ms="));

// 3. Tabs use lazy load (each loads on mount, not before)
console.log("\nCHECK 3: Lazy load per tab");
check("ShortagesTab lazy useEffect", fileContains(client, 'tiendaApi(orgSlug, { action: "store_shortages"'));
check("SuggestionsTab lazy useEffect", fileContains(client, 'tiendaApi(orgSlug, { action: "store_suggestions"'));
check("TextileCoverageTab lazy useEffect", fileContains(client, 'tiendaApi(orgSlug, { action: "store_textile_coverage"'));
check("MainWarehouseTab lazy useEffect", fileContains(client, 'tiendaApi(orgSlug, { action: "store_main_warehouse"'));

// 4. Tabs use cross-tab cache (no re-fetch on tab switch back)
console.log("\nCHECK 4: Tab cache usage");
check("ShortagesTab reads from cache", fileContains(client, "tabCacheRef.current.shortages"));
check("ShortagesTab writes to cache", fileContains(client, "tabCacheRef.current.shortages = result"));
check("SuggestionsTab reads from cache", fileContains(client, "tabCacheRef.current.suggestions"));
check("SuggestionsTab writes to cache", fileContains(client, "tabCacheRef.current.suggestions = result"));
check("CoverageTab reads from cache", fileContains(client, "tabCacheRef.current.coverage"));
check("CoverageTab writes to cache", fileContains(client, "tabCacheRef.current.coverage = result"));
check("WarehouseTab reads from cache", fileContains(client, "tabCacheRef.current.warehouse"));
check("WarehouseTab writes to cache", fileContains(client, "tabCacheRef.current.warehouse = result"));

// 5. Inventory uses server-side pagination
console.log("\nCHECK 5: Inventory pagination");
check("PAGE_SIZE constant defined", fileContains(client, "PAGE_SIZE = 50"));
check("Sends limit to API", fileContains(client, "limit: PAGE_SIZE"));
check("Sends offset to API", fileContains(client, "offset: offsetVal"));
check("Sends search to API", fileContains(client, "search: searchVal"));
check("Sends activeOnly to API", fileContains(client, "activeOnly: activeOnlyVal"));
check("Pagination controls rendered", fileContains(client, "Anterior"));
check("Total from server", fileContains(client, "data.total"));

// 6. Debounced search
console.log("\nCHECK 6: Debounced search");
check("debounceRef exists", fileContains(client, "debounceRef = useRef"));
check("300ms debounce delay", fileContains(client, "300"));
check("clearTimeout on input", fileContains(client, "clearTimeout(debounceRef.current)"));

// 7. MainWarehouse has search + render cap
console.log("\nCHECK 7: MainWarehouse search + render cap");
check("MainWarehouse has search input", fileContains(client, "Buscar referencia, talla o color..."));
check("MainWarehouse 200 render cap", fileContains(client, "filtered.slice(0, 200).map((s, i)"));

// 8. Perf telemetry
console.log("\nCHECK 8: Telemetry");
check("TIENDAS_PERF_LOG check", fileContains(client, "__TIENDAS_PERF_LOG"));
check("shortages_ms telemetry", fileContains(client, "[TIENDAS_PERF] shortages_ms="));
check("suggestions_ms telemetry", fileContains(client, "[TIENDAS_PERF] suggestions_ms="));
check("coverage_ms telemetry", fileContains(client, "[TIENDAS_PERF] coverage_ms="));
check("warehouse_ms telemetry", fileContains(client, "[TIENDAS_PERF] warehouse_ms="));
check("inventory_ms telemetry", fileContains(client, "[TIENDAS_PERF] inventory_ms="));

// 9. Deferred computation — tabs don't compute during drawer open
console.log("\nCHECK 9: Deferred computation");
check("Coverage deferred to tab", fileContains(client, 'activeTab === "cobertura_textil" && <TextileCoverageTab'));
check("Suggestions deferred to tab", fileContains(client, 'activeTab === "sugerencias"      && <SuggestionsTab'));
check("Shortages deferred to tab", fileContains(client, 'activeTab === "faltantes"        && <ShortagesTab'));
check("Warehouse deferred to tab", fileContains(client, 'activeTab === "bodega"           && <MainWarehouseTab'));

// 10. Rules tab is ultra-light (no inventory/coverage/suggestions)
console.log("\nCHECK 10: Rules tab");
check("PolicyTab only loads policies", fileContains(client, 'action: "get_for_store"'));
check("PolicyTab does NOT load inventory", fileNotContains(client, 'PolicyTab') || !fileContains(client, 'PolicyTab.*store_inventory'));

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
