/**
 * castillitos-crm/storage.ts
 *
 * Prisma-backed StorageHandler implementations for the Castillitos CRM adapter.
 *
 * CRMOpportunityStorageHandler
 *   - Upserts CRMOpportunity via @@unique([organizationId, crmId]).
 *   - Links customerId by looking up CustomerProfile.slug derived from the
 *     opportunity's customerTaxId (preferred) or customerName.
 *
 * CRMActivityStorageHandler
 *   - Upserts CRMActivity via @@unique([organizationId, crmId]).
 *   - Maps UnifiedActivity.type (lowercase) → Prisma ActivityType enum (UPPERCASE).
 *   - Links customerId via CustomerProfile slug lookup.
 *   - Links opportunityId via CRMOpportunity.crmId lookup.
 *   - After upsert, bumps CRMOpportunity.lastActivityAt for the linked opportunity.
 *
 * CRMQuoteStorageHandler
 *   - Upserts CRMQuote via @@unique([organizationId, crmId]).
 *   - Maps UnifiedQuote.status → Prisma QuoteStatus enum.
 *   - Links customerId and opportunityId via slug/crmId lookups.
 *
 * CRMCustomerStorageHandler
 *   - Upserts CustomerProfile from CRM Accounts data.
 *   - Writes ONLY CRM-sourced fields (crmId, crmSyncedAt, rawCrmJson).
 *   - Never overwrites ERP fields (erpId, erpSyncedAt, rawErpJson).
 *   - Intended to be invoked via the source-mux in adapters/index.ts
 *     so that the single global "customers" module handler routes
 *     correctly to either the SAG or CRM handler based on ctx.source.
 *
 * All handlers process records in batches of 200 and catch per-record
 * errors to avoid aborting an entire batch for a single bad row.
 */

import { prisma }                              from "@/lib/prisma";
import { ActivityType, OpportunityStatus, QuoteStatus } from "@prisma/client";
import type {
  RunContext,
  StorageHandler,
  UnifiedActivity,
  UnifiedCustomer,
  UnifiedOpportunity,
  UnifiedQuote,
} from "@/lib/connectors/core/types";

const BATCH_SIZE = 200;

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
 * Normalize a Colombian NIT to its canonical 9-digit form.
 * Mirrors the logic in sag-pya-soap/mappers.ts so that ERP and CRM slugs match.
 *   "900.123.456-7"  → "900123456"
 *   "900123456-7"    → "900123456"
 *   "9001234567"     → "900123456"  (10-digit with concatenated DV)
 *   "900123456"      → "900123456"  (already canonical)
 */
function normalizeNit(raw: string): string {
  let s = raw.trim().replace(/[\.\s]/g, ""); // strip dots and spaces
  s = s.replace(/-\d$/, "");                  // strip "-N" DV suffix
  if (/^\d{10}$/.test(s)) s = s.slice(0, 9); // strip concatenated DV digit
  return s;
}

/**
 * Build the canonical customer lookup slug.
 * When a taxId is present the NIT is normalized first so that
 * "900.123.456-7" (CRM) and "900123456" (ERP) resolve to the same slug.
 */
