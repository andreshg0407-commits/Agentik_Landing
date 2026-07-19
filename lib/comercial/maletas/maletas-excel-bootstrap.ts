/**
 * lib/comercial/maletas/maletas-excel-bootstrap.ts
 *
 * SERVER-ONLY bootstrap loader that reads MALETAS.xlsx and DISPONIBLE PARA MALETAS.xlsx
 * using the `xlsx` npm package and returns normalized data for the engine.
 *
 * This is the V1 data source (Excel as bootstrap).
 * When CommercialCase/CaseItem/CaseInventorySnapshot Prisma models are migrated,
 * replace this module with a Prisma-backed loader — the engine interface stays unchanged.
 *
 * NEVER import this in client components.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-ENGINE-01
 */

import * as XLSX from "xlsx";
import path from "path";
import type { RawCaseRow, RawAvailabilityRecord } from "./maletas-types";
import { normalizeCaseRow, normalizeAvailabilityRecord } from "./maletas-normalizer";

// ─── File paths ────────────────────────────────────────────────────────────────

// In production, these should come from env vars or tenant config.
// For V1, we use the project-relative paths (developer machine only).
const MALETAS_PATH = process.env.MALETAS_EXCEL_PATH ?? "";
const DISPONIBLE_PATH = process.env.DISPONIBLE_EXCEL_PATH ?? "";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ExcelBootstrapData {
  ltRows: RawCaseRow[];
  csRows: RawCaseRow[];
  availability: RawAvailabilityRecord[];
  ltBatchLabels: string[];
  csBatchLabels: string[];
}

// ─── Loader ────────────────────────────────────────────────────────────────────

/**
 * Load and normalize data from Excel files.
 * Returns null if files are not found (graceful degradation).
 */
export async function loadMaletasExcelData(
  options: {
    maletasPath?: string;
    disponiblePath?: string;
  } = {},
): Promise<ExcelBootstrapData | null> {
  const mPath = options.maletasPath ?? MALETAS_PATH;
  const dPath = options.disponiblePath ?? DISPONIBLE_PATH;

  if (!mPath || !dPath) {
    console.warn(
      "[maletas-excel-bootstrap] Excel paths not configured. " +
        "Set MALETAS_EXCEL_PATH and DISPONIBLE_EXCEL_PATH env vars.",
    );
    return null;
  }

  try {
    const maletasWb = XLSX.readFile(mPath, { type: "file", cellFormula: false, cellNF: false });
    const disponibleWb = XLSX.readFile(dPath, { type: "file", cellFormula: false, cellNF: false });

    const ltRows = parseLtSheet(maletasWb);
    const csRows = parseCsSheet(maletasWb);
    const availability = parseAvailabilitySheet(maletasWb);

    const ltBatchLabels = extractBatchLabels(maletasWb, "LT.");
    const csBatchLabels = extractBatchLabels(maletasWb, "CS");

    // If disponible workbook has a richer availability sheet, prefer it
    const disponibleAvail = parseDisponibleSheet(disponibleWb);
    const mergedAvail =
      disponibleAvail.length > availability.length ? disponibleAvail : availability;

    return {
      ltRows,
      csRows,
      availability: mergedAvail,
      ltBatchLabels,
      csBatchLabels,
    };
  } catch (err) {
    console.error("[maletas-excel-bootstrap] Failed to load Excel files:", err);
    return null;
  }
}

// ─── Sheet parsers ─────────────────────────────────────────────────────────────

const VENDOR_COLUMNS = ["CARLOS LEON", "CARLOS VILLA", "NESTOR", "ORLANDO"];

function parseLtSheet(wb: XLSX.WorkBook): RawCaseRow[] {
  return parseCaseSheet(wb, "LT.");
}

function parseCsSheet(wb: XLSX.WorkBook): RawCaseRow[] {
  return parseCaseSheet(wb, "CS");
}

