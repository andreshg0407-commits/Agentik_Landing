/**
 * lib/products/canonical-product-types.ts
 *
 * AGENTIK-PRODUCTS-CANONICAL-FOUNDATION-01
 *
 * Canonical product types derived from certified fields of vw_agentik_productos.
 * These types represent the CERTIFIED CONTRACT — only fields that passed
 * the SAG view certification audit are included.
 *
 * NOT included (pending SAG resolution):
 *   - ka_nl_articulo (B1 blocker — SAG must add to SELECT)
 *   - supplier (B2 — 1.7% coverage, unusable)
 *   - brand (B4 — alias of LINEA, misleading)
 *   - discontinued (B3 — hardcoded NULL)
 *
 * This file does NOT replace ProductProfile (data-layer/domains/product/).
 * ProductProfile models the full ERP article including IVA, lots, blocking.
 * CanonicalProduct models the CERTIFIED VIEW contract for catalog operations.
 *
 * No Prisma. No React. No server-only. Pure types.
 */

// ── Certified Fields Contract ───────────────────────────────────────────────
// These are the ONLY fields from vw_agentik_productos that passed certification.

export interface SagProductViewRow {
  readonly CODIGO_PRODUCTO: string;
  readonly CODIGO_BARRAS: string | null;
  readonly NOMBRE_PRODUCTO: string;
  readonly DESCRIPCION: string | null;
  readonly TALLA: string | null;
  readonly CODIGO_COLOR: string | null;
  readonly DETALLE_COLOR: string | null;
  readonly LINEA: string | null;
  readonly CATEGORIA: string;
  readonly SUBCATEGORIA: string | null;
  readonly UNIDAD_MEDIDA: string;
  readonly PRECIO_LISTA: number | null;
  readonly COSTO_PROMEDIO: number | null;
  readonly ESTADO: "Activo" | "Inactivo";
  readonly FECHA_CREACION: string;        // ISO date
  readonly FECHA_ULTIMA_VENTA: string | null; // ISO date
  // EXCLUDED: MARCA (= LINEA alias), PROVEEDOR (1.7%), DESCONTINUADO (NULL)
}

// ── CanonicalProduct ────────────────────────────────────────────────────────
// One row per REFERENCE (not per variant).

export interface CanonicalProduct {
  // ── Identity ──────────────────────────────────────────────────────
  readonly referenceCode: string;
  readonly externalIdentity: CanonicalProductExternalIdentity;
  readonly source: "SAG_VIEW" | "SAG_DIRECT" | "MANUAL";
  readonly snapshotAt: Date;

  // ── Description ───────────────────────────────────────────────────
  readonly name: string;
  readonly description: string | null;

  // ── Classification ────────────────────────────────────────────────
  readonly classification: CanonicalProductClassification;

  // ── Commercial ────────────────────────────────────────────────────
  readonly listPrice: number | null;
  readonly averageCost: number | null;
  readonly unitOfMeasure: string;
  readonly active: boolean;

  // ── Lifecycle ─────────────────────────────────────────────────────
  readonly lifecycle: CanonicalProductLifecycle;

  // ── Variants ──────────────────────────────────────────────────────
  readonly hasVariants: boolean;
  readonly variantCount: number;
  readonly variants: readonly CanonicalProductVariant[];
}

// ── CanonicalProductVariant ─────────────────────────────────────────────────
// One row per TALLA/COLOR combination.

export interface CanonicalProductVariant {
  readonly referenceCode: string;
  readonly size: string | null;
  readonly colorCode: string | null;
  readonly colorName: string | null;
  readonly barcode: string | null;
}

// ── CanonicalProductClassification ──────────────────────────────────────────

export interface CanonicalProductClassification {
  /** LINEA from SAG view. NULL for 20.3% of catalog. */
  readonly line: string | null;
  /** CATEGORIA (grupo) — always present, INNER JOIN in SAG view. */
  readonly group: string;
  /** SUBCATEGORIA (subgrupo) — NULL for 46% of catalog. */
  readonly subgroup: string | null;
  /**
   * Derived product type based on CATEGORIA.
   * NOT a certified SAG field — computed by Agentik.
   */
  readonly productType: CanonicalProductType;
}

export type CanonicalProductType =
  | "PRODUCTO_TERMINADO"
  | "MATERIA_PRIMA"
  | "INSUMO"
  | "EN_PROCESO"
  | "OTRA_UNIDAD_NEGOCIO"
  | "DESCONOCIDO";

/**
 * Maps CATEGORIA from vw_agentik_productos to CanonicalProductType.
 * Pure function, no side effects.
 */
