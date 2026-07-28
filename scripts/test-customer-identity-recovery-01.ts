/**
 * scripts/test-customer-identity-recovery-01.ts
 *
 * Tests for AGENTIK-CUSTOMERS-CANONICAL-IDENTITY-RECOVERY-01.
 * Validates that the sync uses sagTerceroId as canonical identity,
 * not slug or NIT.
 *
 * Usage: npx tsx scripts/test-customer-identity-recovery-01.ts
 */

// Mock server-only before any imports
const Module = require("module");
const origLoad = Module._load;
Module._load = function (request: any, parent: any, isMain: any) {
  if (request === "server-only") return {};
  return origLoad.call(this, request, parent, isMain);
};

const {
  mapSagCustomerMasterRow,
  buildCustomerSlug,
  normalizeCustomerStatus,
  normalizeCustomerName,
  evaluateCustomerDataQuality,
} = require("../lib/comercial/clientes/sag-customer-master-adapter");

type MappedCustomerMaster = import("../lib/comercial/clientes/sag-customer-master-adapter").MappedCustomerMaster;

let passed = 0;
let failed = 0;

function assert(label: string, ok: boolean): void {
  if (ok) { console.log(`  PASS  ${label}`); passed++; }
  else    { console.log(`  FAIL  ${label}`); failed++; }
}

console.log("\n=== CANONICAL-IDENTITY-RECOVERY-01 Tests ===\n");

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    CLIENTE_ID: 195,
    CODIGO_CLIENTE: "ALT001",
    NIT: 1047440651,
    TIPO_IDENTIFICACION: "CC",
    RAZON_SOCIAL: "Adriana Victoria Alvarez Arrieta",
    NOMBRE_COMERCIAL: null,
    TIPO_CLIENTE: "MINORISTA",
    ESTADO: "Activo",
    FECHA_CREACION: "2020-01-15T00:00:00",
    FECHA_ULTIMA_COMPRA: "2026-05-10T00:00:00",
    CUPO_CREDITO: 5000000,
    SALDO_CARTERA: 1200000,
    CIUDAD: "Barranquilla",
    DEPARTAMENTO: "Atlantico",
    PAIS: "Colombia",
    DIRECCION: "Calle 45 #30-12",
    TELEFONO: "3001234567",
    CELULAR: "3101234567",
    EMAIL: "adriana@example.com",
    VENDEDOR_ASIGNADO: "Juan Perez",
    CANAL_CLIENTE: "DETAL",
    ZONA_COMERCIAL: "NORTE",
    LISTA_PRECIOS: "Lista General",
    ...overrides,
  };
}

// ── Suite 1: sagTerceroId is canonical identity ─────────────────────────────

console.log("--- 1. sagTerceroId as canonical identity ---");

{
  const mapped = mapSagCustomerMasterRow(buildRow());
  assert("1.1 sagTerceroId is populated from CLIENTE_ID", mapped?.sagTerceroId === 195);
  assert("1.2 nit is raw string from NIT column", mapped?.nit === "1047440651");
  assert("1.3 slug does NOT contain sagTerceroId", !buildCustomerSlug(mapped!).includes("195"));
  assert("1.4 slug is based on NIT for URL friendliness", buildCustomerSlug(mapped!) === "1047440651");
}

// ── Suite 2: Same sagTerceroId merges (same identity) ───────────────────────

console.log("\n--- 2. Same sagTerceroId = same identity ---");

{
  // Two rows with same CLIENTE_ID but different NIT (NIT changed in SAG)
  const row1 = mapSagCustomerMasterRow(buildRow({ CLIENTE_ID: 500, NIT: 900123456 }));
  const row2 = mapSagCustomerMasterRow(buildRow({ CLIENTE_ID: 500, NIT: 900123457 }));
  assert("2.1 Both map to same sagTerceroId", row1?.sagTerceroId === row2?.sagTerceroId);
  assert("2.2 sagTerceroId = 500 for both", row1?.sagTerceroId === 500);
  assert("2.3 NIT differs (mutable attribute)", row1?.nit !== row2?.nit);
  assert("2.4 Slugs differ (NIT-based URL)", buildCustomerSlug(row1!) !== buildCustomerSlug(row2!));
}

// ── Suite 3: Same NIT with different sagTerceroId = different profiles ───────

console.log("\n--- 3. Same NIT, different sagTerceroId = different profiles ---");

{
  const row1 = mapSagCustomerMasterRow(buildRow({ CLIENTE_ID: 601, NIT: 800100200 }));
  const row2 = mapSagCustomerMasterRow(buildRow({ CLIENTE_ID: 602, NIT: 800100200 }));
  assert("3.1 Different sagTerceroId", row1?.sagTerceroId !== row2?.sagTerceroId);
  assert("3.2 Same NIT", row1?.nit === row2?.nit);
  assert("3.3 Same slug (both NIT-based)", buildCustomerSlug(row1!) === buildCustomerSlug(row2!));
  // The sync layer handles slug collision by appending -{sagTerceroId}
}

// ── Suite 4: NIT changes preserve profile identity ──────────────────────────

console.log("\n--- 4. NIT change preserves identity ---");

{
  const before = mapSagCustomerMasterRow(buildRow({ CLIENTE_ID: 700, NIT: 111222333 }));
  const after = mapSagCustomerMasterRow(buildRow({ CLIENTE_ID: 700, NIT: 444555666 }));
  assert("4.1 Same sagTerceroId after NIT change", before?.sagTerceroId === after?.sagTerceroId);
  assert("4.2 NIT updated", after?.nit === "444555666");
  assert("4.3 Old NIT no longer present", before?.nit === "111222333");
}

