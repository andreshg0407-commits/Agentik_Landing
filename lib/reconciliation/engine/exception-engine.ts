/**
 * lib/reconciliation/engine/exception-engine.ts
 *
 * AGENTIK-RECON-ENGINE-01
 * Universal Reconciliation Engine — Exception Classification
 *
 * Classifies unmatched records, duplicates, and other anomalies into
 * typed, explainable ReconException objects.
 *
 * Exception types produced here:
 *   only_in_a       — Record in A, no counterpart in B
 *   only_in_b       — Record in B, no counterpart in A
 *   duplicate_in_a  — Same document key appears multiple times in A
 *   duplicate_in_b  — Same document key appears multiple times in B
 *   stale_record    — Record date significantly outside the expected period
 *
 * (probable_match exceptions are created by fuzzy-match.ts)
 *
 * Each exception is:
 *   - Typed (ExceptionType)
 *   - Severity-classified (info / watch / elevated / critical)
 *   - Explainable (explanation + reasons[])
 *   - Linked to raw records for operator review
 *
 * IMPORTANT: Backend-only. Never import in client components.
 */

import type { CanonicalReconRecord }          from "../canonical-record";
import type { ReconException, ExceptionSeverity, DuplicateGroup } from "./engine-types";

// ── Single-record exceptions ───────────────────────────────────────────────────

/**
 * Classify an unmatched record from source A as only_in_a.
 */
export function classifyOnlyInA(record: CanonicalReconRecord): ReconException {
  return {
    id:          `ex:only_in_a:${record.id}`,
    type:        "only_in_a",
    severity:    severityForOrphan(record),
    recordA:     record,
    explanation: `Registro en fuente A sin contraparte en fuente B — ${record.documentNumber ?? record.externalId}`,
    reasons:     [
      `Documento: ${record.documentNumber ?? "(sin número)"}`,
      `Valor: ${record.amount.toFixed(2)} ${record.currency}`,
      `Tercero: ${record.thirdPartyName ?? record.thirdPartyId ?? "(desconocido)"}`,
      `Fecha: ${record.date ?? "(sin fecha)"}`,
      `No se encontró coincidencia por número de documento, ID externo, ni composición valor+NIT+fecha`,
    ],
    amountA:     record.amount,
  };
}

/**
 * Classify an unmatched record from source B as only_in_b.
 */
export function classifyOnlyInB(record: CanonicalReconRecord): ReconException {
  return {
    id:          `ex:only_in_b:${record.id}`,
    type:        "only_in_b",
    severity:    severityForOrphan(record),
    recordB:     record,
    explanation: `Registro en fuente B sin contraparte en fuente A — ${record.documentNumber ?? record.externalId}`,
    reasons:     [
      `Documento: ${record.documentNumber ?? "(sin número)"}`,
      `Valor: ${record.amount.toFixed(2)} ${record.currency}`,
      `Tercero: ${record.thirdPartyName ?? record.thirdPartyId ?? "(desconocido)"}`,
      `Fecha: ${record.date ?? "(sin fecha)"}`,
      `No se encontró coincidencia en fuente A`,
    ],
    amountB:     record.amount,
  };
}

// ── Duplicate exceptions ───────────────────────────────────────────────────────

/**
 * Classify a duplicate group from source A.
 *
 * All records in the group are included in the exception.
 * The group is excluded from exact matching (first occurrence only enters the index).
 */
export function classifyDuplicateGroup(group: DuplicateGroup): ReconException {
  const exType = group.side === "a" ? "duplicate_in_a" : "duplicate_in_b";
  const exId   = `ex:${exType}:${group.duplicateKey}`;
  const total  = group.records.reduce((s, r) => s + r.amount, 0);

  return {
    id:          exId,
    type:        exType,
    severity:    "elevated",
    recordA:     group.side === "a" ? group.records[0] : undefined,
    recordB:     group.side === "b" ? group.records[0] : undefined,
    explanation: `Clave duplicada en fuente ${group.side.toUpperCase()}: "${group.duplicateKey}" aparece ${group.count} veces`,
    reasons:     [
      `Clave: ${group.duplicateKey}`,
      `Ocurrencias: ${group.count}`,
      `Monto total combinado: ${total.toFixed(2)}`,
      `Sólo el primer registro participó en el matching; los demás requieren revisión`,
      ...group.records.map((r, i) => `  [${i + 1}] id=${r.id} monto=${r.amount.toFixed(2)} fecha=${r.date ?? "?"}`),
    ],
  };
}

