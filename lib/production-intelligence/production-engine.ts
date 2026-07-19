/**
 * production-engine.ts
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-01
 * Production In Progress Intelligence Engine.
 *
 * Builds the production report from SAG Bodega 04 data.
 * Infers production stage using configurable stage definitions.
 *
 * This engine:
 * - Groups SAG production records by reference + OP
 * - Infers current stage for each reference
 * - Computes days in production from OP activation
 * - Generates observations from evidence
 * - Groups by SubLinea
 * - Never invents stages — only reports what evidence supports
 *
 * No Prisma. No React. No server-only. Pure domain logic.
 */

import type {
  SagProductionRecord,
  ProductionStageDefinition,
  ProductionRow,
  ProductionStatus,
  ProductionSubLineaSummary,
  ProductionInProgressReport,
} from "./production-types";
import { inferProductionStage, DEFAULT_PRODUCTION_STAGES } from "./production-stage-inference";

// ── Constants ────────────────────────────────────────────────────────────────

/** Days without movement to consider production "detenido". */
const STALLED_THRESHOLD_DAYS = 30;

// ── Build Production Report ──────────────────────────────────────────────────

/** Build the full production in progress report from SAG records. */
export function buildProductionReport(opts: {
  orgSlug: string;
  /** SAG production records (from Bodega 04 and related). */
  records: SagProductionRecord[];
  /** Source bodega (default "04" for Producto en Proceso). */
  sourceBodega?: string;
  /** Stage definitions (defaults to Castillitos). */
  stages?: ProductionStageDefinition[];
}): ProductionInProgressReport {
  const {
    orgSlug,
    records,
    sourceBodega = "04",
    stages = DEFAULT_PRODUCTION_STAGES,
  } = opts;

  const now = Date.now();

  // Group records by reference + OP
  const groupKey = (r: SagProductionRecord) =>
    r.opNumero ? `${r.reference}::${r.opNumero}` : r.reference;
  const groups = new Map<string, SagProductionRecord[]>();
  for (const rec of records) {
    const key = groupKey(rec);
    const list = groups.get(key) ?? [];
    list.push(rec);
    groups.set(key, list);
  }

  // Build rows
  const rows: ProductionRow[] = [];

  for (const [, groupRecords] of groups) {
    const first = groupRecords[0];

    // Find OP activation date (earliest OP document)
    const opRecords = groupRecords.filter(r => r.docType === "OP");
    const fechaActivacion = opRecords.length > 0
      ? opRecords.reduce((earliest, r) =>
          r.fechaDocumento < earliest ? r.fechaDocumento : earliest,
        opRecords[0].fechaDocumento)
      : groupRecords.reduce((earliest, r) =>
          r.fechaDocumento < earliest ? r.fechaDocumento : earliest,
        groupRecords[0].fechaDocumento);

    // Days in production
    const activationMs = new Date(fechaActivacion).getTime();
    const diasEnProduccion = isNaN(activationMs)
      ? 0
      : Math.floor((now - activationMs) / (1000 * 60 * 60 * 24));

    // Infer stage
    const etapaActual = inferProductionStage({ records: groupRecords, stages });

    // Determine status
    const status = deriveProductionStatus(etapaActual, groupRecords, diasEnProduccion);

    // Total quantity in process (from OP records, or sum of all if no OP)
    const cantidadEnProceso = opRecords.length > 0
      ? opRecords.reduce((s, r) => s + r.cantidad, 0)
      : groupRecords.reduce((s, r) => s + Math.abs(r.cantidad), 0);

    // Build observations
    const observaciones = buildObservations(etapaActual, status, diasEnProduccion, groupRecords);

    rows.push({
      reference: first.reference,
      description: first.description,
      subGrupo: first.subGrupo,
      subLinea: first.subLinea,
      fechaActivacionOP: fechaActivacion,
      status,
      etapaActual,
      diasEnProduccion,
      cantidadEnProceso,
      observaciones,
      opNumero: first.opNumero ?? "\u2014",
    });
  }

  // Sort by SubLinea → SubGrupo → diasEnProduccion descending
  rows.sort((a, b) => {
    const sl = a.subLinea.localeCompare(b.subLinea);
    if (sl !== 0) return sl;
    const sg = a.subGrupo.localeCompare(b.subGrupo);
    if (sg !== 0) return sg;
    return b.diasEnProduccion - a.diasEnProduccion;
  });

  // Group by SubLinea
  const subLineaMap = new Map<string, ProductionRow[]>();
  for (const row of rows) {
    const list = subLineaMap.get(row.subLinea) ?? [];
    list.push(row);
    subLineaMap.set(row.subLinea, list);
  }

  const subLineas: ProductionSubLineaSummary[] = [];
  for (const [subLinea, slRows] of subLineaMap) {
    subLineas.push(buildSubLineaSummary(subLinea, slRows));
  }

  const confidence = records.length > 0 ? 75 : 0;
  const confidenceReason = records.length > 0
    ? `${records.length} registro(s) SAG de produccion analizados. ` +
      `Inferencia basada en evidencia documental.`
    : "Sin datos SAG de produccion disponibles";

  return {
    orgSlug,
    computedAt: new Date().toISOString(),
    sourceBodega,
    totalReferences: rows.length,
    enProcesoCount: rows.filter(r => r.status === "en_proceso").length,
    completadoCount: rows.filter(r => r.status === "completado").length,
    detenidoCount: rows.filter(r => r.status === "detenido").length,
    indeterminadoCount: rows.filter(r => r.status === "indeterminado").length,
    avgDiasEnProduccion: rows.length > 0
      ? Math.round(rows.reduce((s, r) => s + r.diasEnProduccion, 0) / rows.length)
      : 0,
    subLineas,
    rows,
    stageDefinitions: stages,
    confidence,
    confidenceReason,
  };
}

