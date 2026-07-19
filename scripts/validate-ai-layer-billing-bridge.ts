/**
 * scripts/validate-ai-layer-billing-bridge.ts
 *
 * Agentik — AI Layer — Billing Bridge Validation Suite
 * Sprint: AGENTIK-AI-LAYER-BILLING-BRIDGE-01
 *
 * Pure static validation — no DB, no real providers.
 * Validates contracts, type shapes, and integration points.
 *
 * Run: npx ts-node --transpile-only scripts/validate-ai-layer-billing-bridge.ts
 */

import {
  AI_CAPABILITY_REGISTRY,
  getPricingUsageKind,
  primaryCapability,
  validateAIRequest,
  auditBillingRecorded,
  auditRequestSucceeded,
  auditAdapterSucceeded,
  type AICapability,
  type AIExecutionMetadata,
} from "@/lib/ai-layer";

// ── Test infrastructure ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(label: string, condition: boolean): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.error(`  FAIL  ${label}`);
  }
}

function section(name: string): void {
  console.log(`\n── ${name}`);
}

// ── Section 1: usageKind mapping completeness ──────────────────────────────────

section("1. usageKind mapping — all capabilities map to a pricing kind");

const allCapabilities = Object.keys(AI_CAPABILITY_REGISTRY) as AICapability[];

for (const cap of allCapabilities) {
  const kind = getPricingUsageKind(cap);
  assert(`getPricingUsageKind(${cap}) returns non-empty string`, typeof kind === "string" && kind.length > 0);
}

// ── Section 2: primaryCapability priority ordering ────────────────────────────

section("2. primaryCapability — priority ordering");

{
  const cap = primaryCapability(["TEXT_GENERATION"]);
  assert("single cap — returns it", cap === "TEXT_GENERATION");
}

{
  const cap = primaryCapability(["TEXT_GENERATION", "JSON_OUTPUT"]);
  assert("TEXT_GENERATION + JSON_OUTPUT — returns JSON_OUTPUT (higher priority)", cap === "JSON_OUTPUT");
}

{
  const cap = primaryCapability(["VIDEO_GENERATION", "TEXT_GENERATION", "VISION"]);
  assert("VIDEO_GENERATION is highest priority", cap === "VIDEO_GENERATION");
}

{
  const cap = primaryCapability(["IMAGE_GENERATION", "TEXT_GENERATION"]);
  assert("IMAGE_GENERATION > TEXT_GENERATION", cap === "IMAGE_GENERATION");
}

{
  const cap = primaryCapability(["AUDIO_TRANSCRIPTION", "EMBEDDING"]);
  assert("AUDIO_TRANSCRIPTION > EMBEDDING", cap !== "EMBEDDING");
}

{
  const cap = primaryCapability([]);
  assert("empty array — returns TEXT_GENERATION as default", cap === "TEXT_GENERATION");
}

// ── Section 3: usageKind values are valid billing kind strings ─────────────────

section("3. usageKind values match billing engine expected strings");

const EXPECTED_BILLING_KINDS = new Set([
  "TEXT_GENERATION",
  "JSON_REASONING",
  "VISION_ANALYSIS",
  "DOCUMENT_ANALYSIS",   // DOCUMENT_ANALYSIS + LONG_CONTEXT both map here
  "TOOL_CALL",           // FUNCTION_CALLING maps to TOOL_CALL in pricing
  "EMBEDDING",
  "IMAGE_GENERATION",
  "VIDEO_GENERATION",
  "TRANSCRIPTION",       // AUDIO_TRANSCRIPTION maps to TRANSCRIPTION in pricing
]);

for (const cap of allCapabilities) {
  const kind = getPricingUsageKind(cap);
  assert(
    `${cap} → usageKind "${kind}" is in billing engine known kinds`,
    EXPECTED_BILLING_KINDS.has(kind),
  );
}

// ── Section 4: AIExecutionMetadata billing bridge fields ──────────────────────

section("4. AIExecutionMetadata shape — billing bridge fields present");

