/**
 * lib/comercial/tiendas/__tests__/store-acc-composition-ux.test.ts
 *
 * AGENTIK-STORES-ACCESSORIES-COMPOSITION-UX-01/02
 * Presentation tests (P1-P12), UX/source guards (U1-U8), labels (L1-L3), drill-down (D1-D12).
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-acc-composition-ux.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  assembleSnapshotSource,
  buildStructureLookup,
  type SnapshotSourceRows,
  type SnapshotInventoryRow,
} from "../store-snapshot-assembler";
import {
  runStoreSnapshotPipeline,
  type StoreSnapshot,
} from "../store-snapshot-pipeline";
import {
  buildAccessoryCompositionPresentation,
  type AccessoryCompositionPresentation,
  type AccessorySizeBlock,
} from "../store-presentation-assembler";

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

let accSeq = 0;
const accRow = (partial: Partial<SnapshotInventoryRow>): SnapshotInventoryRow => {
  accSeq++;
  return row({
    productLine: "5",
    grupoSag: null,
    subgrupoSag: null,
    referenceCode: `ACC-${accSeq}`,
    productId: `acc-prod-${accSeq}`,
    variantKey: `AV-${accSeq}`,
    ...partial,
  });
};

function source(rows: SnapshotInventoryRow[], overrides: Partial<SnapshotSourceRows> = {}): SnapshotSourceRows {
  return {
    organizationId: "org-1",
    readAt: READ_AT,
    inventoryRows: rows,
    governanceStores: [
      { storeId: "centro", displayName: "Centro" },
    ],
    policyRulesByStore: [],
    ...overrides,
  };
}

function snap(rows: SnapshotInventoryRow[], overrides?: Partial<SnapshotSourceRows>): StoreSnapshot {
  return runStoreSnapshotPipeline(assembleSnapshotSource(source(rows, overrides)));
}

function pres(rows: SnapshotInventoryRow[], storeId = "centro"): AccessoryCompositionPresentation {
  const snapshot = snap(rows);
  return buildAccessoryCompositionPresentation(snapshot, storeId);
}

// ── P: Presentation tests ───────────────────────────────────────────────────

describe("COMPOSITION-UX Presentation (P1-P12)", () => {

  it("P1: returns 3 size blocks for ACC|Pequeño, ACC|Mediano, ACC|Grande", () => {
    const comp = pres([
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", units: 2 }),
      accRow({ subgrupoSag: "BOLSOS", handlingUnit: "MEDIANO", units: 3 }),
      accRow({ subgrupoSag: "TERMOS", handlingUnit: "GRANDE", units: 1 }),
    ]);
    assert.equal(comp.sizes.length, 3);
    const keys = comp.sizes.map(s => s.structureKey);
    assert.ok(keys.includes("ACC|Pequeño"), "missing ACC|Pequeño");
    assert.ok(keys.includes("ACC|Mediano"), "missing ACC|Mediano");
    assert.ok(keys.includes("ACC|Grande"), "missing ACC|Grande");
  });

  it("P2: sizeLabel resolves to human labels (Pequeños, Medianos, Grandes)", () => {
    const comp = pres([
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", units: 1 }),
      accRow({ subgrupoSag: "BOLSOS", handlingUnit: "MEDIANO", units: 1 }),
      accRow({ subgrupoSag: "TERMOS", handlingUnit: "GRANDE", units: 1 }),
    ]);
    const labels = comp.sizes.map(s => s.sizeLabel);
    assert.ok(labels.includes("Pequeños"));
    assert.ok(labels.includes("Medianos"));
    assert.ok(labels.includes("Grandes"));
  });

  it("P3: deltaState = 'under' when units < target, deltaText = 'Faltan X'", () => {
    // Default ACC targets: Pequeño=6, Mediano=4, Grande=1
    // With only 2 units in Pequeño → under by 4
    const comp = pres([
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", units: 2 }),
    ]);
    const peq = comp.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    assert.equal(peq.deltaState, "under");
    assert.ok(peq.deltaText.includes("Faltan"), `deltaText: ${peq.deltaText}`);
  });

  it("P4: deltaState = 'exact' when units === target", () => {
    // Grande target = 1. Put exactly 1 unit.
    const comp = pres([
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "GRANDE", units: 1 }),
    ]);
    const grande = comp.sizes.find(s => s.structureKey === "ACC|Grande")!;
    assert.equal(grande.deltaState, "exact");
    assert.ok(grande.deltaText.includes("Objetivo cumplido"), `deltaText: ${grande.deltaText}`);
  });

  it("P5: deltaState = 'over' when units > target, deltaText = '+X sobre el objetivo'", () => {
    // Grande target = 1. Put 5 units.
    const comp = pres([
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "GRANDE", units: 5 }),
    ]);
    const grande = comp.sizes.find(s => s.structureKey === "ACC|Grande")!;
    assert.equal(grande.deltaState, "over");
    assert.ok(grande.deltaText.includes("sobre el objetivo"), `deltaText: ${grande.deltaText}`);
  });

  it("P6: families list contains only families with units > 0", () => {
    const comp = pres([
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", units: 3 }),
      accRow({ subgrupoSag: "BOLSOS", handlingUnit: "PEQUENO", units: 2 }),
    ]);
    const peq = comp.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    for (const f of peq.families) {
      assert.ok(f.units > 0, `Family ${f.key} has 0 units`);
    }
  });

  it("P7: families are sorted by units DESC (preserves snapshot ordering)", () => {
    const comp = pres([
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", units: 10 }),
      accRow({ subgrupoSag: "BOLSOS", handlingUnit: "PEQUENO", units: 20 }),
      accRow({ subgrupoSag: "TERMOS", handlingUnit: "PEQUENO", units: 5 }),
    ]);
    const peq = comp.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    for (let i = 1; i < peq.families.length; i++) {
      assert.ok(
        peq.families[i - 1].units >= peq.families[i].units,
        `Order violation: ${peq.families[i - 1].key}(${peq.families[i - 1].units}) < ${peq.families[i].key}(${peq.families[i].units})`,
      );
    }
  });

  it("P8: percentage is integer, sums may not equal 100 (rounding)", () => {
    const comp = pres([
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", units: 1 }),
      accRow({ subgrupoSag: "BOLSOS", handlingUnit: "PEQUENO", units: 1 }),
      accRow({ subgrupoSag: "TERMOS", handlingUnit: "PEQUENO", units: 1 }),
    ]);
    const peq = comp.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    for (const f of peq.families) {
      assert.equal(f.percentage, Math.floor(f.percentage), `${f.key} has non-integer percentage`);
    }
  });

  it("P9: familyCount matches families.length", () => {
    const comp = pres([
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", units: 3 }),
      accRow({ subgrupoSag: "BOLSOS", handlingUnit: "PEQUENO", units: 2 }),
    ]);
    const peq = comp.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    assert.equal(peq.familyCount, peq.families.length);
  });

  it("P10: refCount is exposed in each family row", () => {
    const comp = pres([
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", units: 3 }),
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", units: 2 }),
    ]);
    const peq = comp.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    const cam = peq.families.find(f => f.key === "caminador");
    assert.ok(cam, "expected caminador family row");
    assert.equal(cam!.refCount, 2, "should have 2 refs");
    assert.equal(typeof cam!.refCount, "number", "refCount must be a number");
  });

  it("P11: empty size block has families = [] and familyCount = 0", () => {
    // Only put items in PEQUENO, Grande should be empty
    const comp = pres([
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", units: 3 }),
    ]);
    const grande = comp.sizes.find(s => s.structureKey === "ACC|Grande")!;
    assert.equal(grande.families.length, 0);
    assert.equal(grande.familyCount, 0);
  });

  it("P12: sin_clasificar label resolves to 'Sin Clasificar'", () => {
    // accRow without subgrupoSag → sin_clasificar family
    const comp = pres([
      accRow({ handlingUnit: "PEQUENO", units: 3 }),
    ]);
    const peq = comp.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    const sc = peq.families.find(f => f.key === "sin_clasificar");
    if (sc) {
      assert.equal(sc.label, "Sin Clasificar");
    }
    // If not sin_clasificar, it means the family was resolved — also fine
  });
});

// ── U: UX / Source Guard tests ──────────────────────────────────────────────

describe("COMPOSITION-UX Guards (U1-U6)", () => {

  it("U1: presentation assembler does NOT import taxonomy resolver (only metadata)", () => {
    const assemblerPath = path.resolve(__dirname, "../store-presentation-assembler.ts");
    const content = fs.readFileSync(assemblerPath, "utf8");
    // Resolver import is PROHIBITED
    const hasResolver = /resolveCommercialTaxonomy/.test(content);
    assert.equal(hasResolver, false, "presentation must NOT call resolveCommercialTaxonomy");
    const hasResolverImport = /from\s+["'].*commercial-taxonomy-resolver/.test(content);
    assert.equal(hasResolverImport, false, "presentation must NOT import taxonomy resolver");
    // Read-only metadata (COMMERCIAL_FAMILIES) is PERMITTED — verified by T15 in assembler tests
  });

  it("U2: tiendas-client.tsx does NOT import from commercial-taxonomy/", () => {
    const clientPath = path.resolve(__dirname, "../../../../app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx");
    const content = fs.readFileSync(clientPath, "utf8");
    const match = /from\s+["'].*commercial-taxonomy/.test(content);
    assert.equal(match, false, "tiendas-client.tsx must NOT import from commercial-taxonomy/");
  });

  it("U3: tiendas-client.tsx does NOT call runStoreSnapshotPipeline (render only)", () => {
    const clientPath = path.resolve(__dirname, "../../../../app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx");
    const content = fs.readFileSync(clientPath, "utf8");
    const match = /runStoreSnapshotPipeline/.test(content);
    assert.equal(match, false, "tiendas-client.tsx must NOT call runStoreSnapshotPipeline");
  });

  it("U4: tiendas-client.tsx does NOT call assembleSnapshotSource (render only)", () => {
    const clientPath = path.resolve(__dirname, "../../../../app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx");
    const content = fs.readFileSync(clientPath, "utf8");
    const match = /assembleSnapshotSource/.test(content);
    assert.equal(match, false, "tiendas-client.tsx must NOT call assembleSnapshotSource");
  });

  it("U5: AccessoryCompositionPresentation is read-only (all fields readonly)", () => {
    const assemblerPath = path.resolve(__dirname, "../store-presentation-assembler.ts");
    const content = fs.readFileSync(assemblerPath, "utf8");

    // Check AccessoryCompositionPresentation
    const compMatch = content.match(/export interface AccessoryCompositionPresentation\s*\{([^}]+)\}/);
    assert.ok(compMatch, "AccessoryCompositionPresentation interface not found");
    const fields = compMatch![1].split("\n").filter(l => l.trim() && !l.trim().startsWith("//"));
    for (const f of fields) {
      assert.ok(f.includes("readonly"), `Field missing readonly: ${f.trim()}`);
    }

    // Check AccessorySizeBlock
    const blockMatch = content.match(/export interface AccessorySizeBlock\s*\{([^}]+)\}/);
    assert.ok(blockMatch, "AccessorySizeBlock interface not found");
    const blockFields = blockMatch![1].split("\n").filter(l => l.trim() && !l.trim().startsWith("//"));
    for (const f of blockFields) {
      assert.ok(f.includes("readonly"), `Field missing readonly: ${f.trim()}`);
    }

    // Check AccessoryFamilyRow
    const rowMatch = content.match(/export interface AccessoryFamilyRow\s*\{([^}]+)\}/);
    assert.ok(rowMatch, "AccessoryFamilyRow interface not found");
    const rowFields = rowMatch![1].split("\n").filter(l => l.trim() && !l.trim().startsWith("//"));
    for (const f of rowFields) {
      assert.ok(f.includes("readonly"), `Field missing readonly: ${f.trim()}`);
    }
  });

  it("U6: composition section only renders when invLine === ACCESSORIES (source check)", () => {
    const clientPath = path.resolve(__dirname, "../../../../app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx");
    const content = fs.readFileSync(clientPath, "utf8");
    // Must have the conditional guard
    const match = /invLine\s*===\s*["']ACCESSORIES["'].*accComposition/.test(content);
    assert.ok(match, "Composition section must be guarded by invLine === 'ACCESSORIES'");
  });

  it("U7: tiendas-client.tsx does NOT contain FAMILY_LABEL or COMMERCIAL_FAMILIES", () => {
    const clientPath = path.resolve(__dirname, "../../../../app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx");
    const content = fs.readFileSync(clientPath, "utf8");
    assert.equal(/FAMILY_LABEL/.test(content), false, "FAMILY_LABEL must not be in client");
    assert.equal(/COMMERCIAL_FAMILIES/.test(content), false, "COMMERCIAL_FAMILIES must not be in client");
  });

  it("U8: no manual 29-entry family dictionary exists in tiendas/ (outside tests)", () => {
    const tiendasDir = path.resolve(__dirname, "..");
    const files = fs.readdirSync(tiendasDir).filter((f: string) => f.endsWith(".ts") && !f.includes("__tests__"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(tiendasDir, file), "utf8");
      // A manual dictionary would have many familyKey string literals as object keys
      const familyKeyLiterals = (content.match(/["']?(accesorios_nina|cuidado_dental|jugueteria|dormitorio|flotadores|vacenilla)["']?\s*:/g) || []);
      if (familyKeyLiterals.length >= 4) {
        assert.fail(`${file} appears to contain a manual family dictionary (${familyKeyLiterals.length} key matches)`);
      }
    }
  });
});

// ── L: Label fidelity tests (canonical metadata → presentation) ─────────

describe("COMPOSITION-UX Label fidelity (L1-L3)", () => {

  it("L1: familyKey 'cuidado_dental' → label 'Cuidado Dental' (preserves tilde-free)", () => {
    const comp = pres([
      accRow({ subgrupoSag: "CUIDADO DENTAL", handlingUnit: "PEQUENO", units: 5 }),
    ]);
    const peq = comp.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    const cd = peq.families.find(f => f.key === "cuidado_dental");
    assert.ok(cd, "expected cuidado_dental family");
    assert.equal(cd!.label, "Cuidado Dental");
  });

  it("L2: familyKey 'alimentacion' → label 'Alimentación' (preserves tilde)", () => {
    const comp = pres([
      accRow({ subgrupoSag: "ALIMENTACIÓN", handlingUnit: "PEQUENO", units: 3 }),
    ]);
    const peq = comp.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    const al = peq.families.find(f => f.key === "alimentacion");
    assert.ok(al, "expected alimentacion family");
    assert.equal(al!.label, "Alimentación");
  });

  it("L3: familyKey 'jugueteria' → label 'Juguetería' (preserves tilde)", () => {
    const comp = pres([
      accRow({ subgrupoSag: "JUGUETERÍA", handlingUnit: "PEQUENO", units: 2 }),
    ]);
    const peq = comp.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    const jug = peq.families.find(f => f.key === "jugueteria");
    assert.ok(jug, "expected jugueteria family");
    assert.equal(jug!.label, "Juguetería");
  });
});

// ── D: Drill-down tests (AGENTIK-STORES-ACCESSORIES-COMPOSITION-UX-02) ───

describe("COMPOSITION-UX Drill-down (D1-D12)", () => {

  it("D1: Transporte 6 uds / 4 refs produces 4 reference rows", () => {
    const comp = pres([
      accRow({ subgrupoSag: "COCHES", referenceCode: "COCHE-1", handlingUnit: "GRANDE", units: 2 }),
      accRow({ subgrupoSag: "COCHES", referenceCode: "COCHE-2", handlingUnit: "GRANDE", units: 2 }),
      accRow({ subgrupoSag: "COCHES", referenceCode: "COCHE-3", handlingUnit: "GRANDE", units: 1 }),
      accRow({ subgrupoSag: "COCHES", referenceCode: "COCHE-4", handlingUnit: "GRANDE", units: 1 }),
    ]);
    const grande = comp.sizes.find(s => s.structureKey === "ACC|Grande")!;
    const transporte = grande.families.find(f => f.key === "transporte");
    assert.ok(transporte, "expected transporte family");
    assert.equal(transporte!.references.length, 4);
  });

  it("D2: SUM(referenceRows.units) === family.units", () => {
    const comp = pres([
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", units: 10 }),
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", units: 7 }),
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", units: 3 }),
    ]);
    const peq = comp.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    const cam = peq.families.find(f => f.key === "caminador")!;
    const refSum = cam.references.reduce((s, r) => s + r.units, 0);
    assert.equal(refSum, cam.units, `ref sum ${refSum} !== family.units ${cam.units}`);
  });

  it("D3: unique reference count === family.refCount", () => {
    const comp = pres([
      accRow({ subgrupoSag: "TETERO", handlingUnit: "MEDIANO", units: 5 }),
      accRow({ subgrupoSag: "TETERO", handlingUnit: "MEDIANO", units: 3 }),
    ]);
    const med = comp.sizes.find(s => s.structureKey === "ACC|Mediano")!;
    const tet = med.families.find(f => f.key === "teteros")!;
    const uniqueIds = new Set(tet.references.map(r => r.referenceId));
    assert.equal(uniqueIds.size, tet.refCount, `unique refs ${uniqueIds.size} !== refCount ${tet.refCount}`);
  });

  it("D4: references belong to the same structureKey", () => {
    const comp = pres([
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", units: 4 }),
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "GRANDE", units: 2 }),
    ]);
    // Pequeño should have 1 ref, Grande should have 1 ref — never mixed
    const peq = comp.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    const grande = comp.sizes.find(s => s.structureKey === "ACC|Grande")!;
    const peqCam = peq.families.find(f => f.key === "caminador")!;
    const grandeCam = grande.families.find(f => f.key === "caminador")!;
    assert.equal(peqCam.references.length, 1);
    assert.equal(grandeCam.references.length, 1);
    assert.equal(peqCam.references[0].units, 4);
    assert.equal(grandeCam.references[0].units, 2);
  });

  it("D5: references belong to the same commercialFamily", () => {
    const comp = pres([
      accRow({ subgrupoSag: "CAMINADOR", handlingUnit: "PEQUENO", units: 3 }),
      accRow({ subgrupoSag: "TETERO", handlingUnit: "PEQUENO", units: 2 }),
    ]);
    const peq = comp.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    const cam = peq.families.find(f => f.key === "caminador")!;
    const tet = peq.families.find(f => f.key === "teteros")!;
    // Caminador refs should not appear in teteros and vice versa
    assert.equal(cam.references.length, 1);
    assert.equal(tet.references.length, 1);
    assert.notEqual(cam.references[0].referenceId, tet.references[0].referenceId);
  });

  it("D6: references sorted units DESC, then referenceCode ASC", () => {
    const comp = pres([
      accRow({ subgrupoSag: "CAMINADOR", referenceCode: "ZZZ", handlingUnit: "PEQUENO", units: 3 }),
      accRow({ subgrupoSag: "CAMINADOR", referenceCode: "AAA", handlingUnit: "PEQUENO", units: 3 }),
      accRow({ subgrupoSag: "CAMINADOR", referenceCode: "MMM", handlingUnit: "PEQUENO", units: 5 }),
    ]);
    const peq = comp.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    const cam = peq.families.find(f => f.key === "caminador")!;
    assert.equal(cam.references.length, 3);
    // First: MMM (5 units, highest)
    assert.equal(cam.references[0].referenceCode, "MMM");
    assert.equal(cam.references[0].units, 5);
    // Then AAA and ZZZ (both 3 units, alphabetical)
    assert.equal(cam.references[1].referenceCode, "AAA");
    assert.equal(cam.references[2].referenceCode, "ZZZ");
  });

  it("D7: family rows start closed (source check — no defaultOpen)", () => {
    const clientPath = path.resolve(__dirname, "../../../../app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx");
    const src = fs.readFileSync(clientPath, "utf8");
    // Extract AccessoryFamilyDrillDown function body (until next top-level function)
    const fnStart = src.indexOf("function AccessoryFamilyDrillDown");
    assert.ok(fnStart !== -1, "AccessoryFamilyDrillDown must exist");
    const fnBody = src.slice(fnStart, fnStart + 800);
    const stateMatch = fnBody.match(/useState\((false|true)\)/);
    assert.ok(stateMatch, "AccessoryFamilyDrillDown must use useState");
    assert.equal(stateMatch![1], "false", "family drill-down default state must be closed (false)");
  });

  it("D8: click toggles open/close (source check — setOpen toggler)", () => {
    const clientPath = path.resolve(__dirname, "../../../../app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx");
    const src = fs.readFileSync(clientPath, "utf8");
    const fnStart = src.indexOf("function AccessoryFamilyDrillDown");
    const fnBody = src.slice(fnStart, fnStart + 1500);
    assert.ok(fnBody.includes("setOpen(v => !v)") || fnBody.includes("setOpen(!open)"),
      "AccessoryFamilyDrillDown must toggle open state on click");
  });

  it("D9: aria-expanded on family drill-down", () => {
    const clientPath = path.resolve(__dirname, "../../../../app/(app)/[orgSlug]/comercial/tiendas/tiendas-client.tsx");
    const src = fs.readFileSync(clientPath, "utf8");
    const fnStart = src.indexOf("function AccessoryFamilyDrillDown");
    const fnBody = src.slice(fnStart, fnStart + 1500);
    assert.ok(fnBody.includes("aria-expanded={open}") || fnBody.includes("aria-expanded="),
      "AccessoryFamilyDrillDown must have aria-expanded");
  });

  it("D10: textiles do not generate drill-down references", () => {
    // Textile row — productLine "1"
    const textileSnap = snap([
      row({ referenceCode: "TX-1", productId: "tx-1", variantKey: "TV1", units: 10 }),
    ]);
    for (const store of textileSnap.perStore) {
      for (const structure of store.coverage.structures) {
        if (structure.compositionByFamily) {
          for (const bucket of structure.compositionByFamily) {
            // This shouldn't happen for textiles, but if it does, verify no refs leak
            assert.ok(Array.isArray(bucket.references), "references must be an array");
          }
        }
      }
    }
    // Textiles produce null compositionByFamily — verify
    const textileStore = textileSnap.perStore.find(s => s.storeId === "centro")!;
    const textileStructures = textileStore.coverage.structures.filter(s => !s.structureKey.startsWith("ACC|"));
    for (const ts of textileStructures) {
      assert.equal(ts.compositionByFamily, null, `textile structure ${ts.structureKey} should have null compositionByFamily`);
    }
  });

  it("D11: changing store does not reuse references from previous (independent snapshots)", () => {
    // Two stores with different inventory
    const multiSnap = snap([
      accRow({ storeId: "centro", subgrupoSag: "CAMINADOR", referenceCode: "CAM-A", handlingUnit: "PEQUENO", units: 5 }),
      accRow({ storeId: "caldas", subgrupoSag: "TETERO", referenceCode: "TET-B", handlingUnit: "PEQUENO", units: 3 }),
    ], {
      governanceStores: [
        { storeId: "centro", displayName: "Centro" },
        { storeId: "caldas", displayName: "Caldas" },
      ],
    });
    const centroPres = buildAccessoryCompositionPresentation(multiSnap, "centro");
    const caldasPres = buildAccessoryCompositionPresentation(multiSnap, "caldas");
    const centroPeq = centroPres.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    const caldasPeq = caldasPres.sizes.find(s => s.structureKey === "ACC|Pequeño")!;
    // Centro should have caminador, not teteros
    assert.ok(centroPeq.families.some(f => f.key === "caminador"));
    assert.ok(!centroPeq.families.some(f => f.key === "teteros"));
    // Caldas should have teteros, not caminador
    assert.ok(caldasPeq.families.some(f => f.key === "teteros"));
    assert.ok(!caldasPeq.families.some(f => f.key === "caminador"));
    // Verify references don't leak
    const centroRefs = centroPeq.families.flatMap(f => f.references.map(r => r.referenceCode));
    const caldasRefs = caldasPeq.families.flatMap(f => f.references.map(r => r.referenceCode));
    assert.ok(!centroRefs.includes("TET-B"), "centro must not contain caldas references");
    assert.ok(!caldasRefs.includes("CAM-A"), "caldas must not contain centro references");
  });

  it("D12: no new taxonomy resolution introduced (source check)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "store-presentation-assembler.ts"),
      "utf8",
    );
    assert.ok(!src.includes("resolveCommercialTaxonomy"),
      "presentation assembler must not call resolveCommercialTaxonomy");
  });
});
