/**
 * Pivot-style Castillitos report parser.
 *
 * Handles the multi-row-header Excel/CSV format where:
 *   - seller name may appear in the top header rows
 *   - line groups (CASTILLITOS / LATIN KIDS / IMPORTACION) span multiple columns
 *   - each line group has a VALOR column and a CANTIDAD column
 *   - rows are per-order (fecha pedido + nombre cliente)
 *   - no flat vendedor, tienda, or canal columns per row
 *
 * Expected sheet layout (rows as arrays):
 *
 *   [0]  ""    ""              ""            ""          ""          ""
 *   [1]  ""    "JUAN GARCIA"   ""            ""          ""          ""     ← seller row (optional)
 *   [2]  ""    ""              "CASTILLITOS" ""          "LATIN KIDS" ""    ← line group row
 *   [3]  "FECHA PEDIDO" "NOMBRE CLIENTE" "VALOR" "CANTIDAD" "VALOR" "CANTIDAD"  ← col header row
 *   [4]  "15/03/2024"  "CLIENTE A"      "1250000" "2"      "850000" "1"    ← data
 *   ...
 *
 * Also handles SAG Real format:
 *   [1]  "LINEA"
 *   [2]  "CASTILLITOS" "" "" "LATIN KIDS" "" "" "IMPORTACION"              ← line group row
 *   [3]  "Suma de VR SUBTOTAL" "Suma de CANTIDAD" ...                      ← col header row
 *   [4]+ data
 *
 * Merged cells in CSV exports leave empty strings after the first cell of the
 * merged range — the parser forward-fills line group names to handle this.
 *
 * Output: RawSagRow[] compatible with importSalesRows() without modification.
 */

import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { RawSagRow } from "./types";

// ── Column map ────────────────────────────────────────────────────────────────

type ColType = "fecha" | "cliente" | "nit" | "valor" | "cantidad" | "ignore";

interface MappedCol {
  index:   number;
  colType: ColType;
  line:    string;   // line group name — only meaningful for "valor" / "cantidad"
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface PivotParseOptions {
  /** Default canal value for all produced rows. Default: "tienda" */
  defaultCanal?:    string;
  /** Override seller detection. Use when auto-detect is wrong. */
  sellerOverride?:  string;
  /** Override tienda. Defaults to the detected seller name. */
  tiendaOverride?:  string;
  /**
   * Skip rows where total across all value columns is below this threshold.
   * Avoids importing subtotal / grand-total rows. Default: 0 (skip zeros only).
   */
  minRowTotal?:     number;
}

/** Diagnostic: one valor+cantidad pair for a single line group */
export interface DetectedPair {
  line:        string;
  valorCol:    number;        // column index in sheet
  cantidadCol: number | null; // nearest cantidad col to the right, or null
}

export interface PivotParseResult {
  rows:             RawSagRow[];
  seller:           string;
  sellerSourceRow:  number;          // sheet row where seller was found (-1 = unknown)
  sellerSourceCol:  number;          // col index where seller was found (-1 = unknown)
  linesDetected:    string[];
  colHeaderRowIdx:  number;
  lineGroupRowIdx:  number;          // row used for line group names (-1 if none)
  sheetName:        string;          // which sheet was used
  detectedPairs:    DetectedPair[];  // per-line valor+cantidad col assignments
  totalRawRows:     number;
  producedRows:     number;
  skippedRows:      number;
  sampleRows:       RawSagRow[];
  firstRowsPreview: string[][];      // first ≤10 raw rows for debug UI
  warnings:         string[];
}

// ── Main entry points ─────────────────────────────────────────────────────────

/** Parse a raw CSV string. */
export function parsePivotCsv(
  csvText: string,
  options: PivotParseOptions = {}
): PivotParseResult {
  const parsed = Papa.parse<string[]>(csvText, {
    header:         false,
    skipEmptyLines: false,  // keep all rows so indices are stable
  });
  return parsePivotSheet(parsed.data as string[][], options, "csv");
}

/**
 * Parse an XLSX/XLS/ODS buffer.
 * Tries every sheet in order and uses the first one with a valid column header row.
 */
export function parsePivotXlsx(
  buffer: Buffer,
  options: PivotParseOptions = {}
): PivotParseResult {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });

  for (const wsName of wb.SheetNames) {
    const ws    = wb.Sheets[wsName];
    const sheet = XLSX.utils.sheet_to_json<string[]>(ws, {
      header:  1,
      defval:  "",
      raw:     false,   // format numbers as strings to preserve original formatting
    }) as string[][];

    // Only try sheets that have at least a few rows
    if (sheet.length < 2) continue;

    const result = parsePivotSheet(sheet, options, wsName);

    // Accept this sheet if a column header was found
    if (result.colHeaderRowIdx !== -1) return result;
  }

  // No valid sheet found — return last sheet's attempt with diagnostics
  const lastWs   = wb.Sheets[wb.SheetNames[wb.SheetNames.length - 1]];
  const lastSheet = XLSX.utils.sheet_to_json<string[]>(lastWs, {
    header: 1, defval: "", raw: false,
  }) as string[][];
  return parsePivotSheet(lastSheet, options, wb.SheetNames[wb.SheetNames.length - 1]);
}

