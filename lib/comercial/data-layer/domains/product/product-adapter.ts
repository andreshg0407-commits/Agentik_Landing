/**
 * domains/product/product-adapter.ts
 *
 * SAG Product Adapter implementing CommercialAdapter.
 * Bridges between SAG raw article data and canonical ProductProfile.
 *
 * This adapter DOES NOT call SAG directly. It receives pre-fetched raw rows
 * and normalizes them. The actual SAG HTTP/SOAP calls remain in the connector layer.
 */

import type { CommercialAdapter, DiscoveryResult, ValidationResult, NormalizationResult, AdapterHealthReport, AdapterCapabilities } from "../../adapters";
import type { SynchronizationContext, SynchronizationResult, QualityAssessment } from "../../contracts";
import type { ProductProfile } from "./product-entities";
import type { ProductRawInput, ProductNormalizationContext } from "./product-normalizer";
import { normalizeProductRaw } from "./product-normalizer";
import { evaluateProductQuality } from "./product-quality-rules";

// ── Adapter Identity ────────────────────────────────────────────────────────

export const SAG_PRODUCT_ADAPTER_ID = "sag-product-adapter";
export const SAG_PRODUCT_ADAPTER_VERSION = "1.0.0";

// ── SAG Product Adapter ─────────────────────────────────────────────────────

export interface SagProductAdapterDeps {
  /** Fetches raw article rows from SAG (injected, not owned) */
  fetchArticles: (tenantId: string) => Promise<ProductRawInput[]>;
  /** Optional: fetch article count for discovery */
  countArticles?: (tenantId: string) => Promise<number>;
  /** Optional: check SAG connectivity */
  checkHealth?: () => Promise<{ reachable: boolean; latencyMs: number }>;
}

export function createSagProductAdapter(
  deps: SagProductAdapterDeps
): CommercialAdapter<ProductRawInput, ProductProfile> {
  let lastHealthCheck: AdapterHealthReport | null = null;

  return {
    id: SAG_PRODUCT_ADAPTER_ID,
    version: SAG_PRODUCT_ADAPTER_VERSION,
    domain: "PRODUCT",

    async discover(ctx: SynchronizationContext): Promise<DiscoveryResult> {
      const count = deps.countArticles
        ? await deps.countArticles(ctx.tenantId)
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

    async normalize(input: ProductRawInput, ctx: SynchronizationContext): Promise<NormalizationResult<ProductProfile>> {
      const normCtx: ProductNormalizationContext = {
        tenantId: ctx.tenantId,
        sourceSystem: "SAG_PYA",
        instanceId: ctx.tenantId,
        adapterId: SAG_PRODUCT_ADAPTER_ID,
        adapterVersion: SAG_PRODUCT_ADAPTER_VERSION,
        correlationId: ctx.correlationId,
        extractedAt: new Date(),
      };

      const result = normalizeProductRaw(input, normCtx);

      let quality: QualityAssessment;
      if (result.profile) {
        const qResult = evaluateProductQuality(result.profile);
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
          assessorId: "product-quality-v1",
        };
      } else {
        quality = {
          level: "REJECTED",
          dimensions: { completeness: 0, consistency: 0, freshness: 0, validity: 0, confidence: 0 },
          issues: [{ dimension: "completeness", severity: "CRITICAL", description: result.skipReason ?? "Unknown" }],
          assessedAt: new Date(),
          assessorId: "product-quality-v1",
        };
      }

      return {
        normalized: result.profile,
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
        const rawRows = await deps.fetchArticles(ctx.tenantId);
        discovered = rawRows.length;
        extracted = rawRows.length;

        const normCtx: ProductNormalizationContext = {
          tenantId: ctx.tenantId,
          sourceSystem: "SAG_PYA",
          instanceId: ctx.tenantId,
          adapterId: SAG_PRODUCT_ADAPTER_ID,
          adapterVersion: SAG_PRODUCT_ADAPTER_VERSION,
          correlationId: ctx.correlationId,
          extractedAt: new Date(),
        };

        for (const raw of rawRows) {
          const result = normalizeProductRaw(raw, normCtx);
          if (result.skipped || !result.profile) {
            rejected++;
            if (result.skipReason) {
              errors.push({
                stage: "normalize",
                message: result.skipReason,
                recordId: String(raw.codigo ?? "unknown"),
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
        maxBatchSize: 5000,
        estimatedLatencyMs: 3000,
      };
    },
  };
}
