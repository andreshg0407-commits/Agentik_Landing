/**
 * scripts/validate-ai-pricing.ts
 *
 * Agentik — AI Pricing Engine — Pure Validation Suite
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * 100+ pure checks. No Prisma. No server-only. No DB.
 *
 * Usage:
 *   npx tsx scripts/validate-ai-pricing.ts
 */
export type { };

import {
  // Provider
  openaiProviderFixture, anthropicProviderFixture, googleProviderFixture,
  runwayProviderFixture, internalTestProviderFixture, allProviderFixtures,
  // Rates
  openaiTextReasoningRate, openaiJsonReasoningDefaultRate,
  anthropicDocumentAnalysisRate, anthropicTextDefaultRate,
  googleVisionAnalysisRate, runwayVideoGenerationRate,
  internalTestFallbackRate,
  globalTextFallbackRate, globalImageFallbackRate, globalVideoFallbackRate,
  globalDocumentFallbackRate, globalVisionFallbackRate, globalEmbeddingFallbackRate,
  globalAudioFallbackRate, globalJsonReasoningFallbackRate,
  globalToolCallFallbackRate, globalClassificationFallbackRate,
  allRateFixtures, defaultRateRegistry,
  // Validation
  validateAiProviderDefinition, validateAiModelRate,
  createAiPricingAuditEvent, auditPricingResolution,
  // Calculator
  calculateProviderCostUsd, calculateCreditsFromCost,
  applyMinimumCredits, applyMarkup, calculateResolvedPricing,
  // Resolver
  resolveModelRate, resolvePricingFromRegistry,
  // Result
  successPricingResult, failedPricingResult,
} from "../lib/ai-pricing";

// ── Test runner ───────────────────────────────────────────────────────────────

let total = 0;
let passed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string): void {
  total++;
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label);
    console.log(`  ✗ ${label}`);
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

// ─────────────────────────────────────────────────────────────────────────────

section("§1 Provider fixtures — basic properties");
assert(openaiProviderFixture.id === "openai",       "openai.id = 'openai'");
assert(openaiProviderFixture.status === "ACTIVE",   "openai.status = ACTIVE");
assert(openaiProviderFixture.kind === "MULTIMODAL", "openai.kind = MULTIMODAL");
assert(openaiProviderFixture.supportsTokenBilling,  "openai.supportsTokenBilling");
assert(openaiProviderFixture.supportsStreaming,     "openai.supportsStreaming");

assert(anthropicProviderFixture.id === "anthropic", "anthropic.id = 'anthropic'");
assert(anthropicProviderFixture.kind === "LLM",     "anthropic.kind = LLM");
assert(anthropicProviderFixture.supportsStreaming,  "anthropic.supportsStreaming");

assert(googleProviderFixture.id === "google",       "google.id = 'google'");
assert(googleProviderFixture.kind === "MULTIMODAL", "google.kind = MULTIMODAL");

assert(runwayProviderFixture.id === "runway",       "runway.id = 'runway'");
assert(runwayProviderFixture.kind === "VIDEO",      "runway.kind = VIDEO");
assert(!runwayProviderFixture.supportsTokenBilling, "runway.supportsTokenBilling = false");
assert(runwayProviderFixture.supportsUnitBilling,   "runway.supportsUnitBilling = true");

assert(internalTestProviderFixture.id === "internal_test",     "internal_test.id correct");
assert(internalTestProviderFixture.status === "TEST_ONLY",     "internal_test.status = TEST_ONLY");
assert(internalTestProviderFixture.kind === "INTERNAL",        "internal_test.kind = INTERNAL");

assert(allProviderFixtures.length === 5, "allProviderFixtures has 5 providers");

// ─────────────────────────────────────────────────────────────────────────────

section("§2 Provider validation");
const validOpenai = validateAiProviderDefinition(openaiProviderFixture);
assert(validOpenai.valid, "openai provider validates OK");
assert(validOpenai.errors.length === 0, "openai: no errors");

