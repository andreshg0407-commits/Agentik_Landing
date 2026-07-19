/**
 * app/api/internal/integration-tests/ai-pricing/route.ts
 *
 * Agentik — AI Pricing Engine — Integration Test Harness
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * Guards:
 *   - NODE_ENV !== "production"
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS=true
 *   - x-agentik-integration-token matches INTERNAL_INTEGRATION_TEST_TOKEN
 *
 * 8 test cases:
 *   1. Seed providers and rates
 *   2. Exact OpenAI rate resolution
 *   3. Provider default fallback
 *   4. Global usageKind fallback
 *   5. Global fallback (unknown provider + unknown usageKind model)
 *   6. Deprecated provider warning
 *   7. Expired rate ignored
 *   8. recordAiUsageWithResolvedPricing debits credits
 */

import { NextRequest, NextResponse } from "next/server";
import { aiPricingService }          from "@/lib/ai-pricing/server";
import { aiBillingService }          from "@/lib/ai-billing/server";
import {
  resolveModelRate,
  validateAiProviderDefinition,
  defaultRateRegistry,
  openaiTextReasoningRate,
} from "@/lib/ai-pricing";

// ── Guard ─────────────────────────────────────────────────────────────────────

function isAllowed(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") return false;
  const token    = req.headers.get("x-agentik-integration-token") ?? "";
  const expected = process.env.INTERNAL_INTEGRATION_TEST_TOKEN ?? "dev-integration-token";
  return token === expected;
}

// ── Test runner ───────────────────────────────────────────────────────────────

