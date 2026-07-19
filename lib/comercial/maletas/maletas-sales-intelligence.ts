/**
 * lib/comercial/maletas/maletas-sales-intelligence.ts
 *
 * Translates SAG SaleRecord hints into commercial intelligence signals.
 * Pure functions — no Prisma, no side effects, deterministic.
 *
 * V1: Works with SagSaleHint[] (thin slice of SaleRecord).
 * V2: Call computeSalesIntelligence() from a Prisma query in the API route.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-INTELLIGENCE-01
 */

import type {
  SagSaleHint,
  RefVelocity,
  RefTrend,
  RefClassification,
} from "./maletas-intelligence-types";
import type { CommercialCaseLine, SalesRep, RawCaseRow } from "./maletas-types";

// ─── Constants ─────────────────────────────────────────────────────────────────

const VELOCITY_HOT_THRESHOLD = 1.0;    // > 1 unit/day → caliente
const VELOCITY_ACTIVE_THRESHOLD = 0.1; // 0.1–1 unit/day → activa
const VELOCITY_SLOW_THRESHOLD = 0.01;  // 0.01–0.1 unit/day → lenta
// < 0.01 but has any sale → muerta
// 0 sales in window → muerta (if data exists) or sin_rotacion_conocida (if no data)

const TREND_STABLE_BAND = 0.20; // ±20% change = estable

// ─── Main function ─────────────────────────────────────────────────────────────

/**
 * Compute per-reference velocity and classification from SAG sale hints.
 *
 * @param salesHints  - slice of SAG SaleRecord data for this org
 * @param ltRows      - LT case rows (to identify which refs are in the maleta)
 * @param csRows      - CS case rows
 * @param salesReps   - registry to map sagName → salesRep id
 * @param today       - reference date for window computation (defaults to now)
 */
