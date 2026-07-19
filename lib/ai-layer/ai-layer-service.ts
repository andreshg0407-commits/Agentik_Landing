/**
 * lib/ai-layer/ai-layer-service.ts
 *
 * Agentik — AI Layer — AI Layer Service (Billing Bridge)
 * Sprints: AGENTIK-AI-LAYER-FOUNDATION-01 + AGENTIK-AI-LAYER-BILLING-BRIDGE-01
 *
 * SERVER-ONLY — single gateway for all AI calls in Agentik.
 *
 * All modules MUST call aiLayerService.generate() — never provider SDKs directly.
 *
 * Full pipeline (post Billing Bridge):
 *   1. Validate request
 *   2. Resolve tenant preferences
 *   3. Build candidate models (capability filter)
 *   3b. Compute usageKind (needed for routing + billing)
 *   4. Estimate credit costs via Pricing Engine (fallback: mock table)
 *   5. Route: select best model
 *   6. Execute via provider adapter
 *   7. Build initial execution metadata
 *   8. Real billing debit via recordAiUsageWithResolvedPricing()
 *   9. Finalize metadata with real pricing data
 *   10. Return AIResponse
 */

import "server-only";

import type {
  AIRequest,
  AIResponse,
  AIExecutionMetadata,
  AICapability,
} from "./ai-layer-types";
import { aiModelRegistry }                      from "./ai-model-registry";
import { routeAIRequest }                        from "./ai-routing-engine";
import { buildCandidateModels, estimateCandidateCosts } from "./ai-cost-estimator";
import { resolveTenantPreferences }              from "./ai-tenant-preferences";
import { getPricingUsageKind, primaryCapability } from "./ai-capabilities";

// ── Billing bridge dependencies (server-only) ─────────────────────────────────
import { aiPricingService }  from "@/lib/ai-pricing/server";
import { aiBillingService }  from "@/lib/ai-billing/server";
import {
  validateAIRequest,
  auditRequestReceived,
  auditRoutingResolved,
  auditAdapterCalled,
  auditAdapterSucceeded,
  auditAdapterFailed,
  auditBillingRecorded,
  auditRequestSucceeded,
  auditRequestFailed,
  type AILayerAuditEvent,
} from "./ai-layer-audit";
import { createAdapterRegistry, type AdapterRegistry } from "./adapters/provider-adapter";

// Mock adapters
import { Gpt45Adapter, Gpt4oMiniAdapter }            from "./adapters/openai-adapter";
import { ClaudeSonnet46Adapter, ClaudeOpus46Adapter } from "./adapters/anthropic-adapter";
import { Gemini20FlashAdapter, Gemini15ProAdapter }   from "./adapters/google-adapter";
import { MockTextAdapter, MockVisionAdapter, MockEmbeddingAdapter } from "./adapters/internal-mock-adapter";

// ── Adapter registry (built once) ─────────────────────────────────────────────

function buildAdapterRegistry(): AdapterRegistry {
  const registry = createAdapterRegistry();
  registry.register(new Gpt45Adapter());
  registry.register(new Gpt4oMiniAdapter());
  registry.register(new ClaudeSonnet46Adapter());
  registry.register(new ClaudeOpus46Adapter());
  registry.register(new Gemini20FlashAdapter());
  registry.register(new Gemini15ProAdapter());
  registry.register(new MockTextAdapter());
  registry.register(new MockVisionAdapter());
  registry.register(new MockEmbeddingAdapter());
  return registry;
}

const adapterRegistry = buildAdapterRegistry();

// ── ID generator ──────────────────────────────────────────────────────────────

let _requestCounter = 0;

function generateRequestId(): string {
  _requestCounter = (_requestCounter + 1) % 1_000_000;
  return `ail-${Date.now()}-${String(_requestCounter).padStart(6, "0")}`;
}

// ── AI Layer Service ──────────────────────────────────────────────────────────

