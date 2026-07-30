/**
 * lib/comercial/tiendas/store-replenishment-document-service.ts
 *
 * AGENTIK-STORES-REPLENISHMENT-DOCUMENT-01 (v2) — Document loader/creator.
 * Ajustes certificados incorporados:
 *   - Creación ATÓMICA por batch: todos los documentos de una corrida nacen
 *     en UNA transacción (todo o nada; snapshot incluido — sin ventana
 *     create→update).
 *   - Secuencia TRANSACCIONAL (ReplenishmentDocumentSequence, increment
 *     atómico dentro de la misma transacción) — no count+1.
 *   - IDEMPOTENCIA: mismo contenido certificado (fingerprints canónicos por
 *     tienda) con el batch anterior aún íntegro en BORRADOR → se devuelve el
 *     batch existente; no se fabrican duplicados por doble clic.
 *   - Timestamps separados: planGeneratedAt (cálculo del plan) vs
 *     documentGeneratedAt (creación del documento).
 *   - EXPORTES exclusivamente desde el snapshot PERSISTIDO (nunca del plan
 *     vivo). Formatos: html | xlsx. `pdf` NO se expone hasta producir PDF
 *     binario real (decisión certificada #3).
 *   - Aislamiento multi-tenant: toda consulta filtra organizationId; la
 *     secuencia es por organización.
 *
 * CONDICIÓN CERTIFICADA: representación persistida del plan del Sprint 6 —
 * cero recalculo de lógica de negocio.
 *
 * SERVER ONLY.
 */

import "server-only";

import { randomUUID } from "crypto";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { loadStoreReplenishmentPlanWithMeta, buildCanonicalStorePriorityOrder } from "./store-replenishment-plan-service";
import { loadStoreUnitNeeds } from "./store-unit-needs-service";
import {
  partitionPlanForStore,
  buildSnapshot,
  formatDocumentNumber,
  computePartitionFingerprint,
  SNAPSHOT_SCHEMA_VERSION,
  type ReplenishmentDocumentSnapshot,
  type ReplenishmentDocumentStatus,
  type StorePlanPartition,
} from "./store-replenishment-document-types";
import { buildReplenishmentDocumentSheets } from "./store-replenishment-document-excel";
import { renderReplenishmentDocumentHtml } from "./store-replenishment-document-renderer";
import { getCanonicalStore } from "../sales-canonical-source";

const db = prisma as any;

// ── Records ──────────────────────────────────────────────────────────────────

export interface ReplenishmentDocumentRecord {
  id: string;
  documentNumber: string;
  batchId: string;
  storeId: string;
  storeName: string;
  status: ReplenishmentDocumentStatus;
  snapshotSchemaVersion: number;
  planFingerprint: string;
  suggestionCount: number;
  allocatedUnits: number;
  withdrawalUnits: number;
  generatedBy: string;
  createdAt: string;
}

export interface CreateDocumentsResult {
  batchId: string;
  /** true si se devolvió un batch existente por idempotencia (sin crear nada). */
  reusedExistingBatch: boolean;
  documents: ReplenishmentDocumentRecord[];
}

export type DocumentExportFormat = "html" | "xlsx";

function toRecord(r: any): ReplenishmentDocumentRecord {
  return {
    id: r.id,
    documentNumber: r.documentNumber,
    batchId: r.batchId,
    storeId: r.storeId,
    storeName: r.storeName,
    status: r.status,
    snapshotSchemaVersion: r.snapshotSchemaVersion,
    planFingerprint: r.planFingerprint,
    suggestionCount: r.suggestionCount,
    allocatedUnits: r.allocatedUnits,
    withdrawalUnits: r.withdrawalUnits,
    generatedBy: r.generatedBy,
    createdAt: r.createdAt?.toISOString?.() ?? "",
  };
}

// ── Create (batch atómico, secuencia transaccional, idempotente) ─────────────

