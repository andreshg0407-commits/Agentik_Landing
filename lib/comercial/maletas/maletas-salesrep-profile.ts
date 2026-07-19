/**
 * lib/comercial/maletas/maletas-salesrep-profile.ts
 *
 * Operational profile per sales rep — summarizes case health, coverage,
 * line strength/weakness, production dependency and commercial risk.
 *
 * These profiles are consumed by Copilot/David for per-vendor narratives.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-INTELLIGENCE-01
 */

import type {
  SalesRepOperationalProfile,
  CommercialRisk,
  CoverageSignal,
  RefVelocity,
} from "./maletas-intelligence-types";
import type {
  SalesRep,
  CaseItem,
  CaseAlert,
  CommercialCaseLine,
} from "./maletas-types";

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildSalesRepProfiles(
  salesReps: SalesRep[],
  items: CaseItem[],
  alerts: CaseAlert[],
  coverageSignals: CoverageSignal[],
  velocityMap: Map<string, RefVelocity>,
  line: CommercialCaseLine,
): SalesRepOperationalProfile[] {
  const coverageByRef = new Map<string, CoverageSignal>();
  for (const cs of coverageSignals) {
    if (cs.line === line) coverageByRef.set(cs.refCode.toUpperCase(), cs);
  }

  return salesReps
    .filter((r) => r.active)
    .map((rep) => buildProfile(rep, items, alerts, coverageByRef, velocityMap, line));
}

function buildProfile(
  rep: SalesRep,
  items: CaseItem[],
  alerts: CaseAlert[],
  coverageByRef: Map<string, CoverageSignal>,
  velocityMap: Map<string, RefVelocity>,
  line: CommercialCaseLine,
): SalesRepOperationalProfile {
  const repItems = items.filter(
    (i) => i.line === line && i.assignedToSalesReps.includes(rep.id),
  );
  const repAlerts = alerts.filter(
    (a) => a.salesRepId === rep.id && a.line === line,
  );

  // ── Case health ──────────────────────────────────────────────────────────────
  const refsTotal      = repItems.length;
  const refsOk         = repItems.filter((i) => i.status === "ok").length;
  const refsAgotadas   = repItems.filter(
    (i) => i.status === "sin_stock" || i.status === "sobre_comprometido",
  ).length;
  const refsBajoMinimo = repItems.filter((i) => i.status === "bajo_minimo").length;
  const refsEnProceso  = repItems.filter((i) => i.status === "en_proceso").length;

  // ── Coverage ─────────────────────────────────────────────────────────────────
  const coverageDays = repItems
    .map((i) => coverageByRef.get(i.reference.toUpperCase())?.coverageDays ?? null)
    .filter((d): d is number => d !== null && d > 0);

  const coverageAvgDays =
    coverageDays.length > 0
      ? Math.round(coverageDays.reduce((a, b) => a + b, 0) / coverageDays.length)
      : null;

  const coverageMinDays =
    coverageDays.length > 0 ? Math.round(Math.min(...coverageDays)) : null;

  const coverageWeakRefs = repItems
    .filter((i) => {
      const cov = coverageByRef.get(i.reference.toUpperCase());
      return cov?.coverageDays !== null && (cov?.coverageDays ?? Infinity) < 7;
    })
    .map((i) => i.reference);

  // ── Line strength/weakness ───────────────────────────────────────────────────
  const { lineasFuertes, lineasDebiles } = computeLineProfile(repItems, velocityMap);

  // ── Pressure ─────────────────────────────────────────────────────────────────
  const presionOperacional =
    refsTotal > 0
      ? Math.round(((refsAgotadas + refsBajoMinimo) / refsTotal) * 100)
      : 0;

  const dependenciaProduccion =
    refsTotal > 0
      ? Math.round(
          (repItems.filter((i) => i.recommendedAction === "PRODUCIR").length /
            refsTotal) *
            100,
        )
      : 0;

  const dependenciaReposicion =
    refsTotal > 0
      ? Math.round(
          (repItems.filter((i) => i.recommendedAction === "REPONER_MALETA").length /
            refsTotal) *
            100,
        )
      : 0;

  // ── Risk ─────────────────────────────────────────────────────────────────────
  const okPct = refsTotal > 0 ? (refsOk / refsTotal) * 100 : 100;
  const riesgoComercial = computeCommercialRisk(okPct);
  const riesgoScore = Math.round(100 - okPct);

  return {
    salesRepId: rep.id,
    salesRepName: rep.name,
    line,
    refsTotal,
    refsOk,
    refsAgotadas,
    refsBajoMinimo,
    refsEnProceso,
    coverageAvgDays,
    coverageMinDays,
    coverageWeakRefs,
    lineasFuertes,
    lineasDebiles,
    presionOperacional,
    dependenciaProduccion,
    dependenciaReposicion,
    riesgoComercial,
    riesgoScore,
  };
}

