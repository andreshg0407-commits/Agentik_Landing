/**
 * scripts/dev-create-integration-connection.ts
 *
 * AGENTIK-INTEGRATIONS-VAULT-RUNTIME-01 — Dev Helper
 *
 * Creates a fake integration connection for local development and testing.
 * Stores a placeholder (non-functional) access token via the vault service.
 *
 * Usage:
 *   npx ts-node scripts/dev-create-integration-connection.ts \
 *     --orgSlug castillitos \
 *     --provider instagram
 *
 * IMPORTANT:
 * - DO NOT use real tokens in this script.
 * - DO NOT commit real credentials.
 * - ONLY for local dev — never run in production.
 * - The stored token is a placeholder and will not authenticate with any API.
 */

import { prisma }              from "../lib/prisma";
import { storeIntegrationSecret } from "../lib/integrations/vault/vault-service";
import { SECRET_TYPE }         from "../lib/integrations/vault/vault-types";

const USAGE = `
Usage: npx ts-node scripts/dev-create-integration-connection.ts \\
  --orgSlug <slug> --provider <provider>

Providers: shopify | meta | tiktok | whatsapp | instagram | facebook | youtube
`;

async function main() {
  const args = process.argv.slice(2);
  const orgSlugIdx  = args.indexOf("--orgSlug");
  const providerIdx = args.indexOf("--provider");

  if (orgSlugIdx === -1 || providerIdx === -1) {
    console.error(USAGE);
    process.exit(1);
  }

  const orgSlug  = args[orgSlugIdx  + 1];
  const provider = args[providerIdx + 1];

  if (!orgSlug || !provider) {
    console.error("Both --orgSlug and --provider are required.");
    process.exit(1);
  }

  // Resolve org
  const org = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!org) {
    console.error(`Organization "${orgSlug}" not found.`);
    process.exit(1);
  }

  // Remove existing connection for this provider (for idempotent re-runs)
  await prisma.integrationConnection.deleteMany({
    where: { organizationId: org.id, provider },
  });

  // Create connection
  const connection = await prisma.integrationConnection.create({
    data: {
      organizationId:     org.id,
      provider,
      status:             "connected",
      health:             "healthy",
      externalAccountId:  `dev_account_${provider}_001`,
      externalAccountName:`Dev Account (${provider})`,
      scopes:             ["dev_scope_1", "dev_scope_2"],
      connectedAt:        new Date(),
    },
  });

  console.log(`✅ Created connection: ${connection.id} (${provider} for ${orgSlug})`);

  // Store a placeholder token (not a real credential)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await storeIntegrationSecret({
    organizationId: org.id,
    connectionId:   connection.id,
    secretType:     SECRET_TYPE.ACCESS_TOKEN,
    plainValue:     `dev-placeholder-token-${provider}-${Date.now()}`,
    expiresAt,
  });

  console.log(`🔐 Stored dev placeholder token (expires: ${expiresAt.toISOString()})`);
  console.log(`ℹ️  This token is NOT functional — for UI/flow testing only.`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("Script failed:", err);
  prisma.$disconnect();
  process.exit(1);
});