const validInternal = validateAiProviderDefinition(internalTestProviderFixture);
assert(validInternal.valid, "internal_test validates OK");
assert(validInternal.warnings.length > 0, "internal_test has TEST_ONLY warning");

const invalidProvider = validateAiProviderDefinition({});
assert(!invalidProvider.valid, "empty provider is invalid");
assert(invalidProvider.errors.some(e => e.includes("id")), "missing id error");
assert(invalidProvider.errors.some(e => e.includes("name")), "missing name error");
assert(invalidProvider.errors.some(e => e.includes("kind")), "missing kind error");

const badKind = validateAiProviderDefinition({ id: "x", name: "x", kind: "UNKNOWN" as never, status: "ACTIVE" });
assert(!badKind.valid, "invalid kind rejected");

// ─────────────────────────────────────────────────────────────────────────────

section("§3 Model rate fixtures — basic properties");
assert(openaiTextReasoningRate.providerId === "openai",            "openai rate: providerId");
assert(openaiTextReasoningRate.modelId === "gpt-4o",               "openai rate: modelId");
assert(openaiTextReasoningRate.usageKind === "TEXT_GENERATION",    "openai rate: usageKind");
assert(openaiTextReasoningRate.inputTokenCostPer1M === 5.00,       "openai rate: input cost per 1M");
assert(openaiTextReasoningRate.outputTokenCostPer1M === 15.00,     "openai rate: output cost per 1M");
assert(openaiTextReasoningRate.minimumCredits === 1,               "openai rate: minimumCredits");
assert(openaiTextReasoningRate.creditMarkupMultiplier === 1.5,     "openai rate: markup 1.5");
assert(openaiTextReasoningRate.status === "ACTIVE",                "openai rate: ACTIVE");

assert(runwayVideoGenerationRate.providerId === "runway",          "runway rate: providerId");
assert(runwayVideoGenerationRate.videoSecondCost === 0.05,         "runway rate: videoSecondCost");
assert(runwayVideoGenerationRate.minimumCredits === 500,           "runway rate: minimumCredits 500");

assert(globalTextFallbackRate.providerId === "global",             "global text: providerId = global");
assert(globalTextFallbackRate.modelId === "default",               "global text: modelId = default");
assert(globalImageFallbackRate.minimumCredits === 100,             "global image: minimumCredits 100");
assert(globalVideoFallbackRate.minimumCredits === 500,             "global video: minimumCredits 500");

assert(allRateFixtures.length >= 10,                               "allRateFixtures has ≥10 rates");

// ─────────────────────────────────────────────────────────────────────────────

section("§4 Model rate validation");
const validRate = validateAiModelRate(openaiTextReasoningRate);
assert(validRate.valid, "openai rate validates OK");
assert(validRate.errors.length === 0, "openai rate: no errors");

const invalidRate = validateAiModelRate({});
assert(!invalidRate.valid, "empty rate is invalid");
assert(invalidRate.errors.some(e => e.includes("id")),          "missing id error");
assert(invalidRate.errors.some(e => e.includes("providerId")),  "missing providerId error");
assert(invalidRate.errors.some(e => e.includes("usageKind")),   "missing usageKind error");

const lowMarkup = validateAiModelRate({ ...openaiTextReasoningRate, creditMarkupMultiplier: 0.5 });
assert(!lowMarkup.valid, "markup < 1.0 is invalid");

const lowMin = validateAiModelRate({ ...openaiTextReasoningRate, minimumCredits: 0 });
assert(!lowMin.valid, "minimumCredits < 1 is invalid");

const noCostRate = validateAiModelRate({ ...openaiTextReasoningRate, inputTokenCostPer1M: undefined, outputTokenCostPer1M: undefined });
assert(noCostRate.valid, "rate with no cost is valid (only warns)");
assert(noCostRate.warnings.length > 0, "rate with no cost produces warning");

// ─────────────────────────────────────────────────────────────────────────────

