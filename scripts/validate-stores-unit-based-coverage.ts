/**
 * scripts/validate-stores-unit-based-coverage.ts
 *
 * AGENTIK-STORES-UNIT-BASED-COVERAGE-ENGINE-01 — DB validation gate.
 *
 * Corre la cobertura certificada (unidades) sobre datos reales de las 4
 * tiendas y muestra:
 *   1. Por tienda: estructuras SALUDABLE / BAJO MÍNIMO / SIN COBERTURA y
 *      déficit total en unidades (a mínimo y a ideal).
 *   2. RECLASIFICADAS: estructuras que la semántica anterior (por referencia)
 *      marcaba "con refs bajo mínimo" pero cuyo TOTAL de unidades cumple la
 *      regla — el corazón del cambio de este sprint.
 *   3. Reglas especiales por tienda (BANERA/CUNA_COLECHO/CORRAL), incluyendo
 *      presencias NO_AUTORIZADAS.
 *
 * Run: npx tsx --env-file=.env scripts/validate-stores-unit-based-coverage.ts
 */

const mockServerOnly = require("./_mock-server-only.cjs");
void mockServerOnly;

import { prisma } from "@/lib/prisma";
import { loadStoreCoverage } from "@/lib/comercial/tiendas/store-coverage-service";

const STORE_IDS = ["centro", "san_diego", "gran_plaza", "caldas"];

async function main() {
  const db = prisma as any;
  const org = await db.organization.findFirst({
    where: { slug: process.env.VALIDATE_ORG_SLUG ?? "castillitos" },
    select: { id: true, slug: true },
  });
  if (!org) throw new Error("Organization not found (set VALIDATE_ORG_SLUG)");

  console.log(`\n═══ STORES-UNIT-BASED-COVERAGE-ENGINE-01 — validación (${org.slug}) ═══\n`);

  for (const storeId of STORE_IDS) {
    const cov = await loadStoreCoverage(org.id, storeId);
    const structures = cov.structures;

    const saludables = structures.filter(s => s.quantitativeHealthStatus === "SALUDABLE" && s.structuralCoverageStatus === "CUBIERTA");
    const bajoMin    = structures.filter(s => s.quantitativeHealthStatus === "CON_REFERENCIAS_BAJO_MINIMO");
    const sinCob     = structures.filter(s => s.structuralCoverageStatus === "SIN_COBERTURA");

    const deficitMin   = structures.reduce((t, s) => t + s.totalShortageToMinimum, 0);
    const deficitIdeal = structures.reduce((t, s) => t + s.totalShortageToTarget, 0);

    // Reclasificadas: la semántica por-referencia habría dicho "bajo mínimo"
    // (alguna ref individual < min) pero el total de unidades cumple.
    const reclasificadas = structures.filter(s =>
      s.structuralCoverageStatus === "CUBIERTA" &&
      s.quantitativeHealthStatus === "SALUDABLE" &&
      s.belowMinimumReferenceCount > 0,
    );

    console.log(`── ${cov.storeName} ──`);
    console.log(`   Estructuras: ${structures.length} · saludables ${saludables.length} · bajo mínimo ${bajoMin.length} · sin cobertura ${sinCob.length}`);
    console.log(`   Déficit total: ${deficitMin} unds a mínimo · ${deficitIdeal} unds a ideal`);
    console.log(`   RECLASIFICADAS por la ley de unidades (antes 'bajo mín.' por refs, ahora SALUDABLE): ${reclasificadas.length}`);
    for (const s of reclasificadas.slice(0, 6)) {
      console.log(`     · ${s.structureKey}: ${s.totalStoreUnits} unds en ${s.activeReferenceCount} refs (regla ${s.minimumUnits}/${s.targetUnits}/${s.maximumUnits ?? "∞"})`);
    }

    const specialIssues = cov.specialRules.filter(r => r.status !== "CUMPLIDA");
    if (specialIssues.length > 0) {
      console.log(`   Reglas especiales con hallazgo:`);
      for (const r of specialIssues) {
        console.log(`     · ${r.label}: ${r.status} — ${r.totalUnits}/${r.idealUnits} unds (gap ${r.gapUnits}, ${r.matchedReferenceCount} refs)`);
      }
    } else {
      console.log(`   Reglas especiales: todas CUMPLIDAS`);
    }
    console.log("");
  }

  console.log("Criterio de aprobación:");
  console.log("  · Ninguna estructura con totalUnits ≥ mínimo puede quedar 'bajo mínimo'.");
  console.log("  · Los déficits deben ser a nivel estructura (unidades), nunca sumas por referencia.");
  console.log("  · NO_AUTORIZADA solo en tiendas con ideal=0 y unidades > 0.");
  console.log("\n═══ Fin de validación ═══\n");
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => (prisma as any).$disconnect?.());
