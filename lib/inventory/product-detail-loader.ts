/**
 * lib/inventory/product-detail-loader.ts
 *
 * On-demand product detail enrichment for CommercialProductDrawer.
 *
 * Loads all master data fields from ProductEntity + variants + SAG prices.
 *
 * Sprint: COMERCIAL-INVENTARIO-MASTER-DATA-COMPLETION-02
 *
 * server-only — uses Prisma + SAG SOAP.
 */

import "server-only";

import { prisma } from "@/lib/prisma";
import { createSagDirectDataSource } from "@/lib/comercial/data-sources/sag-direct-commercial-product-data-source";

// ── Result type ────────────────────────────────────────────────────────────

export interface ProductDetailEnrichment {
  reference: string;

  // ── Classification ──
  /** Resolved SAG group name (e.g. "CS NIÑO KIDS") */
  grupoSag: string | null;
  /** Raw category (numeric grupo FK as string — legacy) */
  categoria: string | null;
  /** Resolved SAG line name (e.g. "CASTILLITOS") */
  lineaSag: string | null;
  /** Resolved SAG subgroup name (e.g. "BERMUDA") */
  subgrupoSag: string | null;

  // ── SAG IDs ──
  grupoId: number | null;
  lineaId: number | null;
  subgrupoId: number | null;

  // ── Operational fields ──
  costo: number | null;
  manejaTallaColor: boolean;
  barcode: string | null;
  description2: string | null;
  handlingUnit: string | null;

  // ── Dates ──
  createdAtSag: string | null;
  lastModifiedSag: string | null;
  lastPurchaseSag: string | null;
  lastSaleSag: string | null;

  // ── Prices (SAG SOAP) ──
  precioDetal: number | null;
  precioMayorista: number | null;
  sagPriceQueried: boolean;

  // ── Variants ──
  tallas: string[];
  colores: string[];
  variantCount: number;
}

// ── Loader ─────────────────────────────────────────────────────────────────

export async function loadProductDetail(
  organizationId: string,
  reference: string,
): Promise<ProductDetailEnrichment> {
  const upper = reference.toUpperCase().trim();

  // Prisma steps (1→2) are sequential (step 2 needs product.id).
  // SAG SOAP (step 3) is independent — run in parallel with Prisma.
  // Optimization: COMERCIAL-INVENTARIO-DRAWER-PERFORMANCE-01

  async function loadPrismaData() {
    // 1. Load full master data from ProductEntity
    let product: any = null;
    try {
      product = await (prisma as any).productEntity.findFirst({
        where: {
          organizationId,
          sku: upper,
          externalSource: "sag",
        },
        select: {
          id: true,
          category: true,
          grupoId: true,
          grupoSag: true,
          lineaId: true,
          lineaSag: true,
          subgrupoId: true,
          subgrupoSag: true,
          costo: true,
          manejaTallaColor: true,
          barcode: true,
          description2: true,
          handlingUnit: true,
          createdAtSag: true,
          lastModifiedSag: true,
          lastPurchaseSag: true,
          lastSaleSag: true,
        },
      });
    } catch {
      // ProductEntity may not exist for this SKU — graceful degradation
    }

    // 2. Load variants (tallas + colores) from ProductVariant
    let tallas: string[] = [];
    let colores: string[] = [];
    let variantCount = 0;

    if (product?.id) {
      try {
        const variants = await (prisma as any).productVariant.findMany({
          where: { productId: product.id },
          select: { attributes: true },
        });
        variantCount = variants.length;
        const tallaSet = new Set<string>();
        const colorSet = new Set<string>();
        for (const v of variants) {
          const attrs = v.attributes as Record<string, string> | null;
          if (attrs?.tallaName) tallaSet.add(attrs.tallaName);
          else if (attrs?.talla) tallaSet.add(attrs.talla);
          if (attrs?.colorName) colorSet.add(attrs.colorName);
          else if (attrs?.color) colorSet.add(attrs.color);
        }
        tallas = [...tallaSet].sort();
        colores = [...colorSet].sort();
      } catch {
        // Variants unavailable — graceful degradation
      }
    }

    return { product, tallas, colores, variantCount };
  }

  async function loadSagPrices() {
    // 3. Load PV3/PV4 from SAG SOAP (single-product WHERE clause)
    let precioDetal: number | null = null;
    let precioMayorista: number | null = null;
    let sagPriceQueried = false;

    try {
      const sagDs = createSagDirectDataSource();
      const pair = await sagDs.fetchPriceForSingle(upper);
      sagPriceQueried = true;
      if (pair) {
        precioDetal = pair.pricePV3;
        precioMayorista = pair.pricePV4;
      }
    } catch {
      // SAG SOAP may be unavailable — graceful degradation
    }

    return { precioDetal, precioMayorista, sagPriceQueried };
  }

  const [prismaData, sagData] = await Promise.all([
    loadPrismaData(),
    loadSagPrices(),
  ]);

  const { product, tallas, colores, variantCount } = prismaData;
  const { precioDetal, precioMayorista, sagPriceQueried } = sagData;

  const fmtDate = (d: Date | null | undefined) => d?.toISOString() ?? null;

  return {
    reference: upper,

    grupoSag: product?.grupoSag ?? null,
    categoria: product?.category ?? null,
    lineaSag: product?.lineaSag ?? null,
    subgrupoSag: product?.subgrupoSag ?? null,

    grupoId: product?.grupoId ?? null,
    lineaId: product?.lineaId ?? null,
    subgrupoId: product?.subgrupoId ?? null,

    costo: product?.costo ?? null,
    manejaTallaColor: product?.manejaTallaColor ?? false,
    barcode: product?.barcode ?? null,
    description2: product?.description2 ?? null,
    handlingUnit: product?.handlingUnit ?? null,

    createdAtSag: fmtDate(product?.createdAtSag),
    lastModifiedSag: fmtDate(product?.lastModifiedSag),
    lastPurchaseSag: fmtDate(product?.lastPurchaseSag),
    lastSaleSag: fmtDate(product?.lastSaleSag),

    precioDetal,
    precioMayorista,
    sagPriceQueried,

    tallas,
    colores,
    variantCount,
  };
}
