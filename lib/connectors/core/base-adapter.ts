/**
 * BaseAdapter — abstract contract that every source adapter must extend.
 *
 * Design:
 *   - Adapters implement only the modules they support.
 *   - Unsupported modules return `UNSUPPORTED_MODULE` (empty, no cursor).
 *   - The SyncEngine calls pull methods repeatedly until hasMore = false.
 *   - Adapters are stateless — a new instance is created per sync run.
 *
 * To build a new adapter:
 *
 *   export class ShopifyAdapter extends BaseAdapter {
 *     readonly source       = "shopify";
 *     readonly displayName  = "Shopify";
 *     readonly supportedModules: SyncModule[] = ["orders", "customers", "inventory"];
 *
 *     async pullOrders(cursor?: string): Promise<PullResult<UnifiedOrder>> {
 *       // … call Shopify GraphQL / REST …
 *     }
 *   }
 *
 *   registry.register("shopify", ShopifyAdapter);
 */

import type {
  AdapterConfig,
  PullResult,
  SyncModule,
  UnifiedActivity,
  UnifiedCollection,
  UnifiedCustomer,
  UnifiedInventory,
  UnifiedInvoice,
  UnifiedMovement,
  UnifiedOpportunity,
  UnifiedOrder,
  UnifiedQuote,
  UnifiedReceivable,
} from "./types";

// Sentinel returned by unsupported pull methods.
export const UNSUPPORTED_MODULE = Object.freeze({
  records:    [] as never[],
  nextCursor: null,
  hasMore:    false,
  totalCount: null,
}) satisfies PullResult<never>;

// ─────────────────────────────────────────────────────────────────────────────

export abstract class BaseAdapter {
  /** Must match the `source` field stored in Connector.source. */
  abstract readonly source: string;

  /** Shown in the UI connector list. */
  abstract readonly displayName: string;

  /** Declare which modules this adapter implements. */
  abstract readonly supportedModules: SyncModule[];

  constructor(
    protected readonly orgId:   string,
    protected readonly config:  AdapterConfig
  ) {}

  // ── Pull methods ───────────────────────────────────────────────────────────
  //
  // Each method pulls ONE PAGE of records.
  // `cursor` is the nextCursor from the previous page (undefined on first call).
  // Override only the modules listed in `supportedModules`.

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async pullOrders(_cursor?: string): Promise<PullResult<UnifiedOrder>> {
    return UNSUPPORTED_MODULE as PullResult<UnifiedOrder>;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async pullCustomers(_cursor?: string): Promise<PullResult<UnifiedCustomer>> {
    return UNSUPPORTED_MODULE as PullResult<UnifiedCustomer>;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async pullInventory(_cursor?: string): Promise<PullResult<UnifiedInventory>> {
    return UNSUPPORTED_MODULE as PullResult<UnifiedInventory>;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async pullInvoices(_cursor?: string): Promise<PullResult<UnifiedInvoice>> {
    return UNSUPPORTED_MODULE as PullResult<UnifiedInvoice>;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async pullReceivables(_cursor?: string): Promise<PullResult<UnifiedReceivable>> {
    return UNSUPPORTED_MODULE as PullResult<UnifiedReceivable>;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async pullMovements(_cursor?: string): Promise<PullResult<UnifiedMovement>> {
    return UNSUPPORTED_MODULE as PullResult<UnifiedMovement>;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async pullCollections(_cursor?: string): Promise<PullResult<UnifiedCollection>> {
    return UNSUPPORTED_MODULE as PullResult<UnifiedCollection>;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async pullOpportunities(_cursor?: string): Promise<PullResult<UnifiedOpportunity>> {
    return UNSUPPORTED_MODULE as PullResult<UnifiedOpportunity>;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async pullActivities(_cursor?: string): Promise<PullResult<UnifiedActivity>> {
    return UNSUPPORTED_MODULE as PullResult<UnifiedActivity>;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async pullQuotes(_cursor?: string): Promise<PullResult<UnifiedQuote>> {
    return UNSUPPORTED_MODULE as PullResult<UnifiedQuote>;
  }

  // ── Optional hooks ─────────────────────────────────────────────────────────

  /**
   * Health check: verify credentials and connectivity before the first sync.
   * Implement to give users early feedback in the UI.
   */
  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    return { ok: true };
  }

  /**
   * Optional: return a human-readable description of a cursor value for the
   * diagnostics UI (e.g. "since 2024-03-15T10:00:00Z" for a date cursor).
   */
  describeCursor(cursor: string): string {
    return cursor;
  }
}

// ── Constructor type ───────────────────────────────────────────────────────────

export type AdapterConstructor = new (
  orgId:  string,
  config: AdapterConfig
) => BaseAdapter;
