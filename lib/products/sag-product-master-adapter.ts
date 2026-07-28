/**
 * lib/products/sag-product-master-adapter.ts
 *
 * AGENTIK-PRODUCTS-CANONICAL-FOUNDATION-01 — SEPTIMO
 *
 * Adapter that maps vw_agentik_productos rows to CanonicalProduct.
 * This adapter is NOT connected to production.
 * It exists SOLELY for comparison scripts and pre-migration validation.
 *
 * Usage:
 *   const adapter = createSagProductMasterAdapter(consultaSagJson, sagConfig);
 *   const snapshot = await adapter.fetchSnapshot();
 *   const products = adapter.toCanonical(snapshot, orgId);
 *
 * NOT for:
 *   - Production sync
 *   - Prisma persistence
 *   - Replacing existing loaders (sag-articles-sync.ts)
 *   - Operational JOINs
 *
 * No Prisma. No React. No server-only.
 */

import type {
  SagProductViewRow,
  CanonicalProduct,
  CommercialValidity,
  CanonicalProductType,
} from "./canonical-product-types";

import {
  buildCanonicalProducts,
  resolveCommercialValidity,
  resolveProductType,
} from "./canonical-product-types";

// ── Adapter Config ──────────────────────────────────────────────────────────

export interface SagProductMasterConfig {
  readonly token: string;
  readonly database: string;
  readonly endpointUrl: string;
}

export type SagQueryFn = (
  config: SagProductMasterConfig,
  query: string,
) => Promise<any[]>;

// ── Snapshot ─────────────────────────────────────────────────────────────────

export interface SagProductMasterSnapshot {
  readonly rows: readonly SagProductViewRow[];
  readonly fetchedAt: Date;
  readonly totalRows: number;
  readonly distinctRefs: number;
}

// ── Comparison Result ───────────────────────────────────────────────────────

export interface ProductComparisonRecord {
  readonly referenceCode: string;
  readonly inSagView: boolean;
  readonly inAgentik: boolean;
  readonly sagViewLine: string | null;
  readonly agentikProductLine: string | null;
  readonly sagViewActive: boolean;
  readonly agentikStatus: string | null;
  readonly sagViewCosto: number | null;
  readonly agentikCosto: number | null;
  readonly commercialValidity: CommercialValidity;
  readonly productType: CanonicalProductType;
  readonly differences: string[];
}

// ── Adapter ─────────────────────────────────────────────────────────────────

export interface SagProductMasterAdapter {
  /**
   * Fetches ALL rows from vw_agentik_productos.
   * WARNING: ~72,000 rows. Use only in scripts, never in request handlers.
   */
  fetchSnapshot(): Promise<SagProductMasterSnapshot>;

  /**
   * Converts snapshot rows to CanonicalProduct array.
   * Groups by CODIGO_PRODUCTO, builds variants, computes classifications.
   */
  toCanonical(
    snapshot: SagProductMasterSnapshot,
    organizationId: string,
  ): CanonicalProduct[];

  /**
   * Fetches a single reference's rows from the view.
   * For targeted comparison scripts.
   */
  fetchReference(referenceCode: string): Promise<SagProductViewRow[]>;

  /**
   * Compares a CanonicalProduct against an Agentik ProductEntity record.
   * Returns list of field-level differences.
   */
  compareWithAgentik(
    canonical: CanonicalProduct,
    agentikRecord: {
      externalId: string;
      name: string;
      productLine: string | null;
      status: string;
      costo: number | null;
      category: string | null;
    },
  ): ProductComparisonRecord;
}

// ── Factory ─────────────────────────────────────────────────────────────────

export function createSagProductMasterAdapter(
  queryFn: SagQueryFn,
  config: SagProductMasterConfig,
): SagProductMasterAdapter {

  return {
    async fetchSnapshot(): Promise<SagProductMasterSnapshot> {
      const fetchedAt = new Date();

      // The view has ~72,808 rows. Fetch all.
      const rows: SagProductViewRow[] = await queryFn(config, `
        SELECT
          CODIGO_PRODUCTO, CODIGO_BARRAS, NOMBRE_PRODUCTO, DESCRIPCION,
          TALLA, CODIGO_COLOR, DETALLE_COLOR,
          LINEA, CATEGORIA, SUBCATEGORIA,
          UNIDAD_MEDIDA, PRECIO_LISTA, COSTO_PROMEDIO,
          ESTADO, FECHA_CREACION, FECHA_ULTIMA_VENTA
        FROM vw_agentik_productos
        WHERE CODIGO_PRODUCTO IS NOT NULL AND CODIGO_PRODUCTO != ''
      `);

      const distinctRefs = new Set(rows.map(r => r.CODIGO_PRODUCTO)).size;

      return {
        rows,
        fetchedAt,
        totalRows: rows.length,
        distinctRefs,
      };
    },

    toCanonical(
      snapshot: SagProductMasterSnapshot,
      organizationId: string,
    ): CanonicalProduct[] {
      return buildCanonicalProducts(
        snapshot.rows,
        organizationId,
        snapshot.fetchedAt,
      );
    },

    async fetchReference(referenceCode: string): Promise<SagProductViewRow[]> {
      const escaped = referenceCode.replace(/'/g, "''");
      return queryFn(config, `
        SELECT
          CODIGO_PRODUCTO, CODIGO_BARRAS, NOMBRE_PRODUCTO, DESCRIPCION,
          TALLA, CODIGO_COLOR, DETALLE_COLOR,
          LINEA, CATEGORIA, SUBCATEGORIA,
          UNIDAD_MEDIDA, PRECIO_LISTA, COSTO_PROMEDIO,
          ESTADO, FECHA_CREACION, FECHA_ULTIMA_VENTA
        FROM vw_agentik_productos
        WHERE CODIGO_PRODUCTO = '${escaped}'
      `);
    },

    compareWithAgentik(canonical, agentikRecord): ProductComparisonRecord {
      const diffs: string[] = [];

      // Name comparison
      const cName = canonical.name.trim().toLowerCase();
      const aName = (agentikRecord.name || "").trim().toLowerCase();
      if (cName !== aName) diffs.push("NAME");

      // Line comparison (SAG view LINEA vs Agentik productLine number)
      // SAG view uses text: "LATIN KIDS", "CASTILLITOS", "IMPORTACION"
      // Agentik uses numeric: "1", "2", "5"
      // This is expected — not a real difference, just different encoding

      // Status comparison
      if (canonical.active && agentikRecord.status === "discontinued") {
        diffs.push("STATUS_MISMATCH");
      }

      // Costo comparison
      if (
        canonical.averageCost != null &&
        agentikRecord.costo != null &&
        Math.abs(canonical.averageCost - agentikRecord.costo) > 1
      ) {
        diffs.push("COSTO_DIFF");
      }

      return {
        referenceCode: canonical.referenceCode,
        inSagView: true,
        inAgentik: true,
        sagViewLine: canonical.classification.line,
        agentikProductLine: agentikRecord.productLine,
        sagViewActive: canonical.active,
        agentikStatus: agentikRecord.status,
        sagViewCosto: canonical.averageCost,
        agentikCosto: agentikRecord.costo,
        commercialValidity: canonical.lifecycle.commercialValidity,
        productType: canonical.classification.productType,
        differences: diffs,
      };
    },
  };
}