// ── Core logic ────────────────────────────────────────────────────────────────

export function parsePivotSheet(
  sheet:      string[][],
  options:    PivotParseOptions = {},
  sheetName = "sheet"
): PivotParseResult {
  const {
    defaultCanal   = "tienda",
    sellerOverride,
    tiendaOverride,
    minRowTotal    = 0,
  } = options;

  const warnings: string[]     = [];
  const firstRowsPreview        = sheet.slice(0, 10).map(r =>
    r.map(c => (c ?? "").toString().trim())
  );

  if (sheet.length === 0) {
    return empty("Empty sheet", warnings, sheetName, firstRowsPreview);
  }

  // ── 1. Find column-header row ─────────────────────────────────────────────
  const colHeaderRowIdx = findColHeaderRow(sheet);
  if (colHeaderRowIdx === -1) {
    warnings.push(
      `Could not find column-header row in sheet "${sheetName}" (scanned first 40 rows). ` +
      `Expected a row with a date column (FECHA/PEDIDO/DIA) and at least one of ` +
      `VALOR, CANTIDAD, CLIENTE, NIT. Check firstRowsPreview in diagnostics.`
    );
    return empty("No column header found", warnings, sheetName, firstRowsPreview);
  }

  const colHeaderRow = sheet[colHeaderRowIdx].map(normalizeHeader);

  // ── 2. Find line group row (dynamic: scan back up to 3 rows) ─────────────
  const lineGroupRowIdx = findLineGroupRow(sheet, colHeaderRowIdx);
  const lineGroupRow    = lineGroupRowIdx >= 0
    ? forwardFill(sheet[lineGroupRowIdx].map(c => (c ?? "").toString().trim()))
    : [];

  const preHeaderRows = sheet.slice(0, Math.max(0, lineGroupRowIdx >= 0 ? lineGroupRowIdx : colHeaderRowIdx));

  // ── 3. Detect seller ──────────────────────────────────────────────────────
  const sellerDetection = sellerOverride
    ? { seller: sellerOverride, sourceRow: -1, sourceCol: -1 }
    : detectSeller(preHeaderRows, lineGroupRow, colHeaderRow, warnings);

  const seller = sellerDetection.seller;
  const tienda = tiendaOverride ?? seller;

  // ── 4. Build column map ───────────────────────────────────────────────────
  const { cols, detectedPairs } = buildColMap(colHeaderRow, lineGroupRow);

  const linesDetected = [...new Set(
    cols.filter(c => c.colType === "valor").map(c => c.line).filter(Boolean)
  )];

  if (linesDetected.length === 0) {
    warnings.push(
      "No line group columns detected. Expected VALOR/SUBTOTAL/CANTIDAD columns below a line group name row. " +
      `Line group row used: ${lineGroupRowIdx} (content: ${lineGroupRow.filter(Boolean).slice(0,5).join(" | ")})`
    );
  }

  const fechaCol    = cols.find(c => c.colType === "fecha");
  const clienteCol  = cols.find(c => c.colType === "cliente");
  const nitCol      = cols.find(c => c.colType === "nit");
  const valorCols   = cols.filter(c => c.colType === "valor");
  const cantidadMap = new Map(
    cols.filter(c => c.colType === "cantidad").map(c => [c.line, c.index])
  );

  if (!fechaCol) {
    warnings.push("No FECHA column detected — rows will have empty fecha.");
  }

  // ── 5. Process data rows ──────────────────────────────────────────────────
  const dataRows  = sheet.slice(colHeaderRowIdx + 1);
  const rows: RawSagRow[] = [];
  let skippedRows = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];

    // Skip visually empty rows
    if (row.every(c => !(c ?? "").toString().trim())) {
      skippedRows++;
      continue;
    }

    const rawFecha   = fechaCol   ? (row[fechaCol.index]   ?? "").toString().trim() : "";
    const rawCliente = clienteCol ? (row[clienteCol.index] ?? "").toString().trim() : "";
    const rawNit     = nitCol     ? (row[nitCol.index]     ?? "").toString().trim() : "";

    // Skip rows without a date (subtotals, repeated headers, grand-total lines)
    if (!rawFecha || looksLikeSummaryLabel(rawFecha)) {
      skippedRows++;
      continue;
    }

    const periodo = derivePeriodo(rawFecha);

    let producedFromRow = 0;
    for (const vc of valorCols) {
      const rawValor = (row[vc.index] ?? "").toString().trim();
      if (!rawValor || rawValor === "0" || rawValor === "0.00") continue;

      const numValor = parseLooseNumber(rawValor);
      if (numValor < minRowTotal) continue;

      const cantIdx     = cantidadMap.get(vc.line);
      const rawCantidad = cantIdx != null ? (row[cantIdx] ?? "").toString().trim() : "";

      rows.push({
        fecha:          rawFecha,
        vendedor:       seller,
        tienda,
        linea:          vc.line || "SIN LÍNEA",
        canal:          defaultCanal,
        valor:          rawValor,
        unidades:       rawCantidad || undefined,
        nombre_cliente: rawCliente  || undefined,
        nit_cliente:    rawNit      || undefined,
        periodo_ao_mes: periodo     || undefined,
      });
      producedFromRow++;
    }

    if (producedFromRow === 0) skippedRows++;
  }

  return {
    rows,
    seller,
    sellerSourceRow: sellerDetection.sourceRow,
    sellerSourceCol: sellerDetection.sourceCol,
    linesDetected,
    colHeaderRowIdx,
    lineGroupRowIdx,
    sheetName,
    detectedPairs,
    totalRawRows:     dataRows.length,
    producedRows:     rows.length,
    skippedRows,
    sampleRows:       rows.slice(0, 10),
    firstRowsPreview,
    warnings,
  };
}

