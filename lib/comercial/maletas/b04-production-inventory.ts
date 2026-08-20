/**
 * b04-production-inventory.ts
 *
 * MALETAS-NORMALIZACION-B04-08B2R3 — FASE 4
 *
 * Queries SAG CURRENT vw_agentik_inventario for Bodega 4 (PRODUCTO EN PROCESO).
 * Returns all references with positive stock in B04, enriched with
 * ProductEntity classification (grupo, subgrupo, línea).
 *
 * B04 truth: a reference has an active production process when its
 * SAG B04 stock is positive. No temporal filter (180-day rule removed).
 *
 * If B04 cannot be queried → opDataAvailability = "UNAVAILABLE".
 *
 * Server-only — requires SAG SOAP connection.
 */

import "server-only";
import { consultaSagJson } from "@/lib/connectors/pya/client";
import { getSagConnection } from "@/lib/connectors/pya/sag-source-router";
import { normalizeTextileReference, type NormalizedReference } from "./textile-reference-normalizer";

// ═══════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════

export type B04DataAvailability = "AVAILABLE" | "UNAVAILABLE";

export interface B04InventoryRef {
  reference: string;
  description: string;
  linea: string;               // "CS" | "LT" | "IMPORT" | "OTRO"
  existencia: number;          // SAG EXISTENCIA in B04
  reservado: number;           // SAG RESERVADO in B04
  disponible: number;          // SAG DISPONIBLE in B04 (existencia - reservado)
  grupoSag: string | null;     // Enriched from ProductEntity
  subgrupoSag: string | null;  // Enriched from ProductEntity
  warehouseCode: "B04";
  normalized: NormalizedReference;
}