section("§5 calculateProviderCostUsd — token billing");
const tokenRate = openaiTextReasoningRate; // $5/1M in, $15/1M out

// 1000 input tokens = 1/1000 of 1M = 0.001 × 5 = $0.005
// 500 output tokens = 0.5/1000 of 1M = 0.0005 × 15 = $0.0075
// total = $0.0125
const cost1 = calculateProviderCostUsd({ rate: tokenRate, inputTokens: 1000, outputTokens: 500 });
assert(Math.abs(cost1 - 0.0125) < 0.0001, `1000in+500out = $0.0125 (got ${cost1})`);

// zero tokens = minimum floor
const costMin = calculateProviderCostUsd({ rate: tokenRate, inputTokens: 0, outputTokens: 0 });
assert(costMin === (tokenRate.minimumProviderCostUsd ?? 0), `0 tokens = minimumProviderCostUsd (${costMin})`);

// large prompt: 100K input, 10K output
// = (100000/1M × 5) + (10000/1M × 15) = 0.5 + 0.15 = $0.65
const costLarge = calculateProviderCostUsd({ rate: tokenRate, inputTokens: 100000, outputTokens: 10000 });
assert(Math.abs(costLarge - 0.65) < 0.001, `100K in + 10K out = $0.65 (got ${costLarge})`);

// negative tokens clamped to 0
const costNeg = calculateProviderCostUsd({ rate: tokenRate, inputTokens: -100, outputTokens: -50 });
assert(costNeg >= 0, "negative tokens produce non-negative cost");

// ─────────────────────────────────────────────────────────────────────────────

section("§6 calculateProviderCostUsd — image billing");
const imageRate = globalImageFallbackRate; // $0.04/image, min $0.04
const costImage1 = calculateProviderCostUsd({ rate: imageRate, inputTokens: 0, outputTokens: 0, imageUnits: 1 });
assert(Math.abs(costImage1 - 0.04) < 0.0001, `1 image = $0.04 (got ${costImage1})`);

const costImage3 = calculateProviderCostUsd({ rate: imageRate, inputTokens: 0, outputTokens: 0, imageUnits: 3 });
assert(Math.abs(costImage3 - 0.12) < 0.0001, `3 images = $0.12 (got ${costImage3})`);

// ─────────────────────────────────────────────────────────────────────────────

section("§7 calculateProviderCostUsd — video billing");
const videoRate = runwayVideoGenerationRate; // $0.05/second, min $0.25
const cost5s = calculateProviderCostUsd({ rate: videoRate, inputTokens: 0, outputTokens: 0, videoSeconds: 5 });
assert(Math.abs(cost5s - 0.25) < 0.0001, `5s video = $0.25 (got ${cost5s})`);

const cost10s = calculateProviderCostUsd({ rate: videoRate, inputTokens: 0, outputTokens: 0, videoSeconds: 10 });
assert(Math.abs(cost10s - 0.5) < 0.0001, `10s video = $0.50 (got ${cost10s})`);

// minimum floor: 1 second still costs minimum $0.25
const cost1s = calculateProviderCostUsd({ rate: videoRate, inputTokens: 0, outputTokens: 0, videoSeconds: 1 });
assert(cost1s >= 0.25, `1s video ≥ minimum $0.25 (got ${cost1s})`);

// ─────────────────────────────────────────────────────────────────────────────

section("§8 calculateCreditsFromCost");
// $0.01 × 1.5 markup × 1000 credits/$ = 15 credits
const rawCredits1 = calculateCreditsFromCost({ providerCostUsd: 0.01, markupMultiplier: 1.5 });
assert(Math.abs(rawCredits1 - 15) < 0.001, `$0.01 × 1.5 × 1000 = 15 credits (got ${rawCredits1})`);

// $0 cost = 0 raw credits
const rawCredits0 = calculateCreditsFromCost({ providerCostUsd: 0, markupMultiplier: 1.5 });
assert(rawCredits0 === 0, "zero cost = 0 raw credits");