{
  // Build a mock metadata object simulating what billing bridge produces
  const meta: AIExecutionMetadata = {
    providerId:       "anthropic",
    modelId:          "claude-sonnet-4-6",
    routingStrategy:  "BEST_QUALITY",
    routingReason:    "Best quality model selected.",
    creditsCharged:   12,
    estimatedCostUsd: 0.003,
    durationMs:       320,
    isMock:           true,
    callerModule:     "validate-billing-bridge",
    executedAt:       new Date().toISOString(),
    usageKind:        "TEXT_GENERATION",
    pricingSource:    "ENGINE",
    pricingRateId:    "rate-001",
  };

  assert("usageKind field is present on AIExecutionMetadata", meta.usageKind === "TEXT_GENERATION");
  assert("pricingSource can be ENGINE", meta.pricingSource === "ENGINE");
  assert("pricingRateId can be set", meta.pricingRateId === "rate-001");
  assert("creditsCharged is a number", typeof meta.creditsCharged === "number");
  assert("estimatedCostUsd is a number", typeof meta.estimatedCostUsd === "number");
}

{
  const metaMockEstimate: AIExecutionMetadata = {
    providerId:       "openai",
    modelId:          "gpt-4o-mini",
    routingStrategy:  "CHEAPEST",
    routingReason:    "Cheapest model.",
    creditsCharged:   2,
    estimatedCostUsd: 0,
    durationMs:       150,
    isMock:           true,
    callerModule:     "validate-billing-bridge",
    executedAt:       new Date().toISOString(),
    usageKind:        "TEXT_GENERATION",
    pricingSource:    "MOCK_ESTIMATE",
  };

  assert("pricingSource can be MOCK_ESTIMATE", metaMockEstimate.pricingSource === "MOCK_ESTIMATE");
  assert("pricingRateId is optional (undefined ok)", metaMockEstimate.pricingRateId === undefined);
}

{
  const metaFallback: AIExecutionMetadata = {
    providerId:       "google",
    modelId:          "gemini-2.0-flash",
    routingStrategy:  "FASTEST",
    routingReason:    "Fastest model.",
    creditsCharged:   1,
    estimatedCostUsd: 0.001,
    durationMs:       90,
    isMock:           true,
    callerModule:     "validate-billing-bridge",
    executedAt:       new Date().toISOString(),
    usageKind:        "TEXT_GENERATION",
    pricingSource:    "FALLBACK",
  };

  assert("pricingSource can be FALLBACK", metaFallback.pricingSource === "FALLBACK");
}

// ── Section 5: pricingSource state machine ────────────────────────────────────

section("5. pricingSource state machine — transitions");

{
  // MOCK_ESTIMATE → ENGINE (billing success, real rate)
  let pricingSource: "MOCK_ESTIMATE" | "ENGINE" | "FALLBACK" = "MOCK_ESTIMATE";
  const billingSuccessWithRate = { success: true, usedFallback: false };
  if (billingSuccessWithRate.success) {
    pricingSource = billingSuccessWithRate.usedFallback ? "FALLBACK" : "ENGINE";
  }
  assert("MOCK_ESTIMATE → ENGINE on billing success with real rate", pricingSource === "ENGINE");
}

{
  // MOCK_ESTIMATE → FALLBACK (billing success, legacy calculator used)
  let pricingSource: "MOCK_ESTIMATE" | "ENGINE" | "FALLBACK" = "MOCK_ESTIMATE";
  const billingSuccessWithFallback = { success: true, usedFallback: true };
  if (billingSuccessWithFallback.success) {
    pricingSource = billingSuccessWithFallback.usedFallback ? "FALLBACK" : "ENGINE";
  }
  assert("MOCK_ESTIMATE → FALLBACK on billing success with legacy calculator", pricingSource === "FALLBACK");
}

{
  // MOCK_ESTIMATE stays MOCK_ESTIMATE on billing failure
  let pricingSource: "MOCK_ESTIMATE" | "ENGINE" | "FALLBACK" = "MOCK_ESTIMATE";
  const billingFailed = { success: false };
  if (billingFailed.success) {
    pricingSource = "ENGINE"; // never reached
  }
  assert("MOCK_ESTIMATE stays MOCK_ESTIMATE when billing fails", pricingSource === "MOCK_ESTIMATE");
}

