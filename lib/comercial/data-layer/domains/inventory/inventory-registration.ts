/**
 * domains/inventory/inventory-registration.ts
 *
 * Registers the Inventory Domain adapter with the Commercial Adapter Registry.
 * Called during domain initialization — NOT at module import time.
 *
 * Sprint: INVENTORY-DOMAIN-01
 */

import type { CommercialAdapterRegistry, AdapterRegistration } from "../../adapters";
import { SAG_INVENTORY_ADAPTER_ID, SAG_INVENTORY_ADAPTER_VERSION } from "./inventory-adapter";

// -- Register Inventory Adapter ---------------------------------------------

export function registerInventoryAdapter(
  registry: CommercialAdapterRegistry,
  tenantId: string
): { ok: boolean; error?: string } {
  const registration: AdapterRegistration = {
    adapterId: SAG_INVENTORY_ADAPTER_ID,
    tenantId,
    domain: "INVENTORY",
    system: "SAG_PYA",
    version: SAG_INVENTORY_ADAPTER_VERSION,
    priority: 1,
    enabled: true,
    capabilities: ["INVENTORY_SYNC", "INVENTORY_DISCOVERY", "INVENTORY_BULK"],
    health: "HEALTHY",
    registeredAt: new Date(),
  };

  const result = registry.register(registration);
  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true };
}
