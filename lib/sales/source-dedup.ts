/**
 * source-dedup.ts
 *
 * SAG Source-Aware Layer — Deduplication Engine
 *
 * Detects when the same business event appears in BOTH Fuente 1 (OFICIAL)
 * and Fuente 2 (REMISION), so that revenue calculations never double-count
 * the same sale.
 *
 * Matching signals (in priority order):
 *   1. originDocumentRef exact match        (highest: explicit SAG link)
 *   2. comprobante number similarity        (strong: document number)
 *   3. customerNit + amount ±10% + ±3 days  (medium: business identity)
 *   4. sellerSlug + storeSlug + amount ±5%  (weak: seller/branch/amount)
 *
 * Output:
 *   DedupMatch[]  — confirmed cross-source pairs (F2 ↔ F1 match)
 *   DedupOrphan[] — F2 records with no matching F1 (conversion risk)
 *   DedupSummary  — aggregate stats for dashboard panels
 *
 * Architecture:
 *   - All matching is in-memory from a single DB query.
 *   - No new schema changes required.
 *   - Safe when one or both sources have no data (graceful empty output).
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { assessRemisionRisk, type RemisionRisk } from "@/lib/sag/source-inference";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A confirmed cross-source pair: one F2 record matched to one F1 record. */
export interface DedupMatch {
  /** Fuente 2 record ID. */
  f2Id:              string;
  /** Fuente 1 record ID. */
  f1Id:              string;
  /** Signal that produced the match. */
  matchSignal:       DedupSignal;
  /** Confidence: 0–100. */
  confidence:        number;
  // Shared fields for display
  customerNit:       string | null;
  sellerSlug:        string;
  storeSlug:         string;
  f2Date:            Date;
  f1Date:            Date;
  /** Days between F2 dispatch and F1 invoice. */
  conversionDays:    number;
  f2Amount:          number;
  f1Amount:          number;
  amountDeltaPct:    number;  // (f1 - f2) / f2 × 100
}

/** A Fuente 2 record with no plausible Fuente 1 counterpart. */
export interface DedupOrphan {
  f2Id:           string;
  sellerSlug:     string;
  sellerName:     string;
  storeSlug:      string;
  storeName:      string;
  customerNit:    string | null;
  customerName:   string | null;
  comprobante:    string | null;
  f2Date:         Date;
  f2Amount:       number;
  daysPending:    number;
  risk:           RemisionRisk;
}

export type DedupSignal =
  | "origin_doc_ref"      // originDocumentRef exact match
  | "comprobante_number"  // document number similarity
  | "customer_amount_date" // customerNit + amount + date proximity
  | "seller_store_amount"; // seller + store + amount

export interface DedupSummary {
  hasData:            boolean;
  /** Total FUENTE_2 records loaded. */
  f2Count:            number;
  /** FUENTE_2 records matched to a FUENTE_1 counterpart. */
  matchedCount:       number;
  /** FUENTE_2 records with no FUENTE_1 counterpart (orphans). */
  orphanCount:        number;
  /** Total F2 amount. */
  f2Amount:           number;
  /** F2 amount that has been matched (converted). */
  matchedAmount:      number;
  /** F2 amount with no match (exposure). */
  orphanAmount:       number;
  /** matchedAmount / f2Amount × 100. */
  conversionRate:     number;
  /** Matched pairs. */
  matches:            DedupMatch[];
  /** Unmatched F2 records. */
  orphans:            DedupOrphan[];
  /** Orphans by risk level (for action bridge). */
  orphansByRisk: {
    low:      number;
    medium:   number;
    high:     number;
    critical: number;
  };
}

// ── Raw DB row ────────────────────────────────────────────────────────────────

type RawRow = {
  id:                 string;
  source:             string;
  sale_date:          Date;
  seller_slug:        string;
  seller_name:        string;
  store_slug:         string;
  store_name:         string;
  customer_nit:       string | null;
  customer_name:      string | null;
  amount:             number;
  comprobante:        string | null;
  comprobante_code:   string | null;
  origin_doc_ref:     string | null;
};

// ── Matching thresholds ───────────────────────────────────────────────────────

