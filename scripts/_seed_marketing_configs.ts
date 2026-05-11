/**
 * _seed_marketing_configs.ts
 *
 * Sprint TA-02 — Seeds existing Marketing Studio configs into TenantMarketingConfig table.
 *
 * Safe to run multiple times — uses upsert semantics.
 * Run AFTER applying migration 20260506010000_org_group_onboarding_marketing_config.
 *
 * Usage:
 *   npx dotenv-cli -e .env -- npx tsx scripts/_seed_marketing_configs.ts
 */

import { prisma }           from "@/lib/prisma";
import { DO_JEANS_CONFIG, CASTILLITOS_CONFIG } from "@/lib/marketing-studio/tenant-config";

const B = (s: string) => `\x1b[1m${s}\x1b[0m`;
const G = (s: string) => `\x1b[32m${s}\x1b[0m`;
const R = (s: string) => `\x1b[31m${s}\x1b[0m`;
const C = (s: string) => `\x1b[36m${s}\x1b[0m`;

const TENANT_SEEDS: Array<{
  slug:         string;
  config:       typeof CASTILLITOS_CONFIG;
  promptEngine: string;
}> = [
  { slug: "castillitos", config: CASTILLITOS_CONFIG, promptEngine: "kids_product"  },
  { slug: "do-jeans",    config: DO_JEANS_CONFIG,    promptEngine: "fashion_adult" },
];

async function main() {
  console.log(B("\n═══════════════════════════════════════════════════"));
  console.log(B("  TA-02 — Seed TenantMarketingConfig             "));
  console.log(B("═══════════════════════════════════════════════════\n"));

  for (const { slug, config, promptEngine } of TENANT_SEEDS) {
    const org = await (prisma as any).organization.findFirst({
      where:  { slug },
      select: { id: true, name: true },
    });

    if (!org) {
      console.log(R(`  ✗ Org not found: ${slug} — skipping`));
      continue;
    }

    await (prisma as any).tenantMarketingConfig.upsert({
      where:  { organizationId: org.id },
      create: {
        organizationId: org.id,
        tenantName:     config.tenantName,
        active:         config.active,
        promptEngine,
        configJson:     config as object,
      },
      update: {
        tenantName:   config.tenantName,
        active:       config.active,
        promptEngine,
        configJson:   config as object,
      },
    });

    console.log(G(`  ✓ Seeded: ${org.name} (${slug}) → promptEngine=${promptEngine}`));
  }

  console.log(C("\n  Done. TenantMarketingConfig rows created/updated.\n"));
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
