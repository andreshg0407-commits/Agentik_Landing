/**
 * scripts/test-commercial-data-layer-foundation-hotfix.ts
 *
 * Functional tests for COMMERCIAL-DATA-LAYER-FOUNDATION-HOTFIX-01.
 * Executes real behavior: adapter registry, domain registry, quality, normalizers, identifiers, freshness.
 *
 * Usage: npx tsx scripts/test-commercial-data-layer-foundation-hotfix.ts
 */

import { createCommercialAdapterRegistry } from "../lib/comercial/data-layer/adapters/commercial-adapter-registry";
import type { AdapterRegistration } from "../lib/comercial/data-layer/adapters/adapter-registration";
import { createCommercialDomainRegistry } from "../lib/comercial/data-layer/domains/commercial-domain-registry";
import { PRODUCT_DOMAIN, CUSTOMER_DOMAIN, INVENTORY_DOMAIN, SALES_DOMAIN, PURCHASING_IMPORT_DOMAIN, STORE_OPERATIONS_DOMAIN, PRODUCTION_DOMAIN } from "../lib/comercial/data-layer/domains/commercial-domain-descriptors";
import { evaluateCommercialQuality } from "../lib/comercial/data-layer/quality/commercial-quality-evaluator";
import { normalizeReferenceCode, normalizeEmail, normalizePhone, normalizeDecimal, normalizeDate, normalizeBoolean } from "../lib/comercial/data-layer/shared/normalizers";
import { buildCanonicalId, parseCanonicalId, buildExternalReferenceKey, buildNaturalKey, isCanonicalId, compareCanonicalIds } from "../lib/comercial/data-layer/shared/identifiers";
import { evaluateCommercialFreshness } from "../lib/comercial/data-layer/shared/freshness-evaluator";

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) { console.log(`  PASS  ${label}`); passed++; }
  else { console.log(`  FAIL  ${label}`); failed++; }
}

console.log("\n=== FUNCTIONAL TESTS: COMMERCIAL-DATA-LAYER-FOUNDATION-HOTFIX-01 ===\n");

// ── ADAPTER REGISTRY ────────────────────────────────────────────────────────

console.log("--- Adapter Registry ---");

const registry = createCommercialAdapterRegistry();

const adapterA: AdapterRegistration = {
  adapterId: "sag-product-v1",
  tenantId: "castillitos",
  domain: "PRODUCT",
  system: "SAG_PYA",
  version: "1.0.0",
  priority: 1,
  enabled: true,
  capabilities: ["PRODUCT_SYNC", "PRODUCT_DISCOVERY"],
  health: "HEALTHY",
  registeredAt: new Date(),
};

const adapterB: AdapterRegistration = {
  ...adapterA,
  adapterId: "sag-product-v2",
  version: "2.0.0",
  priority: 2,
  capabilities: ["PRODUCT_SYNC", "PRODUCT_DISCOVERY", "PRODUCT_BULK"],
};

const adapterOtherTenant: AdapterRegistration = {
  ...adapterA,
  tenantId: "other-tenant",
};

// Test 1
const r1 = registry.register(adapterA);
assert("1. Register adapter valid", r1.ok === true);

// Test 2
const r2 = registry.resolve({ tenantId: "castillitos", capability: "PRODUCT_SYNC" });
assert("2. Resolve by tenant and capability", r2.ok === true && r2.ok && r2.value.adapterId === "sag-product-v1");

// Test 3
registry.register(adapterB);
const r3 = registry.resolve({ tenantId: "castillitos", capability: "PRODUCT_SYNC", system: "SAG_PYA" });
assert("3. Resolve by system", r3.ok === true && r3.ok && r3.value.adapterId === "sag-product-v1");

// Test 4
const r4 = registry.register(adapterA);
assert("4. Reject duplicate in same tenant", r4.ok === false && !r4.ok && r4.error.code === "ADAPTER_DUPLICATE");

// Test 5
const r5 = registry.register(adapterOtherTenant);
assert("5. Allow same adapterId in different tenant", r5.ok === true);

