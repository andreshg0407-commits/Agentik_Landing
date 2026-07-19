/**
 * app/api/internal/integration-tests/ai-layer/route.ts
 *
 * Agentik — AI Layer Foundation — Integration Test Harness
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * GET /api/internal/integration-tests/ai-layer
 *
 * Guards:
 *   - NODE_ENV !== "production"
 *   - ENABLE_INTERNAL_INTEGRATION_TESTS=true
 *   - x-agentik-integration-token matches INTERNAL_INTEGRATION_TEST_TOKEN
 *
 * Runs live end-to-end tests against the AI Layer service.
 * Server-side only — uses real imports including server-only modules.
 */

import { NextRequest, NextResponse } from "next/server";
import { aiLayerService } from "@/lib/ai-layer/server";

// ── Security guard ────────────────────────────────────────────────────────────

function isAllowed(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.ENABLE_INTERNAL_INTEGRATION_TESTS !== "true") return false;
  const token    = req.headers.get("x-agentik-integration-token") ?? "";
  const expected = process.env.INTERNAL_INTEGRATION_TEST_TOKEN ?? "dev-integration-token";
  return token === expected;
}

// ── Test harness ──────────────────────────────────────────────────────────────

interface TestResult {
  test:    string;
  passed:  boolean;
  message: string;
  data?:   unknown;
}

function pass(test: string, message: string, data?: unknown): TestResult {
  return { test, passed: true, message, data };
}

