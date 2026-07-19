/**
 * lib/comercial/tiendas/providers/demo-provider.ts
 *
 * StoreInventoryProvider implementation using demo data.
 * Only activated in development mode — never in production.
 *
 * Sprint: COMERCIAL-TIENDAS-DATA-CONTRACT-03
 */

import type {
  StoreInventoryProvider,
  ProviderResult,
  CanonicalMainWarehouseRecord,
} from "../store-replenishment-types";

import {
  DEMO_STORES,
  DEMO_INVENTORY,
  DEMO_MAIN_WAREHOUSE_STOCK,
  DEMO_RULES,
  MAIN_WAREHOUSE,
} from "../store-replenishment-demo-data";

export class DemoProvider implements StoreInventoryProvider {
  readonly kind = "demo" as const;

  async load(_orgId: string): Promise<ProviderResult> {
    const mainStock: CanonicalMainWarehouseRecord[] = DEMO_MAIN_WAREHOUSE_STOCK.map(s => ({
      warehouseCode:  s.warehouseCode,
      referenceCode:  s.referenceCode,
      size:           s.size,
      color:          s.color,
      availableUnits: s.availableUnits,
      reservedUnits:  s.reservedUnits,
      committedUnits: 0,
      updatedAt:      s.updatedAt,
    }));

    return {
      stores:        DEMO_STORES,
      inventory:     DEMO_INVENTORY,
      mainStock,
      rules:         DEMO_RULES,
      mainWarehouse: MAIN_WAREHOUSE,
      metadata: {
        kind:           "demo",
        label:          "Demo (desarrollo)",
        connected:      true,
        lastReadAt:     new Date().toISOString(),
        variantSupport: true,
      },
    };
  }
}