// ─── Line profile ─────────────────────────────────────────────────────────────

/**
 * Classify which garment categories/descriptions are strong vs weak for a sales rep.
 * "Strong" = most refs are hot/active. "Weak" = most refs are dead/slow.
 */
function computeLineProfile(
  repItems: CaseItem[],
  velocityMap: Map<string, RefVelocity>,
): { lineasFuertes: string[]; lineasDebiles: string[] } {
  // Group by simplified description category
  const categoryMap = new Map<string, { hot: number; dead: number; total: number }>();

  for (const item of repItems) {
    const category = extractCategory(item.description);
    if (!categoryMap.has(category)) {
      categoryMap.set(category, { hot: 0, dead: 0, total: 0 });
    }
    const entry = categoryMap.get(category)!;
    entry.total++;

    const velocity = velocityMap.get(item.reference.toUpperCase());
    if (velocity?.classification === "caliente" || velocity?.classification === "activa") {
      entry.hot++;
    } else if (velocity?.classification === "muerta") {
      entry.dead++;
    }
  }

  const lineasFuertes: string[] = [];
  const lineasDebiles: string[] = [];

  for (const [category, { hot, dead, total }] of categoryMap) {
    if (total === 0) continue;
    const hotPct = hot / total;
    const deadPct = dead / total;
    if (hotPct >= 0.5) lineasFuertes.push(category);
    else if (deadPct >= 0.5) lineasDebiles.push(category);
  }

  return { lineasFuertes, lineasDebiles };
}

/**
 * Extract a simplified category from a product description.
 * e.g. "PIJAMA CORTA LARGA NIÑA KIDS" → "PIJAMA"
 *      "CONJUNTO NAUTICO NIÑO" → "CONJUNTO"
 */
function extractCategory(description: string): string {
  const upper = description.toUpperCase();
  const CATEGORIES = [
    "PIJAMA", "CONJUNTO", "VESTIDO", "BLUSA", "BUZO",
    "CAMIBUSO", "CAMISETA", "POLO", "BOLSA", "MAMELUCO",
  ];
  for (const cat of CATEGORIES) {
    if (upper.includes(cat)) return cat;
  }
  return upper.split(" ")[0] ?? "OTRO";
}

function computeCommercialRisk(okPct: number): CommercialRisk {
  if (okPct >= 80) return "bajo";
  if (okPct >= 60) return "medio";
  if (okPct >= 40) return "alto";
  return "critico";
}

// ─── Cross-vendor comparison ───────────────────────────────────────────────────

/**
 * Find the sales rep with highest operational pressure (most refs below minimum).
 */
export function findMostPressuredRep(
  profiles: SalesRepOperationalProfile[],
): SalesRepOperationalProfile | null {
  if (profiles.length === 0) return null;
  return profiles.reduce((max, p) =>
    p.presionOperacional > max.presionOperacional ? p : max,
  );
}

/**
 * Find strongest performing reps (lowest risk score).
 */
export function findStrongestReps(
  profiles: SalesRepOperationalProfile[],
  top = 2,
): SalesRepOperationalProfile[] {
  return [...profiles].sort((a, b) => a.riesgoScore - b.riesgoScore).slice(0, top);
}