// Test 6
const r6 = registry.resolve({ tenantId: "other-tenant", capability: "PRODUCT_SYNC" });
assert("6. No leakage between tenants", r6.ok === true && r6.ok && r6.value.tenantId === "other-tenant");

// Test 7
const r7 = registry.resolve({ tenantId: "", capability: "PRODUCT_SYNC" });
assert("7. Reject missing tenant", r7.ok === false && !r7.ok && r7.error.code === "TENANT_REQUIRED");

// Test 8
const r8 = registry.resolve({ tenantId: "castillitos", capability: "NONEXISTENT" });
assert("8. Reject missing capability", r8.ok === false && !r8.ok && r8.error.code === "CAPABILITY_NOT_SUPPORTED");

// Test 9 — priority
assert("9. Priority: lower number wins", r3.ok === true && r3.ok && r3.value.priority === 1);

// Test 10 — unhealthy exclusion
const unhealthyAdapter: AdapterRegistration = {
  adapterId: "unhealthy-adapter",
  tenantId: "castillitos",
  domain: "CUSTOMER",
  system: "SAG_PYA",
  version: "1.0.0",
  priority: 1,
  enabled: true,
  capabilities: ["CUSTOMER_SYNC"],
  health: "UNHEALTHY",
  registeredAt: new Date(),
};
registry.register(unhealthyAdapter);
const r10 = registry.resolve({ tenantId: "castillitos", capability: "CUSTOMER_SYNC", requireHealthy: true });
assert("10. Unhealthy excluded when requireHealthy", r10.ok === false && !r10.ok && r10.error.code === "ADAPTER_UNHEALTHY");

// Test 11 — unregister
const r11a = registry.unregister("sag-product-v2", "castillitos");
assert("11. Unregister removes only target", r11a.ok === true && registry.getById("sag-product-v1", "castillitos") !== null);

// Test 12 — clearTenant
registry.register({ ...adapterA, adapterId: "temp-1", tenantId: "temp-tenant" });
registry.register({ ...adapterA, adapterId: "temp-2", tenantId: "temp-tenant" });
const cleared = registry.clearTenant("temp-tenant");
assert("12. clearTenant doesn't affect other tenants", cleared === 2 && registry.list("castillitos").length > 0);

// ── DOMAIN REGISTRY ─────────────────────────────────────────────────────────

console.log("\n--- Domain Registry ---");

const domainRegistry = createCommercialDomainRegistry();

// Test 13
const d13 = domainRegistry.register(PRODUCT_DOMAIN);
assert("13. Register domain", d13.ok === true);

// Test 14
domainRegistry.register(CUSTOMER_DOMAIN);
domainRegistry.register(INVENTORY_DOMAIN);
domainRegistry.register(SALES_DOMAIN);
domainRegistry.register(PURCHASING_IMPORT_DOMAIN);
domainRegistry.register(STORE_OPERATIONS_DOMAIN);

const resolved = domainRegistry.get("PRODUCT");
assert("14. Resolve domain", resolved !== null && resolved!.id === "PRODUCT");

// Test 15
const ownership = domainRegistry.resolveOwner("ProductProfile");
assert("15. Ownership unique: ProductProfile → PRODUCT", ownership === "PRODUCT");

// Test 16 — reject duplicate entityType
const duplicate: any = { ...PRODUCT_DOMAIN, id: "FAKE_DOMAIN", entityTypes: ["ProductProfile"] };
const d16 = domainRegistry.register(duplicate);
assert("16. Reject duplicate entityType ownership", d16.ok === false);

// Test 17
const active = domainRegistry.listActive();
assert("17. List active returns 6 domains", active.length === 6);

// Test 18
domainRegistry.register(PRODUCTION_DOMAIN);
const active2 = domainRegistry.listActive();
assert("18. Inactive domain not in listActive", active2.length === 6 && domainRegistry.has("PRODUCTION"));

// ── QUALITY EVALUATOR ───────────────────────────────────────────────────────

console.log("\n--- Quality Evaluator ---");

// Test 19 — CONFIRMED
const q19 = evaluateCommercialQuality({
  record: { name: "Zapato", sku: "ZAP-001", price: 150000 },
  requiredFields: ["name", "sku", "price"],
  optionalFields: [],
  source: "SAG",
  evaluatorVersion: "1.0.0",
});
assert("19. CONFIRMED status", q19.status === "CONFIRMED");

