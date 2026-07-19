/**
 * lib/comercial/maletas/maletas-temporal.ts
 *
 * Temporal evolution engine for Maletas.
 * Reads CommercialCoverageSnapshot history to detect trends,
 * recurring breakdowns, pressure patterns, and degradation arcs.
 *
 * Uses the same operational language as finanzas (degrading, improving,
 * volatile, recovered, stabilized, recurring).
 *
 * Server-only — never import from client components.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-PERSISTENCE-01
 */

import { prisma } from "@/lib/prisma";

// ─── Trend types ──────────────────────────────────────────────────────────────

export type TemporalTrend =
  | "improving"   // coverage days increasing ≥ 15%
  | "degrading"   // coverage days decreasing ≥ 15%
  | "volatile"    // alternating critical / stable states
  | "recurring"   // entered critical state 3+ times in window
  | "stabilized"  // was critical, now stable for 2+ snapshots
  | "recovered"   // came from sin_stock/ruptura → now cobertura_alta/estable
  | "stable";     // < ±15% change, not in critical zone

// ─── Reference evolution ─────────────────────────────────────────────────────

export interface RefTemporalPoint {
  snapshotAt:      string; // ISO timestamp
  coverageDays:    number | null;
  disponible:      number;
  status:          string;
  operationalScore: number;
}

export interface RefTemporalEvolution {
  refCode:          string;
  description:      string;
  line:             string;
  snapshotCount:    number;
  trend:            TemporalTrend;
  degradationPct:   number | null;  // positive = degrading, negative = recovering
  alertMessage:     string | null;  // e.g. "Degradándose 42% en 7d"
  snapshots:        RefTemporalPoint[];
  criticalRunCount: number;         // how many times entered critical state
  lastStatus:       string;
  firstSnapshotAt:  string;
  lastSnapshotAt:   string;
}

// ─── Sales rep pressure evolution ────────────────────────────────────────────

export interface RepPressurePoint {
  snapshotAt:        string;
  presionOperacional: number;
  riesgoComercial:   string;
  refsAgotadas:      number;
  refsBajoMinimo:    number;
}

export interface RepTemporalEvolution {
  salesRepId:       string;
  salesRepName:     string;
  line:             string;
  trend:            TemporalTrend;
  avgPressure:      number;
  maxPressure:      number;
  alertMessage:     string | null;
  snapshots:        RepPressurePoint[];
  snapshotCount:    number;
  highPressureCount: number; // snapshots with presion >= 50
}

// ─── Full temporal report ─────────────────────────────────────────────────────

export type TemporalMemoryStatus = "READY" | "INSUFFICIENT_HISTORY" | "NO_DATA";

export interface TemporalEvolutionReport {
  status:           TemporalMemoryStatus;
  orgId:            string;
  windowDays:       number;
  snapshotCount:    number;
  generatedAt:      string;

  // Most degraded references
  degradingRefs:    RefTemporalEvolution[];
  // References recovering from critical
  recoveringRefs:   RefTemporalEvolution[];
  // Refs with volatile or recurring pattern
  recurringRefs:    RefTemporalEvolution[];

  // Sales reps under recurring pressure
  highPressureReps: RepTemporalEvolution[];

