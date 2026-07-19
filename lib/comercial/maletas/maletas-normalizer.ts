/**
 * lib/comercial/maletas/maletas-normalizer.ts
 *
 * Static configuration derived from Excel workbooks (MALETAS.xlsx, DISPONIBLE PARA MALETAS.xlsx).
 * Encodes vendor registry, derrotero rules, batch labels as typed constants.
 * When Prisma migration runs, these constants become DB-seeded records.
 *
 * Sprint: AGENTIK-COMERCIAL-MALETAS-ENGINE-01
 */

import type {
  SalesRep,
  ReplenishmentRule,
  RawCaseRow,
  RawAvailabilityRecord,
  CommercialCaseLine,
} from "./maletas-types";

// ─── Vendor registry (multi-tenant configurable) ───────────────────────────────

/**
 * Vendor registry placeholder.
 *
 * COMMERCIAL-STABILIZATION-01 Phase 3: The previous hardcoded 4-vendor registry
 * was removed because it represented only 50% of real sellers (8 in CRM).
 * Until a CommercialSalesRep Prisma model is created and populated from CRM sync,
 * this returns an empty array — callers must handle the empty case gracefully.
 */
export function getVendorRegistry(_orgId: string): SalesRep[] {
  return [];
}

/**
 * Maps an Excel column header (e.g. "CARLOS LEON") to its SalesRep id.
 * Returns null if the column is not a vendor column.
 */
export function excelVendorColumnToId(
  columnHeader: string,
  registry: SalesRep[],
): string | null {
  const rep = registry.find(
    (r) => r.name.toUpperCase() === columnHeader.toUpperCase().trim(),
  );
  return rep?.id ?? null;
}

// ─── Batch labels (derive active production batches) ───────────────────────────

export const LT_BATCH_LABELS: string[] = [
  "ABRIL 7 EN PROCESO",
  "ABRIL 16 EN PROCESO",
  "ABRIL 28 EN PROCESO",
  "MAYO 11 EN PROCESO",
  "MAYO 20 EN PROCESO",
];

export const CS_BATCH_LABELS: string[] = [
  "ENERO 19 EN PROCESO",
  "FEBRERO 25 EN PROCESO",
  "MARZO 30 EN PROCESO",
  "MAYO 15 EN PROCESO",
];

export function getBatchLabels(line: CommercialCaseLine): string[] {
  return line === "LT" ? LT_BATCH_LABELS : CS_BATCH_LABELS;
}

// ─── Derrotero rules ───────────────────────────────────────────────────────────

/**
 * DERROTERO rules derived from MALETAS.xlsx DERROTERO sheet.
 * Defines minimum quantities per category/garment-type per case.
 *
 * These are CATEGORY-LEVEL minimums (how many different refs of a type should be in the case).
 * ITEM-LEVEL minimum is always 1 (one unit of each assigned ref must be available).
 */
