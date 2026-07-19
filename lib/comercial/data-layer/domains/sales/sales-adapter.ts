/**
 * domains/sales/sales-adapter.ts
 *
 * SAG Sales Adapter implementing CommercialAdapter.
 * Bridges between SAG raw document data and canonical SalesDocument.
 *
 * This adapter DOES NOT call SAG directly. It receives pre-fetched raw rows
 * and normalizes them. The actual SAG HTTP/SOAP calls remain in the connector layer.
 */

import type { CommercialAdapter, DiscoveryResult, ValidationResult, NormalizationResult, AdapterHealthReport, AdapterCapabilities } from "../../adapters";
import type { SynchronizationContext, SynchronizationResult, QualityAssessment } from "../../contracts";
import type { SalesDocument } from "./sales-entities";
import type { SalesDocumentRawInput, SalesNormalizationContext } from "./sales-normalizer";
import { normalizeSalesDocument } from "./sales-normalizer";
import { evaluateSalesQuality } from "./sales-quality-rules";

// ── Adapter Identity ────────────────────────────────────────────────────────

export const SAG_SALES_ADAPTER_ID = "sag-sales-adapter";
export const SAG_SALES_ADAPTER_VERSION = "1.0.0";

// ── SAG Sales Adapter ───────────────────────────────────────────────────────

export interface SagSalesAdapterDeps {
  /** Fetches raw document rows from SAG (injected, not owned) */
  fetchDocuments: (tenantId: string) => Promise<SalesDocumentRawInput[]>;
  /** Optional: fetch document count for discovery */
  countDocuments?: (tenantId: string) => Promise<number>;
  /** Optional: check SAG connectivity */
  checkHealth?: () => Promise<{ reachable: boolean; latencyMs: number }>;
}