function customerSlug(taxId: string | undefined, name: string | undefined): string | undefined {
  if (!taxId && !name) return undefined;
  const base = taxId ? normalizeNit(taxId) : name!;
  return toSlug(base);
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

/**
 * Resolve a CustomerProfile id for a CRM record.
 *
 * Three-strategy lookup (first match wins):
 *   1. NIT-derived slug  — handles the standard case where both ERP + CRM
 *      normalize the NIT to the same 9-digit canonical form.
 *   2. Direct NIT field  — catches formatting variants that slug normalization
 *      might miss (e.g. NIT stored as "9001234560" in one system vs "900123456"
 *      after the 10→9 digit strip in another).
 *   3. CRM externalId   — matches on CustomerProfile.crmId when the CRM sends
 *      an explicit externalId that the ERP record already carries.
 *
 * The name-based slug fallback is intentionally omitted here; name matching is
 * too noisy for production writes (different abbreviations across systems).
 */
async function resolveCustomerId(
  orgId:         string,
  taxId:         string | undefined,
  _name:         string | undefined,  // reserved for future name-fuzzy fallback
  crmExternalId: string | undefined = undefined,
): Promise<string | null> {
  // Strategy 1: NIT-derived slug
  if (taxId) {
    const slug = customerSlug(taxId, undefined);
    if (slug) {
      const profile = await prisma.customerProfile.findFirst({
        where:  { organizationId: orgId, slug },
        select: { id: true },
      });
      if (profile) return profile.id;
    }
  }

  // Strategy 2: direct NIT column lookup (handles edge-case formatting variants)
  if (taxId) {
    const nit = normalizeNit(taxId);
    if (nit) {
      const profile = await prisma.customerProfile.findFirst({
        where:  { organizationId: orgId, nit },
        select: { id: true },
      });
      if (profile) return profile.id;
    }
  }

  // Strategy 3: CRM externalId stored on CustomerProfile.crmId
  if (crmExternalId) {
    const profile = await prisma.customerProfile.findFirst({
      where:  { organizationId: orgId, crmId: crmExternalId },
      select: { id: true },
    });
    if (profile) return profile.id;
  }

  return null;
}

/** Resolve a CRMOpportunity id by crmId within an org. */
async function resolveOpportunityId(
  orgId: string,
  crmId: string | undefined
): Promise<string | null> {
  if (!crmId) return null;

  const opp = await prisma.cRMOpportunity.findFirst({
    where:  { organizationId: orgId, crmId },
    select: { id: true },
  });
  return opp?.id ?? null;
}

// ── Activity type mapping ─────────────────────────────────────────────────────

const ACTIVITY_TYPE_ENUM: Record<string, ActivityType> = {
  call:       ActivityType.CALL,
  email:      ActivityType.EMAIL,
  visit:      ActivityType.VISIT,
  note:       ActivityType.NOTE,
  meeting:    ActivityType.MEETING,
  quote_sent: ActivityType.QUOTE_SENT,
  demo:       ActivityType.DEMO,
  proposal:   ActivityType.PROPOSAL,
  other:      ActivityType.OTHER,
};

function toActivityType(raw: string): ActivityType {
  return ACTIVITY_TYPE_ENUM[raw.toLowerCase()] ?? ActivityType.OTHER;
}

// ── Quote status mapping ──────────────────────────────────────────────────────

const QUOTE_STATUS_ENUM: Record<string, QuoteStatus> = {
  draft:    QuoteStatus.DRAFT,
  sent:     QuoteStatus.SENT,
  accepted: QuoteStatus.ACCEPTED,
  rejected: QuoteStatus.REJECTED,
  expired:  QuoteStatus.EXPIRED,
};

function toQuoteStatus(raw: string): QuoteStatus {
  return QUOTE_STATUS_ENUM[raw.toLowerCase()] ?? QuoteStatus.DRAFT;
}

// ── OpportunityStatus mapping ─────────────────────────────────────────────────

function toOpportunityStatus(raw: string): OpportunityStatus {
  switch (raw.toLowerCase()) {
    case "won":       return OpportunityStatus.WON;
    case "lost":      return OpportunityStatus.LOST;
    case "abandoned": return OpportunityStatus.ABANDONED;
    default:          return OpportunityStatus.OPEN;
  }
}

// ── CRMOpportunityStorageHandler ──────────────────────────────────────────────

export const crmOpportunityStorage: StorageHandler<UnifiedOpportunity> = {
  async upsertMany(
    records: UnifiedOpportunity[],
    ctx:     RunContext
  ): Promise<{ imported: number; skipped: number; errored: number }> {
    let imported = 0;
    let skipped  = 0;
    let errored  = 0;

    // Track customer IDs that got CRM data — bump crmSyncedAt after the batch
    const linkedCustomerIds = new Set<string>();
    const now = new Date();

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      for (const record of batch) {
        if (!record.crmId) { skipped++; continue; }

        try {
          const customerId = await resolveCustomerId(
            ctx.orgId,
            record.customerTaxId,
            record.customerName
          );
          if (customerId) linkedCustomerIds.add(customerId);

          await prisma.cRMOpportunity.upsert({
            where: {
              organizationId_crmId: {
                organizationId: ctx.orgId,
                crmId:          record.crmId,
              },
            },
            create: {
              organizationId: ctx.orgId,
              crmId:          record.crmId,
              customerId,
              title:          record.title,
              stage:          record.stage,
              amount:         record.amount,
              currency:       record.currency,
              probability:    record.probability,
              status:         toOpportunityStatus(record.status),
              lossReason:     record.lossReason ?? null,
              lossNote:       record.lossNote   ?? null,
              sellerSlug:     record.sellerSlug ?? null,
              sellerName:     record.sellerName ?? null,
              openedAt:       record.openedAt,
              expectedCloseAt: record.expectedCloseAt ?? null,
              closedAt:       record.closedAt        ?? null,
              lastActivityAt: record.lastActivityAt  ?? null,
              rawCrmJson:     (record.meta ?? {}) as object,
            },
            update: {
              customerId,
              title:          record.title,
              stage:          record.stage,
              amount:         record.amount,
              currency:       record.currency,
              probability:    record.probability,
              status:         toOpportunityStatus(record.status),
              lossReason:     record.lossReason ?? null,
              lossNote:       record.lossNote   ?? null,
              sellerSlug:     record.sellerSlug ?? null,
              sellerName:     record.sellerName ?? null,
              openedAt:       record.openedAt,
              expectedCloseAt: record.expectedCloseAt ?? null,
              closedAt:       record.closedAt        ?? null,
              lastActivityAt: record.lastActivityAt  ?? null,
              rawCrmJson:     (record.meta ?? {}) as object,
            },
          });
          imported++;
        } catch (e) {
          console.error(
            `[CRMOpportunityStorage] Failed to upsert crmId="${record.crmId}" orgId="${ctx.orgId}":`,
            (e as Error).message
          );
          errored++;
        }
      }
    }

    // Stamp crmSyncedAt on all CustomerProfiles that received CRM data
    if (linkedCustomerIds.size > 0) {
      await prisma.customerProfile.updateMany({
        where: { id: { in: Array.from(linkedCustomerIds) } },
        data:  { crmSyncedAt: now, updatedAt: now },
      }).catch(e =>
        console.error(
          `[CRMOpportunityStorage] crmSyncedAt update failed:`,
          (e as Error).message
        )
      );
    }

    return { imported, skipped, errored };
  },
};