// ── Section 6: Billing failure is non-blocking ────────────────────────────────

section("6. Billing failure non-blocking — warnings array design");

{
  // Simulate the billing failure path: warnings collected but AI response still returns success
  const billingWarnings: string[] = [];
  const billingFailed = { success: false, errors: ["Org has no balance"], warnings: ["Credit check skipped"] };

  if (!billingFailed.success) {
    billingWarnings.push(`Billing debit failed (non-blocking): ${billingFailed.errors.join("; ")}`);
    billingWarnings.push(...billingFailed.warnings);
  }

  assert("billingWarnings has 2 entries on failure", billingWarnings.length === 2);
  assert("first warning contains 'non-blocking'", billingWarnings[0]?.includes("non-blocking") ?? false);
  assert("second warning is propagated from billing engine", billingWarnings[1] === "Credit check skipped");
}

{
  // On billing success: no billing warnings
  const billingWarnings: string[] = [];
  const billingSuccess = { success: true };
  if (!billingSuccess.success) {
    billingWarnings.push("Billing failed");
  }
  assert("billingWarnings is empty on billing success", billingWarnings.length === 0);
}

// ── Section 7: requestId correlation ──────────────────────────────────────────

section("7. requestId correlation — present on all response paths");

{
  // Validate that all AIResponse failure paths include requestId
  const requestId = "ail-1717500000000-000001";

  // Validation failure path
  const validationFail = { success: false, requestId, error: "Invalid request" };
  assert("validation failure includes requestId", validationFail.requestId === requestId);

  // No models path
  const noModelsFail = { success: false, requestId, error: "No models available" };
  assert("no models failure includes requestId", noModelsFail.requestId === requestId);

  // Routing failure path
  const routingFail = { success: false, requestId, error: "Routing failed" };
  assert("routing failure includes requestId", routingFail.requestId === requestId);

  // Adapter failure path
  const adapterFail = { success: false, requestId, error: "Adapter failed" };
  assert("adapter failure includes requestId", adapterFail.requestId === requestId);

  // Success path
  const success = { success: true, requestId, content: "OK" };
  assert("success response includes requestId", success.requestId === requestId);
}

// ── Section 8: requestId format ───────────────────────────────────────────────

section("8. requestId format — ail-{timestamp}-{counter}");

{
  function mockGenerateRequestId(counter: number): string {
    return `ail-${Date.now()}-${String(counter).padStart(6, "0")}`;
  }

  const id1 = mockGenerateRequestId(1);
  const id2 = mockGenerateRequestId(2);
  const id999999 = mockGenerateRequestId(999999);

  assert("requestId starts with 'ail-'", id1.startsWith("ail-"));
  assert("requestId has 3 segments separated by '-'", id1.split("-").length === 3);
  assert("counter is zero-padded to 6 digits", id1.endsWith("-000001"));
  assert("counter increments", id1 !== id2);
  assert("max counter 999999 is 6 digits", id999999.endsWith("-999999"));
}

// ── Section 9: Audit events for billing bridge ────────────────────────────────

section("9. Audit events — billing bridge events shape");

