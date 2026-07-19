/**
 * scripts/validate-ai-layer-foundation.ts
 *
 * Agentik — AI Layer Foundation — Pure Validation Suite
 * Sprint: AGENTIK-AI-LAYER-FOUNDATION-01
 *
 * 100+ pure domain checks. No network. No DB. No server-only imports.
 * Run: npx ts-node --project tsconfig.json scripts/validate-ai-layer-foundation.ts
 */

import {
  AI_CAPABILITY_REGISTRY,
  getCapabilityMeta,
  getPricingUsageKind,
  primaryCapability,
  satisfiesCapabilities,
  aiModelRegistry,
  routeAIRequest,
  _resetRoundRobin,
  resolveTenantPreferences,
  setTenantPreferences,
  clearAllTenantPreferences,
  validateTenantPreferences,
  validateAIRequest,
  createAILayerAuditEvent,
  auditRequestReceived,
  auditRoutingResolved,
  auditAdapterSucceeded,
  auditAdapterFailed,
  auditRequestFailed,
  auditBillingRecorded,
  createAdapterRegistry,
} from "../lib/ai-layer/index";

import type {
  AICapability,
  AIRequest,
  AIRoutingCandidate,
  AITenantPreferences,
  AIModelDefinition,
} from "../lib/ai-layer/index";

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    failures.push(label);
    console.error(`  ✗ ${label}`);
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<AIRequest> = {}): AIRequest {
  return {
    callerModule:         "test-module",
    orgSlug:              "test-org",
    requiredCapabilities: ["TEXT_GENERATION"],
    userPrompt:           "Hello world",
    ...overrides,
  };
}

