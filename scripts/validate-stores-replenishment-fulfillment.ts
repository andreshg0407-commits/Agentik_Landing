/**
 * scripts/validate-stores-replenishment-fulfillment.ts
 *
 * AGENTIK-STORES-REPLENISHMENT-FULFILLMENT-01 — DB validation gate.
 *
 * Requiere la migración aplicada. Verifica sobre un documento real:
 *   1. Ciclo feliz completo BORRADOR→…→CERRADO: 5 transiciones, 5 eventos
 *      atómicos, en orden cronológico de servidor.
 *   2. Transición inválida NO persiste nada (ni estado ni evento).
 *   3. Carrera: repetir una transición ya aplicada → StaleDocumentStateError
 *      con el estado real; cero eventos duplicados.
 *   4. IDEMPOTENCIA: mismo idempotencyKey → replayed=true, mismo evento,
 *      cero eventos nuevos (retry HTTP seguro).
 *   5. Estado terminal rechaza comandos.
 *   6. snapshot/fingerprint/consecutivo INTACTOS tras el ciclo completo;
 *      re-export HTML muestra el estado nuevo con el mismo contenido.
 *   7. Multi-tenant: documento de otra org ≡ inexistente (mismo error).
 *   8. Evento⇔estado: #eventos === #transiciones aplicadas, siempre.
 *
 * Sale con código 1 si alguna verificación falla — DETENER CIERRE.
 *
 * Run: npx tsx --env-file=.env scripts/validate-stores-replenishment-fulfillment.ts
 */

const mockServerOnly = require("./_mock-server-only.cjs");
void mockServerOnly;

import { prisma } from "@/lib/prisma";
import { createReplenishmentDocuments, getReplenishmentDocument, exportReplenishmentDocument } from "@/lib/comercial/tiendas/store-replenishment-document-service";
import {
  transitionReplenishmentDocument,
  listDocumentEvents,
  StaleDocumentStateError,
  DocumentNotFoundError,
} from "@/lib/comercial/tiendas/store-replenishment-workflow-service";
import { InvalidWorkflowTransitionError } from "@/lib/comercial/tiendas/store-replenishment-workflow-engine";

const ACTOR = { actorId: "validacion-bot", actorDisplayName: "Script de Validación" };

