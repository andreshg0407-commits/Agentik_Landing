/**
 * lib/operational-map/workbook/exporters/export-workbook-csv.ts
 *
 * CSV exporter for the validation workbook.
 * No external dependencies — pure string manipulation.
 *
 * Outputs three CSV variants:
 *   - Full technical workbook (all columns)
 *   - Executive summary (domain, status, open count)
 *   - SAG meeting checklist (question, table, fields, impact, priority)
 *
 * Sprint: AGENTIK-SAG-VALIDATION-WORKBOOK-01
 */

import type { ValidationWorkbook, ValidationWorkbookRow } from "../operational-validation-workbook-types";

// ─── CSV escape helper ────────────────────────────────────────────────────────

function csvCell(value: string | number | null | undefined): string {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(",");
}

// ─── Full technical workbook CSV ──────────────────────────────────────────────

const TECHNICAL_HEADERS = [
  "ID",
  "Dominio",
  "Entidad",
  "Source of Truth",
  "Prioridad",
  "Frecuencia",
  "Estado Respuesta",
  "Nivel Bloqueador",
  "Tabla SAG Candidata",
  "Campos SAG Candidatos",
  "SQL Hint",
  "Pregunta de Validación",
  "Impacto Operacional",
  "Consumido por",
  "Score Prioridad Reunión",
  "Respuesta",
  "Respondido por",
  "Fecha Respuesta",
  "Notas",
];

export function exportWorkbookToCsv(workbook: ValidationWorkbook): string {
  const lines: string[] = [csvRow(TECHNICAL_HEADERS)];

  for (const row of workbook.rows) {
    lines.push(csvRow([
      row.id,
      row.domainLabel,
      row.entityLabel,
      row.sourceOfTruth,
      row.priority,
      row.frequency,
      row.answerState,
      row.blockerLevel,
      row.sagTableCandidate ?? "",
      row.sagFieldCandidates.join(" / "),
      row.sagSqlHint ?? "",
      row.validationQuestion,
      row.operationalImpact,
      row.consumedBy.join(", "),
      row.scores.meetingPriorityScore,
      row.answer ?? "",
      row.answeredBy ?? "",
      row.answeredAt ?? "",
      row.notes ?? "",
    ]));
  }

  return lines.join("\n");
}

// ─── Executive summary CSV ────────────────────────────────────────────────────

const EXECUTIVE_HEADERS = [
  "Dominio",
  "Total Preguntas",
  "Pendientes",
  "Respondidas",
  "Bloqueadores Críticos",
  "Score Total",
];

export function exportExecutiveSummaryCsv(workbook: ValidationWorkbook): string {
  const lines: string[] = [csvRow(EXECUTIVE_HEADERS)];

  for (const domain of workbook.byDomain) {
    const criticalOpen = domain.rows.filter(
      r => r.blockerLevel === "critical" && r.answerState === "pending",
    ).length;
    lines.push(csvRow([
      domain.label,
      domain.stats.total,
      domain.stats.pending,
      domain.stats.answered,
      criticalOpen,
      domain.domainPriorityScore,
    ]));
  }

  return lines.join("\n");
}

// ─── SAG meeting checklist CSV ────────────────────────────────────────────────

const CHECKLIST_HEADERS = [
  "Prioridad",
  "Dominio",
  "Entidad",
  "Tabla SAG",
  "Campos SAG",
  "Pregunta",
  "Impacto si no se responde",
  "Score Reunión",
  "Respondido",
];

export function exportMeetingChecklistCsv(workbook: ValidationWorkbook): string {
  const lines: string[] = [csvRow(CHECKLIST_HEADERS)];

  const rows: ValidationWorkbookRow[] = workbook.rows
    .filter(r => r.answerState === "pending" || r.answerState === "blocked")
    .sort((a, b) => b.scores.meetingPriorityScore - a.scores.meetingPriorityScore);

  for (const row of rows) {
    lines.push(csvRow([
      row.priority.toUpperCase(),
      row.domainLabel,
      row.entityLabel,
      row.sagTableCandidate ?? "SAG_CONFIRMAR",
      row.sagFieldCandidates.length > 0 ? row.sagFieldCandidates.join(" / ") : "SAG_CONFIRMAR",
      row.validationQuestion,
      row.operationalImpact,
      row.scores.meetingPriorityScore,
      "",  // empty — to be filled during meeting
    ]));
  }

  return lines.join("\n");
}