function makeCandidate(
  id: string,
  providerId: string,
  caps: AICapability[],
  credits: number,
  qualityScore = 5,
  latencyScore  = 5,
): AIRoutingCandidate {
  return {
    model: {
      id:                    id as any,
      displayName:           id,
      providerId:            providerId as any,
      capabilities:          caps,
      contextWindowTokens:   128_000,
      maxOutputTokens:       8_192,
      qualityScore,
      latencyScore,
      available:             true,
      isMock:                true,
      defaultUsageKind:      "TEXT_GENERATION",
    },
    estimatedCredits: credits,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Section 1 — Capability Registry
// ══════════════════════════════════════════════════════════════════════════════

section("Capability Registry");

const ALL_CAPS: AICapability[] = [
  "TEXT_GENERATION", "JSON_OUTPUT", "VISION", "DOCUMENT_ANALYSIS",
  "FUNCTION_CALLING", "EMBEDDING", "IMAGE_GENERATION", "VIDEO_GENERATION",
  "AUDIO_TRANSCRIPTION", "LONG_CONTEXT",
];

assert(Object.keys(AI_CAPABILITY_REGISTRY).length === 10, "Registry has exactly 10 capabilities");

for (const cap of ALL_CAPS) {
  const meta = getCapabilityMeta(cap);
  assert(meta.id === cap,                 `${cap}: id matches`);
  assert(meta.label.length > 0,           `${cap}: label non-empty`);
  assert(meta.pricingUsageKind.length > 0, `${cap}: pricingUsageKind non-empty`);
  assert(typeof meta.isTokenBased === "boolean", `${cap}: isTokenBased is boolean`);
}

assert(getPricingUsageKind("TEXT_GENERATION") === "TEXT_GENERATION", "getPricingUsageKind(TEXT_GENERATION)");
assert(getPricingUsageKind("JSON_OUTPUT")     === "JSON_REASONING",  "getPricingUsageKind(JSON_OUTPUT)");
assert(getPricingUsageKind("VISION")          === "VISION_ANALYSIS", "getPricingUsageKind(VISION)");
assert(getPricingUsageKind("VIDEO_GENERATION") === "VIDEO_GENERATION","getPricingUsageKind(VIDEO_GENERATION)");
assert(getPricingUsageKind("EMBEDDING")       === "EMBEDDING",       "getPricingUsageKind(EMBEDDING)");

// ── primaryCapability ─────────────────────────────────────────────────────────

assert(primaryCapability(["TEXT_GENERATION"]) === "TEXT_GENERATION",     "primaryCapability: single TEXT_GENERATION");
assert(primaryCapability(["VIDEO_GENERATION", "TEXT_GENERATION"]) === "VIDEO_GENERATION", "primaryCapability: VIDEO_GENERATION wins");
assert(primaryCapability(["IMAGE_GENERATION", "TEXT_GENERATION"]) === "IMAGE_GENERATION", "primaryCapability: IMAGE_GENERATION wins");
assert(primaryCapability(["EMBEDDING", "JSON_OUTPUT"])            === "EMBEDDING",        "primaryCapability: EMBEDDING wins over JSON_OUTPUT");
assert(primaryCapability([])                                       === "TEXT_GENERATION",  "primaryCapability: empty → TEXT_GENERATION");

// ── satisfiesCapabilities ─────────────────────────────────────────────────────

assert(satisfiesCapabilities(["TEXT_GENERATION", "JSON_OUTPUT"], ["TEXT_GENERATION"]), "satisfies: superset satisfies subset");
assert(!satisfiesCapabilities(["TEXT_GENERATION"], ["TEXT_GENERATION", "JSON_OUTPUT"]), "satisfies: subset does NOT satisfy superset");
assert(satisfiesCapabilities([], []),   "satisfies: empty model satisfies empty required");
assert(!satisfiesCapabilities([], ["TEXT_GENERATION"]), "satisfies: empty model fails non-empty required");

// ══════════════════════════════════════════════════════════════════════════════
// Section 2 — Model Registry
// ══════════════════════════════════════════════════════════════════════════════

section("Model Registry");

const allModels = aiModelRegistry.getAll();
assert(allModels.length >= 9, `Registry has >= 9 models (got ${allModels.length})`);

for (const m of allModels) {
  assert(m.id.length > 0,                   `${m.id}: id non-empty`);
  assert(m.displayName.length > 0,          `${m.id}: displayName non-empty`);
  assert(m.providerId.length > 0,           `${m.id}: providerId non-empty`);
  assert(m.capabilities.length > 0,         `${m.id}: at least one capability`);
  assert(m.qualityScore >= 1 && m.qualityScore <= 10, `${m.id}: qualityScore in [1,10]`);
  assert(m.latencyScore >= 1 && m.latencyScore <= 10, `${m.id}: latencyScore in [1,10]`);
}

const textModels = aiModelRegistry.getCapable(["TEXT_GENERATION"]);
assert(textModels.length >= 4, `>= 4 TEXT_GENERATION models (got ${textModels.length})`);

const videoModels = aiModelRegistry.getCapable(["VIDEO_GENERATION"]);
assert(videoModels.length >= 1, `>= 1 VIDEO_GENERATION model (got ${videoModels.length})`);

const gpt45 = aiModelRegistry.getById("gpt-4.5");
assert(gpt45 !== undefined,             "getById: gpt-4.5 found");
assert(gpt45?.providerId === "openai",  "getById: gpt-4.5 provider is openai");

const openaiModels = aiModelRegistry.getByProvider("openai");
assert(openaiModels.length >= 2, `>= 2 OpenAI models (got ${openaiModels.length})`);

const mockModels = aiModelRegistry.getMockModels();
assert(mockModels.length >= 9, `>= 9 mock models (got ${mockModels.length})`);

// ══════════════════════════════════════════════════════════════════════════════
// Section 3 — Routing Engine
// ══════════════════════════════════════════════════════════════════════════════

section("Routing Engine");

// Setup candidates
const cheapModel  = makeCandidate("cheap",   "openai",    ["TEXT_GENERATION"], 5,  6, 6);
const fastModel   = makeCandidate("fast",    "openai",    ["TEXT_GENERATION"], 20, 5, 9);
const qualModel   = makeCandidate("quality", "anthropic", ["TEXT_GENERATION"], 30, 9, 5);
const visionModel = makeCandidate("vision",  "google",    ["TEXT_GENERATION", "VISION"], 25, 8, 7);

const candidates = [cheapModel, fastModel, qualModel, visionModel];

// CHEAPEST strategy
const cheapResult = routeAIRequest(makeRequest({ routingStrategy: "CHEAPEST" }), candidates);
assert(cheapResult.selected?.id === "cheap",   "CHEAPEST: selects cheapest model");
assert(cheapResult.estimatedCredits === 5,     "CHEAPEST: correct credit estimate");

// FASTEST strategy
const fastResult = routeAIRequest(makeRequest({ routingStrategy: "FASTEST" }), candidates);
assert(fastResult.selected?.id === "fast",     "FASTEST: selects highest latency score");

// BEST_QUALITY strategy
const qualResult = routeAIRequest(makeRequest({ routingStrategy: "BEST_QUALITY" }), candidates);
assert(qualResult.selected?.id === "quality",  "BEST_QUALITY: selects highest quality score");

// ROUND_ROBIN strategy
_resetRoundRobin();
const rrPool = [cheapModel, fastModel];
const rr1 = routeAIRequest(makeRequest({ routingStrategy: "ROUND_ROBIN" }), rrPool);
const rr2 = routeAIRequest(makeRequest({ routingStrategy: "ROUND_ROBIN" }), rrPool);
const rr3 = routeAIRequest(makeRequest({ routingStrategy: "ROUND_ROBIN" }), rrPool);
assert(rr1.selected?.id !== rr2.selected?.id, "ROUND_ROBIN: rotates between models");
assert(rr1.selected?.id === rr3.selected?.id, "ROUND_ROBIN: cycles back after full rotation");

// Capability filter — only vision model supports VISION
const visionReq = makeRequest({ requiredCapabilities: ["TEXT_GENERATION", "VISION"] });
const visionResult = routeAIRequest(visionReq, candidates);
assert(visionResult.selected?.id === "vision", "Capability filter: only vision model selected for VISION requirement");

// No capable model
const embeddingReq = makeRequest({ requiredCapabilities: ["EMBEDDING"] });
const noMatch = routeAIRequest(embeddingReq, candidates);
assert(noMatch.selected === undefined,     "No match: selected is undefined");
assert(noMatch.error !== undefined,        "No match: error message set");

// Preferred model hint
const hintResult = routeAIRequest(
  makeRequest({ preferredModelId: "cheap" as any }),
  candidates,
);
assert(hintResult.selected?.id === "cheap", "Preferred model hint: exact match selected");

// Preferred provider hint
const providerHint = routeAIRequest(
  makeRequest({ preferredProviderId: "anthropic" }),
  candidates,
);
assert(providerHint.selected?.id === "quality", "Preferred provider hint: anthropic model selected");

// Tenant allowlist — only google allowed
const restrictedPrefs: AITenantPreferences = {
  orgSlug:             "restricted",
  allowedProviderIds:  ["google"],
};
const allowlistResult = routeAIRequest(makeRequest(), candidates, restrictedPrefs);
assert(allowlistResult.selected?.providerId === "google", "Allowlist: only google model returned");

// Credit limit — only models ≤ 15 credits
const budgetPrefs: AITenantPreferences = {
  orgSlug:            "budget",
  maxCreditsPerCall:  15,
};
const budgetResult = routeAIRequest(makeRequest({ routingStrategy: "BEST_QUALITY" }), candidates, budgetPrefs);
assert((budgetResult.estimatedCredits ?? 0) <= 15, "Budget guard: selected within credit limit");

// TENANT_PINNED via prefs
const pinnedPrefs: AITenantPreferences = {
  orgSlug:           "pinned",
  preferredModelId:  "fast" as any,
};
const pinnedResult = routeAIRequest(makeRequest(), candidates, pinnedPrefs);
assert(pinnedResult.selected?.id === "fast", "TENANT_PINNED: tenant pref model selected");

// ══════════════════════════════════════════════════════════════════════════════
// Section 4 — Tenant Preferences
// ══════════════════════════════════════════════════════════════════════════════

section("Tenant Preferences");

clearAllTenantPreferences();

const defaultPrefs = resolveTenantPreferences("test-org");
assert(defaultPrefs.orgSlug === "test-org",    "Default prefs: orgSlug set");
assert(defaultPrefs.maxCreditsPerCall === 0,   "Default prefs: no credit limit");
assert(defaultPrefs.forceMockAdapters === true,"Default prefs: forceMockAdapters=true");

setTenantPreferences("acme", { maxCreditsPerCall: 100 });
const acmePrefs = resolveTenantPreferences("acme");
assert(acmePrefs.maxCreditsPerCall === 100,    "Override: maxCreditsPerCall=100");
assert(acmePrefs.orgSlug === "acme",           "Override: orgSlug preserved");

setTenantPreferences("acme", { forceMockAdapters: false });
const acmePrefs2 = resolveTenantPreferences("acme");
assert(acmePrefs2.maxCreditsPerCall === 100,   "Merge: previous override preserved");
assert(acmePrefs2.forceMockAdapters === false, "Merge: new override applied");

// Validation
const validPrefs = validateTenantPreferences({ orgSlug: "ok", forceMockAdapters: true });
assert(validPrefs.valid, "Validation: valid prefs pass");
assert(validPrefs.warnings.some(w => w.includes("forceMockAdapters=true")), "Validation: forceMockAdapters warning");

const invalidPrefs = validateTenantPreferences({ orgSlug: "", maxCreditsPerCall: -1 });
assert(!invalidPrefs.valid,          "Validation: invalid prefs fail");
assert(invalidPrefs.errors.length >= 2, "Validation: multiple errors returned");

clearAllTenantPreferences();

// ══════════════════════════════════════════════════════════════════════════════
// Section 5 — Request Validation
// ══════════════════════════════════════════════════════════════════════════════

section("Request Validation");

const validReq = validateAIRequest(makeRequest());
assert(validReq.valid,                "Valid request passes");
assert(validReq.errors.length === 0,  "Valid request: no errors");

const noModule = validateAIRequest(makeRequest({ callerModule: "" }));
assert(!noModule.valid,               "Invalid: empty callerModule fails");

const noSlug = validateAIRequest(makeRequest({ orgSlug: "" }));
assert(!noSlug.valid,                 "Invalid: empty orgSlug fails");

const noPrompt = validateAIRequest(makeRequest({ userPrompt: "" }));
assert(!noPrompt.valid,               "Invalid: empty userPrompt fails");

const noCaps = validateAIRequest(makeRequest({ requiredCapabilities: [] }));
assert(!noCaps.valid,                 "Invalid: empty capabilities fails");

const badTemp = validateAIRequest(makeRequest({ temperature: 1.5 }));
assert(!badTemp.valid,                "Invalid: temperature > 1 fails");

const negTemp = validateAIRequest(makeRequest({ temperature: -0.1 }));
assert(!negTemp.valid,                "Invalid: temperature < 0 fails");

const goodTemp = validateAIRequest(makeRequest({ temperature: 0 }));
assert(goodTemp.valid,                "Valid: temperature=0 passes");

const goodTemp2 = validateAIRequest(makeRequest({ temperature: 1 }));
assert(goodTemp2.valid,               "Valid: temperature=1 passes");

const badTokens = validateAIRequest(makeRequest({ maxOutputTokens: 0 }));
assert(!badTokens.valid,              "Invalid: maxOutputTokens=0 fails");

// ══════════════════════════════════════════════════════════════════════════════
// Section 6 — Audit Events
// ══════════════════════════════════════════════════════════════════════════════

section("Audit Events");

const req = makeRequest();
const rid = "test-request-001";

const receivedEvent = auditRequestReceived(req, rid);
assert(receivedEvent.eventType === "REQUEST_RECEIVED", "REQUEST_RECEIVED event type");
assert(receivedEvent.requestId === rid,                "REQUEST_RECEIVED requestId");
assert(receivedEvent.callerModule === "test-module",   "REQUEST_RECEIVED callerModule");
assert(receivedEvent.timestamp.length > 0,             "REQUEST_RECEIVED has timestamp");
assert(receivedEvent.orgSlug === "test-org",           "REQUEST_RECEIVED orgSlug");

const routingEvent = auditRoutingResolved(rid, req, "openai", "gpt-4.5", "Best quality.", 20);
assert(routingEvent.eventType === "ROUTING_RESOLVED",  "ROUTING_RESOLVED event type");
assert(routingEvent.providerId === "openai",           "ROUTING_RESOLVED providerId");
assert(routingEvent.modelId === "gpt-4.5",             "ROUTING_RESOLVED modelId");
assert(routingEvent.creditsCharged === 20,             "ROUTING_RESOLVED creditsCharged");

const execMeta = {
  providerId:      "anthropic" as any,
  modelId:         "claude-sonnet-4-6" as any,
  routingStrategy: "BEST_QUALITY" as any,
  routingReason:   "Top quality.",
  creditsCharged:  15,
  estimatedCostUsd: 0.001,
  durationMs:       300,
  isMock:           true,
  callerModule:     "test-module",
  executedAt:       new Date().toISOString(),
};

const successEvent = auditAdapterSucceeded(rid, req, execMeta);
assert(successEvent.eventType === "ADAPTER_SUCCEEDED", "ADAPTER_SUCCEEDED event type");
assert(successEvent.durationMs === 300,                "ADAPTER_SUCCEEDED durationMs");
assert(successEvent.isMock === true,                   "ADAPTER_SUCCEEDED isMock");

const failEvent = auditAdapterFailed(rid, req, "timeout", "openai", "gpt-4.5");
assert(failEvent.eventType === "ADAPTER_FAILED",       "ADAPTER_FAILED event type");
assert(failEvent.message.includes("timeout"),          "ADAPTER_FAILED message includes error");

const billingEvent = auditBillingRecorded(rid, req, 15, "claude-sonnet-4-6");
assert(billingEvent.eventType === "BILLING_RECORDED",  "BILLING_RECORDED event type");
assert(billingEvent.creditsCharged === 15,             "BILLING_RECORDED creditsCharged");

const reqFailEvent = auditRequestFailed(rid, req, "routing error");
assert(reqFailEvent.eventType === "REQUEST_FAILED",    "REQUEST_FAILED event type");
assert(reqFailEvent.message.includes("routing error"), "REQUEST_FAILED message");

// Generic factory
const custom = createAILayerAuditEvent("ROUTING_FALLBACK", {
  callerModule: "mod",
  orgSlug:      "org",
  requestId:    "r1",
  message:      "Fallback triggered.",
});
assert(custom.eventType === "ROUTING_FALLBACK",        "Factory: custom eventType");
assert(typeof custom.timestamp === "string",           "Factory: timestamp is string");

// ══════════════════════════════════════════════════════════════════════════════
// Section 7 — Adapter Registry
// ══════════════════════════════════════════════════════════════════════════════

section("Adapter Registry (contract)");

const registry = createAdapterRegistry();
assert(registry.getAll().length === 0, "Empty registry: no adapters initially");

// ── Final report ──────────────────────────────────────────────────────────────

console.log("\n" + "═".repeat(64));
console.log(`AGENTIK-AI-LAYER-FOUNDATION-01 — Validation Suite`);
console.log(`Passed: ${passed}  |  Failed: ${failed}  |  Total: ${passed + failed}`);

if (failures.length > 0) {
  console.error("\nFailed checks:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
} else {
  console.log("All checks passed. AI Layer Foundation is ready.");
  process.exit(0);
}
