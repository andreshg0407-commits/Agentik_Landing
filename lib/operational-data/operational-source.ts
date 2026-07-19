/**
 * lib/operational-data/operational-source.ts
 *
 * OperationalSource — the canonical vocabulary for data provenance in Agentik.
 *
 * ─── PHILOSOPHY ──────────────────────────────────────────────────────────────
 * Agentik is an Operational Intelligence OS. It consumes data from multiple
 * operational sources (CRM, ERP, e-commerce, messaging, etc.) and builds a
 * unified operational model above them.
 *
 * No consumer should need to know the underlying source schema.
 * Consumers think in: orders, customers, inventory, demand, pressure.
 * NOT in: SAG tables, CRM endpoints, Shopify objects.
 *
 * Sprint: AGENTIK-OPERATIONAL-DATA-LAYER-01
 */

// ─── Source registry ──────────────────────────────────────────────────────────

/**
 * The operational source that produced a given data entity.
 *
 *   sag       — SAG/PYA ERP (fiscal source of truth: inventory, invoices, PD)
 *   crm       — CRM platform (customers, orders, opportunities, activities)
 *   shopify   — Shopify e-commerce (online orders, product catalog)
 *   whatsapp  — WhatsApp Business (conversations, catalog, order capture)
 *   manual    — Coordinator/admin entered directly in Agentik
 *   agentik   — Computed by Agentik's own engines (demand signals, pressure)
 *   unknown   — Source not identified (migration data, legacy imports)
 */
export type OperationalSource =
  | "sag"
  | "crm"
  | "shopify"
  | "whatsapp"
  | "manual"
  | "agentik"
  | "unknown";

// ─── Source metadata ──────────────────────────────────────────────────────────

/**
 * Trust and freshness metadata for an operational source.
 * Consumed by intelligence engines when weighting competing data.
 */
export interface OperationalSourceMetadata {
  source:              OperationalSource;
  /** Human-readable name for UI display */
  displayName:         string;
  /** 0–1: how reliable this source is for the given domain */
  trustScore:          number;
  /** True if the source supports live / near-real-time reads */
  isLive:              boolean;
  /** ISO timestamp of last successful sync, null if never synced */
  lastSyncAt:          string | null;
  /** Typical data freshness in seconds */
  typicalFreshnessSec: number;
  /** Whether the source is currently reachable */
  isAvailable:         boolean;
}

/** Default metadata per source — overridden per org when configured */
export const DEFAULT_SOURCE_METADATA: Record<OperationalSource, Omit<OperationalSourceMetadata, "lastSyncAt" | "isAvailable">> = {
  sag: {
    source:              "sag",
    displayName:         "SAG ERP",
    trustScore:          0.95,
    isLive:              false,  // V1: Excel import only
    typicalFreshnessSec: 3600,
  },
  crm: {
    source:              "crm",
    displayName:         "CRM Operacional",
    trustScore:          0.88,
    isLive:              false,  // V1: webhook / import
    typicalFreshnessSec: 300,
  },
  shopify: {
    source:              "shopify",
    displayName:         "Shopify",
    trustScore:          0.92,
    isLive:              true,
    typicalFreshnessSec: 60,
  },
  whatsapp: {
    source:              "whatsapp",
    displayName:         "WhatsApp Business",
    trustScore:          0.75,
    isLive:              true,
    typicalFreshnessSec: 10,
  },
  manual: {
    source:              "manual",
    displayName:         "Entrada manual",
    trustScore:          0.70,
    isLive:              true,
    typicalFreshnessSec: 0,
  },
  agentik: {
    source:              "agentik",
    displayName:         "Computado por Agentik",
    trustScore:          0.85,
    isLive:              true,
    typicalFreshnessSec: 0,
  },
  unknown: {
    source:              "unknown",
    displayName:         "Fuente desconocida",
    trustScore:          0.30,
    isLive:              false,
    typicalFreshnessSec: 86400,
  },
};

// ─── Source-aware base ────────────────────────────────────────────────────────

/**
 * All operational entities extend this base.
 * Provides provenance, identity bridging, and confidence tracking.
 */
export interface OperationalEntityBase {
  /** Agentik's own stable ID (cuid) */
  id:             string;
  organizationId: string;
  /** Which system produced this entity */
  source:         OperationalSource;
  /** The ID of this entity in the originating system */
  sourceId:       string;
  /** ISO timestamp of last successful sync from source */
  syncedAt:       string | null;
  /**
   * Confidence score 0–1:
   *   1.0 = authoritative (fiscal SAG record)
   *   0.8 = high confidence (CRM confirmed order)
   *   0.6 = medium (inferred from signals)
   *   0.4 = low (estimated / heuristic)
   */
  confidence:     number;
  /** Source-specific raw fields — never used by engines, available for audit */
  metadata?:      Record<string, unknown>;
}
