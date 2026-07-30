/**
 * scripts/validate-store-snapshot-assembler-ab.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F1: validación A/B del StoreSnapshotAssembler
 * contra el mundo actual, sobre la base REAL.
 *
 *   A = mundo actual: items de getCanonicalStoreDetail (store-distribution-service)
 *       y estructuras del motor certificado vía loadStoreCoverage.
 *   B = mundo nuevo: loadSnapshotSource → assembleSnapshotSource.
 *
 * Compara por tienda activa: unidades totales, referencias, unidades agregadas
 * por estructura y reglas efectivas. Clasifica cada diferencia:
 *   ESPERADA  — causa documentada en el diseño F1 (cambio de fuente de
 *               thresholds, filas dropped ahora contadas).
 *   INEXPLICADA — cualquier otra → exit 1 (DETENER el cierre).
 *
 * Ley operativa (ajuste F1): el source aplica dedup PIL (suma + updatedAt más
 * reciente) y excluye disponibilidad <= 0 ANTES del assembler; este script
 * verifica que en B no quede ninguna referencia con 0 unidades.
 *
 * Verificación de fingerprint (ajuste 5 del arquitecto):
 *   dos ensamblados de la MISMA lectura → fingerprint idéntico, y el
 *   fingerprint es recomputable desde el propio objeto (integridad).
 *
 * Run: npx tsx --env-file=.env scripts/validate-store-snapshot-assembler-ab.ts
 * Exit 1 = diferencias inexplicadas o fingerprint inconsistente. DETENER.
 */

const mockServerOnly = require("./_mock-server-only.cjs");
void mockServerOnly;

