/**
 * lib/comercial/tiendas/__tests__/store-acc-coverage-law.test.ts
 *
 * AGENTIK-STORES-ACCESSORIES-NEEDS-01 — F3: Certification of ACC Coverage Law.
 *
 * LAW: ACC coverage is defined by sizeClass (PEQUENO/MEDIANO/GRANDE).
 * commercialFamily is a descriptive/analytical dimension — NOT a coverage unit.
 *
 * Derrotero diagnosis: SUFICIENTE PARA LA POLÍTICA ACTUAL.
 *
 * Tests T1–T12 + data availability certification.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-acc-coverage-law.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  assembleSnapshotSource,
  buildStructureLookup,
  type SnapshotSourceRows,
  type SnapshotInventoryRow,
} from "../store-snapshot-assembler";
import { runStoreSnapshotPipeline } from "../store-snapshot-pipeline";
import { CASTILLITOS_ACCESSORY_COVERAGE } from "../store-policy-pack-config";

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

// ═════════════════════════════════════════════════════════════════════════════
// T1–T3: ACC targets are by sizeClass, unchanged
// ═════════════════════════════════════════════════════════════════════════════

describe("F3 T1–T3: ACC structure targets by sizeClass", () => {
  it("T1: ACC|Pequeño target = 6", () => {
    assert.equal(CASTILLITOS_ACCESSORY_COVERAGE.idealBySize.small, 6);
    const accSmall = lookup.accBySize.get("small");
    assert.ok(accSmall, "ACC small structure must exist in lookup");
    assert.equal(accSmall!.structureKey, "ACC|Pequeño");
  });

  it("T2: ACC|Mediano target = 4", () => {
    assert.equal(CASTILLITOS_ACCESSORY_COVERAGE.idealBySize.medium, 4);
    const accMedium = lookup.accBySize.get("medium");
    assert.ok(accMedium, "ACC medium structure must exist in lookup");
    assert.equal(accMedium!.structureKey, "ACC|Mediano");
  });

  it("T3: ACC|Grande target = 1", () => {
    assert.equal(CASTILLITOS_ACCESSORY_COVERAGE.idealBySize.large, 1);
    const accLarge = lookup.accBySize.get("large");
    assert.ok(accLarge, "ACC large structure must exist in lookup");
    assert.equal(accLarge!.structureKey, "ACC|Grande");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T4–T6: commercialFamily does NOT affect coverage identity
// ═════════════════════════════════════════════════════════════════════════════

describe("F3 T4–T6: commercialFamily is analytical, NOT coverage", () => {
  it("T4: two refs of different commercialFamily but same HU resolve to SAME ACC structure", () => {
    // CAMINADOR (family=caminador) + TETERO (family=teteros), both PEQUENO
    const out = assembleSnapshotSource(source([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1" }),
      accRow({ referenceCode: "K0012", productId: "p-K0012", subgrupoSag: "TETERO", handlingUnit: "PEQUENO", variantKey: "V2" }),
    ]));
    const centro = out.stores.find(s => s.storeId === "centro")!;
    const item510 = centro.items.find(i => i.referenceCode === "510")!;
    const itemK0012 = centro.items.find(i => i.referenceCode === "K0012")!;
    assert.equal(item510.structureKey, "ACC|Pequeño");
    assert.equal(itemK0012.structureKey, "ACC|Pequeño");
    // Verify different families
    const cat510 = out.referenceCatalog.find(c => c.referenceCode === "510")!;
    const catK0012 = out.referenceCatalog.find(c => c.referenceCode === "K0012")!;
    assert.equal(cat510.commercialFamily, "caminador");
    assert.equal(catK0012.commercialFamily, "teteros");
    // Same structure despite different families
    assert.equal(item510.structureKey, itemK0012.structureKey);
  });

  it("T5: two refs of different families PEQUENO sum their units in ACC|Pequeño", () => {
    const out = assembleSnapshotSource(source([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 3 }),
      accRow({ referenceCode: "K0012", productId: "p-K0012", subgrupoSag: "TETERO", handlingUnit: "PEQUENO", variantKey: "V2", units: 5 }),
    ]));
    // Run pipeline to get coverage evaluation
    const snapshot = runStoreSnapshotPipeline(out);
    const centro = snapshot.perStore.find(s => s.storeId === "centro")!;
    const accPequeno = centro.coverage.structures.find(s => s.structureKey === "ACC|Pequeño")!;
    assert.equal(accPequeno.totalUnits, 8, "3 + 5 = 8 units from two different families");
    assert.equal(accPequeno.refCount, 2, "two distinct references");
  });

  it("T6: excess in one family counts for the sizeClass total (intentional behavior)", () => {
    // target PEQUENO = 6. Put 8 units of JUGUETERIA, 0 of ALIMENTACION → covered
    const out = assembleSnapshotSource(source([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 8 }),
    ]));
    const snapshot = runStoreSnapshotPipeline(out);
    const centro = snapshot.perStore.find(s => s.storeId === "centro")!;
    const accPequeno = centro.coverage.structures.find(s => s.structureKey === "ACC|Pequeño")!;
    // target = 6 (min=ideal=6), onHand = 8 → no deficit
    assert.equal(accPequeno.unitRule.deficitToIdeal, 0);
    assert.equal(accPequeno.quantitativeStatus, "SALUDABLE");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T7: commercialFamily available from referenceCatalog for analysis
// ═════════════════════════════════════════════════════════════════════════════

describe("F3 T7: commercialFamily accessible for analysis", () => {
  it("T7: commercialFamily is present and correct in referenceCatalog entries", () => {
    const out = assembleSnapshotSource(source([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1" }),
      accRow({ referenceCode: "K0012", productId: "p-K0012", subgrupoSag: "TETERO", handlingUnit: "PEQUENO", variantKey: "V2" }),
      accRow({ referenceCode: "C3-QW-F6", productId: "p-C3", subgrupoSag: "MOVILES", handlingUnit: "GRANDE", variantKey: "V3" }),
    ]));
    const snapshot = runStoreSnapshotPipeline(out);
    // commercialFamily survives into StoreSnapshot.referenceCatalog
    const cat510 = snapshot.referenceCatalog.find(c => c.referenceCode === "510")!;
    const catK0012 = snapshot.referenceCatalog.find(c => c.referenceCode === "K0012")!;
    const catC3 = snapshot.referenceCatalog.find(c => c.referenceCode === "C3-QW-F6")!;
    assert.equal(cat510.commercialFamily, "caminador");
    assert.equal(catK0012.commercialFamily, "teteros");
    assert.equal(catC3.commercialFamily, "transporte");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T8–T9: HU determines structure, commercialFamily does not
// ═════════════════════════════════════════════════════════════════════════════

describe("F3 T8–T9: HU determines ACC structure, commercialFamily does not", () => {
  it("T8: two refs with same HU but different commercialFamily → same structureKey, same coverage", () => {
    // Two separate assemblies, same units, different families → identical coverage
    const makeSnapshot = (ref: string, productId: string, subgrupo: string) => {
      const out = assembleSnapshotSource(source([
        accRow({ referenceCode: ref, productId, subgrupoSag: subgrupo, handlingUnit: "PEQUENO", variantKey: "V1", units: 4 }),
      ]));
      return runStoreSnapshotPipeline(out);
    };
    const snap1 = makeSnapshot("510", "p-510", "CAMINADOR");    // family=caminador
    const snap2 = makeSnapshot("K0012", "p-K0012", "TETERO");   // family=teteros

    const cov1 = snap1.perStore.find(s => s.storeId === "centro")!.coverage.structures.find(s => s.structureKey === "ACC|Pequeño")!;
    const cov2 = snap2.perStore.find(s => s.storeId === "centro")!.coverage.structures.find(s => s.structureKey === "ACC|Pequeño")!;

    assert.equal(cov1.totalUnits, cov2.totalUnits);
    assert.equal(cov1.unitRule.deficitToIdeal, cov2.unitRule.deficitToIdeal);
    assert.equal(cov1.quantitativeStatus, cov2.quantitativeStatus);
  });

  it("T9: same product type with HU PEQUENO vs MEDIANO → different ACC structures", () => {
    const out = assembleSnapshotSource(source([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1" }),
      accRow({ referenceCode: "511", productId: "p-511", subgrupoSag: "CAMINADOR", handlingUnit: "MEDIANO", variantKey: "V2" }),
    ]));
    const centro = out.stores.find(s => s.storeId === "centro")!;
    const item510 = centro.items.find(i => i.referenceCode === "510")!;
    const item511 = centro.items.find(i => i.referenceCode === "511")!;
    assert.equal(item510.structureKey, "ACC|Pequeño");
    assert.equal(item511.structureKey, "ACC|Mediano");
    assert.notEqual(item510.structureKey, item511.structureKey);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T10: Textiles unaffected
// ═════════════════════════════════════════════════════════════════════════════

describe("F3 T10: textiles unaffected", () => {
  it("T10: textile refs have commercialFamily=null, resolve to textile structures, not ACC", () => {
    const out = assembleSnapshotSource(source([
      row({ referenceCode: "TEX-001", productId: "p-tex", subgrupoSag: CS_SUBGRUPO, productLine: "1", variantKey: "V1" }),
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V2" }),
    ]));
    const catTex = out.referenceCatalog.find(c => c.referenceCode === "TEX-001")!;
    const catAcc = out.referenceCatalog.find(c => c.referenceCode === "510")!;
    assert.equal(catTex.commercialFamily, null, "textile has no commercialFamily");
    assert.equal(catAcc.commercialFamily, "caminador", "ACC has commercialFamily");
    // Structures are different
    const centro = out.stores.find(s => s.storeId === "centro")!;
    const texItem = centro.items.find(i => i.referenceCode === "TEX-001")!;
    const accItem = centro.items.find(i => i.referenceCode === "510")!;
    assert.ok(texItem.structureKey!.startsWith("CS|"), "textile resolves to CS structure");
    assert.ok(accItem.structureKey!.startsWith("ACC|"), "ACC resolves to ACC structure");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T11: Physical inventory invariant
// ═════════════════════════════════════════════════════════════════════════════

describe("F3 T11: physical inventory invariant", () => {
  it("T11: Σ input units = Σ output units — taxonomy does not create or destroy inventory", () => {
    const inputRows = [
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 10 }),
      accRow({ referenceCode: "K0012", productId: "p-K0012", subgrupoSag: "TETERO", handlingUnit: "PEQUENO", variantKey: "V2", units: 5 }),
      accRow({ referenceCode: "C3-QW-F6", productId: "p-C3", subgrupoSag: "MOVILES", handlingUnit: "GRANDE", variantKey: "V3", units: 3 }),
      row({ referenceCode: "TEX-001", productId: "p-tex", variantKey: "V4", units: 7 }),
    ];
    const inputTotal = inputRows.reduce((s, r) => s + r.units, 0);
    const out = assembleSnapshotSource(source(inputRows));
    const outputTotal = out.stores.reduce((s, store) =>
      s + store.items.reduce((t, item) => t + item.units, 0), 0);
    assert.equal(outputTotal, inputTotal, `input ${inputTotal} must equal output ${outputTotal}`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T12: Single taxonomy invocation boundary (reuse F2.1 guardian)
// ═════════════════════════════════════════════════════════════════════════════

describe("F3 T12: single taxonomy invocation boundary", () => {
  it("T12: resolveCommercialTaxonomy is called only in store-snapshot-assembler.ts (FS guardian)", async () => {
    // Reuse the F2.1 T15 guardian pattern
    const fs = await import("node:fs");
    const path = await import("node:path");
    const tiendasDir = path.resolve(new URL(".", import.meta.url).pathname, "..");
    const files = fs.readdirSync(tiendasDir).filter((f: string) => f.endsWith(".ts") && !f.includes("__tests__"));

    const violations: string[] = [];
    for (const file of files) {
      if (file === "store-snapshot-assembler.ts") continue; // approved boundary
      const content = fs.readFileSync(path.join(tiendasDir, file), "utf-8");
      if (content.includes("resolveCommercialTaxonomy")) {
        violations.push(`${file} calls resolveCommercialTaxonomy — must only be in assembler`);
      }
    }

    assert.deepEqual(violations, [], "Only store-snapshot-assembler.ts may invoke the taxonomy resolver");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SIN_CLASIFICAR: participates in sizeClass total, no own target/structure
// ═════════════════════════════════════════════════════════════════════════════

describe("F3 SIN_CLASIFICAR: participates in physical total, no own structure", () => {
  it("sin_clasificar ref with valid HU sums to its ACC|size structure", () => {
    const out = assembleSnapshotSource(source([
      accRow({ referenceCode: "UNKNOWN-REF-99", productId: "p-unk", subgrupoSag: "UNKNOWN-SG", handlingUnit: "PEQUENO", variantKey: "V1", units: 2 }),
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V2", units: 4 }),
    ]));

    // Verify sin_clasificar family
    const catUnk = out.referenceCatalog.find(c => c.referenceCode === "UNKNOWN-REF-99")!;
    assert.equal(catUnk.commercialFamily, "sin_clasificar");

    // Both resolve to ACC|Pequeño
    const centro = out.stores.find(s => s.storeId === "centro")!;
    const unkItem = centro.items.find(i => i.referenceCode === "UNKNOWN-REF-99")!;
    const accItem = centro.items.find(i => i.referenceCode === "510")!;
    assert.equal(unkItem.structureKey, "ACC|Pequeño");
    assert.equal(accItem.structureKey, "ACC|Pequeño");

    // Pipeline: units sum together
    const snapshot = runStoreSnapshotPipeline(out);
    const centroSnap = snapshot.perStore.find(s => s.storeId === "centro")!;
    const accPequeno = centroSnap.coverage.structures.find(s => s.structureKey === "ACC|Pequeño")!;
    assert.equal(accPequeno.totalUnits, 6, "sin_clasificar 2 + caminador 4 = 6");
    assert.equal(accPequeno.refCount, 2);
  });

  it("sin_clasificar does NOT create its own structure", () => {
    const accStructures = lookup.expected.filter(e => e.structureKey.startsWith("ACC|"));
    assert.equal(accStructures.length, 3, "only 3 ACC structures: Pequeño, Mediano, Grande");
    const sinClasificarStructure = accStructures.find(s => s.structureKey.includes("sin_clasificar"));
    assert.equal(sinClasificarStructure, undefined, "no sin_clasificar ACC structure exists");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Data Availability: composition derivable from AssembledStoreData
// ═════════════════════════════════════════════════════════════════════════════

describe("F3 Data Availability: composition by commercialFamily derivable", () => {
  it("composition by family within ACC|Pequeño can be derived from assembled data", () => {
    const out = assembleSnapshotSource(source([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 10 }),
      accRow({ referenceCode: "K0012", productId: "p-K0012", subgrupoSag: "TETERO", handlingUnit: "PEQUENO", variantKey: "V2", units: 5 }),
      accRow({ referenceCode: "C3-QW-F6", productId: "p-C3", subgrupoSag: "MOVILES", handlingUnit: "GRANDE", variantKey: "V3", units: 3 }),
    ]));

    // Build composition using data available in AssembledStoreData
    // (referenceCatalog + stores[].items — both in assembled output)
    const catalogByRef = new Map(out.referenceCatalog.map(c => [c.referenceId, c]));
    const centro = out.stores.find(s => s.storeId === "centro")!;

    // Group items by structureKey → commercialFamily → sum units
    const composition = new Map<string, Map<string, number>>();
    for (const item of centro.items) {
      if (!item.structureKey?.startsWith("ACC|")) continue;
      const cat = catalogByRef.get(item.referenceId);
      const family = cat?.commercialFamily ?? "sin_clasificar";
      if (!composition.has(item.structureKey)) composition.set(item.structureKey, new Map());
      const familyMap = composition.get(item.structureKey)!;
      familyMap.set(family, (familyMap.get(family) ?? 0) + item.units);
    }

    // Verify ACC|Pequeño composition
    const pequenoComp = composition.get("ACC|Pequeño")!;
    assert.ok(pequenoComp, "ACC|Pequeño composition should exist");
    assert.equal(pequenoComp.get("caminador"), 10);
    assert.equal(pequenoComp.get("teteros"), 5);
    assert.equal(pequenoComp.has("transporte"), false, "transporte is GRANDE, not PEQUENO");

    // Verify ACC|Grande composition
    const grandeComp = composition.get("ACC|Grande")!;
    assert.ok(grandeComp, "ACC|Grande composition should exist");
    assert.equal(grandeComp.get("transporte"), 3);
  });

  it("StoreSnapshot.referenceCatalog preserves commercialFamily + sizeClass for analysis", () => {
    const out = assembleSnapshotSource(source([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 10 }),
      accRow({ referenceCode: "K0012", productId: "p-K0012", subgrupoSag: "TETERO", handlingUnit: "PEQUENO", variantKey: "V2", units: 5 }),
    ]));
    const snapshot = runStoreSnapshotPipeline(out);

    // referenceCatalog in StoreSnapshot has commercialFamily and sizeClass
    const cat510 = snapshot.referenceCatalog.find(c => c.referenceCode === "510")!;
    assert.equal(cat510.commercialFamily, "caminador");
    assert.equal(cat510.sizeClass, "small");
    const catK0012 = snapshot.referenceCatalog.find(c => c.referenceCode === "K0012")!;
    assert.equal(catK0012.commercialFamily, "teteros");
    assert.equal(catK0012.sizeClass, "small");
  });

  it("StoreSnapshot does NOT contain per-store per-ref unit detail (future enrichment needed)", () => {
    // This test documents the gap: StoreSnapshot.perStore has coverage aggregates
    // but NOT individual reference breakdowns per store. A future composition UX
    // sprint would need to add this data to the pipeline output.
    const out = assembleSnapshotSource(source([
      accRow({ referenceCode: "510", productId: "p-510", subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", variantKey: "V1", units: 10 }),
    ]));
    const snapshot = runStoreSnapshotPipeline(out);
    const centro = snapshot.perStore.find(s => s.storeId === "centro")!;

    // perStore has inventory totals but NOT item-level detail
    assert.ok(centro.inventory.totalUnits >= 0, "totalUnits exists");
    assert.ok(centro.inventory.referenceCount >= 0, "referenceCount exists");
    // No 'items' property on SnapshotPerStore
    assert.equal("items" in centro, false, "StoreSnapshot.perStore does NOT have items array");
  });
});