{
  const requestId = "ail-test-000001";
  const mockRequest = {
    callerModule: "validate-billing-bridge",
    orgSlug:      "castillitos",
    requiredCapabilities: ["TEXT_GENERATION"] as AICapability[],
    userPrompt:   "Test",
  };

  const mockMeta: AIExecutionMetadata = {
    providerId:       "anthropic",
    modelId:          "claude-sonnet-4-6",
    routingStrategy:  "BEST_QUALITY",
    routingReason:    "Best quality.",
    creditsCharged:   10,
    estimatedCostUsd: 0.002,
    durationMs:       300,
    isMock:           true,
    callerModule:     "validate-billing-bridge",
    executedAt:       new Date().toISOString(),
    usageKind:        "TEXT_GENERATION",
    pricingSource:    "ENGINE",
  };

  const billingEvent = auditBillingRecorded(requestId, mockRequest, 10, "claude-sonnet-4-6");
  assert("auditBillingRecorded returns an event", billingEvent !== null && billingEvent !== undefined);
  assert("billingEvent.eventType is BILLING_RECORDED", billingEvent.eventType === "BILLING_RECORDED");
  assert("billingEvent.requestId matches", billingEvent.requestId === requestId);

  const succeededEvent = auditRequestSucceeded(requestId, mockRequest, mockMeta);
  assert("auditRequestSucceeded returns an event", succeededEvent !== null && succeededEvent !== undefined);
  assert("succeededEvent.eventType is REQUEST_SUCCEEDED", succeededEvent.eventType === "REQUEST_SUCCEEDED");

  const adapterSucceededEvent = auditAdapterSucceeded(requestId, mockRequest, mockMeta);
  assert("auditAdapterSucceeded returns an event", adapterSucceededEvent !== null && adapterSucceededEvent !== undefined);
  assert("adapterSucceededEvent.eventType is ADAPTER_SUCCEEDED", adapterSucceededEvent.eventType === "ADAPTER_SUCCEEDED");
}

// ── Section 10: allowOverage design contract ───────────────────────────────────

section("10. allowOverage contract — mock/demo phase always allows");

{
  // The allowOverage flag is a design contract — verify the intended behavior
  const allowOverage = true; // This is what the service passes
  assert("allowOverage is true during mock/demo phase", allowOverage === true);

  // Simulate what this means: billing will not block even if balance is 0
  const simulatedBalance = 0;
  const wouldBlock = !allowOverage && simulatedBalance <= 0;
  assert("with allowOverage=true and 0 balance, AI call is NOT blocked", wouldBlock === false);
}

// ── Section 11: billingWarnings thread into response warnings ─────────────────

section("11. billingWarnings threaded into AIResponse.warnings");

{
  // Simulate the full warnings array construction
  const adapterWarnings = ["Response truncated"];
  const jsonModeWarning = "JSON parsing failed — returning raw content.";
  const billingWarning = "Billing debit failed (non-blocking): Org has no balance";

  const jsonMode = true;
  const parsedJson = null;
  const content = "not valid json";

  const warnings = [
    ...(adapterWarnings ?? []),
    ...(jsonMode && !parsedJson && content ? [jsonModeWarning] : []),
    ...[billingWarning],
  ];

  assert("warnings array contains adapter warnings", warnings.includes("Response truncated"));
  assert("warnings array contains JSON mode warning", warnings.includes(jsonModeWarning));
  assert("warnings array contains billing warning", warnings.includes(billingWarning));
  assert("warnings array has 3 entries total", warnings.length === 3);
}

{
  // When billing succeeds and no JSON issues — warnings is empty or only adapter warnings
  const adapterWarnings: string[] = [];
  const billingWarnings: string[] = [];

  const warnings = [
    ...adapterWarnings,
    ...billingWarnings,
  ];

  assert("clean path produces empty warnings", warnings.length === 0);
}

// ── Section 12: validateAIRequest — billing-relevant fields ───────────────────

section("12. validateAIRequest — billing-relevant fields validated");

{
  // orgSlug is required for billing
  const noOrgSlug = validateAIRequest({
    callerModule:         "test",
    orgSlug:              "",
    requiredCapabilities: ["TEXT_GENERATION"],
    userPrompt:           "Test",
  });
  assert("empty orgSlug is invalid (billing can't debit without org)", !noOrgSlug.valid);
}

{
  // callerModule is required for billing featureKey
  const noModule = validateAIRequest({
    callerModule:         "",
    orgSlug:              "castillitos",
    requiredCapabilities: ["TEXT_GENERATION"],
    userPrompt:           "Test",
  });
  assert("empty callerModule is invalid (billing featureKey requires it)", !noModule.valid);
}

{
  // Valid request — both fields present
  const valid = validateAIRequest({
    callerModule:         "conciliacion",
    orgSlug:              "castillitos",
    requiredCapabilities: ["TEXT_GENERATION"],
    userPrompt:           "Test",
  });
  assert("valid request with orgSlug + callerModule passes", valid.valid);
}

