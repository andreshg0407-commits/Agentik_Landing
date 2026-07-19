/**
 * contracts/commercial-identity.ts
 *
 * Identity and timestamp contracts for the Commercial Data Layer.
 */

// ── Commercial Identity ─────────────────────────────────────────────────────

export interface CommercialIdentity {
  /** Tenant-scoped unique ID (orgSlug + domain + naturalKey) */
  readonly canonicalId: string;

  /** Organization scope */
  readonly tenantId: string;

  /** Domain that owns this identity */
  readonly domain: CommercialDomain;

  /** Natural key within the domain (e.g., SKU, NIT, document number) */
  readonly naturalKey: string;
}

// ── Commercial Domains ──────────────────────────────────────────────────────

export type CommercialDomain =
  | "PRODUCT"
  | "INVENTORY"
  | "SALES"
  | "CUSTOMER"
  | "PURCHASING"
  | "STORE_OPS";

// ── Commercial Timestamp ────────────────────────────────────────────────────

export interface CommercialTimestamp {
  /** When this record was first created in the Data Layer */
  readonly createdAt: Date;

  /** When this record was last updated in the Data Layer */
  readonly updatedAt: Date;

  /** When the source system last modified this record */
  readonly sourceModifiedAt: Date | null;

  /** When the last successful sync captured this record */
  readonly lastSyncAt: Date;
}
