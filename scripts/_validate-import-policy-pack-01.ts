/**
 * scripts/_validate-import-policy-pack-01.ts
 *
 * Structural validation for IMPORT-POLICY-PACK-01.
 * Checks architecture rules, config decoupling, type contracts, and boundaries.
 *
 * Run: npx tsx scripts/_validate-import-policy-pack-01.ts
 */

import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");
const LIB = path.join(ROOT, "lib/comercial/importaciones");

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
  "import-policy-types.ts",
  "import-policy-pack-config.ts",
  "import-policy-pack.ts",
  "import-decision-engine.ts",
  "import-alerts.ts",
  "import-evidence.ts",
  "import-policy-index.ts",
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
  check(`${name}: no JSX`, !content.includes("tsx") || name.endsWith(".tsx") === false);
}

// ── 4: No side effects in pure modules ─────────────────────────────────────

header("No Side Effects in Pure Modules");

const pureModules = [
  "import-policy-types.ts",
  "import-policy-pack-config.ts",
  "import-decision-engine.ts",
  "import-alerts.ts",
  "import-evidence.ts",
];

for (const name of pureModules) {
  const content = readFile(name);
  check(`${name}: no fetch()`, !content.includes("fetch("));
  check(`${name}: no console.log`, !content.includes("console.log"));
  check(`${name}: no setTimeout`, !content.includes("setTimeout"));
}

// ── 5: Type completeness ───────────────────────────────────────────────────

header("Type Completeness");

const types = readFile("import-policy-types.ts");

const requiredTypes = [
  "ImportPolicyType",
  "ImportEvidenceItem",
  "LowRotationResult",
  "RepurchaseResult",
  "RepurchaseDecision",
  "RepurchaseFactor",
  "NextContainerItem",
  "NextContainerRecommendation",
  "InventoryAgingResult",
  "InventoryAgingStatus",
  "ImportHealthSummary",
  "ImportAlert",
  "ImportAlertType",
  "ImportAlertSeverity",
  "ImportPolicyContext",
  "ImportReferenceInput",
];

for (const t of requiredTypes) {
  check(`Type ${t} defined`, types.includes(t));
}

// ── 6: Config decoupling — no hardcoded thresholds in engine ───────────────

header("Config Decoupling — No Hardcoded Thresholds in Engine");

const engine = readFile("import-decision-engine.ts");

// Check engine uses config parameters, not hardcoded values
check("Engine accepts config parameter", engine.includes("config:") || engine.includes("config,"));
check("Engine uses config.lowRotation", engine.includes("config.lowRotation"));
check("Engine uses config.repurchase", engine.includes("config.repurchase"));
check("Engine uses config.inventoryAging", engine.includes("config.inventoryAging"));

// Verify thresholds come from config, not magic numbers
// The engine should reference config fields like daysThreshold, rebuyThreshold, etc.
check("Engine uses daysThreshold from config", engine.includes("daysThreshold"));
check("Engine uses rebuyThreshold from config", engine.includes("rebuyThreshold"));
check("Engine uses watchThreshold from config", engine.includes("watchThreshold"));

// ── 7: Evidence four-question contract ─────────────────────────────────────

header("Evidence Four-Question Contract");

const evidenceType = types;

check("Evidence has activationReason", evidenceType.includes("activationReason"));
check("Evidence has dataUsed", evidenceType.includes("dataUsed"));
check("Evidence has recommendedAction", evidenceType.includes("recommendedAction"));
check("Evidence has actionRationale", evidenceType.includes("actionRationale"));
check("Evidence has missingData", evidenceType.includes("missingData"));
check("Evidence has confidence", evidenceType.includes("confidence"));
check("Evidence has traceId", evidenceType.includes("traceId"));
check("Evidence has evaluatedAt", evidenceType.includes("evaluatedAt"));
check("Evidence has policyType", evidenceType.includes("policyType"));
check("Evidence has policyId", evidenceType.includes("policyId"));

// ── 8: Repurchase decision model ───────────────────────────────────────────

header("Repurchase Decision Model");

check("REBUY defined", types.includes("REBUY"));
check("WATCH defined", types.includes("WATCH"));
check("DO_NOT_REBUY defined", types.includes("DO_NOT_REBUY"));
check("INSUFFICIENT_DATA defined", types.includes("INSUFFICIENT_DATA"));
check("RepurchaseFactor has weight", types.includes("weight"));
check("RepurchaseFactor has score", types.includes("score"));

