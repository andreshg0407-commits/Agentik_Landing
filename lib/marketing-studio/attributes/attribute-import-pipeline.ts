/**
 * lib/marketing-studio/attributes/attribute-import-pipeline.ts
 *
 * AGENTIK-ATTRIBUTE-IMPORT-01 — Batch Import Pipeline
 *
 * Orchestrates the import of multiple external products in a single run.
 * Calls normalizeAndAssignAttributes() per product and aggregates results.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   // In a SAG sync job or internal API route:
 *   const result = await runAttributeImportPipeline({
 *     organizationId: org.id,
 *     tenantSlug:     "castillitos",
 *     products: [
 *       {
 *         agentikProductId: "clxyz...",
 *         externalData: {
 *           externalId: "SAG-001",
 *           source:     "sag",
 *           fields: [
 *             { externalField: "color",    externalValue: "AZUL" },
 *             { externalField: "talla",    externalValue: "4"    },
 *             { externalField: "categoria",externalValue: "Niño" },
 *           ],
 *         },
 *       },
 *     ],
 *   });
 *
 * ── Error handling ────────────────────────────────────────────────────────────
 *   One product failing does not abort the pipeline.
 *   Fatal errors per product are collected in BatchImportResult.errors.
 *
 * SERVER ONLY — imports normalizeAndAssignAttributes which uses Prisma.
 */

import "server-only";
import { normalizeAndAssignAttributes } from "./attribute-normalization-service";
import type {
  BatchImportResult,
  ExternalProductData,
} from "./attribute-import-types";

// ── Input contract ────────────────────────────────────────────────────────────

export interface ProductImportRecord {
  /** Agentik ProductEntity.id — must exist before import */
  agentikProductId: string;
  /** Raw external data for this product */
  externalData:     ExternalProductData;
}

export interface AttributeImportPipelineInput {
  organizationId: string;
  tenantSlug:     string;
  products:       ProductImportRecord[];
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

/**
 * Run the attribute normalization pipeline for a batch of products.
 *
 * Products are processed sequentially to avoid Prisma connection pool
 * exhaustion in large batches.  For very large batches (>100 products),
 * split into chunks and call this function per chunk.
 */
export async function runAttributeImportPipeline(
  input: AttributeImportPipelineInput,
): Promise<BatchImportResult> {
  const { organizationId, tenantSlug, products } = input;

  const batchResult: BatchImportResult = {
    total:     products.length,
    succeeded: 0,
    failed:    0,
    results:   [],
    errors:    [],
  };

  for (const record of products) {
    try {
      const result = await normalizeAndAssignAttributes(
        record.agentikProductId,
        organizationId,
        tenantSlug,
        record.externalData,
      );
      batchResult.results.push(result);

      if (result.errors.length > 0) {
        // Partial success — counted as succeeded (fields with errors are noted)
        batchResult.succeeded++;
      } else {
        batchResult.succeeded++;
      }
    } catch (err) {
      batchResult.failed++;
      const msg = err instanceof Error ? err.message : String(err);
      batchResult.errors.push(`[${record.agentikProductId}] ${msg}`);
    }
  }

  return batchResult;
}

// ── Review queue helpers ──────────────────────────────────────────────────────

/**
 * Extract all pending review items from a batch result.
 * Useful for surfacing the review queue to a human operator.
 */
export function collectPendingReview(result: BatchImportResult) {
  return result.results.flatMap(r =>
    r.pendingReview.map(item => ({
      ...item,
      productId: r.productId,
    })),
  );
}

/**
 * Summarize a batch result for logging / UI display.
 */
export function summarizeBatchResult(result: BatchImportResult): string {
  const { total, succeeded, failed, results } = result;
  const defs    = results.reduce((n, r) => n + r.definitionsCreated.length,  0);
  const vals    = results.reduce((n, r) => n + r.valuesCreated.length,       0);
  const assigns = results.reduce((n, r) => n + r.attributesAssigned.length,  0);
  const review  = results.reduce((n, r) => n + r.pendingReview.length,       0);
  return [
    `Batch: ${total} productos (${succeeded} ok, ${failed} fallidos)`,
    `Definiciones creadas: ${defs}`,
    `Valores nuevos: ${vals}`,
    `Atributos asignados: ${assigns}`,
    `Pendientes de revisión: ${review}`,
  ].join(" · ");
}