const MAX_DATE_GAP_DAYS       = 60;   // F1 must appear within 60 days of F2
const AMOUNT_TOLERANCE_HIGH   = 0.10; // ±10% for customer+date signal
const AMOUNT_TOLERANCE_LOW    = 0.05; // ±5%  for seller+store signal

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Run the deduplication engine for a given organization and period range.
 * Returns matched pairs + orphan F2 records + summary stats.
 *
 * @param organizationId
 * @param startPeriodo  YYYYMM (inclusive)
 * @param endPeriodo    YYYYMM (inclusive)
 */
export async function runSourceDedup(
  organizationId: string,
  startPeriodo:   string,
  endPeriodo:     string,
): Promise<DedupSummary> {
  // ── Load all records for both sources in the period ───────────────────────
  const rows = await prisma.$queryRaw<RawRow[]>(Prisma.sql`
    SELECT
      id,
      "sagSourceType"::text      AS source,
      "saleDate"                 AS sale_date,
      "sellerSlug"               AS seller_slug,
      "sellerName"               AS seller_name,
      "storeSlug"                AS store_slug,
      "storeName"                AS store_name,
      "customerNit"              AS customer_nit,
      "customerName"             AS customer_name,
      "amount"::float8           AS amount,
      "comprobante"              AS comprobante,
      "comprobanteCode"          AS comprobante_code,
      "originDocumentRef"        AS origin_doc_ref
    FROM "SaleRecord"
    WHERE "organizationId" = ${organizationId}
      AND COALESCE("periodoAoMes", TO_CHAR("saleDate", 'YYYYMM'))
          BETWEEN ${startPeriodo} AND ${endPeriodo}
      AND "productLine" NOT ILIKE 'Total %'
      AND "productLine" NOT ILIKE 'Subtotal%'
    ORDER BY "saleDate" ASC
  `);

  if (rows.length === 0) {
    return emptyDedupSummary();
  }

  const f1Rows = rows.filter(r => r.source === "OFICIAL");
  const f2Rows = rows.filter(r => r.source === "REMISION");

  if (f2Rows.length === 0) {
    return emptyDedupSummary();
  }

  // ── Build lookup structures for efficient matching ─────────────────────────

  // Index F1 rows by (comprobante, customerNit, sellerSlug+storeSlug) for fast lookup
  const f1ByOriginRef  = new Map<string, RawRow>();
  const f1ByComprobante = new Map<string, RawRow>();
  const f1Used          = new Set<string>(); // prevent double-matching

  for (const r of f1Rows) {
    if (r.comprobante)    f1ByComprobante.set(r.comprobante.trim(), r);
    if (r.origin_doc_ref) f1ByOriginRef.set(r.origin_doc_ref.trim(), r);
  }

  // ── Match each F2 record ───────────────────────────────────────────────────

  const matches:  DedupMatch[]  = [];
  const orphans:  DedupOrphan[] = [];
  const matchedF2Ids = new Set<string>();

  for (const f2 of f2Rows) {
    const match = findF1Match(f2, f1Rows, f1ByOriginRef, f1ByComprobante, f1Used);
    if (match) {
      matches.push(match);
      matchedF2Ids.add(f2.id);
      f1Used.add(match.f1Id);
    }
  }

  // ── Identify orphans ───────────────────────────────────────────────────────

  const now = new Date();
  for (const f2 of f2Rows) {
    if (matchedF2Ids.has(f2.id)) continue;
    const daysPending = Math.floor((now.getTime() - new Date(f2.sale_date).getTime()) / 86_400_000);
    orphans.push({
      f2Id:        f2.id,
      sellerSlug:  f2.seller_slug,
      sellerName:  f2.seller_name,
      storeSlug:   f2.store_slug,
      storeName:   f2.store_name,
      customerNit: f2.customer_nit,
      customerName: f2.customer_name,
      comprobante: f2.comprobante,
      f2Date:      new Date(f2.sale_date),
      f2Amount:    f2.amount,
      daysPending,
      risk:        assessRemisionRisk(daysPending),
    });
  }

  // ── Aggregate stats ────────────────────────────────────────────────────────

  const f2Amount      = f2Rows.reduce((s, r) => s + r.amount, 0);
  const matchedAmount = matches.reduce((s, m) => s + m.f2Amount, 0);
  const orphanAmount  = orphans.reduce((s, o) => s + o.f2Amount, 0);

  const orphansByRisk = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const o of orphans) {
    if (o.risk === "NONE" || o.risk === "LOW") orphansByRisk.low++;
    else if (o.risk === "MEDIUM")              orphansByRisk.medium++;
    else if (o.risk === "HIGH")                orphansByRisk.high++;
    else if (o.risk === "CRITICAL")            orphansByRisk.critical++;
  }

  return {
    hasData:        f2Rows.length > 0,
    f2Count:        f2Rows.length,
    matchedCount:   matches.length,
    orphanCount:    orphans.length,
    f2Amount,
    matchedAmount,
    orphanAmount,
    conversionRate: f2Amount > 0 ? (matchedAmount / f2Amount) * 100 : 100,
    matches:        matches.sort((a, b) => b.conversionDays - a.conversionDays),
    orphans:        orphans.sort((a, b) => b.daysPending - a.daysPending),
    orphansByRisk,
  };
}

