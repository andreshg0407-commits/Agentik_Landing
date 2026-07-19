/**
 * scripts/test-customer-domain-01.ts
 *
 * Functional tests for CUSTOMER-DOMAIN-01.
 * Verifies normalization, quality evaluation, adapter behavior,
 * entity derivation, and cross-domain evidence.
 *
 * Usage: npx tsx scripts/test-customer-domain-01.ts
 */

let passed = 0;
let failed = 0;

function assert(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

console.log("\n=== CUSTOMER-DOMAIN-01 Functional Tests ===\n");

// ── 1. Customer Normalizer ──────────────────────────────────────────────────

import { normalizeCustomerRaw } from "../lib/comercial/data-layer/domains/customer/customer-normalizer";
import type { CustomerRawInput, CustomerNormalizationContext } from "../lib/comercial/data-layer/domains/customer/customer-normalizer";

console.log("--- 1. Normalizer ---");

const baseCtx: CustomerNormalizationContext = {
  tenantId: "castillitos",
  sourceSystem: "SAG_PYA",
  instanceId: "castillitos",
  adapterId: "sag-customer-adapter",
  adapterVersion: "1.0.0",
  correlationId: "test-001",
  extractedAt: new Date(),
};

// 1.1 Valid minimal customer
const validRaw: CustomerRawInput = {
  idCliente: "C001",
  nit: "900123456-1",
  razonSocial: "Distribuidora ABC S.A.S.",
  segmento: "A",
  plazoCredito: 30,
};
const r1 = normalizeCustomerRaw(validRaw, baseCtx);
assert("1.1 Valid minimal customer normalizes", !r1.skipped && r1.customer !== null);
assert("1.1 taxId is normalized", r1.customer?.taxId === "900123456-1");
assert("1.1 name is trimmed", r1.customer?.name === "Distribuidora ABC S.A.S.");
assert("1.1 creditTermDays is 30", r1.customer?.creditTermDays === 30);
assert("1.1 segment code is A", r1.customer?.segment.code === "A");
assert("1.1 schemaVersion is 1", r1.customer?.schemaVersion === 1);
assert("1.1 domain is CUSTOMER", r1.customer?.identity.domain === "CUSTOMER");
assert("1.1 tenantId is castillitos", r1.customer?.identity.tenantId === "castillitos");

// 1.2 Missing NIT skips
const noNitRaw: CustomerRawInput = {
  idCliente: "C002",
  nit: null,
  razonSocial: "Sin NIT",
  segmento: "B",
  plazoCredito: 0,
};
const r2 = normalizeCustomerRaw(noNitRaw, baseCtx);
assert("1.2 Missing NIT is skipped", r2.skipped === true);
assert("1.2 skipReason mentions NIT", r2.skipReason?.includes("NIT") === true);

// 1.3 Missing name skips
const noNameRaw: CustomerRawInput = {
  idCliente: "C003",
  nit: "900999999",
  razonSocial: "",
  segmento: "C",
  plazoCredito: 15,
};
const r3 = normalizeCustomerRaw(noNameRaw, baseCtx);
assert("1.3 Missing name is skipped", r3.skipped === true);
assert("1.3 skipReason mentions name", r3.skipReason?.includes("razonSocial") === true);

// 1.4 Full customer with all optional fields
const fullRaw: CustomerRawInput = {
  idCliente: "C004",
  nit: "800111222-3",
  razonSocial: "Almacenes XYZ Ltda",
  segmento: "AA",
  plazoCredito: 60,
  nombreComercial: "Almacenes XYZ",
  segmentoNombre: "Premium",
  tipoDocumento: "NIT",
  telefono: "+57 310 555 1234",
  telefono2: "601 7771234",
  email: "ventas@xyz.com.co",
  contacto: "Juan Perez",
  direccion: "Cra 15 #45-67",
  ciudad: "Bogota",
  codigoCiudad: "11001",
  departamento: "Cundinamarca",
  codigoDepartamento: "11",
  pais: "CO",
  codigoPostal: "110111",
  zona: "NORTE",
  regimen: "Responsable IVA",
  responsabilidades: "O-48,O-49",
  agenteRetencion: true,
  autoretenedor: false,
  tipoTercero: "CLIENTE",
  crmId: "crm-acc-001",
  activo: true,
  cuentaClave: true,
  fechaModificacion: "2026-07-01",
};
const r4 = normalizeCustomerRaw(fullRaw, baseCtx);
assert("1.4 Full customer normalizes", !r4.skipped && r4.customer !== null);
assert("1.4 tradeName set", r4.customer?.tradeName === "Almacenes XYZ");
assert("1.4 taxIdType is NIT", r4.customer?.taxIdType === "NIT");
assert("1.4 phone normalized", r4.customer?.contact.primaryPhone === "+573105551234");
assert("1.4 email lowercase", r4.customer?.contact.email === "ventas@xyz.com.co");
assert("1.4 city set", r4.customer?.location.city === "Bogota");
assert("1.4 zone set", r4.customer?.location.zone === "NORTE");
assert("1.4 regime set", r4.customer?.fiscal.regime === "Responsable IVA");
assert("1.4 responsibilities parsed", r4.customer?.fiscal.responsibilities.length === 2);
assert("1.4 withholding agent true", r4.customer?.fiscal.isWithholdingAgent === true);
assert("1.4 self withholding false", r4.customer?.fiscal.isSelfWithholding === false);
assert("1.4 thirdPartyType is CUSTOMER", r4.customer?.thirdPartyType === "CUSTOMER");
assert("1.4 crmId set", r4.customer?.crmId === "crm-acc-001");
assert("1.4 isKeyAccount true", r4.customer?.segment.isKeyAccount === true);
assert("1.4 creditTermDays is 60", r4.customer?.creditTermDays === 60);
assert("1.4 country is CO", r4.customer?.location.country === "CO");

// 1.5 Negative credit term clamped to 0
const negCreditRaw: CustomerRawInput = {
  idCliente: "C005",
  nit: "123456789",
  razonSocial: "Negative Credit",
  segmento: "D",
  plazoCredito: -5,
};
const r5 = normalizeCustomerRaw(negCreditRaw, baseCtx);
assert("1.5 Negative credit clamped to 0", r5.customer?.creditTermDays === 0);

// 1.6 Default country is CO
const noCountryRaw: CustomerRawInput = {
  idCliente: "C006",
  nit: "999888777",
  razonSocial: "No Country Set",
  segmento: "E",
  plazoCredito: 0,
};
const r6 = normalizeCustomerRaw(noCountryRaw, baseCtx);
assert("1.6 Default country is CO", r6.customer?.location.country === "CO");

// 1.7 Tax ID type heuristic
const ccRaw: CustomerRawInput = {
  idCliente: "C007",
  nit: "1234567890",
  razonSocial: "CC Person",
  segmento: "F",
  plazoCredito: 0,
  tipoDocumento: "CC",
};
const r7 = normalizeCustomerRaw(ccRaw, baseCtx);
assert("1.7 tipoDocumento CC resolved", r7.customer?.taxIdType === "CC");

// 1.8 Tax ID type heuristic from NIT format
const nitHeuristicRaw: CustomerRawInput = {
  idCliente: "C008",
  nit: "900123456-7",
  razonSocial: "NIT Heuristic",
  segmento: "G",
  plazoCredito: 0,
};
const r8 = normalizeCustomerRaw(nitHeuristicRaw, baseCtx);
assert("1.8 NIT heuristic from format", r8.customer?.taxIdType === "NIT");

// 1.9 Invalid email produces warning
const badEmailRaw: CustomerRawInput = {
  idCliente: "C009",
  nit: "111222333",
  razonSocial: "Bad Email",
  segmento: "H",
  plazoCredito: 0,
  email: "not-an-email",
};
const r9 = normalizeCustomerRaw(badEmailRaw, baseCtx);
assert("1.9 Invalid email warning", r9.warnings.length > 0);
assert("1.9 email is null", r9.customer?.contact.email === null);

// 1.10 Vendor type
const vendorRaw: CustomerRawInput = {
  idCliente: "V001",
  nit: "555666777",
  razonSocial: "Proveedor Test",
  segmento: "P",
  plazoCredito: 0,
  tipoTercero: "PROVEEDOR",
};
const r10 = normalizeCustomerRaw(vendorRaw, baseCtx);
assert("1.10 Vendor type resolved", r10.customer?.thirdPartyType === "VENDOR");

// 1.11 Canonical ID format
assert("1.11 Canonical ID has CUSTOMER domain",
  r1.customer?.identity.canonicalId.includes(":CUSTOMER:CustomerProfile:") === true);

// 1.12 External ref uses TERCEROS resource
assert("1.12 External ref resource is TERCEROS", r1.customer?.externalRef.resource === "TERCEROS");

// ── 2. Entity Derivation ────────────────────────────────────────────────────

console.log("\n--- 2. Entity Derivation ---");

import { deriveAgingBracket, deriveCustomerOperationalStatus } from "../lib/comercial/data-layer/domains/customer/customer-entities";

assert("2.1 null → UNKNOWN", deriveAgingBracket(null) === "UNKNOWN");
assert("2.2 0 → CURRENT", deriveAgingBracket(0) === "CURRENT");
assert("2.3 -5 → CURRENT", deriveAgingBracket(-5) === "CURRENT");
assert("2.4 15 → PAST_DUE_1_30", deriveAgingBracket(15) === "PAST_DUE_1_30");
assert("2.5 30 → PAST_DUE_1_30", deriveAgingBracket(30) === "PAST_DUE_1_30");
assert("2.6 45 → PAST_DUE_31_60", deriveAgingBracket(45) === "PAST_DUE_31_60");
assert("2.7 75 → PAST_DUE_61_90", deriveAgingBracket(75) === "PAST_DUE_61_90");
assert("2.8 120 → PAST_DUE_91_PLUS", deriveAgingBracket(120) === "PAST_DUE_91_PLUS");

assert("2.9 null lastSync → NEVER_SYNCED", deriveCustomerOperationalStatus(null, false) === "NEVER_SYNCED");
assert("2.10 synced no error → SYNCED", deriveCustomerOperationalStatus(new Date(), false) === "SYNCED");
assert("2.11 synced with error → SYNC_ERROR", deriveCustomerOperationalStatus(new Date(), true) === "SYNC_ERROR");

// ── 3. Quality Evaluation ───────────────────────────────────────────────────

console.log("\n--- 3. Quality Evaluation ---");

import { evaluateCustomerQuality, evaluateCustomerFreshness, assessCustomerCompleteness } from "../lib/comercial/data-layer/domains/customer/customer-quality-rules";

const qualityResult = evaluateCustomerQuality(r4.customer!);
assert("3.1 Full customer quality is CONFIRMED or PARTIAL", ["CONFIRMED", "PARTIAL"].includes(qualityResult.status));
assert("3.2 Score > 0", qualityResult.score > 0);
assert("3.3 Completeness > 0", qualityResult.completeness > 0);

const minimalQuality = evaluateCustomerQuality(r1.customer!);
assert("3.4 Minimal customer still evaluates", minimalQuality.score > 0);

// 3.5 Freshness (use r1 which has no sourceModifiedAt — falls back to lastSyncAt which is recent)
const freshResult = evaluateCustomerFreshness(r1.customer!, { now: new Date() });
assert("3.5 Freshness is FRESH", freshResult.status === "FRESH");

const staleResult = evaluateCustomerFreshness(r4.customer!, { now: new Date(Date.now() + 100_000_000) });
assert("3.6 Old data is STALE", staleResult.status === "STALE");
assert("3.7 Stale isStale flag", staleResult.isStale === true);

// 3.8 Completeness assessment
const fullCompleteness = assessCustomerCompleteness(r4.customer!);
assert("3.8 Full customer has contact", fullCompleteness.hasContact === true);
assert("3.9 Full customer has location", fullCompleteness.hasLocation === true);
assert("3.10 Full customer has fiscal", fullCompleteness.hasFiscal === true);
assert("3.11 Full customer has CRM link", fullCompleteness.hasCrmLink === true);
// CUSTOMER-SAG-ENRICHMENT-02 changed weighting: profile-only score < 1.0 (commercial + credit dimensions absent)
assert("3.12 Full customer completeness > 0.5", fullCompleteness.completenessScore > 0.5);

const minimalCompleteness = assessCustomerCompleteness(r1.customer!);
assert("3.13 Minimal customer missing fields > 0", minimalCompleteness.missingFields.length > 0);
assert("3.14 Minimal customer completeness < 1.0", minimalCompleteness.completenessScore < 1.0);

// ── 4. Adapter ──────────────────────────────────────────────────────────────

console.log("\n--- 4. Adapter ---");

import { createSagCustomerAdapter, SAG_CUSTOMER_ADAPTER_ID, SAG_CUSTOMER_ADAPTER_VERSION } from "../lib/comercial/data-layer/domains/customer/customer-adapter";

assert("4.1 Adapter ID", SAG_CUSTOMER_ADAPTER_ID === "sag-customer-adapter");
assert("4.2 Adapter version", SAG_CUSTOMER_ADAPTER_VERSION === "1.0.0");

const adapter = createSagCustomerAdapter({
  fetchCustomers: async () => [validRaw, fullRaw, noNitRaw],
  countCustomers: async () => 3,
  checkHealth: async () => ({ reachable: true, latencyMs: 50 }),
});

assert("4.3 Adapter domain is CUSTOMER", adapter.domain === "CUSTOMER");

const capabilities = adapter.capabilities();
assert("4.4 supportsIncremental false", capabilities.supportsIncremental === false);
assert("4.5 supportsDiscovery true", capabilities.supportsDiscovery === true);
assert("4.6 supportsBulk true", capabilities.supportsBulk === true);

// Helper to build full SynchronizationContext
function buildSyncCtx(correlationId: string) {
  return {
    tenantId: "castillitos",
    domain: "CUSTOMER" as const,
    sourceSystem: "SAG_PYA" as const,
    mode: "FULL" as const,
    correlationId,
    startedAt: new Date(),
    lastSyncAt: null,
  };
}

// 4.7-4.10 Async operations
(async () => {
  const discovery = await adapter.discover(buildSyncCtx("disc-001"));
  assert("4.7 Discovery totalRecords = 3", discovery.totalRecords === 3);

  const validation = await adapter.validate(buildSyncCtx("val-001"));
  assert("4.8 Validation is valid", validation.valid === true);

  const health = await adapter.health();
  assert("4.9 Health is HEALTHY", health.status === "HEALTHY");

  const syncResult = await adapter.synchronize(buildSyncCtx("sync-001"));
  assert("4.10 Sync status is PARTIAL (1 rejected)", syncResult.status === "PARTIAL");
  assert("4.11 Sync 2 persisted", syncResult.stats.persisted === 2);
  assert("4.12 Sync 1 rejected", syncResult.stats.rejected === 1);
  assert("4.13 Sync 3 discovered", syncResult.stats.discovered === 3);

  // 4.14 Normalize single
  const normResult = await adapter.normalize(validRaw, buildSyncCtx("norm-001"));
  assert("4.14 Normalize returns customer", normResult.normalized !== null);
  assert("4.15 Normalize quality not REJECTED", normResult.quality.level !== "REJECTED");

  // ── 5. Registration ─────────────────────────────────────────────────────

  console.log("\n--- 5. Registration ---");

  import("../lib/comercial/data-layer/adapters").then(({ createCommercialAdapterRegistry }) => {
    import("../lib/comercial/data-layer/domains/customer/customer-registration").then(({ registerCustomerAdapter }) => {
      const registry = createCommercialAdapterRegistry();
      const regResult = registerCustomerAdapter(registry, "castillitos");
      assert("5.1 Registration OK", regResult.ok === true);

      // 5.2 Duplicate registration fails
      const dup = registerCustomerAdapter(registry, "castillitos");
      assert("5.2 Duplicate registration fails", dup.ok === false);

      // ── 6. Cross-domain Evidence ────────────────────────────────────────

      console.log("\n--- 6. Cross-domain Evidence ---");

      import("../lib/comercial/data-layer/shared/domain-evidence").then(({ buildEvidenceFromCustomer }) => {
        const evidence = buildEvidenceFromCustomer({
          entityId: r4.customer!.identity.canonicalId,
          tenantId: "castillitos",
          field: "taxId",
          rawValue: "800111222-3",
          canonicalValue: "800111222-3",
          confidence: 0.95,
          traceId: "test-trace-001",
          note: "Tax ID from SAG TERCEROS",
        });
        assert("6.1 Evidence domain is CUSTOMER", evidence.domain === "CUSTOMER");
        assert("6.2 Evidence entityType is CustomerProfile", evidence.entityType === "CustomerProfile");
        assert("6.3 Evidence confidence 0.95", evidence.confidence === 0.95);
        assert("6.4 Evidence resolution CONFIRMED", evidence.resolution === "CONFIRMED");
        assert("6.5 Evidence traceId set", evidence.traceId === "test-trace-001");

        // ── Summary ──────────────────────────────────────────────────────

        console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

        if (failed > 0) {
          console.log("CUSTOMER-DOMAIN-01 TESTS FAILED.\n");
          process.exit(1);
        } else {
          console.log("CUSTOMER-DOMAIN-01 TESTS PASSED.\n");
        }
      });
    });
  });
})();
