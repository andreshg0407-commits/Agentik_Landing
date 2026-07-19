/**
 * scripts/_validate-commercial-integration-01.ts
 *
 * Structural validation for COMMERCIAL-INTEGRATION-01.
 * Run: npx tsx scripts/_validate-commercial-integration-01.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const BP = path.join(ROOT, "lib/comercial/business-policy");
const TIENDAS = path.join(ROOT, "lib/comercial/tiendas");
const PEDIDOS = path.join(ROOT, "lib/comercial/pedidos");
const REPS = path.join(ROOT, "lib/comercial/sales-reps");
const IMPORTS = path.join(ROOT, "lib/comercial/importaciones");
const MALETAS = path.join(ROOT, "lib/comercial/maletas");
const PROD = path.join(ROOT, "lib/comercial/produccion");

let passed = 0;
let failed = 0;
let section = 0;

function header(title: string) {
  section++;
  console.log(`\n${"─".repeat(20)} ${section}: ${title} ${"─".repeat(20)}`);
}

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function readFile(dir: string, name: string): string {
  return fs.readFileSync(path.join(dir, name), "utf-8");
}

function fileExists(dir: string, name: string): boolean {
  return fs.existsSync(path.join(dir, name));
}

// ── 1: New file inventory ─────────────────────────────────────────────────

header("New file inventory");

const newFiles = [
  [BP, "business-decision-types.ts"],
  [BP, "commercial-decision-aggregator.ts"],
  [TIENDAS, "store-business-decisions.ts"],
  [PEDIDOS, "order-business-decisions.ts"],
  [REPS, "sales-rep-business-decisions.ts"],
  [IMPORTS, "import-business-decisions.ts"],
  [MALETAS, "maletas-business-decisions.ts"],
  [PROD, "production-business-decisions.ts"],
] as const;

for (const [dir, file] of newFiles) {
  check(`${file} exists`, fileExists(dir, file));
}

// ── 2: No Prisma imports ──────────────────────────────────────────────────

header("No Prisma / DB imports in new files");

for (const [dir, file] of newFiles) {
  const content = readFile(dir, file);
  check(`${file}: no Prisma`, !content.includes('from "@prisma') && !content.includes("from '@prisma"));
  check(`${file}: no prisma variable`, !content.includes("prisma."));
}

// ── 3: No React imports ──────────────────────────────────────────────────

header("No React / UI imports in new files");

for (const [dir, file] of newFiles) {
  const content = readFile(dir, file);
  check(`${file}: no React`, !content.includes('from "react"') && !content.includes("from 'react'"));
}

// ── 4: No side effects ─────────────────────────────────────────────────────

header("No side effects in new files");

for (const [dir, file] of newFiles) {
  const content = readFile(dir, file);
  check(`${file}: no fetch()`, !content.includes("fetch("));
  check(`${file}: no console.log`, !content.includes("console.log"));
}

// ── 5: Shared BusinessDecision type completeness ─────────────────────────

header("Shared BusinessDecision type completeness");

const bdTypes = readFile(BP, "business-decision-types.ts");

const requiredFields = [
  "decisionId", "tenantId", "domain", "engine", "policy",
  "severity", "priority", "title", "summary", "recommendedAction",
  "status", "confidence", "evidence", "generatedAt", "expiresAt",
];

for (const f of requiredFields) {
  check(`BusinessDecision has ${f}`, bdTypes.includes(f));
}

const requiredDomains = ["MALETAS", "TIENDAS", "PEDIDOS", "VENDEDORES", "IMPORTACIONES", "PRODUCCION"];
for (const d of requiredDomains) {
  check(`Domain ${d} defined`, bdTypes.includes(`"${d}"`));
}

check("BusinessDecisionEvidence type defined", bdTypes.includes("BusinessDecisionEvidence"));
check("CommercialDecisionGroup type defined", bdTypes.includes("CommercialDecisionGroup"));
check("CommercialDecisionSummary type defined", bdTypes.includes("CommercialDecisionSummary"));

// ── 6: Aggregator completeness ────────────────────────────────────────────

header("Aggregator completeness");

const agg = readFile(BP, "commercial-decision-aggregator.ts");

check("aggregateCommercialDecisions exported", agg.includes("export function aggregateCommercialDecisions"));
check("aggregateByDomain exported", agg.includes("export function aggregateByDomain"));
check("filterByDomain exported", agg.includes("export function filterByDomain"));
check("filterByPriority exported", agg.includes("export function filterByPriority"));
check("filterPending exported", agg.includes("export function filterPending"));
check("sortByPriority exported", agg.includes("export function sortByPriority"));
check("imports from business-decision-types", agg.includes("business-decision-types"));

// ── 7: Per-domain bridge completeness ────────────────────────────────────

header("Per-domain bridge — Store");

const storeBd = readFile(TIENDAS, "store-business-decisions.ts");
check("store: buildAllStoreBusinessDecisions exported", storeBd.includes("export function buildAllStoreBusinessDecisions"));
check("store: domain = TIENDAS", storeBd.includes('"TIENDAS"'));
check("store: engine = StorePolicyPack", storeBd.includes('"StorePolicyPack"'));
check("store: imports BusinessDecision", storeBd.includes("business-decision-types"));
check("store: imports store-decision-types", storeBd.includes("store-decision-types"));

header("Per-domain bridge — Order");

const orderBd = readFile(PEDIDOS, "order-business-decisions.ts");
check("order: buildAllOrderBusinessDecisions exported", orderBd.includes("export function buildAllOrderBusinessDecisions"));
check("order: domain = PEDIDOS", orderBd.includes('"PEDIDOS"'));
check("order: engine = OrderPolicyPack", orderBd.includes('"OrderPolicyPack"'));
check("order: imports BusinessDecision", orderBd.includes("business-decision-types"));

header("Per-domain bridge — SalesRep");

const repBd = readFile(REPS, "sales-rep-business-decisions.ts");
check("rep: buildAllSalesRepBusinessDecisions exported", repBd.includes("export function buildAllSalesRepBusinessDecisions"));
check("rep: domain = VENDEDORES", repBd.includes('"VENDEDORES"'));
check("rep: engine = SalesRepPolicyPack", repBd.includes('"SalesRepPolicyPack"'));

header("Per-domain bridge — Import");

const importBd = readFile(IMPORTS, "import-business-decisions.ts");
check("import: buildAllImportBusinessDecisions exported", importBd.includes("export function buildAllImportBusinessDecisions"));
check("import: domain = IMPORTACIONES", importBd.includes('"IMPORTACIONES"'));
check("import: engine = ImportPolicyPack", importBd.includes('"ImportPolicyPack"'));

header("Per-domain bridge — Maletas");

const maletasBd = readFile(MALETAS, "maletas-business-decisions.ts");
check("maletas: buildAllMaletasBusinessDecisions exported", maletasBd.includes("export function buildAllMaletasBusinessDecisions"));
check("maletas: domain = MALETAS", maletasBd.includes('"MALETAS"'));
check("maletas: engine = MaletasPolicyPack", maletasBd.includes('"MaletasPolicyPack"'));

header("Per-domain bridge — Production");

const prodBd = readFile(PROD, "production-business-decisions.ts");
check("prod: buildAllProductionBusinessDecisions exported", prodBd.includes("export function buildAllProductionBusinessDecisions"));
check("prod: domain = PRODUCCION", prodBd.includes('"PRODUCCION"'));
check("prod: engine = ProductionPlanningPack", prodBd.includes('"ProductionPlanningPack"'));

// ── 8: Barrel export updates ─────────────────────────────────────────────

header("Barrel export updates");

const bpBarrel = readFile(BP, "index.ts");
check("BP barrel: exports BusinessDecision", bpBarrel.includes("BusinessDecision"));
check("BP barrel: exports CommercialDomain", bpBarrel.includes("CommercialDomain"));
check("BP barrel: exports aggregateCommercialDecisions", bpBarrel.includes("aggregateCommercialDecisions"));
check("BP barrel: exports filterByDomain", bpBarrel.includes("filterByDomain"));
check("BP barrel: exports filterByPriority", bpBarrel.includes("filterByPriority"));

const prodBarrel = readFile(PROD, "index.ts");
check("prod barrel: exports buildAllProductionBusinessDecisions", prodBarrel.includes("buildAllProductionBusinessDecisions"));

const repBarrel = readFile(REPS, "index.ts");
check("rep barrel: exports buildAllSalesRepBusinessDecisions", repBarrel.includes("buildAllSalesRepBusinessDecisions"));

const importBarrel = readFile(IMPORTS, "import-policy-index.ts");
check("import barrel: exports buildAllImportBusinessDecisions", importBarrel.includes("buildAllImportBusinessDecisions"));

// ── 9: No new engines ───────────────────────────────────────────────────

header("No new engines created");

for (const [dir, file] of newFiles) {
  const content = readFile(dir, file);
  check(`${file}: no evaluatePolicy`, !content.includes("export function evaluate"));
  check(`${file}: no registerPolicy`, !content.includes("registerPolicy"));
}

// ── 10: No new policy packs ─────────────────────────────────────────────

header("No new policy packs created");

for (const [dir, file] of newFiles) {
  const content = readFile(dir, file);
  check(`${file}: no registerPolicyPack`, !content.includes("registerPolicyPack") && !content.includes("registerPack"));
  check(`${file}: no PolicyCategory`, !content.includes("PolicyCategory"));
}

// ── 11: Threshold extraction ─────────────────────────────────────────────

header("Threshold extraction — order config");

const orderConfig = readFile(PEDIDOS, "order-policy-pack-config.ts");
check("config: StockThresholdsConfig defined", orderConfig.includes("StockThresholdsConfig"));
check("config: lowStockUnits defined", orderConfig.includes("lowStockUnits"));
check("config: lastUnitsThreshold defined", orderConfig.includes("lastUnitsThreshold"));
check("config: fewVariantsThreshold defined", orderConfig.includes("fewVariantsThreshold"));
check("config: lineMinimums defined", orderConfig.includes("lineMinimums"));

header("Threshold extraction — order-product-types uses config");

const productTypes = readFile(PEDIDOS, "order-product-types.ts");
check("product-types: imports config", productTypes.includes("CASTILLITOS_STOCK_THRESHOLDS"));
check("product-types: no hardcoded LINE_MINIMUMS object", !productTypes.includes("LT: 30"));
check("product-types: uses config for last_units", productTypes.includes("CASTILLITOS_STOCK_THRESHOLDS.lastUnitsThreshold"));
check("product-types: uses config for few_variants", productTypes.includes("CASTILLITOS_STOCK_THRESHOLDS.fewVariantsThreshold"));

header("Threshold extraction — order-fulfillment uses config");

const fulfillment = readFile(PEDIDOS, "order-fulfillment.ts");
check("fulfillment: imports config", fulfillment.includes("CASTILLITOS_STOCK_THRESHOLDS"));
check("fulfillment: no hardcoded <= 10", !fulfillment.includes("availableUnits <= 10"));
check("fulfillment: uses config for lowStock", fulfillment.includes("CASTILLITOS_STOCK_THRESHOLDS.lowStockUnits"));

// ── 12: No cross-domain imports ────────────────────────────────────────────

header("No cross-domain imports in bridges");

for (const [dir, file] of newFiles) {
  const content = readFile(dir, file);
  check(`${file}: no finance imports`, !content.includes('from "@/lib/finance') && !content.includes("from '@/lib/finance"));
  check(`${file}: no marketing imports`, !content.includes('from "@/lib/marketing') && !content.includes("from '@/lib/marketing"));
  check(`${file}: no copilot imports`, !content.includes('from "@/lib/copilot') && !content.includes("from '@/lib/copilot"));
}

// ── 13: No hardcoded thresholds in bridges ──────────────────────────────────

header("No hardcoded thresholds in bridge files");

const bridgeFiles = [
  [TIENDAS, "store-business-decisions.ts"],
  [PEDIDOS, "order-business-decisions.ts"],
  [REPS, "sales-rep-business-decisions.ts"],
  [IMPORTS, "import-business-decisions.ts"],
  [PROD, "production-business-decisions.ts"],
] as const;

for (const [dir, file] of bridgeFiles) {
  const content = readFile(dir, file);
  // Bridge files should not contain business thresholds — only map existing results
  check(`${file}: no threshold constants`, !content.includes("const THRESHOLD") && !content.includes("const MIN_") && !content.includes("const MAX_"));
}

// ══════════════════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(60)}`);
console.log(`COMMERCIAL-INTEGRATION-01 Validation: ${passed}/${passed + failed} passed`);
if (failed === 0) {
  console.log("✅ ALL PASSED");
} else {
  console.log(`❌ ${failed} FAILED`);
}
process.exit(failed > 0 ? 1 : 0);