// markup < 1.0 is clamped to 1.0
const rawCreditsLowMarkup = calculateCreditsFromCost({ providerCostUsd: 0.01, markupMultiplier: 0.5 });
const rawCreditsNoMarkup  = calculateCreditsFromCost({ providerCostUsd: 0.01, markupMultiplier: 1.0 });
assert(rawCreditsLowMarkup === rawCreditsNoMarkup, "markup < 1.0 clamped to 1.0");

// ─────────────────────────────────────────────────────────────────────────────

section("§9 applyMinimumCredits");
assert(applyMinimumCredits({ rawCredits: 0.3,  minimumCredits: 1 }) === 1, "0.3 raw → min 1");
assert(applyMinimumCredits({ rawCredits: 0,    minimumCredits: 5 }) === 5, "0 raw → min 5");
assert(applyMinimumCredits({ rawCredits: 7.1,  minimumCredits: 5 }) === 8, "7.1 raw → ceil 8");
assert(applyMinimumCredits({ rawCredits: 500,  minimumCredits: 1 }) === 500, "500 raw stays 500");
assert(applyMinimumCredits({ rawCredits: 100.0001, minimumCredits: 1 }) === 101, "100.0001 → ceil 101");

// ─────────────────────────────────────────────────────────────────────────────

section("§10 applyMarkup");
assert(Math.abs(applyMarkup({ providerCostUsd: 1.0, markupMultiplier: 1.5 }) - 1.5) < 0.0001, "1.0 × 1.5 = 1.5");
assert(Math.abs(applyMarkup({ providerCostUsd: 0.1, markupMultiplier: 1.4 }) - 0.14) < 0.0001, "0.1 × 1.4 = 0.14");
assert(applyMarkup({ providerCostUsd: 0.1, markupMultiplier: 0.5 }) === 0.1, "markup < 1.0 clamped (returns original)");

// ─────────────────────────────────────────────────────────────────────────────

section("§11 calculateResolvedPricing — end to end");
// openai gpt-4o: $5/1M in, $15/1M out, markup 1.5, min 1 credit, 1000 credits/$
// 1000 in + 500 out:
//   cost = (1000/1M × 5) + (500/1M × 15) = 0.005 + 0.0075 = $0.0125
//   raw credits = 0.0125 × 1.5 × 1000 = 18.75 → ceil = 19
const pricing1 = calculateResolvedPricing({ rate: openaiTextReasoningRate, inputTokens: 1000, outputTokens: 500 });
assert(Math.abs(pricing1.providerCostUsd - 0.0125) < 0.0001,  "pricing1.providerCostUsd = 0.0125");
assert(Math.abs(pricing1.markedUpCostUsd - 0.01875) < 0.0001, "pricing1.markedUpCostUsd = 0.01875");
assert(pricing1.creditsUsed === 19, `pricing1.creditsUsed = 19 (got ${pricing1.creditsUsed})`);
assert(pricing1.minimumCredits === 1, "pricing1.minimumCredits = 1");

// Zero tokens with minimum floor
const pricingZero = calculateResolvedPricing({ rate: openaiTextReasoningRate, inputTokens: 0, outputTokens: 0 });
assert(pricingZero.creditsUsed >= 1, "zero tokens → at least minimumCredits");

// Runway video: $0.05/s, markup 1.4, min 500 credits
// 60 seconds: cost = 60 × 0.05 = $3.00, min $0.25 = $3.00
// raw credits = 3.00 × 1.4 × 1000 = 4200 → creditsUsed = 4200
const pricingVideo = calculateResolvedPricing({ rate: runwayVideoGenerationRate, videoSeconds: 60 });
assert(Math.abs(pricingVideo.providerCostUsd - 3.0) < 0.01,   "60s video cost = $3.00");
assert(pricingVideo.creditsUsed === 4200, `60s video = 4200 credits (got ${pricingVideo.creditsUsed})`);

