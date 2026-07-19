/**
 * domains/product/product-registration.ts
 *
 * Registers the Product Domain adapter with the Commercial Adapter Registry.
 * Called during domain initialization — NOT at module import time.
 */

import type { CommercialAdapterRegistry, AdapterRegistration } from "../../adapters";
import { SAG_PRODUCT_ADAPTER_ID, SAG_PRODUCT_ADAPTER_VERSION } from "./product-adapter";

// ── Register Product Adapter ────────────────────────────────────────────────

export function registerProductAdapter(
  registry: CommercialAdapterRegistry,
  tenantId: string
): { ok: boolean; error?: string } {
  const registration: AdapterRegistration = {
    adapterId: SAG_PRODUCT_ADAPTER_ID,
    tenantId,
    domain: "PRODUCT",
    system: "SAG_PYA",
    version: SAG_PRODUCT_ADAPTER_VERSION,
    priority: 1,
    enabled: true,
    capabilities: ["PRODUCT_SYNC", "PRODUCT_DISCOVERY", "PRODUCT_BULK"],
    health: "HEALTHY",
    registeredAt: new Date(),
  };

  const result = registry.register(registration);
  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true };
}