const DERROTERO_RULES: ReplenishmentRule[] = [
  // ── Latin Kids (LT) — Conjuntos generales ─────────────────────────────────
  { line: "LT", category: "CONJUNTOS", garmentType: "60 CONJUNTOS", sizeRange: null, minimumRequired: 3, priorityWeight: 3 },
  { line: "LT", category: "CONJUNTOS", garmentType: "20 CONJUNTOS PANTALONETA", sizeRange: null, minimumRequired: 5, priorityWeight: 4 },
  { line: "LT", category: "CONJUNTOS", garmentType: "80 CONJUNTOS", sizeRange: null, minimumRequired: 5, priorityWeight: 4 },
  // ── LT — Niño ─────────────────────────────────────────────────────────────
  { line: "LT", category: "NIÑO", garmentType: "CONJUNTO CL", sizeRange: "2-8", minimumRequired: 5, priorityWeight: 5 },
  { line: "LT", category: "NIÑO", garmentType: "CONJUNTO CC", sizeRange: "2-8", minimumRequired: 4, priorityWeight: 4 },
  { line: "LT", category: "NIÑO", garmentType: "CONJUNTO LL", sizeRange: "2-8", minimumRequired: 3, priorityWeight: 3 },
  { line: "LT", category: "NIÑO", garmentType: "CONJUNTO CL", sizeRange: "10-16", minimumRequired: 4, priorityWeight: 4 },
  { line: "LT", category: "NIÑO", garmentType: "CONJUNTO CC", sizeRange: "10-16", minimumRequired: 3, priorityWeight: 3 },
  { line: "LT", category: "NIÑO", garmentType: "CONJUNTO LL", sizeRange: "10-16", minimumRequired: 3, priorityWeight: 3 },
  // ── LT — Niña ─────────────────────────────────────────────────────────────
  { line: "LT", category: "NIÑA", garmentType: "CONJUNTO CL", sizeRange: "2-8", minimumRequired: 5, priorityWeight: 5 },
  { line: "LT", category: "NIÑA", garmentType: "CONJUNTO CC", sizeRange: "2-8", minimumRequired: 3, priorityWeight: 3 },
  { line: "LT", category: "NIÑA", garmentType: "CONJUNTO LL", sizeRange: "2-8", minimumRequired: 3, priorityWeight: 3 },
  { line: "LT", category: "NIÑA", garmentType: "CONJUNTO CL", sizeRange: "10-16", minimumRequired: 4, priorityWeight: 4 },
  { line: "LT", category: "NIÑA", garmentType: "CONJUNTO CC", sizeRange: "10-16", minimumRequired: 3, priorityWeight: 3 },
  { line: "LT", category: "NIÑA", garmentType: "CONJUNTO LL", sizeRange: "10-16", minimumRequired: 3, priorityWeight: 3 },
  // ── LT — Pijamas Bebé ─────────────────────────────────────────────────────
  { line: "LT", category: "PIJAMAS BEBÉ NIÑA", garmentType: "PIJAMA CL", sizeRange: null, minimumRequired: 3, priorityWeight: 3 },
  { line: "LT", category: "PIJAMAS BEBÉ NIÑO", garmentType: "PIJAMA CL", sizeRange: null, minimumRequired: 3, priorityWeight: 3 },
  { line: "LT", category: "PIJAMAS BEBÉ NIÑA", garmentType: "PIJAMA LL", sizeRange: null, minimumRequired: 3, priorityWeight: 3 },
  { line: "LT", category: "PIJAMAS BEBÉ NIÑO", garmentType: "PIJAMA LL", sizeRange: null, minimumRequired: 3, priorityWeight: 3 },
  // ── LT — Pijamas Grandes ──────────────────────────────────────────────────
  { line: "LT", category: "PIJAMAS GRANDES", garmentType: "PIJAMA CL", sizeRange: "NIÑA 18-22", minimumRequired: 2, priorityWeight: 2 },
  { line: "LT", category: "PIJAMAS GRANDES", garmentType: "PIJAMA CL", sizeRange: "NIÑO 18-22", minimumRequired: 2, priorityWeight: 2 },
  { line: "LT", category: "PIJAMAS GRANDES", garmentType: "PIJAMA CC", sizeRange: "NIÑA 18-22", minimumRequired: 2, priorityWeight: 2 },
  { line: "LT", category: "PIJAMAS GRANDES", garmentType: "PIJAMA CC", sizeRange: "NIÑO 18-22", minimumRequired: 2, priorityWeight: 2 },
  // ── Castillitos (CS) — PIJAMA LL ──────────────────────────────────────────
  { line: "CS", category: "NIÑA BEBE", garmentType: "PIJAMA LL", sizeRange: null, minimumRequired: 2, priorityWeight: 2 },
  { line: "CS", category: "NIÑO BEBE", garmentType: "PIJAMA LL", sizeRange: null, minimumRequired: 2, priorityWeight: 2 },
  { line: "CS", category: "NIÑA KIDS", garmentType: "PIJAMA LL", sizeRange: null, minimumRequired: 2, priorityWeight: 2 },
  { line: "CS", category: "NIÑO KIDS", garmentType: "PIJAMA LL", sizeRange: null, minimumRequired: 2, priorityWeight: 2 },
  // ── CS — PIJAMA CL ────────────────────────────────────────────────────────
  { line: "CS", category: "NIÑA BEBE", garmentType: "PIJAMA CL", sizeRange: null, minimumRequired: 3, priorityWeight: 3 },
  { line: "CS", category: "NIÑO BEBE", garmentType: "PIJAMA CL", sizeRange: null, minimumRequired: 3, priorityWeight: 3 },
  { line: "CS", category: "NIÑA KIDS", garmentType: "PIJAMA CL", sizeRange: null, minimumRequired: 3, priorityWeight: 3 },
  { line: "CS", category: "NIÑO KIDS", garmentType: "PIJAMA CL", sizeRange: null, minimumRequired: 3, priorityWeight: 3 },
  // ── CS — CONJUNTO CC ──────────────────────────────────────────────────────
  { line: "CS", category: "NIÑA BEBE", garmentType: "CONJUNTO CC", sizeRange: null, minimumRequired: 2, priorityWeight: 2 },
  { line: "CS", category: "NIÑO BEBE", garmentType: "CONJUNTO CC BERMUDA", sizeRange: null, minimumRequired: 3, priorityWeight: 3 },
  { line: "CS", category: "NIÑA KIDS", garmentType: "CONJUNTO CC", sizeRange: null, minimumRequired: 2, priorityWeight: 2 },
  { line: "CS", category: "NIÑO KIDS", garmentType: "CONJUNTO CC BERMUDA", sizeRange: null, minimumRequired: 3, priorityWeight: 3 },
  // ── CS — CONJUNTO CL ──────────────────────────────────────────────────────
  { line: "CS", category: "NIÑA BEBE", garmentType: "CONJUNTO CL", sizeRange: null, minimumRequired: 2, priorityWeight: 2 },
  { line: "CS", category: "NIÑO BEBE", garmentType: "CONJUNTO CL", sizeRange: null, minimumRequired: 3, priorityWeight: 3 },
  { line: "CS", category: "NIÑA KIDS", garmentType: "CONJUNTO CL", sizeRange: null, minimumRequired: 2, priorityWeight: 2 },
  { line: "CS", category: "NIÑO KIDS", garmentType: "CONJUNTO CL", sizeRange: null, minimumRequired: 3, priorityWeight: 3 },
  // ── CS — VESTIDO / CAMISETA ───────────────────────────────────────────────
  { line: "CS", category: "NIÑA BEBE", garmentType: "VESTIDO", sizeRange: null, minimumRequired: 3, priorityWeight: 3 },
  { line: "CS", category: "NIÑO BEBE", garmentType: "CAMISETA", sizeRange: null, minimumRequired: 2, priorityWeight: 2 },
  { line: "CS", category: "NIÑA KIDS", garmentType: "VESTIDO", sizeRange: null, minimumRequired: 3, priorityWeight: 3 },
  { line: "CS", category: "NIÑO KIDS", garmentType: "CAMISETA", sizeRange: null, minimumRequired: 2, priorityWeight: 2 },
  // ── CS — Min 1 items ──────────────────────────────────────────────────────
  { line: "CS", category: "NIÑA BEBE", garmentType: "BLUSA", sizeRange: null, minimumRequired: 1, priorityWeight: 1 },
  { line: "CS", category: "NIÑA KIDS", garmentType: "BLUSA", sizeRange: null, minimumRequired: 1, priorityWeight: 1 },
  { line: "CS", category: "NIÑA BEBE", garmentType: "BUZO/CAMIBUSO", sizeRange: null, minimumRequired: 1, priorityWeight: 1 },
  { line: "CS", category: "NIÑA KIDS", garmentType: "BUZO/CAMIBUSO", sizeRange: null, minimumRequired: 1, priorityWeight: 1 },
  { line: "CS", category: "NIÑO BEBE", garmentType: "BUZO/CAMIBUSO", sizeRange: null, minimumRequired: 1, priorityWeight: 1 },
  { line: "CS", category: "NIÑO KIDS", garmentType: "BUZO/CAMIBUSO", sizeRange: null, minimumRequired: 1, priorityWeight: 1 },
  { line: "CS", category: "NIÑO BEBE", garmentType: "POLO", sizeRange: null, minimumRequired: 1, priorityWeight: 1 },
  { line: "CS", category: "NIÑO KIDS", garmentType: "POLO", sizeRange: null, minimumRequired: 1, priorityWeight: 1 },
  { line: "CS", category: "NIÑA BEBE", garmentType: "MAMELUCOS", sizeRange: null, minimumRequired: 1, priorityWeight: 1 },
  { line: "CS", category: "NIÑA KIDS", garmentType: "MAMELUCOS", sizeRange: null, minimumRequired: 1, priorityWeight: 1 },
];

