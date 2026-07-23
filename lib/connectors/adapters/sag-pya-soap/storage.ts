/**
 * sag-pya-soap/storage.ts
 *
 * Prisma-backed StorageHandler implementations for the SAG PYA SOAP adapter.
 *
 * CustomerProfileStorageHandler
 *   - Upserts into CustomerProfile using (organizationId, slug) as the natural key.
 *   - Updates ERP-sourced fields on every sync; preserves CRM fields (crmId,
 *     crmSyncedAt, rawCrmJson) so a CRM sync does not overwrite ERP data and
 *     vice versa.
 *   - Sets erpSyncedAt = now() and rawErpJson = record.meta on every upsert.
 *
 * CustomerReceivableStorageHandler
 *   - Upserts into CustomerReceivable using (organizationId, erpId) as the
 *     natural key (@@unique constraint in schema).
 *   - After upserting each batch it recomputes CustomerProfile.totalReceivable,
 *     overdueReceivable and maxDpd for every affected NIT so aggregate KPIs
 *     stay accurate without a separate reconciliation job.
 *
 * Batch size for the transaction-level upsert.
 *
 * Each batch of BATCH_SIZE rows is wrapped in a single Prisma $transaction so
 * all upserts share ONE pg Pool connection (one BEGIN / COMMIT pair).
 * Without this, each individual upsert acquires/releases its own connection from
 * the Neon PgBouncer pool — at ~600 ms overhead per acquire on the Neon free tier,
 * 124 920 rows would take ~21 hours. With $transaction the overhead is paid once
 * per batch, reducing total write time by ~100×.
 */

import { createHash } from "crypto";
import { prisma }       from "@/lib/prisma";
import type { RunContext, StorageHandler, UnifiedCollection, UnifiedCustomer, UnifiedMovement, UnifiedReceivable, UnifiedSagOrder } from "@/lib/connectors/core/types";

const BATCH_SIZE      = 500;
const SALE_BATCH_SIZE = 200;

// ── Slug helpers ──────────────────────────────────────────────────────────────

function toSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
}

/**
 * Normalise a Colombian NIT to its canonical 9-digit form.
 * Mirrors castillitos-crm/storage.ts so ERP and CRM rows share the same slug:
 *   "1050956925"  → "105095692"   (10-digit: strip concatenated DV)
 *   "900123456-7" → "900123456"   (9-digit + "-DV": strip dash suffix)
 *   "29774696"    → "29774696"    (8-digit: already canonical, no change)
 */
function normalizeNit(raw: string): string {
  let s = raw.trim().replace(/[\.\s]/g, "");
  s = s.replace(/-\d$/, "");
  if (/^\d{10}$/.test(s)) s = s.slice(0, 9);
  return s;
}

/**
 * Build the canonical customer slug.
 * When a taxId is present, normalise it first so SAG (ERP) and CRM rows
 * sharing the same NIT map to the same slug regardless of DV-digit differences.
 */
function customerSlug(taxId: string | undefined, name: string): string {
  const base = taxId ? normalizeNit(taxId) : name;
  return toSlug(base);
}

// ── Aging bucket helper ───────────────────────────────────────────────────────

