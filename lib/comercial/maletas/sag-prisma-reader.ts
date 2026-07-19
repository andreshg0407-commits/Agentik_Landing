/**
 * lib/comercial/maletas/sag-prisma-reader.ts
 *
 * SAG Inventory Read Layer — Prisma V2 path.
 *
 * Reads CommercialCoverageSnapshot + CommercialCaseItem (latest per reference)
 * to build normalized MaletasEngineInput fields from Prisma-persisted SAG data.
 *
 * Source conventions (confirmed by Castillitos administration):
 *   disponible       = inventario (bodega inicial) − pedidos (reservas)
 *   pendingOrdersQty = SAG PD — pending commercial orders (demand pressure only)
 *   AP               = limpieza de pedidos — excluded upstream, never in snapshot
 *
 * Derivation from CommercialCoverageSnapshot:
 *   availableForCases  = snapshot.disponible                    (direct)
 *   pendingPDQty       = snapshot.pendingOrdersQty ?? 0         (direct)
 *   initialWarehouseQty = disponible + pendingPDQty             (bodega = disponible + reservas)
 *   reservedQty        = pendingPDQty                           (reservas ≡ PD qty)
 *   apCleanupQty       = 0                                      (AP excluded upstream — not stored)
 *
 * Returns null when no snapshot data exists → runtime falls through to Excel / empty.
 * Never generates fake data — empty results are explicit signals.
 *
 * Does NOT touch: UI, engine logic, production alerts, SAG adapter internals.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-SAG-READ-LAYER-01
 */

import { prisma }                       from "@/lib/prisma";
import {
  getVendorRegistry,
  normalizeAvailabilityRecord,
  buildAvailabilityMap,
  buildPendingOrdersMap,
}                                       from "./maletas-normalizer";
import type {
  MaletasEngineInput,
  RawCaseRow,
  RawAvailabilityRecord,
  CommercialCaseLine,
}                                       from "./maletas-types";

// ─── Line normalization ────────────────────────────────────────────────────────

const VALID_LINES = new Set<string>(["LT", "CS"]);

function normalizeLine(raw: string): CommercialCaseLine | null {
  const u = raw.trim().toUpperCase();
  return VALID_LINES.has(u) ? (u as CommercialCaseLine) : null;
}

// ─── JSON field helpers ────────────────────────────────────────────────────────

/**
 * Safely parse the `assignedSalesRepIds` Json field from CommercialCaseItem.
 * Returns a string[] of salesRep IDs regardless of JSON storage format.
 */
function parseRepIds(json: unknown): string[] {
  if (Array.isArray(json)) {
    return json.filter((v): v is string => typeof v === "string");
  }
  try {
    const parsed: unknown = JSON.parse(String(json ?? "[]"));
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string");
    }
    return [];
  } catch {
    return [];
  }
}

// ─── Result shape ─────────────────────────────────────────────────────────────

/**
 * Raw SAG snapshot components extracted from Prisma.
 * The runtime assembles these into a full MaletasEngineInput alongside static config.
 */
export interface SagPrismaSnapshot {
  ltRows:          RawCaseRow[];
  csRows:          RawCaseRow[];
  availability:    Map<string, RawAvailabilityRecord>;
  pendingOrdersMap: Map<string, number>;
  /** ISO timestamp of the latest coverage snapshot used */
  snapshotAt:      string;
  /** Number of distinct references found in snapshot */
  refCount:        number;
}

// ─── Main reader ──────────────────────────────────────────────────────────────

/**
 * Read SAG inventory state from Prisma snapshots.
 * Returns null when no CommercialCoverageSnapshot rows exist for this org.
 *
 * Data sources:
 *   CommercialCoverageSnapshot — per-reference availability (disponible, pendingOrdersQty)
 *   CommercialCaseItem         — per-reference case assignments (which vendor carries which ref)
 */
