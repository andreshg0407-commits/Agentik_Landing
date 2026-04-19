/**
 * Activate the "customers" sync module on the Castillitos CRM connector.
 *
 * Use this when the connector already exists in the database and you need
 * to add "customers" to the modules array WITHOUT re-running the full
 * setup-castillitos-connectors.ts (which requires all env vars).
 *
 * Module order: customers first — populates CustomerProfile.crmId before
 * opportunities/quotes run their crmId-based customer-lookup strategy.
 *
 * Usage:
 *   npx tsx scripts/activate-crm-customers.ts [--org=castillitos] [--dry-run]
 *
 * Options:
 *   --org=<slug>   Target org slug (default: "castillitos")
 *   --dry-run      Print what would change without writing to the database
 */

import { prisma } from "@/lib/prisma";

const ORG_SLUG  = process.argv.find(a => a.startsWith("--org="))?.slice(6) ?? "castillitos";
const IS_DRY    = process.argv.includes("--dry-run");

const TARGET_MODULES = ["customers", "opportunities", "activities", "quotes"] as const;

async function main() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  ACTIVAR MÓDULO CRM: customers");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Org       : ${ORG_SLUG}`);
  console.log(`  Modo      : ${IS_DRY ? "DRY-RUN (sin escrituras)" : "REAL"}\n`);

  // ── 1. Resolve org ──────────────────────────────────────────────────────────

  const org = await prisma.organization.findFirst({ where: { slug: ORG_SLUG } });
  if (!org) {
    const available = (await prisma.organization.findMany({ select: { slug: true } }))
      .map(o => o.slug).join(", ");
    console.error(`  ✗ Organización "${ORG_SLUG}" no encontrada.`);
    console.error(`    Disponibles: ${available || "(ninguna)"}`);
    process.exit(1);
  }

  // ── 2. Find the CRM connector ───────────────────────────────────────────────

  const connector = await prisma.connector.findFirst({
    where: { organizationId: org.id, source: "castillitos_crm" },
    select: { id: true, name: true, status: true, modules: true, config: true },
  });

  if (!connector) {
    console.error("  ✗ No se encontró un conector castillitos_crm para esta organización.");
    console.error("    Ejecuta primero: npx tsx scripts/setup-castillitos-connectors.ts");
    process.exit(1);
  }

  const currentModules = connector.modules as string[];
  const alreadyHas     = currentModules.includes("customers");

  console.log(`  Conector  : ${connector.name} (${connector.id})`);
  console.log(`  Estado    : ${connector.status}`);
  console.log(`  Módulos actuales : ${currentModules.join(", ") || "(ninguno)"}`);
  console.log(`  Módulos objetivo : ${TARGET_MODULES.join(", ")}`);
  console.log();

  if (alreadyHas) {
    console.log("  ✓ El módulo \"customers\" ya está activo — sin cambios necesarios.\n");

    // Verify order is correct (customers first)
    const idx = currentModules.indexOf("customers");
    if (idx !== 0) {
      console.warn(`  ⚠  "customers" está en posición ${idx + 1} (debería ser la 1ª).`);
      console.warn("     El orden afecta a syncAll: customers debe preceder a opportunities/quotes.");
      console.warn("     Considera re-ejecutar setup-castillitos-connectors.ts para corregir el orden.\n");
    }

    process.exit(0);
  }

  // ── 3. Apply update ─────────────────────────────────────────────────────────

  console.log("  Cambios que se aplicarán:");
  console.log(`    modules: ${JSON.stringify(currentModules)}`);
  console.log(`         → : ${JSON.stringify(TARGET_MODULES)}`);
  console.log();

  if (IS_DRY) {
    console.log("  [DRY-RUN] Sin escrituras. Elimina --dry-run para aplicar.\n");
    console.log("═══════════════════════════════════════════════════════\n");
    process.exit(0);
  }

  await prisma.connector.update({
    where: { id: connector.id },
    data: {
      modules:   [...TARGET_MODULES],
      updatedAt: new Date(),
    },
  });

  console.log("  ✓ Módulos actualizados correctamente.\n");

  // ── 4. Post-activation guidance ─────────────────────────────────────────────

  const slug = ORG_SLUG;
  const id   = connector.id;

  console.log("  Secuencia de validación recomendada:\n");
  console.log("  1. Dry-run (verifica conectividad, sin escrituras en BD):");
  console.log(`     POST /api/orgs/${slug}/connectors/${id}/dry-run`);
  console.log('       body: { "module": "customers" }');
  console.log();
  console.log("     Respuesta esperada:");
  console.log('       { "status": "SUCCESS", "rowsRead": N, "rowsSkipped": 0, "rowsErrored": 0 }');
  console.log();
  console.log("  2. Sincronización real:");
  console.log(`     POST /api/orgs/${slug}/connectors/${id}/sync`);
  console.log('       body: { "module": "customers" }');
  console.log();
  console.log("     Respuesta esperada:");
  console.log('       { "status": "SUCCESS", "rowsImported": N, "rowsSkipped": 0, "rowsErrored": 0 }');
  console.log();
  console.log("  3. Verificar CustomerProfile.crmId en base de datos:");
  console.log('     SELECT count(*) FROM "CustomerProfile"');
  console.log(`       WHERE "organizationId" = '${org.id}'`);
  console.log('       AND "crmId" IS NOT NULL;');
  console.log();
  console.log("  4. (Opcional) Sincronización completa de todos los módulos:");
  console.log(`     POST /api/orgs/${slug}/connectors/${id}/sync`);
  console.log('       body: {}');
  console.log("     → ejecuta customers → opportunities → activities → quotes en ese orden");
  console.log();
  console.log("  Lo que aparece en Customer 360 tras la sincronización:");
  console.log("  · CustomerProfile.crmId = UUID de la cuenta CRM");
  console.log("  · CustomerProfile.crmSyncedAt = timestamp del sync");
  console.log("  · CustomerProfile.rawCrmJson = atributos completos de la cuenta CRM");
  console.log("  · ERP fields (erpId, erpSyncedAt, rawErpJson) sin cambios");
  console.log("  · Quotes, oportunidades y actividades vinculadas por crmId al perfil");
  console.log();
  console.log("═══════════════════════════════════════════════════════\n");
}

main()
  .catch(e => { console.error("Fatal:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