function agingBucket(daysOverdue: number): string {
  if (daysOverdue <= 0)  return "CURRENT";
  if (daysOverdue <= 30) return "1-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

// ── CustomerProfileStorageHandler ─────────────────────────────────────────────

export const customerProfileStorage: StorageHandler<UnifiedCustomer> = {
  async upsertMany(
    records: UnifiedCustomer[],
    ctx:     RunContext
  ): Promise<{ imported: number; skipped: number; errored: number }> {
    let imported = 0;
    let skipped  = 0;
    let errored  = 0;

    const now = new Date();

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      for (const record of batch) {
        const slug = customerSlug(record.taxId, record.name);

        try {
          await prisma.customerProfile.upsert({
            where: {
              organizationId_slug: {
                organizationId: ctx.orgId,
                slug,
              },
            },
            create: {
              organizationId: ctx.orgId,
              slug,
              erpId:         record.sourceId,
              nit:           record.taxId      ?? null,
              // S1: populate nitNormalized so resolveCustomerForQuery can use it
              // as the canonical lookup key without relying on the legacy nit field.
              nitNormalized: record.taxId ? normalizeNit(record.taxId) : null,
              name:          record.name,
              email:         record.email      ?? null,
              phone:         record.phone      ?? null,
              // CUSTOMER-DATA-FOUNDATION-01: write address from SAG sc_direccion.
              // Only write when SAG provides a non-empty value.
              ...(record.address?.line1 ? { address: record.address.line1 } : {}),
              // CUSTOMER-GEOGRAPHY-RECOVERY-01: SAG city/department are unresolvable FK integers.
              // Geography is owned by CRM (DANE codes). SAG must never write these fields.
              sellerName:    record.salesRepName        ?? null,
              sellerSlug:    record.salesRepName ? toSlug(record.salesRepName) : null,
              customerType:  "B2B",
              erpSyncedAt:   now,
              rawErpJson:    (record.meta ?? {}) as object,
              // NOTE: sagTerceroId is NOT set here because UnifiedCustomer does not carry
              // ka_nl_tercero. It is populated post-sync by linkCustomerSagTerceroIds()
              // using CollectionRecord as the bridge (see lib/customer360/service.ts).
            },
            update: {
              // ERP fields — always overwrite with latest data from SAG
              erpId:         record.sourceId,
              nit:           record.taxId      ?? null,
              // S1: keep nitNormalized in sync with nit on every SAG TERCEROS sync
              nitNormalized: record.taxId ? normalizeNit(record.taxId) : null,
              name:          record.name,
              email:         record.email      ?? null,
              phone:         record.phone      ?? null,
              // CUSTOMER-DATA-FOUNDATION-01: update address from SAG sc_direccion.
              // Only overwrite when SAG provides a non-empty value — never erase
              // an existing address (CRM or manual) with null/empty.
              ...(record.address?.line1 ? { address: record.address.line1 } : {}),
              // CUSTOMER-GEOGRAPHY-RECOVERY-01: city/department intentionally omitted.
              // CRM DANE codes are authoritative — SAG FK integers must not overwrite.
              sellerName:    record.salesRepName        ?? null,
              sellerSlug:    record.salesRepName ? toSlug(record.salesRepName) : null,
              erpSyncedAt:   now,
              rawErpJson:    (record.meta ?? {}) as object,
              // CRM fields (crmId, crmSyncedAt, rawCrmJson) are intentionally
              // omitted here — they must only be written by the CRM adapter.
              // sagTerceroId is intentionally NOT updated here — managed by linkCustomerSagTerceroIds().
            },
          });
          imported++;
        } catch (e) {
          console.error(
            `[CustomerProfileStorage] Failed to upsert slug="${slug}" orgId="${ctx.orgId}":`,
            (e as Error).message
          );
          errored++;
        }
      }
    }

    return { imported, skipped, errored };
  },
};

// ── CustomerReceivableStorageHandler ──────────────────────────────────────────

