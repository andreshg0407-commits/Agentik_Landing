/**
 * lib/comercial/data-sources/sag-warehouse-commercial-product-data-source.ts
 *
 * Stub: SagWarehouseCommercialProductDataSource.
 * Will read from the data warehouse once it arrives (~20 days).
 * For now, returns empty results — consumers fall back to approximations.
 *
 * Sprint: COMMERCIAL-DATA-SOURCES-RENAME-01
 */

import type {
  CommercialProductDataSource,
  SagPricePair,
  ImportReceipt,
  ProductEnrichment,
} from "./commercial-product-data-source";

export class SagWarehouseCommercialProductDataSource implements CommercialProductDataSource {
  readonly name = "sag-warehouse";

  async fetchPrices(_productCodes: string[]): Promise<Map<string, SagPricePair>> {
    // TODO: Read from data warehouse tables once available
    return new Map();
  }

  async fetchReceipts(_productCodes: string[]): Promise<Map<string, ImportReceipt[]>> {
    // TODO: Read from data warehouse tables once available
    return new Map();
  }

  async fetchEnrichment(_productCodes: string[]): Promise<Map<string, ProductEnrichment>> {
    // TODO: Read from data warehouse tables once available
    return new Map();
  }
}
