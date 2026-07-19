/**
 * lib/comercial/tiendas/providers/sag-data-warehouse-provider.ts
 *
 * StoreInventoryProvider stub for the future SAG data warehouse.
 *
 * When SAG delivers the bodega de datos with full variant-level inventory
 * per warehouse, implement the load() method here. The engine and UI
 * will work without changes — only this file needs to be completed.
 *
 * Expected data warehouse contract:
 *   - Per-warehouse, per-variant inventory (referenceCode + size + color)
 *   - Committed quantities (transfers in transit, production batches)
 *   - Real-time or near-real-time sync timestamps
 *
 * Sprint: COMERCIAL-TIENDAS-DATA-CONTRACT-03
 */

import type {
  StoreInventoryProvider,
  ProviderResult,
} from "../store-replenishment-types";

export class SagDataWarehouseProvider implements StoreInventoryProvider {
  readonly kind = "sag_data_warehouse" as const;

  async load(_orgId: string): Promise<ProviderResult> {
    // TODO: implement when SAG data warehouse is available
    //
    // Expected implementation:
    //   1. Query SAG DW for warehouse list (tiendas + bodega principal)
    //   2. Query per-warehouse, per-variant inventory
    //   3. Query committed quantities (transfers + production batches)
    //   4. Map to CanonicalStoreInventoryRecord[] and CanonicalMainWarehouseRecord[]
    //   5. Return ProviderResult with metadata.variantSupport = true
    //
    // The key difference from SagCurrentProvider:
    //   - Full variant breakdown (size + color) for every warehouse
    //   - committedUnits populated from transfer/production batch records
    //   - Real sync timestamps from the DW refresh cycle

    return {
      stores:        [],
      inventory:     [],
      mainStock:     [],
      rules:         [],
      mainWarehouse: { code: "BOD-PRINCIPAL", name: "Bodega Principal SAG" },
      metadata: {
        kind:           "sag_data_warehouse",
        label:          "Bodega de datos pendiente",
        connected:      false,
        lastReadAt:     null,
        variantSupport: false,
      },
    };
  }
}
