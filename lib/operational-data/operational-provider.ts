/**
 * lib/operational-data/operational-provider.ts
 *
 * IOperationalDataProvider — the interface every data source must implement
 * to participate in the Operational Intelligence Layer.
 *
 * ─── ARCHITECTURE ────────────────────────────────────────────────────────────
 * Agentik does not talk to SAG, CRM, or Shopify directly from its intelligence
 * engines or UI. Instead, each source registers a provider that:
 *
 *   1. Fetches raw data from the source (API, DB, webhook, import)
 *   2. Maps to operational entities (OperationalOrder, OperationalCustomer, …)
 *   3. Returns normalized data for the Operational Context builder
 *
 * New sources are added by implementing this interface — no changes to engines.
 *
 * Current implementations:
 *   SagOperationalProvider  — V1 (Excel import), V2 (ODBC)
 *   CrmOperationalProvider  — V1 (webhook / polling)
 *   ShopifyProvider         — via existing Shopify integration
 *
 * Sprint: AGENTIK-OPERATIONAL-DATA-LAYER-01
 */

import type { OperationalSource, OperationalSourceMetadata } from "./operational-source";
import type {
  OperationalCustomer,
  OperationalOrder,
  OperationalSalesRep,
  OperationalOpportunity,
  OperationalSalesActivity,
  OperationalTask,
} from "./operational-entities";
import type { OperationalInventoryItem } from "@/lib/operational-inventory/operational-inventory-types";

// ─── Provider interface ───────────────────────────────────────────────────────

/**
 * Contract for all operational data sources.
 * Implementations return operational entities — never raw source objects.
 */
export interface IOperationalDataProvider {
  /** Which source this provider represents */
  readonly source: OperationalSource;

  /** Current metadata: trust, freshness, availability */
  getSourceMetadata(): OperationalSourceMetadata;

  // ── Optional capabilities ─────────────────────────────────────────────────
  // Providers implement only what their source supports.
  // Missing capabilities return undefined — callers check before using.

  getCustomers?(organizationId: string): Promise<OperationalCustomer[]>;
  getOrders?(organizationId: string, since?: Date): Promise<OperationalOrder[]>;
  getSalesReps?(organizationId: string): Promise<OperationalSalesRep[]>;
  getOpportunities?(organizationId: string): Promise<OperationalOpportunity[]>;
  getSalesActivities?(organizationId: string, since?: Date): Promise<OperationalSalesActivity[]>;
  getTasks?(organizationId: string): Promise<OperationalTask[]>;
  getInventory?(organizationId: string): Promise<OperationalInventoryItem[]>;
}

// ─── Provider registry ────────────────────────────────────────────────────────

/**
 * Runtime registry of all active providers for an org.
 * The Operational Context builder queries all registered providers.
 */
export class OperationalProviderRegistry {
  private providers: Map<OperationalSource, IOperationalDataProvider> = new Map();

  register(provider: IOperationalDataProvider): void {
    this.providers.set(provider.source, provider);
  }

  get(source: OperationalSource): IOperationalDataProvider | undefined {
    return this.providers.get(source);
  }

  all(): IOperationalDataProvider[] {
    return [...this.providers.values()];
  }

  sources(): OperationalSource[] {
    return [...this.providers.keys()];
  }
}