export const customerReceivableStorage: StorageHandler<UnifiedReceivable> = {
  async upsertMany(
    records: UnifiedReceivable[],
    ctx:     RunContext
  ): Promise<{ imported: number; skipped: number; errored: number }> {
    let imported = 0;
    let skipped  = 0;
    let errored  = 0;

    // Collect affected NITs for post-batch KPI refresh
    const affectedNits = new Set<string>();

    const now = new Date();

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      // Pre-validate: separate valid records from those missing erpId.
      const valid:   typeof batch = [];
      const invalid: typeof batch = [];
      for (const record of batch) {
        if (!record.sourceId) invalid.push(record);
        else                  valid.push(record);
      }
      skipped += invalid.length;

      if (valid.length === 0) continue;

      // Build all upsert operations for this batch.
      // Wrapping them in a single $transaction ensures they all execute on ONE
      // pg Pool connection (one BEGIN/COMMIT pair) instead of acquiring a new
      // connection per row — eliminating the ~600 ms/row Neon pool overhead.
      const ops = valid.map(record => {
        const erpId     = record.sourceId;
        const bucket    = agingBucket(record.daysOverdue);
        const statusStr = record.status.toUpperCase();
        return prisma.customerReceivable.upsert({
          where:  { organizationId_erpId: { organizationId: ctx.orgId, erpId } },
          create: {
            organizationId: ctx.orgId,
            erpId,
            invoiceNumber:  record.invoiceRef    ?? null,
            customerNit:    record.customerTaxId ?? null,
            customerName:   record.customerName,
            originalAmount: record.originalAmount,
            paidAmount:     record.paidAmount,
            balanceDue:     record.balanceDue,
            currency:       record.currency,
            invoiceDate:    record.issueDate,
            dueDate:        record.dueDate,
            paidAt:         record.paidDate      ?? null,
            daysOverdue:    record.daysOverdue,
            agingBucket:    bucket,
            status:         statusStr,
            rawErpJson:     (record.meta ?? {}) as object,
            syncedAt:       now,
          },
          update: {
            invoiceNumber:  record.invoiceRef    ?? null,
            customerNit:    record.customerTaxId ?? null,
            customerName:   record.customerName,
            originalAmount: record.originalAmount,
            paidAmount:     record.paidAmount,
            balanceDue:     record.balanceDue,
            currency:       record.currency,
            invoiceDate:    record.issueDate,
            dueDate:        record.dueDate,
            paidAt:         record.paidDate      ?? null,
            daysOverdue:    record.daysOverdue,
            agingBucket:    bucket,
            status:         statusStr,
            rawErpJson:     (record.meta ?? {}) as object,
            syncedAt:       now,
          },
        });
      });

      try {
        // query_timeout: 30_000 on the pg Pool (lib/prisma.ts) is the primary
        // safeguard: each individual SQL statement inside this transaction
        // will throw if Neon doesn't respond within 30 s, preventing the
        // zombie-connection hang seen when Neon kills idle-in-transaction
        // sessions after 5 minutes.
        await prisma.$transaction(ops);
        for (const record of valid) {
          if (record.customerTaxId) affectedNits.add(record.customerTaxId);
          imported++;
        }
      } catch (e) {
        // If the transaction fails (timeout, dead connection, constraint violation),
        // fall back to row-by-row to isolate the bad record and avoid losing the batch.
        console.error(
          `[CustomerReceivableStorage] Transaction for batch[${i}..${i + valid.length - 1}] failed ` +
          `(${(e as Error).message}), retrying row-by-row`
        );
        for (const record of valid) {
          const erpId     = record.sourceId;
          const bucket    = agingBucket(record.daysOverdue);
          const statusStr = record.status.toUpperCase();
          try {
            await prisma.customerReceivable.upsert({
              where:  { organizationId_erpId: { organizationId: ctx.orgId, erpId } },
              create: {
                organizationId: ctx.orgId,
                erpId,
                invoiceNumber:  record.invoiceRef    ?? null,
                customerNit:    record.customerTaxId ?? null,
                customerName:   record.customerName,
                originalAmount: record.originalAmount,
                paidAmount:     record.paidAmount,
                balanceDue:     record.balanceDue,
                currency:       record.currency,
                invoiceDate:    record.issueDate,
                dueDate:        record.dueDate,
                paidAt:         record.paidDate      ?? null,
                daysOverdue:    record.daysOverdue,
                agingBucket:    bucket,
                status:         statusStr,
                rawErpJson:     (record.meta ?? {}) as object,
                syncedAt:       now,
              },
              update: {
                invoiceNumber:  record.invoiceRef    ?? null,
                customerNit:    record.customerTaxId ?? null,
                customerName:   record.customerName,
                originalAmount: record.originalAmount,
                paidAmount:     record.paidAmount,
                balanceDue:     record.balanceDue,
                currency:       record.currency,
                invoiceDate:    record.issueDate,
                dueDate:        record.dueDate,
                paidAt:         record.paidDate      ?? null,
                daysOverdue:    record.daysOverdue,
                agingBucket:    bucket,
                status:         statusStr,
                rawErpJson:     (record.meta ?? {}) as object,
                syncedAt:       now,
              },
            });
            if (record.customerTaxId) affectedNits.add(record.customerTaxId);
            imported++;
          } catch (rowErr) {
            console.error(
              `[CustomerReceivableStorage] Row fallback failed erpId="${erpId}":`,
              (rowErr as Error).message
            );
            errored++;
          }
        }
      }
    }

    // ── Refresh CustomerProfile KPIs for affected NITs ────────────────────────
    // We do this outside the per-record loop so we aggregate once per NIT
    // rather than once per document.
    for (const nit of affectedNits) {
      await refreshProfileReceivables(ctx.orgId, nit).catch(e =>
        console.error(
          `[CustomerReceivableStorage] KPI refresh failed for nit="${nit}":`,
          (e as Error).message
        )
      );
    }

    return { imported, skipped, errored };
  },
};