export function getDerroteroRules(line?: CommercialCaseLine): ReplenishmentRule[] {
  if (!line) return DERROTERO_RULES;
  return DERROTERO_RULES.filter((r) => r.line === line);
}

// ─── Row normalizers ───────────────────────────────────────────────────────────

/**
 * Normalize a raw row from the Excel LT/CS sheet.
 * Accepts plain object (from xlsx or Prisma) → typed RawCaseRow.
 */
export function normalizeCaseRow(raw: {
  ref: string;
  desc: string | null;
  vendors: Record<string, boolean | null | undefined>;
  batches?: string[];
}): RawCaseRow {
  return {
    ref: raw.ref.trim().toUpperCase(),
    desc: (raw.desc ?? "").trim(),
    vendors: Object.fromEntries(
      Object.entries(raw.vendors).map(([k, v]) => [k.trim().toUpperCase(), !!v]),
    ),
    batches: (raw.batches ?? []).filter(Boolean).map((b) => b.trim()),
  };
}

/**
 * Normalize a raw availability record from SAG or Excel DISPONIBLE INFO sheet.
 */
export function normalizeAvailabilityRecord(raw: {
  refCode: string;
  description?: string | null;
  inventario: number;
  pedidos: number;
  disponible?: number | null;
}): RawAvailabilityRecord {
  return {
    refCode: raw.refCode.trim().toUpperCase(),
    description: (raw.description ?? "").trim(),
    inventario: raw.inventario ?? 0,
    pedidos: raw.pedidos ?? 0,
    disponible: raw.disponible ?? (raw.inventario ?? 0) - (raw.pedidos ?? 0),
  };
}