import { prisma } from "@/lib/prisma";
import { getCanonicalStoreDetail } from "@/lib/comercial/tiendas/store-distribution-service";
import { loadStoreCoverage } from "@/lib/comercial/tiendas/store-coverage-service";
import { resolveActiveStores } from "@/lib/comercial/tiendas/store-governance-service";
import { loadSnapshotSource } from "@/lib/comercial/tiendas/store-snapshot-source-service";
import {
  assembleSnapshotSource,
  computeAssembledFingerprint,
} from "@/lib/comercial/tiendas/store-snapshot-assembler";

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

  console.log(`\n═══ A/B ASSEMBLER — ${org.slug} ═══\n`);

  // ── B: una lectura, un ensamblado ──
  const t0 = Date.now();
  const sourceRows = await loadSnapshotSource(org.id);
  const tRead = Date.now() - t0;
  const t1 = Date.now();
  const assembled = assembleSnapshotSource(sourceRows);
  const tAsm = Date.now() - t1;
  console.log(`Lectura source: ${tRead} ms · ensamblado: ${tAsm} ms · filas: ${sourceRows.inventoryRows.length}`);
  console.log(`dataAsOf: ${assembled.dataAsOf} · fingerprint: ${assembled.fingerprint}`);
  console.log(`dropped: ${assembled.dropped.count} ${JSON.stringify(assembled.dropped.byReason)} · sin estructura: ${assembled.unresolvedStructure.length}\n`);

  // ── Fingerprint (ajuste 5): determinismo + recomputabilidad ──
  const assembled2 = assembleSnapshotSource(sourceRows);
  if (assembled2.fingerprint !== assembled.fingerprint) {
    report("INEXPLICADA", `fingerprint no determinista: ${assembled.fingerprint} ≠ ${assembled2.fingerprint}`);
  } else {
    console.log(`✓ Fingerprint determinista (dos ensamblados de la misma lectura coinciden)`);
  }
  const { fingerprint: fp, ...payload } = assembled as any;
  if (computeAssembledFingerprint(payload) !== fp) {
    report("INEXPLICADA", "fingerprint no recomputable desde el propio objeto");
  } else {
    console.log(`✓ Fingerprint recomputable desde el objeto\n`);
  }

  // ── A vs B por tienda activa ──
  const governance = await resolveActiveStores(org.id);
  for (const gov of governance) {
    const storeId = gov.storeId;
    console.log(`── ${gov.displayName} (${storeId}) ──`);

    const bStore = assembled.stores.find(s => s.storeId === storeId);
    if (!bStore) { report("INEXPLICADA", `tienda activa ${storeId} ausente del ensamblado`); continue; }

    const detail = await getCanonicalStoreDetail(org.id, storeId);
    if (!detail) { report("INEXPLICADA", `mundo actual sin detail para ${storeId}`); continue; }

    // A: consolidar filas variante por referencia (misma ley del assembler)
    const aByRef = new Map<string, number>();
    for (const it of detail.items) {
      aByRef.set(it.referenceCode, (aByRef.get(it.referenceCode) ?? 0) + it.currentUnits);
    }
    const aTotal = [...aByRef.values()].reduce((s, u) => s + u, 0);

    // Totales
    if (aTotal !== bStore.totalUnits) {
      report("INEXPLICADA", `unidades totales: A=${aTotal} B=${bStore.totalUnits}`);
    } else {
      console.log(`   ✓ unidades totales: ${aTotal}`);
    }

    // Referencias (comparación con >0 para igualar el filtro del índice actual)
    const bByRef = new Map(bStore.items.map(i => [i.referenceCode, i.units]));
    const aRefsPos = [...aByRef.entries()].filter(([, u]) => u > 0);
    let refDiffs = 0;
    for (const [ref, aUnits] of aRefsPos) {
      const bUnits = bByRef.get(ref);
      if (bUnits === undefined) { report("INEXPLICADA", `ref ${ref} (A=${aUnits} uds) ausente en B`); refDiffs++; }
      else if (bUnits !== aUnits) { report("INEXPLICADA", `ref ${ref}: A=${aUnits} B=${bUnits}`); refDiffs++; }
    }
    for (const [ref, bUnits] of bByRef) {
      if (!aByRef.has(ref)) {
        // El universo A ya viene de las mismas bodegas; una ref extra en B es dato nuevo real
        report("INEXPLICADA", `ref ${ref} (B=${bUnits} uds) ausente en A`);
        refDiffs++;
      }
    }
    // LEY OPERATIVA (ajuste F1): disponibilidad <= 0 queda fuera del snapshot.
    // Una ref con 0 unidades en B significa que el filtro operativo no corrió.
    const zeroRefs = bStore.items.filter(i => i.units === 0).length;
    if (zeroRefs > 0) report("INEXPLICADA", `${zeroRefs} refs con 0 uds en B — el filtro operativo (units <= 0) no está aplicado`);
    if (refDiffs === 0) console.log(`   ✓ referencias: ${aRefsPos.length} coinciden`);

    // Estructuras: unidades agregadas por punto del derrotero
    const coverage = await loadStoreCoverage(org.id, storeId);
    const bByStructure = new Map<string, number>();
    for (const item of bStore.items) {
      if (item.structureKey && item.units > 0) {
        bByStructure.set(item.structureKey, (bByStructure.get(item.structureKey) ?? 0) + item.units);
      }
    }
    let structDiffs = 0;
    for (const st of coverage.structures) {
      const aUnits = st.totalStoreUnits;
      const bUnits = bByStructure.get(st.structureKey) ?? 0;
      if (aUnits !== bUnits) {
        // Merges CS (BUZO/CAMIBUSO) usan claves múltiples → mismas unidades; una
        // diferencia aquí es asignación de estructura distinta = revisar.
        report("INEXPLICADA", `estructura ${st.structureKey}: A=${aUnits} B=${bUnits}`);
        structDiffs++;
      }
    }
    if (structDiffs === 0) console.log(`   ✓ estructuras: ${coverage.structures.length} con unidades idénticas`);

    // Reglas efectivas: B (por estructura desde políticas) vs A (max-de-variantes)
    const bRules = assembled.structureRules.filter(r => r.storeId === storeId);
    let ruleDiffs = 0;
    for (const st of coverage.structures) {
      const bRule = bRules.find(r => r.structureKey === st.structureKey);
      if (!bRule) { report("INEXPLICADA", `estructura ${st.structureKey} sin regla en B`); ruleDiffs++; continue; }
      const aRule = st.unitRule;
      if (aRule && (bRule.minUnits !== aRule.minUnits || bRule.idealUnits !== aRule.idealUnits)) {
        report("ESPERADA", `regla ${st.structureKey}: A=${aRule.minUnits}/${aRule.idealUnits} B=${bRule.minUnits}/${bRule.idealUnits} [${bRule.source}] — cambio de fuente de thresholds documentado en el diseño F1`);
        ruleDiffs++;
      }
    }
    if (ruleDiffs === 0) console.log(`   ✓ reglas efectivas: idénticas a las del motor actual`);
    console.log("");
  }

  console.log(`═══ RESULTADO: ${expectedDiffs} diferencias ESPERADAS (documentadas) · ${unexplained} INEXPLICADAS ═══`);
  console.log(unexplained === 0
    ? "✓ A/B LIMPIO: el assembler reproduce el mundo actual salvo las diferencias documentadas en el diseño F1."
    : "✗ HAY DIFERENCIAS INEXPLICADAS — DETENER EL CIERRE y reportar a Fable.");
  console.log("");
  if (unexplained > 0) process.exit(1);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => (prisma as any).$disconnect?.());
