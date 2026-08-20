/**
 * lib/marketing-studio/library/inventory-reference-types.ts
 *
 * MARKETING-LIBRARY-INVENTORY-TRUTH-02A-R1 — Inventory Reference Types
 *
 * Display model for Biblioteca inventory references.
 * Client-safe (no Prisma, no server-only imports).
 */

import type { WorldCode } from "./world-classification";

// ── Truth state ─────────────────────────────────────────────────────────────────

/**
 * Describes the freshness/validity of the inventory data.
 *
 *   FRESH           — loaded from the latest snapshot, no errors
 *   STALE           — last load failed, showing previous valid snapshot
 *   DATA_UNVERIFIED — no snapshot has ever been loaded for this org
 *   PARTIAL         — one source (CCS or PIL) failed, other survived
 */
export type InventoryTruthState =
  | "FRESH"
  | "STALE"
  | "DATA_UNVERIFIED"
  | "PARTIAL";

// ── Visual state ────────────────────────────────────────────────────────────────

export type InventoryRefVisualState =
  | "with_hero"        // Has hero image
  | "with_assets"      // Has assets but no designated hero
  | "no_assets"        // No visual resources at all
  | "sin_clasificar"   // World unresolved
  | "inactive";        // No inventory available (stock=0, kept for assets)

/**
 * Counts per visual state — must satisfy:
 *   with_hero + with_assets + no_assets + sin_clasificar + inactive = total
 */
export interface VisualStateCounts {
  with_hero:       number;
  with_assets:     number;
  no_assets:       number;
  sin_clasificar:  number;
  inactive:        number;
  total:           number;
}

// ── Inventory Reference ─────────────────────────────────────────────────────────

export interface InventoryReference {
  // ── Identity ──
  refCode:            string;           // normalized uppercase reference
  description:        string;

  // ── Classification ──
  world:              WorldCode;
  worldLabel:         string;
  sagLine:            string;           // raw SAG line: "CS" | "LT" | "IM" | "OT"
  subgrupoSag:        string | null;    // SAG subgroup name (auditable metadata)

  // ── Inventory ──
  disponible:         number;
  pendingOrdersQty:   number;
  isAvailable:        boolean;          // disponible > 0

  // ── Asset summary ──
  productId:          string | null;    // linked ProductEntity.id (null = no product record)
  assetCount:         number;           // total linked GeneratedAssets
  hasHeroImage:       boolean;          // has a "hero" role asset with URL
  primaryAssetUrl:    string | null;    // URL of hero image (for thumbnail)

  // ── Visual state ──
  visualState:        InventoryRefVisualState;

  // ── Source tracking ──
  source:             "ccs" | "pil" | "manual";
  snapshotAt:         string | null;    // ISO — when inventory was last updated
}

// ── Reconciliation report ───────────────────────────────────────────────────────

export interface ReconciliationReport {
  totalBibliotecaRefs:        number;   // current ProductEntity count
  totalInventoryRefs:         number;   // CCS + IM references with inventory
  matches:                    number;   // refs in both biblioteca and inventory
  missingFromBiblioteca:      number;   // in inventory but no ProductEntity
  extraInBiblioteca:          number;   // in ProductEntity but no inventory
  duplicates:                 number;   // duplicate refCodes (after normalization)
  sinClasificar:              number;   // unclassifiable references
}

// ── Source health ────────────────────────────────────────────────────────────────

export interface SourceHealth {
  ccs:  { ok: boolean; error?: string };
  pil:  { ok: boolean; error?: string };
}

// ── Inventory load result ───────────────────────────────────────────────────────

export interface InventoryLoadResult {
  references:         InventoryReference[];
  reconciliation:     ReconciliationReport;
  snapshotAt:         string | null;
  hasSnapshot:        boolean;
  truthState:         InventoryTruthState;
  sourceHealth:       SourceHealth;
  visualStateCounts:  VisualStateCounts;
  worldCounts:        import("./world-classification").WorldCounts;
}
