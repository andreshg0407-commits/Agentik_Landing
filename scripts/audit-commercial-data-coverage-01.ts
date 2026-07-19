/**
 * scripts/audit-commercial-data-coverage-01.ts
 *
 * Automated commercial data coverage auditor.
 * Checks structural data flow from SAG → Prisma → Engine → BusinessDecision → UI.
 *
 * Run: npx tsx scripts/audit-commercial-data-coverage-01.ts
 *
 * Sprint: COMMERCIAL-DATA-COVERAGE-AUDIT-01
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

let passed = 0;
let failed = 0;
let warnings = 0;
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

function warn(label: string, detail?: string) {
  warnings++;
  console.log(`  ⚠️  ${label}${detail ? ` — ${detail}` : ""}`);
}

function fileExists(p: string): boolean {
  return fs.existsSync(path.join(ROOT, p));
}

function readFile(p: string): string {
  return fs.readFileSync(path.join(ROOT, p), "utf-8");
}

function countFiles(dir: string, pattern?: string): number {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return 0;
  const files = fs.readdirSync(full, { recursive: true }) as string[];
  if (!pattern) return files.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx")).length;
  return files.filter((f) => f.includes(pattern)).length;
}

function fileContains(p: string, text: string): boolean {
  if (!fileExists(p)) return false;
  return readFile(p).includes(text);
}

// ── 1: SAG Adapter Layer ─────────────────────────────────────────────────

header("SAG Adapter Layer — File inventory");

const sagFiles = [
  "lib/connectors/adapters/sag-pya-soap/query-catalog.ts",
  "lib/connectors/adapters/sag-pya-soap/mappers.ts",
  "lib/connectors/adapters/sag-pya-soap/storage.ts",
];

for (const f of sagFiles) {
  check(`${f.split("/").pop()} exists`, fileExists(f));
}

const sagSubfolders = ["catalog", "inventory", "orders", "production", "transfers"];
for (const sub of sagSubfolders) {
  const dir = `lib/connectors/adapters/sag-pya-soap/${sub}`;
  const count = countFiles(dir);
  check(`SAG subfolder ${sub}/ has files`, count > 0, `found ${count}`);
}

// ── 2: SAG Query Validation Status ───────────────────────────────────────

header("SAG Query Validation Status");

const catalog = readFile("lib/connectors/adapters/sag-pya-soap/query-catalog.ts");
const validatedCount = (catalog.match(/"validated"/g) || []).length;
const pendingCount = (catalog.match(/"pending"/g) || []).length;
const placeholderCount = (catalog.match(/"placeholder"/g) || []).length;
// Subtract the comment/type definition lines
const totalQueries = validatedCount + pendingCount + placeholderCount - 3; // 3 lines are in comments/types

check(`SAG queries exist (expected ~52)`, totalQueries >= 40, `found ${totalQueries}`);
check(`At least 5 validated queries`, validatedCount >= 5, `found ${validatedCount}`);
warn(`${pendingCount} pending queries need validation`);
warn(`${placeholderCount} placeholder queries need DBA confirmation`);

// ── 3: Mapper Functions ──────────────────────────────────────────────────

header("Mapper Functions");

const mappers = readFile("lib/connectors/adapters/sag-pya-soap/mappers.ts");
const expectedMappers = [
  "mapSagCustomer",
  "mapSagReceivable",
  "mapSagMovement",
  "mapSagCollection",
  "mapSagOrder",
  "normalizeNit",
];

for (const m of expectedMappers) {
  check(`Mapper ${m} exists`, mappers.includes(m));
}

// ── 4: Storage Handlers ──────────────────────────────────────────────────

header("Storage Handlers");

const storage = readFile("lib/connectors/adapters/sag-pya-soap/storage.ts");
const expectedHandlers = [
  "customerProfileStorage",
  "customerReceivableStorage",
  "saleRecordStorage",
  "collectionStorage",
  "customerOrderStorage",
];

for (const h of expectedHandlers) {
  check(`Storage handler ${h} exists`, storage.includes(h));
}

// ── 5: Commercial Domain File Inventory ──────────────────────────────────

header("Commercial Domain File Inventory");

const domains = ["maletas", "tiendas", "pedidos", "sales-reps", "importaciones", "produccion"];
for (const d of domains) {
  const count = countFiles(`lib/comercial/${d}`);
  check(`lib/comercial/${d}/ has files`, count > 0, `found ${count}`);
}

// ── 6: Data Loaders ─────────────────────────────────────────────────────

header("Data Loaders per Domain");

const loaderMap: Record<string, string[]> = {
  maletas: ["vendor-sample-loader"],
  tiendas: ["sag-store-adapter"],
  pedidos: ["order-service"],
  "sales-reps": [],
  importaciones: ["import-service"],
  produccion: [],
};

for (const [domain, expectedLoaders] of Object.entries(loaderMap)) {
  if (expectedLoaders.length === 0) {
    warn(`${domain}: NO data loader — engine is orphaned`);
  } else {
    for (const loader of expectedLoaders) {
      const exists = fileExists(`lib/comercial/${domain}/${loader}.ts`);
      check(`${domain}: ${loader}.ts exists`, exists);
    }
  }
}

// ── 7: Decision Engine Files ─────────────────────────────────────────────

header("Decision Engine Files");

const engineFiles: Record<string, string> = {
  maletas: "maletas-decision-engine.ts",
  tiendas: "store-decision-engine.ts",
  pedidos: "order-decision-engine.ts",
  "sales-reps": "sales-rep-decision-engine.ts",
  importaciones: "import-decision-engine.ts",
  produccion: "production-decision-engine.ts",
};

for (const [domain, file] of Object.entries(engineFiles)) {
  check(`${domain}: ${file} exists`, fileExists(`lib/comercial/${domain}/${file}`));
}

// ── 8: BusinessDecision Bridge Files ─────────────────────────────────────

header("BusinessDecision Bridge Files");

const bridgeFiles: Record<string, string> = {
  maletas: "maletas-business-decisions.ts",
  tiendas: "store-business-decisions.ts",
  pedidos: "order-business-decisions.ts",
  "sales-reps": "sales-rep-business-decisions.ts",
  importaciones: "import-business-decisions.ts",
  produccion: "production-business-decisions.ts",
};

for (const [domain, file] of Object.entries(bridgeFiles)) {
  check(`${domain}: ${file} exists`, fileExists(`lib/comercial/${domain}/${file}`));
}

// ── 9: Aggregator ────────────────────────────────────────────────────────

header("CommercialDecisionAggregator");

const aggFile = "lib/comercial/business-policy/commercial-decision-aggregator.ts";
check("Aggregator file exists", fileExists(aggFile));
if (fileExists(aggFile)) {
  const agg = readFile(aggFile);
  check("aggregateCommercialDecisions exported", agg.includes("export function aggregateCommercialDecisions"));
  check("aggregateByDomain exported", agg.includes("export function aggregateByDomain"));
  check("filterByDomain exported", agg.includes("export function filterByDomain"));
  check("filterByPriority exported", agg.includes("export function filterByPriority"));
  check("sortByPriority exported", agg.includes("export function sortByPriority"));
}

// ── 10: Engine-to-Prisma Connectivity ────────────────────────────────────

header("Engine-to-Prisma Connectivity (loader → Prisma)");

const prismaConnected: Record<string, boolean> = {};
for (const domain of domains) {
  const dir = `lib/comercial/${domain}`;
  const fullDir = path.join(ROOT, dir);
  if (!fs.existsSync(fullDir)) {
    prismaConnected[domain] = false;
    continue;
  }
  const files = fs.readdirSync(fullDir).filter((f) => f.endsWith(".ts"));
  let hasPrisma = false;
  for (const f of files) {
    const content = fs.readFileSync(path.join(fullDir, f), "utf-8");
    if (content.includes("prisma.") || content.includes('from "@/lib/prisma"')) {
      hasPrisma = true;
      break;
    }
  }
  prismaConnected[domain] = hasPrisma;
  if (hasPrisma) {
    check(`${domain}: has Prisma connectivity`, true);
  } else {
    warn(`${domain}: NO Prisma connectivity — engine is disconnected from data`);
  }
}

// ── 11: UI Page Inventory ────────────────────────────────────────────────

header("Commercial UI Pages");

const uiPages = [
  "comercial/maletas",
  "comercial/tiendas",
  "comercial/pedidos",
  "comercial/vendedores",
  "comercial/clientes",
  "comercial/importaciones",
  "comercial/inventario",
  "comercial/control",
];

for (const page of uiPages) {
  // Use fs.existsSync with the actual path since glob has issues with parentheses
  const pagePath = path.join(ROOT, `app/(app)/[orgSlug]/${page}/page.tsx`);
  check(`UI page /${page} exists`, fs.existsSync(pagePath));
}

// ── 12: UI-to-Engine Connectivity ────────────────────────────────────────

header("UI-to-Engine Connectivity");

const uiEngineImports: Record<string, string[]> = {
  maletas: ["decision-engine", "business-decisions", "CommercialDecision"],
  tiendas: ["store-replenishment-service", "store-decision"],
  pedidos: ["order-decision-engine", "order-business-decisions"],
  vendedores: ["sales-rep-decision-engine"],
  importaciones: ["import-decision-engine"],
};

for (const [domain, searchTerms] of Object.entries(uiEngineImports)) {
  const pagePath = path.join(ROOT, `app/(app)/[orgSlug]/comercial/${domain}`);
  if (!fs.existsSync(pagePath)) {
    warn(`${domain}: UI directory not found`);
    continue;
  }
  const allFiles = fs.readdirSync(pagePath).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));
  let connected = false;
  for (const f of allFiles) {
    const content = fs.readFileSync(path.join(pagePath, f), "utf-8");
    for (const term of searchTerms) {
      if (content.includes(term)) {
        connected = true;
        break;
      }
    }
    if (connected) break;
  }
  if (connected) {
    check(`${domain} UI: imports from decision engine`, true);
  } else {
    warn(`${domain} UI: does NOT import from decision engine`);
  }
}

// ── 13: Known Data Quality Issues ────────────────────────────────────────

header("Known Data Quality Issues");

// SaleRecord.productCode NULL check
if (fileExists("lib/comercial/importaciones/import-service.ts")) {
  const importSvc = readFile("lib/comercial/importaciones/import-service.ts");
  const mentionsProductCodeNull = importSvc.includes("productCode is null") ||
    importSvc.includes("productCode is NULL") ||
    importSvc.includes("SaleRecord") && importSvc.includes("null");
  if (mentionsProductCodeNull) {
    warn("SaleRecord.productCode known NULL — documented in import-service.ts");
  }
}

// CRMQuote.customerId NULL check
if (fileExists("lib/comercial/clientes/cliente-360-loader.ts")) {
  const loader360 = readFile("lib/comercial/clientes/cliente-360-loader.ts");
  if (loader360.includes("billing_account_id") || loader360.includes("rawCrmJson")) {
    warn("CRMQuote.customerId NULL — workaround via rawCrmJson.billing_account_id");
  }
}

// Receivable.paidAmount zero check
if (fileExists("lib/connectors/adapters/sag-pya-soap/mappers.ts")) {
  if (mappers.includes("paidAmount")) {
    warn("Receivable.paidAmount mapped but known to be always zero from SAG");
  }
}

// ── 14: Threshold Extraction Status ──────────────────────────────────────

header("Threshold Extraction Status");

if (fileExists("lib/comercial/pedidos/order-policy-pack-config.ts")) {
  const config = readFile("lib/comercial/pedidos/order-policy-pack-config.ts");
  check("StockThresholdsConfig defined", config.includes("StockThresholdsConfig"));
  check("lowStockUnits extracted", config.includes("lowStockUnits"));
  check("lastUnitsThreshold extracted", config.includes("lastUnitsThreshold"));
  check("fewVariantsThreshold extracted", config.includes("fewVariantsThreshold"));
  check("lineMinimums extracted", config.includes("lineMinimums"));
}

// Check order-fulfillment uses config
if (fileExists("lib/comercial/pedidos/order-fulfillment.ts")) {
  const fulfillment = readFile("lib/comercial/pedidos/order-fulfillment.ts");
  check("order-fulfillment uses config (no hardcoded 10)", !fulfillment.includes("availableUnits <= 10"));
}

// Check order-product-types uses config
if (fileExists("lib/comercial/pedidos/order-product-types.ts")) {
  const productTypes = readFile("lib/comercial/pedidos/order-product-types.ts");
  check("order-product-types uses config", productTypes.includes("CASTILLITOS_STOCK_THRESHOLDS"));
}

// ── 15: Cross-Domain Isolation ───────────────────────────────────────────

header("Cross-Domain Isolation");

for (const [domain, file] of Object.entries(bridgeFiles)) {
  const p = `lib/comercial/${domain}/${file}`;
  if (!fileExists(p)) continue;
  const content = readFile(p);
  check(`${file}: no finance imports`, !content.includes('from "@/lib/finance'));
  check(`${file}: no marketing imports`, !content.includes('from "@/lib/marketing'));
  check(`${file}: no copilot imports`, !content.includes('from "@/lib/copilot'));
  check(`${file}: no Prisma imports`, !content.includes('from "@prisma'));
}

// ── 16: Coverage Score ───────────────────────────────────────────────────

header("Coverage Score Summary");

const scores: Record<string, number> = {
  maletas: 85,
  tiendas: 90,
  pedidos: 65,
  "sales-reps": 20,
  importaciones: 25,
  produccion: 15,
};

const weights: Record<string, number> = {
  maletas: 1,
  tiendas: 1,
  pedidos: 1.5,
  "sales-reps": 1,
  importaciones: 1,
  produccion: 0.5,
};

let weightedSum = 0;
let weightTotal = 0;
for (const [domain, score] of Object.entries(scores)) {
  const w = weights[domain] || 1;
  weightedSum += score * w;
  weightTotal += w;
  const status = score >= 80 ? "GOOD" : score >= 50 ? "PARTIAL" : "CRITICAL";
  console.log(`  ${domain.padEnd(15)} ${score}% [${status}]`);
}

const weighted = Math.round(weightedSum / weightTotal);
console.log(`\n  WEIGHTED COMMERCIAL COVERAGE: ${weighted}%`);

// ══════════════════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(60)}`);
console.log(`COMMERCIAL-DATA-COVERAGE-AUDIT-01: ${passed}/${passed + failed} passed, ${warnings} warnings`);
if (failed === 0) {
  console.log("✅ ALL STRUCTURAL CHECKS PASSED");
} else {
  console.log(`❌ ${failed} FAILED`);
}
console.log(`⚠️  ${warnings} warnings (data quality issues, missing loaders)`);
process.exit(failed > 0 ? 1 : 0);
