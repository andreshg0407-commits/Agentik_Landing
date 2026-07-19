/**
 * lib/comercial/tiendas/providers/sag-current-provider.ts
 *
 * StoreInventoryProvider implementation that reads current SAG data
 * from Prisma (SaleRecord, CRMQuoteLine, ProductInventoryLevel,
 * CommercialCoverageSnapshot).
 *
 * Wraps sag-store-adapter.ts — no new Prisma queries here.
 *
 * Sprint: COMERCIAL-TIENDAS-DATA-CONTRACT-03
 */

import type {
  StoreInventoryProvider,
  ProviderResult,
  CanonicalMainWarehouseRecord,
} from "../store-replenishment-types";

import { loadSagStoreData } from "../sag-store-adapter";

export class SagCurrentProvider implements StoreInventoryProvider {
  readonly kind = "sag_current" as const;

  async load(orgId: string): Promise<ProviderResult> {
    const sag = await loadSagStoreData(orgId);

    // Map MainWarehouseAvailability → CanonicalMainWarehouseRecord
    const mainStock: CanonicalMainWarehouseRecord[] = sag.mainStock.map(s => ({
      warehouseCode:  s.warehouseCode,
      referenceCode:  s.referenceCode,
      size:           s.size,
      color:          s.color,
      availableUnits: s.availableUnits,
      reservedUnits:  s.reservedUnits,
      committedUnits: 0, // SAG current does not track commitments
      updatedAt:      s.updatedAt,
    }));

    // Check if any inventory has variant data
    const hasVariants = sag.inventory.some(v => v.size !== "" || v.color !== "");

    return {
      stores:        sag.stores,
      inventory:     sag.inventory,
      mainStock,
      rules:         [], // Rules come from config, not from SAG
      mainWarehouse: sag.mainWarehouse ?? { code: "BOD-PRINCIPAL", name: "Bodega Principal SAG" },
      metadata: {
        kind:           "sag_current",
        label:          "Datos SAG actuales",
        connected:      sag.sagConnected,
        lastReadAt:     sag.lastSyncAt,
        variantSupport: hasVariants,
      },
    };
  }
}
