/**
 * lib/operational-map/bootstrap/source-map-csv-normalizer.ts
 *
 * CSV text normalization for the Castillitos SAG document-type catalog.
 *
 * Handles:
 *  - Trim, case normalization
 *  - Provider alias resolution (S.A.G → sag, SuiteCRM → crm, etc.)
 *  - Classification → import status mapping
 *  - IMPACTA VENTAS / IMPACTA COBROS flags
 *
 * Sprint: AGENTIK-SOURCE-MAP-BOOTSTRAP-01
 */

import type { KpiSourceProvider } from "@/lib/operational-map/certification/operational-kpi-source-service";

// ─── Raw CSV row (post-parse, pre-normalize) ──────────────────────────────────

export interface RawCsvRow {
  rowNumber:       number;
  sagId:           string;   // ka_ni_fuente
  sourceName:      string;   // sc_nombre_fuente
  sagCode:         string;   // k_sc_codigo_fuente
  classification:  string;   // CLASIFICACION CASTILLITOS
  subclass:        string;   // col 4 (sometimes has label like "FACTURA EMPRESA")
  unidad:          string;   // UNIDAD
  tipo:            string;   // TIPO
  impactaVentas:   boolean;  // IMPACTA VENTAS
  impactaCobros:   boolean;  // IMPACTA COBROS
  visible:         string;   // VISIBLE
  activo:          string;   // ACTIVO
  historial:       string;   // HISTORIAL
  observacion:     string;   // OBSERVACION
}

// ─── Normalized row ────────────────────────────────────────────────────────────

export interface NormalizedCsvRow extends RawCsvRow {
  normalizedName:  string;
  normalizedCode:  string;
  provider:        KpiSourceProvider;
  shouldSkip:      boolean;   // EXCLUIR / ELIMINAR / N/A / ARKETOPS
  skipReason:      string | null;
  isOfficial:      boolean;   // classification === OFICIAL
  isF2:            boolean;   // classification === NO OFICIAL (Fuente 2)
  isHistorical:    boolean;   // classification starts with SE USO HACE TIEMPO
  isProduction:    boolean;   // classification === PRODUCCION
  isInventory:     boolean;   // tipo contains INVENTARIO
}

// ─── CSV parser ────────────────────────────────────────────────────────────────

const HEADER_MARKER = "ka_ni_fuente";

/**
 * Parse raw CSV text (semicolon-separated) into RawCsvRow[].
 * Skips header block and blank/comment lines.
 */
export function parseCsvText(text: string): RawCsvRow[] {
  const lines = text.split(/\r?\n/);

  // Find the header line
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(HEADER_MARKER)) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) throw new Error("CSV: header row not found");

  const dataLines = lines.slice(headerIdx + 1);
  const rows: RawCsvRow[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i].trim();
    if (!line || line.replace(/;/g, "").trim() === "") continue;

    const cols = splitCsvLine(line);
    if (cols.length < 3) continue;

    const sagId      = cols[0]?.trim() ?? "";
    const sourceName = cols[1]?.trim() ?? "";
    const sagCode    = cols[2]?.trim() ?? "";

    // Skip rows without at least a name or code
    if (!sourceName && !sagCode) continue;

    rows.push({
      rowNumber:      headerIdx + 1 + i + 1, // 1-based from file start
      sagId,
      sourceName,
      sagCode,
      classification: cols[3]?.trim() ?? "",
      subclass:       cols[4]?.trim() ?? "",
      unidad:         cols[5]?.trim() ?? "",
      tipo:           cols[6]?.trim() ?? "",
      impactaVentas:  parseYesNo(cols[7]),
      impactaCobros:  parseYesNo(cols[8]),
      visible:        cols[9]?.trim() ?? "",
      activo:         cols[10]?.trim() ?? "",
      historial:      cols[11]?.trim() ?? "",
      observacion:    cols[12]?.trim() ?? "",
    });
  }

  return rows;
}

/**
 * Split a semicolon-delimited line, respecting quoted fields.
 */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuote = false;

  for (const ch of line) {
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ";" && !inQuote) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseYesNo(val: string | undefined): boolean {
  const v = (val ?? "").trim().toUpperCase();
  return v === "SI" || v === "SI (+)" || v === "SI(+)";
}

// ─── Normalizer ────────────────────────────────────────────────────────────────

const SKIP_CLASSIFICATIONS = new Set([
  "ARKETOPS", "N/A", "NA", "NO SE USA",
]);

const SKIP_OBSERVACIONES = new Set([
  "EXCLUIR", "ELIMINAR", "NO TENER EN CUENTA", "EXCLUIR TOTALMENTE",
]);

/**
 * Normalize a raw CSV row into a structured, enriched form.
 */
export function normalizeRow(raw: RawCsvRow): NormalizedCsvRow {
  const cls = raw.classification.trim().toUpperCase();
  const obs = raw.observacion.trim().toUpperCase();
  const tipo = raw.tipo.trim().toUpperCase();

  const shouldSkipByClass = SKIP_CLASSIFICATIONS.has(cls);
  const shouldSkipByObs   = SKIP_OBSERVACIONES.has(obs) || obs.startsWith("EXCLUIR") || obs.startsWith("ELIMINAR");
  const shouldSkip        = shouldSkipByClass || shouldSkipByObs;

  const skipReason = shouldSkipByClass
    ? `Clasificación: ${raw.classification}`
    : shouldSkipByObs
    ? `Observación: ${raw.observacion}`
    : null;

  const isHistorical = cls.includes("SE USO HACE TIEMPO") ||
    raw.classification.toLowerCase().includes("se uso hace tiempo");
  const isProduction = cls === "PRODUCCION";
  const isOfficial   = cls === "OFICIAL";
  const isF2         = cls.includes("NO OFICIAL") || cls.includes("REMISION");
  const isInventory  = tipo.includes("INVENTARIO") || tipo.includes("LOGISTICA");

  return {
    ...raw,
    normalizedName: normalizeName(raw.sourceName),
    normalizedCode: raw.sagCode.trim().toUpperCase(),
    provider:       resolveProvider(raw),
    shouldSkip,
    skipReason,
    isOfficial,
    isF2,
    isHistorical,
    isProduction,
    isInventory,
  };
}

function normalizeName(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[^A-ZÁÉÍÓÚÑ0-9\s\-\.]/g, "");
}

function resolveProvider(raw: RawCsvRow): KpiSourceProvider {
  const cls  = raw.classification.trim().toUpperCase();
  const tipo = raw.tipo.trim().toUpperCase();
  const name = raw.sourceName.toUpperCase();

  // Arketops external system
  if (cls === "ARKETOPS") return "external";
  // Production module
  if (cls === "PRODUCCION") return "sag";
  // SAG-native (official or F2)
  if (cls === "OFICIAL" || cls.includes("NO OFICIAL") || cls.includes("REMISION")) return "sag";
  // Historical / legacy
  if (cls.includes("SE USO HACE TIEMPO")) return "sag";
  // Bank notes
  if (tipo.includes("BANCARIO") || tipo.includes("BANCO") || name.includes("BANCO")) return "bank";
  // Inventory/logistics internal
  if (tipo.includes("INVENTARIO") || tipo.includes("LOGISTICA") || tipo.includes("INTERNO")) return "sag";

  return "sag";
}

export function normalizeRows(rows: RawCsvRow[]): NormalizedCsvRow[] {
  return rows.map(normalizeRow);
}