// Image: $0.04/unit, markup 1.4, min 100 credits
// 1 image: cost = $0.04, raw credits = 0.04 × 1.4 × 1000 = 56 → creditsUsed = max(100, 56) = 100
const pricingImage = calculateResolvedPricing({ rate: globalImageFallbackRate, imageUnits: 1 });
assert(pricingImage.creditsUsed === 100, `1 image = 100 credits (minimum floor) (got ${pricingImage.creditsUsed})`);

// ─────────────────────────────────────────────────────────────────────────────

section("§12 resolveModelRate — exact match");
const exactResult = resolveModelRate({
  registry:  defaultRateRegistry,
  providerId: "openai",
  modelId:   "gpt-4o",
  usageKind: "TEXT_GENERATION",
});
assert(exactResult.rate?.id === openaiTextReasoningRate.id, "exact match: correct rate ID");
assert(exactResult.source === "EXACT_MODEL_RATE",            "exact match: source = EXACT_MODEL_RATE");

// ─────────────────────────────────────────────────────────────────────────────

section("§13 resolveModelRate — provider default fallback");
// openai + unknown model + JSON_REASONING → openaiJsonReasoningDefaultRate
const provDefault = resolveModelRate({
  registry:  defaultRateRegistry,
  providerId: "openai",
  modelId:   "gpt-99-unknown",
  usageKind: "JSON_REASONING",
});
assert(provDefault.rate?.id === openaiJsonReasoningDefaultRate.id, "provider default: correct rate");
assert(provDefault.source === "PROVIDER_DEFAULT",                   "provider default: source correct");

// ─────────────────────────────────────────────────────────────────────────────

section("§14 resolveModelRate — usageKind fallback");
// unknown provider + TEXT_GENERATION → globalTextFallbackRate
const kindDefault = resolveModelRate({
  registry:  defaultRateRegistry,
  providerId: "unknown_provider",
  modelId:   "unknown_model",
  usageKind: "TEXT_GENERATION",
});
assert(kindDefault.rate?.id === globalTextFallbackRate.id, "usageKind fallback: correct rate");
assert(kindDefault.source === "USAGE_KIND_DEFAULT",         "usageKind fallback: source correct");

// ─────────────────────────────────────────────────────────────────────────────

section("§15 resolveModelRate — global fallback");
// unknown provider + unknown usageKind → globalTextFallbackRate (global fallback)
const globalFb = resolveModelRate({
  registry:  defaultRateRegistry,
  providerId: "unknown",
  modelId:   "unknown",
  usageKind: "CLASSIFICATION",
});
// CLASSIFICATION has a global fallback rate in the registry
assert(globalFb.rate != null, "global fallback resolves to a rate");
assert(globalFb.source != null, "global fallback has a source");

// ─────────────────────────────────────────────────────────────────────────────

section("§16 resolveModelRate — no rate found");
const empty = resolveModelRate({ registry: [], providerId: "x", modelId: "y", usageKind: "EMBEDDING" });
assert(empty.rate == null, "empty registry: no rate");
assert(typeof empty.error === "string", "empty registry: error message");

// ─────────────────────────────────────────────────────────────────────────────

section("§17 expired rate detection");
const expiredRate = {
  ...openaiTextReasoningRate,
  id:          "rate_expired",
  effectiveTo: "2020-01-01T00:00:00.000Z", // expired in 2020
};
const expired = resolveModelRate({
  registry:  [expiredRate, globalTextFallbackRate],
  providerId: "openai",
  modelId:   "gpt-4o",
  usageKind: "TEXT_GENERATION",
});
// expired rate should not be selected — falls through to global fallback
assert(expired.rate?.id !== "rate_expired", "expired rate is not selected");
assert(expired.source !== "EXACT_MODEL_RATE", "expired rate: not EXACT_MODEL_RATE");

// Rate validation warns about expired rates
const expiredValidation = validateAiModelRate(expiredRate);
assert(expiredValidation.warnings.some(w => w.includes("expired")), "expired rate triggers warning");

