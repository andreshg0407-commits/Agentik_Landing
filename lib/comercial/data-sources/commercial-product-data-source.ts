/**
 * lib/comercial/data-sources/commercial-product-data-source.ts
 *
 * Shared data source abstraction for the entire Comercial domain.
 * Provides product enrichment (prices, entry receipts) beyond Prisma.
 *
 * Consumers: Importaciones, Maletas, Compras, Produccion, Inventario, Copilot.
 * Implementations:
 *   1. SagDirectCommercialProductDataSource — queries SAG SOAP directly (now)
 *   2. SagWarehouseCommercialProductDataSource — reads from data warehouse (future)
 *
 * Sprint: COMMERCIAL-DATA-SOURCES-RENAME-01
 */

// ── Enrichment result types ─────────────────────────────────────────────────

/** PV3/PV4 price pair from SAG v_articulos */
export interface SagPricePair {
  /** PV3 — precio detal (v_articulos.nd_precio3) */
  pricePV3: number | null;
  /** PV4 — precio mayorista/maleta (v_articulos.nd_precio4) */
  pricePV4: number | null;
}

/** A single warehouse entry receipt (from SAG MOVIMIENTOS, fuente C1/C2) */
export interface ImportReceipt {
  /** SAG document number */
  documentNumber: string;
  /** Document date (ISO string) */
  date: string;
  /** Fuente code (C1, C2, etc.) */
  fuenteCode: string;
  /** Quantity entered in this receipt */
  quantity: number;
  /** Provider NIT (if available) */
  providerNit: string | null;
  /** Provider name (if available) */
  providerName: string | null;
}

/** Enrichment data for a single product reference */
export interface ProductEnrichment {
  /** Product code (k_sc_codigo_articulo or CODIGO) */
  productCode: string;
  prices: SagPricePair;
  /** Receipts sorted by date ASC (only valid purchase receipts) */
  receipts: ImportReceipt[];
  /** Earliest entry date from receipts (ISO string) */
  firstEntryDate: string | null;
  /** Most recent entry date from receipts (ISO string) */
  lastEntryDate: string | null;
  /** Total units entered (sum of valid receipt quantities) */
  totalImported: number | null;
  /** Number of distinct entry batches */
  batchCount: number;
}

// ── DataSource interface ────────────────────────────────────────────────────

/**
 * Contract for enriching commercial products with data beyond Prisma.
 * Shared across all Comercial modules.
 * Implementations may call SAG SOAP, read a warehouse, or return stubs.
 */
export interface CommercialProductDataSource {
  readonly name: string;

  /**
   * Fetch PV3/PV4 prices for a list of product codes.
   * Returns a Map<productCode, SagPricePair>.
   */
  fetchPrices(productCodes: string[]): Promise<Map<string, SagPricePair>>;

  /**
   * Fetch entry receipts (purchase documents) for a list of product codes.
   * Returns a Map<productCode, ImportReceipt[]>.
   */
  fetchReceipts(productCodes: string[]): Promise<Map<string, ImportReceipt[]>>;

  /**
   * Full enrichment: prices + receipts combined into ProductEnrichment per code.
   */
  fetchEnrichment(productCodes: string[]): Promise<Map<string, ProductEnrichment>>;
}
