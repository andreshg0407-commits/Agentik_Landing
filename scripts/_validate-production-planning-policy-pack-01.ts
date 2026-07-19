/**
 * scripts/_validate-production-planning-policy-pack-01.ts
 *
 * Structural validation for PRODUCTION-PLANNING-POLICY-PACK-01.
 * Run: npx tsx scripts/_validate-production-planning-policy-pack-01.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const LIB = path.join(ROOT, "lib/comercial/produccion");

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

function readFile(name: string): string {
  return fs.readFileSync(path.join(LIB, name), "utf-8");
}

// ── 1: File inventory ──────────────────────────────────────────────────────

header("File Inventory");

const expectedFiles = [
  "production-planning-types.ts",
  "production-planning-config.ts",
  "production-planning-pack.ts",
  "production-decision-engine.ts",
  "production-alerts.ts",
  "production-evidence.ts",
  "production-read-models.ts",
  "index.ts",
];

for (const f of expectedFiles) {
  check(`${f} exists`, fs.existsSync(path.join(LIB, f)));
}

// ── 2: No Prisma imports ───────────────────────────────────────────────────

header("No Prisma / DB Imports");

const allSources = expectedFiles.map(f => ({ name: f, content: readFile(f) }));

for (const { name, content } of allSources) {
  check(`${name}: no Prisma import`, !content.includes("from \"@prisma") && !content.includes("from '@prisma"));
  check(`${name}: no prisma variable`, !content.includes("prisma.") && !content.includes("prisma as"));
}

// ── 3: No React imports ────────────────────────────────────────────────────

header("No React / UI Imports");

for (const { name, content } of allSources) {
  check(`${name}: no React`, !content.includes("from \"react\"") && !content.includes("from 'react'"));
}

// ── 4: No side effects in pure modules ─────────────────────────────────────

header("No Side Effects in Pure Modules");

const pureModules = [
  "production-planning-types.ts",
  "production-planning-config.ts",
  "production-decision-engine.ts",
  "production-alerts.ts",
  "production-evidence.ts",
  "production-read-models.ts",
];

for (const name of pureModules) {
  const content = readFile(name);
  check(`${name}: no fetch()`, !content.includes("fetch("));
  check(`${name}: no console.log`, !content.includes("console.log"));
}

// ── 5: Type completeness ───────────────────────────────────────────────────

header("Type Completeness");

const types = readFile("production-planning-types.ts");

const requiredTypes = [
  "ProductionPlanningPolicyType",
  "ProductionEvidenceItem",
  "ProductionNeedResult",
  "ProductionNeedDecision",
  "ActiveOPInfo",
  "ActiveOPResult",
  "ProductionPriority",
  "PriorityFactor",
  "ProductionPriorityResult",
  "ShortageResult",
  "ProductionHealthSummary",
  "ProductionAlertType",
  "ProductionAlertSeverity",
  "ProductionAlert",
  "ProductionPlanningContext",
  "SubgroupInput",
  "ProductionQueueItem",
  "ProductionQueue",
  "BusinessDecision",
];

for (const t of requiredTypes) {
  check(`Type ${t} defined`, types.includes(t));
}

// ── 6: Config decoupling ───────────────────────────────────────────────────

header("Config Decoupling — No Hardcoded Thresholds in Engine");

const engine = readFile("production-decision-engine.ts");

check("Engine accepts config parameter", engine.includes("config: ProductionPlanningConfig") || engine.includes("config,"));
check("Engine uses config.reorder", engine.includes("config.reorder") || engine.includes("getThreshold"));
check("Engine uses config.priority", engine.includes("config.priority"));
check("Engine uses config.shortage", engine.includes("config.shortage"));
check("Engine uses config.health", engine.includes("config.health"));
check("Engine uses config.queue", engine.includes("config.queue"));

// ── 7: Evidence four-question contract ─────────────────────────────────────

header("Evidence Four-Question Contract");

check("Evidence has activationReason", types.includes("activationReason"));
check("Evidence has dataUsed", types.includes("dataUsed"));
check("Evidence has recommendedAction", types.includes("recommendedAction"));
check("Evidence has actionRationale", types.includes("actionRationale"));
check("Evidence has missingData", types.includes("missingData"));
check("Evidence has confidence", types.includes("confidence"));
check("Evidence has traceId", types.includes("traceId"));
check("Evidence has evaluatedAt", types.includes("evaluatedAt"));

// ── 8: Production need decisions ───────────────────────────────────────────

header("Production Need Decisions");

check("PRODUCE defined", types.includes('"PRODUCE"'));
check("WAIT_EXISTING_OP defined", types.includes('"WAIT_EXISTING_OP"'));
check("SUFFICIENT_STOCK defined", types.includes('"SUFFICIENT_STOCK"'));
check("INSUFFICIENT_DATA defined", types.includes('"INSUFFICIENT_DATA"'));

// ── 9: Priority levels ─────────────────────────────────────────────────────

header("Priority Levels");

check("CRITICAL defined", types.includes('"CRITICAL"'));
check("HIGH defined", types.includes('"HIGH"'));
check("MEDIUM defined", types.includes('"MEDIUM"'));
check("LOW defined", types.includes('"LOW"'));

// ── 10: Alert types ────────────────────────────────────────────────────────

header("Alert Types");

const alertTypes = ["PRODUCTION_REQUIRED", "WAIT_EXISTING_OP", "LOW_STOCK", "CRITICAL_SHORTAGE", "DATA_QUALITY"];
for (const a of alertTypes) {
  check(`Alert type ${a} defined`, types.includes(`"${a}"`));
}

// ── 11: Alert contract ─────────────────────────────────────────────────────

header("Alert Contract");

const alerts = readFile("production-alerts.ts");

check("buildProductionRequiredAlert exported", alerts.includes("export function buildProductionRequiredAlert"));
check("buildWaitOPAlert exported", alerts.includes("export function buildWaitOPAlert"));
check("buildLowStockAlert exported", alerts.includes("export function buildLowStockAlert"));
check("buildCriticalShortageAlert exported", alerts.includes("export function buildCriticalShortageAlert"));
check("buildProductionDataQualityAlert exported", alerts.includes("export function buildProductionDataQualityAlert"));
check("buildAllProductionAlerts exported", alerts.includes("export function buildAllProductionAlerts"));
check("All alert builders return ProductionAlert | null", alerts.includes("ProductionAlert | null"));
check("Alerts have deduplicationKey", alerts.includes("deduplicationKey"));

// ── 12: Decision engine exports ────────────────────────────────────────────

header("Decision Engine Exports");

check("evaluateProductionNeed exported", engine.includes("export function evaluateProductionNeed"));
check("evaluateExistingOP exported", engine.includes("export function evaluateExistingOP"));
check("evaluatePriority exported", engine.includes("export function evaluatePriority"));
check("evaluateShortage exported", engine.includes("export function evaluateShortage"));
check("evaluateProductionHealth exported", engine.includes("export function evaluateProductionHealth"));
check("buildProductionQueue exported", engine.includes("export function buildProductionQueue"));

// ── 13: Policy pack registration ───────────────────────────────────────────

header("Policy Pack Registration");

const pack = readFile("production-planning-pack.ts");

check("registerCastillitosProductionPlanningPack exported", pack.includes("export function registerCastillitosProductionPlanningPack"));
check("getCastillitosProductionPlanningPolicies exported", pack.includes("export function getCastillitosProductionPlanningPolicies"));
check("Uses registerPolicy from business-policy", pack.includes("registerPolicy"));
check("REPLENISHMENT category used", pack.includes('"REPLENISHMENT"'));
check("INVENTORY category used", pack.includes('"INVENTORY"'));
check("GENERAL category used", pack.includes('"GENERAL"'));
check("5 policies defined", pack.includes("CASTILLITOS_PRODUCTION_PLANNING_POLICY_COUNT") && pack.includes("= 5"));

// ── 14: Evidence module exports ────────────────────────────────────────────

header("Evidence Module Exports");

const evidence = readFile("production-evidence.ts");

check("bridgeToCommercialEvidence exported", evidence.includes("export function bridgeToCommercialEvidence"));
check("validateProductionEvidence exported", evidence.includes("export function validateProductionEvidence"));
check("validateAllProductionEvidence exported", evidence.includes("export function validateAllProductionEvidence"));
check("getProductionSagDiscoveryGaps exported", evidence.includes("export function getProductionSagDiscoveryGaps"));
check("Domain is PRODUCTION", evidence.includes('domain: "PRODUCTION"'));

// ── 15: SAG discovery gaps ─────────────────────────────────────────────────

header("SAG Discovery Gaps Completeness");

const gapFields = ["opDocumentNumber", "opStatus", "opQuantity", "opDocumentDate", "opSubgroup", "opBusinessLine", "opPriority", "opStageProgress"];
for (const f of gapFields) {
  check(`Gap field ${f} documented`, evidence.includes(`"${f}"`));
}

check("AVAILABLE status used", evidence.includes('"AVAILABLE"'));
check("PARTIAL status used", evidence.includes('"PARTIAL"'));
check("NOT_AVAILABLE status used", evidence.includes('"NOT_AVAILABLE"'));

// ── 16: Read models ────────────────────────────────────────────────────────

header("Read Models");

const readModels = readFile("production-read-models.ts");

check("ProductionPlanningState defined", readModels.includes("ProductionPlanningState"));
check("buildProductionPlanningState exported", readModels.includes("export function buildProductionPlanningState"));
check("buildBusinessDecision exported", readModels.includes("export function buildBusinessDecision"));
check("buildAllBusinessDecisions exported", readModels.includes("export function buildAllBusinessDecisions"));

// ── 17: BusinessDecision contract ──────────────────────────────────────────

header("BusinessDecision Contract");

check("decisionId field", types.includes("decisionId"));
check("tenantId field", types.includes("tenantId"));
check("engine field", types.includes("engine: string"));
check("policy field", types.includes("policy: string"));
check("severity field", types.includes("severity:"));
check("priority field", types.includes("priority:"));
check("title field", types.includes("title: string"));
check("summary field", types.includes("summary: string"));
check("recommendedAction field", types.includes("recommendedAction: string"));
check("status field", types.includes("status:"));
check("confidence field", types.includes("confidence: number"));
check("generatedAt field", types.includes("generatedAt: string"));
check("expiresAt field", types.includes("expiresAt: string | null"));

// ── 18: Barrel export completeness ─────────────────────────────────────────

header("Barrel Export Completeness");

const barrel = readFile("index.ts");

const barrelExports = [
  "ProductionPlanningPolicyType",
  "ProductionEvidenceItem",
  "ProductionNeedResult",
  "ProductionNeedDecision",
  "ActiveOPInfo",
  "ActiveOPResult",
  "ProductionPriority",
  "PriorityFactor",
  "ProductionPriorityResult",
  "ShortageResult",
  "ProductionHealthSummary",
  "ProductionAlert",
  "ProductionPlanningContext",
  "SubgroupInput",
  "ProductionQueue",
  "BusinessDecision",
  "CASTILLITOS_PRODUCTION_PLANNING_CONFIG",
  "ProductionPlanningConfig",
  "registerCastillitosProductionPlanningPack",
  "getCastillitosProductionPlanningPolicies",
  "evaluateProductionNeed",
  "evaluateExistingOP",
  "evaluatePriority",
  "evaluateShortage",
  "evaluateProductionHealth",
  "buildProductionQueue",
  "buildAllProductionAlerts",
  "bridgeToCommercialEvidence",
  "validateProductionEvidence",
  "getProductionSagDiscoveryGaps",
  "buildProductionPlanningState",
  "buildBusinessDecision",
  "buildAllBusinessDecisions",
];

for (const e of barrelExports) {
  check(`Barrel exports ${e}`, barrel.includes(e));
}

// ── 19: Config values match spec ───────────────────────────────────────────

header("Config Values Match Spec");

const config = readFile("production-planning-config.ts");

check("CASTILLITOS threshold = 100", config.includes("CASTILLITOS: 100"));
check("LATIN KIDS threshold = 200", config.includes('"LATIN KIDS": 200'));
check("defaultThreshold = 100", config.includes("defaultThreshold: 100"));
check("criticalThreshold = 80", config.includes("criticalThreshold: 80"));
check("highThreshold = 60", config.includes("highThreshold: 60"));
check("mediumThreshold = 35", config.includes("mediumThreshold: 35"));
check("inventoryDeficit weight = 0.30", config.includes("inventoryDeficit: 0.30") || config.includes("inventoryDeficit: 0.3"));
check("salesVolume weight = 0.20", config.includes("salesVolume: 0.20") || config.includes("salesVolume: 0.2"));
check("coverage weight = 0.15", config.includes("coverage: 0.15"));
check("pendingOrders weight = 0.15", config.includes("pendingOrders: 0.15"));
check("maletas weight = 0.10", config.includes("maletas: 0.10") || config.includes("maletas: 0.1"));
check("tiendas weight = 0.10", config.includes("tiendas: 0.10") || config.includes("tiendas: 0.1"));
check("criticalPct = 50 (shortage)", config.includes("criticalPct: 50"));
check("shortagePct = 80", config.includes("shortagePct: 80"));
check("maxItems = 100 (queue)", config.includes("maxItems: 100"));

// ── 20: No cross-domain imports ────────────────────────────────────────────

header("No Cross-Domain Imports");

for (const { name, content } of allSources) {
  check(`${name}: no finance imports`, !content.includes('from "@/lib/finance') && !content.includes("from '@/lib/finance"));
  check(`${name}: no marketing imports`, !content.includes('from "@/lib/marketing') && !content.includes("from '@/lib/marketing"));
  check(`${name}: no copilot imports`, !content.includes('from "@/lib/copilot') && !content.includes("from '@/lib/copilot"));
  check(`${name}: no security imports`, !content.includes('from "@/lib/security') && !content.includes("from '@/lib/security"));
}

// ── 21: No SAG runtime ─────────────────────────────────────────────────────

header("No SAG Runtime");

for (const { name, content } of allSources) {
  check(`${name}: no SAG adapter`, !content.includes("from \"@/lib/connectors") && !content.includes('from "@/lib/connectors'));
  check(`${name}: no SOAP call`, !content.includes("soapCall") && !content.includes("executeSoapQuery"));
}

// ══════════════════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(60)}`);
console.log(`PRODUCTION-PLANNING-POLICY-PACK-01 Validation: ${passed}/${passed + failed} passed`);
if (failed === 0) {
  console.log("✅ ALL PASSED");
} else {
  console.log(`❌ ${failed} FAILED`);
}
process.exit(failed > 0 ? 1 : 0);