export function computeSalesIntelligence(
  salesHints: SagSaleHint[],
  ltRows: RawCaseRow[],
  csRows: RawCaseRow[],
  salesReps: SalesRep[],
  today: Date = new Date(),
): Map<string, RefVelocity> {
  // Build a quick lookup: sagName → salesRepId
  const sagNameToId = new Map<string, string>();
  for (const rep of salesReps) {
    if (rep.sagName) {
      sagNameToId.set(rep.sagName.toUpperCase().trim(), rep.id);
    }
  }

  // All refs in the maleta catalogue (LT + CS)
  const catalogueRefs = new Map<string, { desc: string; line: CommercialCaseLine }>();
  for (const row of ltRows) {
    catalogueRefs.set(row.ref.toUpperCase(), { desc: row.desc, line: "LT" });
  }
  for (const row of csRows) {
    catalogueRefs.set(row.ref.toUpperCase(), { desc: row.desc, line: "CS" });
  }

  // Only OFICIAL and REMISION contribute to velocity — PD = demand pressure, NOT a sale
  const velocityHints = salesHints.filter(
    (h) => h.sourceType === "OFICIAL" || h.sourceType === "REMISION",
  );

  // Group sale hints by refCode (uppercase)
  const byRef = new Map<string, SagSaleHint[]>();
  for (const hint of velocityHints) {
    const key = hint.refCode.toUpperCase().trim();
    if (!byRef.has(key)) byRef.set(key, []);
    byRef.get(key)!.push(hint);
  }

  const velocityMap = new Map<string, RefVelocity>();

  // For each maleta ref, compute velocity
  for (const [refUpper, meta] of catalogueRefs) {
    const hints = byRef.get(refUpper) ?? [];

    if (hints.length === 0) {
      // No SAG data for this ref
      velocityMap.set(refUpper, {
        refCode: refUpper,
        description: meta.desc,
        line: meta.line,
        units7d: null,
        units30d: null,
        txCount7d: 0,
        txCount30d: 0,
        dailyVelocity: null,
        trend: "sin_datos",
        classification: "sin_rotacion_conocida",
        topSellerIds: [],
      });
      continue;
    }

    const cutoff7d = new Date(today);
    cutoff7d.setDate(cutoff7d.getDate() - 7);
    const cutoff30d = new Date(today);
    cutoff30d.setDate(cutoff30d.getDate() - 30);

    // Window before 7d (days 8–30) for trend comparison
    const cutoffPrior = new Date(today);
    cutoffPrior.setDate(cutoffPrior.getDate() - 8);

    const in7d   = hints.filter((h) => new Date(h.saleDate) >= cutoff7d);
    const in30d  = hints.filter((h) => new Date(h.saleDate) >= cutoff30d);
    const prior7 = hints.filter(
      (h) => new Date(h.saleDate) >= cutoff30d && new Date(h.saleDate) < cutoff7d,
    );

    const units7d  = sumUnits(in7d);
    const units30d = sumUnits(in30d);
    const unitsPrior = sumUnits(prior7);

    const dailyVelocity = units30d !== null ? units30d / 30 : null;

    // Trend: compare last 7d rate vs prior 7d rate (within the 30d window)
    const trend = computeTrend(units7d, unitsPrior);

    const classification = classifyRef(dailyVelocity, units30d);

    // Top sellers: sort by units30d per seller
    const sellerUnits = new Map<string, number>();
    for (const h of in30d) {
      const repId = sagNameToId.get(h.sellerSagName.toUpperCase().trim());
      if (!repId) continue;
      const u = h.units ?? 0;
      sellerUnits.set(repId, (sellerUnits.get(repId) ?? 0) + u);
    }
    const topSellerIds = [...sellerUnits.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .slice(0, 3);

    velocityMap.set(refUpper, {
      refCode: refUpper,
      description: meta.desc,
      line: meta.line,
      units7d,
      units30d,
      txCount7d: in7d.length,
      txCount30d: in30d.length,
      dailyVelocity,
      trend,
      classification,
      topSellerIds,
    });
  }

  return velocityMap;
}

// ─── Aggregated intelligence signals ──────────────────────────────────────────

/** Refs classified as "caliente" sorted by velocity desc */
export function getHotRefs(
  velocityMap: Map<string, RefVelocity>,
): RefVelocity[] {
  return [...velocityMap.values()]
    .filter((v) => v.classification === "caliente")
    .sort((a, b) => (b.dailyVelocity ?? 0) - (a.dailyVelocity ?? 0));
}

/** Refs classified as "muerta" */
export function getDeadRefs(
  velocityMap: Map<string, RefVelocity>,
): RefVelocity[] {
  return [...velocityMap.values()].filter((v) => v.classification === "muerta");
}

/** Refs with sin_rotacion_conocida */
export function getUnknownRotationRefs(
  velocityMap: Map<string, RefVelocity>,
): RefVelocity[] {
  return [...velocityMap.values()].filter(
    (v) => v.classification === "sin_rotacion_conocida",
  );
}

/**
 * Compute a vendor-level velocity summary.
 * Returns total units30d per salesRep across all their assigned refs.
 */
export function computeVendorVelocitySummary(
  velocityMap: Map<string, RefVelocity>,
  ltRows: RawCaseRow[],
  csRows: RawCaseRow[],
  salesReps: SalesRep[],
): Map<string, { totalUnits30d: number; hotRefCount: number }> {
  const result = new Map<string, { totalUnits30d: number; hotRefCount: number }>();
  for (const rep of salesReps) {
    result.set(rep.id, { totalUnits30d: 0, hotRefCount: 0 });
  }

  const allRows = [...ltRows, ...csRows];
  for (const row of allRows) {
    const velocity = velocityMap.get(row.ref.toUpperCase());
    if (!velocity) continue;

    for (const [vendorName, assigned] of Object.entries(row.vendors)) {
      if (!assigned) continue;
      const rep = salesReps.find((r) => r.name.toUpperCase() === vendorName.toUpperCase());
      if (!rep) continue;

      const entry = result.get(rep.id);
      if (!entry) continue;
      entry.totalUnits30d += velocity.units30d ?? 0;
      if (velocity.classification === "caliente") {
        entry.hotRefCount++;
      }
    }
  }

  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sumUnits(hints: SagSaleHint[]): number | null {
  if (hints.length === 0) return null;
  // If ANY hint has units, sum all known units (treat null as 0 for partial data)
  const hasAnyUnits = hints.some((h) => h.units !== null);
  if (!hasAnyUnits) return null;
  return hints.reduce((acc, h) => acc + (h.units ?? 0), 0);
}

function computeTrend(
  units7d: number | null,
  unitsPrior: number | null,
): RefTrend {
  if (units7d === null || unitsPrior === null) return "sin_datos";

  const rate7d = units7d / 7;
  // Prior window is 23 days (days 8–30), normalize to 7-day rate
  const ratePrior = unitsPrior / 23;

  if (ratePrior === 0 && rate7d === 0) return "sin_datos";
  if (ratePrior === 0) return "acelerando";

  const delta = (rate7d - ratePrior) / ratePrior;
  if (delta > TREND_STABLE_BAND) return "acelerando";
  if (delta < -TREND_STABLE_BAND) return "desacelerando";
  return "estable";
}

function classifyRef(
  dailyVelocity: number | null,
  units30d: number | null,
): RefClassification {
  if (dailyVelocity === null) return "sin_rotacion_conocida";
  if (units30d !== null && units30d === 0) return "muerta";
  if (dailyVelocity >= VELOCITY_HOT_THRESHOLD) return "caliente";
  if (dailyVelocity >= VELOCITY_ACTIVE_THRESHOLD) return "activa";
  if (dailyVelocity >= VELOCITY_SLOW_THRESHOLD) return "lenta";
  return "muerta";
}