// ── Stale record detection ────────────────────────────────────────────────────

/**
 * Check whether a record's date is significantly older than a reference period.
 *
 * A "stale" record has a date more than `staleDays` days before the reference date.
 * Default: 180 days (6 months).
 *
 * Returns a stale_record exception if stale, or null if within tolerance.
 *
 * NOTE: This is informational only — stale records still participate in matching.
 */
export function checkStaleRecord(
  record:        CanonicalReconRecord,
  side:          "a" | "b",
  referenceDate: Date,
  staleDays:     number = 180,
): ReconException | null {
  if (!record.date) return null;

  const recordDate = new Date(record.date + "T00:00:00.000Z");
  if (isNaN(recordDate.getTime())) return null;

  const msPerDay = 86_400_000;
  const diffDays = Math.floor((referenceDate.getTime() - recordDate.getTime()) / msPerDay);

  if (diffDays < staleDays) return null;

  return {
    id:          `ex:stale_record:${record.id}`,
    type:        "stale_record",
    severity:    diffDays > 365 ? "elevated" : "watch",
    recordA:     side === "a" ? record : undefined,
    recordB:     side === "b" ? record : undefined,
    explanation: `Registro de fuente ${side.toUpperCase()} con fecha antigua (${diffDays} días atrás) — ${record.date}`,
    reasons:     [
      `Fecha del registro: ${record.date}`,
      `Fecha de referencia: ${referenceDate.toISOString().slice(0, 10)}`,
      `Diferencia: ${diffDays} días (umbral: ${staleDays} días)`,
      `Tipo de documento: ${record.documentType}`,
    ],
    amountA: side === "a" ? record.amount : undefined,
    amountB: side === "b" ? record.amount : undefined,
  };
}

// ── Amount mismatch exception (for matched-but-discrepant pairs) ──────────────

/**
 * Build a standalone amount_mismatch exception when needed.
 *
 * Note: amount_mismatch pairs primarily appear in `matches[]` with decision="amount_mismatch".
 * This function is for cases where the exception needs to be logged separately
 * (e.g., amount discrepancy above a critical threshold).
 */
export function classifyAmountMismatch(
  a:         CanonicalReconRecord,
  b:         CanonicalReconRecord,
  delta:     number,
  deltaPct?: number | null,
): ReconException {
  const severity: ExceptionSeverity =
    Math.abs(deltaPct ?? 0) > 10 ? "critical" :
    Math.abs(deltaPct ?? 0) > 5  ? "elevated" :
    Math.abs(deltaPct ?? 0) > 1  ? "watch" : "info";

  return {
    id:          `ex:amount_mismatch:${a.id}:${b.id}`,
    type:        "amount_mismatch" as never, // not in ExceptionType; kept for external callers
    severity,
    recordA:     a,
    recordB:     b,
    explanation: `Diferencia de monto detectada — ${a.documentNumber ?? a.externalId}: ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`,
    reasons:     [
      `Monto fuente A: ${a.amount.toFixed(2)} ${a.currency}`,
      `Monto fuente B: ${b.amount.toFixed(2)} ${b.currency}`,
      `Delta: ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`,
      deltaPct != null ? `Delta %: ${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(2)}%` : "",
    ].filter(Boolean),
    amountA:     a.amount,
    amountB:     b.amount,
    amountDelta: delta,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Determine severity for an orphan record.
 * Large amounts or certain document types escalate severity.
 */
function severityForOrphan(record: CanonicalReconRecord): ExceptionSeverity {
  // Fiscal documents (DIAN invoices) are always elevated
  if (record.documentType === "FE" || record.sourceId === "dian_xml" || record.sourceId === "dian_invoice") {
    return "elevated";
  }
  // Large amounts
  if (record.amount >= 10_000_000) return "elevated"; // >= 10M COP
  if (record.amount >= 1_000_000)  return "watch";    // >= 1M COP
  return "info";
}