// ── Matching helper ───────────────────────────────────────────────────────────

function findF1Match(
  f2:              RawRow,
  f1Rows:          RawRow[],
  f1ByOriginRef:   Map<string, RawRow>,
  f1ByComprobante: Map<string, RawRow>,
  f1Used:          Set<string>,
): DedupMatch | null {

  // Signal 1: originDocumentRef exact match
  if (f2.comprobante) {
    const candidate = f1ByOriginRef.get(f2.comprobante.trim());
    if (candidate && !f1Used.has(candidate.id)) {
      return buildMatch(f2, candidate, "origin_doc_ref", 98);
    }
  }
  if (f2.origin_doc_ref) {
    const candidate = f1ByComprobante.get(f2.origin_doc_ref.trim());
    if (candidate && !f1Used.has(candidate.id)) {
      return buildMatch(f2, candidate, "origin_doc_ref", 98);
    }
  }

  // Signal 2: comprobante number similarity (prefix match — e.g. "FV-001234" matches "NV-001234")
  if (f2.comprobante) {
    const f2Num = extractDocumentNumber(f2.comprobante);
    if (f2Num) {
      for (const f1 of f1Rows) {
        if (f1Used.has(f1.id)) continue;
        const f1Num = f1.comprobante ? extractDocumentNumber(f1.comprobante) : null;
        if (f1Num && f1Num === f2Num && withinDateRange(f2.sale_date, f1.sale_date, MAX_DATE_GAP_DAYS)) {
          return buildMatch(f2, f1, "comprobante_number", 90);
        }
      }
    }
  }

  // Signal 3: customerNit + amount tolerance + date proximity
  if (f2.customer_nit) {
    for (const f1 of f1Rows) {
      if (f1Used.has(f1.id)) continue;
      if (f1.customer_nit !== f2.customer_nit) continue;
      if (!withinDateRange(f2.sale_date, f1.sale_date, MAX_DATE_GAP_DAYS)) continue;
      if (!withinAmountTolerance(f2.amount, f1.amount, AMOUNT_TOLERANCE_HIGH)) continue;
      return buildMatch(f2, f1, "customer_amount_date", 75);
    }
  }

  // Signal 4: sellerSlug + storeSlug + amount (tight tolerance)
  for (const f1 of f1Rows) {
    if (f1Used.has(f1.id)) continue;
    if (f1.seller_slug !== f2.seller_slug) continue;
    if (f1.store_slug  !== f2.store_slug)  continue;
    if (!withinDateRange(f2.sale_date, f1.sale_date, MAX_DATE_GAP_DAYS)) continue;
    if (!withinAmountTolerance(f2.amount, f1.amount, AMOUNT_TOLERANCE_LOW)) continue;
    return buildMatch(f2, f1, "seller_store_amount", 55);
  }

  return null;
}