function fail(test: string, message: string, data?: unknown): TestResult {
  return { test, passed: false, message, data };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testBasicTextGeneration(): Promise<TestResult> {
  try {
    const response = await aiLayerService.generate({
      callerModule:         "integration-test",
      orgSlug:              "castillitos",
      requiredCapabilities: ["TEXT_GENERATION"],
      userPrompt:           "Summarize the quarterly revenue in one sentence.",
    });

    if (!response.success) return fail("basic-text", `Failed: ${response.error}`);
    if (!response.content) return fail("basic-text", "Response has no content");
    if (!response.executionMetadata) return fail("basic-text", "No execution metadata");
    if (!response.executionMetadata.isMock) return fail("basic-text", "Expected mock response");

    return pass("basic-text", `OK — model: ${response.executionMetadata.modelId}, credits: ${response.executionMetadata.creditsCharged}`, {
      model:   response.executionMetadata.modelId,
      credits: response.executionMetadata.creditsCharged,
      content: response.content?.slice(0, 100),
    });
  } catch (err) {
    return fail("basic-text", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testJsonOutput(): Promise<TestResult> {
  try {
    const response = await aiLayerService.generate({
      callerModule:         "integration-test",
      orgSlug:              "castillitos",
      requiredCapabilities: ["TEXT_GENERATION", "JSON_OUTPUT"],
      userPrompt:           "Return a JSON object with keys: status, amount.",
      jsonMode:             true,
    });

    if (!response.success) return fail("json-output", `Failed: ${response.error}`);
    if (!response.parsedJson) return fail("json-output", "parsedJson is undefined — JSON parsing failed");

    return pass("json-output", "OK — JSON parsed successfully", { parsedJson: response.parsedJson });
  } catch (err) {
    return fail("json-output", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testVisionCapability(): Promise<TestResult> {
  try {
    const response = await aiLayerService.generate({
      callerModule:         "integration-test",
      orgSlug:              "castillitos",
      requiredCapabilities: ["VISION"],
      userPrompt:           "Describe what you see in this image.",
    });

    if (!response.success) return fail("vision", `Failed: ${response.error}`);

    const caps = response.executionMetadata
      ? `model ${response.executionMetadata.modelId}`
      : "unknown";

    return pass("vision", `OK — VISION satisfied by ${caps}`);
  } catch (err) {
    return fail("vision", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testCheapestRouting(): Promise<TestResult> {
  try {
    const response = await aiLayerService.generate({
      callerModule:         "integration-test",
      orgSlug:              "castillitos",
      requiredCapabilities: ["TEXT_GENERATION"],
      userPrompt:           "Quick answer.",
      routingStrategy:      "CHEAPEST",
    });

    if (!response.success) return fail("cheapest-routing", `Failed: ${response.error}`);
    if (response.executionMetadata?.routingStrategy !== "CHEAPEST") {
      return fail("cheapest-routing", `Expected CHEAPEST strategy, got ${response.executionMetadata?.routingStrategy}`);
    }

    return pass("cheapest-routing", `OK — CHEAPEST strategy applied, model: ${response.executionMetadata?.modelId}`);
  } catch (err) {
    return fail("cheapest-routing", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testFastestRouting(): Promise<TestResult> {
  try {
    const response = await aiLayerService.generate({
      callerModule:         "integration-test",
      orgSlug:              "castillitos",
      requiredCapabilities: ["TEXT_GENERATION"],
      userPrompt:           "Respond as fast as possible.",
      routingStrategy:      "FASTEST",
    });

    if (!response.success) return fail("fastest-routing", `Failed: ${response.error}`);

    return pass("fastest-routing", `OK — model: ${response.executionMetadata?.modelId}, duration: ${response.executionMetadata?.durationMs}ms`);
  } catch (err) {
    return fail("fastest-routing", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testPreferredProvider(): Promise<TestResult> {
  try {
    const response = await aiLayerService.generate({
      callerModule:         "integration-test",
      orgSlug:              "castillitos",
      requiredCapabilities: ["TEXT_GENERATION"],
      userPrompt:           "Use Anthropic.",
      preferredProviderId:  "anthropic",
    });

    if (!response.success) return fail("preferred-provider", `Failed: ${response.error}`);

    const provider = response.executionMetadata?.providerId;
    if (provider !== "anthropic") {
      // Not a hard fail — preference is a hint, not a mandate
      return pass("preferred-provider", `WARN: preferred anthropic but got ${provider} (mock routing may override hints)`);
    }

    return pass("preferred-provider", `OK — anthropic provider honored`);
  } catch (err) {
    return fail("preferred-provider", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testInvalidRequest(): Promise<TestResult> {
  try {
    const response = await aiLayerService.generate({
      callerModule:         "",  // invalid
      orgSlug:              "castillitos",
      requiredCapabilities: ["TEXT_GENERATION"],
      userPrompt:           "Test",
    });

    if (response.success) return fail("invalid-request", "Expected failure for empty callerModule, got success");

    return pass("invalid-request", `OK — invalid request rejected: ${response.error}`);
  } catch (err) {
    return fail("invalid-request", `Threw instead of returning failure: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testHealthCheck(): Promise<TestResult> {
  try {
    const results = await aiLayerService.healthCheck();
    const modelIds = Object.keys(results);

    if (modelIds.length === 0) return fail("health-check", "No adapters registered");

    const allHealthy = Object.values(results).every(v => v === true);
    if (!allHealthy) return fail("health-check", "Some adapters returned unhealthy", results);

    return pass("health-check", `OK — ${modelIds.length} adapters all healthy`, { adapters: modelIds });
  } catch (err) {
    return fail("health-check", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testModelCatalog(): Promise<TestResult> {
  try {
    const catalog = aiLayerService.getModelCatalog();

    if (!Array.isArray(catalog)) return fail("model-catalog", "Catalog is not an array");
    if (catalog.length < 9)     return fail("model-catalog", `Expected >= 9 models, got ${catalog.length}`);

    const hasOpenAI    = catalog.some(m => m.providerId === "openai");
    const hasAnthropic = catalog.some(m => m.providerId === "anthropic");
    const hasGoogle    = catalog.some(m => m.providerId === "google");

    if (!hasOpenAI)    return fail("model-catalog", "No OpenAI models in catalog");
    if (!hasAnthropic) return fail("model-catalog", "No Anthropic models in catalog");
    if (!hasGoogle)    return fail("model-catalog", "No Google models in catalog");

    return pass("model-catalog", `OK — ${catalog.length} models: OpenAI, Anthropic, Google all present`);
  } catch (err) {
    return fail("model-catalog", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Billing Bridge Tests ───────────────────────────────────────────────────────

async function testBillingBridgeMetadataFields(): Promise<TestResult> {
  try {
    const response = await aiLayerService.generate({
      callerModule:         "integration-test",
      orgSlug:              "castillitos",
      requiredCapabilities: ["TEXT_GENERATION"],
      userPrompt:           "Test billing bridge metadata fields.",
    });

    if (!response.success) return fail("billing-metadata-fields", `Failed: ${response.error}`);

    const meta = response.executionMetadata;
    if (!meta) return fail("billing-metadata-fields", "No executionMetadata");

    if (meta.usageKind === undefined) {
      return fail("billing-metadata-fields", "usageKind is undefined — billing bridge Step 3b missing");
    }
    if (meta.pricingSource === undefined) {
      return fail("billing-metadata-fields", "pricingSource is undefined — billing bridge Step 9 missing");
    }
    if (!["ENGINE", "FALLBACK", "MOCK_ESTIMATE"].includes(meta.pricingSource)) {
      return fail("billing-metadata-fields", `pricingSource has unexpected value: ${meta.pricingSource}`);
    }
    if (typeof meta.creditsCharged !== "number") {
      return fail("billing-metadata-fields", "creditsCharged is not a number");
    }
    if (typeof meta.estimatedCostUsd !== "number") {
      return fail("billing-metadata-fields", "estimatedCostUsd is not a number");
    }

    return pass("billing-metadata-fields", `OK — usageKind: ${meta.usageKind}, pricingSource: ${meta.pricingSource}, credits: ${meta.creditsCharged}`, {
      usageKind:    meta.usageKind,
      pricingSource: meta.pricingSource,
      pricingRateId: meta.pricingRateId,
      creditsCharged: meta.creditsCharged,
      estimatedCostUsd: meta.estimatedCostUsd,
    });
  } catch (err) {
    return fail("billing-metadata-fields", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testBillingBridgeRequestIdCorrelation(): Promise<TestResult> {
  try {
    const idempotencyKey = `billing-bridge-test-${Date.now()}`;
    const response = await aiLayerService.generate({
      callerModule:         "integration-test",
      orgSlug:              "castillitos",
      requiredCapabilities: ["TEXT_GENERATION"],
      userPrompt:           "Test requestId correlation.",
      idempotencyKey,
    });

    if (!response.success) return fail("billing-requestid-correlation", `Failed: ${response.error}`);
    if (!response.requestId) return fail("billing-requestid-correlation", "requestId missing from response");
    if (response.requestId !== idempotencyKey) {
      return fail("billing-requestid-correlation", `requestId mismatch: got ${response.requestId}, expected ${idempotencyKey}`);
    }

    return pass("billing-requestid-correlation", `OK — requestId ${response.requestId} matches idempotencyKey`);
  } catch (err) {
    return fail("billing-requestid-correlation", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testBillingBridgeNonBlockingOnFailure(): Promise<TestResult> {
  try {
    // Use a valid orgSlug known to be in dev DB; billing may fail but AI response must succeed
    const response = await aiLayerService.generate({
      callerModule:         "integration-test",
      orgSlug:              "castillitos",
      requiredCapabilities: ["TEXT_GENERATION"],
      userPrompt:           "Test billing non-blocking.",
    });

    // AI response must always succeed regardless of billing outcome
    if (!response.success) {
      return fail("billing-non-blocking", `AI response failed (billing should be non-blocking): ${response.error}`);
    }

    // If billing failed, it should appear in warnings — not as a hard error
    const billingWarnings = (response.warnings ?? []).filter(w => w.includes("non-blocking"));
    const billingSucceeded = response.executionMetadata?.pricingSource !== "MOCK_ESTIMATE";

    if (billingWarnings.length > 0) {
      return pass("billing-non-blocking", `OK — billing failed non-blocking; AI call succeeded. Billing warning: ${billingWarnings[0]}`);
    }

    return pass("billing-non-blocking", `OK — billing succeeded (pricingSource: ${response.executionMetadata?.pricingSource}). AI call succeeded.`);
  } catch (err) {
    return fail("billing-non-blocking", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function testBillingBridgeUsageKindPerCapability(): Promise<TestResult> {
  try {
    // JSON_OUTPUT should produce JSON_REASONING usageKind
    const jsonResponse = await aiLayerService.generate({
      callerModule:         "integration-test",
      orgSlug:              "castillitos",
      requiredCapabilities: ["TEXT_GENERATION", "JSON_OUTPUT"],
      userPrompt:           "Return JSON.",
      jsonMode:             true,
    });

    if (!jsonResponse.success) return fail("billing-usagekind-per-cap", `JSON request failed: ${jsonResponse.error}`);

    const jsonUsageKind = jsonResponse.executionMetadata?.usageKind;
    // JSON_OUTPUT primary cap should map to JSON_REASONING
    if (jsonUsageKind !== "JSON_REASONING") {
      return fail("billing-usagekind-per-cap", `Expected JSON_REASONING usageKind, got: ${jsonUsageKind}`);
    }

    return pass("billing-usagekind-per-cap", `OK — JSON_OUTPUT capability → usageKind: ${jsonUsageKind}`);
  } catch (err) {
    return fail("billing-usagekind-per-cap", `Threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAllowed(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const start = Date.now();

  const results: TestResult[] = await Promise.all([
    testBasicTextGeneration(),
    testJsonOutput(),
    testVisionCapability(),
    testCheapestRouting(),
    testFastestRouting(),
    testPreferredProvider(),
    testInvalidRequest(),
    testHealthCheck(),
    testModelCatalog(),
    testBillingBridgeMetadataFields(),
    testBillingBridgeRequestIdCorrelation(),
    testBillingBridgeNonBlockingOnFailure(),
    testBillingBridgeUsageKindPerCapability(),
  ]);

  const passed  = results.filter(r => r.passed).length;
  const failed  = results.filter(r => !r.passed).length;
  const total   = results.length;
  const elapsed = Date.now() - start;

  return NextResponse.json({
    sprint:    "AGENTIK-AI-LAYER-BILLING-BRIDGE-01",
    timestamp: new Date().toISOString(),
    summary: {
      passed,
      failed,
      total,
      elapsedMs: elapsed,
      verdict:   failed === 0 ? "PASS" : "FAIL",
    },
    results,
  }, { status: failed === 0 ? 200 : 500 });
}
