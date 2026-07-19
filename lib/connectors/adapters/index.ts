/**
 * Adapter registration — import this module once at application startup.
 *
 * This file has side effects: it registers adapters into the ConnectorRegistry
 * and storage handlers into the SyncEngine. It must be imported before any
 * syncEngine.syncModule() call.
 *
 * Usage in server entry points / scripts:
 *   import "@/lib/connectors/adapters";
 *
 * Future adapters:
 *   import { ShopifyAdapter }   from "./shopify";
 *   import { HubSpotAdapter }   from "./hubspot";
 *   import { CsvAdapter }       from "./csv";
 *   registry.register("shopify",   ShopifyAdapter);
 *   registry.register("hubspot",   HubSpotAdapter);
 *   registry.register("csv",       CsvAdapter);
 *   registerStorageHandler("orders",    shopifyOrderStorage);
 *   registerStorageHandler("customers", hubspotCustomerStorage);
 */

import { registry }                 from "../core/connector-registry";
import { registerStorageHandler }   from "../core/sync-engine";
import type { RunContext, StorageHandler, UnifiedCustomer } from "../core/types";

// ── SAG PYA (file / pivot) ────────────────────────────────────────────────────
import { SagPyaAdapter }            from "./sag-pya/index";
import { sagPyaOrderStorage }       from "./sag-pya/order-storage";

// ── SAG PYA SOAP ──────────────────────────────────────────────────────────────
import { SagPyaSoapAdapter }           from "./sag-pya-soap/index";
import {
  customerProfileStorage,
  customerReceivableStorage,
  saleRecordStorage,
  customerOrderStorage,
  collectionStorage,
}                                      from "./sag-pya-soap/storage";

registry.register("sag_pya", SagPyaAdapter);
registry.register("sag_pya_soap", SagPyaSoapAdapter);
registerStorageHandler("receivables",  customerReceivableStorage);
registerStorageHandler("movements",    saleRecordStorage);
registerStorageHandler("collections",  collectionStorage);

// ── Castillitos CRM ───────────────────────────────────────────────────────────
import { CastillitosCrmAdapter }       from "./castillitos-crm/index";
import {
  crmCustomerStorage,
  crmOpportunityStorage,
  crmActivityStorage,
  crmQuoteStorage,
}                                      from "./castillitos-crm/storage";

registry.register("castillitos_crm", CastillitosCrmAdapter);
registerStorageHandler("opportunities", crmOpportunityStorage);
registerStorageHandler("activities",    crmActivityStorage);
registerStorageHandler("quotes",        crmQuoteStorage);

// ── "orders" module — source-aware mux ────────────────────────────────────────
// sag_pya (CSV pivot) writes OrderSnapshot via sagPyaOrderStorage.
// sag_pya_soap writes CustomerOrderRecord via customerOrderStorage.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const orderStorageMux: StorageHandler<any> = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async upsertMany(records: any[], ctx: RunContext) {
    if (ctx.source === "sag_pya_soap") {
      return customerOrderStorage.upsertMany(records, ctx);
    }
    return sagPyaOrderStorage.upsertMany(records, ctx);
  },
};
registerStorageHandler("orders", orderStorageMux);

// ── "customers" module — source-aware mux ─────────────────────────────────────
// Multiple adapters (sag_pya_soap, castillitos_crm) produce "customers" records
// but write to different fields of CustomerProfile (ERP vs CRM fields).
// This mux routes to the correct handler based on ctx.source.
const customerStorageMux: StorageHandler<UnifiedCustomer> = {
  async upsertMany(records: UnifiedCustomer[], ctx: RunContext) {
    if (ctx.source === "castillitos_crm") {
      return crmCustomerStorage.upsertMany(records, ctx);
    }
    // Default: SAG ERP handler (sag_pya_soap and any future ERP adapters)
    return customerProfileStorage.upsertMany(records, ctx);
  },
};
registerStorageHandler("customers", customerStorageMux);

// Log registered sources (useful for debugging at startup)
if (process.env.NODE_ENV !== "test") {
  console.log(`[Connectors] Registered adapters: ${registry.list().join(", ")}`);
}
