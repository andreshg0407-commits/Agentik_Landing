/**
 * Customer 360 page — server component.
 *
 * Reads ?q, ?slug, ?status, ?churnRisk, ?sellerSlug, ?hasOverdue from
 * searchParams and loads either the customer list or a single customer's
 * full 360 ficha. All new-model Prisma calls are wrapped in try/catch so
 * the page degrades gracefully if the migration has not yet been applied.
 */

import { prisma }           from "@/lib/prisma";
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
import { listPayments } from "@/lib/finance/payment-service";
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
  const customerId = sp["customerId"] || undefined;
  const status     = sp["status"]     || undefined;
  const churnRisk  = sp["churnRisk"]  || undefined;
  const sellerSlug = sp["sellerSlug"] || undefined;
  const hasOverdue = sp["hasOverdue"] === "true";

  const nit = sp["nit"] || undefined;

  // Resolve slug from customerId or nit if slug not provided directly
  let resolvedSlug = slug;
  if (!resolvedSlug && customerId) {
    try {
      const found = await (prisma as any).customerProfile.findFirst({
        where:  { id: customerId, organizationId: orgId },
        select: { slug: true },
      });
      resolvedSlug = found?.slug ?? undefined;
    } catch { /* ignore — page degrades to list view */ }
  }
  if (!resolvedSlug && nit) {
    try {
      const found = await (prisma as any).customerProfile.findFirst({
        where:  { nit, organizationId: orgId },
        select: { slug: true },
      });
      resolvedSlug = found?.slug ?? undefined;
    } catch { /* ignore — page degrades to list view */ }
  }

  // ── 360 detail view ────────────────────────────────────────────────────────

  let customer360: Customer360 | null = null;
  let customer360Error                = false;
  let commercialTimeline: CommercialFact[] = [];
  let recentPayments: Awaited<ReturnType<typeof listPayments>> = [];
  let collectionRecords: Array<{
    id: string; comprobanteCode: string; documentNumber: string | null;
    collectionDate: Date; customerName: string | null; amount: unknown;
    appliedStatus: string;
  }> = [];

  if (resolvedSlug) {
    try {
      customer360 = await getCustomer360(orgId, resolvedSlug);
    } catch (err) {
      console.error("[Customer360Page] getCustomer360 error:", err);
      customer360Error = true;
    }

    if (customer360) {
      [commercialTimeline, recentPayments, collectionRecords] = await Promise.all([
        getUnifiedCustomerCommercialTimeline(customer360.profile.id).catch(() => []),
        customer360.profile.nit
          ? listPayments(orgId, { customerNit: customer360.profile.nit, limit: 10 }).catch(() => [])
          : Promise.resolve([]),
        (prisma as any).collectionRecord.findMany({
            where: {
              organizationId: orgId,
              OR: [
                { customerId: customer360.profile.id },
                ...(customer360.profile.nit          ? [{ customerNit: customer360.profile.nit }]          : []),
                ...(customer360.profile.nitNormalized ? [{ customerNit: customer360.profile.nitNormalized }] : []),
              ],
            },
            orderBy: { collectionDate: "desc" },
            take:    30,
          }).catch(() => []),
      ]);
    }
  }

  // ── Consignaciones pendientes (org-level pool) ─────────────────────────────
  // CP/B1/B2/H1/H2 are anonymous bank deposits — not linked to a specific customer.
  // We surface the org pool so the user can manually apply one to an invoice.
  type RawConsig = { id: string; saleDate: Date | null; comprobanteCode: string | null; amount: unknown; rawJson: unknown };
  let rawConsignaciones: RawConsig[] = [];
  try {
    rawConsignaciones = await (prisma as any).saleRecord.findMany({
      where: {
        organizationId: orgId,
        comprobanteCode: { in: ["CP", "B1", "B2", "H1", "H2"] },
      },
      select: { id: true, saleDate: true, comprobanteCode: true, amount: true, rawJson: true },
      orderBy: { saleDate: "desc" },
      take: 30,
    });
  } catch { /* table may not exist yet */ }

  const CONSIG_CHANNEL: Record<string, string> = {
    CP: "Consignación POS",
    B1: "Banco F1",
    B2: "Banco F2",
    H1: "Efectivo F1",
    H2: "Efectivo F2",
  };

  const serializedConsignaciones = rawConsignaciones.map(r => {
    const raw = r.rawJson as Record<string, unknown> | null;
    const ref = raw?.["sc_numero_comprobante"] ?? raw?.["ka_sc_numero_comprobante"] ?? null;
    const amount = r.amount != null
      ? (typeof (r.amount as any).toNumber === "function" ? (r.amount as any).toNumber() : Number(r.amount))
      : 0;
    return {
      id:              r.id,
      saleDate:        r.saleDate ? r.saleDate.toISOString() : null,
      comprobanteCode: r.comprobanteCode ?? "?",
      amount,
      reference:       typeof ref === "string" ? ref : null,
      channelLabel:    CONSIG_CHANNEL[r.comprobanteCode ?? ""] ?? r.comprobanteCode ?? "?",
    };
  });

  // ── List view ──────────────────────────────────────────────────────────────

  let customers: CustomerSummary[] = [];
  let customersError               = false;

  if (!resolvedSlug) {
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

  // Serialize CollectionRecords for RSC → client boundary
  const serializedCollectionRecords = collectionRecords.map((cr: any) => ({
    id:              cr.id,
    comprobanteCode: cr.comprobanteCode,
    documentNumber:  cr.documentNumber ?? null,
    collectionDate:  cr.collectionDate instanceof Date ? cr.collectionDate.toISOString() : String(cr.collectionDate),
    customerName:    cr.customerName ?? null,
    amount:          typeof cr.amount?.toNumber === "function" ? cr.amount.toNumber() : Number(cr.amount ?? 0),
    appliedStatus:   cr.appliedStatus ?? "AVAILABLE",
  }));

  // Serialize dates in payment records for RSC → client boundary
  const serializedPayments = recentPayments.map(p => ({
    id:              p.id,
    amount:          Number(p.amount),
    paymentDate:     p.paymentDate instanceof Date ? p.paymentDate.toISOString() : String(p.paymentDate),
    paymentMethod:   p.paymentMethod,
    status:          p.status,
    reference:       p.reference,
    bankName:        p.bankName,
    customerName:    p.customerName,
    notes:           p.notes,
    allocations:     p.allocations.map(a => ({
      allocatedAmount: Number(a.allocatedAmount),
      balanceBefore:   Number(a.balanceBefore),
      balanceAfter:    Number(a.balanceAfter),
      receivable: {
        invoiceNumber:  a.receivable?.invoiceNumber ?? null,
        originalAmount: a.receivable ? Number(a.receivable.originalAmount) : 0,
        balanceDue:     a.receivable ? Number(a.receivable.balanceDue) : 0,
      },
    })),
  }));

  // If a direct-nav param was provided but no profile was found, show explicit error
  // (don't silently fall through to the list — that's confusing for the user).
  const directNavRequested = !!(customerId || nit || (slug && slug !== resolvedSlug));
  if (directNavRequested && !resolvedSlug && !customer360Error) {
    const label = customerId
      ? `ID ${customerId.slice(-8)}`
      : nit
      ? `NIT ${nit}`
      : `slug "${slug}"`;
    return (
      <div style={{ fontFamily: "monospace", maxWidth: 600, margin: "60px auto", padding: "0 16px" }}>
        <div style={{
          border: "1px solid #fca5a5",
          borderLeft: "4px solid #dc2626",
          borderRadius: 6,
          padding: "20px 24px",
          background: "#fff8f8",
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#991b1b", marginBottom: 8 }}>
            Cliente no encontrado
          </div>
          <div style={{ fontSize: 12, color: "#555", lineHeight: 1.6, marginBottom: 16 }}>
            No se encontró ningún perfil de cliente para {label}.
            Es posible que el cliente no haya sido sincronizado todavía o que el parámetro sea incorrecto.
          </div>
          <a
            href={`/${orgSlug}/customer-360`}
            style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8", textDecoration: "none", fontFamily: "monospace" }}
          >
            ← Volver al listado de clientes
          </a>
        </div>
      </div>
    );
  }

  return (
    <CustomerClient
      orgSlug={orgSlug}
      selectedSlug={resolvedSlug ?? null}
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
      recentPayments={serializedPayments}
      pendingConsignaciones={serializedConsignaciones}
      collectionRecords={serializedCollectionRecords}
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
        appliedDocuments: doc.appliedDocuments.map(ad => ({
          ...ad,
          date: ad.date instanceof Date ? ad.date.toISOString() : (ad.date ?? null),
        })),
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
