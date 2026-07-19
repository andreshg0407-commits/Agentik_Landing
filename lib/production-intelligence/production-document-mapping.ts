/**
 * production-document-mapping.ts
 *
 * PRODUCTION-FLOW-INTELLIGENCE-01 — Phase 2: Production Document Mapping.
 *
 * Formalizes the mapping between SAG document types and their business meaning
 * in the production lifecycle.
 *
 * Each document type maps to: businessMeaning, stageEvidence, confidenceWeight,
 * movementDirection, inventoryImpact, productionImpact.
 *
 * No React. No Prisma. No server-only. Pure domain logic.
 */

import type { SagProductionDocType } from "./production-types";
import type { ProductionDocumentTypeMapping, ProductionDocumentEvidence } from "./production-flow-types";

// ── Document Type Mapping ──────────────────────────────────────────────────

/** Formal mapping of all known SAG production document types. */
export const PRODUCTION_DOCUMENT_MAPPINGS: ProductionDocumentTypeMapping[] = [
  {
    documentType: "OP",
    fuente: 33,
    label: "Orden de Produccion",
    businessMeaning: "Orden de produccion activada. Inicia el ciclo productivo para una o mas referencias.",
    stageEvidence: "orden_produccion",
    confidenceWeight: 90,
    movementDirection: "neutral",
    inventoryImpact: "creates_order",
    productionImpact: "Crea compromiso de produccion. Inicia tracking de dias en proceso.",
  },
  {
    documentType: "CN",
    fuente: 80,
    label: "Consumo de Insumos",
    businessMeaning: "Consumo de materia prima e insumos para produccion. Confirma que la OP inicio ejecucion.",
    stageEvidence: "consumo_insumos",
    confidenceWeight: 85,
    movementDirection: "in",
    inventoryImpact: "increases_wip",
    productionImpact: "Confirma inicio de produccion real. Material prima consumida.",
  },
  {
    documentType: "PC",
    fuente: 99,
    label: "Salida a Confeccionistas",
    businessMeaning: "Material enviado a confeccionista externo para procesamiento.",
    stageEvidence: "confeccion_externa",
    confidenceWeight: 75,
    movementDirection: "external",
    inventoryImpact: "external_send",
    productionImpact: "Material fuera de planta. Tiempo depende de proveedor externo.",
  },
  {
    documentType: "EC",
    fuente: 100,
    label: "Entrada de Confeccionistas",
    businessMeaning: "Material recibido de confeccionista externo. Regresa a planta para siguiente etapa.",
    stageEvidence: "confeccion_externa",
    confidenceWeight: 80,
    movementDirection: "external",
    inventoryImpact: "external_receive",
    productionImpact: "Material retorna a planta. Listo para servicios o terminacion.",
  },
  {
    documentType: "T1",
    fuente: 129,
    label: "Servicio T1",
    businessMeaning: "Servicio de terceros tipo T1 (estampacion, bordado u otro acabado).",
    stageEvidence: "servicios",
    confidenceWeight: 70,
    movementDirection: "internal",
    inventoryImpact: "transforms_wip",
    productionImpact: "Producto en acabados. Proximo paso: terminacion o mas servicios.",
  },
  {
    documentType: "T2",
    fuente: 118,
    label: "Servicio T2",
    businessMeaning: "Servicio de terceros tipo T2 (segundo tipo de acabado o proceso).",
    stageEvidence: "servicios",
    confidenceWeight: 70,
    movementDirection: "internal",
    inventoryImpact: "transforms_wip",
    productionImpact: "Producto en acabados adicionales.",
  },
  {
    documentType: "Y1",
    fuente: 119,
    label: "Servicio Y1",
    businessMeaning: "Servicio de terceros tipo Y1.",
    stageEvidence: "servicios",
    confidenceWeight: 65,
    movementDirection: "internal",
    inventoryImpact: "transforms_wip",
    productionImpact: "Servicio adicional aplicado al producto.",
  },
  {
    documentType: "ET",
    fuente: 116,
    label: "Entrada Producto Terminado",
    businessMeaning: "Producto terminado ingresado a Bodega 01. Produccion completada.",
    stageEvidence: "entrada_producto",
    confidenceWeight: 95,
    movementDirection: "out",
    inventoryImpact: "decreases_wip",
    productionImpact: "Produccion completada. Producto disponible para venta.",
  },
];

/** Map of document type → mapping for quick lookup. */
const MAPPING_INDEX = new Map<SagProductionDocType, ProductionDocumentTypeMapping>();
for (const m of PRODUCTION_DOCUMENT_MAPPINGS) {
  MAPPING_INDEX.set(m.documentType, m);
}

/** Get the document type mapping for a SAG document type. */
export function getDocumentTypeMapping(docType: SagProductionDocType): ProductionDocumentTypeMapping | undefined {
  return MAPPING_INDEX.get(docType);
}

/** Build document evidence from a SAG production record. */
export function buildDocumentEvidence(opts: {
  docType: SagProductionDocType;
  documentDate: string;
  quantity: number;
  isClosed: boolean;
  opNumber: string | null;
}): ProductionDocumentEvidence {
  const mapping = MAPPING_INDEX.get(opts.docType);

  return {
    documentType: opts.docType,
    businessMeaning: mapping?.businessMeaning ?? `Documento tipo ${opts.docType} (sin mapping formal)`,
    stageEvidence: mapping?.stageEvidence ?? "desconocida",
    confidenceWeight: mapping?.confidenceWeight ?? 30,
    movementDirection: mapping?.movementDirection ?? "neutral",
    inventoryImpact: mapping?.inventoryImpact ?? "none",
    productionImpact: mapping?.productionImpact ?? "Impacto no determinado",
    documentDate: opts.documentDate,
    quantity: opts.quantity,
    isClosed: opts.isClosed,
    opNumber: opts.opNumber,
  };
}
