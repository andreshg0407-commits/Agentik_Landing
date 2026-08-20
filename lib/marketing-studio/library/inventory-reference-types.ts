/**
 * lib/marketing-studio/library/inventory-reference-types.ts
 *
 * MARKETING-LIBRARY-INVENTORY-TRUTH-02A — Inventory Reference Types
 *
 * Display model for Biblioteca inventory references.
 * Client-safe (no Prisma, no server-only imports).
 */

import type { WorldCode } from "./world-classification";

// ── Visual state ────────────────────────────────────────────────────────────────

export type InventoryRefVisualState =
  | "with_hero"        // Has hero image
  | "with_assets"      // Has assets but no designated hero
  | "no_assets"        // No visual resources at all
  | "sin_clasificar"   // World unresolved
  | "inactive";        // No inventory available (stock=0, kept for assets)

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

// ── Inventory load result ───────────────────────────────────────────────────────

export interface InventoryLoadResult {
  references:         InventoryReference[];
  reconciliation:     ReconciliationReport;
  snapshotAt:         string | null;
  hasSnapshot:        boolean;
  worldCounts:        import("./world-classification").WorldCounts;
}
