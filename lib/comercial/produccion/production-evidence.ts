/**
 * lib/comercial/produccion/production-evidence.ts
 *
 * FASE 10 + FASE 11 — Evidence bridge and SAG discovery gaps.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Sprint: PRODUCTION-PLANNING-POLICY-PACK-01
 */

import type { ProductionEvidenceItem } from "./production-planning-types";

// ── Commercial evidence bridge ─────────────────────────────────────────────

export interface ProductionCommercialEvidence {
  domain: "PRODUCTION";
  entityType: "subgroup" | "brand" | "op";
  entityId: string;
  tenantId: string;
  field: string;
  rawValue: unknown;
  confidence: number;
  source: string;
  traceId: string;
  evaluatedAt: string;
}

export function bridgeToCommercialEvidence(
  tenantId: string,
  evidence: ProductionEvidenceItem,
  entityType: ProductionCommercialEvidence["entityType"],
  entityId: string,
): ProductionCommercialEvidence {
  return {
    domain: "PRODUCTION",
    entityType,
    entityId,
    tenantId,
    field: evidence.policyType,
    rawValue: evidence.dataUsed,
    confidence: evidence.confidence,
    source: `ProductionPlanningPack:${evidence.policyId}`,
    traceId: evidence.traceId,
    evaluatedAt: evidence.evaluatedAt,
  };
}

// ── Evidence validation ────────────────────────────────────────────────────

export interface ProductionEvidenceValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateProductionEvidence(evidence: ProductionEvidenceItem): ProductionEvidenceValidationResult {
  const issues: string[] = [];

  if (!evidence.policyType) issues.push("Missing policyType");
  if (!evidence.policyId) issues.push("Missing policyId");
  if (!evidence.policyName) issues.push("Missing policyName");
  if (!evidence.activationReason) issues.push("Missing activationReason (why activated?)");
  if (!evidence.dataUsed || Object.keys(evidence.dataUsed).length === 0) issues.push("Missing dataUsed (what data?)");
  if (!evidence.recommendedAction) issues.push("Missing recommendedAction (what action?)");
  if (!evidence.actionRationale) issues.push("Missing actionRationale (why this action?)");
  if (evidence.confidence < 0 || evidence.confidence > 1) issues.push(`Confidence out of range: ${evidence.confidence}`);
  if (!evidence.traceId) issues.push("Missing traceId");
  if (!evidence.evaluatedAt) issues.push("Missing evaluatedAt");

  return { valid: issues.length === 0, issues };
}

export function validateAllProductionEvidence(items: ProductionEvidenceItem[]): {
  totalChecked: number;
  validCount: number;
  invalidCount: number;
  allIssues: string[];
} {
  let validCount = 0;
  let invalidCount = 0;
  const allIssues: string[] = [];

  for (const item of items) {
    const result = validateProductionEvidence(item);
    if (result.valid) {
      validCount++;
    } else {
      invalidCount++;
      allIssues.push(...result.issues.map(i => `${item.policyId}: ${i}`));
    }
  }

  return { totalChecked: items.length, validCount, invalidCount, allIssues };
}

// ── FASE 11: SAG Discovery gaps ────────────────────────────────────────────

export interface SagProductionDiscoveryGap {
  field: string;
  description: string;
  currentStatus: "AVAILABLE" | "PARTIAL" | "NOT_AVAILABLE";
  sagSource: string | null;
  priority: "HIGH" | "MEDIUM" | "LOW";
  impact: string;
}

export function getProductionSagDiscoveryGaps(): SagProductionDiscoveryGap[] {
  return [
    {
      field: "opDocumentNumber",
      description: "Numero de documento de la orden de produccion",
      currentStatus: "AVAILABLE",
      sagSource: "MOVIMIENTOS tipo OP via ProductionEvent",
      priority: "HIGH",
      impact: "Requerido para verificar OP activas. Disponible via sync de produccion.",
    },
    {
      field: "opStatus",
      description: "Estado de la OP (abierta/cerrada)",
      currentStatus: "AVAILABLE",
      sagSource: "MOVIMIENTOS.ka_estado_doc + isClosed derivation",
      priority: "HIGH",
      impact: "Critico para la regla WAIT_EXISTING_OP. Disponible en ProductionOrderSnapshot.",
    },
    {
      field: "opQuantity",
      description: "Cantidad total de la OP por linea",
      currentStatus: "AVAILABLE",
      sagSource: "MOVIMIENTOS_DET.ka_cantidad via ProductionOrderLineSnapshot",
      priority: "HIGH",
      impact: "Necesario para estimar produccion en proceso. Disponible via sync.",
    },
    {
      field: "opDocumentDate",
      description: "Fecha de la OP",
      currentStatus: "AVAILABLE",
      sagSource: "MOVIMIENTOS.ka_fecha_doc",
      priority: "MEDIUM",
      impact: "Util para calcular antiguedad de OP. Disponible en sync.",
    },
    {
      field: "opSubgroup",
      description: "Subgrupo asociado a la OP",
      currentStatus: "PARTIAL",
      sagSource: "Derivado de MOVIMIENTOS_DET.ka_nl_articulo → v_articulos.ss_subgrupo",
      priority: "HIGH",
      impact: "Critico para cruzar OP con inventario por subgrupo. Parcial — requiere join con maestro de articulos.",
    },
    {
      field: "opBusinessLine",
      description: "Linea de negocio de la OP (Castillitos/Latin Kids)",
      currentStatus: "PARTIAL",
      sagSource: "Derivado de subgrupo → sublinea mapping",
      priority: "MEDIUM",
      impact: "Necesario para aplicar umbral correcto (100 vs 200). Parcial — requiere mapping de sublinea.",
    },
    {
      field: "opPriority",
      description: "Prioridad asignada a la OP en SAG",
      currentStatus: "NOT_AVAILABLE",
      sagSource: null,
      priority: "LOW",
      impact: "SAG no tiene concepto de prioridad de OP. Se calcula internamente via scoring.",
    },
    {
      field: "opStageProgress",
      description: "Etapa actual de la OP (corte, confeccion, acabado, etc.)",
      currentStatus: "PARTIAL",
      sagSource: "ProductionTimeline via CN/ET events",
      priority: "MEDIUM",
      impact: "Parcial — disponible via timeline events pero no como campo directo en OP.",
    },
  ];
}
