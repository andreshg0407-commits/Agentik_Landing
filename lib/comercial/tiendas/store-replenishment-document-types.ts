/**
 * lib/comercial/tiendas/store-replenishment-document-types.ts
 *
 * AGENTIK-STORES-REPLENISHMENT-DOCUMENT-01 (v2) — Snapshot types + pure helpers.
 * Ajustes certificados incorporados: schemaVersion · timestamps separados ·
 * escasez global vs de tienda · JSON canónico y copia profunda · fingerprint
 * de idempotencia.
 *
 * CONDICIÓN CERTIFICADA: el documento es representación PERSISTIDA del plan
 * certificado del Sprint 6 — este módulo solo PARTICIONA, PROYECTA y
 * FORMATEA; jamás recalcula cantidades, prioridades, causas ni razones.
 *
 * Client-safe: NO "server-only". Pure types + pure functions.
 */

import type {
  ReplenishmentSuggestion,
  UnallocatedNeed,
  StoreReplenishmentSummary,
  StoreReplenishmentPlan,
} from "./store-replenishment-allocation-engine";
import type { UnitNeed } from "./store-unit-needs-engine";

// ── Snapshot schema version (evolución controlada del contrato) ──────────────

export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

// ── Document states (alineado 1:1 con el enum Prisma) ────────────────────────

export const REPLENISHMENT_DOCUMENT_STATUSES = [
  "BORRADOR",
  "APROBADO",
  "PREPARACION",
  "DESPACHADO",
  "RECIBIDO",
  "CERRADO",
  "CANCELADO",
] as const;

export type ReplenishmentDocumentStatus = (typeof REPLENISHMENT_DOCUMENT_STATUSES)[number];

export const REPLENISHMENT_DOCUMENT_STATUS_LABEL: Record<ReplenishmentDocumentStatus, string> = {
  BORRADOR: "Borrador",
  APROBADO: "Aprobado",
  PREPARACION: "En preparación",
  DESPACHADO: "Despachado",
  RECIBIDO: "Recibido",
  CERRADO: "Cerrado",
  CANCELADO: "Cancelado",
};

// ── Snapshot (congelado al crear el documento) ───────────────────────────────

export interface ReplenishmentDocumentSnapshot {
  readonly schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  readonly documentNumber: string;
  readonly batchId: string;
  readonly storeId: string;
  readonly storeName: string;
  /** Cuándo se CALCULÓ el plan certificado (Sprint 6). */
  readonly planGeneratedAt: string;
  /** Cuándo se CREÓ este documento (puede diferir del cálculo del plan). */
  readonly documentGeneratedAt: string;
  readonly generatedBy: string;
  /** VERBATIM del Sprint 6 — solo las sugerencias de ESTA tienda. */
  readonly suggestions: readonly ReplenishmentSuggestion[];
  /** VERBATIM del Sprint 5 (retiros de esta tienda, action=RETIRO). */
  readonly withdrawals: readonly UnitNeed[];
  /** VERBATIM del Sprint 6 — transparencia: qué no va y por qué. */
  readonly unallocated: readonly UnallocatedNeed[];
  /** VERBATIM del Sprint 6 — resumen de esta tienda. */
  readonly summary: StoreReplenishmentSummary;
  /** Escasez del POOL COMPARTIDO en la corrida (dimensión global del plan). */
  readonly scarcityMaterializedGlobal: boolean;
  /** Escasez que TOCÓ a esta tienda: alguna necesidad quedó POOL_AGOTADO aquí. */
  readonly scarcityAffectedThisStore: boolean;
}

// ── Consecutivo ──────────────────────────────────────────────────────────────

export const DOCUMENT_NUMBER_PREFIX = "SR";

/** "SR-00042" — 5 dígitos con ceros a la izquierda (crece si excede). */
export function formatDocumentNumber(consecutivo: number): string {
  if (!Number.isInteger(consecutivo) || consecutivo <= 0) {
    throw new Error(`[REPLENISHMENT-DOC] consecutivo inválido: ${consecutivo}`);
  }
  return `${DOCUMENT_NUMBER_PREFIX}-${String(consecutivo).padStart(5, "0")}`;
}

// ── JSON canónico y copia profunda (ajuste certificado) ──────────────────────

/**
 * Serialización JSON canónica: claves de objeto ordenadas recursivamente.
 * Misma entrada semántica → mismo string, independiente del orden de
 * inserción. Base del fingerprint de idempotencia.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v === undefined) continue;
      sorted[key] = sortKeysDeep(v);
    }
    return sorted;
  }
  return value;
}

/** Copia profunda sin referencias compartidas (contratos JSON-serializables). */
export function deepCopy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ── Partición por tienda (pura, verbatim, sin pérdida) ───────────────────────

export interface StorePlanPartition {
  readonly storeId: string;
  readonly suggestions: readonly ReplenishmentSuggestion[];
  readonly withdrawals: readonly UnitNeed[];
  readonly unallocated: readonly UnallocatedNeed[];
  readonly summary: StoreReplenishmentSummary;
}