export interface B04InventoryResult {
  refs: B04InventoryRef[];
  byReference: Map<string, B04InventoryRef>;
  totalRefs: number;
  totalPositiveRefs: number;
  totalExistencia: number;
  availability: B04DataAvailability;
  queriedAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════
// SAG Query — B04 = PRODUCTO EN PROCESO
// ═══════════════════════════════════════════════════════════════════════════

// B04: ka_nl_bodega=13, ss_codigo=04
const SAG_B04_QUERY = [
  "SELECT",
  "  CODIGO_PRODUCTO, PRODUCTO, LINEA,",
  "  EXISTENCIA, RESERVADO, DISPONIBLE",
  "FROM vw_agentik_inventario",
  "WHERE BODEGA LIKE '04 -%'",
].join(" ");

const SAG_B04_QUERY_FULL = [
  "SELECT",
  "  CODIGO_PRODUCTO, PRODUCTO, LINEA,",
  "  BODEGA, EXISTENCIA, RESERVADO, DISPONIBLE",
  "FROM vw_agentik_inventario",
].join(" ");

// ═══════════════════════════════════════════════════════════════════════════
// Core function
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load B04 (PRODUCTO EN PROCESO) inventory from SAG CURRENT.
 *
 * Enriches each reference with ProductEntity classification
 * (grupoSag, subgrupoSag) from the database.
 *
 * @param db - Prisma client (for ProductEntity lookup)
 * @param organizationId - Tenant organization ID
 */
export async function getB04ProductionInventory(
  db: any,
  organizationId: string,
): Promise<B04InventoryResult> {
  const now = new Date();
  const emptyResult: B04InventoryResult = {
    refs: [],
    byReference: new Map(),
    totalRefs: 0,
    totalPositiveRefs: 0,
    totalExistencia: 0,
    availability: "UNAVAILABLE",
    queriedAt: now,
  };

  // ── 1. Get SAG connection ──
  let config;
  try {
    config = getSagConnection("CURRENT");
  } catch {
    return emptyResult;
  }

  // ── 2. Query SAG B04 inventory ──
  let invRows: Record<string, unknown>[];
  try {
    invRows = await consultaSagJson(config, SAG_B04_QUERY) as Record<string, unknown>[];
    if (!Array.isArray(invRows)) {
      // Fallback: load all bodegas and filter in code
      const allRows = await consultaSagJson(config, SAG_B04_QUERY_FULL) as Record<string, unknown>[];
      if (!Array.isArray(allRows)) return emptyResult;
      invRows = allRows.filter(r => {
        const bodega = String(r.BODEGA ?? "").trim();
        return bodega.startsWith("04 ") || bodega === "04";
      });
    }
  } catch {
    return emptyResult;
  }

  // ── 3. Aggregate per reference ──
  const refMap = new Map<string, {
    description: string;
    linea: string;
    existencia: number;
    reservado: number;
    disponible: number;
  }>();

  for (const row of invRows) {
    const code = String(row.CODIGO_PRODUCTO ?? "").trim();
    if (!code) continue;

    const existencia = Number(row.EXISTENCIA ?? 0);
    const reservado = Number(row.RESERVADO ?? 0);
    const disponible = Number(row.DISPONIBLE ?? 0);
    const description = String(row.PRODUCTO ?? "").trim();
    const linea = String(row.LINEA ?? "").trim();

    const existing = refMap.get(code);
    if (existing) {
      existing.existencia += existencia;
      existing.reservado += reservado;
      existing.disponible += disponible;
    } else {
      refMap.set(code, { description, linea, existencia, reservado, disponible });
    }
  }

  // ── 4. Enrich from ProductEntity ──
  const refCodes = [...refMap.keys()];
  let peMap = new Map<string, { grupoSag: string | null; subgrupoSag: string | null }>();
  try {
    const products = await db.productEntity.findMany({
      where: {
        organizationId,
        sku: { in: refCodes },
      },
      select: { sku: true, grupoSag: true, subgrupoSag: true },
    });
    for (const p of products) {
      if (p.sku) {
        peMap.set(p.sku, { grupoSag: p.grupoSag ?? null, subgrupoSag: p.subgrupoSag ?? null });
      }
    }
  } catch {
    // ProductEntity not available — continue without enrichment
  }

  // ── 5. Build results (only positive stock) ──
  const refs: B04InventoryRef[] = [];
  const byReference = new Map<string, B04InventoryRef>();
  let totalExistencia = 0;

  for (const [code, data] of refMap) {
    if (data.existencia <= 0) continue; // Only positive stock

    const line = resolveLineCode(data.linea);
    const pe = peMap.get(code);
    const grupoSag = pe?.grupoSag ?? null;
    const subgrupoSag = pe?.subgrupoSag ?? null;

    totalExistencia += data.existencia;

    const normalized = normalizeTextileReference(
      data.description,
      grupoSag,
      subgrupoSag,
      line,
    );

    const entry: B04InventoryRef = {
      reference: code,
      description: data.description,
      linea: line,
      existencia: data.existencia,
      reservado: data.reservado,
      disponible: data.disponible,
      grupoSag,
      subgrupoSag,
      warehouseCode: "B04",
      normalized,
    };

    refs.push(entry);
    byReference.set(code, entry);
  }

  // Sort by existencia DESC
  refs.sort((a, b) => b.existencia - a.existencia);

  return {
    refs,
    byReference,
    totalRefs: refs.length,
    totalPositiveRefs: refs.filter(r => r.disponible > 0).length,
    totalExistencia,
    availability: "AVAILABLE",
    queriedAt: now,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════════════════

function resolveLineCode(linea: string): string {
  const upper = linea.toUpperCase().trim();
  if (upper === "CASTILLITOS") return "CS";
  if (upper === "LATIN KIDS" || upper === "LATIN_KIDS") return "LT";
  if (upper === "IMPORTACION" || upper === "IMPORTACIÓN") return "IMPORT";
  if (upper === "PIJAMAS DAMA") return "PD";
  if (upper === "POWER") return "PW";
  return "OTRO";
}
