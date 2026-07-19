/**
 * scripts/validate-inventory-domain-01.ts
 *
 * Validation for INVENTORY-DOMAIN-01.
 * Verifies that all 10 domain files exist, export correct types,
 * and follow the specification.
 *
 * Usage: npx tsx scripts/validate-inventory-domain-01.ts
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

const ROOT = resolve(__dirname, "..");
const DOMAIN = resolve(ROOT, "lib/comercial/data-layer/domains/inventory");

console.log("\n=== INVENTORY-DOMAIN-01 Validation ===\n");

// -- 1. All 10 files exist -------------------------------------------------

console.log("--- 1. Files Exist ---");

const files = [
  "inventory-entities.ts",
  "inventory-movement.ts",
  "inventory-availability.ts",
  "inventory-snapshot.ts",
  "inventory-age.ts",
  "inventory-evidence.ts",
  "inventory-quality.ts",
  "inventory-normalizer.ts",
  "inventory-adapter.ts",
  "inventory-registration.ts",
  "index.ts",
];

for (const file of files) {
  check(`${file} exists`, existsSync(resolve(DOMAIN, file)));
}

// -- 2. Entity Types -------------------------------------------------------

console.log("\n--- 2. Entity Types ---");

const entities = readFileSync(resolve(DOMAIN, "inventory-entities.ts"), "utf-8");

check("InventoryPosition defined", entities.includes("interface InventoryPosition"));
check("WarehouseProfile defined", entities.includes("interface WarehouseProfile"));
check("InventoryLocation defined", entities.includes("interface InventoryLocation"));
check("InventoryQuantities defined", entities.includes("interface InventoryQuantities"));
check("InventoryVariantDetail defined", entities.includes("interface InventoryVariantDetail"));
check("InventoryClassification defined", entities.includes("interface InventoryClassification"));

// -- 3. Position States (8 required) ---------------------------------------

console.log("\n--- 3. Position States ---");

const positionStates = ["AVAILABLE", "RESERVED", "COMMITTED", "IN_TRANSIT", "ON_STORE", "ON_VENDOR", "UNDER_PRODUCTION", "UNKNOWN"];
for (const state of positionStates) {
  check(`State: ${state}`, entities.includes(`"${state}"`));
}

// -- 4. Location Types (7 required) ----------------------------------------

console.log("\n--- 4. Location Types ---");

const locationTypes = ["WAREHOUSE", "PHYSICAL_ZONE", "STORE", "VENDOR_BAG", "TRANSIT", "IMPORT_WAREHOUSE", "PRODUCTION"];
for (const loc of locationTypes) {
  check(`Location: ${loc}`, entities.includes(`"${loc}"`));
}

// -- 5. Movement -----------------------------------------------------------

console.log("\n--- 5. Movement ---");

const movement = readFileSync(resolve(DOMAIN, "inventory-movement.ts"), "utf-8");

check("InventoryMovement defined", movement.includes("interface InventoryMovement"));
check("InventoryMovementType defined", movement.includes("InventoryMovementType"));
check("MovementSourceDocument defined", movement.includes("interface MovementSourceDocument"));
check("Movement has occurredAt", movement.includes("occurredAt"));
check("Movement has direction", movement.includes("direction"));
check("Movement has inventorySign", movement.includes("inventorySign"));
check("Movement separate from Position", !movement.includes("derivePositionStatus"));

// -- 6. Availability -------------------------------------------------------

console.log("\n--- 6. Availability ---");

const availability = readFileSync(resolve(DOMAIN, "inventory-availability.ts"), "utf-8");

check("InventoryAvailability defined", availability.includes("interface InventoryAvailability"));
check("AvailabilityStatus defined", availability.includes("AvailabilityStatus"));
check("Has netAvailable", availability.includes("netAvailable"));
check("Has isSellable", availability.includes("isSellable"));
check("Has deriveAvailabilityStatus", availability.includes("function deriveAvailabilityStatus"));

// -- 7. Snapshot -----------------------------------------------------------

console.log("\n--- 7. Snapshot ---");

const snapshot = readFileSync(resolve(DOMAIN, "inventory-snapshot.ts"), "utf-8");

check("InventorySnapshot defined", snapshot.includes("interface InventorySnapshot"));
check("SnapshotSummary defined", snapshot.includes("interface SnapshotSummary"));
check("SnapshotDelta defined", snapshot.includes("interface SnapshotDelta"));
check("computeSnapshotDelta function", snapshot.includes("function computeSnapshotDelta"));
check("Has capturedAt", snapshot.includes("capturedAt"));
check("Has correlationId", snapshot.includes("correlationId"));

// -- 8. Age ----------------------------------------------------------------

console.log("\n--- 8. Age ---");

const age = readFileSync(resolve(DOMAIN, "inventory-age.ts"), "utf-8");

check("InventoryAge defined", age.includes("interface InventoryAge"));
check("InventoryAgeBracket defined", age.includes("InventoryAgeBracket"));
check("FRESH bracket", age.includes("FRESH"));
check("STALE bracket", age.includes("STALE"));
check("deriveAgeBracket function", age.includes("function deriveAgeBracket"));
check("Has daysSinceLastMovement", age.includes("daysSinceLastMovement"));
check("Age does NOT compute rotation", !age.includes("rotation") && !age.includes("Rotation"));
check("Age does NOT compute coverage", !age.includes("coverage") && !age.includes("Coverage"));

// -- 9. Evidence -----------------------------------------------------------

console.log("\n--- 9. Evidence ---");

const evidence = readFileSync(resolve(DOMAIN, "inventory-evidence.ts"), "utf-8");

check("InventoryEvidence defined", evidence.includes("interface InventoryEvidence"));
check("InventoryEvidenceLevel defined", evidence.includes("InventoryEvidenceLevel"));
check("Has OPERATIONALLY_VALIDATED", evidence.includes("OPERATIONALLY_VALIDATED"));
check("Has SYNC_CONFIRMED", evidence.includes("SYNC_CONFIRMED"));
check("Has confidence score", evidence.includes("confidence"));
check("Has provenance", evidence.includes("provenance"));
check("CrossValidationResult defined", evidence.includes("interface CrossValidationResult"));

// -- 10. Quality -----------------------------------------------------------

console.log("\n--- 10. Quality ---");

const quality = readFileSync(resolve(DOMAIN, "inventory-quality.ts"), "utf-8");

check("evaluateInventoryQuality function", quality.includes("function evaluateInventoryQuality"));
check("evaluateInventoryFreshness function", quality.includes("function evaluateInventoryFreshness"));
check("validateInventoryQuantities function", quality.includes("function validateInventoryQuantities"));
check("15min freshness SLA", quality.includes("900"));
check("Uses shared evaluateCommercialQuality", quality.includes("evaluateCommercialQuality"));

// -- 11. Normalizer --------------------------------------------------------

console.log("\n--- 11. Normalizer ---");

const normalizer = readFileSync(resolve(DOMAIN, "inventory-normalizer.ts"), "utf-8");

check("InventoryRawInput defined", normalizer.includes("interface InventoryRawInput"));
check("InventoryNormalizationContext defined", normalizer.includes("interface InventoryNormalizationContext"));
check("normalizeInventoryRaw function", normalizer.includes("function normalizeInventoryRaw"));
check("Uses shared normalizers", normalizer.includes("normalizeReferenceCode"));
check("Uses buildCanonicalId", normalizer.includes("buildCanonicalId"));
check("Normalizer is ERP-agnostic", !normalizer.includes("ka_nl_") && !normalizer.includes("sc_") && !normalizer.includes("n_existencia"));
check("Normalizer handles variants", normalizer.includes("sizeCode") && normalizer.includes("colorCode"));
check("Domain set to INVENTORY", normalizer.includes('domain: "INVENTORY"'));

// -- 12. Adapter -----------------------------------------------------------

console.log("\n--- 12. Adapter ---");

const adapter = readFileSync(resolve(DOMAIN, "inventory-adapter.ts"), "utf-8");

check("SAG_INVENTORY_ADAPTER_ID defined", adapter.includes("SAG_INVENTORY_ADAPTER_ID"));
check("createSagInventoryAdapter function", adapter.includes("function createSagInventoryAdapter"));
check("Implements CommercialAdapter", adapter.includes("CommercialAdapter"));
check("Has discover method", adapter.includes("async discover"));
check("Has validate method", adapter.includes("async validate"));
check("Has normalize method", adapter.includes("async normalize"));
check("Has synchronize method", adapter.includes("async synchronize"));
check("Has health method", adapter.includes("async health"));
check("Has capabilities method", adapter.includes("capabilities"));

// -- 13. Registration ------------------------------------------------------

console.log("\n--- 13. Registration ---");

const registration = readFileSync(resolve(DOMAIN, "inventory-registration.ts"), "utf-8");

check("registerInventoryAdapter function", registration.includes("function registerInventoryAdapter"));
check("Uses CommercialAdapterRegistry", registration.includes("CommercialAdapterRegistry"));
check("Domain is INVENTORY", registration.includes('domain: "INVENTORY"'));

// -- 14. Barrel Export ------------------------------------------------------

console.log("\n--- 14. Barrel Export ---");

const barrel = readFileSync(resolve(DOMAIN, "index.ts"), "utf-8");

check("Exports InventoryPosition", barrel.includes("InventoryPosition"));
check("Exports InventoryMovement", barrel.includes("InventoryMovement"));
check("Exports InventoryAvailability", barrel.includes("InventoryAvailability"));
check("Exports InventorySnapshot", barrel.includes("InventorySnapshot"));
check("Exports InventoryAge", barrel.includes("InventoryAge"));
check("Exports InventoryEvidence", barrel.includes("InventoryEvidence"));
check("Exports normalizeInventoryRaw", barrel.includes("normalizeInventoryRaw"));
check("Exports createSagInventoryAdapter", barrel.includes("createSagInventoryAdapter"));
check("Exports registerInventoryAdapter", barrel.includes("registerInventoryAdapter"));
check("Exports evaluateInventoryQuality", barrel.includes("evaluateInventoryQuality"));
check("Exports derivePositionStatus", barrel.includes("derivePositionStatus"));
check("Exports deriveAgeBracket", barrel.includes("deriveAgeBracket"));
check("Exports computeSnapshotDelta", barrel.includes("computeSnapshotDelta"));

// -- 15. Architecture Constraints ------------------------------------------

console.log("\n--- 15. Architecture Constraints ---");

const allFiles = files.map(f => readFileSync(resolve(DOMAIN, f), "utf-8"));
const allContent = allFiles.join("\n");

check("No SAG field names (ka_nl_)", !allContent.includes("ka_nl_"));
check("No SAG field names (sc_)", !allContent.match(/\bsc_[a-z]/));
check("No SAG field names (n_existencia)", !allContent.includes("n_existencia"));
check("No SAG field names (nd_)", !allContent.match(/\bnd_[a-z]/));
check("No SAG field names (fh_)", !allContent.includes("fh_movimiento"));
check("No rotation computation", !allContent.includes("RotationEngine") && !allContent.includes("calculateRotation"));
check("No coverage computation", !allContent.includes("CoverageEngine") && !allContent.includes("calculateCoverage"));
check("No reposition computation", !allContent.includes("calculateReposition") && !allContent.includes("RepositionEngine"));
check("No markdown computation", !allContent.includes("MarkdownEngine") && !allContent.includes("calculateMarkdown"));
check("No Prisma imports", !allContent.includes("from \"@prisma") && !allContent.includes('from "prisma'));
check("No React imports", !allContent.includes("from \"react"));
check("No UI imports", !allContent.includes("components/"));
check("Domain uses shared contracts", allContent.includes('from "../../contracts"'));
check("Domain uses shared adapters", allContent.includes('from "../../adapters"'));
check("Domain uses shared normalizers", allContent.includes('from "../../shared/normalizers"'));

// -- 16. Business Questions Answerable ------------------------------------

console.log("\n--- 16. Business Questions ---");

// The 15 business questions from the spec must be answerable from domain types
check("Q1: Where is a product? → InventoryPosition.location", entities.includes("location: InventoryLocation"));
check("Q2: How much available? → InventoryQuantities.availableQty", entities.includes("availableQty"));
check("Q3: What is committed? → InventoryQuantities.committedQty", entities.includes("committedQty"));
check("Q4: What is reserved? → InventoryQuantities.reservedQty", entities.includes("reservedQty"));
check("Q5: Last movement? → InventoryAge.lastMovementAt", age.includes("lastMovementAt"));
check("Q6: Time since movement? → InventoryAge.daysSinceLastMovement", age.includes("daysSinceLastMovement"));
check("Q7: Data quality? → evaluateInventoryQuality", quality.includes("evaluateInventoryQuality"));
check("Q8: Data confidence? → InventoryEvidence.confidence", evidence.includes("confidence"));
check("Q9: Evidence chain? → InventoryEvidence.provenance", evidence.includes("provenance"));
check("Q10: Physical vs available? → InventoryQuantities", entities.includes("physicalQty") && entities.includes("availableQty"));
check("Q11: Variant breakdown? → InventoryVariantDetail", entities.includes("InventoryVariantDetail"));
check("Q12: Cross-location? → position per location", normalizer.includes("locationCode"));
check("Q13: Movement type? → InventoryMovementType", movement.includes("InventoryMovementType"));
check("Q14: Inventory age? → InventoryAgeBracket", age.includes("InventoryAgeBracket"));
check("Q15: Snapshot comparison? → SnapshotDelta", snapshot.includes("SnapshotDelta"));

// -- Summary ---------------------------------------------------------------

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("INVENTORY-DOMAIN-01 VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("INVENTORY-DOMAIN-01 VALIDATION PASSED.\n");
}
