/**
 * scripts/validate-stores-unit-based-needs.ts
 *
 * AGENTIK-STORES-UNIT-BASED-NEEDS-ENGINE-01 — DB validation gate.
 *
 * Corre el motor de necesidades por unidades sobre las 4 tiendas reales:
 *   1. Reposición por tienda: necesidades, unidades requeridas, ejecutables
 *      (disponibilidad CONOCIDA), pendientes y sin datos.
 *   2. Retiros (NO_AUTORIZADA) — dirección separada, nunca sumada a reposición.
 *   3. Coherencia con cobertura (Sprint 4): cada necesidad estructural debe
 *      ser EXACTAMENTE el deficitToIdeal de su estructura — cero recalculo.
 *   4. Invariantes: executable ≤ eligible · eligible + blocked = total ·
 *      clave ausente = SIN_DATOS (nunca cero).
 *
 * Sale con código 1 si alguna verificación falla — DETENER CIERRE.
 *
 * Run: npx tsx --env-file=.env scripts/validate-stores-unit-based-needs.ts
 */

const mockServerOnly = require("./_mock-server-only.cjs");
void mockServerOnly;

import { prisma } from "@/lib/prisma";
import { loadStoreCoverage } from "@/lib/comercial/tiendas/store-coverage-service";
import { loadStoreUnitNeeds } from "@/lib/comercial/tiendas/store-unit-needs-service";

const STORE_IDS = ["centro", "san_diego", "gran_plaza", "caldas"];

async function main() {
  const db = prisma as any;
  const org = await db.organization.findFirst({
    where: { slug: process.env.VALIDATE_ORG_SLUG ?? "castillitos" },
    select: { id: true, slug: true },
  });
  if (!org) throw new Error("Organization not found (set VALIDATE_ORG_SLUG)");

  console.log(`\n═══ STORES-UNIT-BASED-NEEDS-ENGINE-01 — validación (${org.slug}) ═══\n`);

  let failures = 0;

  for (const storeId of STORE_IDS) {
    const coverage = await loadStoreCoverage(org.id, storeId);
    const needs = await loadStoreUnitNeeds(org.id, storeId);
    const s = needs.summary;

    console.log(`── ${storeId.toUpperCase()} ──`);
    console.log(`   REPOSICIÓN: ${s.replenishment.needCount} necesidades · requeridas ${s.replenishment.requiredUnits} unds`);
    console.log(`     ejecutables ${s.replenishment.executableUnits} · pendientes ${s.replenishment.pendingUnits} · sin datos ${s.replenishment.unknownAvailabilityUnits} unds`);
    console.log(`     cobertura de ejecución: ${s.coverage.fullyCoverableCount} completas · ${s.coverage.partiallyCoverableCount} parciales · ${s.coverage.unavailableCount} sin stock · ${s.coverage.unknownAvailabilityCount} sin datos`);
    console.log(`   RETIROS: ${s.removals.needCount} · ${s.removals.requiredUnits} unds no autorizadas`);

    // Coherencia: necesidad estructural ≡ déficit de cobertura, verbatim
    const covByKey = new Map(coverage.structures.map(st => [st.structureKey, st]));
    for (const n of needs.needs) {
      if (n.source === "ESTRUCTURA") {
        const st = covByKey.get(n.structureKey);
        if (!st || st.unitRule.deficitToIdeal !== n.requiredUnits || st.unitRule.deficitToMin !== n.deficitToMin) {
          failures++;
          console.log(`   ✗ INCOHERENCIA en ${n.structureKey}: necesidad ${n.requiredUnits} vs déficit ${st?.unitRule.deficitToIdeal}`);
        }
      }
      if (n.availability?.status === "CONOCIDA") {
        const av = n.availability;
        if (av.eligibleUnits + av.blockedUnits !== av.totalUnits) {
          failures++;
          console.log(`   ✗ INVARIANTE DE DISPONIBILIDAD rota en ${n.structureKey}`);
        }
        if (n.executableUnits !== null && n.executableUnits > av.eligibleUnits) {
          failures++;
          console.log(`   ✗ EXCEDE DISPONIBILIDAD en ${n.structureKey}: ejecutable ${n.executableUnits} > elegible ${av.eligibleUnits}`);
        }
      }
      if (n.action === "RETIRO" && (n.executionStatus !== "COMPLETA" || n.availability !== null)) {
        failures++;
        console.log(`   ✗ RETIRO mal formado en ${n.structureKey}`);
      }
    }

    const top = needs.needs.slice(0, 5);
    if (top.length > 0) {
      console.log(`   Top necesidades (prioridad determinista):`);
      for (const n of top) {
        if (n.action === "RETIRO") {
          console.log(`     · [${n.priorityClass}] ${n.structureKey}: RETIRAR ${n.requiredUnits} unds`);
        } else {
          const disp = n.availability?.status === "CONOCIDA"
            ? `elegible ${n.availability.eligibleUnits} / bloqueada ${n.availability.blockedUnits}`
            : "SIN DATOS";
          console.log(`     · [${n.priorityClass}|${n.executionStatus}] ${n.structureKey}: requiere ${n.requiredUnits}, ejecutable ${n.executableUnits ?? "?"} (${disp})`);
        }
      }
    }
    console.log("");
  }

  console.log(failures === 0
    ? "✓ Coherencia total: necesidades ≡ déficits verbatim · invariantes de disponibilidad y retiro intactas."
    : `✗ ${failures} verificaciones fallidas — DETENER CIERRE.`);
  console.log("\n═══ Fin de validación ═══\n");
  if (failures > 0) process.exit(1);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => (prisma as any).$disconnect?.());
