/**
 * scripts/test-customer-enrichment-02.ts
 *
 * Functional tests for CUSTOMER-SAG-ENRICHMENT-02.
 * Covers: profile enrichment, commercial assignment, credit profile,
 * active status, sales rep resolution, lookup resolution, CRM join,
 * quality dimensions, evidence, and read model.
 *
 * Usage: npx tsx scripts/test-customer-enrichment-02.ts
 */

import {
  normalizeCustomerRaw,
  type CustomerRawInput,
  type CustomerNormalizationContext,
  normalizeCommercialAssignment,
  type CommercialAssignmentRawInput,
  type CommercialAssignmentContext,
  type CommercialAssignmentLookups,
  normalizeCreditProfile,
  type CreditProfileRawInput,
  type CreditProfileContext,
  deriveCustomerAdminStatus,
  resolveSalesRep,
  resolveLookup,
  resolveCrmJoin,
  evaluateCustomerQuality,
  evaluateCustomerFreshness,
  assessCustomerCompleteness,
  buildCommercialCustomerState,
  buildCustomerFieldEvidence,
  buildAssignmentEvidence,
  buildCreditEvidence,
  buildStatusEvidence,
  type LookupTable,
} from "../lib/comercial/data-layer/domains/customer";

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

// ── Shared context builders ──────────────────────────────────────────────────

function buildNormCtx(): CustomerNormalizationContext {
  return {
    tenantId: "castillitos",
    sourceSystem: "SAG_PYA",
    instanceId: "castillitos",
    adapterId: "sag-customer-adapter",
    adapterVersion: "2.0.0",
    correlationId: "test-enrich-001",
    extractedAt: new Date(),
  };
}

function buildAssignmentCtx(): CommercialAssignmentContext {
  return {
    tenantId: "castillitos",
    sourceSystem: "SAG_PYA",
    instanceId: "castillitos",
    adapterId: "sag-customer-adapter",
    adapterVersion: "2.0.0",
    correlationId: "test-assign-001",
    extractedAt: new Date(),
  };
}

function buildCreditCtx(): CreditProfileContext {
  return {
    tenantId: "castillitos",
    sourceSystem: "SAG_PYA",
    instanceId: "castillitos",
    adapterId: "sag-customer-adapter",
    adapterVersion: "2.0.0",
    correlationId: "test-credit-001",
    extractedAt: new Date(),
  };
}

// ── Sample lookup tables ─────────────────────────────────────────────────────

const ZONES: LookupTable = {
  entries: new Map([
    ["COSTA_ESTE_USA", "Costa Este USA"],
    ["BOGOTA", "Bogota DC"],
    ["ANTIOQUIA", "Antioquia"],
  ]),
};

const PRICE_LISTS: LookupTable = {
  entries: new Map([
    ["PL_EXPORT_USA", "Exportacion USA"],
    ["PL_NACIONAL", "Lista Nacional"],
  ]),
};

const SEGMENTS: LookupTable = {
  entries: new Map([
    ["MAYORISTA", "Mayorista"],
    ["MINORISTA", "Minorista"],
    ["DISTRIBUIDOR", "Distribuidor"],
  ]),
};

const CHANNELS: LookupTable = {
  entries: new Map([
    ["MAYORISTA", "Canal Mayorista"],
    ["RETAIL", "Canal Retail"],
  ]),
};

// ══════════════════════════════════════════════════════════════════════════════

console.log("\n=== CUSTOMER-SAG-ENRICHMENT-02 Tests ===\n");

// ── 1. Profile Enrichment (FASE 1) ──────────────────────────────────────────

console.log("--- 1. Profile Enrichment ---");

const fullRaw: CustomerRawInput = {
  idCliente: "C001",
  nit: "800123456",
  razonSocial: "VANIDADES MARY",
  segmento: "MAYORISTA",
  plazoCredito: 30,
  nombreComercial: "Vanidades Mary Store",
  telefono: "3012345678",
  telefono2: "6011234567",
  celular: "3109876543",
  email: "mary@vanidadesmary.com",
  contacto: "Mary Gonzalez",
  direccion: "123 Main St, Plainfield NJ",
  ciudad: "Plainfield",
  codigoCiudad: "08901",
  departamento: "New Jersey",
  codigoDepartamento: "NJ",
  pais: "US",
  activo: true,
  tipoTercero: "CLIENTE",
  crmId: "crm-account-001",
};