// ─────────────────────────────────────────────────────────────────────────────

section("§18 deprecated provider warning");
const deprecatedProvider = { ...openaiProviderFixture, status: "DEPRECATED" as const };
const validation = validateAiProviderDefinition(deprecatedProvider);
assert(validation.valid, "deprecated provider is valid (just warns)");
assert(validation.warnings.some(w => w.includes("DEPRECATED")), "deprecated provider warning");

// ─────────────────────────────────────────────────────────────────────────────

section("§19 resolvePricingFromRegistry — full pipeline");
const fullResult = resolvePricingFromRegistry(
  { providerId: "openai", modelId: "gpt-4o", usageKind: "TEXT_GENERATION", inputTokens: 2000, outputTokens: 1000 },
  defaultRateRegistry,
);
assert(fullResult.success, "full pipeline: success");
assert(fullResult.resolvedRate != null, "full pipeline: resolvedRate present");
assert(fullResult.resolvedRate!.creditsUsed >= 1, "full pipeline: creditsUsed ≥ 1");
assert(fullResult.resolvedRate!.estimatedCostUsd >= 0, "full pipeline: costUsd ≥ 0");
assert(fullResult.resolvedRate!.source === "EXACT_MODEL_RATE", "full pipeline: EXACT_MODEL_RATE");

// Fallback scenario
const fallbackResult = resolvePricingFromRegistry(
  { providerId: "nonexistent", modelId: "nonexistent", usageKind: "TEXT_GENERATION", inputTokens: 1000, outputTokens: 500 },
  defaultRateRegistry,
);
assert(fallbackResult.success, "fallback pipeline: success");
assert(fallbackResult.warnings.length > 0, "fallback pipeline: has warnings");

// Failed scenario
const failedResult = resolvePricingFromRegistry(
  { providerId: "nonexistent", modelId: "nonexistent", usageKind: "TEXT_GENERATION" },
  [], // empty registry
);
assert(!failedResult.success, "empty registry: fails");
assert(failedResult.errors.length > 0, "empty registry: has errors");

// ─────────────────────────────────────────────────────────────────────────────

section("§20 Audit events");
const event = createAiPricingAuditEvent("provider_rate_resolved", "Rate found for openai/gpt-4o", { rateId: "x" });
assert(event.type === "provider_rate_resolved", "audit event type correct");
assert(typeof event.timestamp === "string",      "audit event has timestamp");
assert(event.metadata?.rateId === "x",          "audit event has metadata");

const auditResolved = auditPricingResolution({
  providerId: "openai", modelId: "gpt-4o", usageKind: "TEXT_GENERATION",
  source: "EXACT_MODEL_RATE", rateId: "r1", creditsUsed: 15, costUsd: 0.01,
});
assert(auditResolved.events.length >= 2, "resolved: ≥2 audit events");
assert(auditResolved.events.some(e => e.type === "provider_rate_resolved"), "resolved: rate_resolved event");
assert(auditResolved.events.some(e => e.type === "pricing_calculated"),     "resolved: pricing_calculated event");

const auditFailed = auditPricingResolution({
  providerId: "x", modelId: "y", usageKind: "TEXT_GENERATION", error: "Not found",
});
assert(auditFailed.events.some(e => e.type === "provider_rate_missing"), "failed: rate_missing event");
assert(auditFailed.events.some(e => e.type === "pricing_failed"),        "failed: pricing_failed event");

const auditFallback = auditPricingResolution({
  providerId: "x", modelId: "y", usageKind: "TEXT_GENERATION",
  source: "GLOBAL_FALLBACK", rateId: "r2",
});
assert(auditFallback.events.some(e => e.type === "fallback_rate_used"), "fallback: fallback_rate_used event");
assert(auditFallback.warnings.length > 0, "fallback: has warnings");

// ─────────────────────────────────────────────────────────────────────────────

