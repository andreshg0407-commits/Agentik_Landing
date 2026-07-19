/**
 * lib/operational-map/bootstrap/source-map-bootstrap-engine.ts
 *
 * Source Map Bootstrap Engine.
 *
 * Reads the historical Castillitos SAG document-type catalog CSV,
 * matches rows to Agentik KPI keys, and upserts KpiSource records
 * in the database as historical imports.
 *
 * CRITICAL:
 *  - Sources are imported as "suggested_from_csv" — NOT certified
 *  - Sources are NEVER marked ready_for_integration automatically
 *  - All sources require meeting validation before any lifecycle transition
 *  - Dedupe key: organizationId + kpiKey + normalizedSourceName
 *
 * Sprint: AGENTIK-SOURCE-MAP-BOOTSTRAP-01
 */

import * as fs   from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

import { parseCsvText, normalizeRows } from "./source-map-csv-normalizer";
import { matchKpis }                   from "./kpi-match-engine";
import type { NormalizedCsvRow }       from "./source-map-csv-normalizer";
import {
  upsertKpiSource,
}                                      from "@/lib/operational-map/certification/operational-kpi-source-service";
import type {
  BootstrapMetadata,
  KpiSourceUpsertInput,
  KpiSourceValidationStatus,
}                                      from "@/lib/operational-map/certification/operational-kpi-source-service";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BootstrapOptions {
  organizationId: string;
  actorId:        string;
  /** Skip sources with shouldSkip=true (EXCLUIR/ELIMINAR). Default: true */
  skipExcluded?:  boolean;
  /** Skip production module sources. Default: false */
  skipProduction?: boolean;
  /** Dry run — compute results without writing to DB. Default: false */
  dryRun?:        boolean;
  /** Custom CSV text (overrides file). Used for testing. */
  csvText?:       string;
}

export interface BootstrapSourceResult {
  kpiKey:        string;
  sourceName:    string;
  sagCode:       string;
  sagId:         string;
  matchType:     string;
  confidence:    number;
  status:        KpiSourceValidationStatus;
  skipped:       boolean;
  skipReason:    string | null;
  error?:        string;
  upserted:      boolean;
}

export interface BootstrapReport {
  batchId:        string;
  organizationId: string;
  runAt:          string;
  dryRun:         boolean;
  totalCsvRows:   number;
  totalSkipped:   number;
  totalUnresolved: number;
  totalUpserted:  number;
  totalErrors:    number;
  kpiCoverage:    Record<string, number>;  // kpiKey → source count
  results:        BootstrapSourceResult[];
}

// ─── CSV file path ────────────────────────────────────────────────────────────

const CSV_PATH = path.join(
  process.cwd(),
  "lib/operational-map/bootstrap/data/castillitos-fuentes-historico.csv",
);

// ─── Status derivation ────────────────────────────────────────────────────────

function deriveBootstrapStatus(row: NormalizedCsvRow, confidence: number): KpiSourceValidationStatus {
  if (row.isHistorical)               return "historical_import";
  if (confidence >= 0.90)             return "suggested_from_csv";
  if (confidence >= 0.65)             return "pending_meeting_validation";
  return "needs_source_confirmation";
}

// ─── Source role derivation ───────────────────────────────────────────────────

function deriveRole(row: NormalizedCsvRow, kpiKey: string): "primary" | "secondary" | "fallback" {
  if (row.isOfficial && row.impactaVentas) return "primary";
  if (row.isOfficial && row.impactaCobros) return "primary";
  if (row.isF2)                            return "secondary";
  if (row.isHistorical)                    return "fallback";
  return "secondary";
}

// ─── Source type derivation ───────────────────────────────────────────────────