  // Summary signals for copilot consumption
  summary: {
    totalRefsTracked:   number;
    criticalTrends:     number;
    recoveringTrends:   number;
    avgDegradationPct:  number | null;
    mostDegradedRef:    string | null;
    mostAffectedRep:    string | null;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeTrend(snapshots: RefTemporalPoint[]): TemporalTrend {
  if (snapshots.length < 2) return "stable";

  const first = snapshots[0];
  const last  = snapshots[snapshots.length - 1];

  const CRITICAL = new Set(["sin_stock", "ruptura_inminente"]);
  const STABLE   = new Set(["cobertura_estable", "cobertura_alta"]);

  // Count critical → stable → critical transitions (volatile / recurring)
  let criticalRuns  = 0;
  let wasInCritical = false;
  let transitions   = 0;

  for (const s of snapshots) {
    const isCrit = CRITICAL.has(s.status);
    if (isCrit && !wasInCritical) criticalRuns++;
    if (isCrit !== wasInCritical)  transitions++;
    wasInCritical = isCrit;
  }

  if (criticalRuns >= 3) return "recurring";
  if (transitions >= 4)  return "volatile";

  // Recovered: last critical run ended and now stable
  if (CRITICAL.has(first.status) && STABLE.has(last.status)) return "recovered";

  // Check if was critical and stabilized
  const recentSlice = snapshots.slice(-3);
  const recentAllStable = recentSlice.every((s) => STABLE.has(s.status) || s.status === "cobertura_baja");
  if (wasInCritical && recentAllStable && criticalRuns >= 1) return "stabilized";

  // Coverage day trend
  const firstDays = first.coverageDays;
  const lastDays  = last.coverageDays;

  if (firstDays !== null && lastDays !== null && firstDays > 0) {
    const changePct = (lastDays - firstDays) / firstDays;
    if (changePct <= -0.15) return "degrading";
    if (changePct >= 0.15)  return "improving";
  }

  return "stable";
}

function computeDegradationPct(snapshots: RefTemporalPoint[]): number | null {
  if (snapshots.length < 2) return null;
  const first = snapshots[0].coverageDays;
  const last  = snapshots[snapshots.length - 1].coverageDays;
  if (first === null || last === null || first === 0) return null;
  return Math.round(((first - last) / first) * 100); // positive = degrading
}

function buildAlertMessage(
  refCode: string,
  trend: TemporalTrend,
  degradationPct: number | null,
  windowDays: number,
  lastStatus: string,
): string | null {
  if (trend === "degrading" && degradationPct !== null && degradationPct > 0) {
    return `${refCode} degradándose ${degradationPct}% en ${windowDays}d`;
  }
  if (trend === "recovered" || trend === "improving") {
    return `${refCode} recuperando cobertura operacional`;
  }
  if (trend === "recurring") {
    return `${refCode} con rupturas recurrentes — revisar`;
  }
  if (trend === "volatile") {
    return `${refCode} volátil — estado cambia frecuentemente`;
  }
  if (lastStatus === "sin_stock" || lastStatus === "ruptura_inminente") {
    return `${refCode} en ruptura · intervención requerida`;
  }
  return null;
}

// ─── Reference temporal evolution ────────────────────────────────────────────

async function buildRefEvolutions(
  orgId: string,
  since: Date,
): Promise<RefTemporalEvolution[]> {
  const rows = await prisma.commercialCoverageSnapshot.findMany({
    where:   { organizationId: orgId, snapshotAt: { gte: since } },
    orderBy: { snapshotAt: "asc" },
    select: {
      refCode:          true,
      description:      true,
      line:             true,
      snapshotAt:       true,
      coverageDays:     true,
      disponible:       true,
      status:           true,
      operationalScore: true,
    },
  });

  // Group by refCode
  const byRef = new Map<string, typeof rows>();
  for (const row of rows) {
    const existing = byRef.get(row.refCode) ?? [];
    existing.push(row);
    byRef.set(row.refCode, existing);
  }

  const evolutions: RefTemporalEvolution[] = [];

  for (const [refCode, refRows] of byRef) {
    const sorted = [...refRows].sort(
      (a, b) => new Date(a.snapshotAt).getTime() - new Date(b.snapshotAt).getTime(),
    );

    const snapshots: RefTemporalPoint[] = sorted.map((r) => ({
      snapshotAt:      r.snapshotAt.toISOString(),
      coverageDays:    r.coverageDays,
      disponible:      r.disponible,
      status:          r.status,
      operationalScore: r.operationalScore,
    }));

    const CRITICAL = new Set(["sin_stock", "ruptura_inminente"]);
    let criticalRuns  = 0;
    let wasInCritical = false;
    for (const s of snapshots) {
      if (CRITICAL.has(s.status) && !wasInCritical) criticalRuns++;
      wasInCritical = CRITICAL.has(s.status);
    }

    const trend         = computeTrend(snapshots);
    const degradationPct = computeDegradationPct(snapshots);
    const lastStatus    = snapshots[snapshots.length - 1].status;
    const windowDays    = Math.round(
      (new Date(snapshots[snapshots.length - 1].snapshotAt).getTime() -
       new Date(snapshots[0].snapshotAt).getTime()) /
      (1000 * 60 * 60 * 24),
    );

    evolutions.push({
      refCode,
      description:     sorted[0].description,
      line:            sorted[0].line,
      snapshotCount:   snapshots.length,
      trend,
      degradationPct,
      alertMessage:    buildAlertMessage(refCode, trend, degradationPct, windowDays, lastStatus),
      snapshots,
      criticalRunCount: criticalRuns,
      lastStatus,
      firstSnapshotAt: snapshots[0].snapshotAt,
      lastSnapshotAt:  snapshots[snapshots.length - 1].snapshotAt,
    });
  }

  return evolutions;
}

// ─── Sales rep temporal evolution ────────────────────────────────────────────

async function buildRepEvolutions(
  orgId: string,
  since: Date,
): Promise<RepTemporalEvolution[]> {
  const rows = await prisma.commercialSalesRepProfileSnapshot.findMany({
    where:   { organizationId: orgId, snapshotAt: { gte: since } },
    orderBy: { snapshotAt: "asc" },
    select: {
      salesRepId:        true,
      salesRepName:      true,
      line:              true,
      snapshotAt:        true,
      presionOperacional: true,
      riesgoComercial:   true,
      refsAgotadas:      true,
      refsBajoMinimo:    true,
    },
  });

  const byKey = new Map<string, typeof rows>();
  for (const row of rows) {
    const key      = `${row.salesRepId}_${row.line}`;
    const existing = byKey.get(key) ?? [];
    existing.push(row);
    byKey.set(key, existing);
  }

  const evolutions: RepTemporalEvolution[] = [];

  for (const [, repRows] of byKey) {
    const sorted = [...repRows].sort(
      (a, b) => new Date(a.snapshotAt).getTime() - new Date(b.snapshotAt).getTime(),
    );

    const snapshots: RepPressurePoint[] = sorted.map((r) => ({
      snapshotAt:        r.snapshotAt.toISOString(),
      presionOperacional: r.presionOperacional,
      riesgoComercial:   r.riesgoComercial,
      refsAgotadas:      r.refsAgotadas,
      refsBajoMinimo:    r.refsBajoMinimo,
    }));

    const pressures     = snapshots.map((s) => s.presionOperacional);
    const avgPressure   = Math.round(pressures.reduce((a, b) => a + b, 0) / pressures.length);
    const maxPressure   = Math.max(...pressures);
    const highPressureCount = pressures.filter((p) => p >= 50).length;

    // Determine trend from pressure sequence
    const first = pressures[0];
    const last  = pressures[pressures.length - 1];
    let trend: TemporalTrend = "stable";

    if (highPressureCount >= 3) {
      trend = "recurring";
    } else if (last - first >= 20) {
      trend = "degrading";
    } else if (first - last >= 20) {
      trend = "improving";
    }

    let alertMessage: string | null = null;
    if (trend === "recurring") {
      alertMessage = `${sorted[0].salesRepName} (${sorted[0].line}) en presión recurrente — ${highPressureCount} ciclos`;
    } else if (trend === "degrading" && last >= 50) {
      alertMessage = `${sorted[0].salesRepName} (${sorted[0].line}) presión escalando a ${last}%`;
    }

    evolutions.push({
      salesRepId:        sorted[0].salesRepId,
      salesRepName:      sorted[0].salesRepName,
      line:              sorted[0].line,
      trend,
      avgPressure,
      maxPressure,
      alertMessage,
      snapshots,
      snapshotCount:    snapshots.length,
      highPressureCount,
    });
  }

  return evolutions;
}

// ─── Main temporal report builder ────────────────────────────────────────────

/**
 * Build the full temporal evolution report for an org.
 * Reads from CommercialCoverageSnapshot and CommercialSalesRepProfileSnapshot.
 */
export async function buildTemporalEvolution(
  orgId: string,
  opts: { daysBack?: number } = {},
): Promise<TemporalEvolutionReport> {
  const daysBack    = opts.daysBack ?? 30;
  const since       = new Date();
  since.setDate(since.getDate() - daysBack);
  const generatedAt = new Date().toISOString();

  // Check if we have enough data
  const snapshotCount = await prisma.commercialCoverageSnapshot.count({
    where: { organizationId: orgId, snapshotAt: { gte: since } },
  });

  if (snapshotCount === 0) {
    return {
      status:        "NO_DATA",
      orgId,
      windowDays:    daysBack,
      snapshotCount: 0,
      generatedAt,
      degradingRefs:    [],
      recoveringRefs:   [],
      recurringRefs:    [],
      highPressureReps: [],
      summary: {
        totalRefsTracked: 0,
        criticalTrends:   0,
        recoveringTrends: 0,
        avgDegradationPct: null,
        mostDegradedRef:  null,
        mostAffectedRep:  null,
      },
    };
  }

  if (snapshotCount < 10) {
    return {
      status:        "INSUFFICIENT_HISTORY",
      orgId,
      windowDays:    daysBack,
      snapshotCount,
      generatedAt,
      degradingRefs:    [],
      recoveringRefs:   [],
      recurringRefs:    [],
      highPressureReps: [],
      summary: {
        totalRefsTracked: snapshotCount,
        criticalTrends:   0,
        recoveringTrends: 0,
        avgDegradationPct: null,
        mostDegradedRef:  null,
        mostAffectedRep:  null,
      },
    };
  }

  const [refEvolutions, repEvolutions] = await Promise.all([
    buildRefEvolutions(orgId, since),
    buildRepEvolutions(orgId, since),
  ]);

  const degradingRefs  = refEvolutions.filter((r) => r.trend === "degrading").sort(
    (a, b) => (b.degradationPct ?? 0) - (a.degradationPct ?? 0),
  );
  const recoveringRefs = refEvolutions.filter((r) =>
    r.trend === "recovered" || r.trend === "stabilized",
  );
  const recurringRefs  = refEvolutions.filter((r) =>
    r.trend === "recurring" || r.trend === "volatile",
  );
  const highPressureReps = repEvolutions
    .filter((r) => r.highPressureCount >= 2 || r.trend === "recurring")
    .sort((a, b) => b.avgPressure - a.avgPressure);

  const degradationPcts = degradingRefs
    .map((r) => r.degradationPct)
    .filter((p): p is number => p !== null);

  const avgDegradationPct =
    degradationPcts.length > 0
      ? Math.round(degradationPcts.reduce((a, b) => a + b, 0) / degradationPcts.length)
      : null;

  return {
    status:        "READY",
    orgId,
    windowDays:    daysBack,
    snapshotCount,
    generatedAt,
    degradingRefs,
    recoveringRefs,
    recurringRefs,
    highPressureReps,
    summary: {
      totalRefsTracked:  refEvolutions.length,
      criticalTrends:    degradingRefs.length + recurringRefs.length,
      recoveringTrends:  recoveringRefs.length,
      avgDegradationPct,
      mostDegradedRef:   degradingRefs[0]?.refCode ?? null,
      mostAffectedRep:   highPressureReps[0]
        ? `${highPressureReps[0].salesRepName} (${highPressureReps[0].line})`
        : null,
    },
  };
}
