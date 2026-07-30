/**
 * lib/comercial/tiendas/__tests__/store-snapshot-source-filters.test.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F1 (ajuste por ley operativa confirmada):
 * certificación del dedup PIL (introducido en la integración) y del FILTRO
 * OPERATIVO (referencias con disponibilidad <= 0 fuera del snapshot),
 * aplicados por el source-service ANTES del assembler.
 *
 * Run: npx tsx --test lib/comercial/tiendas/__tests__/store-snapshot-source-filters.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  dedupePilRows,
  filterOperationalRows,
  pilDedupKey,
} from "../store-snapshot-source-filters";
import {
  assembleSnapshotSource,
  buildStructureLookup,
  type SnapshotInventoryRow,
  type SnapshotSourceRows,
} from "../store-snapshot-assembler";

const lookup = buildStructureLookup();
const CS_KEY = [...lookup.csByMatchKey.keys()][0];
const [CS_GRUPO, CS_SUBGRUPO] = CS_KEY.split("|");

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

// ═════════════════════════════════════════════════════════════════════════════
// 1. Dedup PIL (ley de la integración, extraída a módulo puro)
// ═════════════════════════════════════════════════════════════════════════════

describe("dedup PIL", () => {
  it("OBLIGATORIA: duplicado exacto (bodega, producto, variante) → UNA fila con SUMA de unidades", () => {
    const out = dedupePilRows([
      row({ units: 3, updatedAt: "2026-07-29T08:00:00.000Z" }),
      row({ units: 4, updatedAt: "2026-07-30T09:00:00.000Z" }),   // mismo prod-1/V1/bodega 31
    ]);
    assert.equal(out.rows.length, 1);
    assert.equal(out.rows[0].units, 7);                           // suma, no reemplazo
    assert.equal(out.rows[0].updatedAt, "2026-07-30T09:00:00.000Z"); // el más reciente
    assert.equal(out.mergedRowCount, 1);                          // reportado, sin silencios
  });

  it("variantes DISTINTAS del mismo producto no se fusionan", () => {
    const out = dedupePilRows([row({ variantKey: "V1", units: 2 }), row({ variantKey: "V2", units: 5 })]);
    assert.equal(out.rows.length, 2);
    assert.equal(out.mergedRowCount, 0);
  });

  it("misma variante en BODEGAS distintas no se fusiona (tienda vs tienda, tienda vs principal)", () => {
    const out = dedupePilRows([
      row({ warehousePk: "31", units: 2 }),
      row({ storeId: "caldas", warehousePk: "39", units: 3 }),
      row({ warehouseKind: "MAIN", storeId: null, warehousePk: "10", units: 9 }),
    ]);
    assert.equal(out.rows.length, 3);
  });

  it("sin productId, la identidad cae al referenceCode DECLARADO — dos referencias distintas jamás se fusionan", () => {
    const a = row({ productId: null, referenceCode: "REF-A", units: 2 });
    const b = row({ productId: null, referenceCode: "REF-B", variantKey: "V1", units: 3 });
    assert.notEqual(pilDedupKey(a), pilDedupKey(b));
    const out = dedupePilRows([a, b]);
    assert.equal(out.rows.length, 2);
    // Y el mismo code SÍ se fusiona:
    const out2 = dedupePilRows([a, row({ productId: null, referenceCode: "REF-A", units: 5 })]);
    assert.equal(out2.rows.length, 1);
    assert.equal(out2.rows[0].units, 7);
  });

  it("es pura y determinista: no muta la entrada y conserva el orden de primera aparición", () => {
    const r1 = row({ units: 3 });
    const r2 = row({ units: 4 });
    const frozen = JSON.stringify([r1, r2]);
    const out = dedupePilRows([r1, r2]);
    assert.equal(JSON.stringify([r1, r2]), frozen);               // entrada intacta
    assert.equal(out.rows[0].referenceCode, "REF-1");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. FILTRO OPERATIVO (ley confirmada: disponibilidad <= 0 fuera del snapshot)
// ═════════════════════════════════════════════════════════════════════════════

describe("filtro operativo — disponibilidad <= 0", () => {
  it("OBLIGATORIA: referencia con disponibilidad 0 → excluida del universo operativo y CONTADA", () => {
    const out = filterOperationalRows([
      row({ units: 5 }),
      row({ referenceCode: "REF-AGOTADA", productId: "prod-z", variantKey: "V1", units: 0 }),
    ]);
    assert.equal(out.rows.length, 1);
    assert.equal(out.rows[0].referenceCode, "REF-1");
    assert.equal(out.excludedZeroAvailabilityCount, 1);           // transparencia, sin silencios
  });

  it("referencia con una variante en 0 y otra positiva → la referencia SOBREVIVE con sus unidades reales", () => {
    const out = filterOperationalRows([
      row({ variantKey: "V1", units: 0 }),
      row({ variantKey: "V2", units: 4 }),
    ]);
    assert.equal(out.rows.length, 1);
    assert.equal(out.rows[0].units, 4);
  });

  it("el filtro juzga la disponibilidad AGREGADA: dedup primero, filtro después", () => {
    // Dos filas duplicadas 0 + 3 → disponible 3 → sobrevive. Filtrar antes del
    // dedup daría el mismo total aquí, pero la ley exige juzgar el agregado.
    const deduped = dedupePilRows([row({ units: 0 }), row({ units: 3 })]);
    const out = filterOperationalRows(deduped.rows);
    assert.equal(out.rows.length, 1);
    assert.equal(out.rows[0].units, 3);
    assert.equal(out.excludedZeroAvailabilityCount, 0);
  });

  it("también aplica a bodega principal: MAIN sin disponibilidad no entra al snapshot operativo", () => {
    const out = filterOperationalRows([
      row({ warehouseKind: "MAIN", storeId: null, warehousePk: "10", units: 0 }),
      row({ warehouseKind: "MAIN", storeId: null, warehousePk: "10", variantKey: "V2", units: 8 }),
    ]);
    assert.equal(out.rows.length, 1);
    assert.equal(out.rows[0].units, 8);
  });

  it("es de SOLO LECTURA: la entrada no se muta (los registros históricos quedan intactos)", () => {
    const rows = [row({ units: 0 }), row({ variantKey: "V2", units: 2 })];
    const frozen = JSON.stringify(rows);
    filterOperationalRows(rows);
    assert.equal(JSON.stringify(rows), frozen);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Encadenado completo: dedup → filtro → assembler (ley operativa visible)
// ═════════════════════════════════════════════════════════════════════════════

describe("pipeline dedup → filtro → assembler", () => {
  it("el snapshot operativo no contiene NINGÚN item con 0 unidades, y el cuadre se mantiene", () => {
    const raw: SnapshotInventoryRow[] = [
      row({ units: 2, updatedAt: "2026-07-29T08:00:00.000Z" }),
      row({ units: 3, updatedAt: "2026-07-30T09:00:00.000Z" }),   // duplicado PIL → 5
      row({ referenceCode: "REF-AGOTADA", productId: "prod-z", variantKey: "V1", units: 0 }),
      row({ storeId: "caldas", warehousePk: "39", variantKey: "V1", units: 0 }),  // caldas queda sin filas
    ];
    const deduped = dedupePilRows(raw);
    const operational = filterOperationalRows(deduped.rows);
    const source: SnapshotSourceRows = {
      organizationId: "org-1",
      readAt: "2026-07-30T12:00:00.000Z",
      inventoryRows: [...operational.rows],
      governanceStores: [
        { storeId: "caldas", displayName: "Caldas" },
        { storeId: "centro", displayName: "Centro" },
      ],
      policyRulesByStore: [],
    };
    const out = assembleSnapshotSource(source);

    const centro = out.stores.find(s => s.storeId === "centro")!;
    assert.equal(centro.items.length, 1);                          // REF-AGOTADA fuera
    assert.equal(centro.items[0].units, 5);                        // duplicado sumado
    assert.equal(centro.items[0].variantCount, 1);                 // una variante real tras dedup
    assert.ok(out.stores.every(s => s.items.every(i => i.units > 0)));  // ley operativa
    // Tienda activa cuyo inventario quedó todo en 0 → PRESENTE y vacía (I4 intacta):
    const caldas = out.stores.find(s => s.storeId === "caldas")!;
    assert.deepEqual(caldas.items, []);
    assert.equal(caldas.totalUnits, 0);
  });
});