interface TestResult { test: number; label: string; pass: boolean; detail: string; error?: string; }

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const runId = Date.now();

  function record(test: number, label: string, pass: boolean, detail: string, error?: string): void {
    results.push({ test, label, pass, detail, error });
  }

  // ── Test 1: Seed providers and rates ──────────────────────────────────────

  try {
    const seed = await aiPricingService.seedDefaultProvidersAndRates();
    record(1, "Seed providers and rates",
      seed.errors.length === 0 && seed.providersSeeded >= 1 && seed.ratesSeeded >= 1,
      `providers: ${seed.providersSeeded}, rates: ${seed.ratesSeeded}, errors: ${seed.errors.length}`,
      seed.errors[0],
    );
  } catch (err) {
    record(1, "Seed providers and rates", false, "Exception", String(err));
  }

  // ── Test 2: Exact OpenAI rate ─────────────────────────────────────────────

  try {
    const result = await aiPricingService.resolvePricing({
      providerId: "openai", modelId: "gpt-4o",
      usageKind: "TEXT_GENERATION", inputTokens: 1000, outputTokens: 500,
    });
    record(2, "Exact OpenAI rate resolved",
      result.success && result.resolvedRate?.source === "EXACT_MODEL_RATE",
      `source: ${result.resolvedRate?.source}, credits: ${result.resolvedRate?.creditsUsed}`,
      result.errors[0],
    );
  } catch (err) {
    record(2, "Exact OpenAI rate", false, "Exception", String(err));
  }

  // ── Test 3: Provider default fallback ────────────────────────────────────

  try {
    // openai + unknown model → provider default for JSON_REASONING
    const result = await aiPricingService.resolvePricing({
      providerId: "openai", modelId: `unknown-model-${runId}`,
      usageKind: "JSON_REASONING", inputTokens: 2000, outputTokens: 500,
    });
    record(3, "Provider default fallback for unknown model",
      result.success &&
      (result.resolvedRate?.source === "PROVIDER_DEFAULT" || result.resolvedRate?.source === "EXACT_MODEL_RATE"),
      `source: ${result.resolvedRate?.source}`,
      result.errors[0],
    );
  } catch (err) {
    record(3, "Provider default fallback", false, "Exception", String(err));
  }

  // ── Test 4: Global usageKind fallback ────────────────────────────────────

  try {
    const result = await aiPricingService.resolvePricing({
      providerId: `unknown-provider-${runId}`, modelId: "any",
      usageKind: "TEXT_GENERATION", inputTokens: 1000, outputTokens: 500,
    });
    record(4, "Global usageKind fallback for unknown provider",
      result.success && result.resolvedRate?.source === "USAGE_KIND_DEFAULT",
      `source: ${result.resolvedRate?.source}, credits: ${result.resolvedRate?.creditsUsed}`,
      result.errors[0],
    );
  } catch (err) {
    record(4, "Global usageKind fallback", false, "Exception", String(err));
  }

  // ── Test 5: Global fallback (pure in-memory) ─────────────────────────────

  try {
    const result = resolveModelRate({
      registry: defaultRateRegistry,
      providerId: `totally-unknown-${runId}`,
      modelId: "unknown",
      usageKind: "CLASSIFICATION",
    });
    record(5, "Global fallback resolves in-memory for CLASSIFICATION",
      result.rate != null,
      `source: ${result.source}, rateId: ${result.rate?.id}`,
      result.error,
    );
  } catch (err) {
    record(5, "Global fallback", false, "Exception", String(err));
  }

  // ── Test 6: Deprecated provider warning ──────────────────────────────────

  try {
    const deprecatedProvider = {
      id: "openai", name: "OpenAI", kind: "MULTIMODAL" as const,
      status: "DEPRECATED" as const,
      defaultCurrency: "USD", supportsTokenBilling: true,
      supportsUnitBilling: true, supportsStreaming: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    const validation = validateAiProviderDefinition(deprecatedProvider);
    record(6, "Deprecated provider triggers warning",
      validation.valid && validation.warnings.some(w => w.includes("DEPRECATED")),
      `valid: ${validation.valid}, warnings: ${validation.warnings.length}`,
    );
  } catch (err) {
    record(6, "Deprecated provider warning", false, "Exception", String(err));
  }

  // ── Test 7: Expired rate ignored ─────────────────────────────────────────

  try {
    const expiredRate = {
      ...openaiTextReasoningRate,
      id:          "test_expired_rate",
      effectiveTo: "2020-01-01T00:00:00.000Z",
    };
    const result = resolveModelRate({
      registry: [expiredRate, ...defaultRateRegistry],
      providerId: "openai", modelId: "gpt-4o",
      usageKind: "TEXT_GENERATION",
    });
    // The expired rate should be skipped — falls through to either the real
    // openai rate in defaultRateRegistry or to the global fallback
    record(7, "Expired rate ignored — falls through to valid rate",
      result.rate?.id !== "test_expired_rate",
      `resolved to: ${result.rate?.id} (source: ${result.source})`,
      result.error,
    );
  } catch (err) {
    record(7, "Expired rate ignored", false, "Exception", String(err));
  }

  // ── Test 8: recordAiUsageWithResolvedPricing debits credits ──────────────

  try {
    // Ensure balance for castillitos first
    await aiBillingService.grantMonthlyCredits(
      "castillitos", 10000,
      "Pricing harness setup",
      `pricing_harness_grant_${runId}`,
    );

    const billingResult = await aiBillingService.recordAiUsageWithResolvedPricing({
      orgSlug:      "castillitos",
      featureKey:   "pricing_harness_test",
      provider:     "openai",
      model:        "gpt-4o",
      usageKind:    "TEXT_GENERATION",
      inputTokens:  1000,
      outputTokens: 500,
      correlationId: `pricing_usage_${runId}`,
    });

    record(8, "recordAiUsageWithResolvedPricing debits credits",
      billingResult.success && (billingResult.creditsUsed ?? 0) >= 1,
      `success: ${billingResult.success}, credits: ${billingResult.creditsUsed}, balance: ${billingResult.balanceAfter}`,
      billingResult.errors[0],
    );
  } catch (err) {
    record(8, "recordAiUsageWithResolvedPricing", false, "Exception", String(err));
  }

  return results;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAllowed(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results = await runTests();
  const pass    = results.filter(r => r.pass).length;
  const fail    = results.filter(r => !r.pass).length;
  const verdict = fail === 0 ? "PASS" : pass === 0 ? "FAIL" : "PARTIAL";

  return NextResponse.json({
    sprint:    "AGENTIK-AI-PRICING-ENGINE-01",
    phase:     "Phase 18 — Integration Harness",
    testRunId: `ai_pricing_${Date.now()}`,
    timestamp: new Date().toISOString(),
    summary:   { total: results.length, pass, fail },
    verdict,
    results,
  });
}