async function main() {
  const db = prisma as any;
  const org = await db.organization.findFirst({
    where: { slug: process.env.VALIDATE_ORG_SLUG ?? "castillitos" },
    select: { id: true, slug: true },
  });
  if (!org) throw new Error("Organization not found (set VALIDATE_ORG_SLUG)");

  console.log(`\n═══ STORES-REPLENISHMENT-FULFILLMENT-01 — validación (${org.slug}) ═══\n`);
  let failures = 0;

  // Documento fresco para el ciclo
  const created = await createReplenishmentDocuments(org.id, ACTOR.actorId);
  if (created.documents.length === 0) throw new Error("Sin documentos para validar (plan vacío)");
  const doc = created.documents[0];
  console.log(`Documento de prueba: ${doc.documentNumber} (${doc.storeName}) · batch ${doc.batchId.slice(0, 8)}… · reused=${created.reusedExistingBatch}`);

  const before = await getReplenishmentDocument(org.id, doc.id);
  const fingerprintBefore = before!.record.planFingerprint;
  const snapshotUnitsBefore = before!.snapshot.suggestions.reduce((t, s) => t + s.units, 0);

  // 2. Transición inválida no persiste nada
  try {
    await transitionReplenishmentDocument(org.id, doc.id, "DESPACHAR", ACTOR);
    failures++; console.log("✗ DESPACHAR desde BORRADOR debió rechazarse");
  } catch (e) {
    if (!(e instanceof InvalidWorkflowTransitionError)) { failures++; console.log("✗ error inesperado en transición inválida"); }
  }
  if ((await listDocumentEvents(org.id, doc.id)).length !== 0) {
    failures++; console.log("✗ La transición inválida dejó eventos");
  } else console.log("✓ Transición inválida: cero persistencia");

  // 1. Ciclo feliz con idempotencia en APROBAR
  const aprobado = await transitionReplenishmentDocument(org.id, doc.id, "APROBAR", ACTOR, { idempotencyKey: "aprobar-1" });
  if (aprobado.replayed) { failures++; console.log("✗ Primera ejecución marcada como replay"); }

  // 4. Retry HTTP con el mismo key → replay, cero eventos nuevos
  const retry = await transitionReplenishmentDocument(org.id, doc.id, "APROBAR", ACTOR, { idempotencyKey: "aprobar-1" });
  if (!retry.replayed || retry.event.id !== aprobado.event.id) {
    failures++; console.log("✗ Idempotencia rota: el retry no devolvió el mismo evento");
  } else console.log("✓ Idempotencia: retry con el mismo key → mismo evento, cero duplicados");

  // 3. Carrera: repetir sin key una transición ya aplicada
  try {
    await transitionReplenishmentDocument(org.id, doc.id, "APROBAR", ACTOR);
    failures++; console.log("✗ Segunda aprobación sin key debió fallar por estado obsoleto");
  } catch (e) {
    if (e instanceof StaleDocumentStateError || e instanceof InvalidWorkflowTransitionError) {
      console.log(`✓ Carrera/reintento sin key: rechazo tipado (${(e as any).code})`);
    } else { failures++; console.log("✗ error inesperado en carrera"); }
  }

  // Resto del ciclo con metadata
  await transitionReplenishmentDocument(org.id, doc.id, "INICIAR_PREPARACION", ACTOR, { metadata: { warehouse: "B01" } });
  await transitionReplenishmentDocument(org.id, doc.id, "DESPACHAR", ACTOR, { metadata: { tracking: "GUIA-123" } });
  await transitionReplenishmentDocument(org.id, doc.id, "RECIBIR", ACTOR, { note: "Sin diferencias" });
  const cerrado = await transitionReplenishmentDocument(org.id, doc.id, "CERRAR", ACTOR);
  if (cerrado.status !== "CERRADO") { failures++; console.log("✗ El ciclo no terminó en CERRADO"); }

  // 8 + orden cronológico
  const events = await listDocumentEvents(org.id, doc.id);
  if (events.length !== 5) { failures++; console.log(`✗ Eventos: ${events.length}, esperados 5 (evento⇔estado roto)`); }
  const sorted = [...events].every((e, i, a) => i === 0 || a[i - 1].occurredAt <= e.occurredAt);
  if (!sorted) { failures++; console.log("✗ Eventos fuera de orden cronológico"); }
  const chain = events.map(e => `${e.fromStatus}→${e.toStatus}`).join(" · ");
  console.log(`✓ Ciclo completo: ${chain}`);
  if (events.some(e => e.workflowVersion !== 1 || !e.actorId || !e.batchId)) {
    failures++; console.log("✗ Eventos sin workflowVersion/actorId/batchId");
  }

  // 5. Terminal rechaza comandos
  try {
    await transitionReplenishmentDocument(org.id, doc.id, "APROBAR", ACTOR);
    failures++; console.log("✗ CERRADO aceptó un comando");
  } catch (e) {
    if (e instanceof InvalidWorkflowTransitionError) console.log("✓ Terminal: CERRADO rechaza comandos");
    else { failures++; console.log("✗ error inesperado en terminal"); }
  }

  // 6. Snapshot intacto + re-export con estado nuevo
  const after = await getReplenishmentDocument(org.id, doc.id);
  const snapshotUnitsAfter = after!.snapshot.suggestions.reduce((t, s) => t + s.units, 0);
  if (after!.record.planFingerprint !== fingerprintBefore || snapshotUnitsAfter !== snapshotUnitsBefore ||
      after!.record.documentNumber !== doc.documentNumber) {
    failures++; console.log("✗ El workflow alteró snapshot/fingerprint/consecutivo");
  } else console.log("✓ snapshot, fingerprint y consecutivo INTACTOS tras el ciclo");

  const html = await exportReplenishmentDocument(org.id, doc.id, "html");
  const htmlText = Buffer.from(html!.contentBase64, "base64").toString("utf8");
  if (!htmlText.includes("Cerrado")) { failures++; console.log("✗ Re-export no muestra el estado nuevo"); }
  else if (!htmlText.includes(doc.documentNumber)) { failures++; console.log("✗ Re-export perdió el consecutivo"); }
  else console.log("✓ Re-export HTML: estado nuevo (Cerrado) con el mismo contenido congelado");

  // 7. Multi-tenant ≡ inexistente
  let errFake = "", errForeign = "";
  try { await transitionReplenishmentDocument(org.id, "doc-inexistente", "APROBAR", ACTOR); }
  catch (e) { errFake = (e as any).code; }
  try { await transitionReplenishmentDocument("org-ajena", doc.id, "APROBAR", ACTOR); }
  catch (e) { errForeign = (e as any).code; }
  if (errFake !== "DOCUMENT_NOT_FOUND" || errForeign !== "DOCUMENT_NOT_FOUND") {
    failures++; console.log(`✗ Multi-tenant filtra existencia (${errFake} vs ${errForeign})`);
  } else console.log("✓ Multi-tenant: documento ajeno ≡ inexistente (mismo error)");

  console.log(failures === 0
    ? "\n✓ Workflow certificado: ciclo completo, atomicidad evento⇔estado, idempotencia, terminales, snapshot intacto y aislamiento."
    : `\n✗ ${failures} verificaciones fallidas — DETENER CIERRE.`);
  console.log("\n═══ Fin de validación ═══\n");
  if (failures > 0) process.exit(1);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => (prisma as any).$disconnect?.());