/**
 * Particiona el plan multi-tienda del Sprint 6 en el contenido de UNA tienda.
 *
 * - suggestions y unallocated se filtran por su storeId (verbatim).
 * - withdrawals llegan por parámetro DESDE las necesidades certificadas del
 *   Sprint 5 de esa tienda (action=RETIRO, verbatim); la partición valida
 *   que cuadren con el summary del plan — descuadre = snapshot abortado.
 * - summary es el del plan para esa tienda (verbatim).
 */
export function partitionPlanForStore(
  plan: StoreReplenishmentPlan,
  storeId: string,
  storeWithdrawals: readonly UnitNeed[],
): StorePlanPartition {
  const summary = plan.summaryByStore.find(s => s.storeId === storeId);
  if (!summary) {
    throw new Error(`[REPLENISHMENT-DOC] El plan no contiene resumen para la tienda ${storeId}.`);
  }

  const withdrawals = storeWithdrawals.filter(n => n.action === "RETIRO");
  const withdrawalUnits = withdrawals.reduce((t, n) => t + n.requiredUnits, 0);
  if (withdrawalUnits !== summary.withdrawalUnits) {
    throw new Error(
      `[REPLENISHMENT-DOC] Retiros de ${storeId} no cuadran con el plan: ` +
      `${withdrawalUnits} vs ${summary.withdrawalUnits} unds — snapshot abortado.`,
    );
  }

  return {
    storeId,
    suggestions: plan.suggestions.filter(s => s.storeId === storeId),
    withdrawals,
    unallocated: plan.unallocated.filter(u => u.storeId === storeId),
    summary,
  };
}

/**
 * Verificación de partición sin pérdida: la unión de las particiones
 * reconstruye exactamente las sugerencias y no-asignadas del plan.
 */
export function verifyLosslessPartition(
  plan: StoreReplenishmentPlan,
  partitions: readonly StorePlanPartition[],
): boolean {
  const suggCount = partitions.reduce((t, p) => t + p.suggestions.length, 0);
  const unallocCount = partitions.reduce((t, p) => t + p.unallocated.length, 0);
  const allocUnits = partitions.reduce(
    (t, p) => t + p.suggestions.reduce((x, s) => x + s.units, 0), 0,
  );
  const planAllocUnits = plan.suggestions.reduce((t, s) => t + s.units, 0);
  return suggCount === plan.suggestions.length
    && unallocCount === plan.unallocated.length
    && allocUnits === planAllocUnits;
}

// ── Fingerprint de idempotencia (JSON canónico → hash estable) ───────────────

/**
 * Huella del CONTENIDO de la partición (sin consecutivo, sin timestamps, sin
 * batch): dos corridas sobre el mismo plan producen la misma huella aunque
 * cambien la hora o el generador. Hash FNV-1a de 64 bits sobre el JSON
 * canónico (suficiente e independiente de crypto para ser client-safe; el
 * servicio puede reforzar con SHA-256 si se desea).
 */
export function computePartitionFingerprint(partition: StorePlanPartition): string {
  const canonical = canonicalJson({
    storeId: partition.storeId,
    suggestions: partition.suggestions,
    withdrawals: partition.withdrawals,
    unallocated: partition.unallocated,
    summary: partition.summary,
  });
  // FNV-1a 64-bit
  let h = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");
  for (let i = 0; i < canonical.length; i++) {
    h = (h ^ BigInt(canonical.charCodeAt(i))) & mask;
    h = (h * prime) & mask;
  }
  return `v${SNAPSHOT_SCHEMA_VERSION}-${h.toString(16).padStart(16, "0")}`;
}

// ── Snapshot builder (copia profunda + proyección de escasez) ────────────────

export function buildSnapshot(args: {
  documentNumber: string;
  batchId: string;
  storeName: string;
  planGeneratedAt: string;
  documentGeneratedAt: string;
  generatedBy: string;
  partition: StorePlanPartition;
  scarcityMaterializedGlobal: boolean;
}): ReplenishmentDocumentSnapshot {
  // Proyección (no recalculo): la escasez tocó a ESTA tienda si alguna de sus
  // necesidades quedó sin asignar por pool agotado.
  const scarcityAffectedThisStore =
    args.partition.unallocated.some(u => u.reason === "POOL_AGOTADO");

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    documentNumber: args.documentNumber,
    batchId: args.batchId,
    storeId: args.partition.storeId,
    storeName: args.storeName,
    planGeneratedAt: args.planGeneratedAt,
    documentGeneratedAt: args.documentGeneratedAt,
    generatedBy: args.generatedBy,
    suggestions: deepCopy(args.partition.suggestions),
    withdrawals: deepCopy(args.partition.withdrawals),
    unallocated: deepCopy(args.partition.unallocated),
    summary: deepCopy(args.partition.summary),
    scarcityMaterializedGlobal: args.scarcityMaterializedGlobal,
    scarcityAffectedThisStore,
  };
}