// Test 20 — PARTIAL
const q20 = evaluateCommercialQuality({
  record: { name: "Zapato", sku: null, price: 150000 },
  requiredFields: ["name", "sku", "price"],
  optionalFields: ["brand"],
  source: "SAG",
  evaluatorVersion: "1.0.0",
});
assert("20. PARTIAL status", q20.status === "PARTIAL");

// Test 21 — ESTIMATED
const q21 = evaluateCommercialQuality({
  record: { name: "Zapato", sku: "ZAP-001", price: 150000, price_source: "ESTIMATED" },
  requiredFields: ["name", "sku", "price"],
  optionalFields: [],
  source: "SAG",
  evaluatorVersion: "1.0.0",
});
assert("21. ESTIMATED status", q21.status === "ESTIMATED");

// Test 22 — UNAVAILABLE
const q22 = evaluateCommercialQuality({
  record: {},
  requiredFields: ["name", "sku", "price"],
  optionalFields: [],
  source: "SAG",
  evaluatorVersion: "1.0.0",
});
assert("22. UNAVAILABLE status", q22.status === "UNAVAILABLE");

// Test 23 — CONFLICTED
const q23 = evaluateCommercialQuality({
  record: { name: "Zapato", sku: "ZAP-001", price: 150000 },
  requiredFields: ["name", "sku", "price"],
  optionalFields: [],
  source: "SAG",
  conflicts: [{ field: "price", values: [150000, 160000] }],
  evaluatorVersion: "1.0.0",
});
assert("23. CONFLICTED status", q23.status === "CONFLICTED");

// Test 24 — STALE
const now24 = new Date("2026-07-12T12:00:00Z");
const q24 = evaluateCommercialQuality({
  record: { name: "Zapato", sku: "ZAP-001", price: 150000 },
  requiredFields: ["name", "sku", "price"],
  optionalFields: [],
  source: "SAG",
  freshness: { observedAt: new Date("2026-07-11T00:00:00Z"), slaSeconds: 3600, now: now24 },
  evaluatorVersion: "1.0.0",
});
assert("24. STALE status", q24.status === "STALE");

// Test 25 — Field quality
assert("25. Field quality populated", Object.keys(q19.fieldQuality).length === 3);

// Test 26 — Missing fields
assert("26. Missing fields tracked", q20.missingFields.includes("sku"));

// Test 27 — Score 0–1
assert("27. Score between 0 and 1", q19.score >= 0 && q19.score <= 1 && q22.score >= 0 && q22.score <= 1);

// ── NORMALIZERS ─────────────────────────────────────────────────────────────

console.log("\n--- Normalizers ---");

// Test 28
const n28 = normalizeReferenceCode("  ref-001  ");
assert("28. Reference code normalized", n28.ok && n28.value === "REF-001");

// Test 29
const n29 = normalizeEmail("  User@Example.COM  ");
assert("29. Email normalized", n29.ok && n29.value === "user@example.com");

// Test 30
const n30 = normalizePhone("+57 310 555-1234");
assert("30. Phone normalized", n30.ok && n30.value === "+573105551234");

// Test 31
const n31 = normalizeDecimal("1,500.75");
assert("31. Decimal string normalized", n31.ok && n31.value === 1500.75);

// Test 32
const decimalLike = { toString: () => "250.50" };
const n32 = normalizeDecimal(decimalLike);
assert("32. Decimal-like normalized", n32.ok && n32.value === 250.50);

// Test 33
const n33 = normalizeDecimal("not-a-number");
assert("33. Invalid decimal handled", n33.ok === false && n33.errorCode === "INVALID");

// Test 34
const n34 = normalizeDate("2026-07-12T10:30:00Z");
assert("34. Date normalized", n34.ok && n34.value!.startsWith("2026-07-12"));

// Test 35
const n35 = normalizeDate("invalid-date");
assert("35. Invalid date handled", n35.ok === false && n35.errorCode === "INVALID");

// Test 36
const n36a = normalizeBoolean("si");
const n36b = normalizeBoolean(0);
assert("36. Boolean normalized", n36a.ok && n36a.value === true && n36b.ok && n36b.value === false);