// ── CRMActivityStorageHandler ──────────────────────────────────────────────────

export const crmActivityStorage: StorageHandler<UnifiedActivity> = {
  async upsertMany(
    records: UnifiedActivity[],
    ctx:     RunContext
  ): Promise<{ imported: number; skipped: number; errored: number }> {
    let imported = 0;
    let skipped  = 0;
    let errored  = 0;

    // Track which opportunity IDs need lastActivityAt refreshed
    // Map: crmId → max occurredAt
    const oppLastActivity = new Map<string, Date>();

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      for (const record of batch) {
        if (!record.crmId) { skipped++; continue; }

        try {
          // Resolve opportunityId from CRM's crmId reference
          const opportunityId = await resolveOpportunityId(ctx.orgId, record.opportunityId);

          // Resolve customerId via the linked opportunity (activities don't always
          // carry a customerTaxId/name directly — the opportunity is the authoritative link)
          let resolvedCustomerId: string | null = null;
          if (opportunityId) {
            const opp = await prisma.cRMOpportunity.findUnique({
              where:  { id: opportunityId },
              select: { customerId: true },
            });
            resolvedCustomerId = opp?.customerId ?? null;
          }

          await prisma.cRMActivity.upsert({
            where: {
              organizationId_crmId: {
                organizationId: ctx.orgId,
                crmId:          record.crmId,
              },
            },
            create: {
              organizationId: ctx.orgId,
              crmId:          record.crmId,
              customerId:     resolvedCustomerId,
              opportunityId,
              type:           toActivityType(record.type),
              subject:        record.subject     ?? null,
              body:           record.body        ?? null,
              outcome:        record.outcome     ?? null,
              sellerSlug:     record.sellerSlug  ?? null,
              sellerName:     record.sellerName  ?? null,
              occurredAt:     record.occurredAt,
              dueAt:          record.dueAt       ?? null,
              completedAt:    record.completedAt ?? null,
              rawCrmJson:     (record.meta ?? {}) as object,
            },
            update: {
              customerId:     resolvedCustomerId,
              opportunityId,
              type:           toActivityType(record.type),
              subject:        record.subject     ?? null,
              body:           record.body        ?? null,
              outcome:        record.outcome     ?? null,
              sellerSlug:     record.sellerSlug  ?? null,
              sellerName:     record.sellerName  ?? null,
              occurredAt:     record.occurredAt,
              dueAt:          record.dueAt       ?? null,
              completedAt:    record.completedAt ?? null,
              rawCrmJson:     (record.meta ?? {}) as object,
            },
          });

          // Track lastActivityAt for linked opportunity
          if (record.opportunityId) {
            const prev = oppLastActivity.get(record.opportunityId);
            if (!prev || record.occurredAt > prev) {
              oppLastActivity.set(record.opportunityId, record.occurredAt);
            }
          }

          imported++;
        } catch (e) {
          console.error(
            `[CRMActivityStorage] Failed to upsert crmId="${record.crmId}" orgId="${ctx.orgId}":`,
            (e as Error).message
          );
          errored++;
        }
      }
    }

    // Bump lastActivityAt on linked opportunities (best-effort)
    for (const [oppCrmId, lastAt] of oppLastActivity) {
      await prisma.cRMOpportunity.updateMany({
        where: {
          organizationId: ctx.orgId,
          crmId:          oppCrmId,
          // Only update if our date is newer
          OR: [
            { lastActivityAt: null },
            { lastActivityAt: { lt: lastAt } },
          ],
        },
        data: { lastActivityAt: lastAt },
      }).catch(e =>
        console.error(
          `[CRMActivityStorage] lastActivityAt refresh failed for oppCrmId="${oppCrmId}":`,
          (e as Error).message
        )
      );
    }

    return { imported, skipped, errored };
  },
};

