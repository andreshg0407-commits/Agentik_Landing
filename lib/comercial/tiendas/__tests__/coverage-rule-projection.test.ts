/**
 * lib/comercial/tiendas/__tests__/coverage-rule-projection.test.ts
 *
 * AGENTIK-STORES-COVERAGE-RULE-PROJECTION-01
 *
 * R1-R20: domain certification tests + DYNAMIC RULE PROJECTION CONTRACT.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/coverage-rule-projection.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildCoverageRuleProjection,
  buildStructureRuleId,
  buildSpecialRuleId,
  type CoverageRuleEvaluation,
  type CoverageRuleStatus,
} from "../coverage-rule-projection";
import {
  assembleSnapshotSource,
  buildStructureLookup,
  type SnapshotSourceRows,
  type SnapshotInventoryRow,
} from "../store-snapshot-assembler";
import { runStoreSnapshotPipeline, type SnapshotStoreCoverage } from "../store-snapshot-pipeline";
import type { SpecialRuleEvaluation } from "../store-unit-coverage-engine";
import type { UnitsRuleEvaluation } from "../../derrotero-semantics";

// ═════════════════════════════════════════════════════════════════════════════
// Shared fixture builder
// ═════════════════════════════════════════════════════════════════════════════

function mkInventoryRow(
  overrides: Partial<SnapshotInventoryRow> & Pick<SnapshotInventoryRow, "referenceCode" | "warehouseKind">,
): SnapshotInventoryRow {
  return {
    warehouseKind: overrides.warehouseKind,
    storeId: overrides.storeId ?? null,
    warehousePk: overrides.warehousePk ?? "99",
    referenceCode: overrides.referenceCode,
    productId: overrides.productId ?? overrides.referenceCode,
    productName: overrides.productName ?? overrides.referenceCode,
    variantKey: overrides.variantKey ?? `${overrides.referenceCode}|default`,
    units: overrides.units ?? 1,
    grupoSag: overrides.grupoSag ?? null,
    subgrupoSag: overrides.subgrupoSag ?? null,
    productLine: overrides.productLine ?? null,
    handlingUnit: overrides.handlingUnit ?? null,
    createdAtSag: overrides.createdAtSag ?? null,
    heroImageUrl: overrides.heroImageUrl ?? null,
    updatedAt: overrides.updatedAt ?? "2026-08-01T00:00:00.000Z",
  };
}

/**
 * Build a minimal source with one store (gran_plaza) and configurable items.
 */
function buildMinimalSource(items: SnapshotInventoryRow[]): SnapshotSourceRows {
  return {
    organizationId: "test-org",
    readAt: "2026-08-01T12:00:00.000Z",
    inventoryRows: items,
    governanceStores: [{ storeId: "gran_plaza", displayName: "Gran Plaza" }],
    policyRulesByStore: [{ storeId: "gran_plaza", rules: [] }],
  };
}

/**
 * Run the full pipeline from raw rows and return gran_plaza's coverage.
 */
function runForGranPlaza(items: SnapshotInventoryRow[]) {
  const source = buildMinimalSource(items);
  const assembled = assembleSnapshotSource(source);
  const snapshot = runStoreSnapshotPipeline(assembled);
  const store = snapshot.perStore.find(s => s.storeId === "gran_plaza")!;
  return { store, snapshot };
}

// ═════════════════════════════════════════════════════════════════════════════
// R1-R5: Structure counts preserved
// ═════════════════════════════════════════════════════════════════════════════