// ── Status Derivation ────────────────────────────────────────────────────────

function deriveProductionStatus(
  inference: { stageId: string; confidence: { determined: boolean } },
  records: SagProductionRecord[],
  diasEnProduccion: number,
): ProductionStatus {
  // If ET (entrada producto terminado) was found, it's completed
  if (inference.stageId === "entrada_producto") return "completado";

  // If no stage could be determined
  if (!inference.confidence.determined) return "indeterminado";

  // Check for stalled production (no recent movement)
  const latestDate = records.reduce((latest, r) =>
    r.fechaDocumento > latest ? r.fechaDocumento : latest,
  records[0].fechaDocumento);
  const daysSinceLastMovement = Math.floor(
    (Date.now() - new Date(latestDate).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (daysSinceLastMovement > STALLED_THRESHOLD_DAYS) return "detenido";

  return "en_proceso";
}

// ── Observations Builder ─────────────────────────────────────────────────────

function buildObservations(
  inference: { stageId: string; stageLabel: string; confidence: { score: number; determined: boolean } },
  status: ProductionStatus,
  dias: number,
  records: SagProductionRecord[],
): string {
  const parts: string[] = [];

  if (!inference.confidence.determined) {
    parts.push("Etapa no determinada — evidencia insuficiente.");
  } else {
    parts.push(`Etapa actual: ${inference.stageLabel} (confianza ${inference.confidence.score}%).`);
  }

  if (status === "detenido") {
    parts.push(`Produccion detenida — sin movimientos en mas de ${STALLED_THRESHOLD_DAYS} dias.`);
  }

  if (dias > 60) {
    parts.push(`${dias} dias en produccion — excede tiempo promedio.`);
  }

  // Count unique document types present
  const docTypes = new Set(records.map(r => r.docType));
  parts.push(`Documentos SAG: ${Array.from(docTypes).join(", ")}.`);

  return parts.join(" ");
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildSubLineaSummary(subLinea: string, rows: ProductionRow[]): ProductionSubLineaSummary {
  return {
    subLinea,
    totalReferences: rows.length,
    enProcesoCount: rows.filter(r => r.status === "en_proceso").length,
    completadoCount: rows.filter(r => r.status === "completado").length,
    detenidoCount: rows.filter(r => r.status === "detenido").length,
    indeterminadoCount: rows.filter(r => r.status === "indeterminado").length,
    avgDiasEnProduccion: rows.length > 0
      ? Math.round(rows.reduce((s, r) => s + r.diasEnProduccion, 0) / rows.length)
      : 0,
    rows,
  };
}
