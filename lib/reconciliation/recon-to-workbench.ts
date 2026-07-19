/**
 * lib/reconciliation/recon-to-workbench.ts
 *
 * AGENTIK-RECON-EXCEPTIONS-01
 * Adapter: ReconRecord[] → WorkbenchException[]
 *
 * Converts legacy engine output (ReconRecord) into the workbench-native
 * WorkbenchException format for the Exception Resolution Workbench.
 *
 * MATCH records are excluded — they require no review.
 * All exception records are severity-classified and reason-enriched.
 *
 * CLIENT-SAFE: No Prisma, no server imports.
 */

import type { ReconRecord }                                       from "./types";
import type { WorkbenchException, WorkbenchSeverity, WorkbenchExceptionType } from "./workbench-types";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtCOP(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style:                "currency",
    currency:             "COP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtNull(n: number | null): string {
  return n != null ? fmtCOP(n) : "—";
}

// ── Severity classifiers ──────────────────────────────────────────────────────

function mismatchSeverity(deltaPct: number | null): WorkbenchSeverity {
  const abs = Math.abs(deltaPct ?? 0);
  if (abs > 10) return "critical";
  if (abs > 5)  return "elevated";
  if (abs > 1)  return "watch";
  return "info";
}

function orphanSeverity(amount: number | null): WorkbenchSeverity {
  const a = Math.abs(amount ?? 0);
  if (a >= 10_000_000) return "elevated";
  if (a >= 1_000_000)  return "watch";
  return "info";
}

// ── Reason builders ───────────────────────────────────────────────────────────

function reasonsMismatch(
  r:            ReconRecord,
  sourceALabel: string,
  sourceBLabel: string,
): string[] {
  return [
    `${sourceALabel}: ${fmtNull(r.amountA)}`,
    `${sourceBLabel}: ${fmtNull(r.amountB)}`,
    r.delta       != null ? `Delta: ${r.delta >= 0 ? "+" : ""}${fmtCOP(r.delta)}` : "",
    r.deltaPercent != null ? `Diferencia porcentual: ${r.deltaPercent >= 0 ? "+" : ""}${r.deltaPercent.toFixed(2)}%` : "",
    `Clave del registro: ${r.key}`,
    `Filas — A: ${r.rowsA} · B: ${r.rowsB}`,
  ].filter(Boolean);
}

function reasonsOnlyInA(
  r:            ReconRecord,
  sourceALabel: string,
  sourceBLabel: string,
): string[] {
  return [
    `Presente en ${sourceALabel}, sin contraparte en ${sourceBLabel}`,
    r.amountA != null ? `Monto: ${fmtCOP(r.amountA)}` : "",
    `Clave: ${r.key}`,
    r.rowsA > 1 ? `${r.rowsA} filas en fuente A para esta clave` : "",
    `No se encontró ningún registro coincidente en la fuente B para este período`,
    `Acción sugerida: verificar si el registro existe en ${sourceBLabel} con clave distinta`,
  ].filter(Boolean);
}

function reasonsOnlyInB(
  r:            ReconRecord,
  sourceALabel: string,
  sourceBLabel: string,
): string[] {
  return [
    `Presente en ${sourceBLabel}, sin contraparte en ${sourceALabel}`,
    r.amountB != null ? `Monto: ${fmtCOP(r.amountB)}` : "",
    `Clave: ${r.key}`,
    r.rowsB > 1 ? `${r.rowsB} filas en fuente B para esta clave` : "",
    `No se encontró ningún registro coincidente en la fuente A para este período`,
    `Acción sugerida: verificar si es un pago sin factura asociada o un registro rezagado`,
  ].filter(Boolean);
}