export function resolveProductType(categoria: string): CanonicalProductType {
  const upper = (categoria || "").toUpperCase().trim();

  // Finished goods — all commercial line categories + generic PRODUCTO TERMINADO
  if (
    upper === "PRODUCTO TERMINADO" ||
    upper.startsWith("LT ") ||      // LT NINO KIDS, LT NINA KIDS, etc.
    upper.startsWith("CS ") ||       // CS NINO BEBE, CS NINA BEBE, etc.
    upper === "IMPORTACION" ||
    upper.startsWith("BASICA") ||
    upper.startsWith("PIJAMA")
  ) {
    return "PRODUCTO_TERMINADO";
  }

  if (upper === "TELAS") return "MATERIA_PRIMA";
  if (upper === "INSUMOS") return "INSUMO";
  if (upper === "PRODUCTO EN PROCESO") return "EN_PROCESO";
  if (upper === "JUPITER PETS") return "OTRA_UNIDAD_NEGOCIO";

  return "DESCONOCIDO";
}

// ── CanonicalProductLifecycle ───────────────────────────────────────────────

export interface CanonicalProductLifecycle {
  readonly createdAt: Date;
  readonly lastSaleAt: Date | null;
  /**
   * Commercial validity classification.
   * Provisional — does NOT depend on sc_descontinuado (always NULL in SAG).
   */
  readonly commercialValidity: CommercialValidity;
}

/**
 * Provisional commercial validity classification.
 * Designed to work WITHOUT sc_descontinuado (B3 blocker).
 *
 * Rules:
 *   ACTIVE_COMMERCIAL:    active=true AND line IS NOT NULL AND lastSaleAt >= cutoff
 *   ACTIVE_UNCLASSIFIED:  active=true AND line IS NULL AND lastSaleAt >= cutoff
 *   MATERIAL_OR_INPUT:    active=true AND productType in (MATERIA_PRIMA, INSUMO, EN_PROCESO)
 *   HISTORICAL_REVIEW:    active=true AND not matching above
 *   INACTIVE:             active=false
 *   UNKNOWN:              fallback (should not occur with complete data)
 *
 * Validated against 8,830 SAG references (FASE FINAL audit 2026-07-28):
 *   ACTIVE_COMMERCIAL:    2,121 refs (24.0%)
 *   ACTIVE_UNCLASSIFIED:     21 refs (0.2%) — active, selling, but missing LINEA
 *   MATERIAL_OR_INPUT:    3,598 refs (40.7%) — TELAS/INSUMOS/EN_PROCESO sin LINEA
 *   HISTORICAL_REVIEW:    3,072 refs (34.8%)
 *   INACTIVE:                18 refs (0.2%)
 */
export type CommercialValidity =
  | "ACTIVE_COMMERCIAL"
  | "ACTIVE_UNCLASSIFIED"
  | "MATERIAL_OR_INPUT"
  | "HISTORICAL_REVIEW"
  | "INACTIVE"
  | "UNKNOWN";

/**
 * Compute commercial validity from certified fields.
 * Pure function. Provisional — will evolve when SAG delivers DESCONTINUADO.
 */
export function resolveCommercialValidity(input: {
  active: boolean;
  line: string | null;
  lastSaleAt: Date | null;
  productType?: CanonicalProductType;
  validityCutoffDate?: Date;
}): CommercialValidity {
  const cutoff = input.validityCutoffDate ?? new Date("2025-01-01");

  if (!input.active) return "INACTIVE";

  // Materials and inputs are a separate lifecycle — they don't have LINEA
  const pt = input.productType;
  if (pt === "MATERIA_PRIMA" || pt === "INSUMO" || pt === "EN_PROCESO") {
    return "MATERIAL_OR_INPUT";
  }

  const hasLine = input.line != null && input.line.trim() !== "";
  const hasRecentSale = input.lastSaleAt != null && input.lastSaleAt >= cutoff;

  if (hasLine && hasRecentSale) return "ACTIVE_COMMERCIAL";
  if (!hasLine && hasRecentSale) return "ACTIVE_UNCLASSIFIED";
  return "HISTORICAL_REVIEW";
}

// ── CanonicalProductExternalIdentity ────────────────────────────────────────