// ── CRMCustomerStorageHandler ──────────────────────────────────────────────────
//
// Upserts CustomerProfile rows from CRM Accounts data.
//
// Responsibilities:
//   - Upsert by (organizationId, slug) — slug = NIT-slug or name-slug.
//   - Write ONLY CRM-sourced fields: crmId, crmSyncedAt, rawCrmJson.
//   - Never overwrite ERP fields (erpId, erpSyncedAt, rawErpJson) — those
//     belong to the SAG connector and must survive a CRM re-sync.
//   - On CREATE: ERP fields are left null; SAG sync will populate them.
//   - Also updates name, email, phone, city, department, sellerName/Slug
//     from the CRM Account record so the profile stays fresh even before
//     a SAG sync runs.

export const crmCustomerStorage: StorageHandler<UnifiedCustomer> = {
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
        if (!record.name) { skipped++; continue; }

        const slug = customerSlug(record.taxId, record.name) ?? toSlug(record.name);

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
              // CRM identity
              crmId:       record.sourceId,
              nit:         record.taxId      ?? null,
              name:        record.name,
              email:       record.email      ?? null,
              phone:       record.phone      ?? null,
              city:        record.address?.city  ?? null,
              department:  record.address?.state ?? null,
              sellerName:  record.salesRepName        ?? null,
              sellerSlug:  record.salesRepName ? toSlug(record.salesRepName) : null,
              customerType: "B2B",
              crmSyncedAt: now,
              rawCrmJson:  (record.meta ?? {}) as object,
              // ERP fields: intentionally left null — SAG sync will set these
            },
            update: {
              // Update CRM fields on every re-sync
              crmId:       record.sourceId,
              name:        record.name,
              email:       record.email      ?? null,
              phone:       record.phone      ?? null,
              city:        record.address?.city  ?? null,
              department:  record.address?.state ?? null,
              sellerName:  record.salesRepName        ?? null,
              sellerSlug:  record.salesRepName ? toSlug(record.salesRepName) : null,
              crmSyncedAt: now,
              rawCrmJson:  (record.meta ?? {}) as object,
              // ERP fields (erpId, erpSyncedAt, rawErpJson) are intentionally
              // omitted — they must only be written by the SAG connector.
              // NIT: update only when the CRM record has one (avoids clearing a
              //      NIT that SAG previously wrote).
              ...(record.taxId ? { nit: record.taxId } : {}),
            },
          });
          imported++;
        } catch (e) {
          console.error(
            `[CrmCustomerStorage] Failed to upsert slug="${slug}" crmId="${record.sourceId}" orgId="${ctx.orgId}":`,
            (e as Error).message
          );
          errored++;
        }
      }
    }

    return { imported, skipped, errored };
  },
};