// ── KPI refresh helper ────────────────────────────────────────────────────────

/**
 * Recomputes totalReceivable, overdueReceivable, and maxDpd on the
 * CustomerProfile that matches the given NIT within the organisation.
 *
 * Only looks at non-PAID / non-WRITTEN_OFF rows for overdue/total.
 * This is a best-effort operation — failures are caught by the caller.
 */
async function refreshProfileReceivables(
  organizationId: string,
  nit: string
): Promise<void> {
  // Aggregate open receivables for this NIT — canonical filter (mirrors RX_OPEN_STATUSES)
  const agg = await prisma.customerReceivable.aggregate({
    where: {
      organizationId,
      customerNit: nit,
      status:      { in: ["OPEN", "PARTIAL", "OVERDUE"] },
    },
    _sum: { balanceDue: true },
    _max: { daysOverdue: true },
  });

  const overdueAgg = await prisma.customerReceivable.aggregate({
    where: {
      organizationId,
      customerNit: nit,
      status:      { in: ["OPEN", "PARTIAL", "OVERDUE"] },
      daysOverdue: { gt: 0 },
    },
    _sum: { balanceDue: true },
  });

  const totalReceivable   = agg._sum.balanceDue     ?? 0;
  const overdueReceivable = overdueAgg._sum.balanceDue ?? 0;
  const maxDpd            = agg._max.daysOverdue    ?? 0;

  // Find the CustomerProfile by NIT.
  // Search by both nitNormalized (canonical) and legacy nit field.
  // LEGACY_NIT_JOIN: once all profiles have nitNormalized set, the nit fallback can be removed.
  const db = prisma as any;
  const profile = await db.customerProfile.findFirst({
    where: {
      organizationId,
      OR: [
        { nitNormalized: nit },
        { nit: nit },
      ],
    },
    select: { id: true },
  });

  if (!profile) return; // profile not yet synced — will be linked on next customers sync

  await prisma.customerProfile.update({
    where: { id: profile.id },
    data: {
      totalReceivable,
      overdueReceivable,
      maxDpd,
    },
  });
}

// ── SaleRecord storage handler ────────────────────────────────────────────────

function movementNaturalKey(erpMovId: number): string {
  return createHash("sha256").update(`MOV-${erpMovId}`).digest("hex").slice(0, 16);
}

function toSlugLocal(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 80);
}

/**
 * Lazily resolve (or create) the SalesImportBatch for a connector sync run.
 * One batch is created per runId — reused across pages of the same run.
 */
