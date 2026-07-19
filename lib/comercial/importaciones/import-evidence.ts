/**
 * lib/comercial/importaciones/import-evidence.ts
 *
 * FASE 10 + FASE 11 — Evidence bridge and SAG discovery gaps.
 * Pure functions — no DB, no Prisma, no side effects.
 *
 * Sprint: IMPORT-POLICY-PACK-01
 */

import type { ImportEvidenceItem, ImportHealthSummary } from "./import-policy-types";

// ── Commercial evidence bridge ─────────────────────────────────────────────

export interface ImportCommercialEvidence {
  domain: "IMPORT";
  entityType: "reference" | "container" | "import_batch";
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
  evidence: ImportEvidenceItem,
  entityType: ImportCommercialEvidence["entityType"],
  entityId: string,
): ImportCommercialEvidence {
  return {
    domain: "IMPORT",
    entityType,
    entityId,
    tenantId,
    field: evidence.policyType,
    rawValue: evidence.dataUsed,
    confidence: evidence.confidence,
    source: `ImportPolicyPack:${evidence.policyId}`,
    traceId: evidence.traceId,
    evaluatedAt: evidence.evaluatedAt,
  };
}

// ── Evidence validation ────────────────────────────────────────────────────

export interface ImportEvidenceValidationResult {
  valid: boolean;
  issues: string[];
}

export function validateImportEvidence(evidence: ImportEvidenceItem): ImportEvidenceValidationResult {
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

export function validateAllImportEvidence(items: ImportEvidenceItem[]): {
  totalChecked: number;
  validCount: number;
  invalidCount: number;
  allIssues: string[];
} {
  let validCount = 0;
  let invalidCount = 0;
  const allIssues: string[] = [];

  for (const item of items) {
    const result = validateImportEvidence(item);
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

export interface SagDiscoveryGap {
  field: string;
  description: string;
  currentStatus: "AVAILABLE" | "PARTIAL" | "NOT_AVAILABLE";
  sagSource: string | null;
  priority: "HIGH" | "MEDIUM" | "LOW";
  impact: string;
}

export function getImportSagDiscoveryGaps(): SagDiscoveryGap[] {
  return [
    {
      field: "lastEntryDate",
      description: "Fecha del ultimo ingreso o recompra desde China",
      currentStatus: "AVAILABLE",
      sagSource: "MOVIMIENTOS C1/C2 via CommercialProductDataSource.lastEntryDate",
      priority: "HIGH",
      impact: "Requerido para evaluacion de baja rotacion y aging. Disponible via SAG receipts.",
    },
    {
      field: "lastImportDate",
      description: "Fecha de la ultima importacion (contenedor completo)",
      currentStatus: "PARTIAL",
      sagSource: "MOVIMIENTOS — requires container grouping logic",
      priority: "MEDIUM",
      impact: "Util para agrupar por contenedor. Parcialmente disponible via receipt dates.",
    },
    {
      field: "supplierName",
      description: "Proveedor o fabricante en China",
      currentStatus: "PARTIAL",
      sagSource: "TERCEROS.sc_beneficiario via ka_nl_tercero in MOVIMIENTOS",
      priority: "MEDIUM",
      impact: "Disponible en algunos recibos SAG. No todos tienen tercero asociado.",
    },
    {
      field: "countryOfOrigin",
      description: "Pais de origen (siempre China para importados)",
      currentStatus: "NOT_AVAILABLE",
      sagSource: null,
      priority: "LOW",
      impact: "No existe en SAG. Puede asumirse 'China' para LINEA 5. Bajo impacto en decisiones.",
    },
    {
      field: "containerNumber",
      description: "Numero de contenedor de embarque",
      currentStatus: "NOT_AVAILABLE",
      sagSource: null,
      priority: "MEDIUM",
      impact: "No existe en SAG v_articulos ni MOVIMIENTOS. Requeriria campo manual o integracion con agente de carga.",
    },
    {
      field: "unitCost",
      description: "Costo unitario FOB/CIF de importacion",
      currentStatus: "NOT_AVAILABLE",
      sagSource: null,
      priority: "HIGH",
      impact: "No disponible en SAG. Critico para calcular margen y rentabilidad por referencia. Requiere integracion con modulo de costos.",
    },
    {
      field: "leadTimeDays",
      description: "Tiempo de entrega desde orden hasta llegada a bodega",
      currentStatus: "NOT_AVAILABLE",
      sagSource: null,
      priority: "MEDIUM",
      impact: "No existe en SAG. Necesario para planificacion de siguiente contenedor. Puede estimarse de historico de recepciones.",
    },
    {
      field: "transitStatus",
      description: "Estado de mercancia en transito",
      currentStatus: "NOT_AVAILABLE",
      sagSource: null,
      priority: "LOW",
      impact: "No existe en SAG. Requeriria integracion con tracking de embarques. Fase 2.",
    },
  ];
}
