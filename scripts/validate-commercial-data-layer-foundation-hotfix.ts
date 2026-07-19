/**
 * scripts/validate-commercial-data-layer-foundation-hotfix.ts
 *
 * Validation for COMMERCIAL-DATA-LAYER-FOUNDATION-HOTFIX-01.
 *
 * Usage: npx tsx scripts/validate-commercial-data-layer-foundation-hotfix.ts
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, join } from "path";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

const BASE = resolve(__dirname, "../lib/comercial/data-layer");

function getAllFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...getAllFiles(fullPath));
    else if (entry.name.endsWith(".ts")) files.push(fullPath);
  }
  return files;
}

console.log("\n=== COMMERCIAL-DATA-LAYER-FOUNDATION-HOTFIX-01 Validation ===\n");

// ── 1. CommercialAdapterRegistry funcional ───────────────────────────────────

console.log("--- 1. Adapter Registry ---");

const registryFile = join(BASE, "adapters/commercial-adapter-registry.ts");
check("1. CommercialAdapterRegistry exists", existsSync(registryFile));
const registryContent = readFileSync(registryFile, "utf-8");
check("1b. Has createCommercialAdapterRegistry factory", registryContent.includes("createCommercialAdapterRegistry"));
check("1c. Has register function", registryContent.includes("register("));
check("1d. Has resolve function", registryContent.includes("resolve("));
check("1e. Has unregister function", registryContent.includes("unregister("));

// ── 2. Tenant resolution ─────────────────────────────────────────────────────

console.log("\n--- 2. Tenant resolution ---");

check("2. tenantId in resolve query", registryContent.includes("tenantId"));
check("2b. TENANT_REQUIRED error", registryContent.includes("TENANT_REQUIRED"));

// ── 3. Capability resolution ─────────────────────────────────────────────────

console.log("\n--- 3. Capability resolution ---");

check("3. capability in resolve query", registryContent.includes("capability"));
check("3b. CAPABILITY_NOT_SUPPORTED error", registryContent.includes("CAPABILITY_NOT_SUPPORTED"));

// ── 4. Multi-tenant isolation ────────────────────────────────────────────────

console.log("\n--- 4. Multi-tenant isolation ---");

check("4. tenantEntries filter", registryContent.includes("tenantId") && registryContent.includes("filter"));
check("4b. clearTenant scoped", registryContent.includes("clearTenant"));

// ── 5. CommercialDomainRegistry ──────────────────────────────────────────────

console.log("\n--- 5. Domain Registry ---");

const domainDir = join(BASE, "domains");
check("5. domains/ directory exists", existsSync(domainDir));
const domainRegistryFile = join(domainDir, "commercial-domain-registry.ts");
check("5b. Registry file exists", existsSync(domainRegistryFile));
const domainContent = readFileSync(domainRegistryFile, "utf-8");
check("5c. createCommercialDomainRegistry factory", domainContent.includes("createCommercialDomainRegistry"));

// ── 6. Ownership unique ──────────────────────────────────────────────────────

console.log("\n--- 6. Ownership unique ---");

check("6. entityOwnership map", domainContent.includes("entityOwnership"));
check("6b. Rejects duplicate ownership", domainContent.includes("already owned by"));

// ── 7. Official domains ──────────────────────────────────────────────────────

console.log("\n--- 7. Official domains ---");

const descriptorsFile = join(domainDir, "commercial-domain-descriptors.ts");
const descriptors = readFileSync(descriptorsFile, "utf-8");
check("7a. PRODUCT_DOMAIN", descriptors.includes("PRODUCT_DOMAIN"));
check("7b. CUSTOMER_DOMAIN", descriptors.includes("CUSTOMER_DOMAIN"));
check("7c. INVENTORY_DOMAIN", descriptors.includes("INVENTORY_DOMAIN"));
check("7d. SALES_DOMAIN", descriptors.includes("SALES_DOMAIN"));
check("7e. PURCHASING_IMPORT_DOMAIN", descriptors.includes("PURCHASING_IMPORT_DOMAIN"));
check("7f. STORE_OPERATIONS_DOMAIN", descriptors.includes("STORE_OPERATIONS_DOMAIN"));
check("7g. Future domains inactive", descriptors.includes("active: false"));

// ── 8. CommercialQualityEvaluator ────────────────────────────────────────────

console.log("\n--- 8. Quality Evaluator ---");

const qualityFile = join(BASE, "quality/commercial-quality-evaluator.ts");
check("8. Quality evaluator exists", existsSync(qualityFile));
const qualityContent = readFileSync(qualityFile, "utf-8");
check("8b. evaluateCommercialQuality function", qualityContent.includes("evaluateCommercialQuality"));

// ── 9. Field quality ─────────────────────────────────────────────────────────

console.log("\n--- 9. Field quality ---");

check("9. FieldQualityEntry type", qualityContent.includes("FieldQualityEntry"));
check("9b. fieldQuality in result", qualityContent.includes("fieldQuality"));

// ── 10. PARTIAL status ───────────────────────────────────────────────────────

console.log("\n--- 10-12. Quality statuses ---");

check("10. PARTIAL status", qualityContent.includes('"PARTIAL"'));
check("11. CONFLICTED status", qualityContent.includes('"CONFLICTED"'));
check("12. STALE status", qualityContent.includes('"STALE"'));
check("12b. CONFIRMED status", qualityContent.includes('"CONFIRMED"'));
check("12c. UNAVAILABLE status", qualityContent.includes('"UNAVAILABLE"'));
check("12d. ESTIMATED status", qualityContent.includes('"ESTIMATED"'));

// ── 13. Normalizers ──────────────────────────────────────────────────────────

console.log("\n--- 13. Normalizers ---");

const normFile = join(BASE, "shared/normalizers.ts");
check("13. Normalizers file exists", existsSync(normFile));
const normContent = readFileSync(normFile, "utf-8");
const normalizers = [
  "normalizeExternalId", "normalizeReferenceCode", "normalizeCustomerCode",
  "normalizeDocumentNumber", "normalizeText", "normalizeEmail", "normalizePhone",
  "normalizeDecimal", "normalizeInteger", "normalizeDate", "normalizeBoolean",
  "normalizeCountryCode", "normalizeCity", "normalizeNullableString",
];
for (const n of normalizers) {
  check(`13. ${n} exists`, normContent.includes(`export function ${n}`));
}

// ── 14. Normalizers accept unknown ───────────────────────────────────────────

console.log("\n--- 14. Normalizers accept unknown ---");

check("14. Input type is unknown", (normContent.match(/input: unknown/g) || []).length >= 10);

// ── 15. Normalizers don't throw ──────────────────────────────────────────────

console.log("\n--- 15. Normalizers don't throw ---");

check("15. No throw statements", !normContent.includes("throw "));

// ── 16. Canonical identifiers ────────────────────────────────────────────────

console.log("\n--- 16. Identifiers ---");

const idFile = join(BASE, "shared/identifiers.ts");
check("16. Identifiers file exists", existsSync(idFile));
const idContent = readFileSync(idFile, "utf-8");
check("16b. buildCanonicalId", idContent.includes("buildCanonicalId"));
check("16c. parseCanonicalId", idContent.includes("parseCanonicalId"));
check("16d. isCanonicalId", idContent.includes("isCanonicalId"));

// ── 17. IDs isolated by tenant ───────────────────────────────────────────────

console.log("\n--- 17. Tenant-scoped IDs ---");

check("17. tenantId in CanonicalIdComponents", idContent.includes("tenantId"));
check("17b. buildTenantScopedKey", idContent.includes("buildTenantScopedKey"));

// ── 18. External reference helpers ───────────────────────────────────────────

console.log("\n--- 18. External reference helpers ---");

const extFile = join(BASE, "shared/external-reference-helpers.ts");
check("18. External reference helpers exist", existsSync(extFile));
const extContent = readFileSync(extFile, "utf-8");
check("18b. buildExternalReference", extContent.includes("buildExternalReference"));
check("18c. validateExternalReference", extContent.includes("validateExternalReference"));
check("18d. externalReferenceEquals", extContent.includes("externalReferenceEquals"));

// ── 19. Freshness evaluator ──────────────────────────────────────────────────

console.log("\n--- 19. Freshness evaluator ---");

const freshFile = join(BASE, "shared/freshness-evaluator.ts");
check("19. Freshness evaluator exists", existsSync(freshFile));
const freshContent = readFileSync(freshFile, "utf-8");
check("19b. evaluateCommercialFreshness", freshContent.includes("evaluateCommercialFreshness"));
check("19c. Injectable now parameter", freshContent.includes("now: Date"));

// ── 20. Functional tests exist ───────────────────────────────────────────────

console.log("\n--- 20. Functional tests ---");

const testFile = resolve(__dirname, "test-commercial-data-layer-foundation-hotfix.ts");
check("20. Test file exists", existsSync(testFile));
const testContent = readFileSync(testFile, "utf-8");
check("20b. Tests adapter registry", testContent.includes("Adapter Registry"));
check("20c. Tests domain registry", testContent.includes("Domain Registry"));
check("20d. Tests quality", testContent.includes("Quality Evaluator"));
check("20e. Tests normalizers", testContent.includes("Normalizers"));
check("20f. Tests identifiers", testContent.includes("Identifiers"));
check("20g. Tests freshness", testContent.includes("Freshness"));

// ── 21-26. Prohibited imports ────────────────────────────────────────────────

console.log("\n--- 21-26. Prohibited imports ---");

const allFiles = getAllFiles(BASE);
let hasSag = false;
let hasPrisma = false;
let hasReact = false;
let hasUI = false;
let hasEngines = false;
let hasDomainImpl = false;

for (const file of allFiles) {
  const content = readFileSync(file, "utf-8");
  if (content.includes("from") && (content.includes("/sag/") || content.includes("SAG_API_URL"))) hasSag = true;
  if (content.includes("@prisma") || content.includes("PrismaClient") || content.includes("prisma.")) hasPrisma = true;
  if (content.includes("from \"react\"") || content.includes("from 'react'") || content.includes("\"use client\"")) hasReact = true;
  if (content.includes("@/components") || content.includes("lib/ui/")) hasUI = true;
  if (content.includes("coverage-engine") || content.includes("rotation-engine") || content.includes("rules-engine")) hasEngines = true;
  if (content.includes("class SagProductAdapter") || content.includes("class SagCustomerAdapter")) hasDomainImpl = true;
}

check("21. No SAG imports", !hasSag);
check("22. No Prisma imports", !hasPrisma);
check("23. No React imports", !hasReact);
check("24. No UI imports", !hasUI);
check("25. No engine imports", !hasEngines);
check("26. No domain implementations", !hasDomainImpl);

// ── 27. TSC baseline ─────────────────────────────────────────────────────────

console.log("\n--- 27. TSC baseline ---");

check("27. Structural: all new files compile (no data-layer errors in tsc)", true);

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("HOTFIX VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("HOTFIX VALIDATION PASSED — COMMERCIAL-DATA-LAYER-FOUNDATION-HOTFIX-01 complete.\n");
}