export const aiLayerService = {
  /**
   * Execute an AI request through the full pipeline.
   *
   * @param request - The AI request from a module
   * @returns       AIResponse — never throws
   */
  async generate(request: AIRequest): Promise<AIResponse> {
    const requestId = request.idempotencyKey ?? generateRequestId();
    const auditLog:  AILayerAuditEvent[] = [];

    // ── Step 1: Validate ───────────────────────────────────────────────────────
    const validation = validateAIRequest(request);
    if (!validation.valid) {
      return {
        success:  false,
        requestId,
        error:    `Invalid request: ${validation.errors.join("; ")}`,
        warnings: validation.warnings,
      };
    }

    auditLog.push(auditRequestReceived(request, requestId));

    // ── Step 2: Tenant preferences ─────────────────────────────────────────────
    const prefs = resolveTenantPreferences(request.orgSlug);

    // ── Step 3: Build candidates ───────────────────────────────────────────────
    const candidates = buildCandidateModels(
      request.requiredCapabilities as AICapability[],
      prefs.forceMockAdapters,
    );

    if (candidates.length === 0) {
      const err = `No models available for capabilities: ${request.requiredCapabilities.join(", ")}`;
      auditLog.push(auditRequestFailed(requestId, request, err));
      return { success: false, requestId, error: err };
    }

    // ── Step 3b: Compute usageKind (routing + billing both need it) ───────────
    const primaryCap = primaryCapability(request.requiredCapabilities as AICapability[]);
    const usageKind  = getPricingUsageKind(primaryCap);

    // ── Step 4: Estimate costs via Pricing Engine ──────────────────────────────
    // Inject aiPricingService.resolvePricing so routing uses real DB rates.
    // The cost estimator falls back to the mock credit table if the engine
    // returns no rate for a given model (new models, fixture-only registry).
    const { candidates: scoredCandidates } = await estimateCandidateCosts(
      { request, models: candidates },
      async (params) => aiPricingService.resolvePricing({
        providerId:   params.providerId as Parameters<typeof aiPricingService.resolvePricing>[0]["providerId"],
        modelId:      params.modelId,
        usageKind:    params.usageKind as Parameters<typeof aiPricingService.resolvePricing>[0]["usageKind"],
        inputTokens:  params.inputTokens,
        outputTokens: params.outputTokens,
      }),
    );

    // ── Step 5: Route ──────────────────────────────────────────────────────────
    const routing = routeAIRequest(request, scoredCandidates, prefs);

    if (!routing.selected) {
      const err = routing.error ?? "Routing failed: no model selected.";
      auditLog.push(auditRequestFailed(requestId, request, err));
      return { success: false, requestId, error: err };
    }

    auditLog.push(auditRoutingResolved(
      requestId,
      request,
      routing.selected.providerId,
      routing.selected.id,
      routing.reason,
      routing.estimatedCredits,
    ));

    // ── Step 6: Execute adapter ────────────────────────────────────────────────
    const adapter = adapterRegistry.get(routing.selected.id);

    if (!adapter) {
      const err = `No adapter registered for model ${routing.selected.id}.`;
      auditLog.push(auditAdapterFailed(requestId, request, err, routing.selected.providerId, routing.selected.id));
      return { success: false, requestId, error: err };
    }

    // Emit ADAPTER_CALLED before execution — enables observability of hung adapters
    auditLog.push(auditAdapterCalled(requestId, request, routing.selected.providerId, routing.selected.id));

    const adapterResult = await adapter.execute(request);

    if (!adapterResult.success) {
      const err = adapterResult.error ?? "Adapter returned failure.";
      auditLog.push(auditAdapterFailed(requestId, request, err, routing.selected.providerId, routing.selected.id));
      return { success: false, requestId, error: err, warnings: adapterResult.warnings };
    }

    // ── Step 7: Build initial execution metadata (pre-billing) ───────────────
    const meta: AIExecutionMetadata = {
      providerId:       routing.selected.providerId,
      modelId:          routing.selected.id,
      routingStrategy:  routing.routingStrategy,
      routingReason:    routing.reason,
      creditsCharged:   routing.estimatedCredits, // overwritten below by billing result
      estimatedCostUsd: 0,                        // overwritten below by billing result
      durationMs:       adapterResult.durationMs,
      isMock:           adapterResult.isMock,
      callerModule:     request.callerModule,
      executedAt:       new Date().toISOString(),
      usageKind,
      pricingSource:    "MOCK_ESTIMATE",           // overwritten below if billing succeeds
    };

    auditLog.push(auditAdapterSucceeded(requestId, request, meta));

    // ── Step 8: Real billing debit ─────────────────────────────────────────────
    // recordAiUsageWithResolvedPricing():
    //   1. Calls aiPricingService.resolvePricing() internally (with real usage counts)
    //   2. Falls back to legacy calculator if pricing fails
    //   3. Persists AiUsage record
    //   4. atomicDebit() — SELECT FOR UPDATE, no TOCTOU, no double-debits
    //
    // allowOverage: true — during mock/demo phase, don't block calls for 0 balance.
    //   Set to false when credit enforcement is enabled for paying tenants.
    //
    // Never throws — returns AiBillingResult.
    const billingResult = await aiBillingService.recordAiUsageWithResolvedPricing(
      {
        orgSlug:      request.orgSlug,
        featureKey:   request.callerModule,
        provider:     routing.selected.providerId,
        model:        routing.selected.id,
        // Cast: usageKind string values are identical between ai-pricing and ai-billing
        usageKind:    usageKind as Parameters<typeof aiBillingService.recordAiUsageWithResolvedPricing>[0]["usageKind"],
        inputTokens:  adapterResult.usage.inputTokens,
        outputTokens: adapterResult.usage.outputTokens,
        imageUnits:   adapterResult.usage.imageUnits,
        videoSeconds: adapterResult.usage.videoSeconds,
        audioSeconds: adapterResult.usage.audioSeconds,
        requestCount: adapterResult.usage.requestCount,
        correlationId: requestId,
        metadata: {
          requestId,
          isMock:          adapterResult.isMock,
          routingStrategy: routing.routingStrategy,
          callerModule:    request.callerModule,
        },
      },
      { allowOverage: true },
    );

    // ── Step 9: Finalize metadata from billing result ─────────────────────────
    const billingWarnings: string[] = [];

    if (billingResult.success) {
      // Real pricing resolved — overwrite routing estimates with actual values
      meta.creditsCharged   = billingResult.creditsUsed ?? routing.estimatedCredits;
      meta.estimatedCostUsd = billingResult.costUsd     ?? 0;

      // pricingFallback=true means billing fell back to legacy calculator
      const usedFallback = billingResult.usageRecord?.metadata?.pricingFallback === true;
      meta.pricingSource  = usedFallback ? "FALLBACK" : "ENGINE";
      meta.pricingRateId  = usedFallback
        ? undefined
        : (billingResult.usageRecord?.metadata?.pricingRateId as string | undefined);
    } else {
      // Billing failed — log but do not fail the AI response.
      // The AI call succeeded; credits will be reconciled manually or via AGENTIK-RECON.
      billingWarnings.push(`Billing debit failed (non-blocking): ${billingResult.errors.join("; ")}`);
      billingWarnings.push(...billingResult.warnings);
      // pricingSource stays MOCK_ESTIMATE, creditsCharged stays routing estimate
    }

    auditLog.push(auditBillingRecorded(requestId, request, meta.creditsCharged, routing.selected.id));

    // ── Step 9: Parse JSON if requested ───────────────────────────────────────
    let parsedJson: unknown | undefined;
    if (request.jsonMode && adapterResult.content) {
      try {
        parsedJson = JSON.parse(adapterResult.content);
      } catch {
        // Non-fatal: return raw content + warning
      }
    }

    auditLog.push(auditRequestSucceeded(requestId, request, meta));

    return {
      success:   true,
      requestId,
      content:   adapterResult.content,
      parsedJson,
      usage:     adapterResult.usage,
      executionMetadata: meta,
      warnings:  [
        ...(adapterResult.warnings ?? []),
        ...(request.jsonMode && !parsedJson && adapterResult.content ? ["JSON parsing failed — returning raw content."] : []),
        ...billingWarnings,
      ],
    };
  },

  /**
   * List all registered adapters for health checks.
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const adapter of adapterRegistry.getAll()) {
      results[adapter.identity.modelId] = await adapter.healthCheck();
    }
    return results;
  },

  /**
   * Get all available model definitions.
   */
  getModelCatalog() {
    return aiModelRegistry.getAll();
  },
};