const fullResult = normalizeCustomerRaw(fullRaw, buildNormCtx());
check("1.1 Complete customer normalizes OK", !fullResult.skipped && fullResult.customer != null);
check("1.2 Name is correct", fullResult.customer?.name === "VANIDADES MARY");
check("1.3 Trade name populated", fullResult.customer?.tradeName === "Vanidades Mary Store");
check("1.4 Mobile phone populated", fullResult.customer?.contact.mobile === "3109876543");
check("1.5 Contact person populated", fullResult.customer?.contact.contactPerson === "Mary Gonzalez");
check("1.6 City populated", fullResult.customer?.location.city === "Plainfield");
check("1.7 Country is US", fullResult.customer?.location.country === "US");
check("1.8 CRM ID populated", fullResult.customer?.crmId === "crm-account-001");

// ── 2. Customer without email ─────────────────────────────────────────────

console.log("\n--- 2. Customer Without Email ---");

const noEmailRaw: CustomerRawInput = {
  idCliente: "C002",
  nit: "900111222",
  razonSocial: "DISTRIBUCIONES ABC",
  segmento: "",
  plazoCredito: 0,
};

const noEmailResult = normalizeCustomerRaw(noEmailRaw, buildNormCtx());
check("2.1 Normalizes without email", !noEmailResult.skipped);
check("2.2 Email is null", noEmailResult.customer?.contact.email == null);
check("2.3 Mobile is null", noEmailResult.customer?.contact.mobile == null);
check("2.4 Phone is null", noEmailResult.customer?.contact.primaryPhone == null);

// ── 3. Active Status (FASE 4) ───────────────────────────────────────────────

console.log("\n--- 3. Active Status ---");

check("3.1 Active from SAG",
  deriveCustomerAdminStatus({ sagActivo: true, sagCreditBlocked: null, sagTipoTercero: null, crmAccountStatus: null }) === "ACTIVE");
check("3.2 Inactive from SAG",
  deriveCustomerAdminStatus({ sagActivo: false, sagCreditBlocked: null, sagTipoTercero: null, crmAccountStatus: null }) === "INACTIVE");
check("3.3 Blocked from credit",
  deriveCustomerAdminStatus({ sagActivo: true, sagCreditBlocked: true, sagTipoTercero: null, crmAccountStatus: null }) === "BLOCKED");
check("3.4 Suspended from CRM",
  deriveCustomerAdminStatus({ sagActivo: null, sagCreditBlocked: null, sagTipoTercero: null, crmAccountStatus: "Suspended" }) === "SUSPENDED");
check("3.5 Unknown when no indicators",
  deriveCustomerAdminStatus({ sagActivo: null, sagCreditBlocked: null, sagTipoTercero: null, crmAccountStatus: null }) === "UNKNOWN");
check("3.6 SAG inactive overrides CRM",
  deriveCustomerAdminStatus({ sagActivo: false, sagCreditBlocked: null, sagTipoTercero: null, crmAccountStatus: "Active" }) === "INACTIVE");
check("3.7 Profile uses derived status",
  fullResult.customer?.adminStatus === "ACTIVE");

// ── 4. Sales Rep Resolution (FASE 5) ────────────────────────────────────────

console.log("\n--- 4. Sales Rep ---");

const repBoth = resolveSalesRep({
  sagVendedorName: "Carlos Gomez",
  sagVendedorNit: "12345678",
  crmAssignedUserName: "Carlos Gomez",
  crmAssignedUserId: "crm-user-001",
}, new Date());
check("4.1 Both agree → no conflict", repBoth.conflict == null);
check("4.2 Name resolved", repBoth.salesRepName === "Carlos Gomez");
check("4.3 Code from CRM", repBoth.salesRepCode === "crm-user-001");
check("4.4 TaxId from SAG", repBoth.salesRepTaxId === "12345678");
check("4.5 Quality CONFIRMED", repBoth.evidence?.quality === "CONFIRMED");

