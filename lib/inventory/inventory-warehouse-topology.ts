/**
 * inventory-warehouse-topology.ts
 *
 * INVENTORY-COMMERCIAL-AVAILABILITY-MULTI-BODEGA-01
 *
 * Tenant-aware warehouse topology for commercial availability calculation.
 *
 * Each tenant has segments (textile, import, etc.) with defined warehouse roles:
 * - dispatchWarehouses: where sales/dispatch happen (can go negative)
 * - supportWarehouses: where stock awaits transfer (always positive)
 *
 * Commercial availability = SUM(dispatch + support warehouses)
 *
 * No Prisma. No React. No server-only. Pure config.
 */

// ── Warehouse Segment ───────────────────────────────────────────────────────

export interface WarehouseSegment {
  /** Segment identifier. */
  segmentId: string;
  /** Product lines belonging to this segment (SAG productLine codes). */
  productLines: string[];
  /** Commercial line codes for snapshot filtering (e.g. "LT", "CS"). */
  commercialLineCodes: string[];
  /** Warehouses used for dispatch/sales (SAG bodega externalRef). */
  dispatchWarehouses: string[];
  /** Warehouses holding stock pending transfer to dispatch. */
  supportWarehouses: string[];
}

/** Complete warehouse topology for a tenant. */
export interface TenantWarehouseTopology {
  orgSlug: string;
  segments: WarehouseSegment[];
}

// ── Castillitos Configuration ───────────────────────────────────────────────

const CASTILLITOS_TOPOLOGY: TenantWarehouseTopology = {
  orgSlug: "castillitos",
  segments: [
    {
      segmentId: "textile",
      productLines: ["1", "2"],
      commercialLineCodes: ["LT", "CS"],
      dispatchWarehouses: ["01"],
      supportWarehouses: ["04"],
    },
    // IMPORTACION — reserved for INVENTORY-IMPORTACION-PIPELINE-01
    // {
    //   segmentId: "importacion",
    //   productLines: ["5"],
    //   commercialLineCodes: ["IM"],
    //   dispatchWarehouses: ["24"],
    //   supportWarehouses: ["26", "27", "42", "43", "45", "46"],
    // },
  ],
};

// ── Registry ────────────────────────────────────────────────────────────────

const TOPOLOGY_REGISTRY = new Map<string, TenantWarehouseTopology>([
  ["castillitos", CASTILLITOS_TOPOLOGY],
]);

/**
 * Resolve warehouse topology for a tenant.
 * Returns the configured topology or a safe default (Bodega 01 only).
 */
export function resolveWarehouseTopology(orgSlug: string): TenantWarehouseTopology {
  return TOPOLOGY_REGISTRY.get(orgSlug) ?? {
    orgSlug,
    segments: [
      {
        segmentId: "default",
        productLines: [],
        commercialLineCodes: [],
        dispatchWarehouses: ["01"],
        supportWarehouses: [],
      },
    ],
  };
}

/**
 * Get all warehouse codes (dispatch + support) for a segment.
 */
export function getSegmentWarehouses(segment: WarehouseSegment): string[] {
  return [...segment.dispatchWarehouses, ...segment.supportWarehouses];
}

/**
 * Get all warehouse codes across all segments for a tenant.
 */
export function getAllCommercialWarehouses(topology: TenantWarehouseTopology): string[] {
  const set = new Set<string>();
  for (const seg of topology.segments) {
    for (const w of getSegmentWarehouses(seg)) set.add(w);
  }
  return [...set];
}

/**
 * Find the segment for a given commercial line code (e.g. "LT" → textile).
 */
export function findSegmentByLineCode(
  topology: TenantWarehouseTopology,
  lineCode: string,
): WarehouseSegment | undefined {
  return topology.segments.find(s => s.commercialLineCodes.includes(lineCode));
}
