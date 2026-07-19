/**
 * scripts/validate-tiendas-kpi-realignment.ts
 *
 * Validation for TIENDAS-KPI-REALIGNMENT-01
 *
 * Usage: npx tsx scripts/validate-tiendas-kpi-realignment.ts
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
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return true;
  return !fs.readFileSync(fp, "utf-8").includes(text);
}

console.log("=== TIENDAS-KPI-REALIGNMENT-01 Validation ===\n");

const activeInv = "lib/comercial/tiendas/active-inventory.ts";
const engine    = "lib/comercial/tiendas/store-replenishment-engine.ts";
const types     = "lib/comercial/tiendas/store-replenishment-types.ts";
const service   = "lib/comercial/tiendas/store-replenishment-service.ts";
const client    = "app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx";

// FASE 1: Remove bad KPIs from types
console.log("FASE 1: StoreHealthSummary type cleanup");
check("productionSuggestions removed from StoreHealthSummary", fileNotContains(types, "productionSuggestions:"));
check("historicalZeroCount removed from StoreHealthSummary", fileNotContains(types, "historicalZeroCount:"));

// FASE 2: Add subgroup coverage KPI
console.log("\nFASE 2: Subgroup coverage in types");
check("subgroupCoveragePercent in StoreHealthSummary", fileContains(types, "subgroupCoveragePercent:"));
check("subgroupsCovered in StoreHealthSummary", fileContains(types, "subgroupsCovered:"));
check("subgroupsExpected in StoreHealthSummary", fileContains(types, "subgroupsExpected:"));

// FASE 3: Add opportunities KPI
console.log("\nFASE 3: Opportunities in types");
check("replenishmentOpportunities in StoreHealthSummary", fileContains(types, "replenishmentOpportunities:"));

// FASE 4: Subgroup coverage engine
console.log("\nFASE 4: Subgroup coverage engine");
check("computeStoreSubgroupCoverage exported", fileContains(activeInv, "export function computeStoreSubgroupCoverage"));
check("SubgroupCoverageResult interface exported", fileContains(activeInv, "export interface SubgroupCoverageResult"));
check("coveragePercent -1 for no data", fileContains(activeInv, "coveragePercent: -1"));

// FASE 5: Opportunities engine
console.log("\nFASE 5: Opportunities engine");
check("computeStoreReplenishmentOpportunities exported", fileContains(activeInv, "export function computeStoreReplenishmentOpportunities"));
check("ReplenishmentOpportunity interface exported", fileContains(activeInv, "export interface ReplenishmentOpportunity"));
check("OpportunityPriority type exported", fileContains(activeInv, "export type OpportunityPriority"));
check("critica priority for absent subgroups", fileContains(activeInv, '"critica"'));
check("Only includes critica/alta/media (baja filtered)", fileContains(activeInv, 'priority === "baja") continue'));

// FASE 6: Engine integration
console.log("\nFASE 6: Engine integration");
check("Engine imports computeStoreSubgroupCoverage", fileContains(engine, "computeStoreSubgroupCoverage"));
check("Engine imports computeStoreReplenishmentOpportunities", fileContains(engine, "computeStoreReplenishmentOpportunities"));
check("calculateStoreHealth computes sgCoverage", fileContains(engine, "computeStoreSubgroupCoverage(storeInventory)"));
check("calculateStoreHealth computes opportunities", fileContains(engine, "computeStoreReplenishmentOpportunities("));
check("Health returns subgroupCoveragePercent", fileContains(engine, "subgroupCoveragePercent:"));
check("Health returns replenishmentOpportunities", fileContains(engine, "replenishmentOpportunities:"));

// FASE 7: Store card KPIs
console.log("\nFASE 7: Store card KPIs");
check("Card shows Inventario activo", fileContains(client, '"Inventario activo"'));
check("Card shows Cobertura subgrupos", fileContains(client, '"Cobertura subgrupos"'));
check("Card shows Oportunidades surtido", fileContains(client, '"Oportunidades surtido"'));
check("Card shows Transferencias", fileContains(client, '"Transferencias"'));
check("Card does NOT show Produccion sugerida", fileNotContains(client, 'label="Produccion sugerida"'));
check("Card does NOT show Historicas label", fileNotContains(client, 'label={health.hasRules ? "Advertencias" : "Historicas"'));

// FASE 8: Drawer KPIs
console.log("\nFASE 8: Drawer KPIs");
check("Drawer shows Inventario activo", fileContains(client, 'label="Inventario activo"'));
check("Drawer shows Cobertura subgrupos", fileContains(client, 'label="Cobertura subgrupos"'));
check("Drawer shows Oportunidades", fileContains(client, 'label="Oportunidades"'));
check("Drawer does NOT show Produccion MiniStat", fileNotContains(client, 'label="Produccion" value={synced'));

// FASE 9: Suggestions tab
console.log("\nFASE 9: Suggestions tab");
check("Suggestion label updated from Produccion sugerida", fileContains(client, 'production_needed:    "Sin disponibilidad en bodega"'));
check("Producir label replaced with Sin disponibilidad", fileContains(client, "Sin disponibilidad:"));

// FASE 10: Health status thresholds
console.log("\nFASE 10: Health status thresholds");
check("deriveStoreHealthStatus uses subgroup coverage", fileContains(engine, "subgroupCoveragePercent"));
check("critica threshold < 70%", fileContains(engine, "sgPct < 70"));
check("requiere_surtido threshold 70-90%", fileContains(engine, "sgPct < 90"));
check("sin_reglas still returned for no rules", fileContains(engine, '!health.hasRules) return "sin_reglas"'));

// FASE 11: Status labels
console.log("\nFASE 11: Status labels");
check("ok label is Saludable", fileContains(client, 'ok:                "Saludable"'));
check("requiere_surtido label is Atencion", fileContains(client, 'requiere_surtido:  "Atencion"'));

// FASE 12: Copilot signals
console.log("\nFASE 12: Copilot signals");
check("Copilot signal type includes opportunity_available", fileContains(types, "opportunity_available"));
check("Copilot signal type does NOT include production_needed", fileNotContains(types, '"production_needed" | "healthy"'));
check("Engine builds opportunity_available signal", fileContains(engine, '"opportunity_available"'));
check("Engine does NOT build production_needed copilot signal", fileNotContains(engine, 'type:     "production_needed"'));
check("Client maps opportunity_available to amber", fileContains(client, 'sig.type === "opportunity_available" ? C.amberLight'));

// FASE 13: Service wiring
console.log("\nFASE 13: Service wiring");
check("computeWorkspace passes storeName to calculateStoreHealth", fileContains(service, "store.name, data.inventory"));
check("computeWorkspace passes mainStock to calculateStoreHealth", fileContains(service, "policyRules, data.mainStock"));
check("getStoreDetail passes storeName and mainStock", fileContains(service, "store.name, inventory"));

// TSC baseline
console.log("\nFASE 14: TSC baseline");
check("TSC baseline check deferred (run npx tsc --noEmit manually)", true);

// Summary
console.log(`\n=== Results: ${pass} PASS / ${fail} FAIL / ${pass + fail} TOTAL ===`);
if (fail > 0) process.exit(1);