export async function readSagSnapshotFromPrisma(
  orgId: string,
): Promise<SagPrismaSnapshot | null> {

  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    console.log("[sag-prisma-reader] readSagSnapshotFromPrisma called | orgId:", orgId);
  }

  // ── Guard: model availability ─────────────────────────────────────────────
  // The Prisma client may not have CommercialCoverageSnapshot / CommercialCaseItem
  // if the client was not regenerated after the schema migration.
  // Return null gracefully — runtime falls through to Excel / empty.
  const p = prisma as unknown as Record<string, unknown>;
  if (typeof p["commercialCoverageSnapshot"] !== "object" || typeof p["commercialCaseItem"] !== "object") {
    if (isDev) {
      console.warn("[sag-prisma-reader] GUARD FAIL — CommercialCoverageSnapshot or CommercialCaseItem not in Prisma client. Run prisma generate.");
    }
    return null;
  }

  // ── 1. Read CommercialCoverageSnapshot (latest per refCode) ─────────────────
  let allCovSnapshots: Awaited<ReturnType<typeof prisma.commercialCoverageSnapshot.findMany<{
    select: {
      refCode: true; description: true; line: true;
      disponible: true; pendingOrdersQty: true; snapshotAt: true;
    };
  }>>>;

  try {
    allCovSnapshots = await prisma.commercialCoverageSnapshot.findMany({
      where:   { organizationId: orgId },
      orderBy: { snapshotAt: "desc" },
      select: {
        refCode:          true,
        description:      true,
        line:             true,
        disponible:       true,
        pendingOrdersQty: true, // SAG PD — commercial demand pressure (AGENTIK-SAG-PD-DEMAND-LAYER-01)
        snapshotAt:       true,
      },
    });
    if (isDev) {
      console.log("[sag-prisma-reader] CommercialCoverageSnapshot count:", allCovSnapshots.length, "| orgId:", orgId);
    }
  } catch (err) {
    if (isDev) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[sag-prisma-reader] CommercialCoverageSnapshot error (P2021 = table missing; run prisma migrate dev):", msg);
    }
    return null;
  }

  if (allCovSnapshots.length === 0) {
    if (isDev) {
      console.log("[sag-prisma-reader] CommercialCoverageSnapshot.count=0 for orgId:", orgId, "— table exists but no rows yet. Run maletas sync.");
    }
    return null;
  }

  // Deduplicate: first occurrence per refCode is most recent (sorted desc)
  const latestCovByRef = new Map<string, typeof allCovSnapshots[number]>();
  for (const snap of allCovSnapshots) {
    const key = snap.refCode.toUpperCase();
    if (!latestCovByRef.has(key)) latestCovByRef.set(key, snap);
  }

  // ISO timestamp of the most recent snapshot in the set
  const snapshotAt = allCovSnapshots[0]!.snapshotAt.toISOString();

  // ── 2. Build availability records (coverage snapshot → RawAvailabilityRecord) ──
  //
  // Formula (Castillitos administration):
  //   inventario (bodega) = disponible + pedidos
  //   disponible          = inventario − pedidos    (= availableForCases)
  //   pedidos             = pendingOrdersQty        (= SAG PD reservas)
  //
  // AP (limpieza de pedidos) is excluded upstream and never appears in snapshots.
  // apCleanupQty is therefore always 0 in this path.

  const rawAvailability: RawAvailabilityRecord[] = [];

  for (const snap of latestCovByRef.values()) {
    const pedidos    = snap.pendingOrdersQty ?? 0; // SAG PD reservas — demand pressure
    const disponible = Math.max(0, snap.disponible ?? 0);
    const inventario = disponible + pedidos; // bodega inicial = disponible + reservas

    rawAvailability.push(
      normalizeAvailabilityRecord({
        refCode:     snap.refCode,
        description: snap.description,
        inventario,
        pedidos,
        disponible,
      }),
    );
  }

  const availabilityMap  = buildAvailabilityMap(rawAvailability);
  const pendingOrdersMap = buildPendingOrdersMap(availabilityMap);

  // ── 3. Read CommercialCaseItem (latest per reference × line) ────────────────
  let allCaseItems: Awaited<ReturnType<typeof prisma.commercialCaseItem.findMany<{
    select: {
      reference: true; description: true; line: true;
      productionBatchLabel: true; assignedSalesRepIds: true;
    };
  }>>>;

  try {
    allCaseItems = await prisma.commercialCaseItem.findMany({
      where:   { organizationId: orgId },
      orderBy: { snapshotAt: "desc" },
      select: {
        reference:            true,
        description:          true,
        line:                 true,
        productionBatchLabel: true,
        assignedSalesRepIds:  true,
      },
    });
    if (isDev) {
      console.log("[sag-prisma-reader] CommercialCaseItem count:", allCaseItems.length, "| orgId:", orgId);
    }
  } catch (err) {
    if (isDev) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[sag-prisma-reader] CommercialCaseItem error:", msg);
    }
    // Case items are optional — availability data is still usable without them.
    allCaseItems = [];
  }

  // Deduplicate: first occurrence per (reference + line) is most recent
  const latestCaseByKey = new Map<string, typeof allCaseItems[number]>();
  for (const item of allCaseItems) {
    const key = `${item.reference.toUpperCase()}:${item.line.toUpperCase()}`;
    if (!latestCaseByKey.has(key)) latestCaseByKey.set(key, item);
  }

  // ── 4. Map vendor IDs → uppercase names for RawCaseRow.vendors ──────────────
  //
  // CommercialCaseItem.assignedSalesRepIds stores internal salesRep IDs (string[]).
  // RawCaseRow.vendors expects Record<VENDOR_NAME_UPPERCASE, boolean>.
  // We resolve via the vendor registry.

  const vendorRegistry = getVendorRegistry(orgId);
  const vendorNameById = new Map(
    vendorRegistry.map(v => [v.id, v.name.toUpperCase().trim()]),
  );

  // ── 5. Build LT / CS case rows ───────────────────────────────────────────────
  const ltRows: RawCaseRow[] = [];
  const csRows: RawCaseRow[] = [];

  for (const item of latestCaseByKey.values()) {
    const line = normalizeLine(item.line);
    if (!line) continue; // skip unknown lines — data integrity guard

    const repIds  = parseRepIds(item.assignedSalesRepIds);
    const vendors: Record<string, boolean> = {};
    for (const id of repIds) {
      const name = vendorNameById.get(id);
      if (name) vendors[name] = true;
    }

    const row: RawCaseRow = {
      ref:     item.reference.toUpperCase(),
      desc:    item.description,
      vendors,
      batches: item.productionBatchLabel ? [item.productionBatchLabel] : [],
    };

    if (line === "LT") ltRows.push(row);
    else               csRows.push(row);
  }

  if (isDev) {
    console.log(
      "[sag-prisma-reader] FUENTE: prisma |",
      `refs=${latestCovByRef.size} | ltRows=${ltRows.length} | csRows=${csRows.length} |`,
      `snapshotAt=${snapshotAt}`,
    );
  }

  return {
    ltRows,
    csRows,
    availability:    availabilityMap,
    pendingOrdersMap,
    snapshotAt,
    refCount:        latestCovByRef.size,
  };
}

