/**
 * lib/products/__tests__/canonical-product-types.test.ts
 *
 * AGENTIK-PRODUCTS-CANONICAL-FOUNDATION-01 — NOVENO
 *
 * Pure unit tests for all canonical product functions.
 * No DB, no SAG, no network. 100% deterministic.
 */

import { describe, it, expect } from "vitest";
import {
  resolveProductType,
  resolveCommercialValidity,
  mapViewRowToVariant,
  buildCanonicalProducts,
  type SagProductViewRow,
  type CommercialValidity,
  type CanonicalProductType,
} from "../canonical-product-types";

// ── Helpers ─────────────────────────────────────────────────────────

function makeRow(overrides: Partial<SagProductViewRow> = {}): SagProductViewRow {
  return {
    CODIGO_PRODUCTO: "L-1234",
    CODIGO_BARRAS: "7701234567890",
    NOMBRE_PRODUCTO: "PIJAMA NIÑA KIDS",
    DESCRIPCION: null,
    TALLA: "4",
    CODIGO_COLOR: "RO",
    DETALLE_COLOR: "ROJO",
    LINEA: "LATIN KIDS",
    CATEGORIA: "LT NINA KIDS",
    SUBCATEGORIA: "PIJAMA CORTA",
    UNIDAD_MEDIDA: "UND",
    PRECIO_LISTA: 45000,
    COSTO_PROMEDIO: 12000,
    ESTADO: "Activo",
    FECHA_CREACION: "2023-01-15",
    FECHA_ULTIMA_VENTA: "2025-06-10",
    ...overrides,
  };
}

// ── resolveProductType ──────────────────────────────────────────────

describe("resolveProductType", () => {
  it("classifies PRODUCTO TERMINADO", () => {
    expect(resolveProductType("PRODUCTO TERMINADO")).toBe("PRODUCTO_TERMINADO");
  });

  it("classifies LT-prefixed categories as PRODUCTO_TERMINADO", () => {
    expect(resolveProductType("LT NINO KIDS")).toBe("PRODUCTO_TERMINADO");
    expect(resolveProductType("LT NINA KIDS")).toBe("PRODUCTO_TERMINADO");
    expect(resolveProductType("LT NINA BEBE")).toBe("PRODUCTO_TERMINADO");
  });

  it("classifies CS-prefixed categories as PRODUCTO_TERMINADO", () => {
    expect(resolveProductType("CS NINO BEBE")).toBe("PRODUCTO_TERMINADO");
    expect(resolveProductType("CS NINA BEBE")).toBe("PRODUCTO_TERMINADO");
  });

  it("classifies IMPORTACION as PRODUCTO_TERMINADO", () => {
    expect(resolveProductType("IMPORTACION")).toBe("PRODUCTO_TERMINADO");
  });

  it("classifies BASICA* as PRODUCTO_TERMINADO", () => {
    expect(resolveProductType("BASICA")).toBe("PRODUCTO_TERMINADO");
    expect(resolveProductType("BASICA MUJER")).toBe("PRODUCTO_TERMINADO");
  });

  it("classifies PIJAMA* as PRODUCTO_TERMINADO", () => {
    expect(resolveProductType("PIJAMA CORTA")).toBe("PRODUCTO_TERMINADO");
    expect(resolveProductType("PIJAMAS DAMA")).toBe("PRODUCTO_TERMINADO");
  });

  it("classifies TELAS as MATERIA_PRIMA", () => {
    expect(resolveProductType("TELAS")).toBe("MATERIA_PRIMA");
  });

  it("classifies INSUMOS as INSUMO", () => {
    expect(resolveProductType("INSUMOS")).toBe("INSUMO");
  });

  it("classifies PRODUCTO EN PROCESO as EN_PROCESO", () => {
    expect(resolveProductType("PRODUCTO EN PROCESO")).toBe("EN_PROCESO");
  });

  it("classifies JUPITER PETS as OTRA_UNIDAD_NEGOCIO", () => {
    expect(resolveProductType("JUPITER PETS")).toBe("OTRA_UNIDAD_NEGOCIO");
  });

  it("returns DESCONOCIDO for unknown categories", () => {
    expect(resolveProductType("RANDOM")).toBe("DESCONOCIDO");
    expect(resolveProductType("")).toBe("DESCONOCIDO");
  });

  it("is case-insensitive", () => {
    expect(resolveProductType("telas")).toBe("MATERIA_PRIMA");
    expect(resolveProductType("Insumos")).toBe("INSUMO");
    expect(resolveProductType("producto terminado")).toBe("PRODUCTO_TERMINADO");
  });

  it("trims whitespace", () => {
    expect(resolveProductType("  TELAS  ")).toBe("MATERIA_PRIMA");
  });

  it("handles null-ish input safely", () => {
    expect(resolveProductType(null as any)).toBe("DESCONOCIDO");
    expect(resolveProductType(undefined as any)).toBe("DESCONOCIDO");
  });
});