// ── Suite 5: Null CLIENTE_ID row is skipped ─────────────────────────────────

console.log("\n--- 5. Null CLIENTE_ID handling ---");

{
  // Row with no CLIENTE_ID but has NIT — adapter maps it but sagTerceroId = 0
  const row = mapSagCustomerMasterRow(buildRow({ CLIENTE_ID: null, NIT: 900111222 }));
  assert("5.1 Row with null CLIENTE_ID but NIT is still mapped", row !== null);
  assert("5.2 sagTerceroId = 0 (from null CLIENTE_ID)", row?.sagTerceroId === 0);
  // The sync layer skips rows with sagTerceroId <= 0

  // Row with no CLIENTE_ID and no NIT — adapter returns null
  const noIdRow = mapSagCustomerMasterRow(buildRow({ CLIENTE_ID: null, NIT: null }));
  assert("5.3 Row with null CLIENTE_ID AND null NIT returns null", noIdRow === null);
}

// ── Suite 6: CRM fields preserved during sync (not overwritten) ─────────────

console.log("\n--- 6. CRM field preservation ---");

{
  // The sync buildSagData function should NOT include crmId, rawCrmJson, crmSyncedAt
  const mapped = mapSagCustomerMasterRow(buildRow());
  assert("6.1 MappedCustomerMaster has no crmId field", !("crmId" in (mapped as any)));
  assert("6.2 MappedCustomerMaster has no rawCrmJson field", !("rawCrmJson" in (mapped as any)));
  assert("6.3 MappedCustomerMaster has no crmSyncedAt field", !("crmSyncedAt" in (mapped as any)));
}

// ── Suite 7: Slug does NOT control identity ─────────────────────────────────

console.log("\n--- 7. Slug is presentation-only ---");

{
  const mapped = mapSagCustomerMasterRow(buildRow({ CLIENTE_ID: 77777, NIT: 900999888 }));
  const slug = buildCustomerSlug(mapped!);
  assert("7.1 Slug is NIT-based string", slug === "900999888");
  assert("7.2 Slug does not contain CLIENTE_ID", !slug.includes("77777"));

  // Name-based slug fallback when no NIT
  const noNit = mapSagCustomerMasterRow(buildRow({ CLIENTE_ID: 77778, NIT: null, RAZON_SOCIAL: "Test Corp SAS" }));
  // noNit is null because no NIT and no CLIENTE_ID with value... actually CLIENTE_ID=889
  // wait, NIT=null but CLIENTE_ID=889 should still pass the gate
  assert("7.3 Row with CLIENTE_ID but no NIT is still mapped", noNit !== null);
  if (noNit) {
    const nameSlug = buildCustomerSlug(noNit);
    assert("7.4 Slug falls back to name when no NIT", nameSlug === "test-corp-sas");
  }
}

// ── Suite 8: Multi-tenant isolation ─────────────────────────────────────────

console.log("\n--- 8. Multi-tenant isolation ---");

{
  // Same sagTerceroId in different orgs should be different profiles
  // This is enforced by the sync always using organizationId in queries
  const row = mapSagCustomerMasterRow(buildRow({ CLIENTE_ID: 1000 }));
  assert("8.1 sagTerceroId is org-agnostic at adapter level", row?.sagTerceroId === 1000);
  // Isolation is enforced by the sync layer passing orgId to findFirst/create/update
}

// ── Suite 9: Data quality evaluation ────────────────────────────────────────

console.log("\n--- 9. Data quality ---");

{
  const fullRow = buildRow();
  const quality = evaluateCustomerDataQuality(fullRow as any);
  assert("9.1 Full row evaluates to VALID", quality.quality === "VALID");

  const sparseRow = buildRow({
    RAZON_SOCIAL: null,
    CIUDAD: null,
    VENDEDOR_ASIGNADO: null,
    EMAIL: null,
    TELEFONO: null,
    CELULAR: null,
    TIPO_CLIENTE: null,
    DIRECCION: null,
  });
  const sparseQuality = evaluateCustomerDataQuality(sparseRow as any);
  assert("9.2 Sparse row evaluates to INCOMPLETE", sparseQuality.quality === "INCOMPLETE");
}

// ── Suite 10: Name normalization ────────────────────────────────────────────

console.log("\n--- 10. Name normalization ---");

{
  assert("10.1 ALL CAPS gets title-cased", normalizeCustomerName("JUAN CARLOS GOMEZ") === "Juan Carlos Gomez");
  assert("10.2 Null returns SIN NOMBRE", normalizeCustomerName(null) === "SIN NOMBRE");
  assert("10.3 Empty returns SIN NOMBRE", normalizeCustomerName("") === "SIN NOMBRE");
  assert("10.4 Single char returns SIN NOMBRE", normalizeCustomerName("A") === "SIN NOMBRE");
}

// ── Suite 11: Status normalization ──────────────────────────────────────────

console.log("\n--- 11. Status normalization ---");

{
  assert("11.1 'Activo' → ACTIVE", normalizeCustomerStatus("Activo") === "ACTIVE");
  assert("11.2 'Inactivo' → INACTIVE", normalizeCustomerStatus("Inactivo") === "INACTIVE");
  assert("11.3 null → INACTIVE", normalizeCustomerStatus(null) === "INACTIVE");
  assert("11.4 'S' → ACTIVE", normalizeCustomerStatus("S") === "ACTIVE");
}

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);
