/**
 * INVENTORY-DRAWER-CANONICAL-04A6A1 — Variant Physical Existence Tests
 *
 * Structural tests verifying:
 *   1. Three independent rulings (VERIFIED, RESERVED_BLOCKED, AVAILABLE_BLOCKED)
 *   2. Variant inventory table with EXISTENCIA B01 only
 *   3. No RESERVADO or DISPONIBLE per variant
 *   4. Reconciliation logic: SUM(variant) vs reference EXISTENCIA
 *   5. Collapsible table with filters
 *   6. Provenance and sync date
 *   7. Reference-level inventory section preserved
 *   8. Prohibited patterns absent
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const DRAWER_PATH = path.resolve(
  __dirname,
  "../../../components/comercial/commercial-product-drawer.tsx"
);
const src = fs.readFileSync(DRAWER_PATH, "utf-8");

const LOADER_PATH = path.resolve(
  __dirname,
  "../../../lib/inventory/product-detail-loader.ts"
);
const loaderSrc = fs.readFileSync(LOADER_PATH, "utf-8");

// ── G1: Three independent rulings ────────────────────────────────────────────

describe("G1 — Three independent rulings documented", () => {
  test("T1a: VARIANT_PHYSICAL_EXISTENCE_VERIFIED ruling present", () => {
    expect(src).toContain("VARIANT_PHYSICAL_EXISTENCE_VERIFIED");
  });

  test("T1b: VARIANT_RESERVED_ALLOCATION_BLOCKED ruling present", () => {
    expect(src).toContain("VARIANT_RESERVED_ALLOCATION_BLOCKED");
  });

  test("T1c: VARIANT_AVAILABLE_QUANTITY_BLOCKED ruling present", () => {
    expect(src).toContain("VARIANT_AVAILABLE_QUANTITY_BLOCKED");
  });

  test("T1d: Old VARIANT_QUANTITY_SOURCE_BLOCKED does NOT block all quantities", () => {
    // The old blanket block should not prevent showing existencia
    // It can still exist as a comment but must not be the only ruling
    expect(src).toContain("VARIANT_PHYSICAL_EXISTENCE_VERIFIED");
  });
});

// ── G2: VariantInventoryRow contract ─────────────────────────────────────────

describe("G2 — VariantInventoryRow type contract", () => {
  test("T2a: VariantInventoryRow exported from drawer", () => {
    expect(src).toContain("export interface VariantInventoryRow");
  });

  test("T2b: VariantInventoryRow has talla field", () => {
    expect(src).toContain("talla: string");
  });

  test("T2c: VariantInventoryRow has color field", () => {
    expect(src).toContain("color: string");
  });

  test("T2d: VariantInventoryRow has existenciaB01 field", () => {
    expect(src).toContain("existenciaB01: number");
  });

  test("T2e: CommercialProductData has variantInventory field", () => {
    expect(src).toContain("variantInventory?: VariantInventoryRow[]");
  });

  test("T2f: CommercialProductData has variantInventorySyncedAt field", () => {
    expect(src).toContain("variantInventorySyncedAt?: string | null");
  });
});

// ── G3: Variant inventory section in drawer ─────────────────────────────────

describe("G3 — Variant inventory section (Existencia fisica)", () => {
  test("T3a: Section titled 'Existencia fisica por talla y color'", () => {
    expect(src).toContain("Existencia fisica por talla y color");
  });

  test("T3b: Table has Talla column header", () => {
    expect(src).toContain('"Talla"');
  });

  test("T3c: Table has Color column header", () => {
    expect(src).toContain('"Color"');
  });

  test("T3d: Table has Existencia B01 column header", () => {
    expect(src).toContain('"Existencia B01"');
  });

  test("T3e: Table has Estado column header", () => {
    expect(src).toContain('"Estado"');
  });

  test("T3f: Existencia aligned right", () => {
    expect(src).toContain('textAlign: "right"');
  });
});

// ── G4: Variant estado labels ────────────────────────────────────────────────

describe("G4 — Variant estado labels", () => {
  test("T4a: 'Con existencia' for positive", () => {
    expect(src).toContain('"Con existencia"');
  });

  test("T4b: 'Agotada' for zero", () => {
    expect(src).toContain('"Agotada"');
  });

  test("T4c: 'Inconsistencia' for negative (saldo inconsistency)", () => {
    expect(src).toContain('"Inconsistencia"');
  });
});

// ── G5: Reconciliation logic ────────────────────────────────────────────────

describe("G5 — Reconciliation (SUM variant vs reference EXISTENCIA)", () => {
  test("T5a: sumVariantExist computed from rows", () => {
    expect(src).toContain("sumVariantExist");
    expect(src).toContain("rows.reduce");
  });

  test("T5b: refExist sourced from product.totalStock", () => {
    expect(src).toContain("product.totalStock");
  });

  test("T5c: delta = sumVariantExist - refExist", () => {
    expect(src).toContain("sumVariantExist - refExist");
  });

  test("T5d: isReconciled check with tolerance <= 1", () => {
    expect(src).toContain("Math.abs(delta) <= 1");
  });

  test("T5e: Non-reconciled warning shown", () => {
    expect(src).toContain("Existencia por variante no reconciliada");
  });

  test("T5f: Reconciled status shown in footer", () => {
    expect(src).toContain("Reconciliado");
  });
});

// ── G6: Collapsible table + filters ─────────────────────────────────────────

describe("G6 — Collapsible table and filters", () => {
  test("T6a: VARIANT_COLLAPSE_THRESHOLD = 12", () => {
    expect(src).toContain("VARIANT_COLLAPSE_THRESHOLD = 12");
  });

  test("T6b: 'Ver todas' button present", () => {
    expect(src).toContain("Ver todas");
  });

  test("T6c: Talla filter chip", () => {
    expect(src).toContain("tallaFilter");
  });

  test("T6d: Color filter chip", () => {
    expect(src).toContain("colorFilter");
  });

  test("T6e: Total row in footer", () => {
    expect(src).toContain("combinaciones");
  });
});

// ── G7: Reference-level inventory section preserved ─────────────────────────

describe("G7 — Reference-level Inventario B01 section preserved", () => {
  test("T7a: Section titled 'Inventario B01'", () => {
    expect(src).toContain("Inventario B01");
  });

  test("T7b: Existencia B01 label present", () => {
    expect(src).toContain('label="Existencia B01"');
  });

  test("T7c: Reservado SAG label present", () => {
    expect(src).toContain('label="Reservado SAG"');
  });

  test("T7d: Disponible SAG label present", () => {
    expect(src).toContain('label="Disponible SAG"');
  });

  test("T7e: Negative disponible in parentheses", () => {
    expect(src).toContain("Math.abs(product.disponible)");
  });

  test("T7f: Reservado provenance note present", () => {
    expect(src).toContain("El reservado SAG se certifica a nivel de referencia");
  });

  test("T7g: Source provenance footer", () => {
    expect(src).toContain("vw_agentik_inventario");
    expect(src).toContain("B01 Bodega Principal");
  });
});

// ── G8: Produccion section ──────────────────────────────────────────────────

describe("G8 — Production section separate", () => {
  test("T8a: Production section exists", () => {
    expect(src).toContain("Produccion abierta");
  });

  test("T8b: 'Programado en ordenes abiertas' label", () => {
    expect(src).toContain("Programado en ordenes abiertas");
  });

  test("T8c: Production not included in disponible", () => {
    expect(src).toContain("No incluido en disponible actual");
  });
});

// ── G9: Variant provenance ──────────────────────────────────────────────────

describe("G9 — Variant inventory provenance", () => {
  test("T9a: Source: SAG / MOVIMIENTOS_ITEMS / B01", () => {
    expect(src).toContain("SAG / MOVIMIENTOS_ITEMS / B01");
  });

  test("T9b: Sync date displayed when available", () => {
    expect(src).toContain("variantInventorySyncedAt");
    expect(src).toContain("Sincronizado");
  });
});

// ── G10: Prohibited patterns ────────────────────────────────────────────────

describe("G10 — Prohibited patterns absent", () => {
  test("T10a: No STA_SKU as quantity source", () => {
    expect(src).not.toContain("STA_SKU");
  });

  test("T10b: No reservado per variant", () => {
    // VariantInventoryRow must NOT have reservado/reserved field
    const typeBlock = src.slice(
      src.indexOf("export interface VariantInventoryRow"),
      src.indexOf("}", src.indexOf("export interface VariantInventoryRow")) + 1,
    );
    expect(typeBlock).not.toContain("reservado");
    expect(typeBlock).not.toContain("reserved");
  });

  test("T10c: No disponible per variant", () => {
    const typeBlock = src.slice(
      src.indexOf("export interface VariantInventoryRow"),
      src.indexOf("}", src.indexOf("export interface VariantInventoryRow")) + 1,
    );
    expect(typeBlock).not.toContain("disponible");
    expect(typeBlock).not.toContain("available");
  });

  test("T10d: No distributed reserves (division by variantCount)", () => {
    expect(src).not.toContain("/ variantCount");
    expect(src).not.toContain("/ product.variantCount");
  });

  test("T10e: No B04 in inventory display", () => {
    const uiSection = src.slice(
      src.indexOf("return ("),
      src.indexOf("// ── 04A6A1: Variant Inventory Section"),
    );
    expect(uiSection).not.toContain("B04");
  });

  test("T10f: No CCS references", () => {
    expect(src).not.toContain("CCS");
  });

  test("T10g: No PIL references in UI labels", () => {
    const uiSection = src.slice(
      src.indexOf("return ("),
      src.indexOf("// ── 04A6A1: Variant Inventory Section"),
    );
    expect(uiSection).not.toContain(">PIL<");
    expect(uiSection).not.toContain('label="PIL');
  });
});

// ── G11: Loader contract ────────────────────────────────────────────────────

describe("G11 — Loader includes variant inventory", () => {
  test("T11a: VariantInventoryEntry type in loader", () => {
    expect(loaderSrc).toContain("export interface VariantInventoryEntry");
  });

  test("T11b: variantInventory in ProductDetailEnrichment", () => {
    expect(loaderSrc).toContain("variantInventory: VariantInventoryEntry[]");
  });

  test("T11c: variantInventorySyncedAt in result", () => {
    expect(loaderSrc).toContain("variantInventorySyncedAt");
  });

  test("T11d: Loader queries warehouseId '10' (= B01)", () => {
    expect(loaderSrc).toContain('warehouseId: "10"');
  });

  test("T11e: Loader sorts by talla then color", () => {
    expect(loaderSrc).toContain("a.talla.localeCompare(b.talla)");
  });
});

// ── G12: Variantes de catalogo section ──────────────────────────────────────

describe("G12 — Variantes de catalogo section preserved", () => {
  test("T12a: 'Variantes de catalogo' section title", () => {
    expect(src).toContain("Variantes de catalogo");
  });

  test("T12b: Catalog provenance note with SAG limitation", () => {
    expect(src).toContain("SAG no expone cantidades certificadas por talla y color");
  });

  test("T12c: Tallas shown as TagChip", () => {
    expect(src).toContain("product.tallas.map(t => <TagChip key={t} label={t} />)");
  });

  test("T12d: Colores shown as TagChip", () => {
    expect(src).toContain("product.colores.map(c => <TagChip key={c} label={c} />)");
  });
});