// ── resolveCommercialValidity ───────────────────────────────────────

describe("resolveCommercialValidity", () => {
  const cutoff = new Date("2025-01-01");

  it("returns INACTIVE when not active", () => {
    expect(resolveCommercialValidity({
      active: false,
      line: "LATIN KIDS",
      lastSaleAt: new Date("2025-06-01"),
    })).toBe("INACTIVE");
  });

  it("returns MATERIAL_OR_INPUT for MATERIA_PRIMA", () => {
    expect(resolveCommercialValidity({
      active: true,
      line: null,
      lastSaleAt: null,
      productType: "MATERIA_PRIMA",
    })).toBe("MATERIAL_OR_INPUT");
  });

  it("returns MATERIAL_OR_INPUT for INSUMO", () => {
    expect(resolveCommercialValidity({
      active: true,
      line: null,
      lastSaleAt: new Date("2025-03-01"),
      productType: "INSUMO",
    })).toBe("MATERIAL_OR_INPUT");
  });

  it("returns MATERIAL_OR_INPUT for EN_PROCESO", () => {
    expect(resolveCommercialValidity({
      active: true,
      line: null,
      lastSaleAt: null,
      productType: "EN_PROCESO",
    })).toBe("MATERIAL_OR_INPUT");
  });

  it("returns ACTIVE_COMMERCIAL with line + recent sale", () => {
    expect(resolveCommercialValidity({
      active: true,
      line: "LATIN KIDS",
      lastSaleAt: new Date("2025-06-01"),
    })).toBe("ACTIVE_COMMERCIAL");
  });

  it("returns ACTIVE_UNCLASSIFIED without line but with recent sale", () => {
    expect(resolveCommercialValidity({
      active: true,
      line: null,
      lastSaleAt: new Date("2025-03-01"),
      productType: "PRODUCTO_TERMINADO",
    })).toBe("ACTIVE_UNCLASSIFIED");
  });

  it("returns ACTIVE_UNCLASSIFIED for empty-string line with recent sale", () => {
    expect(resolveCommercialValidity({
      active: true,
      line: "   ",
      lastSaleAt: new Date("2025-06-01"),
      productType: "PRODUCTO_TERMINADO",
    })).toBe("ACTIVE_UNCLASSIFIED");
  });

  it("returns HISTORICAL_REVIEW with line but old sale", () => {
    expect(resolveCommercialValidity({
      active: true,
      line: "CASTILLITOS",
      lastSaleAt: new Date("2024-06-01"),
    })).toBe("HISTORICAL_REVIEW");
  });

  it("returns HISTORICAL_REVIEW with line but null sale", () => {
    expect(resolveCommercialValidity({
      active: true,
      line: "IMPORTACION",
      lastSaleAt: null,
    })).toBe("HISTORICAL_REVIEW");
  });

  it("returns HISTORICAL_REVIEW without line and without recent sale", () => {
    expect(resolveCommercialValidity({
      active: true,
      line: null,
      lastSaleAt: new Date("2023-01-01"),
      productType: "PRODUCTO_TERMINADO",
    })).toBe("HISTORICAL_REVIEW");
  });

  it("respects custom cutoff date", () => {
    expect(resolveCommercialValidity({
      active: true,
      line: "LATIN KIDS",
      lastSaleAt: new Date("2024-07-01"),
      validityCutoffDate: new Date("2024-01-01"),
    })).toBe("ACTIVE_COMMERCIAL");
  });

  it("INACTIVE takes precedence over MATERIAL_OR_INPUT", () => {
    expect(resolveCommercialValidity({
      active: false,
      line: null,
      lastSaleAt: null,
      productType: "MATERIA_PRIMA",
    })).toBe("INACTIVE");
  });

  it("defaults productType to undefined (no MATERIAL_OR_INPUT)", () => {
    // When productType not provided, should NOT return MATERIAL_OR_INPUT
    expect(resolveCommercialValidity({
      active: true,
      line: null,
      lastSaleAt: null,
    })).toBe("HISTORICAL_REVIEW");
  });
});