function deriveType(row: NormalizedCsvRow): import("@/lib/operational-map/certification/operational-kpi-source-service").KpiSourceType {
  if (row.isProduction)  return "module";
  if (row.provider === "bank") return "bank";
  return "direct_sag";
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export async function runBootstrapEngine(opts: BootstrapOptions): Promise<BootstrapReport> {
  const {
    organizationId,
    actorId,
    skipExcluded  = true,
    skipProduction = false,
    dryRun        = false,
  } = opts;

  const batchId = randomUUID();
  const runAt   = new Date().toISOString();

  // Load CSV
  let csvText: string;
  if (opts.csvText) {
    csvText = opts.csvText;
  } else {
    if (!fs.existsSync(CSV_PATH)) {
      throw new Error(`Bootstrap CSV not found at: ${CSV_PATH}`);
    }
    csvText = fs.readFileSync(CSV_PATH, "utf-8");
  }

  // Parse + normalize
  const rawRows  = parseCsvText(csvText);
  const normRows = normalizeRows(rawRows);

  const results: BootstrapSourceResult[] = [];
  const kpiCoverage: Record<string, number> = {};

  let totalSkipped   = 0;
  let totalUnresolved = 0;
  let totalUpserted  = 0;
  let totalErrors    = 0;

  for (const row of normRows) {
    // Skip excluded
    if (skipExcluded && row.shouldSkip) {
      totalSkipped++;
      results.push({
        kpiKey:     "n/a",
        sourceName: row.sourceName,
        sagCode:    row.sagCode,
        sagId:      row.sagId,
        matchType:  "unresolved",
        confidence: 0,
        status:     "unresolved_mapping",
        skipped:    true,
        skipReason: row.skipReason,
        upserted:   false,
      });
      continue;
    }

    // Skip production if requested
    if (skipProduction && row.isProduction) {
      totalSkipped++;
      results.push({
        kpiKey:     "produccion",
        sourceName: row.sourceName,
        sagCode:    row.sagCode,
        sagId:      row.sagId,
        matchType:  "type_pattern",
        confidence: 0.5,
        status:     "pending_meeting_validation",
        skipped:    true,
        skipReason: "Producción excluida de este batch",
        upserted:   false,
      });
      continue;
    }

    // Match KPIs
    const match = matchKpis(row);

    if (match.matchType === "unresolved" || match.kpiKeys.length === 0) {
      totalUnresolved++;
      results.push({
        kpiKey:     "unresolved",
        sourceName: row.sourceName,
        sagCode:    row.sagCode,
        sagId:      row.sagId,
        matchType:  "unresolved",
        confidence: 0,
        status:     "unresolved_mapping",
        skipped:    false,
        skipReason: null,
        upserted:   false,
      });
      continue;
    }

    // Upsert one record per KPI key
    for (const kpiKey of match.kpiKeys) {
      const status = deriveBootstrapStatus(row, match.matchConfidence);
      const role   = deriveRole(row, kpiKey);
      const type   = deriveType(row);

      const metadata: BootstrapMetadata = {
        importedFromCsv:   true,
        importedAt:        runAt,
        bootstrapBatchId:  batchId,
        originalRowNumber: row.rowNumber,
        originalCsvText:   `${row.sagId};${row.sourceName};${row.sagCode}`,
        sagCode:           row.sagCode,
        sagId:             row.sagId,
        classification:    row.classification,
        tipo:              row.tipo,
        matchType:         match.matchType,
        matchConfidence:   match.matchConfidence,
        unresolvedFields:  match.unresolvedFields,
      };

      const input: KpiSourceUpsertInput = {
        organizationId,
        actorId,
        kpiKey,
        sourceName:        row.sourceName,
        sourceType:        type,
        sourceRole:        role,
        provider:          row.provider,
        validationStatus:  status,
        description:       buildDescription(row),
        bootstrapBatchId:  batchId,
        bootstrapMetadata: metadata as unknown as Record<string, unknown>,
      };

      if (!dryRun) {
        try {
          await upsertKpiSource(input);
          totalUpserted++;
        } catch (err) {
          totalErrors++;
          results.push({
            kpiKey,
            sourceName: row.sourceName,
            sagCode:    row.sagCode,
            sagId:      row.sagId,
            matchType:  match.matchType,
            confidence: match.matchConfidence,
            status,
            skipped:    false,
            skipReason: null,
            error:      err instanceof Error ? err.message : "Unknown error",
            upserted:   false,
          });
          continue;
        }
      } else {
        totalUpserted++;
      }

      kpiCoverage[kpiKey] = (kpiCoverage[kpiKey] ?? 0) + 1;

      results.push({
        kpiKey,
        sourceName: row.sourceName,
        sagCode:    row.sagCode,
        sagId:      row.sagId,
        matchType:  match.matchType,
        confidence: match.matchConfidence,
        status,
        skipped:    false,
        skipReason: null,
        upserted:   !dryRun,
      });
    }
  }

  return {
    batchId,
    organizationId,
    runAt,
    dryRun,
    totalCsvRows:    normRows.length,
    totalSkipped,
    totalUnresolved,
    totalUpserted,
    totalErrors,
    kpiCoverage,
    results,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDescription(row: NormalizedCsvRow): string {
  const parts: string[] = [];
  if (row.tipo)           parts.push(`Tipo: ${row.tipo}`);
  if (row.classification) parts.push(`Clasificación: ${row.classification}`);
  if (row.observacion)    parts.push(row.observacion.substring(0, 120));
  return parts.join(" — ") || `SAG fuente ${row.sagCode} (${row.sagId})`;
}
