/**
 * lib/comercial/tiendas/store-replenishment-document-excel.ts
 *
 * AGENTIK-STORES-REPLENISHMENT-DOCUMENT-01 (v2) — Excel sheet builder.
 *
 * PURO: convierte el snapshot en filas tipadas por hoja (AOA). El servicio
 * convierte a workbook binario con `xlsx`. Unidades como NÚMEROS.
 *
 * Ajuste certificado — protección contra FORMULA INJECTION: toda celda de
 * texto que empiece por = + - @ (o contenga tab/CR iniciales) se neutraliza
 * con apóstrofo, para que Excel la trate como texto y nunca ejecute fórmulas
 * inyectadas vía nombres de producto o razones.
 */

import type { ReplenishmentDocumentSnapshot } from "./store-replenishment-document-types";

export type SheetCell = string | number | boolean;

export interface DocumentSheet {
  readonly name: string;
  readonly rows: readonly (readonly SheetCell[])[];
}

// ── Anti formula-injection ───────────────────────────────────────────────────

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/** Neutraliza texto que Excel interpretaría como fórmula. Números/booleanos pasan intactos. */
export function sanitizeCell(value: SheetCell): SheetCell {
  if (typeof value !== "string") return value;
  return FORMULA_TRIGGER.test(value) ? `'${value}` : value;
}

function row(...cells: SheetCell[]): SheetCell[] {
  return cells.map(sanitizeCell);
}

// ── Sheets ───────────────────────────────────────────────────────────────────

export function buildReplenishmentDocumentSheets(
  s: ReplenishmentDocumentSnapshot,
): DocumentSheet[] {
  const resumen: DocumentSheet = {
    name: "Resumen",
    rows: [
      row("Documento", s.documentNumber),
      row("Tienda", s.storeName),
      row("Plan calculado", s.planGeneratedAt),
      row("Documento generado", s.documentGeneratedAt),
      row("Generado por", s.generatedBy),
      row("Corrida (batch)", s.batchId),
      row("Versión de snapshot", s.schemaVersion),
      row("Escasez global de pool", s.scarcityMaterializedGlobal),
      row("Escasez afectó esta tienda", s.scarcityAffectedThisStore),
      [],
      row("Unidades requeridas", s.summary.requiredUnits),
      row("Unidades ejecutables", s.summary.executableUnits),
      row("Unidades asignadas", s.summary.allocatedUnits),
      row("Pendiente de asignación", s.summary.allocationPendingUnits),
      row("Pendiente de negocio", s.summary.totalBusinessPendingUnits),
      row("Unidades a retirar", s.summary.withdrawalUnits),
      row("Sugerencias", s.summary.suggestionCount),
    ],
  };

  const reposiciones: DocumentSheet = {
    name: "Reposiciones",
    rows: [
      row("#", "Referencia", "Producto", "Estructura", "Tipo", "Unidades", "Justificación"),
      ...s.suggestions.map((sg, i) => row(
        i + 1,
        sg.referenceCode,
        sg.productName,
        sg.structureKey,
        sg.candidateType,
        sg.units,
        sg.reasons.map(r => r.detail).join(" | "),
      )),
    ],
  };

  const retiros: DocumentSheet = {
    name: "Retiros",
    rows: [
      row("#", "Pieza", "Regla", "Unidades a retirar"),
      ...s.withdrawals.map((w, i) => row(
        i + 1,
        w.label,
        w.structureKey,
        w.requiredUnits,
      )),
    ],
  };

  const noAsignadas: DocumentSheet = {
    name: "No asignadas",
    rows: [
      row("#", "Estructura", "Requerido", "Ejecutable", "Asignado", "Pendiente negocio", "Causa"),
      ...s.unallocated.map((u, i) => row(
        i + 1,
        u.structureKey,
        u.requiredUnits,
        u.executableUnits,
        u.allocatedUnits,
        u.totalPendingUnits,
        u.reason,
      )),
    ],
  };

  return [resumen, reposiciones, retiros, noAsignadas];
}