const repConflict = resolveSalesRep({
  sagVendedorName: "Carlos Gomez",
  sagVendedorNit: "12345678",
  crmAssignedUserName: "Maria Perez",
  crmAssignedUserId: "crm-user-002",
}, new Date());
check("4.6 Conflict detected", repConflict.conflict != null);
check("4.7 CRM wins in conflict", repConflict.salesRepName === "Maria Perez");
check("4.8 Quality CONFLICTED", repConflict.evidence?.quality === "CONFLICTED");
check("4.9 Conflict has both sources", repConflict.conflict!.sources.length === 2);

const repNone = resolveSalesRep({
  sagVendedorName: null,
  sagVendedorNit: null,
  crmAssignedUserName: null,
  crmAssignedUserId: null,
}, new Date());
check("4.10 No rep → null", repNone.salesRepName == null);
check("4.11 No evidence when missing", repNone.evidence == null);

const repSagOnly = resolveSalesRep({
  sagVendedorName: "Carlos Gomez",
  sagVendedorNit: "12345678",
  crmAssignedUserName: null,
  crmAssignedUserId: null,
}, new Date());
check("4.12 SAG-only rep", repSagOnly.salesRepName === "Carlos Gomez");
check("4.13 SAG source", repSagOnly.evidence?.source === "SAG");

// ── 5. Lookup Resolution (FASE 6) ───────────────────────────────────────────

console.log("\n--- 5. Lookup Resolution ---");

const zoneOk = resolveLookup("COSTA_ESTE_USA", ZONES, "SAG", new Date());
check("5.1 Zone resolved", zoneOk.lookup?.resolved === true);
check("5.2 Zone name", zoneOk.lookup?.name === "Costa Este USA");
check("5.3 Zone code normalized", zoneOk.lookup?.code === "COSTA_ESTE_USA");

const zoneUnknown = resolveLookup("ZONA_XYZ", ZONES, "SAG", new Date());
check("5.4 Unknown zone not resolved", zoneUnknown.lookup?.resolved === false);
check("5.5 Unknown zone name null", zoneUnknown.lookup?.name == null);
check("5.6 Unknown zone code preserved", zoneUnknown.lookup?.code === "ZONA_XYZ");
check("5.7 Quality PARTIAL", zoneUnknown.evidence?.quality === "PARTIAL");

const zoneNoTable = resolveLookup("BOGOTA", null, "SAG", new Date());
check("5.8 No lookup table → not resolved", zoneNoTable.lookup?.resolved === false);
check("5.9 Note about unavailable table", zoneNoTable.evidence?.note?.includes("not available") === true);

const zoneEmpty = resolveLookup(null, ZONES, "SAG", new Date());
check("5.10 Null code → null lookup", zoneEmpty.lookup == null);

const plOk = resolveLookup("PL_EXPORT_USA", PRICE_LISTS, "SAG", new Date());
check("5.11 Price list resolved", plOk.lookup?.name === "Exportacion USA");

const plNotFound = resolveLookup("PL_UNKNOWN", PRICE_LISTS, "SAG", new Date());
check("5.12 Price list not found", plNotFound.lookup?.resolved === false);

// ── 6. Commercial Assignment (FASE 2) ───────────────────────────────────────

console.log("\n--- 6. Commercial Assignment ---");

const assignRaw: CommercialAssignmentRawInput = {
  customerTaxId: "800123456",
  vendedor: "Carlos Gomez",
  nitVendedor: "12345678",
  crmAssignedUserName: "Carlos Gomez",
  crmAssignedUserId: "crm-user-001",
  supervisor: "Director Nacional",
  canal: "MAYORISTA",
  zona: "COSTA_ESTE_USA",
  segmento: "MAYORISTA",
  listaPrecios: "PL_EXPORT_USA",
  ruta: "R01",
  clasificacion: "A",
  tipoCliente: "PREMIUM",
};

const lookups: CommercialAssignmentLookups = {
  zones: ZONES,
  channels: CHANNELS,
  segments: SEGMENTS,
  priceLists: PRICE_LISTS,
};

