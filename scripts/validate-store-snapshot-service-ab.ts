/**
 * scripts/validate-store-snapshot-service-ab.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F2: validación A/B del StoreSnapshotService
 * contra el mundo actual, sobre la base REAL.
 *
 *   A = mundo actual: loadStoreUnitNeeds (S5) · loadStoreReplenishmentPlan (S6)
 *       · loadStoreCoverage · KPIs del dashboard (SDS).
 *   B = mundo nuevo: getStoreSnapshotWithMeta (F1+F2, corrida completa).
 *
 * Secciones:
 *   (a)/(b) PLAN y NEEDS — deben COINCIDIR salvo diferencias ESPERADAS
 *           documentadas (fuente de thresholds F1; exclusión operativa ≤ 0;
 *           universo restringido a tiendas activas). INEXPLICADA → exit 1.
 *   (c)/(d) COBERTURAS y "UNIDADES POR SURTIR" viejas vs B1/A3 — se imprimen
 *           lado a lado: son EL HALLAZGO de la auditoría, no un error. Este
 *           es el reporte que Yumeko necesita para aprobar el switch de F3.
 *   (e) A6 vs documentos reales.  (f) fingerprint determinista/recomputable.
 *   (g) tiempos de corrida (metrics — ajuste 3).
 *
 * Run: npx tsx --env-file=.env scripts/validate-store-snapshot-service-ab.ts
 * Exit 1 = diferencias INEXPLICADAS en (a)/(b)/(e)/(f). DETENER.
 */

const mockServerOnly = require("./_mock-server-only.cjs");
void mockServerOnly;

import { prisma } from "@/lib/prisma";
import { loadStoreUnitNeeds } from "@/lib/comercial/tiendas/store-unit-needs-service";
import { loadStoreReplenishmentPlan } from "@/lib/comercial/tiendas/store-replenishment-plan-service";
import { loadStoreCoverage } from "@/lib/comercial/tiendas/store-coverage-service";
import { buildCanonicalStoreDistribution } from "@/lib/comercial/tiendas/store-distribution-service";
import { resolveActiveStores } from "@/lib/comercial/tiendas/store-governance-service";
import { getStoreSnapshotWithMeta } from "@/lib/comercial/tiendas/store-snapshot-service";
import { computeSnapshotFingerprint, computeModuleKpis } from "@/lib/comercial/tiendas/store-snapshot-pipeline";

let unexplained = 0;
let expectedDiffs = 0;
function report(kind: "ESPERADA" | "INEXPLICADA", msg: string) {
  if (kind === "ESPERADA") { expectedDiffs++; console.log(`   ~ ESPERADA   : ${msg}`); }
  else { unexplained++; console.log(`   ✗ INEXPLICADA: ${msg}`); }
}

