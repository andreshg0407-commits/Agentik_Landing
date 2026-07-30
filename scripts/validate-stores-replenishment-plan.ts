/**
 * scripts/validate-stores-replenishment-plan.ts
 *
 * AGENTIK-STORES-REPLENISHMENT-ENGINE-01 — DB validation gate.
 *
 * Construye el plan de surtido real (4 tiendas, pool compartido) y verifica:
 *   1. Contabilidad del pool: eligible = allocated + remaining en TODA ref.
 *   2. Techos en cascada: por tienda, allocated ≤ executable ≤ required.
 *   3. Retiros nunca sumados a reposición.
 *   4. STORE_PRIORITY solo si hubo escasez materializada.
 *   5. Coherencia con el Sprint 5: executable del plan ≡ Σ executable de
 *      las necesidades de reposición.
 *
 * Sale con código 1 si alguna verificación falla — DETENER CIERRE.
 *
 * Run: npx tsx --env-file=.env scripts/validate-stores-replenishment-plan.ts
 */

const mockServerOnly = require("./_mock-server-only.cjs");
void mockServerOnly;

import { prisma } from "@/lib/prisma";
import { loadStoreUnitNeeds } from "@/lib/comercial/tiendas/store-unit-needs-service";
import { loadStoreReplenishmentPlan, buildCanonicalStorePriorityOrder } from "@/lib/comercial/tiendas/store-replenishment-plan-service";

async function main() {
  const db = prisma as any;
  const org = await db.organization.findFirst({
    where: { slug: process.env.VALIDATE_ORG_SLUG ?? "castillitos" },
    select: { id: true, slug: true },
  });
  if (!org) throw new Error("Organization not found (set VALIDATE_ORG_SLUG)");

  console.log(`\n═══ STORES-REPLENISHMENT-ENGINE-01 — validación (${org.slug}) ═══\n`);

  const { order } = buildCanonicalStorePriorityOrder();
  console.log(`Orden canónico de tiendas: ${order.join(" → ")} (prioridad material: Centro/Caldas solo bajo escasez)\n`);

  const plan = await loadStoreReplenishmentPlan(org.id);
  let failures = 0;

  // 1. Contabilidad del pool
  let poolRefs = 0;
  for (const [ref, u] of plan.poolUsage) {
    poolRefs++;
    if (u.eligible !== u.allocated + u.remaining) {
      failures++;
      console.log(`✗ CONTABILIDAD rota en ${ref}: ${u.eligible} ≠ ${u.allocated} + ${u.remaining}`);
    }
  }

  // 2-3. Techos y separación de direcciones por tienda
  console.log(`── Resumen por tienda ──`);
  for (const st of plan.summaryByStore) {
    console.log(`   ${st.storeId.toUpperCase().padEnd(11)} req ${String(st.requiredUnits).padStart(5)} · exec ${String(st.executableUnits).padStart(5)} · asig ${String(st.allocatedUnits).padStart(5)} · pendAsig ${String(st.allocationPendingUnits).padStart(4)} · pendNegocio ${String(st.totalBusinessPendingUnits).padStart(5)} · retiros ${st.withdrawalUnits} · sugerencias ${st.suggestionCount}`);
    if (st.allocatedUnits > st.executableUnits || st.executableUnits > st.requiredUnits) {
      failures++;
      console.log(`   ✗ TECHOS rotos en ${st.storeId}`);
    }
    if (st.allocationPendingUnits !== st.executableUnits - st.allocatedUnits ||
        st.totalBusinessPendingUnits !== st.requiredUnits - st.allocatedUnits) {
      failures++;
      console.log(`   ✗ ARITMÉTICA de pendientes rota en ${st.storeId}`);
    }
  }

  // 4. STORE_PRIORITY solo bajo escasez
  const hasStorePriority = plan.suggestions.some(s => s.reasons.some(r => r.code === "STORE_PRIORITY"));
  if (hasStorePriority && !plan.scarcityMaterialized) {
    failures++;
    console.log(`✗ STORE_PRIORITY presente sin escasez materializada`);
  }

  // 5. Coherencia con Sprint 5
  for (const storeId of order) {
    const needs = await loadStoreUnitNeeds(org.id, storeId);
    const execSum = needs.needs
      .filter(n => n.action === "REPOSICION")
      .reduce((t, n) => t + (n.executableUnits ?? 0), 0);
    const st = plan.summaryByStore.find(s => s.storeId === storeId)!;
    if (st.executableUnits !== execSum) {
      failures++;
      console.log(`✗ INCOHERENCIA con Sprint 5 en ${storeId}: plan exec ${st.executableUnits} vs necesidades ${execSum}`);
    }
  }

  console.log(`\n── Plan ──`);
  console.log(`   Sugerencias: ${plan.suggestions.length} · Retiros: ${plan.withdrawals.length} · No asignadas: ${plan.unallocated.length}`);
  console.log(`   Pools de referencia: ${poolRefs} · Escasez materializada: ${plan.scarcityMaterialized ? "SÍ" : "NO"}`);

  const byReason = new Map<string, number>();
  for (const u of plan.unallocated) byReason.set(u.reason, (byReason.get(u.reason) ?? 0) + 1);
  for (const [reason, count] of byReason) console.log(`   unallocated ${reason}: ${count}`);

  console.log(`\n   Muestra de sugerencias explicadas (máx 5):`);
  for (const s of plan.suggestions.slice(0, 5)) {
    console.log(`   · ${s.storeId} ← ${s.referenceCode} ×${s.units} [${s.candidateType}]`);
    for (const r of s.reasons) console.log(`       ${r.code}: ${r.detail}`);
  }

  console.log(failures === 0
    ? "\n✓ Plan auditable: contabilidad del pool, techos en cascada, direcciones separadas y coherencia con Sprint 5 intactas."
    : `\n✗ ${failures} verificaciones fallidas — DETENER CIERRE.`);
  console.log("\n═══ Fin de validación ═══\n");
  if (failures > 0) process.exit(1);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => (prisma as any).$disconnect?.());
