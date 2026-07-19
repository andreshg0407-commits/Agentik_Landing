/**
 * domains/sales/sales-registration.ts
 *
 * Registers the Sales Domain adapter with the Commercial Adapter Registry.
 * Called during domain initialization — NOT at module import time.
 */

import type { CommercialAdapterRegistry, AdapterRegistration } from "../../adapters";
import { SAG_SALES_ADAPTER_ID, SAG_SALES_ADAPTER_VERSION } from "./sales-adapter";

// ── Register Sales Adapter ──────────────────────────────────────────────────

export function registerSalesAdapter(
  registry: CommercialAdapterRegistry,
  tenantId: string
): { ok: boolean; error?: string } {
  const registration: AdapterRegistration = {
    adapterId: SAG_SALES_ADAPTER_ID,
    tenantId,
    domain: "SALES",
    system: "SAG_PYA",
    version: SAG_SALES_ADAPTER_VERSION,
    priority: 1,
    enabled: true,
    capabilities: ["SALES_SYNC", "SALES_DISCOVERY", "SALES_BULK"],
    health: "HEALTHY",
    registeredAt: new Date(),
  };

  const result = registry.register(registration);
  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true };
}
