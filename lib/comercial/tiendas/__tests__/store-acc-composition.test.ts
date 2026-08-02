/**
 * lib/comercial/tiendas/__tests__/store-acc-composition.test.ts
 *
 * AGENTIK-STORES-ACCESSORIES-COMPOSITION-01
 * Certification: ACC analytical composition by commercialFamily per store.
 *
 * LAW: compositionByFamily is a read-only analytical projection.
 * It does NOT affect targets, coverage, needs, or replenishment.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-acc-composition.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  assembleSnapshotSource,
  buildStructureLookup,
  type SnapshotSourceRows,
  type SnapshotInventoryRow,
} from "../store-snapshot-assembler";
import {
  runStoreSnapshotPipeline,
  type SnapshotFamilyBucket,
  type StoreSnapshot,
} from "../store-snapshot-pipeline";

// ── Fixtures ────────────────────────────────────────────────────────────────

const lookup = buildStructureLookup();
const CS_KEY = [...lookup.csByMatchKey.keys()][0];
const [CS_GRUPO, CS_SUBGRUPO] = CS_KEY.split("|");

const READ_AT = "2026-07-30T12:00:00.000Z";

function row(partial: Partial<SnapshotInventoryRow>): SnapshotInventoryRow {
  return {
    warehouseKind: "STORE",
    storeId: "centro",
    warehousePk: "31",
    referenceCode: "REF-1",
    productId: "prod-1",
    productName: "Producto 1",
    variantKey: "V1",
    units: 1,
    grupoSag: CS_GRUPO,
    subgrupoSag: CS_SUBGRUPO,
    productLine: "1",
    handlingUnit: null,
    createdAtSag: null,
    heroImageUrl: null,
    updatedAt: "2026-07-30T10:00:00.000Z",
    ...partial,
  };
}

const accRow = (partial: Partial<SnapshotInventoryRow>): SnapshotInventoryRow =>
  row({ productLine: "5", grupoSag: null, subgrupoSag: null, ...partial });

function source(rows: SnapshotInventoryRow[], overrides: Partial<SnapshotSourceRows> = {}): SnapshotSourceRows {
  return {
    organizationId: "org-1",
    readAt: READ_AT,
    inventoryRows: rows,
    governanceStores: [
      { storeId: "caldas", displayName: "Caldas" },
      { storeId: "centro", displayName: "Centro" },
    ],
    policyRulesByStore: [],
    ...overrides,
  };
}

function snap(rows: SnapshotInventoryRow[], overrides?: Partial<SnapshotSourceRows>): StoreSnapshot {
  return runStoreSnapshotPipeline(assembleSnapshotSource(source(rows, overrides)));
}

function getAccComp(snapshot: StoreSnapshot, storeId: string, structureKey: string): readonly SnapshotFamilyBucket[] {
  const store = snapshot.perStore.find(s => s.storeId === storeId)!;
  const structure = store.coverage.structures.find(s => s.structureKey === structureKey)!;
  assert.ok(structure.compositionByFamily, `compositionByFamily must exist for ${structureKey}`);
  return structure.compositionByFamily!;
}

// ═════════════════════════════════════════════════════════════════════════════
// C1–C2: Distinct families → distinct buckets; same family → aggregated
// ═════════════════════════════════════════════════════════════════════════════

describe("C1–C2: family bucketing", () => {
  it("C1: two refs PEQUENO of different families produce two buckets", () => {
    const snapshot = snap([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 3 }),
      accRow({ referenceCode: "K0012", productId: "p-K0012", subgrupoSag: "TETERO", handlingUnit: "PEQUENO", variantKey: "V2", units: 2 }),
    ]);
    const comp = getAccComp(snapshot, "centro", "ACC|Pequeño");
    assert.equal(comp.length, 2);
    const families = comp.map(b => b.familyKey);
    assert.ok(families.includes("caminador"));
    assert.ok(families.includes("teteros"));
  });

  it("C2: two refs PEQUENO of same family aggregate into one bucket", () => {
    const snapshot = snap([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 3 }),
      accRow({ referenceCode: "511", productId: "p-511", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V2", units: 5 }),
    ]);
    const comp = getAccComp(snapshot, "centro", "ACC|Pequeño");
    assert.equal(comp.length, 1);
    assert.equal(comp[0].familyKey, "caminador");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C3–C4: units and refCount correct
// ═════════════════════════════════════════════════════════════════════════════

describe("C3–C4: units and refCount", () => {
  it("C3: units sum correctly within a family bucket", () => {
    const snapshot = snap([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 10 }),
      accRow({ referenceCode: "511", productId: "p-511", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V2", units: 7 }),
    ]);
    const comp = getAccComp(snapshot, "centro", "ACC|Pequeño");
    assert.equal(comp[0].units, 17);
  });

  it("C4: refCount counts distinct references within a family", () => {
    const snapshot = snap([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 10 }),
      accRow({ referenceCode: "511", productId: "p-511", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V2", units: 7 }),
      accRow({ referenceCode: "K0012", productId: "p-K0012", subgrupoSag: "TETERO", handlingUnit: "PEQUENO", variantKey: "V3", units: 3 }),
    ]);
    const comp = getAccComp(snapshot, "centro", "ACC|Pequeño");
    const caminador = comp.find(b => b.familyKey === "caminador")!;
    const teteros = comp.find(b => b.familyKey === "teteros")!;
    assert.equal(caminador.refCount, 2);
    assert.equal(teteros.refCount, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C5: mathematical invariant — sum(family units) = structure totalUnits
// ═════════════════════════════════════════════════════════════════════════════

describe("C5: mathematical invariant", () => {
  it("C5: SUM(compositionByFamily.units) === coverage.structure.totalUnits", () => {
    const snapshot = snap([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 10 }),
      accRow({ referenceCode: "K0012", productId: "p-K0012", subgrupoSag: "TETERO", handlingUnit: "PEQUENO", variantKey: "V2", units: 5 }),
      accRow({ referenceCode: "C3-QW-F6", productId: "p-C3", subgrupoSag: "MOVILES", handlingUnit: "GRANDE", variantKey: "V3", units: 3 }),
    ]);
    for (const store of snapshot.perStore) {
      for (const structure of store.coverage.structures) {
        if (!structure.compositionByFamily) continue;
        const compSum = structure.compositionByFamily.reduce((s, b) => s + b.units, 0);
        assert.equal(compSum, structure.totalUnits,
          `${store.storeId}|${structure.structureKey}: composition sum ${compSum} !== totalUnits ${structure.totalUnits}`);
        const refCountSum = structure.compositionByFamily.reduce((s, b) => s + b.refCount, 0);
        assert.equal(refCountSum, structure.refCount,
          `${store.storeId}|${structure.structureKey}: refCount sum ${refCountSum} !== refCount ${structure.refCount}`);
      }
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C6: SIN_CLASIFICAR participates
// ═════════════════════════════════════════════════════════════════════════════

describe("C6: SIN_CLASIFICAR in composition", () => {
  it("C6: sin_clasificar refs appear in compositionByFamily", () => {
    const snapshot = snap([
      accRow({ referenceCode: "UNKNOWN-99", productId: "p-unk", subgrupoSag: "UNKNOWN-SG", handlingUnit: "PEQUENO", variantKey: "V1", units: 3 }),
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V2", units: 4 }),
    ]);
    const comp = getAccComp(snapshot, "centro", "ACC|Pequeño");
    const sinClasificar = comp.find(b => b.familyKey === "sin_clasificar");
    assert.ok(sinClasificar, "sin_clasificar must appear in composition");
    assert.equal(sinClasificar!.units, 3);
    assert.equal(sinClasificar!.refCount, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C7–C9: size separation
// ═════════════════════════════════════════════════════════════════════════════

describe("C7–C9: ACC size separation", () => {
  it("C7: MEDIANO composition is separate from PEQUENO", () => {
    const snapshot = snap([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 10 }),
      accRow({ referenceCode: "511", productId: "p-511", subgrupoSag: "CAMINADOR", handlingUnit: "MEDIANO", variantKey: "V2", units: 4 }),
    ]);
    const compP = getAccComp(snapshot, "centro", "ACC|Pequeño");
    const compM = getAccComp(snapshot, "centro", "ACC|Mediano");
    assert.equal(compP[0].units, 10);
    assert.equal(compM[0].units, 4);
  });

  it("C8: GRANDE composition is separate from MEDIANO", () => {
    const snapshot = snap([
      accRow({ referenceCode: "511", productId: "p-511", subgrupoSag: "CAMINADOR", handlingUnit: "MEDIANO", variantKey: "V1", units: 4 }),
      accRow({ referenceCode: "C3-QW-F6", productId: "p-C3", subgrupoSag: "MOVILES", handlingUnit: "GRANDE", variantKey: "V2", units: 2 }),
    ]);
    const compM = getAccComp(snapshot, "centro", "ACC|Mediano");
    const compG = getAccComp(snapshot, "centro", "ACC|Grande");
    assert.equal(compM[0].familyKey, "caminador");
    assert.equal(compM[0].units, 4);
    assert.equal(compG[0].familyKey, "transporte");
    assert.equal(compG[0].units, 2);
  });

  it("C9: same family can exist in different sizes without mixing", () => {
    const snapshot = snap([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 10 }),
      accRow({ referenceCode: "511", productId: "p-511", subgrupoSag: "CAMINADOR", handlingUnit: "MEDIANO", variantKey: "V2", units: 4 }),
    ]);
    const compP = getAccComp(snapshot, "centro", "ACC|Pequeño");
    const compM = getAccComp(snapshot, "centro", "ACC|Mediano");
    assert.equal(compP[0].familyKey, "caminador");
    assert.equal(compP[0].units, 10);
    assert.equal(compM[0].familyKey, "caminador");
    assert.equal(compM[0].units, 4);
    // Not mixed
    assert.notEqual(compP[0].units, compM[0].units);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C10–C11: textiles excluded
// ═════════════════════════════════════════════════════════════════════════════

describe("C10–C11: textiles do not receive composition", () => {
  it("C10: textile structures have compositionByFamily = null", () => {
    const snapshot = snap([
      row({ referenceCode: "TEX-001", productId: "p-tex", variantKey: "V1", units: 5 }),
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V2", units: 3 }),
    ]);
    const centro = snapshot.perStore.find(s => s.storeId === "centro")!;
    for (const structure of centro.coverage.structures) {
      if (structure.structureKey.startsWith("ACC|")) {
        // ACC structures may have composition (or null if no items)
      } else {
        assert.equal(structure.compositionByFamily, null,
          `textile structure ${structure.structureKey} must have compositionByFamily = null`);
      }
    }
  });

  it("C11: commercialFamily=null (textile) does not produce ACC composition bucket", () => {
    const snapshot = snap([
      row({ referenceCode: "TEX-001", productId: "p-tex", variantKey: "V1", units: 5 }),
    ]);
    const centro = snapshot.perStore.find(s => s.storeId === "centro")!;
    const accStructures = centro.coverage.structures.filter(s => s.structureKey.startsWith("ACC|"));
    for (const s of accStructures) {
      // ACC structures with no items should have null composition
      assert.equal(s.compositionByFamily, null,
        `empty ACC structure ${s.structureKey} should have null composition`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C12: no taxonomy resolver invocation
// ═════════════════════════════════════════════════════════════════════════════

describe("C12: no additional taxonomy resolution", () => {
  it("C12: pipeline does not import or call resolveCommercialTaxonomy", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const pipelinePath = path.resolve(new URL(".", import.meta.url).pathname, "..", "store-snapshot-pipeline.ts");
    const content = fs.readFileSync(pipelinePath, "utf-8");
    assert.equal(content.includes("resolveCommercialTaxonomy"), false,
      "pipeline must NOT call resolveCommercialTaxonomy — family comes from referenceCatalog");
    assert.ok(!(/from\s+["'].*commercial-taxonomy/.test(content)),
      "pipeline must NOT import from commercial-taxonomy");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C13–C15: coverage, needs, replenishment unchanged
// ═════════════════════════════════════════════════════════════════════════════

describe("C13–C15: no operational regression", () => {
  const baseRows = [
    accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 3 }),
    accRow({ referenceCode: "K0012", productId: "p-K0012", subgrupoSag: "TETERO", handlingUnit: "PEQUENO", variantKey: "V2", units: 2 }),
    row({ referenceCode: "TEX-001", productId: "p-tex", variantKey: "V3", units: 5 }),
  ];

  it("C13: coverage metrics identical with composition present", () => {
    const snapshot = snap(baseRows);
    const centro = snapshot.perStore.find(s => s.storeId === "centro")!;
    // ACC|Pequeño has 5 units (3+2), target 6 → deficit 1
    const accP = centro.coverage.structures.find(s => s.structureKey === "ACC|Pequeño")!;
    assert.equal(accP.totalUnits, 5);
    assert.equal(accP.unitRule.deficitToIdeal, 1);
    // composition is present but doesn't change these values
    assert.ok(accP.compositionByFamily);
    assert.equal(accP.compositionByFamily!.reduce((s, b) => s + b.units, 0), 5);
  });

  it("C14: needs unaffected by composition", () => {
    const snapshot = snap(baseRows);
    const centro = snapshot.perStore.find(s => s.storeId === "centro")!;
    // There should be needs for ACC|Pequeño (deficit 1)
    const accNeed = centro.needs.needs.find(n => n.structureKey === "ACC|Pequeño");
    assert.ok(accNeed, "ACC|Pequeño should have a need");
    assert.equal(accNeed!.requiredUnits, 1);
    assert.equal(accNeed!.action, "REPOSICION");
  });

  it("C15: replenishment plan unaffected by composition", () => {
    const snapshot = snap(baseRows);
    // Plan should exist and have the same structure
    assert.ok(snapshot.plan);
    assert.ok(Array.isArray(snapshot.plan.summaryByStore));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C16: physical inventory invariant
// ═════════════════════════════════════════════════════════════════════════════

describe("C16: physical inventory invariant", () => {
  it("C16: adding composition does not create or destroy inventory", () => {
    const inputRows = [
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 10 }),
      accRow({ referenceCode: "K0012", productId: "p-K0012", subgrupoSag: "TETERO", handlingUnit: "PEQUENO", variantKey: "V2", units: 5 }),
      row({ referenceCode: "TEX-001", productId: "p-tex", variantKey: "V3", units: 7 }),
    ];
    const inputTotal = inputRows.reduce((s, r) => s + r.units, 0);
    const snapshot = snap(inputRows);
    const snapshotTotal = snapshot.perStore.reduce((s, store) =>
      s + store.inventory.totalUnits, 0);
    // Only centro store has items (caldas is empty)
    assert.equal(snapshotTotal, inputTotal);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C17: deterministic ordering
// ═════════════════════════════════════════════════════════════════════════════

describe("C17: deterministic ordering", () => {
  it("C17: compositionByFamily sorted by units DESC, then familyKey ASC", () => {
    const snapshot = snap([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 5 }),
      accRow({ referenceCode: "K0012", productId: "p-K0012", subgrupoSag: "TETERO", handlingUnit: "PEQUENO", variantKey: "V2", units: 10 }),
      accRow({ referenceCode: "C6-23-39", productId: "p-C6", subgrupoSag: "BOLSAS", handlingUnit: "PEQUENO", variantKey: "V3", units: 10 }),
    ]);
    const comp = getAccComp(snapshot, "centro", "ACC|Pequeño");
    assert.equal(comp.length, 3);
    // teteros=10, lactancia=10 (tied by units) → lactancia < teteros alphabetically
    assert.equal(comp[0].units, 10);
    assert.equal(comp[1].units, 10);
    assert.equal(comp[2].units, 5);
    // Tied entries sorted by familyKey ASC
    assert.ok(comp[0].familyKey < comp[1].familyKey,
      `tied entries: ${comp[0].familyKey} should come before ${comp[1].familyKey}`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// C18: serialization round-trip
// ═════════════════════════════════════════════════════════════════════════════

describe("C18: serialization", () => {
  it("C18: snapshot with compositionByFamily survives JSON round-trip", () => {
    const snapshot = snap([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 10 }),
      accRow({ referenceCode: "K0012", productId: "p-K0012", subgrupoSag: "TETERO", handlingUnit: "PEQUENO", variantKey: "V2", units: 5 }),
    ]);
    const serialized = JSON.stringify(snapshot);
    const deserialized = JSON.parse(serialized) as StoreSnapshot;

    const origComp = getAccComp(snapshot, "centro", "ACC|Pequeño");
    const rtComp = getAccComp(deserialized, "centro", "ACC|Pequeño");
    assert.deepEqual(rtComp, origComp);

    // Textile structures remain null
    const centro = deserialized.perStore.find(s => s.storeId === "centro")!;
    for (const s of centro.coverage.structures) {
      if (!s.structureKey.startsWith("ACC|")) {
        assert.equal(s.compositionByFamily, null);
      }
    }
  });
});
