/**
 * Reconciliation engine — source-agnostic matching logic.
 *
 * Takes two flat arrays of ReconSide records and produces a ReconResult
 * by matching on the shared `key` field. Supports configurable amount
 * tolerance and optional duplicate detection within each side.
 */

import type {
  ReconRecord,
  ReconResult,
  ReconSide,
  ReconSummary,
  ReconOptions,
  ReconStatus,
} from "./types";

// ── Public API ────────────────────────────────────────────────────────────────

export function reconcile(
  sideA: ReconSide[],
  sideB: ReconSide[],
  options: ReconOptions & {
    reconType:    string;
    scope:        string;
    sourceALabel: string;
    sourceBLabel: string;
  },
): ReconResult {
  const tolerance        = options.amountTolerance  ?? 0.001;
  const detectDuplicates = options.detectDuplicates ?? true;

  // ── Build maps, tracking duplicates ──────────────────────────────────────
  const mapA = new Map<string, ReconSide>();
  const mapB = new Map<string, ReconSide>();
  const dupA = new Set<string>();
  const dupB = new Set<string>();

  for (const item of sideA) {
    if (mapA.has(item.key)) {
      dupA.add(item.key);
    } else {
      mapA.set(item.key, item);
    }
  }

  for (const item of sideB) {
    if (mapB.has(item.key)) {
      dupB.add(item.key);
    } else {
      mapB.set(item.key, item);
    }
  }

  // ── Collect all unique keys ───────────────────────────────────────────────
  const allKeys = new Set<string>([...mapA.keys(), ...mapB.keys()]);
  if (detectDuplicates) {
    for (const k of dupA) allKeys.add(k);
    for (const k of dupB) allKeys.add(k);
  }

  // ── Match records ─────────────────────────────────────────────────────────
  const records: ReconRecord[] = [];

  for (const key of allKeys) {
    const a = mapA.get(key) ?? null;
    const b = mapB.get(key) ?? null;

    // Duplicate in either side takes priority
    const isDup =
      detectDuplicates && (dupA.has(key) || dupB.has(key));

    let status: ReconStatus;

    if (isDup) {
      status = "POSSIBLE_DUPLICATE";
    } else if (a && b) {
      const diff = Math.abs(a.amount - b.amount);
      const base = Math.abs(a.amount);
      const withinTolerance = base === 0 ? diff === 0 : diff / base <= tolerance;
      status = withinTolerance ? "MATCH" : "MISMATCH_AMOUNT";
    } else if (a && !b) {
      status = "ONLY_IN_A";
    } else {
      status = "ONLY_IN_B";
    }

    const amountA = a?.amount ?? null;
    const amountB = b?.amount ?? null;
    const delta =
      amountA != null && amountB != null ? amountB - amountA : null;
    const deltaPercent =
      delta != null && amountA != null && amountA !== 0
        ? Math.round((delta / amountA) * 10000) / 100
        : null;

    records.push({
      key,
      label:        a?.label ?? b?.label ?? key,
      status,
      amountA,
      amountB,
      delta,
      deltaPercent,
      rowsA:        a?.rows ?? 0,
      rowsB:        b?.rows ?? 0,
      metaA:        a?.meta,
      metaB:        b?.meta,
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total              = records.length;
  const matched            = records.filter(r => r.status === "MATCH").length;
  const totalAmountA       = sideA.reduce((s, r) => s + r.amount, 0);
  const totalAmountB       = sideB.reduce((s, r) => s + r.amount, 0);

  const summary: ReconSummary = {
    total,
    matched,
    mismatchAmount:     records.filter(r => r.status === "MISMATCH_AMOUNT").length,
    onlyInA:            records.filter(r => r.status === "ONLY_IN_A").length,
    onlyInB:            records.filter(r => r.status === "ONLY_IN_B").length,
    possibleDuplicates: records.filter(r => r.status === "POSSIBLE_DUPLICATE").length,
    totalAmountA,
    totalAmountB,
    deltaTotal:         totalAmountB - totalAmountA,
    matchRate:          total > 0 ? Math.round((matched / total) * 10000) / 100 : 0,
  };

  return {
    reconType:    options.reconType,
    scope:        options.scope,
    sourceALabel: options.sourceALabel,
    sourceBLabel: options.sourceBLabel,
    summary,
    records,
    runAt:        new Date().toISOString(),
  };
}
