import { SaleScopeType } from "@prisma/client";
import type { RawSagRow } from "./types";

/**
 * Derive a scopeKey from the rows themselves when the caller doesn't supply one.
 * Reads periodo_ao_mes (or periodo) from each row.
 */
export function deriveScopeKey(
  rows:      RawSagRow[],
  scopeType: SaleScopeType
): string {
  if (scopeType === SaleScopeType.ADHOC) {
    return `adhoc-${Date.now()}`;
  }

  const periods = rows
    .map(r => (r.periodo_ao_mes ?? r.periodo ?? "").trim().replace(/[^0-9]/g, "").slice(0, 6))
    .filter(Boolean);

  if (periods.length === 0) {
    throw new Error("Cannot derive scopeKey: no periodo_ao_mes values found in rows");
  }

  const unique = [...new Set(periods)].sort();

  if (scopeType === SaleScopeType.MONTH) {
    if (unique.length > 1) {
      throw new Error(
        `Cannot use MONTH scope: rows span multiple periods [${unique.join(", ")}]. Use RANGE or split the file.`
      );
    }
    return unique[0];
  }

  if (scopeType === SaleScopeType.YEAR) {
    const years = [...new Set(unique.map(p => p.slice(0, 4)))];
    if (years.length > 1) {
      throw new Error(`Cannot use YEAR scope: rows span multiple years [${years.join(", ")}]`);
    }
    return years[0];
  }

  // RANGE
  const first = unique[0];
  const last  = unique[unique.length - 1];
  return `${first.slice(0,4)}-${first.slice(4,6)}-01:${last.slice(0,4)}-${last.slice(4,6)}-31`;
}
