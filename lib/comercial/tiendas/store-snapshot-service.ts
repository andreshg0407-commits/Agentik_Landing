/**
 * lib/comercial/tiendas/store-snapshot-service.ts
 *
 * AGENTIK-STORES-TRUTH-AUDIT-01 — F2: StoreSnapshotService (server, DELGADO).
 *
 * Orquesta la corrida: loadSnapshotSource (F1) → assembleSnapshotSource (F1)
 * → runStoreSnapshotPipeline (F2) → documentRefs reales (S7, solo referencias)
 * → generatedAt + metrics. Cero lógica de negocio propia.
 *
 * CACHE ÚNICA del snapshot (la primera del módulo con invalidación real):
 * una entrada por org, TTL configurable vía STORE_SNAPSHOT_TTL_MS (ajuste 4;
 * default 2 min), invalidateStoreSnapshot(orgId) para las escrituras.
 * F0-inv. 8: ningún snapshot se construye desde otro — el cache guarda la
 * corrida completa, jamás se deriva ni se parcha.
 *
 * metrics (ajuste 3): observabilidad de la corrida — tiempos por etapa y
 * conteos. NUNCA entra al fingerprint (inv. 9) ni al contrato de datos.
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { loadSnapshotSource } from "./store-snapshot-source-service";
import { assembleSnapshotSource } from "./store-snapshot-assembler";
import {
  runStoreSnapshotPipeline,
  attachDocumentRefs,
  type StoreSnapshot,
  type SnapshotDocumentRefs,
} from "./store-snapshot-pipeline";

// ── Observabilidad (ajuste 3) ────────────────────────────────────────────────

export interface StoreSnapshotMetrics {
  readonly readMs: number;
  readonly assembleMs: number;
  readonly pipelineMs: number;
  readonly documentRefsMs: number;
  readonly totalMs: number;
  readonly inventoryRows: number;
  readonly activeStores: number;
  readonly cacheHit: boolean;
}

export interface StoreSnapshotWithMeta {
  readonly snapshot: StoreSnapshot;
  readonly metrics: StoreSnapshotMetrics;
}

// ── Cache única (TTL configurable — ajuste 4) ────────────────────────────────

const DEFAULT_TTL_MS = 2 * 60 * 1000;

function resolveTtlMs(): number {
  const raw = process.env.STORE_SNAPSHOT_TTL_MS;
  if (!raw) return DEFAULT_TTL_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MS;
}

const cache = new Map<string, { data: StoreSnapshotWithMeta; ts: number }>();

export function invalidateStoreSnapshot(orgId: string): void {
  cache.delete(`storeSnapshot:${orgId}`);
}

// ── Referencias de documentos (S7) — solo IDs, cero copias (ajuste 2 F0) ────

async function loadDocumentRefs(orgId: string): Promise<SnapshotDocumentRefs> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any;
  const [open, last] = await Promise.all([
    db.storeReplenishmentDocument.findMany({
      where: { organizationId: orgId, status: { notIn: ["CERRADO", "CANCELADO"] } },
      select: { id: true },
      orderBy: { consecutivo: "asc" },
    }),
    db.storeReplenishmentDocument.findFirst({
      where: { organizationId: orgId },
      orderBy: { consecutivo: "desc" },
      select: { documentNumber: true },
    }),
  ]);
  return {
    openDocumentIds: open.map((d: { id: string }) => d.id),
    openCount: open.length,
    lastDocumentNumber: last?.documentNumber ?? null,
  };
}

// ── Corrida ──────────────────────────────────────────────────────────────────

export async function getStoreSnapshotWithMeta(orgId: string): Promise<StoreSnapshotWithMeta> {
  const cacheKey = `storeSnapshot:${orgId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < resolveTtlMs()) {
    return { ...cached.data, metrics: { ...cached.data.metrics, cacheHit: true } };
  }

  const t0 = Date.now();
  const source = await loadSnapshotSource(orgId);
  const t1 = Date.now();
  const assembled = assembleSnapshotSource(source);
  const t2 = Date.now();
  const computed = runStoreSnapshotPipeline(assembled);
  const t3 = Date.now();
  const documentRefs = await loadDocumentRefs(orgId);
  const t4 = Date.now();

  const snapshot: StoreSnapshot = {
    ...attachDocumentRefs(computed, documentRefs),
    generatedAt: new Date(t4).toISOString(),
  };

  const result: StoreSnapshotWithMeta = {
    snapshot,
    metrics: {
      readMs: t1 - t0,
      assembleMs: t2 - t1,
      pipelineMs: t3 - t2,
      documentRefsMs: t4 - t3,
      totalMs: t4 - t0,
      inventoryRows: source.inventoryRows.length,
      activeStores: assembled.activeStores.length,
      cacheHit: false,
    },
  };

  cache.set(cacheKey, { data: result, ts: Date.now() });
  return result;
}

export async function getStoreSnapshot(orgId: string): Promise<StoreSnapshot> {
  return (await getStoreSnapshotWithMeta(orgId)).snapshot;
}