// ─── Convenience check ────────────────────────────────────────────────────────

/**
 * Returns true if this org has any CommercialCoverageSnapshot data.
 * Lightweight check — avoids loading full snapshot in the fast-path no-data case.
 */
export async function hasSagCoverageSnapshot(orgId: string): Promise<boolean> {
  if (typeof (prisma as unknown as Record<string, unknown>)["commercialCoverageSnapshot"] !== "object") {
    return false;
  }
  try {
    const count = await prisma.commercialCoverageSnapshot.count({
      where: { organizationId: orgId },
    });
    return count > 0;
  } catch {
    return false;
  }
}

// ─── Engine input assembler ───────────────────────────────────────────────────

/**
 * Assemble a full MaletasEngineInput from a SagPrismaSnapshot + static config.
 * Static config (salesReps, rules) is injected by the caller — it does not come
 * from SAG and must not be read from Prisma in this layer.
 */
export function assembleEngineInput(
  snapshot:  SagPrismaSnapshot,
  staticCfg: Pick<MaletasEngineInput, "orgId" | "salesReps" | "rules">,
): MaletasEngineInput {
  return {
    orgId:           staticCfg.orgId,
    salesReps:       staticCfg.salesReps,
    rules:           staticCfg.rules,
    ltRows:          snapshot.ltRows,
    csRows:          snapshot.csRows,
    availability:    snapshot.availability,
    pendingOrdersMap: snapshot.pendingOrdersMap,
  };
}