const assign = normalizeCommercialAssignment(assignRaw, buildAssignmentCtx(), lookups);
check("6.1 Sales rep resolved", assign.salesRepName === "Carlos Gomez");
check("6.2 Sales rep tax ID", assign.salesRepTaxId === "12345678");
check("6.3 No conflict (both agree)", assign.conflicts.length === 0);
check("6.4 Supervisor populated", assign.supervisorName === "Director Nacional");
check("6.5 Zone resolved", assign.zone?.resolved === true);
check("6.6 Zone name", assign.zone?.name === "Costa Este USA");
check("6.7 Channel resolved", assign.channel?.resolved === true);
check("6.8 Channel name", assign.channel?.name === "Canal Mayorista");
check("6.9 Segment resolved", assign.segment?.resolved === true);
check("6.10 Price list resolved", assign.priceList?.resolved === true);
check("6.11 Price list name", assign.priceList?.name === "Exportacion USA");
check("6.12 Route unresolved (no lookup)", assign.route?.resolved === false);
check("6.13 Route code preserved", assign.route?.code === "R01");
check("6.14 Classification unresolved (no lookup)", assign.classification?.resolved === false);
check("6.15 CustomerTaxId", assign.customerTaxId === "800123456");
check("6.16 Zone evidence", assign.zoneEvidence?.source === "SAG");
check("6.17 CanonicalId includes CommercialAssignment", assign.identity.canonicalId.includes("CommercialAssignment"));

// Customer without sales rep
const assignNoRep: CommercialAssignmentRawInput = {
  customerTaxId: "900111222",
  zona: "BOGOTA",
};
const assignNoRepResult = normalizeCommercialAssignment(assignNoRep, buildAssignmentCtx(), lookups);
check("6.18 No rep → null", assignNoRepResult.salesRepName == null);
check("6.19 Zone Bogota resolved", assignNoRepResult.zone?.resolved === true);
check("6.20 Zone Bogota name", assignNoRepResult.zone?.name === "Bogota DC");

// ── 7. Credit Profile (FASE 3) ──────────────────────────────────────────────

console.log("\n--- 7. Credit Profile ---");

const creditRaw: CreditProfileRawInput = {
  customerTaxId: "800123456",
  plazoCredito: 30,
  cupoCredito: 50000000,
  creditoHabilitado: true,
  bloqueoComercial: false,
  condicionesCredito: "Pago a 30 dias sin intereses",
  moneda: "COP",
};

const credit = normalizeCreditProfile(creditRaw, buildCreditCtx());
check("7.1 Credit term 30 days", credit.creditTermDays === 30);
check("7.2 Credit limit", credit.creditLimit === 50000000);
check("7.3 Not blocked", credit.isBlocked === false);
check("7.4 Status APPROVED", credit.creditStatus === "APPROVED");
check("7.5 Currency COP", credit.creditLimitCurrency === "COP");
check("7.6 Conditions text", credit.conditions === "Pago a 30 dias sin intereses");
check("7.7 Term evidence present", credit.creditTermEvidence != null);
check("7.8 Limit evidence present", credit.creditLimitEvidence != null);

// Credit not configured
const creditNone: CreditProfileRawInput = {
  customerTaxId: "900111222",
};
const creditNoneResult = normalizeCreditProfile(creditNone, buildCreditCtx());
check("7.9 No credit → term 0", creditNoneResult.creditTermDays === 0);
check("7.10 No credit → limit null", creditNoneResult.creditLimit == null);
check("7.11 No credit → UNKNOWN status", creditNoneResult.creditStatus === "UNKNOWN");

// Blocked credit
const creditBlocked: CreditProfileRawInput = {
  customerTaxId: "800999888",
  plazoCredito: 30,
  bloqueoComercial: true,
};
const creditBlockedResult = normalizeCreditProfile(creditBlocked, buildCreditCtx());
check("7.12 Blocked credit", creditBlockedResult.isBlocked === true);
check("7.13 Blocked status", creditBlockedResult.creditStatus === "BLOCKED");
check("7.14 Block evidence present", creditBlockedResult.blockEvidence != null);

// ── 8. CRM Join Fix (FASE 7) ────────────────────────────────────────────────