// ── CRMQuoteStorageHandler ─────────────────────────────────────────────────────

export const crmQuoteStorage: StorageHandler<UnifiedQuote> = {
  async upsertMany(
    records: UnifiedQuote[],
    ctx:     RunContext
  ): Promise<{ imported: number; skipped: number; errored: number }> {
    let imported = 0;
    let skipped  = 0;
    let errored  = 0;

    // Track customer IDs that received CRM data — stamp crmSyncedAt after batch
    const linkedCustomerIds = new Set<string>();
    const now = new Date();

    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      for (const record of batch) {
        if (!record.crmId) { skipped++; continue; }

        try {
          const opportunityId = await resolveOpportunityId(ctx.orgId, record.opportunityId);

          // Customer resolution — three strategies in priority order:
          //
          // 1. Via linked opportunity (most reliable — inherits opportunity's resolved customer)
          // 2. Direct crmId lookup — record.customerId = billing_account_id from AOS_Quotes,
          //    which matches CustomerProfile.crmId if the Accounts module has been synced.
          // 3. Tax ID lookup is not attempted here since AOS_Quotes does not carry a NIT
          //    field directly — the billing_account link is the authoritative reference.
          let customerId: string | null = null;

          if (opportunityId) {
            const opp = await prisma.cRMOpportunity.findUnique({
              where:  { id: opportunityId },
              select: { customerId: true },
            });
            customerId = opp?.customerId ?? null;
          }

          if (!customerId && record.customerId) {
            // record.customerId = billing_account_id (CRM UUID for the account).
            // resolveCustomerId strategy 3 matches CustomerProfile.crmId.
            customerId = await resolveCustomerId(
              ctx.orgId,
              undefined,       // no taxId from AOS_Quotes
              undefined,       // no name fallback
              record.customerId, // billing_account_id as crmExternalId
            );
          }

          const quoteData = {
            customerId,
            opportunityId,
            quoteNumber:    record.quoteNumber  ?? null,
            status:         toQuoteStatus(record.status),
            amount:         record.amount,
            currency:       record.currency,
            sellerSlug:     record.sellerSlug   ?? null,
            sellerName:     record.sellerName   ?? null,
            issuedAt:       record.issuedAt,
            expiresAt:      record.expiresAt    ?? null,
            respondedAt:    record.respondedAt  ?? null,
            // rawCrmJson stores the full flattened V8 row, including:
            //   name, stage, invoice_status, id_sag_c, respuesta_sag_c,
            //   sucursal_c, lista_precios_c, estado_mercancia_c, billing_account
            rawCrmJson:     (record.meta ?? {}) as object,
          };

          await prisma.cRMQuote.upsert({
            where: {
              organizationId_crmId: {
                organizationId: ctx.orgId,
                crmId:          record.crmId,
              },
            },
            create: { organizationId: ctx.orgId, crmId: record.crmId, ...quoteData },
            update: quoteData,
          });

          if (customerId) linkedCustomerIds.add(customerId);
          imported++;
        } catch (e) {
          console.error(
            `[CRMQuoteStorage] Failed to upsert crmId="${record.crmId}" orgId="${ctx.orgId}":`,
            (e as Error).message
          );
          errored++;
        }
      }
    }

    // Stamp crmSyncedAt on all CustomerProfiles that received quote data
    if (linkedCustomerIds.size > 0) {
      await prisma.customerProfile.updateMany({
        where: { id: { in: Array.from(linkedCustomerIds) } },
        data:  { crmSyncedAt: now, updatedAt: now },
      }).catch(e =>
        console.error(
          `[CRMQuoteStorage] crmSyncedAt update failed:`,
          (e as Error).message
        )
      );
    }

    return { imported, skipped, errored };
  },
};
