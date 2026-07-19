/**
 * production-stage-inference.ts
 *
 * CASTILLITOS-EXECUTIVE-REPORTS-01
 * Configurable production stage inference engine.
 *
 * Infers the current production stage using SAG document evidence.
 * Stages are NOT hardcoded — they're defined via ProductionStageDefinition[].
 *
 * Real Castillitos production flow (confirmed):
 *   Crear articulo → Activacion → OP → CN → Traslados internos →
 *   Servicios (T1, T2, T3) → ET → Ingreso producto terminado → Bodega 01
 *
 * Inference strategy:
 *   - Find the latest stage that has SAG document evidence
 *   - If no evidence exists, stage = "indeterminada" with reduced confidence
 *   - Never invent stages — only report what evidence supports
 *
 * No Prisma. No React. No server-only. Pure domain logic.
 */

import type {
  SagProductionRecord,
  SagProductionDocType,
  ProductionStageDefinition,
  ProductionStageEvidence,
  ProductionStageConfidence,
  ProductionStageInference,
} from "./production-types";

// ── Default Stage Definitions ────────────────────────────────────────────────

/**
 * Default Castillitos production stages.
 *
 * These are configurable. A future tenant can define their own stages.
 * The order field determines the production flow sequence.
 */
export const DEFAULT_PRODUCTION_STAGES: ProductionStageDefinition[] = [
  {
    stageId: "orden_produccion",
    label: "Orden de Produccion",
    order: 1,
    indicatorDocTypes: ["OP"],
    description: "OP creada y activada en SAG",
  },
  {
    stageId: "consumo_insumos",
    label: "Consumo de Insumos",
    order: 2,
    indicatorDocTypes: ["CN"],
    description: "Insumos y telas consumidos para esta OP",
  },
  {
    stageId: "confeccion_externa",
    label: "Confeccion Externa",
    order: 3,
    indicatorDocTypes: ["PC", "EC"],
    description: "Salida/entrada a confeccionistas externos",
  },
  {
    stageId: "servicios",
    label: "Servicios (T1/T2/T3)",
    order: 4,
    indicatorDocTypes: ["T1", "T2", "Y1"],
    description: "Servicios de terceros (estampacion, bordado, etc.)",
  },
  {
    stageId: "entrada_producto",
    label: "Entrada Producto Terminado",
    order: 5,
    indicatorDocTypes: ["ET"],
    description: "Producto terminado ingresado a bodega",
  },
];

// ── Inference Engine ─────────────────────────────────────────────────────────

/**
 * Infer the current production stage for a set of SAG records
 * belonging to a single reference/OP.
 */
export function inferProductionStage(opts: {
  /** SAG records for this reference/OP. */
  records: SagProductionRecord[];
  /** Stage definitions to use (defaults to Castillitos stages). */
  stages?: ProductionStageDefinition[];
}): ProductionStageInference {
  const { records, stages = DEFAULT_PRODUCTION_STAGES } = opts;

  if (records.length === 0) {
    return {
      stageId: "indeterminada",
      stageLabel: "Etapa indeterminada",
      stageOrder: 0,
      evidence: [],
      confidence: {
        score: 0,
        reason: "Sin registros SAG para esta referencia",
        evidenceCount: 0,
        determined: false,
      },
    };
  }

  // Build evidence from records
  const allEvidence: ProductionStageEvidence[] = records.map(r => ({
    docType: r.docType,
    fuente: r.fuente,
    date: r.fechaDocumento,
    quantity: r.cantidad,
    closed: r.cerrado,
    description: `${r.docType} (fuente ${r.fuente}) — ${r.cantidad} unidades — ${r.fechaDocumento}`,
  }));

  // Find the latest (highest order) stage with evidence
  const docTypesPresent = new Set(records.map(r => r.docType));
  let latestStage: ProductionStageDefinition | null = null;
  const matchedEvidence: ProductionStageEvidence[] = [];

  // Sort stages by order descending — find highest stage with evidence
  const sortedStages = [...stages].sort((a, b) => b.order - a.order);
  for (const stage of sortedStages) {
    const hasEvidence = stage.indicatorDocTypes.some(dt => docTypesPresent.has(dt));
    if (hasEvidence) {
      latestStage = stage;
      // Collect evidence for this stage
      for (const ev of allEvidence) {
        if (stage.indicatorDocTypes.includes(ev.docType)) {
          matchedEvidence.push(ev);
        }
      }
      break;
    }
  }

  if (!latestStage) {
    return {
      stageId: "indeterminada",
      stageLabel: "Etapa indeterminada",
      stageOrder: 0,
      evidence: allEvidence,
      confidence: {
        score: 20,
        reason: `${allEvidence.length} registro(s) SAG encontrado(s) pero ninguno coincide con etapas configuradas`,
        evidenceCount: allEvidence.length,
        determined: false,
      },
    };
  }

  // Calculate confidence
  const confidence = buildStageConfidence(latestStage, matchedEvidence, allEvidence, stages);

  return {
    stageId: latestStage.stageId,
    stageLabel: latestStage.label,
    stageOrder: latestStage.order,
    evidence: allEvidence,
    confidence,
  };
}

// ── Confidence Builder ───────────────────────────────────────────────────────

function buildStageConfidence(
  stage: ProductionStageDefinition,
  stageEvidence: ProductionStageEvidence[],
  allEvidence: ProductionStageEvidence[],
  stages: ProductionStageDefinition[],
): ProductionStageConfidence {
  let score = 50; // Base confidence when a stage is matched

  // More evidence items → higher confidence
  if (stageEvidence.length >= 3) score += 20;
  else if (stageEvidence.length >= 2) score += 10;

  // If we have evidence from multiple stages (flow consistency), increase confidence
  const docTypesPresent = new Set(allEvidence.map(e => e.docType));
  const stagesWithEvidence = stages.filter(s =>
    s.indicatorDocTypes.some(dt => docTypesPresent.has(dt)),
  ).length;
  if (stagesWithEvidence >= 3) score += 15;
  else if (stagesWithEvidence >= 2) score += 10;

  // If the latest stage is the last one (ET = completed), high confidence
  if (stage.stageId === "entrada_producto") score += 10;

  // Cap at 95 — we can never be 100% certain from document inference alone
  score = Math.min(95, Math.max(0, score));

  const reason = `Etapa "${stage.label}" inferida de ${stageEvidence.length} documento(s). ` +
    `${stagesWithEvidence}/${stages.length} etapa(s) con evidencia.`;

  return {
    score,
    reason,
    evidenceCount: allEvidence.length,
    determined: true,
  };
}
