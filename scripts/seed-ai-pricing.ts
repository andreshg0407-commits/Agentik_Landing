/**
 * scripts/seed-ai-pricing.ts
 *
 * Agentik — AI Pricing Engine — Default Provider & Rate Seed
 * Sprint: AGENTIK-AI-PRICING-ENGINE-01
 *
 * Seeds providers and rates from fixtures into the DB.
 * Idempotent — safe to run multiple times.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx --conditions=react-server \
 *     scripts/seed-ai-pricing.ts
 */
export type { };

import { aiPricingService } from "../lib/ai-pricing/server/ai-pricing-service";
import { prisma }           from "../lib/prisma";

async function main(): Promise<void> {
  console.log("=================================================================");
  console.log("  AGENTIK-AI-PRICING-ENGINE-01 — Seed Default Providers & Rates");
  console.log("=================================================================\n");

  const result = await aiPricingService.seedDefaultProvidersAndRates();

  console.log(`  Providers seeded: ${result.providersSeeded}`);
  console.log(`  Rates seeded:     ${result.ratesSeeded}`);

  if (result.errors.length > 0) {
    console.log(`\n  Errors (${result.errors.length}):`);
    result.errors.forEach(e => console.log(`    ✗ ${e}`));
  } else {
    console.log("\n  No errors.");
  }

  // Show summary
  const { providers, rates } = await aiPricingService.getPricingAuditSummary();
  console.log(`\n  Providers in DB: ${providers.length}`);
  providers.forEach(p => console.log(`    - ${p.id} (${p.status})`));
  console.log(`\n  Active rates in DB: ${rates.length}`);

  const verdict = result.errors.length === 0 ? "PASS ✓" : "PARTIAL ⚠";
  console.log(`\n  Verdict: ${verdict}`);
  console.log("=================================================================\n");

  process.exit(result.errors.length === 0 ? 0 : 1);
}

main()
  .catch(err => { console.error("Seed crashed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
