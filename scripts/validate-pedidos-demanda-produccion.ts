/**
 * scripts/validate-pedidos-demanda-produccion.ts
 *
 * PEDIDOS-DEMANDA-PRODUCCION-01
 *
 * Validates:
 * - Demand engine existence and exports
 * - Variant demand analytics
 * - Inventory coverage engine
 * - Stockout detector
 * - Production signal engine
 * - Commercial impact engine
 * - Replacement engine
 * - API route wiring
 * - UI integration (main page + drawer)
 *
 * Usage:
 *   npx tsx scripts/validate-pedidos-demanda-produccion.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
let pass = 0;
let fail = 0;

function check(label: string, ok: boolean) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

function fileContains(rel: string, needle: string): boolean {
  const fullPath = path.join(ROOT, rel);
  if (!fs.existsSync(fullPath)) return false;
  return fs.readFileSync(fullPath, "utf-8").includes(needle);
}

function fileExists(rel: string): boolean {
  return fs.existsSync(path.join(ROOT, rel));
}

console.log("=== PEDIDOS DEMANDA PRODUCCION VALIDATION ===\n");

// ── 1. Demand engine ────────────────────────────────────────────────────────
const engine = "lib/comercial/demand/demand-engine.ts";
console.log("[1] Demand engine");
check("file exists", fileExists(engine));
check("exports buildDemandSnapshot", fileContains(engine, "export async function buildDemandSnapshot"));
check("exports DemandSnapshot type", fileContains(engine, "export interface DemandSnapshot"));
check("exports DemandRefEntry type", fileContains(engine, "export interface DemandRefEntry"));
check("exports CoverageBand type", fileContains(engine, "export type CoverageBand"));
check("reads CustomerOrderLine", fileContains(engine, '"CustomerOrderLine"'));
check("reads ProductInventoryLevel", fileContains(engine, '"ProductInventoryLevel"'));
check("reads ProductEntity", fileContains(engine, '"ProductEntity"'));
check("server-only guard", fileContains(engine, 'import "server-only"'));
check("sprint tag", fileContains(engine, "PEDIDOS-DEMANDA-PRODUCCION-01"));

// ── 2. Variant demand analytics ──────────────────────────────────────────────
const analytics = "lib/comercial/demand/variant-demand-analytics.ts";
console.log("\n[2] Variant demand analytics");
check("file exists", fileExists(analytics));
check("exports getVariantDemandMetrics", fileContains(analytics, "export async function getVariantDemandMetrics"));
check("exports VariantDemandMetrics type", fileContains(analytics, "export interface VariantDemandMetrics"));
check("topSizes in metrics", fileContains(analytics, "topSizes"));
check("topColors in metrics", fileContains(analytics, "topColors"));
check("topCombinations in metrics", fileContains(analytics, "topCombinations"));
check("topRefs in metrics", fileContains(analytics, "topRefs"));
check("topSubgrupos in metrics", fileContains(analytics, "topSubgrupos"));
check("uses color map builder", fileContains(analytics, "buildColorMap"));
check("server-only guard", fileContains(analytics, 'import "server-only"'));

// ── 3. Inventory coverage engine ─────────────────────────────────────────────
const coverage = "lib/comercial/demand/inventory-coverage-engine.ts";
console.log("\n[3] Inventory coverage engine");
check("file exists", fileExists(coverage));
check("exports buildCoverageSummary", fileContains(coverage, "export function buildCoverageSummary"));
check("exports CoverageSummary type", fileContains(coverage, "export interface CoverageSummary"));
check("exports CoverageDistribution type", fileContains(coverage, "export interface CoverageDistribution"));
check("critical refs extracted", fileContains(coverage, "critical"));
check("avgCoverageDays computed", fileContains(coverage, "avgCoverageDays"));
check("server-only guard", fileContains(coverage, 'import "server-only"'));

// ── 4. Stockout detector ─────────────────────────────────────────────────────
const stockout = "lib/comercial/demand/stockout-detector.ts";
console.log("\n[4] Stockout detector");
check("file exists", fileExists(stockout));
check("exports detectStockouts", fileContains(stockout, "export function detectStockouts"));
check("exports StockoutAlert type", fileContains(stockout, "export interface StockoutAlert"));
check("exports StockoutSummary type", fileContains(stockout, "export interface StockoutSummary"));
check("severity levels: critical/high/medium/low", fileContains(stockout, '"critical" | "high" | "medium" | "low"'));
check("estimatedLostUnits computed", fileContains(stockout, "estimatedLostUnits"));

// ── 5. Production signal engine ──────────────────────────────────────────────
const production = "lib/comercial/demand/production-signal-engine.ts";
console.log("\n[5] Production signal engine");
check("file exists", fileExists(production));
check("exports generateProductionSignals", fileContains(production, "export function generateProductionSignals"));
check("exports ProductionSignal type", fileContains(production, "export interface ProductionSignal"));
check("urgency levels", fileContains(production, '"urgente" | "alta" | "media" | "baja"'));
check("suggestedQty computed", fileContains(production, "suggestedQty"));
check("reason: sin_stock_con_demanda", fileContains(production, "sin_stock_con_demanda"));
check("sprint tag", fileContains(production, "PEDIDOS-DEMANDA-PRODUCCION-01"));

// ── 6. Commercial impact engine ──────────────────────────────────────────────
const impact = "lib/comercial/demand/commercial-impact.ts";
console.log("\n[6] Commercial impact engine");
check("file exists", fileExists(impact));
check("exports computeCommercialImpact", fileContains(impact, "export function computeCommercialImpact"));
check("exports CommercialImpactSummary type", fileContains(impact, "export interface CommercialImpactSummary"));
check("byRef breakdown", fileContains(impact, "byRef"));
check("bySubgrupo breakdown", fileContains(impact, "bySubgrupo"));
check("estimatedLostUnitsPerWeek", fileContains(impact, "estimatedLostUnitsPerWeek"));

// ── 7. Replacement engine ────────────────────────────────────────────────────
const replacement = "lib/comercial/demand/replacement-engine.ts";
console.log("\n[7] Replacement engine");
check("file exists", fileExists(replacement));
check("exports findReplacements", fileContains(replacement, "export function findReplacements"));
check("exports SuggestedReplacement type", fileContains(replacement, "export interface SuggestedReplacement"));
check("matches by subgrupoSag", fileContains(replacement, "subgrupoSag"));
check("stockoutsWithOptions count", fileContains(replacement, "stockoutsWithOptions"));

// ── 8. API route ─────────────────────────────────────────────────────────────
const route = "app/api/orgs/[orgSlug]/comercial/demand/route.ts";
console.log("\n[8] API route");
check("file exists", fileExists(route));
check("imports buildDemandSnapshot", fileContains(route, "buildDemandSnapshot"));
check("imports getVariantDemandMetrics", fileContains(route, "getVariantDemandMetrics"));
check("imports buildCoverageSummary", fileContains(route, "buildCoverageSummary"));
check("imports detectStockouts", fileContains(route, "detectStockouts"));
check("imports generateProductionSignals", fileContains(route, "generateProductionSignals"));
check("imports computeCommercialImpact", fileContains(route, "computeCommercialImpact"));
check("imports findReplacements", fileContains(route, "findReplacements"));
check("snapshot action", fileContains(route, '"snapshot"'));
check("variant_analytics action", fileContains(route, '"variant_analytics"'));
check("coverage action", fileContains(route, '"coverage"'));
check("stockouts action", fileContains(route, '"stockouts"'));
check("production_signals action", fileContains(route, '"production_signals"'));
check("commercial_impact action", fileContains(route, '"commercial_impact"'));
check("replacements action", fileContains(route, '"replacements"'));
check("sprint tag", fileContains(route, "PEDIDOS-DEMANDA-PRODUCCION-01"));

// ── 9. UI: Main page demand cards ────────────────────────────────────────────
const client = "app/(app)/[orgSlug]/comercial/pedidos/pedidos-client.tsx";
console.log("\n[9] Main page demand intelligence section");
check("demandSummary state", fileContains(client, "demandSummary"));
check("fetches demand snapshot", fileContains(client, "/comercial/demand"));
check("Inteligencia de demanda label", fileContains(client, "Inteligencia de demanda"));
check("shows refsWithDemand", fileContains(client, "refsWithDemand"));
check("shows refsInStockout", fileContains(client, "refsInStockout"));
check("shows avgDailyVelocity", fileContains(client, "avgDailyVelocity"));

// ── 10. UI: Drawer demand tab ────────────────────────────────────────────────
console.log("\n[10] Drawer demand tab");
check("demanda tab in DetailTab type", fileContains(client, '"demanda"'));
check("DemandIntelligencePanel component", fileContains(client, "function DemandIntelligencePanel"));
check("demandData state in drawer", fileContains(client, "demandData"));
check("tab button for demanda", fileContains(client, 'tabBtn("demanda"'));
check("demand tab content rendered", fileContains(client, 'activeTab === "demanda"'));
check("top refs por velocidad label", fileContains(client, "Top refs por velocidad de demanda"));
check("stockouts section", fileContains(client, "Stockouts con demanda activa"));
check("coverage badge helper", fileContains(client, "coverageBadge"));
check("sprint tag", fileContains(client, "PEDIDOS-DEMANDA-PRODUCCION-01"));

// ── Summary ─────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(`\n=== VALIDATION COMPLETE: ${pass}/${total} PASS, ${fail} FAIL ===`);
process.exit(fail > 0 ? 1 : 0);