// ── Detection helpers ─────────────────────────────────────────────────────────

/**
 * Normalise a header cell for matching:
 * lowercase, no accents, no leading/trailing dots, collapsed spaces.
 */
function normalizeHeader(s: string): string {
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // strip accents (á→a, é→e …)
    .replace(/\./g, " ")                                // dots → space (F. PEDIDO → F  PEDIDO)
    .replace(/\s+/g, " ")                               // collapse spaces
    .trim();
}

/** Returns true if the normalised cell value looks like a fecha/pedido marker. */
function isFechaCell(h: string): boolean {
  return (
    h === "fecha pedido"   ||
    h === "fecha factura"  ||
    h === "fecha"          ||
    h === "f pedido"       ||
    h === "f  pedido"      ||   // "F. PEDIDO" after dot→space
    h === "pedido"         ||
    h === "dia"            ||
    /^fecha/.test(h)       ||
    /pedido/.test(h)
  );
}

/**
 * Returns true if the normalised cell looks like a monetary value column.
 * Covers: VALOR, VENTA, IMPORTE, VR SUBTOTAL, SUBTOTAL, SUMA DE VR SUBTOTAL, etc.
 */
function isValorHeader(h: string): boolean {
  return (
    /^valor/.test(h)   ||
    /^venta/.test(h)   ||
    /^importe/.test(h) ||
    /subtotal/.test(h) ||   // "suma de vr subtotal", "vr subtotal", "subtotal"
    /^vr /.test(h)          // "vr subtotal" / "vr neto" etc.
  );
}