/**
 * Provisional external identity.
 * Uses referenceCode (k_sc_codigo_articulo) as primary key
 * because ka_nl_articulo is NOT exposed in the SAG view (B1 blocker).
 *
 * Identity Safety Certification (FASE FINAL 2026-07-28):
 *   - 0 refs with multiple ka_nl_articulo (1:1 mapping confirmed)
 *   - 0 duplicate externalId in Agentik ProductEntity
 *   - Verdict: SAFE_PROVISIONAL_IDENTITY
 *
 * PROVISIONAL_EXTERNAL_IDENTITY — marked explicitly.
 * Do NOT use for:
 *   - Destructive migrations
 *   - Permanent operational JOINs
 *
 * When SAG delivers ka_nl_articulo:
 *   - Migrate to externalProductId = ka_nl_articulo
 *   - Keep referenceCode as secondary natural key
 */
export interface CanonicalProductExternalIdentity {
  readonly organizationId: string;
  readonly sourceSystem: "SAG";
  readonly referenceCode: string;
  /**
   * SAG internal PK. NULL until SAG adds ka_nl_articulo to the view.
   * When populated, this becomes the authoritative external ID.
   */
  readonly externalProductId: number | null;
  readonly identityStatus: "PROVISIONAL_EXTERNAL_IDENTITY" | "CONFIRMED_EXTERNAL_IDENTITY";
}

// ── Mapping from SAG View Row ───────────────────────────────────────────────

/**
 * Maps a single SAG view row to CanonicalProductVariant.
 * The view returns one row per variant (talla/color).
 */
export function mapViewRowToVariant(row: SagProductViewRow): CanonicalProductVariant {
  return {
    referenceCode: row.CODIGO_PRODUCTO,
    size: row.TALLA ?? null,
    colorCode: row.CODIGO_COLOR ?? null,
    colorName: row.DETALLE_COLOR ?? null,
    barcode: row.CODIGO_BARRAS ?? null,
  };
}

/**
 * Groups SAG view rows by CODIGO_PRODUCTO and builds CanonicalProduct array.
 * Pure function. No DB access.
 */
export function buildCanonicalProducts(
  rows: readonly SagProductViewRow[],
  organizationId: string,
  snapshotAt: Date = new Date(),
): CanonicalProduct[] {
  const groups = new Map<string, SagProductViewRow[]>();

  for (const row of rows) {
    const code = row.CODIGO_PRODUCTO;
    if (!code || code.trim() === "") continue;
    let group = groups.get(code);
    if (!group) { group = []; groups.set(code, group); }
    group.push(row);
  }

  const products: CanonicalProduct[] = [];

  for (const [code, rowGroup] of groups) {
    const first = rowGroup[0];
    const active = first.ESTADO === "Activo";
    const lastSaleAt = first.FECHA_ULTIMA_VENTA
      ? new Date(first.FECHA_ULTIMA_VENTA)
      : null;
    const createdAt = new Date(first.FECHA_CREACION);
    const hasVariants = rowGroup.length > 1 ||
      (first.TALLA != null || first.CODIGO_COLOR != null);

    products.push({
      referenceCode: code,
      externalIdentity: {
        organizationId,
        sourceSystem: "SAG",
        referenceCode: code,
        externalProductId: null, // B1 blocker: ka_nl_articulo not in view
        identityStatus: "PROVISIONAL_EXTERNAL_IDENTITY",
      },
      source: "SAG_VIEW",
      snapshotAt,
      name: first.NOMBRE_PRODUCTO,
      description: first.DESCRIPCION ?? null,
      classification: {
        line: first.LINEA ?? null,
        group: first.CATEGORIA,
        subgroup: first.SUBCATEGORIA ?? null,
        productType: resolveProductType(first.CATEGORIA),
      },
      listPrice: first.PRECIO_LISTA ?? null,
      averageCost: first.COSTO_PROMEDIO ?? null,
      unitOfMeasure: first.UNIDAD_MEDIDA,
      active,
      lifecycle: {
        createdAt,
        lastSaleAt,
        commercialValidity: resolveCommercialValidity({
          active,
          line: first.LINEA,
          lastSaleAt,
          productType: resolveProductType(first.CATEGORIA),
        }),
      },
      hasVariants,
      variantCount: rowGroup.length,
      variants: rowGroup.map(mapViewRowToVariant),
    });
  }

  return products;
}

// ── Certification Result Types ──────────────────────────────────────────────

export type CertificationVerdict =
  | "MATCH"
  | "CLASSIFICATION_DIFFERENCE"
  | "LIFECYCLE_DIFFERENCE"
  | "VARIANT_DIFFERENCE"
  | "MISSING_EXTERNAL_ID"
  | "UNKNOWN";

export interface CertificationRecord {
  readonly referenceCode: string;
  readonly category: string;
  readonly verdict: CertificationVerdict;
  readonly details: string;
}
