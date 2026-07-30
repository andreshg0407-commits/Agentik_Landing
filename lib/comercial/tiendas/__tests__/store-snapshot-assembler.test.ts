/**
 * lib/comercial/tiendas/__tests__/store-snapshot-assembler.test.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F1: certificación del StoreSnapshotAssembler.
 *
 * Cubre los 12 casos obligatorios del diseño aprobado + los invariantes I8/I9
 * de los ajustes del arquitecto + verificación de fingerprint (obs. 5) +
 * separación estático/operacional (obs. 1), contrato sin Map (obs. 2) e
 * identidad estable (obs. 3).
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-snapshot-assembler.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  assembleSnapshotSource,
  SnapshotSourceIntegrityError,
  buildStructureLookup,
  computeAssembledFingerprint,
  type SnapshotSourceRows,
  type SnapshotInventoryRow,
} from "../store-snapshot-assembler";
import { CASTILLITOS_TEXTILE_COVERAGE, CASTILLITOS_GLOBAL_LOW_STOCK } from "../store-policy-pack-config";

// ── Fixture: claves reales del catálogo (cero simulación de estructura) ──────
const lookup = buildStructureLookup();
const CS_KEY = [...lookup.csByMatchKey.keys()][0];                 // "GRUPO|SUBGRUPO" real
const [CS_GRUPO, CS_SUBGRUPO] = CS_KEY.split("|");
const CS_STRUCTURE = lookup.csByMatchKey.get(CS_KEY)!.structureKey;
const LK_SUBGRUPO = [...lookup.lkBySubgroup.keys()][0];
const LK_STRUCTURE = lookup.lkBySubgroup.get(LK_SUBGRUPO)!.structureKey;

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
// 1–2. Consolidación y cuadre (I2)
// ═════════════════════════════════════════════════════════════════════════════

describe("consolidación y cuadre contable", () => {
  it("OBLIGATORIA 1: 3 variantes de una referencia (2+3+1) → un item con units=6, variantCount=3", () => {
    const out = assembleSnapshotSource(source([
      row({ variantKey: "V1", units: 2 }),
      row({ variantKey: "V2", units: 3 }),
      row({ variantKey: "V3", units: 1 }),
    ]));
    const centro = out.stores.find(s => s.storeId === "centro")!;
    assert.equal(centro.items.length, 1);
    assert.equal(centro.items[0].units, 6);
    assert.equal(centro.items[0].variantCount, 3);
    assert.equal(centro.totalUnits, 6);
  });

  it("OBLIGATORIA 2: Σ entrada = Σ salida por tienda (dos tiendas, varias refs)", () => {
    const out = assembleSnapshotSource(source([
      row({ units: 4 }),
      row({ variantKey: "V2", units: 5 }),
      row({ referenceCode: "REF-2", productId: "prod-2", variantKey: "V1", units: 7 }),
      row({ storeId: "caldas", warehousePk: "39", variantKey: "V1", units: 11 }),
    ]));
    assert.equal(out.stores.find(s => s.storeId === "centro")!.totalUnits, 16);
    assert.equal(out.stores.find(s => s.storeId === "caldas")!.totalUnits, 11);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3–4. Gobernanza como universo (I4)
// ═════════════════════════════════════════════════════════════════════════════

describe("gobernanza — única verdad de tienda activa", () => {
  it("OBLIGATORIA 3: tienda activa sin inventario → presente con items [] (jamás ausente)", () => {
    const out = assembleSnapshotSource(source([row({})]));
    const caldas = out.stores.find(s => s.storeId === "caldas");
    assert.ok(caldas);
    assert.deepEqual(caldas!.items, []);
    assert.equal(caldas!.totalUnits, 0);
  });

  it("OBLIGATORIA 4: fila de tienda inactiva → dropped STORE_INACTIVE, sin crear tienda", () => {
    const out = assembleSnapshotSource(source([
      row({}),
      row({ storeId: "san_diego", warehousePk: "11", units: 99 }),
    ]));
    assert.equal(out.stores.length, 2);                            // solo gobernanza
    assert.ok(!out.stores.some(s => s.storeId === "san_diego"));
    assert.deepEqual(out.dropped.byReason, [{ reason: "STORE_INACTIVE", count: 1 }]);
    assert.equal(out.dropped.count, 1);
  });

  it("OBLIGATORIA 12: gobernanza vacía → EMPTY_GOVERNANCE, fallo total", () => {
    assert.throws(
      () => assembleSnapshotSource(source([row({})], { governanceStores: [] })),
      (e: unknown) => e instanceof SnapshotSourceIntegrityError && e.code === "EMPTY_GOVERNANCE",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5–6. Anota-no-decide (I3) y validación dura
// ═════════════════════════════════════════════════════════════════════════════

describe("anota, no decide + fallo total", () => {
  it("OBLIGATORIA 5: referencia CD-* → flag isSpecialCollection=true y el item PERMANECE", () => {
    const out = assembleSnapshotSource(source([row({ referenceCode: "CD-101", productId: "prod-cd", units: 5 })]));
    const item = out.stores.find(s => s.storeId === "centro")!.items[0];
    assert.equal(item.flags.isSpecialCollection, true);
    assert.equal(item.units, 5);                                   // S3 anota; cada motor aplica su ley
  });

  it("OBLIGATORIA 6: unidades negativas → NEGATIVE_UNITS, sin resultado parcial", () => {
    assert.throws(
      () => assembleSnapshotSource(source([row({ units: 3 }), row({ variantKey: "V2", units: -1 })])),
      (e: unknown) => e instanceof SnapshotSourceIntegrityError && e.code === "NEGATIVE_UNITS",
    );
  });

  it("variante duplicada exacta → DUPLICATE_VARIANT", () => {
    assert.throws(
      () => assembleSnapshotSource(source([row({ units: 2 }), row({ units: 4 })])),  // misma V1
      (e: unknown) => e instanceof SnapshotSourceIntegrityError && e.code === "DUPLICATE_VARIANT",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. Determinismo y fingerprint (I1 + obs. 5)
// ═════════════════════════════════════════════════════════════════════════════

describe("determinismo y fingerprint", () => {
  it("OBLIGATORIA 7: misma entrada dos veces → salida idéntica y mismo fingerprint; dataAsOf de filas, no reloj", () => {
    const rows = [
      row({ units: 2, updatedAt: "2026-07-29T08:00:00.000Z" }),
      row({ storeId: "caldas", warehousePk: "39", variantKey: "V9", units: 3, updatedAt: "2026-07-30T09:30:00.000Z" }),
    ];
    const a = assembleSnapshotSource(source(rows));
    const b = assembleSnapshotSource(source(rows));
    assert.equal(JSON.stringify(a), JSON.stringify(b));            // byte a byte
    assert.equal(a.fingerprint, b.fingerprint);
    assert.match(a.fingerprint, /^asm1-[0-9a-f]{16}$/);
    assert.equal(a.dataAsOf, "2026-07-30T09:30:00.000Z");          // max(updatedAt), jamás Date.now()
    // El orden de las filas de entrada no altera la salida canónica:
    const c = assembleSnapshotSource(source([rows[1], rows[0]]));
    assert.equal(c.fingerprint, a.fingerprint);
    // Y una entrada distinta produce OTRO fingerprint:
    const d = assembleSnapshotSource(source([row({ units: 99, updatedAt: "2026-07-29T08:00:00.000Z" })]));
    assert.notEqual(d.fingerprint, a.fingerprint);
  });

  it("el fingerprint es recomputable desde el propio objeto (verificación externa del A/B)", () => {
    const out = assembleSnapshotSource(source([row({})]));
    const { fingerprint, ...payload } = out;
    assert.equal(computeAssembledFingerprint(payload), fingerprint);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. Reglas efectivas (I6 + I9)
// ═════════════════════════════════════════════════════════════════════════════

describe("reglas efectivas por estructura", () => {
  it("OBLIGATORIA 8: política persistida vigente sobreescribe el default del pack, verbatim", () => {
    const out = assembleSnapshotSource(source([row({})], {
      policyRulesByStore: [{
        storeId: "centro",
        rules: [{ scope: "line", line: "castillitos", minQty: 5, idealQty: 7, maxQty: 9, active: true, validFrom: null, validTo: null }],
      }],
    }));
    const centroCs = out.structureRules.find(r => r.storeId === "centro" && r.structureKey === CS_STRUCTURE)!;
    assert.deepEqual(
      { min: centroCs.minUnits, ideal: centroCs.idealUnits, max: centroCs.maxUnits, source: centroCs.source },
      { min: 5, ideal: 7, max: 9, source: "POLICY_OVERRIDE" },
    );
    // Caldas sin override → default del pack
    const caldasCs = out.structureRules.find(r => r.storeId === "caldas" && r.structureKey === CS_STRUCTURE)!;
    assert.equal(caldasCs.minUnits, CASTILLITOS_TEXTILE_COVERAGE.minimumUnits);
    assert.equal(caldasCs.source, "PACK_DEFAULT");
  });

  it("vigencia contra readAt: regla futura o vencida cae al default (sin reloj propio)", () => {
    const mk = (validFrom: string | null, validTo: string | null) => assembleSnapshotSource(source([row({})], {
      policyRulesByStore: [{
        storeId: "centro",
        rules: [{ scope: "line", line: "castillitos", minQty: 1, idealQty: 2, maxQty: 3, active: true, validFrom, validTo }],
      }],
    })).structureRules.find(r => r.storeId === "centro" && r.structureKey === CS_STRUCTURE)!;
    assert.equal(mk("2027-01-01T00:00:00.000Z", null).source, "PACK_DEFAULT");   // futura
    assert.equal(mk(null, "2026-01-01T00:00:00.000Z").source, "PACK_DEFAULT");   // vencida
    assert.equal(mk("2026-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z").source, "POLICY_OVERRIDE");
  });

  it("INVARIANTE I9: una regla efectiva por (tienda, estructura) — cobertura completa del universo", () => {
    const out = assembleSnapshotSource(source([row({})]));
    const keys = out.structureRules.map(r => `${r.storeId}|${r.structureKey}`);
    assert.equal(new Set(keys).size, keys.length);                 // sin duplicados
    assert.equal(out.structureRules.length, out.expectedStructures.length * out.activeStores.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. Estructuras por item (I8) + sin silencios
// ═════════════════════════════════════════════════════════════════════════════

describe("estructura por item", () => {
  it("OBLIGATORIA 9: referencia sin resolución de catálogo → structureKey null + listada en unresolvedStructure (visible, no descartada)", () => {
    const out = assembleSnapshotSource(source([
      row({ referenceCode: "REF-X", productId: "prod-x", grupoSag: "SIN_GRUPO_SAG", subgrupoSag: "ALGO_INEXISTENTE_XYZ", units: 4 }),
    ]));
    const item = out.stores.find(s => s.storeId === "centro")!.items[0];
    assert.equal(item.structureKey, null);
    assert.equal(item.units, 4);                                   // el cuadre la incluye
    assert.deepEqual(out.unresolvedStructure, [{
      storeId: "centro", referenceCode: "REF-X", grupoSag: "SIN_GRUPO_SAG", subgrupoSag: "ALGO_INEXISTENTE_XYZ",
    }]);
    assert.equal(out.dropped.count, 0);                            // no es un descarte
  });

  it("INVARIANTE I8: item que resuelve a DOS estructuras → AMBIGUOUS_STRUCTURE, fallo total", () => {
    // Clave CS real + handlingUnit PEQUENO (→ ACC small) en el mismo producto:
    // el item calzaría en CS y en ACC a la vez → colisión prohibida por I8.
    assert.throws(
      () => assembleSnapshotSource(source([row({ handlingUnit: "PEQUENO" })])),
      (e: unknown) => e instanceof SnapshotSourceIntegrityError && e.code === "AMBIGUOUS_STRUCTURE",
    );
    // Y la vía sana asigna exactamente una:
    const ok = assembleSnapshotSource(source([row({})]));
    assert.equal(ok.stores.find(s => s.storeId === "centro")!.items[0].structureKey, CS_STRUCTURE);
    const lk = assembleSnapshotSource(source([row({ grupoSag: "OTRO_GRUPO_NO_CS", subgrupoSag: LK_SUBGRUPO })]));
    assert.equal(lk.stores.find(s => s.storeId === "centro")!.items[0].structureKey, LK_STRUCTURE);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10–11. Bodega principal (I5) y escasez verbatim (I7)
// ═════════════════════════════════════════════════════════════════════════════

describe("bodega principal y config verbatim", () => {
  it("OBLIGATORIA 10: filas MAIN alimentan mainStock y JAMÁS itemsByStore; MAIN con storeId → error", () => {
    const out = assembleSnapshotSource(source([
      row({}),
      row({ warehouseKind: "MAIN", storeId: null, warehousePk: "10", variantKey: "V1", units: 40 }),
      row({ warehouseKind: "MAIN", storeId: null, warehousePk: "33", variantKey: "V2", units: 2 }),
    ]));
    assert.equal(out.mainStock.length, 1);
    assert.equal(out.mainStock[0].units, 42);                      // 40 + 2, consolidado por referencia
    assert.equal(out.stores.find(s => s.storeId === "centro")!.totalUnits, 1);   // solo la fila STORE
    assert.throws(
      () => assembleSnapshotSource(source([row({ warehouseKind: "MAIN", storeId: "centro" })])),
      (e: unknown) => e instanceof SnapshotSourceIntegrityError && e.code === "MAIN_WAREHOUSE_AS_STORE",
    );
  });

  it("OBLIGATORIA 11: escasez verbatim del pack — {36, [centro, caldas]}, sin copia propia", () => {
    const out = assembleSnapshotSource(source([row({})]));
    assert.equal(out.scarcity.threshold, CASTILLITOS_GLOBAL_LOW_STOCK.threshold);
    assert.deepEqual([...out.scarcity.allowedStoreIds], [...CASTILLITOS_GLOBAL_LOW_STOCK.allowedStoreIds]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Ajustes del arquitecto: obs. 1 (estático/operacional), 2 (sin Map), 3 (identidad)
// ═════════════════════════════════════════════════════════════════════════════

describe("contrato público según los ajustes del arquitecto", () => {
  it("obs. 1: metadata estática en referenceCatalog, separada de los items operacionales", () => {
    const out = assembleSnapshotSource(source([
      row({ heroImageUrl: "https://img/1.png", createdAtSag: "2025-03-01T00:00:00.000Z", handlingUnit: null }),
    ]));
    const cat = out.referenceCatalog.find(c => c.referenceId === "prod-1")!;
    assert.equal(cat.heroImageUrl, "https://img/1.png");
    assert.equal(cat.entryDate, "2025-03-01T00:00:00.000Z");
    assert.equal(cat.grupoSag, CS_GRUPO);
    const item = out.stores.find(s => s.storeId === "centro")!.items[0] as unknown as Record<string, unknown>;
    assert.ok(!("productName" in item) && !("heroImageUrl" in item) && !("entryDate" in item));
    // Centinela SAG 1900-01-01 → null
    const sentinel = assembleSnapshotSource(source([row({ createdAtSag: "1900-01-01T00:00:00.000Z" })]));
    assert.equal(sentinel.referenceCatalog[0].entryDate, null);
  });

  it("obs. 2: el contrato público no expone Map — solo arrays/objetos planos, en orden canónico", () => {
    const out = assembleSnapshotSource(source([
      row({}),
      row({ storeId: "caldas", warehousePk: "39", variantKey: "VC", units: 2 }),
    ]));
    const scan = (v: unknown): void => {
      assert.ok(!(v instanceof Map) && !(v instanceof Set));
      if (v && typeof v === "object") for (const child of Object.values(v)) scan(child);
    };
    scan(out);
    assert.deepEqual(out.stores.map(s => s.storeId), ["caldas", "centro"]);      // orden canónico
    assert.deepEqual(out.activeStores.map(s => s.storeId), ["caldas", "centro"]);
  });

  it("obs. 3: referenceId estable (productId) como identidad; referenceCode como dato de negocio", () => {
    const out = assembleSnapshotSource(source([
      row({}),
      row({ referenceCode: "REF-SIN-PRODUCTO", productId: null, variantKey: "VX", units: 2 }),
    ]));
    const withId = out.referenceCatalog.find(c => c.referenceCode === "REF-1")!;
    assert.equal(withId.referenceId, "prod-1");
    assert.equal(withId.identitySource, "PRODUCT_ID");
    const withoutId = out.referenceCatalog.find(c => c.referenceCode === "REF-SIN-PRODUCTO")!;
    assert.equal(withoutId.referenceId, "code:REF-SIN-PRODUCTO");  // origen declarado, jamás silencioso
    assert.equal(withoutId.identitySource, "REFERENCE_CODE");
  });
});
