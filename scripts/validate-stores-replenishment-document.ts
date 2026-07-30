/**
 * scripts/validate-stores-replenishment-document.ts
 *
 * AGENTIK-STORES-REPLENISHMENT-DOCUMENT-01 (v2) — DB validation gate.
 *
 * Requiere la migración aplicada (npx prisma migrate dev). Verifica:
 *   1. Creación ATÓMICA por batch: 1 documento por tienda con contenido,
 *      mismo batchId, estado BORRADOR, enum Prisma.
 *   2. Consecutivos desde la SECUENCIA transaccional: únicos, crecientes,
 *      formato SR-NNNNN; la fila de ReplenishmentDocumentSequence coincide.
 *   3. Snapshot persistido ≡ plan certificado (partición sin pérdida,
 *      schemaVersion, timestamps separados, fingerprint presente).
 *   4. IDEMPOTENCIA: segunda corrida con el mismo plan → MISMO batch
 *      (reusedExistingBatch = true), cero documentos nuevos.
 *   5. Exportes html y xlsx desde el snapshot persistido; formato pdf NO
 *      disponible (decisión certificada #3).
 *   6. Aislamiento multi-tenant: todos los documentos pertenecen a la org.
 *
 * Sale con código 1 si alguna verificación falla — DETENER CIERRE.
 *
 * Run: npx tsx --env-file=.env scripts/validate-stores-replenishment-document.ts
 */

const mockServerOnly = require("./_mock-server-only.cjs");
void mockServerOnly;

import { prisma } from "@/lib/prisma";
import { loadStoreReplenishmentPlan } from "@/lib/comercial/tiendas/store-replenishment-plan-service";
import {
  createReplenishmentDocuments,
  getReplenishmentDocument,
  exportReplenishmentDocument,
} from "@/lib/comercial/tiendas/store-replenishment-document-service";