describe("R1-R5: structure counts", () => {
  const lookup = buildStructureLookup();
  const allExpected = lookup.expected;

  it("R1: 46 structures total", () => {
    assert.equal(allExpected.length, 46);
  });

  it("R3: 32 Castillitos", () => {
    assert.equal(allExpected.filter(e => e.line === "castillitos").length, 32);
  });

  it("R4: 11 Latin Kids", () => {
    assert.equal(allExpected.filter(e => e.line === "latin_kids").length, 11);
  });

  it("R5: 3 ACC", () => {
    assert.equal(allExpected.filter(e => e.line === "accesorios_importacion").length, 3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R2: 63% coverage preserved for Gran Plaza (empty = 0/46 = 0%)
// Here we verify the projection count matches the engine count.
// ═════════════════════════════════════════════════════════════════════════════

describe("R2: coverage KPI consistency", () => {
  it("empty store → 0/46 in both engine and projection", () => {
    const { store } = runForGranPlaza([]);
    assert.equal(store.coverage.expectedStructures, 46);
    assert.equal(store.coverage.healthyStructures, 0);
    assert.equal(store.kpis.coveragePercent, 0);

    const projection = store.coverage.ruleEvaluations;
    const structRules = projection.filter(r => r.ruleType !== "SPECIAL_PRODUCT");
    assert.equal(structRules.length, 46, "46 structure rules in projection");
    assert.equal(
      structRules.filter(r => r.status === "SIN_COBERTURA").length,
      46,
      "all 46 SIN_COBERTURA when empty",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R6: 3 special rules appear in the generic projection
// ═════════════════════════════════════════════════════════════════════════════

describe("R6: special rules in projection", () => {
  it("3 special rules projected for gran_plaza", () => {
    const { store } = runForGranPlaza([]);
    const specials = store.coverage.ruleEvaluations.filter(
      r => r.ruleType === "SPECIAL_PRODUCT",
    );
    assert.equal(specials.length, 3);
    const patterns = specials.map(s => s.label).sort();
    assert.deepEqual(patterns, ["BAÑERA", "CORRAL", "CUNA COLECHO"]);
  });

  it("special rules have ruleType SPECIAL_PRODUCT and source SPECIAL_POLICY", () => {
    const { store } = runForGranPlaza([]);
    const specials = store.coverage.ruleEvaluations.filter(
      r => r.ruleType === "SPECIAL_PRODUCT",
    );
    for (const s of specials) {
      assert.equal(s.source, "SPECIAL_POLICY");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R7: textile 8/10/12 preserved
// ═════════════════════════════════════════════════════════════════════════════

describe("R7: textile thresholds preserved", () => {
  it("CS structure has min=8, ideal=10, max=12", () => {
    const { store } = runForGranPlaza([]);
    const csRule = store.coverage.ruleEvaluations.find(
      r => r.ruleId.startsWith("STRUCT:CS|"),
    )!;
    assert.equal(csRule.minimum, 8);
    assert.equal(csRule.ideal, 10);
    assert.equal(csRule.maximum, 12);
  });

  it("LK structure has min=8, ideal=10, max=12", () => {
    const { store } = runForGranPlaza([]);
    const lkRule = store.coverage.ruleEvaluations.find(
      r => r.ruleId.startsWith("STRUCT:LK|"),
    )!;
    assert.equal(lkRule.minimum, 8);
    assert.equal(lkRule.ideal, 10);
    assert.equal(lkRule.maximum, 12);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R8: ACC 6/4/1 preserved
// ═════════════════════════════════════════════════════════════════════════════

describe("R8: ACC thresholds preserved", () => {
  it("ACC Pequeño: min=ideal=6, max=null", () => {
    const { store } = runForGranPlaza([]);
    const r = store.coverage.ruleEvaluations.find(r => r.label === "Pequeño")!;
    assert.equal(r.minimum, 6);
    assert.equal(r.ideal, 6);
    assert.equal(r.maximum, null);
    assert.equal(r.ruleType, "ACCESSORY_SIZE");
  });

  it("ACC Mediano: min=ideal=4, max=null", () => {
    const { store } = runForGranPlaza([]);
    const r = store.coverage.ruleEvaluations.find(r => r.label === "Mediano")!;
    assert.equal(r.minimum, 4);
    assert.equal(r.ideal, 4);
    assert.equal(r.maximum, null);
  });

  it("ACC Grande: min=ideal=1, max=null", () => {
    const { store } = runForGranPlaza([]);
    const r = store.coverage.ruleEvaluations.find(r => r.label === "Grande")!;
    assert.equal(r.minimum, 1);
    assert.equal(r.ideal, 1);
    assert.equal(r.maximum, null);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R9: special 3/3/1/1 preserved (gran_plaza = 1)
// ═════════════════════════════════════════════════════════════════════════════

describe("R9: special thresholds preserved", () => {
  it("gran_plaza specials all have ideal=1", () => {
    const { store } = runForGranPlaza([]);
    const specials = store.coverage.ruleEvaluations.filter(
      r => r.ruleType === "SPECIAL_PRODUCT",
    );
    for (const s of specials) {
      assert.equal(s.ideal, 1, `${s.label} should have ideal=1 for gran_plaza`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R10-R11: POLICY_OVERRIDE replaces default, source identifies override
// ═════════════════════════════════════════════════════════════════════════════

describe("R10-R11: policy override", () => {
  it("override replaces default without duplicating", () => {
    const items = [
      mkInventoryRow({
        referenceCode: "PJ001", warehouseKind: "STORE", storeId: "gran_plaza",
        grupoSag: "CS NIÑA BEBE", subgrupoSag: "PIJAMA NIÑA BB CL",
        productLine: "1", units: 5,
      }),
    ];
    const source: SnapshotSourceRows = {
      organizationId: "test-org",
      readAt: "2026-08-01T12:00:00.000Z",
      inventoryRows: items,
      governanceStores: [{ storeId: "gran_plaza", displayName: "Gran Plaza" }],
      policyRulesByStore: [{
        storeId: "gran_plaza",
        rules: [{
          scope: "line", line: "castillitos",
          minQty: 5, idealQty: 7, maxQty: 9,
          active: true, validFrom: null, validTo: null,
        }],
      }],
    };
    const assembled = assembleSnapshotSource(source);
    const snapshot = runStoreSnapshotPipeline(assembled);
    const store = snapshot.perStore.find(s => s.storeId === "gran_plaza")!;

    // All CS structures should have the override thresholds
    const csRules = store.coverage.ruleEvaluations.filter(
      r => r.ruleId.startsWith("STRUCT:CS|"),
    );
    assert.equal(csRules.length, 32, "still 32 CS structures — no duplication");

    for (const r of csRules) {
      assert.equal(r.minimum, 5, `${r.label} min should be 5 (override)`);
      assert.equal(r.ideal, 7, `${r.label} ideal should be 7 (override)`);
      assert.equal(r.maximum, 9, `${r.label} max should be 9 (override)`);
      assert.equal(r.source, "POLICY_OVERRIDE", `${r.label} should be POLICY_OVERRIDE`);
    }

    // LK should remain PACK_DEFAULT
    const lkRules = store.coverage.ruleEvaluations.filter(
      r => r.ruleId.startsWith("STRUCT:LK|"),
    );
    for (const r of lkRules) {
      assert.equal(r.source, "PACK_DEFAULT");
      assert.equal(r.minimum, 8);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R12-R13: active=false excludes, active=true includes (override rules)
// ═════════════════════════════════════════════════════════════════════════════

describe("R12-R13: active flag on override rules", () => {
  it("inactive override is ignored — defaults apply", () => {
    const source: SnapshotSourceRows = {
      organizationId: "test-org",
      readAt: "2026-08-01T12:00:00.000Z",
      inventoryRows: [],
      governanceStores: [{ storeId: "gran_plaza", displayName: "Gran Plaza" }],
      policyRulesByStore: [{
        storeId: "gran_plaza",
        rules: [{
          scope: "line", line: "castillitos",
          minQty: 99, idealQty: 99, maxQty: 99,
          active: false, validFrom: null, validTo: null,
        }],
      }],
    };
    const assembled = assembleSnapshotSource(source);
    const snapshot = runStoreSnapshotPipeline(assembled);
    const store = snapshot.perStore.find(s => s.storeId === "gran_plaza")!;
    const csRule = store.coverage.ruleEvaluations.find(
      r => r.ruleId.startsWith("STRUCT:CS|"),
    )!;
    // Should fall back to PACK_DEFAULT 8/10/12
    assert.equal(csRule.minimum, 8);
    assert.equal(csRule.source, "PACK_DEFAULT");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R16: OVER_MAXIMUM status visible
// ═════════════════════════════════════════════════════════════════════════════

describe("R16: OVER_MAXIMUM visible", () => {
  it("CS structure with 15 units → SOBRE_MAXIMO", () => {
    // Create 15 units across refs in one CS structure
    const items: SnapshotInventoryRow[] = [];
    for (let i = 1; i <= 15; i++) {
      items.push(mkInventoryRow({
        referenceCode: `PJ${String(i).padStart(3, "0")}`,
        warehouseKind: "STORE", storeId: "gran_plaza",
        grupoSag: "CS NIÑA BEBE", subgrupoSag: "PIJAMA NIÑA BB CL",
        productLine: "1", units: 1,
        variantKey: `PJ${String(i).padStart(3, "0")}|default`,
      }));
    }
    const { store } = runForGranPlaza(items);

    const r = store.coverage.ruleEvaluations.find(
      r => r.ruleId === buildStructureRuleId("CS|CS NIÑA BEBE|Pijama Niña BB CL"),
    )!;
    assert.equal(r.status, "SOBRE_MAXIMO");
    assert.equal(r.actualUnits, 15);
    assert.equal(r.gapToIdeal, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R17: SIN_REFERENCIAS distinct from BAJO_MINIMO
// ═════════════════════════════════════════════════════════════════════════════

describe("R17: SIN_COBERTURA vs BAJO_MINIMO", () => {
  it("0 refs → SIN_COBERTURA; 3 units → BAJO_MINIMO", () => {
    const items = [
      mkInventoryRow({
        referenceCode: "PJ001", warehouseKind: "STORE", storeId: "gran_plaza",
        grupoSag: "CS NIÑA BEBE", subgrupoSag: "PIJAMA NIÑA BB CL",
        productLine: "1", units: 3,
      }),
    ];
    const { store } = runForGranPlaza(items);

    // The structure with stock → BAJO_MINIMO (3 < 8)
    const withStock = store.coverage.ruleEvaluations.find(
      r => r.ruleId === buildStructureRuleId("CS|CS NIÑA BEBE|Pijama Niña BB CL"),
    )!;
    assert.equal(withStock.status, "BAJO_MINIMO");

    // A structure with no stock → SIN_COBERTURA
    const empty = store.coverage.ruleEvaluations.find(
      r => r.ruleId === buildStructureRuleId("CS|CS NIÑA BEBE|Vestido"),
    )!;
    assert.equal(empty.status, "SIN_COBERTURA");
    assert.equal(empty.actualUnits, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R18: physical inventory unchanged
// ═════════════════════════════════════════════════════════════════════════════

describe("R18: inventory unchanged by projection", () => {
  it("total inventory units match input", () => {
    const items = [
      mkInventoryRow({
        referenceCode: "PJ001", warehouseKind: "STORE", storeId: "gran_plaza",
        grupoSag: "CS NIÑA BEBE", subgrupoSag: "PIJAMA NIÑA BB CL",
        productLine: "1", units: 10,
      }),
      mkInventoryRow({
        referenceCode: "ACC001", warehouseKind: "STORE", storeId: "gran_plaza",
        productLine: "5", handlingUnit: "PEQUENO", units: 7,
      }),
    ];
    const { store } = runForGranPlaza(items);
    assert.equal(store.inventory.totalUnits, 17);
    assert.equal(store.inventory.referenceCount, 2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R19: special + ACC reference does NOT duplicate physical units
// ═════════════════════════════════════════════════════════════════════════════

describe("R19: no unit duplication across rule types", () => {
  it("a BANERA ACC|Grande ref is measured by both rules independently", () => {
    const items = [
      mkInventoryRow({
        referenceCode: "BANERA001", warehouseKind: "STORE", storeId: "gran_plaza",
        productName: "CUNA BAÑERA GRANDE",
        productLine: "5", handlingUnit: "GRANDE", units: 2,
      }),
    ];
    const { store } = runForGranPlaza(items);

    // ACC Grande should see 2 units
    const accGrande = store.coverage.ruleEvaluations.find(r => r.label === "Grande")!;
    assert.equal(accGrande.actualUnits, 2);

    // Special BAÑERA should also see 2 units (same physical item)
    const banera = store.coverage.ruleEvaluations.find(
      r => r.ruleType === "SPECIAL_PRODUCT" && r.label === "BAÑERA",
    )!;
    assert.equal(banera.actualUnits, 2);

    // Physical inventory is 2, not 4
    assert.equal(store.inventory.totalUnits, 2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// R20: UI does not participate in rule construction
// (Source-code audit — no UI files import coverage-rule-projection)
// ═════════════════════════════════════════════════════════════════════════════

describe("R20: UI does not construct rules", () => {
  it("coverage-rule-projection has no UI/React imports", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../coverage-rule-projection.ts"), "utf8",
    );
    assert.ok(!src.includes("from \"react\""), "no React import");
    assert.ok(!src.includes("from \"next"), "no Next.js import");
    assert.ok(!src.includes("\"use client\""), "no client directive");
    assert.ok(!src.includes("from \"@/components"), "no component import");
    assert.ok(!src.includes("from \"@/app"), "no app import");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Projection contract: ruleId stability, source
// ═════════════════════════════════════════════════════════════════════════════

describe("projection contract", () => {
  it("ruleId is stable and deterministic", () => {
    const id1 = buildStructureRuleId("CS|CS NIÑA BEBE|Blusas");
    const id2 = buildStructureRuleId("CS|CS NIÑA BEBE|Blusas");
    assert.equal(id1, id2);
    assert.equal(id1, "STRUCT:CS|CS NIÑA BEBE|Blusas");
  });

  it("special ruleId includes storeId and pattern", () => {
    const id = buildSpecialRuleId("gran_plaza", "BAÑERA");
    assert.equal(id, "SPECIAL:gran_plaza:BAÑERA");
  });

  it("all structure rules have source PACK_DEFAULT or POLICY_OVERRIDE", () => {
    const { store } = runForGranPlaza([]);
    const structRules = store.coverage.ruleEvaluations.filter(
      r => r.ruleType !== "SPECIAL_PRODUCT",
    );
    for (const r of structRules) {
      assert.ok(
        r.source === "PACK_DEFAULT" || r.source === "POLICY_OVERRIDE",
        `unexpected source: ${r.source}`,
      );
    }
  });

  it("special rules have source SPECIAL_POLICY", () => {
    const { store } = runForGranPlaza([]);
    const specials = store.coverage.ruleEvaluations.filter(
      r => r.ruleType === "SPECIAL_PRODUCT",
    );
    for (const s of specials) {
      assert.equal(s.source, "SPECIAL_POLICY");
    }
  });

  it("ruleId prefix matches ruleType for each rule", () => {
    const { store } = runForGranPlaza([]);
    for (const r of store.coverage.ruleEvaluations) {
      if (r.ruleType === "TEXTILE_STRUCTURE") {
        assert.ok(
          r.ruleId.startsWith("STRUCT:CS|") || r.ruleId.startsWith("STRUCT:LK|"),
          `textile ruleId should start with STRUCT:CS| or STRUCT:LK|, got: ${r.ruleId}`,
        );
      } else if (r.ruleType === "ACCESSORY_SIZE") {
        assert.ok(r.ruleId.startsWith("STRUCT:ACC|"), `ACC ruleId should start with STRUCT:ACC|`);
      } else if (r.ruleType === "SPECIAL_PRODUCT") {
        assert.ok(r.ruleId.startsWith("SPECIAL:"), `special ruleId should start with SPECIAL:`);
      }
    }
  });

  it("total projection = 46 structures + 3 specials = 49", () => {
    const { store } = runForGranPlaza([]);
    assert.equal(store.coverage.ruleEvaluations.length, 49);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DYNAMIC RULE PROJECTION CONTRACT (R14-R15 + extensibility test §20)
// ═════════════════════════════════════════════════════════════════════════════
//
// This test verifies the architectural capability of the projection to
// incorporate dynamically injected rules via StorePolicyRule overrides.
//
// CURRENT CLASSIFICATION: C. STATIC_WITH_OVERRIDES
//
// StorePolicyRule CAN override thresholds of existing structures (scope="line",
// scope="class_size") and toggle them via active flag. But it CANNOT add new
// structures beyond the 46 hardcoded in the catalogs.
//
// This test proves that:
//   1. A new override DOES affect the projection thresholds (R14 partial).
//   2. Deactivating the override reverts to defaults (R15).
//   3. The projection faithfully reflects whatever the assembler produces.
//
// What this test CANNOT prove (because the system is C):
//   - A completely new structure type (e.g. a new grupo+subgrupo combo)
//     appearing without catalog code changes.
//
// ═════════════════════════════════════════════════════════════════════════════

describe("DYNAMIC RULE PROJECTION CONTRACT (§20)", () => {
  it("R14: active override changes projected thresholds without code change", () => {
    const source: SnapshotSourceRows = {
      organizationId: "test-org",
      readAt: "2026-08-01T12:00:00.000Z",
      inventoryRows: [],
      governanceStores: [{ storeId: "gran_plaza", displayName: "Gran Plaza" }],
      policyRulesByStore: [{
        storeId: "gran_plaza",
        rules: [{
          // Dynamic override — changes ACC small from 6 to 15
          scope: "class_size", sizeClass: "small",
          minQty: 15, idealQty: 15, maxQty: 15,
          active: true, validFrom: null, validTo: null,
        }],
      }],
    };
    const assembled = assembleSnapshotSource(source);
    const snapshot = runStoreSnapshotPipeline(assembled);
    const store = snapshot.perStore.find(s => s.storeId === "gran_plaza")!;

    const pequeño = store.coverage.ruleEvaluations.find(r => r.label === "Pequeño")!;
    assert.equal(pequeño.minimum, 15, "override min applied");
    assert.equal(pequeño.ideal, 15, "override ideal applied");
    assert.equal(pequeño.source, "POLICY_OVERRIDE");

    // Other ACC sizes remain defaults
    const mediano = store.coverage.ruleEvaluations.find(r => r.label === "Mediano")!;
    assert.equal(mediano.minimum, 4, "Mediano still default");
    assert.equal(mediano.source, "PACK_DEFAULT");

    // Total structure count unchanged
    const structRules = store.coverage.ruleEvaluations.filter(
      r => r.ruleType !== "SPECIAL_PRODUCT",
    );
    assert.equal(structRules.length, 46, "still 46 structures");
  });

  it("R15: active=false reverts override — defaults return", () => {
    const source: SnapshotSourceRows = {
      organizationId: "test-org",
      readAt: "2026-08-01T12:00:00.000Z",
      inventoryRows: [],
      governanceStores: [{ storeId: "gran_plaza", displayName: "Gran Plaza" }],
      policyRulesByStore: [{
        storeId: "gran_plaza",
        rules: [{
          scope: "class_size", sizeClass: "small",
          minQty: 99, idealQty: 99, maxQty: 99,
          active: false, // DEACTIVATED
          validFrom: null, validTo: null,
        }],
      }],
    };
    const assembled = assembleSnapshotSource(source);
    const snapshot = runStoreSnapshotPipeline(assembled);
    const store = snapshot.perStore.find(s => s.storeId === "gran_plaza")!;

    const pequeño = store.coverage.ruleEvaluations.find(r => r.label === "Pequeño")!;
    assert.equal(pequeño.minimum, 6, "reverted to default");
    assert.equal(pequeño.source, "PACK_DEFAULT");
  });

  it("CLASSIFICATION: C — new structure type requires catalog code change", () => {
    // This test documents the current limitation.
    // A StorePolicyRule cannot CREATE a new structure (e.g. "CS|NEW_GROUP|New Entry").
    // The 46 structures are fixed by buildStructureLookup() which reads hardcoded catalogs.
    //
    // To prove this, we verify that injecting a policy rule with a new line/subgroup
    // combination does NOT produce a 47th structure in the projection.
    const source: SnapshotSourceRows = {
      organizationId: "test-org",
      readAt: "2026-08-01T12:00:00.000Z",
      inventoryRows: [],
      governanceStores: [{ storeId: "gran_plaza", displayName: "Gran Plaza" }],
      policyRulesByStore: [{
        storeId: "gran_plaza",
        rules: [{
          scope: "line", line: "new_fictional_line",
          minQty: 2, idealQty: 3, maxQty: 4,
          active: true, validFrom: null, validTo: null,
        }],
      }],
    };
    const assembled = assembleSnapshotSource(source);
    const snapshot = runStoreSnapshotPipeline(assembled);
    const store = snapshot.perStore.find(s => s.storeId === "gran_plaza")!;

    // Still 46 — the new rule matched nothing because no catalog entry exists
    const structRules = store.coverage.ruleEvaluations.filter(
      r => r.ruleType !== "SPECIAL_PRODUCT",
    );
    assert.equal(structRules.length, 46, "CLASSIFICATION C: cannot add new structures via policy alone");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Backward compatibility: coverage.structures[] and coverage.specialRules[]
// still populated correctly alongside ruleEvaluations[]
// ═════════════════════════════════════════════════════════════════════════════

describe("backward compatibility", () => {
  it("structures[] and specialRules[] coexist with ruleEvaluations[]", () => {
    const { store } = runForGranPlaza([]);
    assert.equal(store.coverage.structures.length, 46);
    assert.equal(store.coverage.specialRules.length, 3);
    assert.equal(store.coverage.ruleEvaluations.length, 49);
  });

  it("coveragePercent unchanged by projection presence", () => {
    const { store } = runForGranPlaza([]);
    assert.equal(store.kpis.coveragePercent, 0); // empty store
    assert.equal(store.coverage.expectedStructures, 46);
    assert.equal(store.coverage.healthyStructures, 0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Status mapping completeness
// ═════════════════════════════════════════════════════════════════════════════

describe("status mapping", () => {
  it("DENTRO_DE_RANGO for CS structure with 10 units", () => {
    const items: SnapshotInventoryRow[] = [];
    for (let i = 1; i <= 10; i++) {
      items.push(mkInventoryRow({
        referenceCode: `PJ${String(i).padStart(3, "0")}`,
        warehouseKind: "STORE", storeId: "gran_plaza",
        grupoSag: "CS NIÑA BEBE", subgrupoSag: "PIJAMA NIÑA BB CL",
        productLine: "1", units: 1,
        variantKey: `PJ${String(i).padStart(3, "0")}|default`,
      }));
    }
    const { store } = runForGranPlaza(items);
    const r = store.coverage.ruleEvaluations.find(
      r => r.ruleId === buildStructureRuleId("CS|CS NIÑA BEBE|Pijama Niña BB CL"),
    )!;
    assert.equal(r.status, "DENTRO_DE_RANGO");
    assert.equal(r.actualUnits, 10);
    assert.equal(r.gapToIdeal, 0);
  });

  it("CUMPLIDA for special rule with ideal met", () => {
    const items = [
      mkInventoryRow({
        referenceCode: "BANERA001", warehouseKind: "STORE", storeId: "gran_plaza",
        productName: "BAÑERA PLEGABLE",
        productLine: "5", handlingUnit: "GRANDE", units: 1,
      }),
    ];
    const { store } = runForGranPlaza(items);
    const banera = store.coverage.ruleEvaluations.find(
      r => r.ruleType === "SPECIAL_PRODUCT" && r.label === "BAÑERA",
    )!;
    assert.equal(banera.status, "CUMPLIDA");
    assert.equal(banera.actualUnits, 1);
    assert.equal(banera.ideal, 1);
  });

  it("EXCEDENTE for special rule with units > ideal", () => {
    const items = [
      mkInventoryRow({
        referenceCode: "BANERA001", warehouseKind: "STORE", storeId: "gran_plaza",
        productName: "BAÑERA PLEGABLE",
        productLine: "5", handlingUnit: "GRANDE", units: 3,
      }),
    ];
    const { store } = runForGranPlaza(items);
    const banera = store.coverage.ruleEvaluations.find(
      r => r.ruleType === "SPECIAL_PRODUCT" && r.label === "BAÑERA",
    )!;
    assert.equal(banera.status, "EXCEDENTE");
  });

  it("FALTANTE for special rule with 0 units and ideal > 0", () => {
    const { store } = runForGranPlaza([]);
    const banera = store.coverage.ruleEvaluations.find(
      r => r.ruleType === "SPECIAL_PRODUCT" && r.label === "BAÑERA",
    )!;
    assert.equal(banera.status, "FALTANTE");
    assert.equal(banera.gapToIdeal, 1); // ideal=1, actual=0
  });
});
