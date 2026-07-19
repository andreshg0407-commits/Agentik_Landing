/**
 * lib/comercial/maletas/assortment-catalog/mallet-assortment-evidence.ts
 *
 * Evidence builders for mallet assortment evaluations.
 * Bridges to CommercialDomainEvidence for transversal consumption.
 *
 * Sprint: CASTILLITOS-MALLET-POLICIES-01
 */

import type { CommercialDomainEvidence } from "../../data-layer/shared/domain-evidence";

import type {
  MalletAssortmentEvaluation,
  MalletAssortmentEvaluationEvidence,
  MalletAssortmentCatalog,
} from "./mallet-assortment-types";

// ── Build evidence from evaluation ──────────────────────────────────────────

export function buildAssortmentEvaluationEvidence(
  evaluation: MalletAssortmentEvaluation,
): MalletAssortmentEvaluationEvidence {
  return evaluation.evidence;
}

// ── Bridge to CommercialDomainEvidence ───────────────────────────────────────

export function assortmentEvidenceToCommercialEvidence(
  evaluation: MalletAssortmentEvaluation,
  entityId: string,
): CommercialDomainEvidence {
  return {
    domain: "MALLET_ASSORTMENT",
    entityType: "MalletAssortmentEvaluation",
    entityId,
    tenantId: evaluation.evidence.tenantId,
    field: null,
    rawValue: {
      catalogId: evaluation.catalogId,
      catalogVersion: evaluation.catalogVersion,
      status: evaluation.status,
      overallCompletion: evaluation.overallCompletion,
      completeEntries: evaluation.completeEntries,
      missingEntries: evaluation.missingEntries,
      excessEntries: evaluation.excessEntries,
    },
    canonicalValue: {
      status: evaluation.status,
      completion: evaluation.overallCompletion,
      confidence: evaluation.confidence,
    },
    confidence: evaluation.confidence,
    observedAt: evaluation.evaluatedAt,
    traceId: evaluation.evidence.traceId,
    note: `Mallet ${evaluation.malletId} evaluated against catalog ${evaluation.catalogId} v${evaluation.catalogVersion}: ${evaluation.status} (${evaluation.overallCompletion}% complete)`,
    resolution: evaluation.status === "INSUFFICIENT_DATA" ? "PENDING" : "CONFIRMED",
    qualityImpact: evaluation.confidence >= 0.7 ? "IMPROVES" : "NEUTRAL",
  };
}

// ── Build evidence narrative ────────────────────────────────────────────────

export function buildAssortmentNarrative(
  evaluation: MalletAssortmentEvaluation,
): string {
  const parts: string[] = [];

  parts.push(
    `Evaluación de maleta ${evaluation.malletId} contra catálogo ${evaluation.catalogId} v${evaluation.catalogVersion}`,
  );
  parts.push(`Estado: ${evaluation.status}`);
  parts.push(`Completitud: ${evaluation.overallCompletion}%`);

  if (evaluation.completeEntries > 0) {
    parts.push(`Subgrupos completos: ${evaluation.completeEntries}`);
  }
  if (evaluation.missingEntries > 0) {
    parts.push(`Subgrupos faltantes: ${evaluation.missingEntries}`);
  }
  if (evaluation.excessEntries > 0) {
    parts.push(`Subgrupos con exceso: ${evaluation.excessEntries}`);
  }
  if (evaluation.unresolvedEntries > 0) {
    parts.push(`Subgrupos sin resolver: ${evaluation.unresolvedEntries}`);
  }
  if (evaluation.suggestions.length > 0) {
    parts.push(`Sugerencias generadas: ${evaluation.suggestions.length}`);
  }

  parts.push(`Confianza: ${Math.round(evaluation.confidence * 100)}%`);

  return parts.join(". ") + ".";
}

// ── Catalog evidence summary ────────────────────────────────────────────────

export function buildCatalogEvidenceSummary(
  catalog: MalletAssortmentCatalog,
): string {
  const totalEntries = catalog.groups.reduce(
    (sum, g) => sum + g.entries.length,
    0,
  );
  return (
    `Catálogo ${catalog.name} (${catalog.catalogId} v${catalog.version}): ` +
    `${catalog.groups.length} grupos, ${totalEntries} entradas. ` +
    `Mundo: ${catalog.commercialWorld}. ` +
    `Marca: ${catalog.brand ?? "todas"}. ` +
    `Estado: ${catalog.status}. ` +
    `Fuente: ${catalog.source}.`
  );
}