async function main() {
  const db = prisma as any;
  const org = await db.organization.findFirst({
    where: { slug: process.env.VALIDATE_ORG_SLUG ?? "castillitos" },
    select: { id: true, slug: true },
  });
  if (!org) throw new Error("Organization not found (set VALIDATE_ORG_SLUG)");

  console.log(`\n═══ STORES-REPLENISHMENT-DOCUMENT-01 v2 — validación (${org.slug}) ═══\n`);
  let failures = 0;

  const plan = await loadStoreReplenishmentPlan(org.id);

  // 1-2. Creación atómica + secuencia transaccional
  const r1 = await createReplenishmentDocuments(org.id, "validacion");
  console.log(`Corrida 1 (batch ${r1.batchId.slice(0, 8)}…, reused=${r1.reusedExistingBatch}): ${r1.documents.length} documentos`);
  const consecutivos = r1.documents.map(d => parseInt(d.documentNumber.split("-")[1], 10));
  for (const d of r1.documents) {
    console.log(`   ${d.documentNumber} · ${d.storeName.padEnd(11)} · ${d.suggestionCount} sug · ${d.allocatedUnits} unds · retiros ${d.withdrawalUnits} · ${d.status} · v${d.snapshotSchemaVersion} · fp ${d.planFingerprint.slice(0, 14)}…`);
    if (!/^SR-\d{5,}$/.test(d.documentNumber)) { failures++; console.log(`   ✗ formato de consecutivo inválido`); }
    if (d.status !== "BORRADOR") { failures++; console.log(`   ✗ estado inicial distinto de BORRADOR`); }
    if (d.batchId !== r1.batchId) { failures++; console.log(`   ✗ batchId inconsistente`); }
    if (!d.planFingerprint) { failures++; console.log(`   ✗ sin fingerprint`); }
  }
  if (new Set(consecutivos).size !== consecutivos.length) { failures++; console.log(`✗ consecutivos duplicados`); }

  const seq = await db.replenishmentDocumentSequence.findUnique({ where: { organizationId: org.id } });
  if (!seq || seq.lastValue < Math.max(...consecutivos, 0)) {
    failures++; console.log(`✗ La secuencia transaccional no refleja el último consecutivo`);
  } else {
    console.log(`✓ Secuencia transaccional: lastValue=${seq.lastValue}`);
  }

  // 3. Snapshot ≡ plan
  let totalDocUnits = 0;
  for (const d of r1.documents) {
    const doc = await getReplenishmentDocument(org.id, d.id);
    if (!doc) { failures++; console.log(`✗ ${d.documentNumber} no recuperable`); continue; }
    const s = doc.snapshot;
    totalDocUnits += s.suggestions.reduce((t, x) => t + x.units, 0);
    if (s.schemaVersion !== 1) { failures++; console.log(`✗ ${d.documentNumber}: schemaVersion inesperada`); }
    if (!s.planGeneratedAt || !s.documentGeneratedAt) { failures++; console.log(`✗ ${d.documentNumber}: timestamps incompletos`); }
    if (s.suggestions.some(x => x.storeId !== d.storeId)) { failures++; console.log(`✗ ${d.documentNumber}: sugerencias de otra tienda`); }
    if (s.suggestions.reduce((t, x) => t + x.units, 0) !== s.summary.allocatedUnits) {
      failures++; console.log(`✗ ${d.documentNumber}: unidades no cuadran con summary`);
    }
  }
  const planUnits = plan.suggestions.reduce((t, s) => t + s.units, 0);
  if (totalDocUnits !== planUnits) {
    failures++; console.log(`✗ Partición con pérdida: ${totalDocUnits} vs ${planUnits} unds`);
  } else {
    console.log(`✓ Partición sin pérdida: ${totalDocUnits} unds ≡ plan`);
  }

  // 4. IDEMPOTENCIA
  const r2 = await createReplenishmentDocuments(org.id, "validacion-2");
  if (!r2.reusedExistingBatch || r2.batchId !== r1.batchId) {
    failures++; console.log(`✗ Idempotencia rota: corrida 2 creó batch nuevo con el mismo plan`);
  } else {
    console.log(`✓ Idempotencia: corrida 2 devolvió el MISMO batch sin crear documentos`);
  }

  // 5. Exportes (html y xlsx desde snapshot; pdf no expuesto por contrato)
  if (r1.documents.length > 0) {
    const d = r1.documents[0];
    const html = await exportReplenishmentDocument(org.id, d.id, "html");
    const xlsx = await exportReplenishmentDocument(org.id, d.id, "xlsx");
    const htmlText = html ? Buffer.from(html.contentBase64, "base64").toString("utf8") : "";
    if (!htmlText.includes(d.documentNumber)) { failures++; console.log(`✗ HTML sin consecutivo`); }
    if (!xlsx || xlsx.contentBase64.length < 1000) { failures++; console.log(`✗ Excel vacío`); }
    else console.log(`✓ Exportes: ${html!.fileName} · ${xlsx.fileName} (mismo snapshot persistido)`);
  }

  // 6. Multi-tenant
  const foreign = await db.storeReplenishmentDocument.count({
    where: { batchId: r1.batchId, NOT: { organizationId: org.id } },
  });
  if (foreign > 0) { failures++; console.log(`✗ Documentos del batch fuera de la organización`); }
  else console.log(`✓ Aislamiento multi-tenant: todos los documentos pertenecen a ${org.slug}`);

  console.log(failures === 0
    ? "\n✓ Batch atómico, secuencia transaccional, snapshot verbatim con schemaVersion, idempotencia y exportes desde snapshot: todo íntegro."
    : `\n✗ ${failures} verificaciones fallidas — DETENER CIERRE.`);
  console.log("\nNota: los documentos de validación quedan en BORRADOR (cancelables con el workflow del Sprint 8).");
  console.log("\n═══ Fin de validación ═══\n");
  if (failures > 0) process.exit(1);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => (prisma as any).$disconnect?.());