section("§21 successPricingResult / failedPricingResult");
const ok = successPricingResult("ok", {
  providerId: "openai", modelId: "gpt-4o", usageKind: "TEXT_GENERATION",
  rateId: "r1", currency: "USD", estimatedCostUsd: 0.01, creditsUsed: 15,
  markupMultiplier: 1.5, minimumCredits: 1, source: "EXACT_MODEL_RATE",
});
assert(ok.success, "successPricingResult.success = true");
assert(ok.errors.length === 0, "successPricingResult.errors = []");
assert(ok.resolvedRate != null, "successPricingResult.resolvedRate present");

const fail = failedPricingResult("No rate found");
assert(!fail.success, "failedPricingResult.success = false");
assert(fail.errors.length > 0, "failedPricingResult.errors populated");
assert(fail.resolvedRate == null, "failedPricingResult.resolvedRate = undefined");

// ─────────────────────────────────────────────────────────────────────────────

section("§22 All fixture rates cover all usageKinds");
const usageKinds = [
  "TEXT_GENERATION", "JSON_REASONING", "CLASSIFICATION", "DOCUMENT_ANALYSIS",
  "IMAGE_GENERATION", "VIDEO_GENERATION", "EMBEDDING", "TRANSCRIPTION",
  "VISION_ANALYSIS", "TOOL_CALL",
];

for (const kind of usageKinds) {
  const found = allRateFixtures.some(r => r.usageKind === kind);
  assert(found, `Rate exists for usageKind: ${kind}`);
}

// ─────────────────────────────────────────────────────────────────────────────

section("§23 Rate resolution for all usageKinds via defaultRateRegistry");
for (const kind of usageKinds) {
  const result = resolveModelRate({
    registry:  defaultRateRegistry,
    providerId: "unknown",
    modelId:   "unknown",
    usageKind: kind as never,
  });
  assert(result.rate != null, `usageKind ${kind} resolves to a rate`);
}

// ─────────────────────────────────────────────────────────────────────────────

section("§24 Markup multiplier invariants");
// Markup must always produce cost ≥ provider cost
const base = 0.05;
for (const multiplier of [1.0, 1.2, 1.4, 1.5, 2.0]) {
  const marked = applyMarkup({ providerCostUsd: base, markupMultiplier: multiplier });
  assert(marked >= base, `markup ${multiplier}x: result ≥ provider cost`);
}

// ─────────────────────────────────────────────────────────────────────────────

section("§25 creditsUsed is always a positive integer");
const testCases = [
  { rate: openaiTextReasoningRate, inputTokens: 1, outputTokens: 1 },
  { rate: runwayVideoGenerationRate, videoSeconds: 1 },
  { rate: globalImageFallbackRate, imageUnits: 1 },
  { rate: anthropicDocumentAnalysisRate, inputTokens: 5000, outputTokens: 2000 },
  { rate: googleVisionAnalysisRate, inputTokens: 1000, outputTokens: 200, imageUnits: 1 },
];
for (const tc of testCases) {
  const p = calculateResolvedPricing(tc);
  assert(Number.isInteger(p.creditsUsed) && p.creditsUsed >= 1,
    `${tc.rate.id}: creditsUsed=${p.creditsUsed} is positive integer`);
}

// ─────────────────────────────────────────────────────────────────────────────

console.log("\n=================================================================");
console.log("  AGENTIK-AI-PRICING-ENGINE-01 — Pure Validation Suite");
console.log("=================================================================");
console.log(`  Total:  ${total}`);
console.log(`  Pass:   ${passed}`);
console.log(`  Fail:   ${total - passed}`);
console.log(`  Verdict: ${total === passed ? "PASS ✓" : "FAIL ✗"}`);

if (failures.length > 0) {
  console.log("\n  Failed checks:");
  failures.forEach(f => console.log(`    ✗ ${f}`));
}
console.log("=================================================================\n");

process.exit(total === passed ? 0 : 1);