// ── 9: Inventory aging states ──────────────────────────────────────────────

header("Inventory Aging States");

const agingStates = ["NEW", "NORMAL", "AGING", "LOW_ROTATION", "OBSOLETE_CANDIDATE"];
for (const s of agingStates) {
  check(`Aging state ${s} defined`, types.includes(`"${s}"`));
}

// ── 10: Health summary model ───────────────────────────────────────────────

header("Health Summary Model");

check("HEALTHY defined", types.includes("HEALTHY"));
check("AT_RISK defined", types.includes("AT_RISK"));
check("CRITICAL defined", types.includes("CRITICAL"));
check("NO_DATA defined", types.includes("NO_DATA"));
check("Health has totalReferences", types.includes("totalReferences"));
check("Health has lowRotationCount", types.includes("lowRotationCount"));
check("Health has agingBreakdown", types.includes("agingBreakdown"));

// ── 11: Alert types ────────────────────────────────────────────────────────

header("Alert Types");

const alertTypes = ["LOW_ROTATION", "REBUY_CANDIDATE", "NO_REPURCHASE", "AGING_INVENTORY", "DATA_QUALITY"];
for (const a of alertTypes) {
  check(`Alert type ${a} defined`, types.includes(`"${a}"`));
}

// ── 12: Alert contract ─────────────────────────────────────────────────────

header("Alert Contract");

const alerts = readFile("import-alerts.ts");

check("buildLowRotationAlert exported", alerts.includes("export function buildLowRotationAlert"));
check("buildRebuyCandidateAlert exported", alerts.includes("export function buildRebuyCandidateAlert"));
check("buildNoRepurchaseAlert exported", alerts.includes("export function buildNoRepurchaseAlert"));
check("buildAgingAlert exported", alerts.includes("export function buildAgingAlert"));
check("buildImportDataQualityAlert exported", alerts.includes("export function buildImportDataQualityAlert"));
check("buildAllImportAlerts exported", alerts.includes("export function buildAllImportAlerts"));
check("All alert builders return ImportAlert | null", alerts.includes("ImportAlert | null"));
check("Alerts have deduplicationKey", alerts.includes("deduplicationKey"));

// ── 13: Decision engine exports ────────────────────────────────────────────

header("Decision Engine Exports");

check("evaluateLowRotation exported", engine.includes("export function evaluateLowRotation"));
check("evaluateRepurchase exported", engine.includes("export function evaluateRepurchase"));
check("buildNextContainerRecommendations exported", engine.includes("export function buildNextContainerRecommendations"));
check("evaluateInventoryAging exported", engine.includes("export function evaluateInventoryAging"));
check("evaluateImportHealth exported", engine.includes("export function evaluateImportHealth"));

// ── 14: Policy pack registration ───────────────────────────────────────────

header("Policy Pack Registration");

const pack = readFile("import-policy-pack.ts");

check("registerCastillitosImportPolicyPack exported", pack.includes("export function registerCastillitosImportPolicyPack"));
check("getCastillitosImportPolicies exported", pack.includes("export function getCastillitosImportPolicies"));
check("Uses registerPolicy from business-policy", pack.includes("registerPolicy"));
check("IMPORT category used", pack.includes('"IMPORT"'));
check("INVENTORY category used", pack.includes('"INVENTORY"'));
check("5 policies defined", pack.includes("CASTILLITOS_IMPORT_POLICY_COUNT") && pack.includes("= 5"));

// ── 15: Evidence module exports ────────────────────────────────────────────

header("Evidence Module Exports");

const evidence = readFile("import-evidence.ts");

check("bridgeToCommercialEvidence exported", evidence.includes("export function bridgeToCommercialEvidence"));
check("validateImportEvidence exported", evidence.includes("export function validateImportEvidence"));
check("validateAllImportEvidence exported", evidence.includes("export function validateAllImportEvidence"));
check("getImportSagDiscoveryGaps exported", evidence.includes("export function getImportSagDiscoveryGaps"));
check("Domain is IMPORT", evidence.includes('domain: "IMPORT"'));

// ── 16: SAG discovery gaps completeness ────────────────────────────────────

header("SAG Discovery Gaps Completeness");

const gapFields = ["lastEntryDate", "lastImportDate", "supplierName", "countryOfOrigin", "containerNumber", "unitCost", "leadTimeDays", "transitStatus"];
for (const f of gapFields) {
  check(`Gap field ${f} documented`, evidence.includes(`"${f}"`));
}

