/**
 * scripts/validate-customer-enrichment-02.ts
 *
 * Structural validation for CUSTOMER-SAG-ENRICHMENT-02.
 * Verifies files, contracts, consistency, and architecture constraints.
 *
 * Usage: npx tsx scripts/validate-customer-enrichment-02.ts
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
const DOMAINS = resolve(ROOT, "lib/comercial/data-layer/domains");

console.log("\n=== CUSTOMER-SAG-ENRICHMENT-02 Validation ===\n");

// -- 1. File Structure --------------------------------------------------------

console.log("--- 1. File Structure ---");

const expectedFiles = [
  "customer-entities.ts",
  "customer-normalizer.ts",
  "customer-quality-rules.ts",
  "customer-adapter.ts",
  "customer-registration.ts",
  "customer-commercial-assignment.ts",
  "customer-credit-profile.ts",
  "customer-evidence.ts",
  "customer-commercial-state.ts",
  "index.ts",
];

for (const f of expectedFiles) {
  check(`${f} exists`, existsSync(resolve(CUSTOMER, f)));
}

// -- 2. CustomerProfile enriched (FASE 1) ------------------------------------

console.log("\n--- 2. Profile Enrichment ---");

const entities = readFileSync(resolve(CUSTOMER, "customer-entities.ts"), "utf-8");

check("mobile field in CustomerContact", entities.includes("readonly mobile: string | null"));
check("ENRICHMENT-02 sprint reference", entities.includes("CUSTOMER-SAG-ENRICHMENT-02"));

// -- 3. CustomerCommercialAssignment (FASE 2) --------------------------------

console.log("\n--- 3. Commercial Assignment ---");

check("CustomerCommercialAssignment defined", entities.includes("interface CustomerCommercialAssignment"));
check("salesRepName field", entities.includes("readonly salesRepName: string | null"));
check("salesRepCode field", entities.includes("readonly salesRepCode: string | null"));
check("salesRepTaxId field", entities.includes("readonly salesRepTaxId: string | null"));
check("salesRepEvidence field", entities.includes("readonly salesRepEvidence: FieldEvidence | null"));
check("supervisorName field", entities.includes("readonly supervisorName: string | null"));
check("channel field", entities.includes("readonly channel: ResolvedLookup | null"));
check("zone field in assignment", entities.includes("readonly zone: ResolvedLookup | null"));
check("territory field", entities.includes("readonly territory: ResolvedLookup | null"));
check("segment field in assignment", entities.includes("readonly segment: ResolvedLookup | null"));
check("priceList field", entities.includes("readonly priceList: ResolvedLookup | null"));
check("route field", entities.includes("readonly route: ResolvedLookup | null"));
check("classification field", entities.includes("readonly classification: ResolvedLookup | null"));
check("conflicts field", entities.includes("readonly conflicts: AssignmentConflict[]"));

const assignFile = readFileSync(resolve(CUSTOMER, "customer-commercial-assignment.ts"), "utf-8");
check("normalizeCommercialAssignment function", assignFile.includes("function normalizeCommercialAssignment"));
check("CommercialAssignmentRawInput defined", assignFile.includes("interface CommercialAssignmentRawInput"));
check("CommercialAssignmentLookups defined", assignFile.includes("interface CommercialAssignmentLookups"));
check("Uses resolveSalesRep", assignFile.includes("resolveSalesRep"));
check("Uses resolveLookup", assignFile.includes("resolveLookup"));

// -- 4. CustomerCreditProfile (FASE 3) ----------------------------------------

console.log("\n--- 4. Credit Profile ---");

check("CustomerCreditProfile defined", entities.includes("interface CustomerCreditProfile"));
check("creditTermDays in credit", entities.includes("readonly creditTermDays: number"));
check("creditLimit field", entities.includes("readonly creditLimit: number | null"));
check("creditLimitCurrency field", entities.includes("readonly creditLimitCurrency: string"));
check("isBlocked field", entities.includes("readonly isBlocked: boolean"));
check("creditStatus field", entities.includes("readonly creditStatus: CreditStatus"));
check("conditions field", entities.includes("readonly conditions: string | null"));
check("CreditStatus type defined", entities.includes("type CreditStatus"));
check("APPROVED status", entities.includes('"APPROVED"'));
check("BLOCKED status", entities.includes('"BLOCKED"'));
check("NOT_CONFIGURED status", entities.includes('"NOT_CONFIGURED"'));

const creditFile = readFileSync(resolve(CUSTOMER, "customer-credit-profile.ts"), "utf-8");
check("normalizeCreditProfile function", creditFile.includes("function normalizeCreditProfile"));
check("CreditProfileRawInput defined", creditFile.includes("interface CreditProfileRawInput"));
check("deriveCreditStatus function", creditFile.includes("function deriveCreditStatus"));

// -- 5. Active Status (FASE 4) ------------------------------------------------

console.log("\n--- 5. Active Status ---");

check("ACTIVE status", entities.includes('"ACTIVE"'));
check("INACTIVE status", entities.includes('"INACTIVE"'));
check("SUSPENDED status", entities.includes('"SUSPENDED"'));
check("BLOCKED in admin status", entities.includes('"BLOCKED"'));
check("UNKNOWN in admin status", entities.includes('"UNKNOWN"'));
check("ActiveStatusInput defined", entities.includes("interface ActiveStatusInput"));
check("sagActivo field", entities.includes("readonly sagActivo: boolean | null"));
check("sagCreditBlocked field", entities.includes("readonly sagCreditBlocked: boolean | null"));
check("crmAccountStatus field", entities.includes("readonly crmAccountStatus: string | null"));
check("deriveCustomerAdminStatus function", entities.includes("function deriveCustomerAdminStatus"));
check("Status logic documented", entities.includes("sagActivo === false") && entities.includes("INACTIVE"));

// -- 6. Sales Representative (FASE 5) -----------------------------------------

console.log("\n--- 6. Sales Rep ---");

check("SalesRepInput defined", entities.includes("interface SalesRepInput"));
check("SalesRepResolution defined", entities.includes("interface SalesRepResolution"));
check("resolveSalesRep function", entities.includes("function resolveSalesRep"));
check("sagVendedorName field", entities.includes("readonly sagVendedorName: string | null"));
check("crmAssignedUserName field", entities.includes("readonly crmAssignedUserName: string | null"));
check("Conflict detection in rep resolver", entities.includes("CRM_WINS"));
check("Evidence in rep resolution", entities.includes("CONFLICTED"));

// -- 7. Lookup Resolution (FASE 6) -------------------------------------------

console.log("\n--- 7. Lookup Resolution ---");

check("LookupTable defined", entities.includes("interface LookupTable"));
check("ResolvedLookup defined", entities.includes("interface ResolvedLookup"));
check("resolveLookup function", entities.includes("function resolveLookup"));
check("Lookup has code field", entities.includes("readonly code: string"));
check("Lookup has name field", entities.includes("readonly name: string | null"));
check("Lookup has resolved flag", entities.includes("readonly resolved: boolean"));

// -- 8. CRM Join Fix (FASE 7) ------------------------------------------------

console.log("\n--- 8. CRM Join ---");

check("CrmJoinInput defined", entities.includes("interface CrmJoinInput"));
check("CrmJoinResult defined", entities.includes("interface CrmJoinResult"));
check("resolveCrmJoin function", entities.includes("function resolveCrmJoin"));
check("DIRECT join method", entities.includes('"DIRECT"'));
check("BILLING_ACCOUNT join method", entities.includes('"BILLING_ACCOUNT"'));
check("billingAccountId field", entities.includes("readonly billingAccountId: string | null"));
check("CRM join bug documented", entities.includes("CRMQuote.customerId is NULL"));

// -- 9. Quality (FASE 8) -----------------------------------------------------

console.log("\n--- 9. Quality ---");

const quality = readFileSync(resolve(CUSTOMER, "customer-quality-rules.ts"), "utf-8");
check("CustomerQualityDimensions defined", quality.includes("interface CustomerQualityDimensions"));
check("identity dimension", quality.includes("readonly identity: number"));
check("contact dimension", quality.includes("readonly contact: number"));
check("location dimension", quality.includes("readonly location: number"));
check("commercial dimension", quality.includes("readonly commercial: number"));
check("credit dimension", quality.includes("readonly credit: number"));
check("hasCommercialAssignment in completeness", quality.includes("hasCommercialAssignment"));
check("hasCreditConfig in completeness", quality.includes("hasCreditConfig"));
check("Weighted scoring", quality.includes("0.25") && quality.includes("0.20") && quality.includes("0.15"));
check("Mobile in contact quality", quality.includes("profile.contact.mobile"));

// -- 10. Evidence (FASE 9) ---------------------------------------------------

console.log("\n--- 10. Evidence ---");

const evidence = readFileSync(resolve(CUSTOMER, "customer-evidence.ts"), "utf-8");
check("buildCustomerFieldEvidence function", evidence.includes("function buildCustomerFieldEvidence"));
check("buildAssignmentEvidence function", evidence.includes("function buildAssignmentEvidence"));
check("buildCreditEvidence function", evidence.includes("function buildCreditEvidence"));
check("buildStatusEvidence function", evidence.includes("function buildStatusEvidence"));
check("fieldEvidenceToDomainEvidence function", evidence.includes("function fieldEvidenceToDomainEvidence"));
check("Evidence domain is CUSTOMER", evidence.includes('domain: "CUSTOMER"'));
check("Evidence entityTypes", evidence.includes('"CommercialAssignment"') && evidence.includes('"CreditProfile"'));

// -- 11. Read Model (FASE 10) ------------------------------------------------

console.log("\n--- 11. Read Model ---");

const state = readFileSync(resolve(CUSTOMER, "customer-commercial-state.ts"), "utf-8");
check("CommercialCustomerState defined", state.includes("interface CommercialCustomerState"));
check("BuildCommercialCustomerStateInput defined", state.includes("interface BuildCommercialCustomerStateInput"));
check("buildCommercialCustomerState function", state.includes("function buildCommercialCustomerState"));
check("State has profile", state.includes("readonly profile: CustomerProfile"));
check("State has assignment", state.includes("readonly assignment: CustomerCommercialAssignment | null"));
check("State has credit", state.includes("readonly credit: CustomerCreditProfile | null"));
check("State has salesRepName", state.includes("readonly salesRepName: string | null"));
check("State has zone", state.includes("readonly zone: ResolvedLookup | null"));
check("State has completenessScore", state.includes("readonly completenessScore: number"));
check("State has evidence array", state.includes("readonly evidence: CommercialDomainEvidence[]"));
check("State has conflicts", state.includes("readonly conflicts: AssignmentConflict[]"));
check("State has sources", state.includes("readonly sources: string[]"));

// -- 12. Barrel exports -------------------------------------------------------

console.log("\n--- 12. Barrel Exports ---");

const barrel = readFileSync(resolve(CUSTOMER, "index.ts"), "utf-8");

// New entity types
check("Exports CustomerCommercialAssignment", barrel.includes("CustomerCommercialAssignment"));
check("Exports CustomerCreditProfile", barrel.includes("CustomerCreditProfile"));
check("Exports FieldEvidence", barrel.includes("FieldEvidence"));
check("Exports ResolvedLookup", barrel.includes("ResolvedLookup"));
check("Exports AssignmentConflict", barrel.includes("AssignmentConflict"));
check("Exports CreditStatus", barrel.includes("CreditStatus"));
check("Exports LookupTable", barrel.includes("LookupTable"));

// New functions
check("Exports deriveCustomerAdminStatus", barrel.includes("deriveCustomerAdminStatus"));
check("Exports resolveSalesRep", barrel.includes("resolveSalesRep"));
check("Exports resolveLookup", barrel.includes("resolveLookup"));
check("Exports resolveCrmJoin", barrel.includes("resolveCrmJoin"));
check("Exports normalizeCommercialAssignment", barrel.includes("normalizeCommercialAssignment"));
check("Exports normalizeCreditProfile", barrel.includes("normalizeCreditProfile"));
check("Exports buildCommercialCustomerState", barrel.includes("buildCommercialCustomerState"));
check("Exports buildCustomerFieldEvidence", barrel.includes("buildCustomerFieldEvidence"));
check("Exports buildStatusEvidence", barrel.includes("buildStatusEvidence"));
check("Exports CustomerQualityDimensions", barrel.includes("CustomerQualityDimensions"));

// -- 13. Domain Descriptor Updated -------------------------------------------

console.log("\n--- 13. Domain Descriptor ---");

const descriptors = readFileSync(resolve(DOMAINS, "commercial-domain-descriptors.ts"), "utf-8");
check("CustomerCommercialAssignment in descriptor", descriptors.includes('"CustomerCommercialAssignment"'));
check("CustomerCreditProfile in descriptor", descriptors.includes('"CustomerCreditProfile"'));
check("Descriptor version updated", descriptors.includes('"2.0.0"'));

// -- 14. Architecture Constraints --------------------------------------------

console.log("\n--- 14. Architecture ---");

const allNewContent = [
  assignFile,
  creditFile,
  evidence,
  state,
].join("\n");

check("No Prisma in new files", !allNewContent.includes("@prisma"));
check("No React in new files", !allNewContent.includes('from "react'));
check("No UI components in new files", !allNewContent.includes("components/"));
check("No scoring engine", !allNewContent.includes("calculateScore") && !allNewContent.includes("ScoringEngine"));
check("No churn prediction", !allNewContent.includes("calculateChurn") && !allNewContent.includes("ChurnEngine"));
check("No behavior computation", !allNewContent.includes("computeBehavior") && !allNewContent.includes("BehaviorEngine"));

// -- 15. FieldEvidence contract -----------------------------------------------

console.log("\n--- 15. Field Evidence Contract ---");

check("EvidenceSource type", entities.includes("type EvidenceSource"));
check("FieldQuality type", entities.includes("type FieldQuality"));
check("FieldEvidence interface", entities.includes("interface FieldEvidence"));
check("SAG source", entities.includes('"SAG"'));
check("CRM source", entities.includes('"CRM"'));
check("MANUAL source", entities.includes('"MANUAL"'));
check("DERIVED source", entities.includes('"DERIVED"'));
check("CONFIRMED quality", entities.includes('"CONFIRMED"'));
check("PARTIAL quality", entities.includes('"PARTIAL"'));
check("ESTIMATED quality", entities.includes('"ESTIMATED"'));
check("UNAVAILABLE quality", entities.includes('"UNAVAILABLE"'));
check("CONFLICTED quality", entities.includes('"CONFLICTED"'));
check("confidence field in evidence", entities.includes("readonly confidence: number"));
check("rawValue field in evidence", entities.includes("readonly rawValue: unknown"));

// -- 16. Normalizer enrichment fields -----------------------------------------

console.log("\n--- 16. Normalizer Raw Fields ---");

const normalizer = readFileSync(resolve(CUSTOMER, "customer-normalizer.ts"), "utf-8");
check("celular raw field", normalizer.includes("readonly celular?: unknown"));
check("vendedor raw field", normalizer.includes("readonly vendedor?: unknown"));
check("nitVendedor raw field", normalizer.includes("readonly nitVendedor?: unknown"));
check("cupoCredito raw field", normalizer.includes("readonly cupoCredito?: unknown"));
check("bloqueoComercial raw field", normalizer.includes("readonly bloqueoComercial?: unknown"));
check("listaPrecios raw field", normalizer.includes("readonly listaPrecios?: unknown"));
check("billingAccountId raw field", normalizer.includes("readonly billingAccountId?: unknown"));
check("crmAccountStatus raw field", normalizer.includes("readonly crmAccountStatus?: unknown"));
check("Uses deriveCustomerAdminStatus", normalizer.includes("deriveCustomerAdminStatus"));
check("Mobile in contact building", normalizer.includes("mobile: mobileResult"));

// -- Summary ------------------------------------------------------------------

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("CUSTOMER-SAG-ENRICHMENT-02 VALIDATION FAILED.\n");
  process.exit(1);
} else {
  console.log("CUSTOMER-SAG-ENRICHMENT-02 VALIDATION PASSED.\n");
}
