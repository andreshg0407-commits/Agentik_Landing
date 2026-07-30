/**
 * scripts/diagnose-needs-rule36-centro.ts
 *
 * AGENTIK-NEEDS-RULE36-DIAGNOSIS-FIX-01 — Diagnóstico de las filas reales.
 *
 * Para las estructuras visibles en Centro (Conjunto Meses, Conjunto Náutico
 * Meses, Pijama CC 18-22, Pijama CL 18-22 — y cualquier otra no asignada),
 * imprime LAS TRES CAPAS para demostrar dónde estaba el error:
 *
 *   (a) MOTOR:        plan.unallocated verbatim (reason, unidades).
 *   (b) METADATA:     disponibilidad del Sprint 5 por tienda (eligible/
 *                     blocked/total) + refs compatibles con su stock global,
 *                     umbral y veredicto del predicado canónico por tienda.
 *   (c) PROYECCIÓN:   código y texto que la presentación derivaría.
 *
 * Con el fix aplicado, para Centro/Caldas ninguna referencia puede quedar
 * bloqueada por Regla 36 (el script FALLA con exit 1 si encuentra una).
 *
 * Run: npx tsx --env-file=.env scripts/diagnose-needs-rule36-centro.ts
 */

const mockServerOnly = require("./_mock-server-only.cjs");
void mockServerOnly;

import { prisma } from "@/lib/prisma";
import { loadStoreUnitNeeds } from "@/lib/comercial/tiendas/store-unit-needs-service";
import { loadStoreReplenishmentPlan } from "@/lib/comercial/tiendas/store-replenishment-plan-service";
import { buildStoreNeedsTabPresentation } from "@/lib/comercial/tiendas/store-unit-needs-presentation";
import { isRule36Eligible } from "@/lib/comercial/tiendas/store-rule36-eligibility";
import {
  resolveCatalogInfo,
  findCompatibleRefs,
} from "@/lib/comercial/tiendas/store-structure-availability-service";
import {
  loadDistributionData,
  buildMainStockIndex,
  buildSubstitutionIndex,
  loadHeroImageMap,
  getScarcityParams,
} from "@/lib/comercial/tiendas/store-distribution-service";

const STORE_ID = process.env.DIAG_STORE_ID ?? "centro";

async function main() {
  const db = prisma as any;
  const org = await db.organization.findFirst({
    where: { slug: process.env.VALIDATE_ORG_SLUG ?? "castillitos" },
    select: { id: true, slug: true },
  });
  if (!org) throw new Error("Organization not found");

  console.log(`\n═══ RULE36-DIAGNOSIS — ${STORE_ID.toUpperCase()} (${org.slug}) ═══\n`);
  let failures = 0;

  const scarcity = getScarcityParams();
  console.log(`Regla 36: umbral=${scarcity.threshold} · permitidas=${scarcity.allowedIds.join(", ")}\n`);

  const needs = await loadStoreUnitNeeds(org.id, STORE_ID);
  const plan = await loadStoreReplenishmentPlan(org.id);
  const presentation = buildStoreNeedsTabPresentation(plan, needs);

  // Índices para la capa (b)
  const distData = await loadDistributionData(org.id);
  const mainStockIndex = buildMainStockIndex(distData.mainStock);
  const heroImageMap = await loadHeroImageMap(org.id);
  const subIndex = buildSubstitutionIndex(
    distData.storeInventory, mainStockIndex, distData.grupoByRef,
    heroImageMap, distData.refToProductId, distData.sizeClassByRef,
  );

  const unassigned = presentation.unassigned;
  console.log(`Necesidades NO ASIGNADAS de ${STORE_ID}: ${unassigned.length}\n`);

  for (const u of unassigned) {
    console.log(`── ${u.label} (${u.structureKey}) ──`);
    // (a) MOTOR
    console.log(`   (a) MOTOR      : reason=${u.engineReason} · req=${u.requiredUnits} · exec=${u.executableUnits} · asig=${u.allocatedUnits} · pend=${u.pendingUnits}`);
    // (b) METADATA
    const need = needs.needs.find(n => n.structureKey === u.structureKey);
    const av = need?.availability;
    console.log(`   (b) DISPONIB.  : ${av?.status === "CONOCIDA" ? `eligible=${av.eligibleUnits} blocked=${av.blockedUnits} total=${av.totalUnits}` : "SIN_DATOS"} (calculada PARA ${STORE_ID})`);

    const catalogInfo = resolveCatalogInfo(u.structureKey);
    if (catalogInfo) {
      const refs = [...findCompatibleRefs(catalogInfo, subIndex)];
      const withStock = refs
        .map(r => ({ ref: r, stock: mainStockIndex.byReference.get(r) ?? 0 }))
        .filter(x => x.stock > 0)
        .sort((a, b) => b.stock - a.stock);
      console.log(`   (b) COMPATIBLES: ${refs.length} en subgrupo · ${withStock.length} con stock global`);
      for (const x of withStock.slice(0, 6)) {
        const verdicts = ["centro", "caldas", "san_diego", "gran_plaza"].map(s =>
          `${s}:${isRule36Eligible({ mainStockUnits: x.stock, scarcityThreshold: scarcity.threshold, destinationStoreId: s, allowedStoreIds: scarcity.allowedIds }) ? "✓" : "✗"}`,
        ).join(" ");
        console.log(`       · ${x.ref.padEnd(14)} stock=${String(x.stock).padStart(4)} ${x.stock <= scarcity.threshold ? "≤36 ESCASA" : ">36        "} → ${verdicts}`);
      }
    } else {
      console.log(`   (b) COMPATIBLES: estructura sin resolución de catálogo (SIN_DATOS por diseño)`);
    }
    // (c) PROYECCIÓN
    console.log(`   (c) PROYECCIÓN : code=${u.code}`);
    console.log(`       "${u.detail}"`);

    // Verificación del fix: tienda permitida jamás bloqueada por Regla 36
    if (scarcity.allowedIds.includes(STORE_ID)) {
      if (av?.status === "CONOCIDA" && av.blockedUnits > 0) {
        failures++;
        console.log(`   ✗ VIOLACIÓN: ${STORE_ID} es tienda permitida y tiene blockedUnits=${av.blockedUnits} por Regla 36`);
      }
      if (u.code === "COMPATIBLES_EXCLUIDAS_POR_REGLAS") {
        failures++;
        console.log(`   ✗ VIOLACIÓN: diagnóstico de exclusión por reglas en tienda permitida`);
      }
    }
    console.log("");
  }

  console.log(failures === 0
    ? `✓ ${STORE_ID}: ninguna necesidad diagnosticada como "excluida por Regla 36" y cero blockedUnits en tienda permitida. Las razones visibles son las certificadas del motor.`
    : `✗ ${failures} violaciones — el fix no está aplicado o hay otra causa. DETENER.`);
  console.log("\nSugerencia: correr también con DIAG_STORE_ID=san_diego para confirmar que allí la Regla 36 SÍ bloquea (comportamiento correcto).");
  console.log("\n═══ Fin del diagnóstico ═══\n");
  if (failures > 0) process.exit(1);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => (prisma as any).$disconnect?.());