/**
 * Build an availability Map from a list of raw records.
 * Key: UPPERCASE refCode.
 */
export function buildAvailabilityMap(
  records: RawAvailabilityRecord[],
): Map<string, RawAvailabilityRecord> {
  const map = new Map<string, RawAvailabilityRecord>();
  for (const r of records) {
    map.set(r.refCode.toUpperCase(), r);
  }
  return map;
}

/**
 * Extract pending orders (SAG PD / reservas) from the availability map.
 *
 * The `pedidos` field in RawAvailabilityRecord represents reservas from the
 * SAG PD source (confirmed by Castillitos administration). These are quantities
 * reserved for pending commercial orders — they are already netted out of
 * `disponible` but represent real demand pressure that the engine must track.
 *
 * Key: UPPERCASE refCode. Value: pending order units (pedidos column).
 *
 * Rules:
 * - Only include refs with pedidos > 0 (zero-pedido refs add no pressure)
 * - AP (limpieza de pedidos) is NEVER in the availability map — excluded upstream
 */
export function buildPendingOrdersMap(
  availability: Map<string, RawAvailabilityRecord>,
): Map<string, number> {
  const pending = new Map<string, number>();
  for (const [refCode, record] of availability) {
    if (record.pedidos > 0) {
      pending.set(refCode, record.pedidos);
    }
  }
  return pending;
}
