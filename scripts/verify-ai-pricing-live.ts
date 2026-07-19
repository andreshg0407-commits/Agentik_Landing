/**
 * scripts/verify-ai-pricing-live.ts
 *
 * Agentik — AI Pricing Engine — Live Pricing Verification
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * Live tests using the DB pricing resolver.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx --conditions=react-server \
 *     scripts/verify-ai-pricing-live.ts
 */
export type { };

import { aiPricingService } from "../lib/ai-pricing/server/ai-pricing-service";
import { prisma }           from "../lib/prisma";

interface TestResult { test: number; label: string; pass: boolean; detail: string; error?: string; }
const results: TestResult[] = [];

function record(test: number, label: string, pass: boolean, detail: string, error?: string): void {
  results.push({ test, label, pass, detail, error });
  console.log(`  ${pass ? "✓" : "✗"} [${String(test).padStart(2, "0")}] ${label}`);
  console.log(`       ${detail}${error ? ` | ERROR: ${error}` : ""}`);
}

async function main(): Promise<void> {
  console.log("=================================================================");
  console.log("  AGENTIK-AI-PRICING-ENGINE-01 — Live Pricing Verification");
  console.log("=================================================================\n");

  // ── Step 0: Seed ─────────────────────────────────────────────────────────────

  const seed = await aiPricingService.seedDefaultProvidersAndRates();
  console.log(`  Setup: seeded ${seed.providersSeeded} providers, ${seed.ratesSeeded} rates.\n`);

  // ── Test 1: OpenAI text generation ────────────────────────────────────────────

  try {
    const result = await aiPricingService.resolvePricing({
      providerId: "openai", modelId: "gpt-4o",
      usageKind: "TEXT_GENERATION", inputTokens: 2000, outputTokens: 800,
    });
    record(1, "OpenAI gpt-4o text generation resolves",
      result.success && (result.resolvedRate?.creditsUsed ?? 0) >= 1,
      `credits: ${result.resolvedRate?.creditsUsed}, cost: $${result.resolvedRate?.estimatedCostUsd?.toFixed(6)}, source: ${result.resolvedRate?.source}`,
      result.errors[0],
    );
    record(2, "OpenAI: source is EXACT_MODEL_RATE",
      result.resolvedRate?.source === "EXACT_MODEL_RATE",
      `source: ${result.resolvedRate?.source}`,
    );
    record(3, "OpenAI: costUsd ≥ 0",
      (result.resolvedRate?.estimatedCostUsd ?? -1) >= 0,
      `costUsd: ${result.resolvedRate?.estimatedCostUsd}`,
    );
  } catch (err) {
    record(1, "OpenAI text generation", false, "Exception", String(err));
    record(2, "OpenAI source check", false, "Skipped", "");
    record(3, "OpenAI costUsd check", false, "Skipped", "");
  }

  // ── Test 2: Anthropic document analysis ───────────────────────────────────────

  try {
    const result = await aiPricingService.resolvePricing({
      providerId: "anthropic", modelId: "claude-3-5-sonnet-20241022",
      usageKind: "DOCUMENT_ANALYSIS", inputTokens: 10000, outputTokens: 3000,
    });
    record(4, "Anthropic claude-3-5-sonnet document analysis resolves",
      result.success && (result.resolvedRate?.creditsUsed ?? 0) >= 5,
      `credits: ${result.resolvedRate?.creditsUsed}, cost: $${result.resolvedRate?.estimatedCostUsd?.toFixed(6)}, source: ${result.resolvedRate?.source}`,
      result.errors[0],
    );
    record(5, "Anthropic: minimum 5 credits (document analysis floor)",
      (result.resolvedRate?.minimumCredits ?? 0) >= 5,
      `minimumCredits: ${result.resolvedRate?.minimumCredits}`,
    );
  } catch (err) {
    record(4, "Anthropic document analysis", false, "Exception", String(err));
    record(5, "Anthropic minimum credits", false, "Skipped", "");
  }

  // ── Test 3: Runway video generation ──────────────────────────────────────────

  try {
    const result = await aiPricingService.resolvePricing({
      providerId: "runway", modelId: "gen-3-alpha",
      usageKind: "VIDEO_GENERATION", videoSeconds: 10,
    });
    record(6, "Runway gen-3-alpha 10s video resolves",
      result.success && (result.resolvedRate?.creditsUsed ?? 0) >= 500,
      `credits: ${result.resolvedRate?.creditsUsed}, cost: $${result.resolvedRate?.estimatedCostUsd?.toFixed(6)}`,
      result.errors[0],
    );
  } catch (err) {
    record(6, "Runway video generation", false, "Exception", String(err));
  }

  // ── Test 4: Provider default fallback ─────────────────────────────────────────

  try {
    // openai + unknown model + JSON_REASONING → provider default
    const result = await aiPricingService.resolvePricing({
      providerId: "openai", modelId: "gpt-4-turbo-preview-unknown",
      usageKind: "JSON_REASONING", inputTokens: 3000, outputTokens: 1000,
    });
    record(7, "OpenAI JSON_REASONING with unknown model → provider default",
      result.success,
      `source: ${result.resolvedRate?.source}, credits: ${result.resolvedRate?.creditsUsed}`,
      result.errors[0],
    );
    record(8, "Provider default: source is PROVIDER_DEFAULT or EXACT_MODEL_RATE",
      result.resolvedRate?.source === "PROVIDER_DEFAULT" || result.resolvedRate?.source === "EXACT_MODEL_RATE",
      `source: ${result.resolvedRate?.source}`,
    );
  } catch (err) {
    record(7, "Provider default fallback", false, "Exception", String(err));
    record(8, "Provider default source", false, "Skipped", "");
  }

  // ── Test 5: Global usageKind fallback ─────────────────────────────────────────

  try {
    const result = await aiPricingService.resolvePricing({
      providerId: "unknown_provider_xyz", modelId: "unknown_model",
      usageKind: "TEXT_GENERATION", inputTokens: 1000, outputTokens: 500,
    });
    record(9, "Unknown provider → global TEXT_GENERATION fallback",
      result.success,
      `source: ${result.resolvedRate?.source}, credits: ${result.resolvedRate?.creditsUsed}`,
      result.errors[0],
    );
    record(10, "Global fallback: creditsUsed ≥ 1",
      (result.resolvedRate?.creditsUsed ?? 0) >= 1,
      `credits: ${result.resolvedRate?.creditsUsed}`,
    );
  } catch (err) {
    record(9, "Global usageKind fallback", false, "Exception", String(err));
    record(10, "Global fallback credits", false, "Skipped", "");
  }

  // ── Test 6: Audit summary ──────────────────────────────────────────────────────

  try {
    const summary = await aiPricingService.getPricingAuditSummary();
    record(11, "getPricingAuditSummary returns providers",
      summary.providers.length >= 5,
      `${summary.providers.length} providers, ${summary.rates.length} rates`,
    );
    record(12, "getPricingAuditSummary returns rates",
      summary.rates.length >= 10,
      `${summary.rates.length} active rates`,
    );
  } catch (err) {
    record(11, "Audit summary providers", false, "Exception", String(err));
    record(12, "Audit summary rates", false, "Skipped", "");
  }

  // ── Summary ───────────────────────────────────────────────────────────────────

  const pass = results.filter(r => r.pass).length;
  const fail = results.filter(r => !r.pass).length;

  console.log("\n=================================================================");
  console.log(`  Total: ${results.length} | Pass: ${pass} | Fail: ${fail}`);
  console.log(`  Verdict: ${fail === 0 ? "PASS ✓" : "FAIL ✗"}`);
  console.log("=================================================================\n");

  process.exit(fail === 0 ? 0 : 1);
}

main()
  .catch(err => { console.error("Live verify crashed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