/**
 * Returns true if the normalised cell looks like a quantity column.
 * Covers: CANTIDAD, CANTIDAD PE, CANTIDAD PEDIDA, SUMA DE CANTIDAD, UNIDADES, QTY, etc.
 */
function isCantidadHeader(h: string): boolean {
  return (
    /^cant/.test(h)         ||   // "cantidad", "cantidad pe", "cantidad pedida"
    /^unid/.test(h)         ||
    /^qty/.test(h)          ||
    /\bcantidad\b/.test(h)       // "suma de cantidad"
  );
}

/**
 * Find the column-header row index.
 * Scans first 40 rows.
 * A row qualifies when it contains a fecha-like cell AND at least one of:
 *   VALOR/SUBTOTAL (isValorHeader), CANTIDAD (isCantidadHeader), CLIENTE, NIT
 */
function findColHeaderRow(sheet: string[][]): number {
  const SCAN_LIMIT = 40;

  for (let i = 0; i < Math.min(sheet.length, SCAN_LIMIT); i++) {
    const norm = sheet[i].map(normalizeHeader);

    const hasFecha      = norm.some(isFechaCell);
    const hasValor      = norm.some(isValorHeader);
    const hasCant       = norm.some(isCantidadHeader);
    const hasCliente    = norm.some(c => /cliente/.test(c) || /nombre/.test(c));
    const hasNit        = norm.some(c => /^nit/.test(c));

    const hasAnyDataCol = hasValor || hasCant || hasCliente || hasNit;

    if (hasFecha && hasAnyDataCol) return i;
  }

  return -1;
}

/**
 * Find the line-group row index dynamically.
 * Scans colHeaderRowIdx-1 down to colHeaderRowIdx-3 (closest first).
 * Returns the nearest row whose cells include a known line group keyword.
 * Falls back to colHeaderRowIdx-1 if no keyword match (original behaviour).
 */
function findLineGroupRow(sheet: string[][], colHeaderRowIdx: number): number {
  const lineKeywords = ["castillitos", "latin kids", "importacion", "linea"];

  for (let offset = 1; offset <= 3; offset++) {
    const ri = colHeaderRowIdx - offset;
    if (ri < 0) break;

    const row = sheet[ri].map(c =>
      (c ?? "").toString().toLowerCase().trim()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
    );

    if (row.some(cell => lineKeywords.some(kw => cell.includes(kw)))) {
      return ri;
    }
  }

  // Fallback: immediately above header (original behaviour)
  return colHeaderRowIdx > 0 ? colHeaderRowIdx - 1 : -1;
}

/**
 * Returns true when a line-group cell is a parser/SAG artifact rather than a
 * real business line.  These appear as grand-total or subtotal helper columns
 * at the end of the pivot (e.g. "Total Suma de VR SUBTOTAL ITEM",
 * "Total Suma de CANTIDAD PEDIDA").  Any column whose assigned line group name
 * matches this predicate is silently dropped so it never reaches SaleRecord.
 */
function isTechnicalLineLabel(line: string): boolean {
  const norm = line.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return (
    /^total/.test(norm)       ||   // "Total …", "Total Suma de …"
    /^subtotal/.test(norm)    ||   // "Subtotal …"
    /^gran\s+total/.test(norm)||   // "Gran Total"
    /^grand\s+total/.test(norm)    // "Grand Total"
  );
}

/**
 * Build the column map.
 * Phase 1: assign types using normalised header patterns (isValorHeader, isCantidadHeader).
 *          Columns whose line-group name is a technical total label are marked "ignore".
 * Phase 2: pairing fallback — for each line group with no detected valor cols,
 *          promote untyped columns positionally (first = valor, second = cantidad).
 * Returns cols array and detectedPairs diagnostics.
 */