async function resolveBatchId(orgId: string, runId: string): Promise<string> {
  const db = prisma as any;
  const existing = await db.salesImportBatch.findFirst({
    where: { organizationId: orgId, scopeType: "ADHOC", scopeKey: runId },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await db.salesImportBatch.create({
    data: {
      organizationId: orgId,
      scopeType: "ADHOC",
      scopeKey: runId,
      source: "sag_pya_soap",
      grain: "TRANSACTION",
      status: "PROCESSING",
    },
    select: { id: true },
  });
  return created.id;
}

export const saleRecordStorage: StorageHandler<UnifiedMovement> = {
  async upsertMany(
    records: UnifiedMovement[],
    ctx:     RunContext
  ): Promise<{ imported: number; skipped: number; errored: number }> {
    if (records.length === 0) return { imported: 0, skipped: 0, errored: 0 };

    const importBatchId = await resolveBatchId(ctx.orgId, ctx.runId);
    const db = prisma as any;
    let imported = 0, skipped = 0, errored = 0;
    const now = new Date();

    for (let i = 0; i < records.length; i += SALE_BATCH_SIZE) {
      const batch = records.slice(i, i + SALE_BATCH_SIZE);

      const ops = batch
        .filter(r => r.erpMovId > 0)
        .map(r => {
          const nk = movementNaturalKey(r.erpMovId);
          const saleDateUtc = new Date(
            Date.UTC(r.saleDate.getFullYear(), r.saleDate.getMonth(), r.saleDate.getDate())
          );
          const periodoAoMes = `${r.saleDate.getFullYear()}${String(r.saleDate.getMonth() + 1).padStart(2, "0")}`;
          const storeSlug = r.storeSlug || toSlugLocal(r.storeName || "sin-tienda");
          const fields = {
            organizationId: ctx.orgId,
            importBatchId,
            grain:           "TRANSACTION",
            saleDate:        saleDateUtc,
            periodoAoMes,
            sellerSlug:      "sin-vendedor",
            sellerName:      "Sin Vendedor",
            storeSlug,
            storeName:       r.storeName,
            productLine:     "SAG",
            channel:         r.channel,
            comprobanteCode: r.comprobanteCode ?? null,
            comprobante:     r.comprobante,
            sagDocumentFamily: r.sagDocumentFamily,
            sagSourceType:   r.sagSourceType,
            sourceDocumentStage: r.sagSourceType === "REMISION" ? "REMITIDO" : "FACTURADO",
            sourceInferredFrom:  "family",
            customerNit:     r.customerTaxId ?? null,
            customerName:    r.customerName,
            amount:          r.amount,
            currency:        r.currency,
            txCount:         1,
            naturalKey:      nk,
            rawJson:         (r.meta ?? {}) as object,
          };
          return db.saleRecord.upsert({
            where:  { organizationId_naturalKey: { organizationId: ctx.orgId, naturalKey: nk } },
            create: fields,
            update: {
              importBatchId,
              saleDate:         fields.saleDate,
              periodoAoMes:     fields.periodoAoMes,
              storeSlug:        fields.storeSlug,
              storeName:        fields.storeName,
              channel:          fields.channel,
              comprobanteCode:  fields.comprobanteCode,
              comprobante:      fields.comprobante,
              sagDocumentFamily: fields.sagDocumentFamily,
              sagSourceType:    fields.sagSourceType,
              sourceDocumentStage: fields.sourceDocumentStage,
              customerNit:      fields.customerNit,
              customerName:     fields.customerName,
              amount:           fields.amount,
              currency:         fields.currency,
              rawJson:          fields.rawJson,
            },
          });
        });

      if (ops.length === 0) { skipped += batch.length; continue; }

      const results = await Promise.allSettled(ops);
      for (const r of results) {
        if (r.status === "fulfilled") imported++;
        else {
          console.error(`[SaleRecordStorage] Upsert failed: ${r.reason?.message}`);
          errored++;
        }
      }
      skipped += batch.length - ops.length;
    }

    // Update batch status
    await (prisma as any).salesImportBatch.update({
      where: { id: importBatchId },
      data:  { status: "DONE", importedCount: { increment: imported } },
    }).catch(() => {/* non-fatal */});

    return { imported, skipped, errored };
  },
};

// ── CollectionRecord storage handler ─────────────────────────────────────────
//
// Upserts cobro payment records from v_pagosnew into CollectionRecord.
// Dedup key: (organizationId, naturalKey) — naturalKey = record.sourceId from mapper.
// Batch strategy: Promise.allSettled per batch (same as CustomerOrderRecord).
// No post-batch KPI refresh needed here — getCobrosKpis() reads live from the table.

const COLLECTION_BATCH_SIZE = 200;

export const collectionStorage: StorageHandler<UnifiedCollection> = {
  async upsertMany(
    records: UnifiedCollection[],
    ctx:     RunContext
  ): Promise<{ imported: number; skipped: number; errored: number }> {
    if (records.length === 0) return { imported: 0, skipped: 0, errored: 0 };

    const db = prisma as any;
    let imported = 0, skipped = 0, errored = 0;

    for (let i = 0; i < records.length; i += COLLECTION_BATCH_SIZE) {
      const batch = records.slice(i, i + COLLECTION_BATCH_SIZE);

      // Filter: require naturalKey (= sourceId set by mapSagCollection)
      const valid   = batch.filter(r => r.sourceId && r.sourceId.length > 0);
      skipped      += batch.length - valid.length;

      if (valid.length === 0) continue;

      const ops = valid.map(r => {
        const naturalKey = r.sourceId; // sourceId === naturalKey in mapSagCollection
        const collectionDateUtc = new Date(Date.UTC(
          r.collectionDate.getFullYear(),
          r.collectionDate.getMonth(),
          r.collectionDate.getDate()
        ));

        const fields = {
          organizationId:  ctx.orgId,
          erpMovId:        r.erpMovId      ?? null,
          comprobanteCode: r.comprobanteCode,
          documentNumber:  r.documentNumber ?? null,
          collectionDate:  collectionDateUtc,
          sagTerceroId:    r.sagTerceroId  ?? null,   // ka_nl_tercero — raw, for identity re-link
          customerNit:     r.customerNit   ?? null,   // real NIT from TERCEROS JOIN
          customerName:    r.customerName  ?? null,
          amount:          r.amount,
          currency:        r.currency,
          amountSource:    "SAG_V_PAGOSNEW" as const,
          appliedFacts:    r.appliedFacts  ? (r.appliedFacts as object) : null,
          bankReference:   r.bankReference ?? null,
          naturalKey,
          rawJson:         (r.meta ?? {}) as object,
        };

        return db.collectionRecord.upsert({
          where:  { organizationId_naturalKey: { organizationId: ctx.orgId, naturalKey } },
          create: fields,
          update: {
            // Re-sync: update all fields except naturalKey and organizationId
            erpMovId:        fields.erpMovId,
            comprobanteCode: fields.comprobanteCode,
            documentNumber:  fields.documentNumber,
            collectionDate:  fields.collectionDate,
            sagTerceroId:    fields.sagTerceroId,
            customerNit:     fields.customerNit,
            customerName:    fields.customerName,
            amount:          fields.amount,
            currency:        fields.currency,
            appliedFacts:    fields.appliedFacts,
            bankReference:   fields.bankReference,
            rawJson:         fields.rawJson,
          },
        });
      });

      const results = await Promise.allSettled(ops);
      for (const r of results) {
        if (r.status === "fulfilled") imported++;
        else {
          console.error(`[CollectionStorage] Upsert failed: ${(r as PromiseRejectedResult).reason?.message}`);
          errored++;
        }
      }
    }

    return { imported, skipped, errored };
  },
};

// ── CustomerOrderRecord storage handler ───────────────────────────────────────

const ORDER_BATCH_SIZE = 200;

export const customerOrderStorage: StorageHandler<UnifiedSagOrder> = {
  async upsertMany(
    records: UnifiedSagOrder[],
    ctx:     RunContext
  ): Promise<{ imported: number; skipped: number; errored: number }> {
    if (records.length === 0) return { imported: 0, skipped: 0, errored: 0 };

    const db = prisma as any;
    let imported = 0, skipped = 0, errored = 0;

    for (let i = 0; i < records.length; i += ORDER_BATCH_SIZE) {
      const batch = records.slice(i, i + ORDER_BATCH_SIZE);

      const ops = batch
        .filter(r => r.erpMovId > 0)
        .map(r => {
          const orderDateUtc = new Date(
            Date.UTC(r.orderDate.getFullYear(), r.orderDate.getMonth(), r.orderDate.getDate())
          );
          const fields = {
            organizationId: ctx.orgId,
            erpMovId:       r.erpMovId,
            orderNumber:    r.orderNumber,
            customerNit:    r.customerNit ?? null,
            customerName:   r.customerName,
            orderDate:      orderDateUtc,
            amount:         r.amount,
            currency:       r.currency,
            sourceCode:     r.sourceCode,
            // CUSTOMER-DATA-FOUNDATION-01: include sellerTerceroId in rawJson
            // so the canonical customer service can extract the seller for orders.
            rawJson:        {
              ...(r.meta ?? {}),
              sellerTerceroId: r.sellerTerceroId ?? null,
            } as object,
          };
          return db.customerOrderRecord.upsert({
            where: {
              organizationId_erpMovId: {
                organizationId: ctx.orgId,
                erpMovId:       r.erpMovId,
              },
            },
            create: fields,
            update: {
              orderNumber:  fields.orderNumber,
              customerNit:  fields.customerNit,
              customerName: fields.customerName,
              orderDate:    fields.orderDate,
              amount:       fields.amount,
              currency:     fields.currency,
              rawJson:      fields.rawJson,
            },
          });
        });

      if (ops.length === 0) { skipped += batch.length; continue; }

      const results = await Promise.allSettled(ops);
      for (const r of results) {
        if (r.status === "fulfilled") imported++;
        else {
          console.error(`[CustomerOrderStorage] Upsert failed: ${r.reason?.message}`);
          errored++;
        }
      }
      skipped += batch.length - ops.length;
    }

    return { imported, skipped, errored };
  },
};