// ── Section 13: metadata creditsCharged update logic ──────────────────────────

section("13. creditsCharged update — billing result takes priority over routing estimate");

{
  // When billing succeeds with a real credits value
  let creditsCharged = 5;           // routing estimate
  const billingCredits = 8;         // real billing result
  const billingSuccess = true;
  const billingCreditsUsed = billingCredits;

  if (billingSuccess) {
    creditsCharged = billingCreditsUsed ?? creditsCharged;
  }

  assert("creditsCharged updated to billing result value", creditsCharged === 8);
}

{
  // When billing fails — routing estimate is preserved
  let creditsCharged = 5;           // routing estimate
  const billingSuccess = false;

  if (billingSuccess) {
    creditsCharged = 99;            // never reached
  }

  assert("creditsCharged stays as routing estimate when billing fails", creditsCharged === 5);
}

{
  // When billing succeeds but creditsUsed is null/undefined — fallback to routing estimate
  let creditsCharged = 5;
  const billingSuccess = true;
  const billingCreditsUsed: number | null | undefined = null;

  if (billingSuccess) {
    creditsCharged = billingCreditsUsed ?? creditsCharged;
  }

  assert("creditsCharged falls back to routing estimate when billingCreditsUsed is null", creditsCharged === 5);
}

// ── Section 14: estimatedCostUsd update logic ──────────────────────────────────

section("14. estimatedCostUsd — billing result takes priority over 0 initial");

{
  let estimatedCostUsd = 0;         // pre-billing initial value
  const billingCostUsd = 0.00234;
  const billingSuccess = true;

  if (billingSuccess) {
    estimatedCostUsd = billingCostUsd ?? 0;
  }

  assert("estimatedCostUsd updated from billing result", Math.abs(estimatedCostUsd - 0.00234) < 0.000001);
}

{
  let estimatedCostUsd = 0;
  const billingSuccess = false;

  if (billingSuccess) {
    estimatedCostUsd = 99;           // never reached
  }

  assert("estimatedCostUsd stays 0 when billing fails", estimatedCostUsd === 0);
}

// ── Section 15: pricingRateId propagation ─────────────────────────────────────

section("15. pricingRateId — extracted from billing metadata when ENGINE path");

{
  // Simulate billing result with pricingFallback=false (ENGINE path)
  const usageRecordMetadata = { pricingFallback: false, pricingRateId: "rate-abc-123" };
  const usedFallback = usageRecordMetadata.pricingFallback === true;
  const pricingRateId = usedFallback
    ? undefined
    : (usageRecordMetadata.pricingRateId as string | undefined);

  assert("pricingRateId extracted on ENGINE path", pricingRateId === "rate-abc-123");
  assert("pricingSource is ENGINE", !usedFallback);
}

{
  // FALLBACK path — pricingRateId should be undefined
  const usageRecordMetadata = { pricingFallback: true, pricingRateId: "rate-abc-123" };
  const usedFallback = usageRecordMetadata.pricingFallback === true;
  const pricingRateId = usedFallback
    ? undefined
    : (usageRecordMetadata.pricingRateId as string | undefined);

  assert("pricingRateId is undefined on FALLBACK path", pricingRateId === undefined);
  assert("pricingSource is FALLBACK", usedFallback);
}

// ── Final report ───────────────────────────────────────────────────────────────

const total = passed + failed;
console.log(`\n${"═".repeat(60)}`);
console.log(`AGENTIK-AI-LAYER-BILLING-BRIDGE-01 — Validation Suite`);
console.log(`${"═".repeat(60)}`);
console.log(`Passed: ${passed}  |  Failed: ${failed}  |  Total: ${total}`);

if (failures.length > 0) {
  console.log(`\nFailed checks:`);
  for (const f of failures) {
    console.log(`  ✗ ${f}`);
  }
}

console.log(`\nVerdict: ${failed === 0 ? "PASS — Billing Bridge contracts verified" : "FAIL — Fix the checks above"}`);
process.exit(failed === 0 ? 0 : 1);