console.log("\n--- 8. CRM Join ---");

const crmDirect = resolveCrmJoin({ customerTaxId: "800123456", crmId: "crm-001", billingAccountId: "ba-001" });
check("8.1 Direct CRM link", crmDirect.joinMethod === "DIRECT");
check("8.2 Direct confidence", crmDirect.confidence === 1.0);

const crmFallback = resolveCrmJoin({ customerTaxId: "800123456", crmId: null, billingAccountId: "ba-001" });
check("8.3 Billing account fallback", crmFallback.joinMethod === "BILLING_ACCOUNT");
check("8.4 Fallback confidence 0.85", crmFallback.confidence === 0.85);
check("8.5 CRM ID from fallback", crmFallback.crmId === "ba-001");

const crmNone = resolveCrmJoin({ customerTaxId: "800123456", crmId: null, billingAccountId: null });
check("8.6 No CRM link", crmNone.joinMethod === "NONE");
check("8.7 Confidence 0", crmNone.confidence === 0);

// ── 9. Quality Evaluation (FASE 8) ──────────────────────────────────────────

console.log("\n--- 9. Quality ---");

const qualityResult = evaluateCustomerQuality(fullResult.customer!);
check("9.1 Quality score > 0", qualityResult.score > 0);
check("9.2 Quality status defined", qualityResult.status != null);

const completeFull = assessCustomerCompleteness(fullResult.customer!, assign, credit);
check("9.3 Has identity", completeFull.hasIdentity === true);
check("9.4 Has contact", completeFull.hasContact === true);
check("9.5 Has location", completeFull.hasLocation === true);
check("9.6 Has commercial assignment", completeFull.hasCommercialAssignment === true);
check("9.7 Has credit config", completeFull.hasCreditConfig === true);
check("9.8 Completeness > 0.8", completeFull.completenessScore > 0.8);
check("9.9 Dimensions exist", completeFull.dimensions != null);
check("9.10 Identity dimension", completeFull.dimensions.identity > 0);
check("9.11 Commercial dimension", completeFull.dimensions.commercial > 0);
check("9.12 Credit dimension", completeFull.dimensions.credit > 0);

// Minimal customer quality
const completeMinimal = assessCustomerCompleteness(noEmailResult.customer!);
check("9.13 Minimal has no contact", completeMinimal.hasContact === false);
check("9.14 Minimal has no commercial", completeMinimal.hasCommercialAssignment === false);
check("9.15 Minimal completeness < 0.5", completeMinimal.completenessScore < 0.5);
check("9.16 Missing fields populated", completeMinimal.missingFields.length > 0);

const freshnessResult = evaluateCustomerFreshness(fullResult.customer!);
check("9.17 Freshness evaluates", freshnessResult.status != null);

// ── 10. Evidence (FASE 9) ───────────────────────────────────────────────────

console.log("\n--- 10. Evidence ---");

const fieldEv = buildCustomerFieldEvidence({
  entityId: "castillitos:CUSTOMER:CustomerProfile:800123456",
  tenantId: "castillitos",
  field: "salesRepName",
  rawValue: "Carlos Gomez",
  canonicalValue: "Carlos Gomez",
  source: "SAG",
  confidence: 0.9,
  traceId: "test-ev-001",
});
check("10.1 Field evidence domain", fieldEv.domain === "CUSTOMER");
check("10.2 Field evidence entityType", fieldEv.entityType === "CustomerProfile");
check("10.3 Field evidence field", fieldEv.field === "salesRepName");

const assignEv = buildAssignmentEvidence({
  entityId: "castillitos:CUSTOMER:CommercialAssignment:800123456",
  tenantId: "castillitos",
  field: "zone",
  rawValue: "COSTA_ESTE_USA",
  canonicalValue: "Costa Este USA",
  source: "SAG",
  confidence: 1.0,
  traceId: "test-ev-002",
});
check("10.4 Assignment evidence entityType", assignEv.entityType === "CommercialAssignment");
check("10.5 Resolution CONFIRMED", assignEv.resolution === "CONFIRMED");

