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
 * Batch size is capped at 500 rows per Prisma call to avoid query-string limits.
 */

import { prisma }       from "@/lib/prisma";
import type { RunContext, StorageHandler, UnifiedCustomer, UnifiedReceivable } from "@/lib/connectors/core/types";

const BATCH_SIZE = 500;

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
              erpId:       record.sourceId,
              nit:         record.taxId      ?? null,
              name:        record.name,
              email:       record.email      ?? null,
              phone:       record.phone      ?? null,
              city:        record.address?.city       ?? null,
              department:  record.address?.state      ?? null,
              sellerName:  record.salesRepName        ?? null,
              sellerSlug:  record.salesRepName ? toSlug(record.salesRepName) : null,
              customerType: "B2B",
              erpSyncedAt: now,
              rawErpJson:  (record.meta ?? {}) as object,
            },
            update: {
              // ERP fields — always overwrite with latest data from SAG
              erpId:      record.sourceId,
              nit:        record.taxId      ?? null,
              name:       record.name,
              email:      record.email      ?? null,
              phone:      record.phone      ?? null,
              city:       record.address?.city       ?? null,
              department: record.address?.state      ?? null,
              sellerName: record.salesRepName        ?? null,
              sellerSlug: record.salesRepName ? toSlug(record.salesRepName) : null,
              erpSyncedAt: now,
              rawErpJson:  (record.meta ?? {}) as object,
              // CRM fields (crmId, crmSyncedAt, rawCrmJson) are intentionally
              // omitted here — they must only be written by the CRM adapter.
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

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      for (const record of batch) {
        // erpId is the unique identifier within the org
        const erpId = record.sourceId;
        if (!erpId) {
          skipped++;
          continue;
        }

        const bucket = agingBucket(record.daysOverdue);
        const statusStr = record.status.toUpperCase(); // "OPEN" | "PARTIAL" | "PAID" | "WRITTEN_OFF"

        try {
          await prisma.customerReceivable.upsert({
            where: {
              organizationId_erpId: {
                organizationId: ctx.orgId,
                erpId,
              },
            },
            create: {
              organizationId: ctx.orgId,
              erpId,
              invoiceNumber:  record.invoiceRef   ?? null,
              customerNit:    record.customerTaxId ?? null,
              customerName:   record.customerName,
              originalAmount: record.originalAmount,
              paidAmount:     record.paidAmount,
              balanceDue:     record.balanceDue,
              currency:       record.currency,
              invoiceDate:    record.issueDate,
              dueDate:        record.dueDate,
              paidAt:         record.paidDate     ?? null,
              daysOverdue:    record.daysOverdue,
              agingBucket:    bucket,
              status:         statusStr,
              rawErpJson:     (record.meta ?? {}) as object,
              syncedAt:       new Date(),
            },
            update: {
              invoiceNumber:  record.invoiceRef   ?? null,
              customerNit:    record.customerTaxId ?? null,
              customerName:   record.customerName,
              originalAmount: record.originalAmount,
              paidAmount:     record.paidAmount,
              balanceDue:     record.balanceDue,
              currency:       record.currency,
              invoiceDate:    record.issueDate,
              dueDate:        record.dueDate,
              paidAt:         record.paidDate     ?? null,
              daysOverdue:    record.daysOverdue,
              agingBucket:    bucket,
              status:         statusStr,
              rawErpJson:     (record.meta ?? {}) as object,
              syncedAt:       new Date(),
            },
          });

          if (record.customerTaxId) {
            affectedNits.add(record.customerTaxId);
          }

          imported++;
        } catch (e) {
          console.error(
            `[CustomerReceivableStorage] Failed to upsert erpId="${erpId}" orgId="${ctx.orgId}":`,
            (e as Error).message
          );
          errored++;
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
  // Aggregate open receivables for this NIT
  const agg = await prisma.customerReceivable.aggregate({
    where: {
      organizationId,
      customerNit: nit,
      status:      { notIn: ["PAID", "WRITTEN_OFF"] },
    },
    _sum: { balanceDue: true },
    _max: { daysOverdue: true },
  });

  const overdueAgg = await prisma.customerReceivable.aggregate({
    where: {
      organizationId,
      customerNit: nit,
      status:      { notIn: ["PAID", "WRITTEN_OFF"] },
      daysOverdue: { gt: 0 },
    },
    _sum: { balanceDue: true },
  });

  const totalReceivable   = agg._sum.balanceDue     ?? 0;
  const overdueReceivable = overdueAgg._sum.balanceDue ?? 0;
  const maxDpd            = agg._max.daysOverdue    ?? 0;

  // Find the CustomerProfile by NIT (may not exist yet if customers sync hasn't run)
  const profile = await prisma.customerProfile.findFirst({
    where: { organizationId, nit },
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
