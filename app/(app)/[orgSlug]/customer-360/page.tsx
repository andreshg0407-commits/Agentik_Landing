/**
 * Customer 360 page — server component.
 *
 * Reads ?q, ?slug, ?status, ?churnRisk, ?sellerSlug, ?hasOverdue from
 * searchParams and loads either the customer list or a single customer's
 * full 360 ficha. All new-model Prisma calls are wrapped in try/catch so
 * the page degrades gracefully if the migration has not yet been applied.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  searchCustomers,
  getCustomer360,
  bootstrapCustomerProfilesFromSales,
} from "@/lib/customer360/service";
import type {
  CustomerSummary,
  Customer360,
} from "@/lib/customer360/service";
import { getUnifiedCustomerCommercialTimeline } from "@/lib/commercial-ledger/service";
import type { CommercialFact, SerializedCommercialFact } from "@/lib/commercial-ledger/types";
import CustomerClient from "./customer-client";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function Customer360Page({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug }      = await params;
  const sp               = await searchParams;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;

  // Parse searchParams
  const q          = sp["q"]          || undefined;
  const slug       = sp["slug"]       || undefined;
  const status     = sp["status"]     || undefined;
  const churnRisk  = sp["churnRisk"]  || undefined;
  const sellerSlug = sp["sellerSlug"] || undefined;
  const hasOverdue = sp["hasOverdue"] === "true";

  // ── 360 detail view ────────────────────────────────────────────────────────

  let customer360: Customer360 | null = null;
  let customer360Error                = false;
  let commercialTimeline: CommercialFact[] = [];

  if (slug) {
    try {
      customer360 = await getCustomer360(orgId, slug);
    } catch (err) {
      console.error("[Customer360Page] getCustomer360 error:", err);
      customer360Error = true;
    }

    if (customer360) {
      commercialTimeline = await getUnifiedCustomerCommercialTimeline(
        customer360.profile.id,
      ).catch(() => []);
    }
  }

  // ── List view ──────────────────────────────────────────────────────────────

  let customers: CustomerSummary[] = [];
  let customersError               = false;

  if (!slug) {
    try {
      customers = await searchCustomers(orgId, q, {
        status,
        churnRisk,
        sellerSlug,
        hasOverdue: hasOverdue || undefined,
      });

      // Bootstrap: if no customers exist yet and no explicit query/filter is active,
      // seed CustomerProfile records from SaleRecord data so the page is immediately useful.
      if (customers.length === 0 && !q && !status && !churnRisk && !sellerSlug && !hasOverdue) {
        const created = await bootstrapCustomerProfilesFromSales(orgId).catch(() => 0);
        if (created > 0) {
          // Re-load after bootstrap
          customers = await searchCustomers(orgId, undefined, {}).catch(() => []);
        }
      }
    } catch (err) {
      console.error("[Customer360Page] searchCustomers error:", err);
      customersError = true;
    }
  }

  // Serialize all Date values → ISO strings for server→client prop passing
  const serializedCustomers: SerializedCustomerSummary[] = customers.map(c => ({
    ...c,
    lastPurchaseAt: c.lastPurchaseAt
      ? (c.lastPurchaseAt instanceof Date ? c.lastPurchaseAt.toISOString() : String(c.lastPurchaseAt))
      : null,
  }));

  const serializedDetail: SerializedCustomer360 | null = customer360
    ? serializeCustomer360(customer360)
    : null;

  // Serialize Date fields in commercial timeline for RSC → client boundary
  const serializedTimeline: SerializedCommercialFact[] = commercialTimeline.map(f => ({
    ...f,
    issuedAt: f.issuedAt instanceof Date ? f.issuedAt.toISOString() : (f.issuedAt ?? null),
    paidAt:   f.paidAt   instanceof Date ? f.paidAt.toISOString()   : (f.paidAt   ?? null),
    dueAt:    f.dueAt    instanceof Date ? f.dueAt.toISOString()     : (f.dueAt    ?? null),
  }));

  return (
    <CustomerClient
      orgSlug={orgSlug}
      selectedSlug={slug ?? null}
      q={q ?? null}
      status={status ?? null}
      churnRisk={churnRisk ?? null}
      sellerSlug={sellerSlug ?? null}
      hasOverdue={hasOverdue}
      customers={serializedCustomers}
      customersError={customersError}
      detail={serializedDetail}
      detailError={customer360Error}
      commercialTimeline={serializedTimeline}
    />
  );
}

// ── Serialized types ──────────────────────────────────────────────────────────

export type SerializedCustomerSummary = Omit<CustomerSummary, "lastPurchaseAt"> & {
  lastPurchaseAt: string | null;
};

export type SerializedCustomer360 = ReturnType<typeof serializeCustomer360>;

function serializeCustomer360(c: Customer360) {
  function d(v: Date | null | undefined): string | null {
    if (!v) return null;
    return v instanceof Date ? v.toISOString() : String(v);
  }

  return {
    profile: {
      ...c.profile,
      lastPurchaseAt: d(c.profile.lastPurchaseAt),
      scoredAt:       d(c.profile.scoredAt),
      erpSyncedAt:    d(c.profile.erpSyncedAt),
      crmSyncedAt:    d(c.profile.crmSyncedAt),
      createdAt:      d(c.profile.createdAt) ?? "",
      updatedAt:      d(c.profile.updatedAt) ?? "",
    },
    salesSummary: c.salesSummary,
    receivables: {
      ...c.receivables,
      documents: c.receivables.documents.map(doc => ({
        ...doc,
        invoiceDate: d(doc.invoiceDate) ?? "",
        dueDate:     d(doc.dueDate)     ?? "",
        paidAt:      d(doc.paidAt),
        syncedAt:    d(doc.syncedAt)    ?? "",
      })),
    },
    opportunities: c.opportunities.map(o => ({
      ...o,
      openedAt:        d(o.openedAt)       ?? "",
      expectedCloseAt: d(o.expectedCloseAt),
      closedAt:        d(o.closedAt),
      lastActivityAt:  d(o.lastActivityAt),
      createdAt:       d(o.createdAt)      ?? "",
      updatedAt:       d(o.updatedAt)      ?? "",
    })),
    recentActivities: c.recentActivities.map(a => ({
      ...a,
      occurredAt:  d(a.occurredAt) ?? "",
      dueAt:       d(a.dueAt),
      completedAt: d(a.completedAt),
      createdAt:   d(a.createdAt) ?? "",
    })),
    quotes: c.quotes.map(q => ({
      ...q,
      issuedAt:    d(q.issuedAt)    ?? "",
      expiresAt:   d(q.expiresAt),
      respondedAt: d(q.respondedAt),
      createdAt:   d(q.createdAt)   ?? "",
      updatedAt:   d(q.updatedAt)   ?? "",
    })),
    aiInsight: {
      ...c.aiInsight,
      scoredAt: d(c.aiInsight.scoredAt),
    },
  };
}
