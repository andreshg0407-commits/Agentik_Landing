/**
 * enable-production-module.ts
 *
 * PRODUCTION-MODULE-VISIBILITY-FIX-01 — One-time activation script.
 *
 * Enables the "production" and "inventory" opt-in modules for Castillitos.
 * Idempotent — safe to run multiple times.
 *
 * Usage: npx tsx scripts/enable-production-module.ts
 */

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { setModuleEnabled } from "@/lib/tenant/modules";

async function main() {
  console.log("=".repeat(60));
  console.log("PRODUCTION-MODULE-VISIBILITY-FIX-01");
  console.log("=".repeat(60));

  // Find Castillitos org
  const org = await prisma.organization.findUnique({
    where: { slug: "castillitos" },
    select: { id: true, slug: true },
  });

  if (!org) {
    console.log("ERROR: Castillitos org not found.");
    process.exit(1);
  }

  console.log(`Org: ${org.slug} (${org.id})`);

  // Enable opt-in modules
  const modulesToEnable = ["production", "inventory"] as const;

  for (const moduleKey of modulesToEnable) {
    await setModuleEnabled(org.id, moduleKey, true);
    console.log(`  + Enabled: ${moduleKey}`);
  }

  // Verify
  const { getEnabledModules } = await import("@/lib/tenant/modules");
  const mods = await getEnabledModules(org.id);

  console.log();
  console.log("Verification:");
  console.log(`  production: ${mods.has("production") ? "ENABLED" : "DISABLED"}`);
  console.log(`  inventory:  ${mods.has("inventory") ? "ENABLED" : "DISABLED"}`);

  console.log();
  console.log("Done. Refresh the app to see Produccion in the navigation.");
  console.log("=".repeat(60));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
