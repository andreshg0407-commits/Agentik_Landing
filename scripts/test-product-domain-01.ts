/**
 * scripts/test-product-domain-01.ts
 *
 * Functional tests for PRODUCT-DOMAIN-01.
 * Exercises normalization, quality, adapter, registration, and commercial filter.
 *
 * Usage: npx tsx scripts/test-product-domain-01.ts
 */

import {
  normalizeProductRaw,
  evaluateProductQuality,
  evaluateProductFreshness,
  isCommercialProduct,
  createSagProductAdapter,
  registerProductAdapter,
  deriveCommercialStatus,
  SAG_PRODUCT_ADAPTER_ID,
} from "../lib/comercial/data-layer/domains/product";
import type { ProductRawInput, ProductNormalizationContext } from "../lib/comercial/data-layer/domains/product";
import { createCommercialAdapterRegistry } from "../lib/comercial/data-layer/adapters/commercial-adapter-registry";
import { createCommercialDomainRegistry } from "../lib/comercial/data-layer/domains/commercial-domain-registry";
import { PRODUCT_DOMAIN } from "../lib/comercial/data-layer/domains/commercial-domain-descriptors";

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean): void {
  if (condition) { console.log(`  PASS  ${label}`); passed++; }
  else { console.log(`  FAIL  ${label}`); failed++; }
}

console.log("\n=== FUNCTIONAL TESTS: PRODUCT-DOMAIN-01 ===\n");

// ── Test Data ───────────────────────────────────────────────────────────────

const validRaw: ProductRawInput = {
  codigo: "ZAP-001",
  descripcion: "Zapato Formal Negro",
  descripcion2: "Cuero italiano",
  grupo: "01",
  subGrupo: "001",
  linea: "FORMAL",
  marca: "MARCA-X",
  unidad: "PAR",
  iva: true,
  tarifaIva: 19,
  precio: 250000,
  costo: 120000,
  manejaKardex: true,
  manejaTallaColor: true,
  manejaLote: false,
  activo: true,
  bloqueado: false,
  fechaModificacion: "2026-07-10T08:00:00Z",
  grupoNombre: "Calzado",
  subGrupoNombre: "Formal",
  lineaNombre: "Linea Formal",
};

const ctx: ProductNormalizationContext = {
  tenantId: "castillitos",
  sourceSystem: "SAG_PYA",
  instanceId: "castillitos",
  adapterId: "sag-product-adapter",
  adapterVersion: "1.0.0",
  correlationId: "test-correlation-001",
  extractedAt: new Date("2026-07-12T06:00:00Z"),
};

// ── NORMALIZATION ───────────────────────────────────────────────────────────

console.log("--- Normalization ---");

// Test 1 — Valid product normalizes correctly
const r1 = normalizeProductRaw(validRaw, ctx);
assert("1. Valid product normalizes", r1.profile !== null && !r1.skipped);
assert("1b. Reference code is uppercase trimmed", r1.profile!.referenceCode === "ZAP-001");
assert("1c. Name is preserved", r1.profile!.name === "Zapato Formal Negro");
assert("1d. Secondary name present", r1.profile!.secondaryName === "Cuero italiano");

// Test 2 — Classification extracted
assert("2. Group ID extracted", r1.profile!.classification.groupId === "01");
assert("2b. Group name resolved", r1.profile!.classification.groupName === "Calzado");
assert("2c. Brand extracted", r1.profile!.classification.brand === "MARCA-X");
assert("2d. Unit extracted", r1.profile!.classification.unit === "PAR");

// Test 3 — Pricing extracted
assert("3. Sale price", r1.profile!.pricing.salePrice === 250000);
assert("3b. Cost", r1.profile!.pricing.cost === 120000);
assert("3c. IVA tariff", r1.profile!.pricing.ivaTariff === 19);
assert("3d. Currency is COP", r1.profile!.pricing.currency === "COP");

// Test 4 — Operational flags
assert("4. Manages inventory", r1.profile!.operational.managesInventory === true);
assert("4b. Manages variants", r1.profile!.operational.managesVariants === true);
assert("4c. Active", r1.profile!.operational.active === true);
assert("4d. Not blocked", r1.profile!.operational.blocked === false);
assert("4e. hasVariants flag", r1.profile!.hasVariants === true);

// Test 5 — Commercial status
assert("5. Commercial status ACTIVE", r1.profile!.commercialStatus === "ACTIVE");

// Test 6 — Identity is tenant-scoped
assert("6. Identity includes tenantId", r1.profile!.identity.tenantId === "castillitos");
assert("6b. Identity domain is PRODUCT", r1.profile!.identity.domain === "PRODUCT");
assert("6c. Canonical ID contains tenant", r1.profile!.identity.canonicalId.includes("castillitos"));

// Test 7 — Missing code skips
const noCode: ProductRawInput = { ...validRaw, codigo: null };
const r7 = normalizeProductRaw(noCode, ctx);
assert("7. Missing code → skipped", r7.skipped === true && r7.profile === null);