function reasonsDuplicate(
  r:            ReconRecord,
  sourceALabel: string,
  sourceBLabel: string,
): string[] {
  return [
    r.rowsA > 1 ? `Clave aparece ${r.rowsA} veces en ${sourceALabel}` : "",
    r.rowsB > 1 ? `Clave aparece ${r.rowsB} veces en ${sourceBLabel}` : "",
    `Clave duplicada: ${r.key}`,
    `Solo el primer registro participó en el matching — los restantes requieren revisión manual`,
    r.amountA != null ? `Monto referencia A: ${fmtCOP(r.amountA)}` : "",
    r.amountB != null ? `Monto referencia B: ${fmtCOP(r.amountB)}` : "",
    `Acción sugerida: identificar cuál es el registro correcto y anular o ajustar los duplicados`,
  ].filter(Boolean);
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<WorkbenchSeverity, number> = {
  critical: 0,
  elevated: 1,
  watch:    2,
  info:     3,
};

const TYPE_ORDER: Record<WorkbenchExceptionType, number> = {
  probable_match:  0,
  duplicate:       1,
  mismatch_amount: 2,
  only_in_b:       3,
  only_in_a:       4,
};

// ── Main adapter ──────────────────────────────────────────────────────────────

/**
 * Convert ReconRecord[] into WorkbenchException[].
 *
 * MATCH records are excluded — they require no review.
 * Output is sorted: critical → elevated → watch → info, then by exception type priority.
 */
export function reconRecordsToExceptions(
  records:      ReconRecord[],
  sourceALabel: string,
  sourceBLabel: string,
): WorkbenchException[] {
  const exceptions: WorkbenchException[] = [];

  for (const r of records) {
    if (r.status === "MATCH") continue;

    let type:        WorkbenchExceptionType;
    let severity:    WorkbenchSeverity;
    let explanation: string;
    let reasons:     string[];

    switch (r.status) {
      case "MISMATCH_AMOUNT":
        type        = "mismatch_amount";
        severity    = mismatchSeverity(r.deltaPercent);
        explanation = `Diferencia de monto — ${r.label}: A=${fmtNull(r.amountA)} · B=${fmtNull(r.amountB)} · delta=${fmtNull(r.delta)}`;
        reasons     = reasonsMismatch(r, sourceALabel, sourceBLabel);
        break;

      case "ONLY_IN_A":
        type        = "only_in_a";
        severity    = orphanSeverity(r.amountA);
        explanation = `Sin contraparte en ${sourceBLabel} — ${r.label}: ${fmtNull(r.amountA)}`;
        reasons     = reasonsOnlyInA(r, sourceALabel, sourceBLabel);
        break;

      case "ONLY_IN_B":
        type        = "only_in_b";
        severity    = orphanSeverity(r.amountB);
        explanation = `Sin contraparte en ${sourceALabel} — ${r.label}: ${fmtNull(r.amountB)}`;
        reasons     = reasonsOnlyInB(r, sourceALabel, sourceBLabel);
        break;

      case "POSSIBLE_DUPLICATE":
        type        = "duplicate";
        severity    = "elevated";
        explanation = `Clave duplicada — ${r.label}: aparece ${r.rowsA + r.rowsB} veces en total`;
        reasons     = reasonsDuplicate(r, sourceALabel, sourceBLabel);
        break;

      default:
        continue;
    }

    exceptions.push({
      id:             `wb:${r.status.toLowerCase()}:${r.key}`,
      type,
      severity,
      label:          r.label,
      explanation,
      reasons,
      amountA:        r.amountA,
      amountB:        r.amountB,
      amountDelta:    r.delta,
      amountDeltaPct: r.deltaPercent,
      recordKey:      r.key,
      rowsA:          r.rowsA,
      rowsB:          r.rowsB,
      metaA:          r.metaA,
      metaB:          r.metaB,
    });
  }

  return exceptions.sort((a, b) => {
    const sd = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sd !== 0) return sd;
    return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
  });
}

// ── Summary helpers ────────────────────────────────────────────────────────────

/**
 * Count exceptions by type from a WorkbenchException[].
 */
export function countByType(
  exceptions: WorkbenchException[],
): Record<WorkbenchExceptionType, number> {
  return {
    probable_match:  exceptions.filter(e => e.type === "probable_match").length,
    duplicate:       exceptions.filter(e => e.type === "duplicate").length,
    mismatch_amount: exceptions.filter(e => e.type === "mismatch_amount").length,
    only_in_b:       exceptions.filter(e => e.type === "only_in_b").length,
    only_in_a:       exceptions.filter(e => e.type === "only_in_a").length,
  };
}

/**
 * Count exceptions by severity from a WorkbenchException[].
 */
export function countBySeverity(
  exceptions: WorkbenchException[],
): Record<WorkbenchSeverity, number> {
  return {
    critical: exceptions.filter(e => e.severity === "critical").length,
    elevated: exceptions.filter(e => e.severity === "elevated").length,
    watch:    exceptions.filter(e => e.severity === "watch").length,
    info:     exceptions.filter(e => e.severity === "info").length,
  };
}