function buildMatch(f2: RawRow, f1: RawRow, signal: DedupSignal, confidence: number): DedupMatch {
  const conversionDays = Math.floor(
    (new Date(f1.sale_date).getTime() - new Date(f2.sale_date).getTime()) / 86_400_000,
  );
  const amountDeltaPct = f2.amount > 0 ? ((f1.amount - f2.amount) / f2.amount) * 100 : 0;
  return {
    f2Id:           f2.id,
    f1Id:           f1.id,
    matchSignal:    signal,
    confidence,
    customerNit:    f2.customer_nit,
    sellerSlug:     f2.seller_slug,
    storeSlug:      f2.store_slug,
    f2Date:         new Date(f2.sale_date),
    f1Date:         new Date(f1.sale_date),
    conversionDays: Math.max(0, conversionDays),
    f2Amount:       f2.amount,
    f1Amount:       f1.amount,
    amountDeltaPct,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDocumentNumber(comprobante: string): string | null {
  // Extract numeric suffix: "FV-001234" → "001234", "NV001234" → "001234"
  const match = comprobante.replace(/\s/g, "").match(/\d{4,}$/);
  return match ? match[0] : null;
}

function withinDateRange(d1: Date, d2: Date, maxDays: number): boolean {
  const diff = Math.abs(new Date(d2).getTime() - new Date(d1).getTime()) / 86_400_000;
  return diff <= maxDays;
}

function withinAmountTolerance(a: number, b: number, tolerance: number): boolean {
  if (a === 0 && b === 0) return true;
  if (a === 0 || b === 0) return false;
  return Math.abs((b - a) / a) <= tolerance;
}

function emptyDedupSummary(): DedupSummary {
  return {
    hasData:        false,
    f2Count:        0,
    matchedCount:   0,
    orphanCount:    0,
    f2Amount:       0,
    matchedAmount:  0,
    orphanAmount:   0,
    conversionRate: 100,
    matches:        [],
    orphans:        [],
    orphansByRisk:  { low: 0, medium: 0, high: 0, critical: 0 },
  };
}

// ── Convenience: orphan summary for alerts ────────────────────────────────────

/**
 * Returns only orphan F2 records (no dedup matching), optimized for
 * the source action bridge where we only need the unmatched set.
 *
 * @deprecated Prefer getPersistedOrphans() when SourceMatchRecord is populated.
 * This function still works as a fallback for periods not yet backfilled.
 */
export async function getOrphanRemisiones(
  organizationId: string,
  periodoAoMes:   string,
  minAgeDays      = 7,
): Promise<DedupOrphan[]> {
  const summary = await runSourceDedup(organizationId, periodoAoMes, periodoAoMes);
  return summary.orphans.filter(o => o.daysPending >= minAgeDays);
}

// ── Persistence layer ─────────────────────────────────────────────────────────
//
// Writes DedupSummary results to SourceMatchRecord so all downstream modules
// (conversion-tracking, remision-monitor, source-alerts, Customer 360) read
// from the persisted table instead of re-computing an O(n²) in-memory scan.
//
// Called fire-and-forget from import-service.ts after every import batch.
// Safe to re-run: upserts on (organizationId, f2RecordId).

/**
 * Persist the results of runSourceDedup() into the SourceMatchRecord table.
 * One row per F2 SaleRecord — matched rows have f1RecordId set, orphans have it null.
 *
 * Uses upsert keyed on (organizationId, f2RecordId) so re-imports are idempotent.
 */
export async function persistDedupResults(
  organizationId: string,
  periodoAoMes:   string,
  summary:        DedupSummary,
): Promise<void> {
  if (!summary.hasData) return;

  const now = new Date();

  // Build upsert payloads for matched F2 records
  const matchedPayloads = summary.matches.map(m => ({
    organizationId,
    f2RecordId:    m.f2Id,
    f1RecordId:    m.f1Id,
    periodoAoMes,
    isOrphan:      false,
    matchSignal:   m.matchSignal,
    confidence:    m.confidence,
    conversionDays: m.conversionDays,
    amountDeltaPct: m.amountDeltaPct,
    orphanRisk:    null as string | null,
    orphanDays:    null as number | null,
    customerNit:   m.customerNit,
    sellerSlug:    m.sellerSlug,
    storeSlug:     m.storeSlug,
    f2Amount:      m.f2Amount,
    f2Date:        m.f2Date,
    generatedAt:   now,
    updatedAt:     now,
  }));

  // Build upsert payloads for orphan F2 records
  const orphanPayloads = summary.orphans.map(o => ({
    organizationId,
    f2RecordId:    o.f2Id,
    f1RecordId:    null as string | null,
    periodoAoMes,
    isOrphan:      true,
    matchSignal:   null as string | null,
    confidence:    null as number | null,
    conversionDays: null as number | null,
    amountDeltaPct: null as number | null,
    orphanRisk:    o.risk as string,
    orphanDays:    o.daysPending,
    customerNit:   o.customerNit,
    sellerSlug:    o.sellerSlug,
    storeSlug:     o.storeSlug,
    f2Amount:      o.f2Amount,
    f2Date:        o.f2Date,
    generatedAt:   now,
    updatedAt:     now,
  }));

  const allPayloads = [...matchedPayloads, ...orphanPayloads];
  if (allPayloads.length === 0) return;

  // Upsert in batches of 200 to avoid parameter limit
  const BATCH = 200;
  for (let i = 0; i < allPayloads.length; i += BATCH) {
    const chunk = allPayloads.slice(i, i + BATCH);
    await (prisma as any).sourceMatchRecord.createMany({
      data:           chunk,
      skipDuplicates: false,
    }).catch(async () => {
      // createMany with skipDuplicates=false fails on conflict — fall back to individual upserts
      for (const row of chunk) {
        await (prisma as any).sourceMatchRecord.upsert({
          where: {
            organizationId_f2RecordId: {
              organizationId: row.organizationId,
              f2RecordId:     row.f2RecordId,
            },
          },
          create: row,
          update: {
            f1RecordId:     row.f1RecordId,
            isOrphan:       row.isOrphan,
            matchSignal:    row.matchSignal,
            confidence:     row.confidence,
            conversionDays: row.conversionDays,
            amountDeltaPct: row.amountDeltaPct,
            orphanRisk:     row.orphanRisk,
            orphanDays:     row.orphanDays,
            generatedAt:    row.generatedAt,
            updatedAt:      row.updatedAt,
          },
        }).catch(() => { /* skip individual failure — non-blocking */ });
      }
    });
  }
}

// ── Persisted orphan queries ──────────────────────────────────────────────────
//
// These read from SourceMatchRecord and should be used by all downstream modules
// instead of calling runSourceDedup() directly.

export interface PersistedOrphan {
  f2RecordId:  string;
  sellerSlug:  string;
  storeSlug:   string;
  customerNit: string | null;
  f2Amount:    number;
  f2Date:      Date;
  orphanRisk:  string;
  orphanDays:  number;
  periodoAoMes: string;
}

/**
 * Returns persisted orphan records for a period from SourceMatchRecord.
 * Much faster than runSourceDedup() — single indexed table scan, no in-memory matching.
 *
 * Falls back to getOrphanRemisiones() if the table is empty for this period
 * (i.e., before the first import with persistence, or for backfill periods).
 */
export async function getPersistedOrphans(
  organizationId: string,
  periodoAoMes:   string,
  minOrphanDays   = 0,
): Promise<PersistedOrphan[]> {
  const rows = await (prisma as any).sourceMatchRecord.findMany({
    where: {
      organizationId,
      periodoAoMes,
      isOrphan: true,
      ...(minOrphanDays > 0 ? { orphanDays: { gte: minOrphanDays } } : {}),
    },
    select: {
      f2RecordId:   true,
      sellerSlug:   true,
      storeSlug:    true,
      customerNit:  true,
      f2Amount:     true,
      f2Date:       true,
      orphanRisk:   true,
      orphanDays:   true,
      periodoAoMes: true,
    },
    orderBy: { orphanDays: "desc" },
  }) as PersistedOrphan[];

  // Fallback: if table is empty for this period, compute on-the-fly
  if (rows.length === 0) {
    const legacyOrphans = await getOrphanRemisiones(organizationId, periodoAoMes, minOrphanDays);
    return legacyOrphans.map(o => ({
      f2RecordId:   o.f2Id,
      sellerSlug:   o.sellerSlug,
      storeSlug:    o.storeSlug,
      customerNit:  o.customerNit,
      f2Amount:     o.f2Amount,
      f2Date:       o.f2Date,
      orphanRisk:   o.risk as string,
      orphanDays:   o.daysPending,
      periodoAoMes,
    }));
  }

  return rows;
}

export interface OrphanSummary {
  organizationId:  string;
  periodoAoMes:    string;
  totalOrphans:    number;
  totalAmount:     number;
  conversionRate:  number;  // (totalF2 - orphanAmount) / totalF2 * 100 — from SourceMatchRecord
  byRisk: {
    none:     { count: number; amount: number };
    low:      { count: number; amount: number };
    medium:   { count: number; amount: number };
    high:     { count: number; amount: number };
    critical: { count: number; amount: number };
  };
  bySeller: Array<{
    sellerSlug:  string;
    count:       number;
    amount:      number;
    maxDays:     number;
    risk:        string;
  }>;
  byCustomer: Array<{
    customerNit: string | null;
    count:       number;
    amount:      number;
    maxDays:     number;
  }>;
}

/**
 * Authoritative orphan summary for a period, read from SourceMatchRecord.
 * This is the single function all modules should use for orphan KPIs.
 *
 * Returns conversion rate = how much of total F2 was successfully matched to F1.
 */
export async function getOrphanSummary(
  organizationId: string,
  periodoAoMes:   string,
): Promise<OrphanSummary> {
  // All SourceMatchRecord rows for the period (matched + orphans)
  const allRows = await (prisma as any).sourceMatchRecord.findMany({
    where: { organizationId, periodoAoMes },
    select: {
      isOrphan:    true,
      orphanRisk:  true,
      orphanDays:  true,
      f2Amount:    true,
      sellerSlug:  true,
      customerNit: true,
    },
  }) as Array<{
    isOrphan:   boolean;
    orphanRisk: string | null;
    orphanDays: number | null;
    f2Amount:   number;
    sellerSlug: string;
    customerNit: string | null;
  }>;

  if (allRows.length === 0) {
    return {
      organizationId,
      periodoAoMes,
      totalOrphans:   0,
      totalAmount:    0,
      conversionRate: 100,
      byRisk:         { none: { count: 0, amount: 0 }, low: { count: 0, amount: 0 }, medium: { count: 0, amount: 0 }, high: { count: 0, amount: 0 }, critical: { count: 0, amount: 0 } },
      bySeller:       [],
      byCustomer:     [],
    };
  }

  const orphanRows    = allRows.filter(r => r.isOrphan);
  const totalF2Amount = allRows.reduce((s, r) => s + r.f2Amount, 0);
  const orphanAmount  = orphanRows.reduce((s, r) => s + r.f2Amount, 0);
  const matchedAmount = totalF2Amount - orphanAmount;
  const conversionRate = totalF2Amount > 0 ? (matchedAmount / totalF2Amount) * 100 : 100;

  // Risk buckets
  const byRisk = {
    none:     { count: 0, amount: 0 },
    low:      { count: 0, amount: 0 },
    medium:   { count: 0, amount: 0 },
    high:     { count: 0, amount: 0 },
    critical: { count: 0, amount: 0 },
  };
  for (const r of orphanRows) {
    const risk = (r.orphanRisk ?? "none").toLowerCase() as keyof typeof byRisk;
    const bucket = byRisk[risk] ?? byRisk.none;
    bucket.count++;
    bucket.amount += r.f2Amount;
  }

  // By seller
  const sellerMap = new Map<string, { count: number; amount: number; maxDays: number; risk: string }>();
  for (const r of orphanRows) {
    const ex = sellerMap.get(r.sellerSlug) ?? { count: 0, amount: 0, maxDays: 0, risk: "NONE" };
    ex.count++;
    ex.amount  += r.f2Amount;
    const days  = r.orphanDays ?? 0;
    if (days > ex.maxDays) { ex.maxDays = days; ex.risk = r.orphanRisk ?? "NONE"; }
    sellerMap.set(r.sellerSlug, ex);
  }

  // By customer
  const customerMap = new Map<string, { count: number; amount: number; maxDays: number }>();
  for (const r of orphanRows) {
    const key = r.customerNit ?? "__unknown__";
    const ex  = customerMap.get(key) ?? { count: 0, amount: 0, maxDays: 0 };
    ex.count++;
    ex.amount  += r.f2Amount;
    ex.maxDays  = Math.max(ex.maxDays, r.orphanDays ?? 0);
    customerMap.set(key, ex);
  }

  return {
    organizationId,
    periodoAoMes,
    totalOrphans:   orphanRows.length,
    totalAmount:    orphanAmount,
    conversionRate,
    byRisk,
    bySeller: [...sellerMap.entries()]
      .map(([sellerSlug, v]) => ({ sellerSlug, ...v }))
      .sort((a, b) => b.amount - a.amount),
    byCustomer: [...customerMap.entries()]
      .map(([customerNit, v]) => ({ customerNit: customerNit === "__unknown__" ? null : customerNit, ...v }))
      .sort((a, b) => b.amount - a.amount),
  };
}
