#!/usr/bin/env ts-node
/**
 * scripts/bootstrap-tenant.ts
 *
 * CLI helper to apply a tenant template to an existing org.
 *
 * Usage:
 *   npx ts-node scripts/bootstrap-tenant.ts <orgSlug> <templateKey>
 *
 * Examples:
 *   npx ts-node scripts/bootstrap-tenant.ts acme-store retail-commerce
 *   npx ts-node scripts/bootstrap-tenant.ts moda-brand fashion-wholesale
 *   npx ts-node scripts/bootstrap-tenant.ts fab-plant manufacturing-lite
 *
 * The org must already exist in the database (with status=ACTIVE).
 * This script only applies template settings — it does NOT create the org.
 *
 * Safe to re-run: all helpers are idempotent.
 */

import { prisma }                  from "@/lib/prisma";
import { createTenantFromTemplate, listTemplates } from "@/lib/bootstrap";

async function main() {
  const [, , orgSlug, templateKey] = process.argv;

  // ── Help ──────────────────────────────────────────────────────────────────

  if (!orgSlug || !templateKey || orgSlug === "--help") {
    console.log("\nUsage: bootstrap-tenant.ts <orgSlug> <templateKey>\n");
    console.log("Available templates:");
    for (const tpl of listTemplates()) {
      console.log(`  ${tpl.key.padEnd(22)} ${tpl.displayName} — ${tpl.description.slice(0, 60)}...`);
    }
    process.exit(0);
  }

  // ── Resolve org ───────────────────────────────────────────────────────────

  const org = await prisma.organization.findUnique({
    where:  { slug: orgSlug },
    select: { id: true, slug: true, name: true, status: true },
  });

  if (!org) {
    console.error(`ERROR: Organization with slug "${orgSlug}" not found.`);
    process.exit(1);
  }
  if (org.status !== "ACTIVE") {
    console.error(`ERROR: Organization "${orgSlug}" status is "${org.status}" — must be ACTIVE.`);
    process.exit(1);
  }

  console.log(`\nBootstrapping org: ${org.name} (${org.slug})`);
  console.log(`Template:          ${templateKey}\n`);

  // ── Apply template ────────────────────────────────────────────────────────

  const result = await createTenantFromTemplate(templateKey, org.id, org.slug);

  // ── Report ────────────────────────────────────────────────────────────────

  console.log("✅ Bootstrap complete\n");
  console.log(`Modules enabled  (${result.modules.enabled.length}): ${result.modules.enabled.join(", ")}`);
  console.log(`Modules disabled (${result.modules.disabled.length}): ${result.modules.disabled.join(", ")}`);
  console.log(`\nWorkspaces created: ${result.workspaces.created.join(", ") || "(none)"}`);
  console.log(`Workspaces skipped: ${result.workspaces.skipped.join(", ") || "(none)"}`);
  console.log(`\nProject:         ${result.projectId}`);
  console.log(`Project modules: ${result.projectModules.join(", ")}`);
  console.log(`\nBootstrapped at: ${result.bootstrappedAt}`);
}

main().catch(err => {
  console.error("Bootstrap failed:", err.message);
  process.exit(1);
}).finally(() => prisma.$disconnect());