const creditEv = buildCreditEvidence({
  entityId: "castillitos:CUSTOMER:CreditProfile:800123456",
  tenantId: "castillitos",
  field: "creditLimit",
  rawValue: 50000000,
  canonicalValue: 50000000,
  confidence: 0.9,
  traceId: "test-ev-003",
});
check("10.6 Credit evidence entityType", creditEv.entityType === "CreditProfile");

const statusEv = buildStatusEvidence({
  entityId: "castillitos:CUSTOMER:CustomerProfile:800123456",
  tenantId: "castillitos",
  derivedStatus: "ACTIVE",
  indicators: { sagActivo: true, crmAccountStatus: "Active" },
  traceId: "test-ev-004",
});
check("10.7 Status evidence field", statusEv.field === "adminStatus");
check("10.8 Status evidence confidence > 0.5", statusEv.confidence > 0.5);

// ── 11. Read Model (FASE 10) ─────────────────────────────────────────────────

console.log("\n--- 11. Read Model ---");

const state = buildCommercialCustomerState({
  profile: fullResult.customer!,
  assignment: assign,
  credit,
  profileQuality: qualityResult,
  freshness: freshnessResult,
  completenessScore: completeFull.completenessScore,
  evidence: [fieldEv, assignEv, creditEv, statusEv],
});

check("11.1 State has customerId", state.customerId.includes("800123456"));
check("11.2 State name", state.name === "VANIDADES MARY");
check("11.3 State salesRepName", state.salesRepName === "Carlos Gomez");
check("11.4 State zone", state.zone?.name === "Costa Este USA");
check("11.5 State channel", state.channel?.name === "Canal Mayorista");
check("11.6 State priceList", state.priceList?.name === "Exportacion USA");
check("11.7 State creditTermDays", state.creditTermDays === 30);
check("11.8 State creditLimit", state.creditLimit === 50000000);
check("11.9 State creditStatus", state.creditStatus === "APPROVED");
check("11.10 State hasCrmLink", state.hasCrmLink === true);
check("11.11 State city", state.city === "Plainfield");
check("11.12 State mobile", state.mobile === "3109876543");
check("11.13 State sources include SAG", state.sources.includes("SAG_PYA"));
check("11.14 State evidence count", state.evidence.length === 4);
check("11.15 State no conflicts", state.conflicts.length === 0);
check("11.16 State adminStatus", state.adminStatus === "ACTIVE");

// State without assignment/credit
const stateMinimal = buildCommercialCustomerState({
  profile: noEmailResult.customer!,
  assignment: null,
  credit: null,
  profileQuality: null,
  freshness: null,
  completenessScore: 0.3,
  evidence: [],
});
check("11.17 Minimal state salesRep null", stateMinimal.salesRepName == null);
check("11.18 Minimal state creditStatus UNKNOWN", stateMinimal.creditStatus === "UNKNOWN");
check("11.19 Minimal state isBlocked false", stateMinimal.isBlocked === false);

// ── 12. Assignment with conflict ─────────────────────────────────────────────

console.log("\n--- 12. Conflict Scenarios ---");

const conflictRaw: CommercialAssignmentRawInput = {
  customerTaxId: "800999888",
  vendedor: "Carlos Gomez",
  nitVendedor: "12345678",
  crmAssignedUserName: "Maria Perez",
  crmAssignedUserId: "crm-user-002",
  zona: "ZONA_DESCONOCIDA",
};

const conflictAssign = normalizeCommercialAssignment(conflictRaw, buildAssignmentCtx(), lookups);
check("12.1 Conflict recorded", conflictAssign.conflicts.length === 1);
check("12.2 CRM wins resolution", conflictAssign.conflicts[0].resolution === "CRM_WINS");
check("12.3 Resolved to CRM rep", conflictAssign.salesRepName === "Maria Perez");
check("12.4 Unknown zone not resolved", conflictAssign.zone?.resolved === false);
check("12.5 Unknown zone code preserved", conflictAssign.zone?.code === "ZONA_DESCONOCIDA");

// ── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("CUSTOMER-SAG-ENRICHMENT-02 TESTS FAILED.\n");
  process.exit(1);
} else {
  console.log("CUSTOMER-SAG-ENRICHMENT-02 TESTS PASSED.\n");
}