// Test 8 — Missing name skips
const noName: ProductRawInput = { ...validRaw, descripcion: "" };
const r8 = normalizeProductRaw(noName, ctx);
assert("8. Empty name → skipped", r8.skipped === true);

// Test 9 — SAG boolean strings
const sagBooleans: ProductRawInput = {
  ...validRaw,
  manejaKardex: "si",
  manejaTallaColor: "no",
  activo: 1,
  bloqueado: 0,
  iva: "true",
};
const r9 = normalizeProductRaw(sagBooleans, ctx);
assert("9. SAG boolean strings normalized", r9.profile !== null);
assert("9b. 'si' → true", r9.profile!.operational.managesInventory === true);
assert("9c. 'no' → false", r9.profile!.operational.managesVariants === false);
assert("9d. 1 → true", r9.profile!.operational.active === true);

// Test 10 — Decimal-like pricing (Prisma Decimal objects)
const decimalPricing: ProductRawInput = {
  ...validRaw,
  precio: { toString: () => "350000.50" } as any,
  costo: "180,000",
};
const r10 = normalizeProductRaw(decimalPricing, ctx);
assert("10. Decimal-like price normalized", r10.profile!.pricing.salePrice === 350000.50);
assert("10b. String cost with comma normalized", r10.profile!.pricing.cost === 180000);

// Test 11 — Different tenant produces different canonical ID
const otherCtx = { ...ctx, tenantId: "other-company" };
const r11 = normalizeProductRaw(validRaw, otherCtx);
assert("11. Different tenant → different canonical ID", r11.profile!.identity.canonicalId !== r1.profile!.identity.canonicalId);

// ── QUALITY ─────────────────────────────────────────────────────────────────

console.log("\n--- Quality ---");

// Test 12 — Fresh valid product → CONFIRMED
const q12 = evaluateProductQuality(r1.profile!, { now: new Date("2026-07-12T08:00:00Z") });
assert("12. Fresh valid product → CONFIRMED", q12.status === "CONFIRMED");
assert("12b. Score > 0.8", q12.score > 0.8);

// Test 13 — Stale product → STALE
const q13 = evaluateProductQuality(r1.profile!, { now: new Date("2026-07-14T12:00:00Z") });
assert("13. Stale product → STALE", q13.status === "STALE");

// Test 14 — Freshness evaluation (sourceModifiedAt is 2026-07-10, so 2h after sync is still fresh by lastSyncAt)
const f14 = evaluateProductFreshness(r1.profile!, { now: new Date("2026-07-12T08:00:00Z") });
// sourceModifiedAt (2026-07-10T08:00:00Z) is used as reference → 48h old → stale for 24h SLA
// This is correct: the DATA is 48h old even though the sync was 2h ago
assert("14. Freshness reflects source age (STALE when source is old)", f14.isStale === true);

const f14b = evaluateProductFreshness(r1.profile!, { now: new Date("2026-07-14T12:00:00Z") });
assert("14b. Freshness is STALE after 48h", f14b.isStale === true);

// ── COMMERCIAL FILTER ───────────────────────────────────────────────────────

console.log("\n--- Commercial Filter ---");

// Test 15 — Valid commercial product
const c15 = isCommercialProduct(r1.profile!);
assert("15. Active product with price → commercial", c15.isCommercial === true);

// Test 16 — Inactive not commercial
const inactiveRaw: ProductRawInput = { ...validRaw, activo: false };
const r16 = normalizeProductRaw(inactiveRaw, ctx);
const c16 = isCommercialProduct(r16.profile!);
assert("16. Inactive → not commercial", c16.isCommercial === false && c16.reasons.includes("Product is inactive"));

// Test 17 — Blocked not commercial
const blockedRaw: ProductRawInput = { ...validRaw, bloqueado: true };
const r17 = normalizeProductRaw(blockedRaw, ctx);
const c17 = isCommercialProduct(r17.profile!);
assert("17. Blocked → not commercial", c17.isCommercial === false);

// Test 18 — No price not commercial
const noPriceRaw: ProductRawInput = { ...validRaw, precio: 0 };
const r18 = normalizeProductRaw(noPriceRaw, ctx);
const c18 = isCommercialProduct(r18.profile!);
assert("18. Zero price → not commercial", c18.isCommercial === false);

// Test 19 — No kardex not commercial
const noKardexRaw: ProductRawInput = { ...validRaw, manejaKardex: false };
const r19 = normalizeProductRaw(noKardexRaw, ctx);
const c19 = isCommercialProduct(r19.profile!);
assert("19. No kardex → not commercial", c19.isCommercial === false);

// ── COMMERCIAL STATUS ───────────────────────────────────────────────────────

console.log("\n--- Commercial Status ---");

assert("20. Active → ACTIVE", deriveCommercialStatus({ managesInventory: true, managesVariants: true, managesLot: false, active: true, blocked: false }) === "ACTIVE");
assert("21. Blocked → BLOCKED", deriveCommercialStatus({ managesInventory: true, managesVariants: true, managesLot: false, active: true, blocked: true }) === "BLOCKED");
assert("22. Inactive → INACTIVE", deriveCommercialStatus({ managesInventory: true, managesVariants: false, managesLot: false, active: false, blocked: false }) === "INACTIVE");

