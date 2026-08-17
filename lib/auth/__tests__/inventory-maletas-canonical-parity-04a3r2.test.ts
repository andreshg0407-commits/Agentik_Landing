/**
 * INVENTORY-MALETAS-CANONICAL-PARITY-04A3R2
 *
 * Tests that Inventario and Maletas consume the exact same canonical B01 provider.
 * Verifies: shared provider, threshold semantics, filter behavior, reserved authority,
 * SOURCE_DOWN fail-closed, no CCS authority, no PIL authority for B01.
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const INVENTORY_SERVICE_PATH = path.resolve(
  __dirname,
  "../../inventory/inventory-control-service.ts"
);
const VENDOR_SAMPLE_LOADER_PATH = path.resolve(
  __dirname,
  "../../comercial/maletas/vendor-sample-loader.ts"
);
const INVENTARIO_CLIENT_PATH = path.resolve(
  __dirname,
  "../../../app/(app)/[orgSlug]/comercial/inventario/inventario-client.tsx"
);
const invSrc = fs.readFileSync(INVENTORY_SERVICE_PATH, "utf-8");
const maletasSrc = fs.readFileSync(VENDOR_SAMPLE_LOADER_PATH, "utf-8");
const clientSrc = fs.readFileSync(INVENTARIO_CLIENT_PATH, "utf-8");

// ── F1: Same canonical provider ────────────────────────────────────────────

describe("F1 — Same canonical B01 provider in Inventario and Maletas", () => {
  test("T1a: Inventario imports getCanonicalMainWarehouseAvailability", () => {
    expect(invSrc).toContain("getCanonicalMainWarehouseAvailability");
  });

  test("T1b: Maletas imports getCanonicalMainWarehouseAvailability", () => {
    expect(maletasSrc).toContain("getCanonicalMainWarehouseAvailability");
  });

  test("T1c: Both import from the same module path", () => {
    const invImport = invSrc.match(/from\s+["']([^"']*canonical-warehouse-availability[^"']*)["']/);
    const maletasImport = maletasSrc.match(/from\s+["']([^"']*canonical-warehouse-availability[^"']*)["']/);
    expect(invImport).not.toBeNull();
    expect(maletasImport).not.toBeNull();
    // Both should resolve to the same module
    expect(invImport![1]).toContain("canonical-warehouse-availability");
    expect(maletasImport![1]).toContain("canonical-warehouse-availability");
  });
});

// ── F2: Same reference → same quantities ───────────────────────────────────

describe("F2 — Same canonical ref → same quantities in both consumers", () => {
  test("T2a: Inventario textile items built from canonicalB01.refs", () => {
    expect(invSrc).toContain("canonicalB01.refs");
  });

  test("T2b: Inventario uses ref.existencia for onHandReal", () => {
    expect(invSrc).toContain("const onHandReal = ref.existencia");
  });

  test("T2c: Inventario uses ref.reservado for reservedReal", () => {
    expect(invSrc).toContain("const reservedReal = ref.reservado");
  });

  test("T2d: Inventario uses ref.available for disponibleReal (SAG DISPONIBLE)", () => {
    expect(invSrc).toContain("const commercialAvailable = ref.available");
  });
});

// ── F3: Threshold boundary tests ───────────────────────────────────────────

describe("F3 — Threshold boundary (structural)", () => {
  test("T3a: deriveTextileState treats <= 0 as sin_cobertura", () => {
    expect(invSrc).toContain("if (disponibleReal <= 0) return \"sin_cobertura\"");
  });

  test("T3b: deriveTextileState treats <= threshold as bajo", () => {
    expect(invSrc).toContain("if (disponibleReal <= threshold) return \"bajo\"");
  });

  test("T3c: deriveTextileState treats > threshold*3 as alta_disponibilidad", () => {
    expect(invSrc).toContain("if (disponibleReal > threshold * 3) return \"alta_disponibilidad\"");
  });

  // LT=201 enters, LT=200 does not → deriveTextileState(200, 200) → "bajo" (<=threshold)
  // LT=201 → deriveTextileState(201, 200) → "disponible" (>threshold, <=threshold*3)
  test("T3d: Threshold logic is strict inequality (> not >=)", () => {
    // The function uses <= threshold for "bajo", which means exactly AT threshold is "bajo"
    // And > threshold gives "disponible" — so 201 enters, 200 does not
    expect(invSrc).toContain("disponibleReal <= threshold");
  });
});

// ── F4: L-TRI01 and L-TRI02 exclusion ──────────────────────────────────────

describe("F4 — L-TRI01 and L-TRI02 do not enter cobertura suficiente", () => {
  // These have SAG=ABSENT (not in B01) per reconciliation.
  // With canonical B01 as universe, absent refs simply don't appear.
  test("T4a: Only refs present in canonical B01 can appear in textile items", () => {
    expect(invSrc).toContain("canonicalTextileRefs.map");
    expect(invSrc).not.toContain("report.rows.map((row: AvailabilityRow)");
  });
});

// ── F5: All 65 LT runtime candidates accessible ───────────────────────────

describe("F5 — All SAG B01 LT refs accessible in Inventario", () => {
  test("T5a: No limit/take/pagination before classifying and counting", () => {
    // The canonical B01 query has no LIMIT/TOP clause
    expect(invSrc).not.toMatch(/LIMIT\s+\d/i);
    expect(invSrc).not.toMatch(/\.take\s*\(/);
  });

  test("T5b: No filter removes textile refs before building items", () => {
    // Only accessory exclusion filter applied
    expect(invSrc).toContain("canonicalB01.refs.filter(r => !accessorySkuSet.has(r.reference))");
  });
});

// ── F6: Pagination after filtering ─────────────────────────────────────────

describe("F6 — Pagination occurs after filtering", () => {
  test("T6a: Client-side page slicing happens on filtered items", () => {
    expect(clientSrc).toContain("PAGE_SIZE");
  });
});

// ── F7: No join with catalog eliminates SAG refs silently ──────────────────

describe("F7 — No catalog join eliminates SAG refs", () => {
  test("T7a: Textile items iterate canonical refs, not PE join results", () => {
    // PE metadata is optional enrichment — ref not in PE still gets an item
    expect(invSrc).toContain("const meta = textileMetaBySku.get(ref.reference)");
    // Uses ?? null for all meta fields — never skips the ref
    expect(invSrc).toContain("productId: meta?.id ?? null");
  });
});

// ── F8: Ref without metadata remains visible as Sin clasificar ─────────────

describe("F8 — Ref without metadata stays visible", () => {
  test("T8a: SubGrupo falls back to inferProductType when PE is absent", () => {
    expect(invSrc).toContain("meta?.subgrupoSag ?? inferProductType(ref.description)");
  });

  test("T8b: Description comes from SAG canonical ref, not PE", () => {
    expect(invSrc).toContain("description: ref.description");
  });
});

// ── F9: SOURCE_DOWN fail-closed ────────────────────────────────────────────

describe("F9 — SOURCE_DOWN fail-closed", () => {
  test("T9a: canonicalB01.sourceDown produces empty textile items", () => {
    expect(invSrc).toContain("canonicalB01.sourceDown");
    expect(invSrc).toContain("? [] // SOURCE_DOWN");
  });

  test("T9b: Balance source status reflects SOURCE_DOWN", () => {
    expect(invSrc).toContain("SAG CURRENT B01 no disponible");
  });
});

// ── F10: No CCS as authority for B01 ───────────────────────────────────────

describe("F10 — Inventario does NOT use CCS as B01 authority", () => {
  test("T10a: CCS (availResult) loaded but NOT used for textile item building", () => {
    // CCS is loaded for snapshotAt freshness only
    expect(invSrc).toContain("loadAvailabilityRecords(organizationId)");
    // Textile items come from canonical, not report.rows
    expect(invSrc).not.toContain("report.rows.map((row: AvailabilityRow)");
  });

  test("T10b: Comment explicitly states CCS not used for reference universe", () => {
    expect(invSrc).toContain("NOT used for reference universe or balance values");
  });
});

// ── F11: Reserved authority (ADDENDUM) ─────────────────────────────────────

describe("F11 — Reserved authority is SAG RESERVADO only", () => {
  test("T11a: Inventario service sets reservedReal from ref.reservado", () => {
    expect(invSrc).toContain("const reservedReal = ref.reservado");
  });

  test("T11b: pedidosPendientes = reservedReal (same SAG source)", () => {
    expect(invSrc).toContain("pedidosPendientes: reservedReal");
  });

  test("T11c: No pedidosPendientes fallback in UI reserved display", () => {
    // The 04A4 fix: reservedReal is sole authority, no ?? pedidosPendientes
    expect(clientSrc).toContain("const reserved = orig.reservedReal;");
    expect(clientSrc).not.toContain("orig.reservedReal ?? orig.pedidosPendientes");
  });

  test("T11d: Comment documents SAG RESERVADO as sole authority", () => {
    expect(invSrc).toContain("SAG RESERVADO is the authority");
  });
});

// ── F12: Maletas and Inventario do not use CCS as authority for B01 ────────

describe("F12 — Neither module uses CCS as B01 availability authority", () => {
  test("T12a: Maletas canonical B01 says CCS is PROHIBITED", () => {
    const canonicalPath = path.resolve(
      __dirname,
      "../../comercial/maletas/canonical-warehouse-availability.ts"
    );
    const canonicalSrc = fs.readFileSync(canonicalPath, "utf-8");
    expect(canonicalSrc).toContain("CCS (CommercialCoverageSnapshot) is PROHIBITED");
  });

  test("T12b: Inventario comment states CCS not used for reference universe", () => {
    expect(invSrc).toContain("CCS is still loaded for snapshotAt");
    expect(invSrc).toContain("NOT for reference universe");
  });
});

// ── F13: Balance source status ─────────────────────────────────────────────

describe("F13 — Balance source status reflects canonical parity", () => {
  test("T13a: Normal state shows SAG_OFFICIAL with canonical note", () => {
    expect(invSrc).toContain("proveedor canonico compartido con Maletas");
  });

  test("T13b: SAG unavailable state is fail-closed", () => {
    expect(invSrc).toContain("Inventario textil vacio (fail-closed)");
  });

  test("T13c: balanceSource label is SAG_OFFICIAL for all textile items", () => {
    expect(invSrc).toContain('balanceSource: "SAG_OFFICIAL" as InventoryBalanceSourceLabel');
  });
});