function parseCaseSheet(wb: XLSX.WorkBook, sheetName: string): RawCaseRow[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown as unknown[][];

  if (rows.length < 2) return [];

  const headers = (rows[0] as (string | null)[]).map((h) =>
    h ? String(h).trim().toUpperCase() : "",
  );

  // Find batch label columns (col index >= 8 with "EN PROCESO" in header)
  const batchColIndices: number[] = [];
  const batchLabels: string[] = [];
  for (let i = 8; i < headers.length; i++) {
    if (headers[i] && headers[i].includes("EN PROCESO")) {
      batchColIndices.push(i);
      batchLabels.push(headers[i]);
    }
  }

  const result: RawCaseRow[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as (string | number | null)[];
    const ref = row[0];
    if (!ref || typeof ref !== "string" || !ref.trim()) continue;

    const desc = row[1] ? String(row[1]).trim() : "";

    const vendors: Record<string, boolean> = {};
    for (const vName of VENDOR_COLUMNS) {
      const colIdx = headers.indexOf(vName);
      if (colIdx === -1) {
        vendors[vName] = false;
      } else {
        const val = row[colIdx];
        vendors[vName] = val !== null && val !== undefined && val !== 0 && val !== "";
      }
    }

    const batches: string[] = [];
    for (let bi = 0; bi < batchColIndices.length; bi++) {
      const val = row[batchColIndices[bi]];
      if (val !== null && val !== undefined && String(val).trim() !== "") {
        batches.push(batchLabels[bi]);
      }
    }

    result.push(
      normalizeCaseRow({ ref: String(ref).trim(), desc, vendors, batches }),
    );
  }

  return result;
}

function parseAvailabilitySheet(wb: XLSX.WorkBook): RawAvailabilityRecord[] {
  const ws = wb.Sheets["DISPONIBLE INFO"];
  if (!ws) return [];
  return parseAvailabilityRows(ws);
}

function parseDisponibleSheet(wb: XLSX.WorkBook): RawAvailabilityRecord[] {
  // Try "DISPONIBLE PARA MALETA" sheet (has a filter header, data starts row 5)
  const ws = wb.Sheets["DISPONIBLE PARA MALETA"];
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown as unknown[][];

  // Find the header row (CÓDIGO ARTÍCULO)
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as (string | null)[];
    if (row.some((c) => c && String(c).includes("CÓDIGO ARTÍCULO"))) {
      headerRow = i;
      break;
    }
  }

  if (headerRow === -1) return [];

  const result: RawAvailabilityRecord[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] as (string | number | null)[];
    const refCode = row[0];
    if (!refCode) continue;
    const description = row[1] ? String(row[1]) : "";
    const inventario = Number(row[2]) || 0;
    const pedidos = Number(row[3]) || 0;
    const disponible = Number(row[4]) || 0;

    result.push(
      normalizeAvailabilityRecord({
        refCode: String(refCode),
        description,
        inventario,
        pedidos,
        disponible,
      }),
    );
  }

  return result;
}

function parseAvailabilityRows(ws: XLSX.WorkSheet): RawAvailabilityRecord[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown as unknown[][];

  if (rows.length < 2) return [];

  const result: RawAvailabilityRecord[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as (string | number | null)[];
    const refCode = row[0];
    if (!refCode) continue;
    result.push(
      normalizeAvailabilityRecord({
        refCode: String(refCode),
        description: row[1] ? String(row[1]) : "",
        inventario: Number(row[2]) || 0,
        pedidos: Number(row[3]) || 0,
        disponible: Number(row[4]) || 0,
      }),
    );
  }
  return result;
}

function extractBatchLabels(wb: XLSX.WorkBook, sheetName: string): string[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown as unknown[][];

  if (rows.length === 0) return [];
  const headers = rows[0] as (string | null)[];
  return headers
    .slice(8)
    .filter((h): h is string => !!h && String(h).includes("EN PROCESO"))
    .map((h) => String(h).trim());
}