function buildColMap(
  colHeaders: string[],
  lineGroups: string[]
): { cols: MappedCol[]; detectedPairs: DetectedPair[] } {
  // ── Phase 1: pattern-based assignment ────────────────────────────────────
  const cols: MappedCol[] = colHeaders.map((h, i) => {
    const line = (lineGroups[i] ?? "").trim();
    let colType: ColType = "ignore";

    // Drop columns whose line-group header is a grand-total / subtotal artifact
    if (isTechnicalLineLabel(line)) return { index: i, colType: "ignore", line };

    if (isFechaCell(h))            colType = "fecha";
    else if (/nit/.test(h))        colType = "nit";
    else if (/cliente|nombre/.test(h)) colType = "cliente";
    else if (isValorHeader(h))     colType = "valor";
    else if (isCantidadHeader(h))  colType = "cantidad";

    return { index: i, colType, line };
  });

  // ── Phase 2: positional fallback per line group ───────────────────────────
  // Group columns by non-empty line name
  const byLine: Record<string, MappedCol[]> = {};
  for (const col of cols) {
    if (!col.line) continue;
    if (!byLine[col.line]) byLine[col.line] = [];
    byLine[col.line].push(col);
  }

  for (const lineCols of Object.values(byLine)) {
    const hasValorCol    = lineCols.some(c => c.colType === "valor");
    const hasCantidadCol = lineCols.some(c => c.colType === "cantidad");

    // If neither valor nor cantidad detected, promote positionally
    if (!hasValorCol && !hasCantidadCol) {
      const untyped = lineCols.filter(c => c.colType === "ignore");
      if (untyped.length >= 1) untyped[0].colType = "valor";
      if (untyped.length >= 2) untyped[1].colType = "cantidad";
    }
  }

  // ── Build detectedPairs diagnostics ───────────────────────────────────────
  const detectedPairs: DetectedPair[] = [];
  for (const [line, lineCols] of Object.entries(byLine)) {
    const vCols = lineCols.filter(c => c.colType === "valor");
    const cCols = lineCols.filter(c => c.colType === "cantidad");

    for (const vc of vCols) {
      const cc = cCols.find(c => c.index > vc.index) ?? null;
      detectedPairs.push({ line, valorCol: vc.index, cantidadCol: cc?.index ?? null });
    }

    // Line with cantidad but no valor (unusual — warn via diagnostics only)
    if (vCols.length === 0 && cCols.length > 0) {
      detectedPairs.push({ line, valorCol: -1, cantidadCol: cCols[0].index });
    }
  }

  return { cols, detectedPairs };
}

interface SellerDetection {
  seller:    string;
  sourceRow: number;  // sheet row index (-1 = unknown / overridden)
  sourceCol: number;  // col index       (-1 = unknown / overridden)
}

/**
 * Detect seller from pre-header rows.
 * Priority:
 *   1. "NOMBRE VENDEDOR" label cell → use the next non-empty cell in the same row
 *      e.g. ["NOMBRE VENDEDOR", "LUIS ORLANDO NARANJO"] → "LUIS ORLANDO NARANJO"
 *   2. "VENDEDOR: Name" / "ASESOR: Name" colon-syntax in a single cell
 *   3. First non-empty, non-keyword, non-numeric cell in pre-header rows
 */