export function createSagSalesAdapter(
  deps: SagSalesAdapterDeps
): CommercialAdapter<SalesDocumentRawInput, SalesDocument> {
  let lastHealthCheck: AdapterHealthReport | null = null;

  return {
    id: SAG_SALES_ADAPTER_ID,
    version: SAG_SALES_ADAPTER_VERSION,
    domain: "SALES",

    async discover(ctx: SynchronizationContext): Promise<DiscoveryResult> {
      const count = deps.countDocuments
        ? await deps.countDocuments(ctx.tenantId)
        : 0;

      return {
        totalRecords: count,
        newRecords: 0,
        modifiedRecords: 0,
        deletedRecords: 0,
        discoveredAt: new Date(),
      };
    },

    async validate(ctx: SynchronizationContext): Promise<ValidationResult> {
      const issues: Array<{ code: string; message: string; severity: "ERROR" | "WARNING" }> = [];

      if (!ctx.tenantId) {
        issues.push({ code: "MISSING_TENANT", message: "tenantId is required", severity: "ERROR" });
      }

      if (deps.checkHealth) {
        const health = await deps.checkHealth();
        if (!health.reachable) {
          issues.push({ code: "SAG_UNREACHABLE", message: "SAG system is not reachable", severity: "ERROR" });
        }
      }

      return {
        valid: issues.filter(i => i.severity === "ERROR").length === 0,
        issues,
        validatedAt: new Date(),
      };
    },

    async normalize(input: SalesDocumentRawInput, ctx: SynchronizationContext): Promise<NormalizationResult<SalesDocument>> {
      const normCtx: SalesNormalizationContext = {
        tenantId: ctx.tenantId,
        sourceSystem: "SAG_PYA",
        instanceId: ctx.tenantId,
        adapterId: SAG_SALES_ADAPTER_ID,
        adapterVersion: SAG_SALES_ADAPTER_VERSION,
        correlationId: ctx.correlationId,
        extractedAt: new Date(),
      };

      const result = normalizeSalesDocument(input, normCtx);

      let quality: QualityAssessment;
      if (result.document) {
        const qResult = evaluateSalesQuality(result.document);
        quality = {
          level: qResult.status === "CONFIRMED" ? "HIGH"
            : qResult.status === "PARTIAL" ? "ACCEPTABLE"
            : qResult.status === "UNAVAILABLE" ? "REJECTED"
            : "ACCEPTABLE",
          dimensions: {
            completeness: qResult.completeness,
            consistency: qResult.consistency,
            freshness: qResult.freshnessContribution,
            validity: qResult.validity,
            confidence: qResult.score,
          },
          issues: qResult.reasons.map(r => ({
            dimension: "completeness" as const,
            severity: "WARNING" as const,
            description: r,
          })),
          assessedAt: new Date(),
          assessorId: "sales-quality-v1",
        };
      } else {
        quality = {
          level: "REJECTED",
          dimensions: { completeness: 0, consistency: 0, freshness: 0, validity: 0, confidence: 0 },
          issues: [{ dimension: "completeness", severity: "CRITICAL", description: result.skipReason ?? "Unknown" }],
          assessedAt: new Date(),
          assessorId: "sales-quality-v1",
        };
      }

      return {
        normalized: result.document,
        quality,
        skipped: result.skipped,
        skipReason: result.skipReason,
      };
    },

    async synchronize(ctx: SynchronizationContext): Promise<SynchronizationResult> {
      const startedAt = Date.now();
      const errors: Array<{ stage: string; message: string; recordId?: string; recoverable: boolean }> = [];

      let discovered = 0;
      let extracted = 0;
      let normalized = 0;
      let validated = 0;
      let persisted = 0;
      let rejected = 0;
      let unchanged = 0;

      try {
        const rawRows = await deps.fetchDocuments(ctx.tenantId);
        discovered = rawRows.length;
        extracted = rawRows.length;

        const normCtx: SalesNormalizationContext = {
          tenantId: ctx.tenantId,
          sourceSystem: "SAG_PYA",
          instanceId: ctx.tenantId,
          adapterId: SAG_SALES_ADAPTER_ID,
          adapterVersion: SAG_SALES_ADAPTER_VERSION,
          correlationId: ctx.correlationId,
          extractedAt: new Date(),
        };

        for (const raw of rawRows) {
          const result = normalizeSalesDocument(raw, normCtx);
          if (result.skipped || !result.document) {
            rejected++;
            if (result.skipReason) {
              errors.push({
                stage: "normalize",
                message: result.skipReason,
                recordId: String(raw.numeroDocumento ?? "unknown"),
                recoverable: true,
              });
            }
          } else {
            normalized++;
            validated++;
            persisted++;
          }
        }
      } catch (e) {
        errors.push({
          stage: "extract",
          message: e instanceof Error ? e.message : "Unknown extraction error",
          recoverable: false,
        });
      }

      const durationMs = Date.now() - startedAt;

      return {
        correlationId: ctx.correlationId,
        status: errors.some(e => !e.recoverable) ? "FAILED"
          : rejected > 0 ? "PARTIAL"
          : "SUCCESS",
        stats: { discovered, extracted, normalized, validated, persisted, rejected, unchanged },
        completedAt: new Date(),
        durationMs,
        errors,
      };
    },

    async health(): Promise<AdapterHealthReport> {
      if (deps.checkHealth) {
        const check = await deps.checkHealth();
        lastHealthCheck = {
          status: check.reachable ? "HEALTHY" : "UNHEALTHY",
          lastSuccessfulSync: null,
          lastError: check.reachable ? null : "SAG unreachable",
          latencyMs: check.latencyMs,
          checkedAt: new Date(),
        };
      } else {
        lastHealthCheck = {
          status: "UNKNOWN",
          lastSuccessfulSync: null,
          lastError: null,
          latencyMs: null,
          checkedAt: new Date(),
        };
      }
      return lastHealthCheck;
    },

    capabilities(): AdapterCapabilities {
      return {
        supportsIncremental: false,
        supportsWebhook: false,
        supportsDiscovery: true,
        supportsBulk: true,
        maxBatchSize: 10000,
        estimatedLatencyMs: 5000,
      };
    },
  };
}