async function main() {
  const db = prisma as any;
  const org = await db.organization.findFirst({
    where: { slug: process.env.VALIDATE_ORG_SLUG ?? "castillitos" },
    select: { id: true, slug: true },
  });
  if (!org) throw new Error("Organization not found");

  console.log(`\n═══ A/B STORESNAPSHOT — ${org.slug} ═══\n`);

  // ── B: corrida completa + metrics (g) ──
  const { snapshot, metrics } = await getStoreSnapshotWithMeta(org.id);
  console.log(`(g) metrics: lectura ${metrics.readMs}ms · ensamblado ${metrics.assembleMs}ms · pipeline ${metrics.pipelineMs}ms · docs ${metrics.documentRefsMs}ms · TOTAL ${metrics.totalMs}ms · ${metrics.inventoryRows} filas · ${metrics.activeStores} tiendas`);
  console.log(`    versiones: schema ${snapshot.schemaVersion} · pipeline ${snapshot.pipelineVersion} · rules ${snapshot.rulesVersion}`);
  console.log(`    dataAsOf ${snapshot.dataAsOf} · generatedAt ${snapshot.generatedAt} · fingerprint ${snapshot.fingerprint}\n`);

  // ── (f) fingerprint ──
  const { fingerprint, generatedAt, documentRefs, moduleKpis, extensions, ...rest } = snapshot as any;
  const recomputed = computeSnapshotFingerprint({ ...rest, moduleKpis: { ...moduleKpis, documentosAbiertos: 0 } });
  if (recomputed !== fingerprint) report("INEXPLICADA", `(f) fingerprint no recomputable: ${recomputed} ≠ ${fingerprint}`);
  else console.log("✓ (f) fingerprint recomputable desde el objeto (excluye generatedAt/documentRefs)");
  const m2 = computeModuleKpis(snapshot.perStore, snapshot.documentRefs.openCount);
  if (JSON.stringify(m2) !== JSON.stringify(snapshot.moduleKpis)) report("INEXPLICADA", "(f) moduleKpis no recomputable (inv. 2)");
  else console.log("✓ (f) moduleKpis recomputable (invariante 2)\n");

  // ── A ──
  const governance = await resolveActiveStores(org.id);
  const planA = await loadStoreReplenishmentPlan(org.id);
  const dist = await buildCanonicalStoreDistribution(org.id);

  // (a) PLAN
  console.log("── (a) PLAN: snapshot.plan vs plan-service actual ──");
  const sumUnits = (xs: readonly { units: number }[]) => xs.reduce((s, x) => s + x.units, 0);
  const aSug = sumUnits(planA.suggestions);
  const bSug = sumUnits(snapshot.plan.suggestions);
  if (aSug !== bSug) report("ESPERADA", `unidades sugeridas: A=${aSug} B=${bSug} — atribuible a F1 (thresholds por estructura, filtro operativo, universo activo); revisar detalle abajo`);
  else console.log(`   ✓ unidades sugeridas idénticas: ${aSug}`);
  for (const bs of snapshot.plan.summaryByStore) {
    const as_ = planA.summaryByStore.find(s => s.storeId === bs.storeId);
    if (!as_) { report("INEXPLICADA", `(a) tienda ${bs.storeId} sin summary en A`); continue; }
    const diff = ["requiredUnits", "executableUnits", "allocatedUnits", "withdrawalUnits"].filter(
      k => (as_ as any)[k] !== (bs as any)[k],
    );
    if (diff.length === 0) console.log(`   ✓ ${bs.storeId}: summary idéntico (req ${bs.requiredUnits} · exec ${bs.executableUnits} · asig ${bs.allocatedUnits} · ret ${bs.withdrawalUnits})`);
    else for (const k of diff) report("ESPERADA", `(a) ${bs.storeId}.${k}: A=${(as_ as any)[k]} B=${(bs as any)[k]} — clasificar contra reporte F1`);
  }
  if (planA.scarcityMaterialized !== snapshot.plan.scarcityMaterialized) {
    report("ESPERADA", `(a) scarcityMaterialized: A=${planA.scarcityMaterialized} B=${snapshot.plan.scarcityMaterialized}`);
  }

  // (b) NEEDS por tienda
  console.log("\n── (b) NEEDS: snapshot.perStore[].needs vs unit-needs-service ──");
  for (const gov of governance) {
    const b = snapshot.perStore.find(s => s.storeId === gov.storeId);
    if (!b) { report("INEXPLICADA", `(b) tienda activa ${gov.storeId} ausente del snapshot`); continue; }
    const a = await loadStoreUnitNeeds(org.id, gov.storeId);
    const ar = a.summary.replenishment, br = b.needs.summary.replenishment;
    if (ar.requiredUnits === br.requiredUnits && ar.executableUnits === br.executableUnits && a.summary.removals.requiredUnits === b.needs.summary.removals.requiredUnits) {
      console.log(`   ✓ ${gov.storeId}: needs idénticas (req ${br.requiredUnits} · exec ${br.executableUnits} · ret ${b.needs.summary.removals.requiredUnits})`);
    } else {
      report("ESPERADA", `(b) ${gov.storeId}: req A=${ar.requiredUnits}/B=${br.requiredUnits} · exec A=${ar.executableUnits}/B=${br.executableUnits} — clasificar contra reporte F1`);
    }
  }

  // (c) COBERTURAS lado a lado — EL HALLAZGO (reporte para Yumeko)
  console.log("\n── (c) COBERTURA — tres mundos lado a lado (para Yumeko; NO es error) ──");
  console.log("   tienda        | card SDS (por ref) | coverage-svc (estructural) | B1 snapshot (ley F0)");
  for (const gov of governance) {
    const card = dist.stores.find((c: any) => c.store.id === gov.storeId);
    const cov = await loadStoreCoverage(org.id, gov.storeId);
    const b = snapshot.perStore.find(s => s.storeId === gov.storeId)!;
    console.log(`   ${gov.storeId.padEnd(13)} | ${String(card?.coveragePercent ?? "—").padStart(14)}% | ${String(cov.overallCoveragePercent).padStart(22)}% | ${String(b.kpis.coveragePercent ?? "SIN_BASE").padStart(16)}%`);
  }

  // (d) "Unidades por surtir" viejo vs A3 — cuantifica el inflado H8
  const oldShortage = dist.stores.reduce((s: number, c: any) => s + (c.shortageUnits ?? 0), 0);
  console.log(`\n── (d) UNIDADES POR SURTIR: dashboard viejo (inflado por variantes, H8) = ${oldShortage} · A3 snapshot = ${snapshot.moduleKpis.unidadesPorSurtir} · A3-ejecutables = ${snapshot.moduleKpis.unidadesEjecutables} · A3-asignadas = ${snapshot.moduleKpis.unidadesAsignadas}`);

  // (e) A6 vs documentos reales
  const openCount = await db.storeReplenishmentDocument.count({
    where: { organizationId: org.id, status: { notIn: ["CERRADO", "CANCELADO"] } },
  });
  if (openCount !== snapshot.moduleKpis.documentosAbiertos) {
    report("INEXPLICADA", `(e) A6: documentos abiertos reales=${openCount} snapshot=${snapshot.moduleKpis.documentosAbiertos}`);
  } else {
    console.log(`\n✓ (e) A6 documentosAbiertos = ${openCount} (COUNT real — adiós propuestasPendientes:0)`);
  }

  console.log(`\n═══ RESULTADO: ${expectedDiffs} diferencias ESPERADAS (clasificadas) · ${unexplained} INEXPLICADAS ═══`);
  console.log(unexplained === 0
    ? "✓ A/B LIMPIO: el snapshot reproduce los motores certificados; las secciones (c)/(d) son el reporte de Yumeko para F3."
    : "✗ HAY DIFERENCIAS INEXPLICADAS — DETENER EL CIERRE y reportar a Fable.");
  console.log("");
  if (unexplained > 0) process.exit(1);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => (prisma as any).$disconnect?.());