function detectSeller(
  preHeaderRows: string[][],
  lineGroupRow:  string[],
  colHeaderRow:  string[],
  warnings:      string[]
): SellerDetection {
  // Priority 1: "NOMBRE VENDEDOR" label → next non-empty cell
  const nombreVendedorRe = /^nombre\s+vendedor$/i;
  for (let ri = 0; ri < preHeaderRows.length; ri++) {
    const row = preHeaderRows[ri];
    for (let ci = 0; ci < row.length; ci++) {
      const v = (row[ci] ?? "").toString().trim();
      if (!nombreVendedorRe.test(v)) continue;
      for (let ni = ci + 1; ni < row.length; ni++) {
        const next = (row[ni] ?? "").toString().trim();
        if (next) return { seller: next, sourceRow: ri, sourceCol: ni };
      }
    }
  }

  // Priority 2: colon-syntax "VENDEDOR: Name"
  const keywordRe = /^(vendedor|asesor|representante|nombre)\s*:/i;
  for (let ri = 0; ri < preHeaderRows.length; ri++) {
    const row = preHeaderRows[ri];
    for (let ci = 0; ci < row.length; ci++) {
      const v = (row[ci] ?? "").toString().trim();
      if (!v || !keywordRe.test(v)) continue;
      const name = v.split(/:(.+)/)[1]?.trim();
      if (name) return { seller: name, sourceRow: ri, sourceCol: ci };
    }
  }

  // Priority 3: first non-empty cell that doesn't look like a structural keyword
  const colHeaderKeywords = new Set(colHeaderRow.filter(Boolean));
  const skipNorm = new Set([
    "castillitos", "latin kids", "importacion", "linea",
    "nombre vendedor", "vendedor", "asesor", "representante", "nombre",
  ]);

  for (let ri = 0; ri < preHeaderRows.length; ri++) {
    const row = preHeaderRows[ri];
    for (let ci = 0; ci < row.length; ci++) {
      const v = (row[ci] ?? "").toString().trim();
      if (!v) continue;
      const norm = normalizeHeader(v);
      if (colHeaderKeywords.has(norm)) continue;
      if (skipNorm.has(norm))          continue;
      if (/^\d/.test(v))               continue;
      if (v.length < 3)                continue;
      return { seller: v, sourceRow: ri, sourceCol: ci };
    }
  }

  warnings.push(
    "Seller could not be auto-detected. Use sellerOverride in the form, " +
    "or add a 'NOMBRE VENDEDOR' label cell with the name in the next cell."
  );
  return { seller: "DESCONOCIDO", sourceRow: -1, sourceCol: -1 };
}

/** Forward-fill empty cells: ["A","","","B",""] → ["A","A","A","B","B"] */
function forwardFill(row: string[]): string[] {
  const out = [...row];
  let last  = "";
  for (let i = 0; i < out.length; i++) {
    if (out[i]) { last = out[i]; } else { out[i] = last; }
  }
  return out;
}

/** Derive "YYYYMM" from various date formats. Returns "" on failure. */
function derivePeriodo(fecha: string): string {
  const s = fecha.trim();
  // ISO 2024-03-15
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 4) + s.slice(5, 7);
  // Colombian d/m/Y or d-m-Y
  const co = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (co) return `${co[3]}${co[2].padStart(2, "0")}`;
  // YYYYMMDD
  if (/^\d{8}$/.test(s)) return s.slice(0, 6);
  // YYYYMM already
  if (/^\d{6}$/.test(s)) return s;
  // Excel serial (number string like "45366")
  const serial = Number(s);
  if (!isNaN(serial) && serial > 40000 && serial < 60000) {
    const d = XLSX.SSF.parse_date_code(serial);
    if (d) return `${d.y}${String(d.m).padStart(2, "0")}`;
  }
  return "";
}

/** Detect summary / total rows by checking if the fecha cell is a label. */
function looksLikeSummaryLabel(s: string): boolean {
  return /total|subtotal|suma|grand/i.test(s);
}

/** Parse a loose Colombian or US number string to float, returns 0 on failure. */
function parseLooseNumber(s: string): number {
  const stripped = s.replace(/[^0-9.,-]/g, "").trim();
  if (!stripped) return 0;
  const n = parseFloat(stripped.replace(/\./g, "").replace(",", "."));
  return isFinite(n) ? n : 0;
}

function empty(
  reason:           string,
  warnings:         string[],
  sheetName:        string,
  firstRowsPreview: string[][]
): PivotParseResult {
  warnings.push(reason);
  return {
    rows: [], seller: "DESCONOCIDO",
    sellerSourceRow: -1, sellerSourceCol: -1,
    linesDetected: [],
    colHeaderRowIdx: -1, lineGroupRowIdx: -1, sheetName,
    detectedPairs: [],
    totalRawRows: 0, producedRows: 0, skippedRows: 0,
    sampleRows: [], firstRowsPreview, warnings,
  };
}