export async function createReplenishmentDocuments(
  orgId: string,
  generatedBy: string,
): Promise<CreateDocumentsResult> {
  const { plan, planGeneratedAt } = await loadStoreReplenishmentPlanWithMeta(orgId);
  const { order } = buildCanonicalStorePriorityOrder();
  const documentGeneratedAt = new Date().toISOString();

  // Particiones + fingerprints (fuera de la transacción — puro).
  const partitions: { storeId: string; storeName: string; partition: StorePlanPartition; fingerprint: string }[] = [];
  for (const storeId of order) {
    const needs = await loadStoreUnitNeeds(orgId, storeId);
    const partition = partitionPlanForStore(
      plan,
      storeId,
      needs.needs.filter(n => n.action === "RETIRO"),
    );
    // Tienda sin contenido: no se fabrica documento vacío.
    if (partition.suggestions.length === 0 &&
        partition.withdrawals.length === 0 &&
        partition.unallocated.length === 0) {
      continue;
    }
    partitions.push({
      storeId,
      storeName: getCanonicalStore(storeId)?.storeName ?? storeId,
      partition,
      fingerprint: computePartitionFingerprint(partition),
    });
  }

  if (partitions.length === 0) {
    return { batchId: "", reusedExistingBatch: false, documents: [] };
  }

  // ── IDEMPOTENCIA: si el batch más reciente tiene exactamente los mismos
  // fingerprints por tienda y TODOS sus documentos siguen en BORRADOR, se
  // devuelve ese batch — no se crean duplicados.
  const lastDoc = await db.storeReplenishmentDocument.findFirst({
    where: { organizationId: orgId },
    orderBy: { consecutivo: "desc" },
    select: { batchId: true },
  });
  if (lastDoc) {
    const lastBatch = await db.storeReplenishmentDocument.findMany({
      where: { organizationId: orgId, batchId: lastDoc.batchId },
    });
    const allDraft = lastBatch.every((d: any) => d.status === "BORRADOR");
    const sameContent =
      lastBatch.length === partitions.length &&
      partitions.every(p => lastBatch.some((d: any) => d.storeId === p.storeId && d.planFingerprint === p.fingerprint));
    if (allDraft && sameContent) {
      return {
        batchId: lastDoc.batchId,
        reusedExistingBatch: true,
        documents: lastBatch
          .sort((a: any, b: any) => a.consecutivo - b.consecutivo)
          .map(toRecord),
      };
    }
  }

  // ── Creación ATÓMICA: secuencia + todos los documentos en UNA transacción.
  const batchId = randomUUID();
  const created = await db.$transaction(async (tx: any) => {
    // Reserva transaccional de N consecutivos (increment atómico, no count+1).
    await tx.replenishmentDocumentSequence.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, lastValue: 0 },
      update: {},
    });
    const seq = await tx.replenishmentDocumentSequence.update({
      where: { organizationId: orgId },
      data: { lastValue: { increment: partitions.length } },
      select: { lastValue: true },
    });
    const firstConsecutivo = seq.lastValue - partitions.length + 1;

    const rows: any[] = [];
    for (let i = 0; i < partitions.length; i++) {
      const p = partitions[i];
      const consecutivo = firstConsecutivo + i;
      const documentNumber = formatDocumentNumber(consecutivo);

      const snapshot: ReplenishmentDocumentSnapshot = buildSnapshot({
        documentNumber,
        batchId,
        storeName: p.storeName,
        planGeneratedAt,
        documentGeneratedAt,
        generatedBy,
        partition: p.partition,
        scarcityMaterializedGlobal: plan.scarcityMaterialized,
      });

      rows.push(await tx.storeReplenishmentDocument.create({
        data: {
          organizationId: orgId,
          consecutivo,
          documentNumber,
          batchId,
          storeId: p.storeId,
          storeName: p.storeName,
          status: "BORRADOR",
          snapshotSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
          planFingerprint: p.fingerprint,
          planSnapshot: snapshot,   // snapshot completo DENTRO de la transacción
          suggestionCount: p.partition.suggestions.length,
          allocatedUnits: p.partition.summary.allocatedUnits,
          withdrawalUnits: p.partition.summary.withdrawalUnits,
          generatedBy,
        },
      }));
    }
    return rows;
  });

  return {
    batchId,
    reusedExistingBatch: false,
    documents: created.map(toRecord),
  };
}

// ── List / Get (siempre filtrado por organización) ───────────────────────────

export async function listReplenishmentDocuments(
  orgId: string,
  limit = 50,
): Promise<ReplenishmentDocumentRecord[]> {
  const rows = await db.storeReplenishmentDocument.findMany({
    where: { organizationId: orgId },
    orderBy: { consecutivo: "desc" },
    take: limit,
  });
  return rows.map(toRecord);
}

export async function getReplenishmentDocument(
  orgId: string,
  documentId: string,
): Promise<{ record: ReplenishmentDocumentRecord; snapshot: ReplenishmentDocumentSnapshot } | null> {
  const r = await db.storeReplenishmentDocument.findFirst({
    where: { id: documentId, organizationId: orgId },
  });
  if (!r) return null;
  return { record: toRecord(r), snapshot: r.planSnapshot as ReplenishmentDocumentSnapshot };
}

// ── Exports — EXCLUSIVAMENTE desde el snapshot persistido ────────────────────

export async function exportReplenishmentDocument(
  orgId: string,
  documentId: string,
  format: DocumentExportFormat,
): Promise<{ fileName: string; contentBase64: string; mimeType: string } | null> {
  // Única fuente: el snapshot en BD. Este módulo jamás toca el plan vivo.
  const doc = await getReplenishmentDocument(orgId, documentId);
  if (!doc) return null;

  if (format === "xlsx") {
    const wb = XLSX.utils.book_new();
    for (const sheet of buildReplenishmentDocumentSheets(doc.snapshot)) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheet.rows as any[][]), sheet.name);
    }
    const buffer: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return {
      fileName: `${doc.record.documentNumber}-${doc.record.storeId}.xlsx`,
      contentBase64: buffer.toString("base64"),
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  const html = renderReplenishmentDocumentHtml(doc.snapshot, doc.record.status);
  return {
    fileName: `${doc.record.documentNumber}-${doc.record.storeId}.html`,
    contentBase64: Buffer.from(html, "utf8").toString("base64"),
    mimeType: "text/html",
  };
}
