/**
 * INVENTORY-DRAWER-CANONICAL-04A6A — Drawer Variant Provenance Tests
 *
 * Structural tests verifying:
 *   1. VARIANT_QUANTITY_SOURCE_BLOCKED ruling applied
 *   2. Variant catalog shown without quantities
 *   3. Inventory section shows Existencia/Reservado/Disponible with provenance
 *   4. No prohibited patterns (CCS, PIL, bodega 757, estimated quantities)
 */

import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

const DRAWER_PATH = path.resolve(
  __dirname,
  "../../../components/comercial/commercial-product-drawer.tsx"
);
const src = fs.readFileSync(DRAWER_PATH, "utf-8");

// ── G1: VARIANT_QUANTITY_SOURCE_BLOCKED ruling ─────────────────────────────

describe("G1 — VARIANT_QUANTITY_SOURCE_BLOCKED ruling applied", () => {
  test("T1a: Drawer documents VARIANT_QUANTITY_SOURCE_BLOCKED", () => {
    expect(src).toContain("VARIANT_QUANTITY_SOURCE_BLOCKED");
  });

  test("T1b: Explicit message about SAG not exposing per-variant quantities", () => {
    expect(src).toContain("SAG no expone cantidades certificadas por talla y color");
  });

  test("T1c: No per-variant quantity display", () => {
    // Variants section must NOT show quantity, saldo, or disponible per talla/color
    const varSection = src.slice(
      src.indexOf("Variantes"),
      src.indexOf("Inventario B01")
    );
    expect(varSection).not.toContain("saldo");
    expect(varSection).not.toContain("disponibleReal");
    expect(varSection).not.toContain("quantity");
  });
});

// ── G2: Variant catalog display ────────────────────────────────────────────

describe("G2 — Variant catalog display (chips, no quantities)", () => {
  test("T2a: Tallas shown as TagChip components", () => {
    expect(src).toContain("product.tallas.map(t => <TagChip key={t} label={t} />)");
  });

  test("T2b: Colores shown as TagChip components", () => {
    expect(src).toContain("product.colores.map(c => <TagChip key={c} label={c} />)");
  });

  test("T2c: Variant count shown in section title", () => {
    expect(src).toContain("product.variantCount");
  });

  test("T2d: Catalog provenance note present", () => {
    expect(src).toContain("Variantes de catalogo");
  });
});

// ── G3: Inventory section with SAG provenance ──────────────────────────────

describe("G3 — Inventory section with SAG provenance", () => {
  test("T3a: Section titled 'Inventario B01 — Bodega Principal'", () => {
    expect(src).toContain("Inventario B01");
    expect(src).toContain("Bodega Principal");
  });

  test("T3b: Existencia B01 field present", () => {
    expect(src).toContain('label="Existencia B01"');
  });

  test("T3c: Reservado SAG field present", () => {
    expect(src).toContain('label="Reservado SAG"');
  });

  test("T3d: Disponible SAG field present", () => {
    expect(src).toContain('label="Disponible SAG"');
  });

  test("T3e: Negative disponible shown in parentheses", () => {
    expect(src).toContain("Math.abs(product.disponible)");
  });

  test("T3f: Source provenance label present", () => {
    expect(src).toContain("vw_agentik_inventario");
    expect(src).toContain("B01 Bodega Principal");
  });
});

// ── G4: Production section separate ────────────────────────────────────────

describe("G4 — Production section not summed into disponible", () => {
  test("T4a: Production section exists", () => {
    expect(src).toContain("Produccion abierta");
  });

  test("T4b: Production labeled as 'Programado en ordenes abiertas'", () => {
    expect(src).toContain("Programado en ordenes abiertas");
  });

  test("T4c: Production explicitly not included in disponible", () => {
    expect(src).toContain("No incluido en disponible actual");
  });
});

// ── G5: Prohibited patterns absent ─────────────────────────────────────────

describe("G5 — Prohibited patterns absent", () => {
  test("T5a: No 'Stock fisico bodega 757'", () => {
    expect(src).not.toContain("757");
    expect(src).not.toContain("Stock fisico bodega");
  });

  test("T5b: No CCS references", () => {
    expect(src).not.toContain("CCS");
  });

  test("T5c: No 'PIL' references in UI text", () => {
    // PIL may appear in source comments but not in user-facing labels
    const uiSection = src.slice(src.indexOf("return ("), src.indexOf("// ── Sub-components"));
    expect(uiSection).not.toContain(">PIL<");
    expect(uiSection).not.toContain("label=\"PIL");
  });

  test("T5d: No B04 in inventory display", () => {
    const uiSection = src.slice(src.indexOf("return ("), src.indexOf("// ── Sub-components"));
    expect(uiSection).not.toContain("B04");
  });

  test("T5e: No estimated/divided quantities per variant", () => {
    // Must not divide total by variant count or estimate per-variant stock
    expect(src).not.toContain("/ variantCount");
    expect(src).not.toContain("/ product.variantCount");
    expect(src).not.toContain("estimated");
  });
});

// ── G6: Data source documentation ──────────────────────────────────────────

describe("G6 — Data source documentation in drawer", () => {
  test("T6a: Field Source Map documents tallas source", () => {
    expect(src).toContain("ProductVariant.attributes.tallaName");
  });

  test("T6b: Field Source Map documents colores source", () => {
    expect(src).toContain("ProductVariant.attributes.colorName");
  });

  test("T6c: Field Source Map documents disponible source", () => {
    expect(src).toContain("InventoryItem.disponibleReal");
  });
});
