/**
 * INVENTORY-DRAWER-CANONICAL-04A6A1R — Variant Existence Retraction Tests
 *
 * 04A6A1R RETRACTION: VARIANT_PHYSICAL_EXISTENCE_VERIFIED invalidated.
 * Evidence: SUM(variant EXISTENCIA) does not match reference EXISTENCIA B01.
 * MOVIMIENTOS_ITEMS saldo is stale (Jun 23) vs vw_agentik_inventario (Aug 17).
 *
 * Structural tests verifying:
 *   1. Correct rulings (NOT_RECONCILED, RESERVED_BLOCKED, AVAILABLE_BLOCKED)
 *   2. No variant quantities shown in drawer
 *   3. Catalog variants preserved (tallas/colores as chips)
 *   4. Reference-level Inventario B01 preserved
 *   5. Honest provenance messaging
 *   6. No prohibited patterns
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

// ── G1: Correct rulings after retraction ─────────────────────────────────────

describe("G1 — Correct rulings (04A6A1R retraction)", () => {
  test("T1a: VARIANT_PHYSICAL_EXISTENCE_NOT_RECONCILED ruling present", () => {
    expect(src).toContain("VARIANT_PHYSICAL_EXISTENCE_NOT_RECONCILED");
  });

  test("T1b: VARIANT_RESERVED_ALLOCATION_BLOCKED ruling present", () => {
    expect(src).toContain("VARIANT_RESERVED_ALLOCATION_BLOCKED");
  });

  test("T1c: VARIANT_AVAILABLE_QUANTITY_BLOCKED ruling present", () => {
    expect(src).toContain("VARIANT_AVAILABLE_QUANTITY_BLOCKED");
  });

  test("T1d: VARIANT_PHYSICAL_EXISTENCE_VERIFIED is NOT present", () => {
    expect(src).not.toContain("VARIANT_PHYSICAL_EXISTENCE_VERIFIED");
  });
});

// ── G2: No variant quantities in drawer ──────────────────────────────────────

describe("G2 — No variant quantities shown", () => {
  test("T2a: No VariantInventoryRow type exported", () => {
    expect(src).not.toContain("export interface VariantInventoryRow");
  });

  test("T2b: No variantInventory field in CommercialProductData", () => {
    // Field Source Map documents it as BLOCKED — that's fine.
    // What matters: no variantInventory in the interface or JSX.
    expect(src).not.toContain("variantInventory:");
    expect(src).not.toContain("variantInventory?:");
    expect(src).not.toContain("product.variantInventory");
  });

  test("T2c: No VariantInventorySection component", () => {
    expect(src).not.toContain("VariantInventorySection");
  });

  test("T2d: No 'Existencia fisica por talla y color' section", () => {
    expect(src).not.toContain("Existencia fisica por talla y color");
  });

  test("T2e: No existenciaB01 per variant", () => {
    expect(src).not.toContain("existenciaB01");
  });

  test("T2f: No VARIANT_COLLAPSE_THRESHOLD", () => {
    expect(src).not.toContain("VARIANT_COLLAPSE_THRESHOLD");
  });

  test("T2g: No 'Inconsistencia' estado label", () => {
    expect(src).not.toContain('"Inconsistencia"');
  });

  test("T2h: No 'Reconciliado' label", () => {
    expect(src).not.toContain("Reconciliado");
  });
});

// ── G3: Catalog variants preserved ──────────────────────────────────────────

describe("G3 — Catalog variants preserved as chips", () => {
  test("T3a: 'Variantes de catalogo' section title", () => {
    expect(src).toContain("Variantes de catalogo");
  });

  test("T3b: Tallas shown as TagChip", () => {
    expect(src).toContain("product.tallas.map(t => <TagChip key={t} label={t} />)");
  });

  test("T3c: Colores shown as TagChip", () => {
    expect(src).toContain("product.colores.map(c => <TagChip key={c} label={c} />)");
  });

  test("T3d: Honest provenance note", () => {
    expect(src).toContain("SAG no permite reconciliar todavia cantidades actuales por talla y color");
  });
});

// ── G4: Reference-level Inventario B01 preserved ────────────────────────────

describe("G4 — Reference-level Inventario B01 preserved", () => {
  test("T4a: Section titled 'Inventario B01'", () => {
    expect(src).toContain("Inventario B01");
    expect(src).toContain("Bodega Principal");
  });

  test("T4b: Existencia B01 field", () => {
    expect(src).toContain('label="Existencia B01"');
  });

  test("T4c: Reservado SAG field", () => {
    expect(src).toContain('label="Reservado SAG"');
  });

  test("T4d: Disponible SAG field", () => {
    expect(src).toContain('label="Disponible SAG"');
  });

  test("T4e: Negative disponible in parentheses", () => {
    expect(src).toContain("Math.abs(product.disponible)");
  });

  test("T4f: Reservado provenance note", () => {
    expect(src).toContain("El reservado SAG se certifica a nivel de referencia");
  });

  test("T4g: Source provenance footer", () => {
    expect(src).toContain("vw_agentik_inventario");
  });
});

// ── G5: Production section preserved ────────────────────────────────────────

describe("G5 — Production section preserved", () => {
  test("T5a: 'Produccion abierta' section", () => {
    expect(src).toContain("Produccion abierta");
  });

  test("T5b: 'No incluido en disponible actual'", () => {
    expect(src).toContain("No incluido en disponible actual");
  });
});

// ── G6: Prohibited patterns absent ──────────────────────────────────────────

describe("G6 — Prohibited patterns absent", () => {
  test("T6a: No CCS references", () => {
    expect(src).not.toContain("CCS");
  });

  test("T6b: No distributed reserves", () => {
    expect(src).not.toContain("/ variantCount");
    expect(src).not.toContain("/ product.variantCount");
  });

  test("T6c: No STA_SKU", () => {
    expect(src).not.toContain("STA_SKU");
  });

  test("T6d: No interactive variant inventory section (04A6B allows useState for order expansion)", () => {
    // useState is now legitimately used by PendingOrdersSection (04A6B).
    // What matters: no VariantInventorySection component.
    expect(src).not.toContain("VariantInventorySection");
  });
});

// ── G7: Loader retracted ────────────────────────────────────────────────────

describe("G7 — Loader retracted (no variant inventory loading)", () => {
  test("T7a: No VariantInventoryEntry type in loader", () => {
    expect(loaderSrc).not.toContain("VariantInventoryEntry");
  });

  test("T7b: No variantInventory in loader return", () => {
    expect(loaderSrc).not.toContain("variantInventory");
  });

  test("T7c: No warehouseId '10' query in loader", () => {
    expect(loaderSrc).not.toContain('warehouseId: "10"');
  });
});

// ── G8: Field Source Map updated ────────────────────────────────────────────

describe("G8 — Field Source Map reflects retraction", () => {
  test("T8a: variantInventory marked as BLOCKED", () => {
    expect(src).toContain("BLOCKED");
    expect(src).toContain("not reconciled");
  });

  test("T8b: 04A6A1R tag present", () => {
    expect(src).toContain("04A6A1R");
  });
});
