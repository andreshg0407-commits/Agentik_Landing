/**
 * scripts/validate-customer-domain-01.ts
 *
 * Structural validation for CUSTOMER-DOMAIN-01.
 * Verifies files, contracts, consistency, and architecture constraints.
 *
 * Usage: npx tsx scripts/validate-customer-domain-01.ts
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
const CUSTOMER = resolve(ROOT, "lib/comercial/data-layer/domains/customer");
const SHARED = resolve(ROOT, "lib/comercial/data-layer/shared");
const DOMAINS = resolve(ROOT, "lib/comercial/data-layer/domains");

console.log("\n=== CUSTOMER-DOMAIN-01 Validation ===\n");

// -- 1. Core files exist -----------------------------------------------------

console.log("--- 1. File Structure ---");

const expectedFiles = [
  "customer-entities.ts",
  "customer-normalizer.ts",
  "customer-quality-rules.ts",
  "customer-adapter.ts",
  "customer-registration.ts",
  "index.ts",
];

for (const f of expectedFiles) {
  check(`${f} exists`, existsSync(resolve(CUSTOMER, f)));
}

// -- 2. Entity types match descriptor ----------------------------------------

console.log("\n--- 2. Entity Types ---");

const entities = readFileSync(resolve(CUSTOMER, "customer-entities.ts"), "utf-8");
check("CustomerProfile defined", entities.includes("interface CustomerProfile"));
check("CustomerBranch defined", entities.includes("interface CustomerBranch"));
check("CustomerReceivable defined", entities.includes("interface CustomerReceivable"));
check("CustomerBehavior defined", entities.includes("interface CustomerBehavior"));
check("VendorProfile defined", entities.includes("interface VendorProfile"));
check("CollectionRecord defined", entities.includes("interface CollectionRecord"));

// -- 3. Entity contracts have required envelope fields -----------------------

console.log("\n--- 3. Envelope Fields ---");

check("CustomerProfile has identity", entities.includes("readonly identity: CommercialIdentity"));
check("CustomerProfile has externalRef", entities.includes("readonly externalRef: ExternalReference"));
check("CustomerProfile has sourceMetadata", entities.includes("readonly sourceMetadata: DataSourceMetadata"));
check("CustomerProfile has timestamps", entities.includes("readonly timestamps: CommercialTimestamp"));
check("CustomerProfile has schemaVersion", entities.includes("readonly schemaVersion: number"));

// -- 4. Customer-specific fields --------------------------------------------

console.log("\n--- 4. Customer Fields ---");

check("taxId field", entities.includes("readonly taxId: string"));
check("taxIdType field", entities.includes("readonly taxIdType: TaxIdType"));
check("name field", entities.includes("readonly name: string"));
check("segment field", entities.includes("readonly segment: CustomerSegment"));
check("creditTermDays field", entities.includes("readonly creditTermDays: number"));
check("contact field", entities.includes("readonly contact: CustomerContact"));
check("location field", entities.includes("readonly location: CustomerLocation"));
check("fiscal field", entities.includes("readonly fiscal: CustomerFiscal"));
check("adminStatus field", entities.includes("readonly adminStatus: CustomerAdminStatus"));
check("operationalStatus field", entities.includes("readonly operationalStatus: CustomerOperationalStatus"));
check("thirdPartyType field", entities.includes("readonly thirdPartyType: ThirdPartyType"));
check("crmId field", entities.includes("readonly crmId: string | null"));

// -- 5. Dual state pattern (ENTERPRISE-05) -----------------------------------

console.log("\n--- 5. Dual State Pattern ---");

check("Admin statuses defined", entities.includes('"ACTIVE"') && entities.includes('"SUSPENDED"') && entities.includes('"ARCHIVED"'));
check("Operational statuses defined", entities.includes('"NEVER_SYNCED"') && entities.includes('"SYNCED"') && entities.includes('"SYNC_ERROR"'));
check("deriveCustomerOperationalStatus exists", entities.includes("function deriveCustomerOperationalStatus"));

// -- 6. Third party type (TERCEROS contains multiple types) ------------------

console.log("\n--- 6. Third Party Types ---");

check("CUSTOMER type", entities.includes('"CUSTOMER"'));
check("VENDOR type", entities.includes('"VENDOR"'));
check("EMPLOYEE type", entities.includes('"EMPLOYEE"'));
check("MIXED type", entities.includes('"MIXED"'));
check("UNKNOWN type", entities.includes('"UNKNOWN"'));

// -- 7. Receivable domain types ----------------------------------------------

console.log("\n--- 7. Receivable Types ---");

check("ReceivableDocumentType defined", entities.includes("ReceivableDocumentType"));
check("INVOICE type", entities.includes('"INVOICE"'));
check("CREDIT_NOTE type", entities.includes('"CREDIT_NOTE"'));
check("ReceivableAgingBracket defined", entities.includes("ReceivableAgingBracket"));
check("deriveAgingBracket function", entities.includes("function deriveAgingBracket"));
check("CURRENT bracket", entities.includes('"CURRENT"'));
check("PAST_DUE_91_PLUS bracket", entities.includes('"PAST_DUE_91_PLUS"'));
check("null handling in deriveAgingBracket", entities.includes("== null"));

// -- 8. Behavior types -------------------------------------------------------

console.log("\n--- 8. Behavior Types ---");

check("PurchaseFrequency defined", entities.includes("PurchaseFrequency"));
check("PaymentBehavior defined", entities.includes("PaymentBehavior"));
check("EARLY_PAYER type", entities.includes('"EARLY_PAYER"'));
check("CHRONIC_LATE type", entities.includes('"CHRONIC_LATE"'));

// -- 9. Collection types -----------------------------------------------------

console.log("\n--- 9. Collection Types ---");

check("PaymentMethod defined", entities.includes("PaymentMethod"));
check("CollectionStatus defined", entities.includes("CollectionStatus"));
check("BANK_TRANSFER type", entities.includes('"BANK_TRANSFER"'));
check("BOUNCED type", entities.includes('"BOUNCED"'));

// -- 10. Normalizer -----------------------------------------------------------

console.log("\n--- 10. Normalizer ---");

const normalizer = readFileSync(resolve(CUSTOMER, "customer-normalizer.ts"), "utf-8");
check("CustomerRawInput defined", normalizer.includes("interface CustomerRawInput"));
check("CustomerNormalizationContext defined", normalizer.includes("interface CustomerNormalizationContext"));
check("CustomerNormalizationOutput defined", normalizer.includes("interface CustomerNormalizationOutput"));
check("normalizeCustomerRaw function", normalizer.includes("function normalizeCustomerRaw"));
check("Uses normalizeCustomerCode", normalizer.includes("normalizeCustomerCode"));
check("Uses buildCanonicalId", normalizer.includes("buildCanonicalId"));
check("Uses buildExternalReference", normalizer.includes("buildExternalReference"));
check("Uses ctx.tenantId", normalizer.includes("ctx.tenantId"));
check("TERCEROS resource reference", normalizer.includes('"TERCEROS"'));
check("Domain is CUSTOMER", normalizer.includes('domain: "CUSTOMER"'));
check("EntityType is CustomerProfile", normalizer.includes('entityType: "CustomerProfile"'));
check("Has correlationId", normalizer.includes("correlationId"));

// -- 11. Quality rules --------------------------------------------------------

console.log("\n--- 11. Quality Rules ---");

const quality = readFileSync(resolve(CUSTOMER, "customer-quality-rules.ts"), "utf-8");
check("evaluateCustomerQuality function", quality.includes("function evaluateCustomerQuality"));
check("evaluateCustomerFreshness function", quality.includes("function evaluateCustomerFreshness"));
check("assessCustomerCompleteness function", quality.includes("function assessCustomerCompleteness"));
check("CUSTOMER_FRESHNESS_SLA_SECONDS defined", quality.includes("CUSTOMER_FRESHNESS_SLA_SECONDS"));
check("SLA is 86400", quality.includes("86400"));
check("Uses evaluateCommercialQuality", quality.includes("evaluateCommercialQuality"));
check("Uses evaluateCommercialFreshness", quality.includes("evaluateCommercialFreshness"));

// -- 12. Adapter ---------------------------------------------------------------

console.log("\n--- 12. Adapter ---");

const adapter = readFileSync(resolve(CUSTOMER, "customer-adapter.ts"), "utf-8");
check("SAG_CUSTOMER_ADAPTER_ID defined", adapter.includes("SAG_CUSTOMER_ADAPTER_ID"));
check("SAG_CUSTOMER_ADAPTER_VERSION defined", adapter.includes("SAG_CUSTOMER_ADAPTER_VERSION"));
check("createSagCustomerAdapter function", adapter.includes("function createSagCustomerAdapter"));
check("SagCustomerAdapterDeps interface", adapter.includes("interface SagCustomerAdapterDeps"));
check("supportsIncremental: false", adapter.includes("supportsIncremental: false"));
check("Domain CUSTOMER in adapter", adapter.includes('domain: "CUSTOMER"'));
check("Uses normalizeCustomerRaw", adapter.includes("normalizeCustomerRaw"));
check("Uses evaluateCustomerQuality", adapter.includes("evaluateCustomerQuality"));

// -- 13. Registration ----------------------------------------------------------

console.log("\n--- 13. Registration ---");

const registration = readFileSync(resolve(CUSTOMER, "customer-registration.ts"), "utf-8");
check("registerCustomerAdapter function", registration.includes("function registerCustomerAdapter"));
check("CUSTOMER_SYNC capability", registration.includes("CUSTOMER_SYNC"));
check("CUSTOMER_DISCOVERY capability", registration.includes("CUSTOMER_DISCOVERY"));
check("CUSTOMER_BULK capability", registration.includes("CUSTOMER_BULK"));
check("Domain CUSTOMER", registration.includes('domain: "CUSTOMER"'));

// -- 14. Barrel exports -------------------------------------------------------

console.log("\n--- 14. Barrel Exports ---");

const barrel = readFileSync(resolve(CUSTOMER, "index.ts"), "utf-8");
check("Exports CustomerProfile", barrel.includes("CustomerProfile"));
check("Exports CustomerBranch", barrel.includes("CustomerBranch"));
check("Exports CustomerReceivable", barrel.includes("CustomerReceivable"));
check("Exports CustomerBehavior", barrel.includes("CustomerBehavior"));
check("Exports VendorProfile", barrel.includes("VendorProfile"));
check("Exports CollectionRecord", barrel.includes("CollectionRecord"));
check("Exports normalizeCustomerRaw", barrel.includes("normalizeCustomerRaw"));
check("Exports evaluateCustomerQuality", barrel.includes("evaluateCustomerQuality"));
check("Exports createSagCustomerAdapter", barrel.includes("createSagCustomerAdapter"));
check("Exports registerCustomerAdapter", barrel.includes("registerCustomerAdapter"));
check("Exports deriveAgingBracket", barrel.includes("deriveAgingBracket"));
check("Exports assessCustomerCompleteness", barrel.includes("assessCustomerCompleteness"));

// -- 15. Domain descriptor alignment -----------------------------------------

console.log("\n--- 15. Domain Descriptor ---");

const descriptors = readFileSync(resolve(DOMAINS, "commercial-domain-descriptors.ts"), "utf-8");
check("CUSTOMER_DOMAIN exists", descriptors.includes("CUSTOMER_DOMAIN"));
check("CUSTOMER_DOMAIN is active", descriptors.includes('id: "CUSTOMER"'));
check("CustomerProfile in descriptor entityTypes", descriptors.includes('"CustomerProfile"'));
check("CustomerBranch in descriptor entityTypes", descriptors.includes('"CustomerBranch"'));
check("CustomerReceivable in descriptor entityTypes", descriptors.includes('"CustomerReceivable"'));
check("CustomerBehavior in descriptor entityTypes", descriptors.includes('"CustomerBehavior"'));
check("VendorProfile in descriptor entityTypes", descriptors.includes('"VendorProfile"'));
check("CollectionRecord in descriptor entityTypes", descriptors.includes('"CollectionRecord"'));

// -- 16. Cross-domain evidence ------------------------------------------------

console.log("\n--- 16. Cross-domain Evidence ---");

const evidence = readFileSync(resolve(SHARED, "domain-evidence.ts"), "utf-8");
check("buildEvidenceFromCustomer exists", evidence.includes("function buildEvidenceFromCustomer"));
check("Customer domain in evidence builder", evidence.includes('domain: "CUSTOMER"'));
check("CustomerProfile entityType in builder", evidence.includes('entityType: "CustomerProfile"'));

// -- 17. Shared index updated -------------------------------------------------

console.log("\n--- 17. Shared Index ---");

const sharedIndex = readFileSync(resolve(SHARED, "index.ts"), "utf-8");
check("buildEvidenceFromCustomer in shared barrel", sharedIndex.includes("buildEvidenceFromCustomer"));

// -- 18. Architecture constraints ---------------------------------------------

console.log("\n--- 18. Architecture ---");

const allContent = [
  entities,
  normalizer,
  quality,
  adapter,
  registration,
  barrel,
].join("\n");

check("No Prisma in customer domain", !allContent.includes("@prisma"));
check("No React in customer domain", !allContent.includes('from "react'));
check("No UI components in customer domain", !allContent.includes("components/"));
check("No DIAN calls", !allContent.includes("DIAN") || !allContent.includes("dian.gov"));
check("No scoring engine", !allContent.includes("calculateScore") && !allContent.includes("ScoringEngine"));
check("No churn prediction", !allContent.includes("calculateChurn") && !allContent.includes("ChurnEngine"));
check("No segmentation engine", !allContent.includes("calculateSegmentation") && !allContent.includes("SegmentationEngine"));

// -- 19. ERP-agnostic naming --------------------------------------------------

console.log("\n--- 19. ERP-Agnostic ---");

check("Entities use taxId not NIT field", entities.includes("readonly taxId: string"));
check("Entities use name not razonSocial", entities.includes("readonly name: string"));
check("Entities use creditTermDays not plazoCredito", entities.includes("readonly creditTermDays: number"));
check("No SAG field names in entity interfaces",
  !entities.includes("readonly nit:") &&
  !entities.includes("readonly razonSocial:") &&
  !entities.includes("readonly plazoCredito:") &&
  !entities.includes("readonly idCliente:")
);

// -- Summary ------------------------------------------------------------------

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("CUSTOMER-DOMAIN-01 VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("CUSTOMER-DOMAIN-01 VALIDATION PASSED.\n");
}