// ── mapViewRowToVariant ─────────────────────────────────────────────

describe("mapViewRowToVariant", () => {
  it("maps all fields correctly", () => {
    const row = makeRow();
    const variant = mapViewRowToVariant(row);
    expect(variant).toEqual({
      referenceCode: "L-1234",
      size: "4",
      colorCode: "RO",
      colorName: "ROJO",
      barcode: "7701234567890",
    });
  });

  it("handles null fields", () => {
    const row = makeRow({
      TALLA: null,
      CODIGO_COLOR: null,
      DETALLE_COLOR: null,
      CODIGO_BARRAS: null,
    });
    const variant = mapViewRowToVariant(row);
    expect(variant.size).toBeNull();
    expect(variant.colorCode).toBeNull();
    expect(variant.colorName).toBeNull();
    expect(variant.barcode).toBeNull();
  });
});

// ── buildCanonicalProducts ──────────────────────────────────────────

describe("buildCanonicalProducts", () => {
  const orgId = "org-test-123";
  const snapshot = new Date("2025-07-01T00:00:00Z");

  it("groups rows by CODIGO_PRODUCTO", () => {
    const rows = [
      makeRow({ CODIGO_PRODUCTO: "L-1234", TALLA: "4", CODIGO_COLOR: "RO" }),
      makeRow({ CODIGO_PRODUCTO: "L-1234", TALLA: "6", CODIGO_COLOR: "RO" }),
      makeRow({ CODIGO_PRODUCTO: "L-1234", TALLA: "4", CODIGO_COLOR: "AZ" }),
      makeRow({ CODIGO_PRODUCTO: "C-5678", TALLA: "2" }),
    ];
    const products = buildCanonicalProducts(rows, orgId, snapshot);
    expect(products).toHaveLength(2);
    const l1234 = products.find(p => p.referenceCode === "L-1234")!;
    expect(l1234.variantCount).toBe(3);
    expect(l1234.hasVariants).toBe(true);
    const c5678 = products.find(p => p.referenceCode === "C-5678")!;
    expect(c5678.variantCount).toBe(1);
  });

  it("skips empty/null CODIGO_PRODUCTO", () => {
    const rows = [
      makeRow({ CODIGO_PRODUCTO: "" }),
      makeRow({ CODIGO_PRODUCTO: "  " }),
      makeRow({ CODIGO_PRODUCTO: "L-1234" }),
    ];
    const products = buildCanonicalProducts(rows, orgId, snapshot);
    expect(products).toHaveLength(1);
    expect(products[0].referenceCode).toBe("L-1234");
  });

  it("sets PROVISIONAL_EXTERNAL_IDENTITY", () => {
    const products = buildCanonicalProducts([makeRow()], orgId, snapshot);
    expect(products[0].externalIdentity).toEqual({
      organizationId: orgId,
      sourceSystem: "SAG",
      referenceCode: "L-1234",
      externalProductId: null,
      identityStatus: "PROVISIONAL_EXTERNAL_IDENTITY",
    });
  });

  it("resolves classification from CATEGORIA", () => {
    const products = buildCanonicalProducts([
      makeRow({ CATEGORIA: "TELAS", LINEA: null }),
    ], orgId, snapshot);
    expect(products[0].classification.productType).toBe("MATERIA_PRIMA");
  });

  it("resolves commercial validity with productType", () => {
    // TELAS + active = MATERIAL_OR_INPUT
    const products = buildCanonicalProducts([
      makeRow({ CATEGORIA: "TELAS", LINEA: null, ESTADO: "Activo" }),
    ], orgId, snapshot);
    expect(products[0].lifecycle.commercialValidity).toBe("MATERIAL_OR_INPUT");
  });

  it("marks active commercial correctly", () => {
    const products = buildCanonicalProducts([
      makeRow({
        LINEA: "LATIN KIDS",
        ESTADO: "Activo",
        FECHA_ULTIMA_VENTA: "2025-06-01",
        CATEGORIA: "LT NINA KIDS",
      }),
    ], orgId, snapshot);
    expect(products[0].lifecycle.commercialValidity).toBe("ACTIVE_COMMERCIAL");
    expect(products[0].active).toBe(true);
  });

  it("marks inactive correctly", () => {
    const products = buildCanonicalProducts([
      makeRow({ ESTADO: "Inactivo" }),
    ], orgId, snapshot);
    expect(products[0].lifecycle.commercialValidity).toBe("INACTIVE");
    expect(products[0].active).toBe(false);
  });

  it("marks historical review for old sales", () => {
    const products = buildCanonicalProducts([
      makeRow({
        LINEA: "CASTILLITOS",
        ESTADO: "Activo",
        FECHA_ULTIMA_VENTA: "2023-06-01",
        CATEGORIA: "CS NINO BEBE",
      }),
    ], orgId, snapshot);
    expect(products[0].lifecycle.commercialValidity).toBe("HISTORICAL_REVIEW");
  });

  it("maps cost and price", () => {
    const products = buildCanonicalProducts([
      makeRow({ PRECIO_LISTA: 45000, COSTO_PROMEDIO: 12000 }),
    ], orgId, snapshot);
    expect(products[0].listPrice).toBe(45000);
    expect(products[0].averageCost).toBe(12000);
  });

  it("handles null cost and price", () => {
    const products = buildCanonicalProducts([
      makeRow({ PRECIO_LISTA: null, COSTO_PROMEDIO: null }),
    ], orgId, snapshot);
    expect(products[0].listPrice).toBeNull();
    expect(products[0].averageCost).toBeNull();
  });

  it("sets source as SAG_VIEW", () => {
    const products = buildCanonicalProducts([makeRow()], orgId, snapshot);
    expect(products[0].source).toBe("SAG_VIEW");
  });

  it("detects hasVariants for single row with TALLA", () => {
    const products = buildCanonicalProducts([
      makeRow({ TALLA: "8", CODIGO_COLOR: null }),
    ], orgId, snapshot);
    expect(products[0].hasVariants).toBe(true);
  });

  it("detects no variants for single row without TALLA or COLOR", () => {
    const products = buildCanonicalProducts([
      makeRow({ TALLA: null, CODIGO_COLOR: null }),
    ], orgId, snapshot);
    expect(products[0].hasVariants).toBe(false);
  });

  it("returns empty array for empty input", () => {
    const products = buildCanonicalProducts([], orgId, snapshot);
    expect(products).toEqual([]);
  });
});