// ── ADAPTER ─────────────────────────────────────────────────────────────────

(async () => {
console.log("\n--- Adapter ---");

// Test 23 — Adapter normalizes correctly
const adapter = createSagProductAdapter({
  fetchArticles: async () => [validRaw, noCode],
  countArticles: async () => 2,
  checkHealth: async () => ({ reachable: true, latencyMs: 150 }),
});

assert("23. Adapter ID", adapter.id === SAG_PRODUCT_ADAPTER_ID);
assert("23b. Adapter domain", adapter.domain === "PRODUCT");

// Test 24 — Discovery
const discovery = await adapter.discover({ tenantId: "castillitos", domain: "PRODUCT", sourceSystem: "SAG_PYA", mode: "FULL", correlationId: "test-001", startedAt: new Date(), lastSyncAt: null });
assert("24. Discovery returns count", discovery.totalRecords === 2);

// Test 25 — Validation
const validation = await adapter.validate({ tenantId: "castillitos", domain: "PRODUCT", sourceSystem: "SAG_PYA", mode: "FULL", correlationId: "test-002", startedAt: new Date(), lastSyncAt: null });
assert("25. Validation passes", validation.valid === true);

// Test 26 — Normalization
const normResult = await adapter.normalize(validRaw, { tenantId: "castillitos", domain: "PRODUCT", sourceSystem: "SAG_PYA", mode: "FULL", correlationId: "test-003", startedAt: new Date(), lastSyncAt: null });
assert("26. Normalization produces profile", normResult.normalized !== null);
assert("26b. Quality assessment attached", normResult.quality.level !== "REJECTED");

// Test 27 — Synchronize
const syncResult = await adapter.synchronize({ tenantId: "castillitos", domain: "PRODUCT", sourceSystem: "SAG_PYA", mode: "FULL", correlationId: "test-004", startedAt: new Date(), lastSyncAt: null });
assert("27. Sync completes", syncResult.status === "PARTIAL");
assert("27b. Stats: 1 persisted + 1 rejected", syncResult.stats.persisted === 1 && syncResult.stats.rejected === 1);

// Test 28 — Health
const health = await adapter.health();
assert("28. Health is HEALTHY", health.status === "HEALTHY");
assert("28b. Latency reported", health.latencyMs === 150);

// Test 29 — Capabilities
const caps = adapter.capabilities();
assert("29. Supports discovery", caps.supportsDiscovery === true);
assert("29b. No webhook support", caps.supportsWebhook === false);

// ── REGISTRATION ────────────────────────────────────────────────────────────

console.log("\n--- Registration ---");

// Test 30 — Register in adapter registry
const adapterRegistry = createCommercialAdapterRegistry();
const reg30 = registerProductAdapter(adapterRegistry, "castillitos");
assert("30. Registration succeeds", reg30.ok === true);

// Test 31 — Can resolve by capability
const resolved = adapterRegistry.resolve({ tenantId: "castillitos", capability: "PRODUCT_SYNC" });
assert("31. Resolves by PRODUCT_SYNC", resolved.ok === true && resolved.ok && resolved.value.adapterId === SAG_PRODUCT_ADAPTER_ID);

// Test 32 — Can resolve by PRODUCT_DISCOVERY
const resolved2 = adapterRegistry.resolve({ tenantId: "castillitos", capability: "PRODUCT_DISCOVERY" });
assert("32. Resolves by PRODUCT_DISCOVERY", resolved2.ok === true);

// Test 33 — Domain registry recognizes ProductProfile
const domainRegistry = createCommercialDomainRegistry();
domainRegistry.register(PRODUCT_DOMAIN);
const owner = domainRegistry.resolveOwner("ProductProfile");
assert("33. ProductProfile → PRODUCT domain", owner === "PRODUCT");

// Test 34 — ProductVariant ownership
const variantOwner = domainRegistry.resolveOwner("ProductVariant");
assert("34. ProductVariant → PRODUCT domain", variantOwner === "PRODUCT");

// Test 35 — Different tenant isolation
const reg35 = registerProductAdapter(adapterRegistry, "other-company");
assert("35. Same adapter for different tenant", reg35.ok === true);
const resolvedOther = adapterRegistry.resolve({ tenantId: "other-company", capability: "PRODUCT_SYNC" });
assert("35b. Other tenant resolves independently", resolvedOther.ok === true && resolvedOther.ok && resolvedOther.value.tenantId === "other-company");

// ── SUMMARY ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} PASS / ${failed} FAIL / ${passed + failed} total ===\n`);

if (failed > 0) {
  console.log("PRODUCT-DOMAIN-01 TESTS FAILED.\n");
  process.exit(1);
} else {
  console.log("ALL PRODUCT-DOMAIN-01 TESTS PASSED.\n");
}
})();