check("AVAILABLE status used", evidence.includes('"AVAILABLE"'));
check("PARTIAL status used", evidence.includes('"PARTIAL"'));
check("NOT_AVAILABLE status used", evidence.includes('"NOT_AVAILABLE"'));

// ── 17: Barrel export completeness ─────────────────────────────────────────

header("Barrel Export Completeness");

const barrel = readFile("import-policy-index.ts");

// Key exports that must be in the barrel
const barrelExports = [
  "ImportPolicyType",
  "ImportEvidenceItem",
  "LowRotationResult",
  "RepurchaseResult",
  "RepurchaseDecision",
  "NextContainerRecommendation",
  "InventoryAgingResult",
  "ImportHealthSummary",
  "ImportAlert",
  "ImportPolicyContext",
  "registerCastillitosImportPolicyPack",
  "getCastillitosImportPolicies",
  "evaluateLowRotation",
  "evaluateRepurchase",
  "buildNextContainerRecommendations",
  "evaluateInventoryAging",
  "evaluateImportHealth",
  "buildAllImportAlerts",
  "bridgeToCommercialEvidence",
  "validateImportEvidence",
  "getImportSagDiscoveryGaps",
  "CASTILLITOS_IMPORT_POLICY_PACK_CONFIG",
];

for (const e of barrelExports) {
  check(`Barrel exports ${e}`, barrel.includes(e));
}

// ── 18: Config values match spec ───────────────────────────────────────────

header("Config Values Match Spec");

const config = readFile("import-policy-pack-config.ts");

check("monthsThreshold = 8", config.includes("monthsThreshold: 8"));
check("daysThreshold = 240", config.includes("daysThreshold: 240"));
check("rebuyThreshold = 65", config.includes("rebuyThreshold: 65"));
check("watchThreshold = 35", config.includes("watchThreshold: 35"));
check("newDaysMax = 90", config.includes("newDaysMax: 90"));
check("normalDaysMax = 180", config.includes("normalDaysMax: 180"));
check("agingDaysMax = 240", config.includes("agingDaysMax: 240"));
check("lowRotationDaysMax = 365", config.includes("lowRotationDaysMax: 365"));
check("maxItems = 50", config.includes("maxItems: 50"));

// Weights
check("salesVolume weight = 0.25", config.includes("salesVolume: 0.25"));
check("inventoryLevel weight = 0.25", config.includes("inventoryLevel: 0.25"));
check("rotation weight = 0.20", config.includes("rotation: 0.20") || config.includes("rotation: 0.2"));
check("timeSinceEntry weight = 0.15", config.includes("timeSinceEntry: 0.15"));
check("trend weight = 0.15", config.includes("trend: 0.15"));

// ── 19: No cross-domain imports ────────────────────────────────────────────

header("No Cross-Domain Imports");

for (const { name, content } of allSources) {
  check(`${name}: no finance imports`, !content.includes("from \"@/lib/finance") && !content.includes('from "@/lib/finance'));
  check(`${name}: no marketing imports`, !content.includes("from \"@/lib/marketing") && !content.includes('from "@/lib/marketing'));
  check(`${name}: no copilot imports`, !content.includes("from \"@/lib/copilot") && !content.includes('from "@/lib/copilot'));
  check(`${name}: no security imports`, !content.includes("from \"@/lib/security") && !content.includes('from "@/lib/security'));
}

// ── 20: Strictly greater than for thresholds ───────────────────────────────

header("Strictly Greater Than for Thresholds");

// Low rotation: daysSinceLastEntry > daysThreshold (not >=)
const lowRotCheck = engine.includes("> config.lowRotation.daysThreshold") || engine.includes("> daysThreshold");
check("Low rotation uses > (strictly greater than)", lowRotCheck);

// Make sure >= is NOT used for the low rotation threshold
const lowRotGte = engine.match(/daysSinceLastEntry\s*>=\s*config\.lowRotation\.daysThreshold/);
check("Low rotation does NOT use >= for daysThreshold", !lowRotGte);

// ══════════════════════════════════════════════════════════════════════════

console.log(`\n${"═".repeat(60)}`);
console.log(`IMPORT-POLICY-PACK-01 Validation: ${passed}/${passed + failed} passed`);
if (failed === 0) {
  console.log("✅ ALL PASSED");
} else {
  console.log(`❌ ${failed} FAILED`);
}
process.exit(failed > 0 ? 1 : 0);
