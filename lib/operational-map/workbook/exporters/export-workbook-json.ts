/**
 * lib/operational-map/workbook/exporters/export-workbook-json.ts
 *
 * JSON exporter for the validation workbook.
 *
 * Exports:
 *   - Full workbook (all data)
 *   - Rows-only (lightweight for API responses)
 *   - Blockers-only
 *   - Executive summary
 *   - Domain-filtered view
 *
 * Sprint: AGENTIK-SAG-VALIDATION-WORKBOOK-01
 */

import type {
  ValidationWorkbook,
  WorkbookView,
  OperationalBlocker,
  WorkbookExecutiveSummary,
  ValidationWorkbookDomain,
} from "../operational-validation-workbook-types";
import type { OperationalDomainKey } from "../../operational-source-map";

// ─── Full export ──────────────────────────────────────────────────────────────

export function exportWorkbookToJson(workbook: ValidationWorkbook): string {
  return JSON.stringify(workbook, null, 2);
}

// ─── View-filtered export ─────────────────────────────────────────────────────

export interface WorkbookJsonViewResult {
  view:          WorkbookView;
  generatedAt:   string;
  stats: {
    totalRows:  number;
    pendingRows: number;
    criticalRows: number;
  };
  data: ValidationWorkbook["rows"] | ValidationWorkbookDomain[] | OperationalBlocker[] | WorkbookExecutiveSummary;
}

export function exportWorkbookView(
  workbook: ValidationWorkbook,
  view:     WorkbookView,
  filters?: {
    domain?:   OperationalDomainKey;
    priority?: "critical" | "high" | "medium" | "low";
    status?:   "pending" | "answered" | "blocked" | "not_applicable";
  },
): WorkbookJsonViewResult {
  let data: WorkbookJsonViewResult["data"];
  let rows = workbook.rows;

  // Apply filters
  if (filters?.domain)   rows = rows.filter(r => r.domain === filters.domain);
  if (filters?.priority) rows = rows.filter(r => r.priority === filters.priority);
  if (filters?.status)   rows = rows.filter(r => r.answerState === filters.status);

  switch (view) {
    case "executive":
      data = workbook.executiveSummary;
      break;
    case "technical":
      data = rows;
      break;
    case "domain":
      data = workbook.byDomain.filter(
        d => !filters?.domain || d.key === filters.domain,
      );
      break;
    case "priority":
      data = [...rows].sort((a, b) => b.scores.meetingPriorityScore - a.scores.meetingPriorityScore);
      break;
    case "blockers":
      data = workbook.blockers;
      break;
    default:
      data = rows;
  }

  return {
    view,
    generatedAt:  workbook.generatedAt,
    stats: {
      totalRows:    rows.length,
      pendingRows:  rows.filter(r => r.answerState === "pending").length,
      criticalRows: rows.filter(r => r.priority === "critical").length,
    },
    data,
  };
}
