/**
 * canonical-warehouse-availability.ts
 *
 * Single source of truth for main-warehouse availability per reference.
 * Both Inventario and Production MUST consume this output — never query
 * CommercialCoverageSnapshot independently with different resolution paths.
 *
 * Sprint: MALETAS-INVENTARIO-PRODUCCION-SINGLE-SOURCE-OF-TRUTH-01 (Phase 4)
 */

import type { PrismaClient } from "@prisma/client";
import { LINE_TO_BRAND } from "@/lib/comercial/line-map";

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

export type DataConfidence = "HIGH" | "MEDIUM" | "STALE" | "ABSENT";

/** Provenance — how the value was obtained (COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01 Phase 6) */
export type DataProvenance =
  | "SAG_LIVE"        // Resolved via live SAG SOAP lookup
  | "SAG_SNAPSHOT"    // From CCS snapshot (real SAG value at snapshot time)
  | "TEXT_INFERRED"   // Derived from description text (inferProductType/inferCategory)
  | "HARDCODED"       // Static constant or placeholder
  | "UNKNOWN";        // Source cannot be determined

export interface CanonicalRefAvailability {
  reference: string;
  description: string;
  line: string;               // "CS" | "LT" | "OTRO"
  grupoId: number | null;     // FK resolved via SAG live lookup
  grupoSag: string | null;    // grupo name resolved via SAG live lookup
  subgrupoId: number | null;
  subgrupoSag: string | null; // resolved via SAG live lookup (NOT stale CCS value)
  available: number;          // disponible (main warehouse B01+B04)
  warehouseCode: string;      // "B01+B04" (main warehouse composite)
  source: "CommercialCoverageSnapshot";
  sourceUpdatedAt: Date | null; // snapshotAt of the CCS row
  dataConfidence: DataConfidence;
  /** How subgrupoSag was resolved (Phase 6) */
  subgrupoProvenance: DataProvenance;
  /** Whether availability data is known (real value exists) vs absent */
  availabilityKnown: boolean;
}

export interface CanonicalAvailabilityResult {
  refs: CanonicalRefAvailability[];
  /** Map from reference → canonical row (fast lookup) */
  byReference: Map<string, CanonicalRefAvailability>;
  /** Latest snapshotAt across all rows */
  latestSnapshotAt: Date | null;
  /** Age in days of the most recent snapshot */
  snapshotAgeDays: number | null;
  /** True if snapshot exceeds the freshness threshold */
  isStale: boolean;
  /** Classified freshness state (COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01 Phase 5) */
  freshness: DataFreshness;
  /** Total refs with available > 0 */
  availableRefCount: number;
}

// ── Freshness policy (COMERCIAL-INVENTARIO-DATA-SAFETY-LOCK-01 Phase 5) ──────
// FRESH:   data ≤ FRESH_THRESHOLD_DAYS old — full trust
// STALE:   data FRESH+1..STALE_THRESHOLD_DAYS old — operational trust, flag for refresh
// EXPIRED: data > STALE_THRESHOLD_DAYS old — block decisions, gate to EN_VALIDACION
//
// PROVISIONAL: These thresholds are initial defaults pending business approval.
// TODO(DATA-SAFETY-LOCK): Move to tenant-configurable settings after validation
//   with Castillitos operations team. Current values are engineering estimates.

export const FRESH_THRESHOLD_DAYS = 3;
export const STALE_THRESHOLD_DAYS = 7;

export type DataFreshness = "FRESH" | "STALE" | "EXPIRED" | "ABSENT";

export function classifyFreshness(ageDays: number | null): DataFreshness {
  if (ageDays == null) return "ABSENT";
  if (ageDays <= FRESH_THRESHOLD_DAYS) return "FRESH";
  if (ageDays <= STALE_THRESHOLD_DAYS) return "STALE";
  return "EXPIRED";
}

// ══════════════════════════════════════════════════════════════════════════════
// Core function
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Load canonical main-warehouse availability for all references.
 *
 * Resolution pipeline:
 * 1. Query CommercialCoverageSnapshot (latest per refCode)
 * 2. Resolve subgrupoSag via live SAG lookup (subgrupoLookup), NOT stale CCS value
 * 3. Resolve grupoSag via subgrupoToGrupoLookup
 * 4. Compute freshness and data confidence
 *
 * @param db — Prisma client
 * @param organizationId — org scoping
 * @param subgrupoLookup — Map<subgrupoId, subgrupoName> from live SAG
 * @param subgrupoToGrupoLookup — Map<subgrupoId, grupoName> from live SAG
 */