// Test 37
const n37 = normalizeReferenceCode(null);
assert("37. Null input returns EMPTY", n37.ok === false && n37.errorCode === "EMPTY");

// ── IDENTIFIERS ─────────────────────────────────────────────────────────────

console.log("\n--- Identifiers ---");

// Test 38
const id38a = buildCanonicalId({ tenantId: "castillitos", domain: "PRODUCT", entityType: "ProductProfile", naturalKey: "REF-001" });
const id38b = buildCanonicalId({ tenantId: "castillitos", domain: "PRODUCT", entityType: "ProductProfile", naturalKey: "REF-001" });
assert("38. ID deterministic", id38a === id38b);

// Test 39
const id39 = buildCanonicalId({ tenantId: "other-tenant", domain: "PRODUCT", entityType: "ProductProfile", naturalKey: "REF-001" });
assert("39. ID different between tenants", id38a !== id39);

// Test 40
const parsed = parseCanonicalId(id38a);
assert("40. Parse correct", parsed !== null && parsed!.tenantId === "castillitos" && parsed!.naturalKey === "REF-001");

// Test 41
const extKey = buildExternalReferenceKey("castillitos", "SAG_PYA", "12345");
assert("41. External reference key", extKey.includes("castillitos") && extKey.includes("SAG_PYA"));

// Test 42
const natKey = buildNaturalKey(["ZAP", "001", "NEGRO"]);
assert("42. Natural key", natKey.length > 0);

// Test 43
assert("43. Comparison works", compareCanonicalIds(id38a, id38b) === true && compareCanonicalIds(id38a, id39) === false);

// Test 44 — special characters
const idSpecial = buildCanonicalId({ tenantId: "castillitos", domain: "PRODUCT", entityType: "ProductProfile", naturalKey: "REF:001/A" });
const parsedSpecial = parseCanonicalId(idSpecial);
assert("44. Special characters encoded correctly", parsedSpecial !== null && parsedSpecial!.naturalKey === "REF:001/A");

// Verify isCanonicalId
assert("44b. isCanonicalId validation", isCanonicalId(id38a) === true && isCanonicalId("invalid") === false);

// ── FRESHNESS ───────────────────────────────────────────────────────────────

console.log("\n--- Freshness ---");

const now = new Date("2026-07-12T12:00:00Z");

// Test 45 — fresh
const f45 = evaluateCommercialFreshness({
  observedAt: new Date("2026-07-12T11:55:00Z"),
  sourceUpdatedAt: new Date("2026-07-12T11:55:00Z"),
  now,
  slaSeconds: 900,
  syncMode: "INCREMENTAL",
});
assert("45. Fresh status", f45.status === "FRESH" && !f45.isStale);

// Test 46 — stale
const f46 = evaluateCommercialFreshness({
  observedAt: new Date("2026-07-12T10:00:00Z"),
  sourceUpdatedAt: new Date("2026-07-12T10:00:00Z"),
  now,
  slaSeconds: 900,
  syncMode: "FULL",
});
assert("46. Stale status", f46.status === "STALE" && f46.isStale);

// Test 47 — no sourceUpdatedAt
const f47 = evaluateCommercialFreshness({
  observedAt: new Date("2026-07-12T11:58:00Z"),
  sourceUpdatedAt: null,
  now,
  slaSeconds: 900,
  syncMode: "FULL",
});
assert("47. Falls back to observedAt", f47.status === "FRESH");

// Test 48 — injectable now
const customNow = new Date("2026-07-12T13:00:00Z");
const f48 = evaluateCommercialFreshness({
  observedAt: new Date("2026-07-12T11:55:00Z"),
  sourceUpdatedAt: new Date("2026-07-12T11:55:00Z"),
  now: customNow,
  slaSeconds: 900,
  syncMode: "FULL",
});
assert("48. Injectable now produces different result", f48.isStale === true);

// ── SUMMARY ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("FUNCTIONAL TESTS FAILED.\n");
  process.exit(1);
} else {
  console.log("ALL FUNCTIONAL TESTS PASSED.\n");
}