export async function getCanonicalMainWarehouseAvailability(
  db: PrismaClient,
  organizationId: string,
  subgrupoLookup: Map<number, string>,
  subgrupoToGrupoLookup: Map<number, string>,
): Promise<CanonicalAvailabilityResult> {
  // ── 1. Query latest CCS row per reference ─────────────────────────────
  interface CcsRow {
    refCode: string;
    description: string;
    line: string;
    disponible: number;
    subgrupoId: number | null;
    subgrupoSag: string | null;
    snapshotAt: Date | null;
  }

  let rows: CcsRow[] = [];
  try {
    rows = await db.$queryRawUnsafe(`
      SELECT DISTINCT ON ("refCode")
        "refCode", description, line, disponible, "subgrupoId", "subgrupoSag", "snapshotAt"
      FROM "CommercialCoverageSnapshot"
      WHERE "organizationId" = $1
      ORDER BY "refCode", "snapshotAt" DESC
    `, organizationId);
  } catch {
    // Table may not exist — return empty
  }

  // ── 2. Compute snapshot freshness ─────────────────────────────────────
  let latestSnapshotAt: Date | null = null;
  for (const r of rows) {
    if (!r.snapshotAt) continue;
    const d = new Date(r.snapshotAt);
    if (!latestSnapshotAt || d > latestSnapshotAt) latestSnapshotAt = d;
  }

  const snapshotAgeDays = latestSnapshotAt
    ? Math.round((Date.now() - latestSnapshotAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const isStale = snapshotAgeDays != null && snapshotAgeDays > STALE_THRESHOLD_DAYS;

  // ── 3. Resolve names via live SAG lookup and build canonical rows ─────
  const refs: CanonicalRefAvailability[] = [];
  const byReference = new Map<string, CanonicalRefAvailability>();
  let availableRefCount = 0;

  for (const r of rows) {
    // Resolve subgrupoSag: live SAG lookup first, CCS fallback
    let subgrupoProvenance: DataProvenance = "UNKNOWN";
    let resolvedSubgrupoSag: string | null;
    if (r.subgrupoId != null) {
      const liveName = subgrupoLookup.get(r.subgrupoId);
      if (liveName) {
        resolvedSubgrupoSag = liveName;
        subgrupoProvenance = "SAG_LIVE";
      } else {
        resolvedSubgrupoSag = r.subgrupoSag;
        subgrupoProvenance = r.subgrupoSag ? "SAG_SNAPSHOT" : "UNKNOWN";
      }
    } else {
      resolvedSubgrupoSag = r.subgrupoSag;
      subgrupoProvenance = r.subgrupoSag ? "SAG_SNAPSHOT" : "UNKNOWN";
    }

    // Resolve grupoSag via live SAG lookup
    const grupoSag = r.subgrupoId != null
      ? (subgrupoToGrupoLookup.get(r.subgrupoId) ?? null)
      : null;

    // Resolve grupoId (subgrupoToGrupoLookup doesn't carry the FK, but grupoSag presence implies it exists)
    // We don't have grupoId directly — set null. The grupoSag string is what matters for keying.
    const grupoId: number | null = null;

    // Data confidence
    let dataConfidence: DataConfidence;
    if (rows.length === 0) {
      dataConfidence = "ABSENT";
    } else if (isStale) {
      dataConfidence = "STALE";
    } else if (r.subgrupoId == null || resolvedSubgrupoSag == null) {
      dataConfidence = "MEDIUM"; // No subgrupo classification
    } else {
      dataConfidence = "HIGH";
    }

    const available = Math.max(r.disponible, 0);
    if (available > 0) availableRefCount++;

    const entry: CanonicalRefAvailability = {
      reference: r.refCode,
      description: r.description,
      line: r.line,
      grupoId,
      grupoSag,
      subgrupoId: r.subgrupoId,
      subgrupoSag: resolvedSubgrupoSag,
      available,
      warehouseCode: "B01+B04",
      source: "CommercialCoverageSnapshot",
      sourceUpdatedAt: r.snapshotAt ? new Date(r.snapshotAt) : null,
      dataConfidence,
      subgrupoProvenance,
      availabilityKnown: true, // CCS row exists → availability is known
    };

    refs.push(entry);
    byReference.set(r.refCode, entry);
  }

  return {
    refs,
    byReference,
    latestSnapshotAt,
    snapshotAgeDays,
    isStale,
    freshness: classifyFreshness(snapshotAgeDays),
    availableRefCount,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Derived helpers (consume canonical output, never re-query CCS)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Build the stock-by-subgrupo map from canonical availability.
 * Used by production threshold evaluation.
 *
 * Keys use productionStockKey() semantics:
 * - Castillitos: `grupoSag|subgrupoSag`
 * - Latin Kids: `subgrupoSag`
 */
export function buildStockBySubgrupoFromCanonical(
  canonical: CanonicalAvailabilityResult,
  productionStockKeyFn: (brand: string, grupoSag: string | null, subgrupoSag: string) => string,
): Map<string, number> {
  const stockMap = new Map<string, number>();

  for (const ref of canonical.refs) {
    if (!ref.subgrupoSag) continue;
    const brand = LINE_TO_BRAND[ref.line] ?? ref.line;
    const key = productionStockKeyFn(brand, ref.grupoSag, ref.subgrupoSag);
    stockMap.set(key, (stockMap.get(key) ?? 0) + ref.available);
  }

  return stockMap;
}
