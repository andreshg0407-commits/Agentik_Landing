/**
 * Unified Commercial Ledger — read-only aggregation service.
 *
 * Merges three data sources (no new Prisma models required):
 *   1. CRMQuote           — orders / quotes from SuiteCRM (AOS_Quotes)
 *   2. CustomerReceivable — invoices / cartera from SAG/ERP
 *   3. SaleRecord         — XML-reconciled cash payment facts
 *
 * Status reconciliation model
 * ───────────────────────────
 * CRM Quote:
 *   pending_sag   id_sag_c absent / empty      → not sent to SAG yet
 *   synced_sag    id_sag_c present, no invoice_status → in SAG, not invoiced
 *   invoiced      id_sag_c present + invoice_status   → invoiced in SAG
 *
 * SAG Invoice (CustomerReceivable):
 *   current       status=OPEN, daysOverdue=0
 *   partial       status=PARTIAL
 *   overdue       daysOverdue > 0, status != PAID
 *   paid          status=PAID
 *   written_off   status=WRITTEN_OFF
 *
 * XML / SaleRecord:
 *   collected_xml  all XML facts are treated as paid cash movement
 *
 * Customer resolution strategy:
 *   - Primary: customerId FK (CRMQuote + CustomerReceivable)
 *   - Fallback: SaleRecord.customerNit ↔ CustomerProfile.nit
 *   - Key lookup: customerNit or customerName → CustomerProfile.id
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type {
  CommercialFact,
  CommercialKpis,
  CommercialTimelineResult,
  SellerLedgerKpis,
  CustomerLedgerKpis,
  LedgerStatus,
  PaymentStatus,
} from "./types";

// ── Shared helpers ────────────────────────────────────────────────────────────

function extractRaw(rawCrmJson: unknown): Record<string, unknown> {
  if (!rawCrmJson || typeof rawCrmJson !== "object") return {};
  const j = rawCrmJson as Record<string, unknown>;
  // Storage writes { raw: flattenedRow } — unwrap one level
  return (j["raw"] && typeof j["raw"] === "object"
    ? j["raw"]
    : j) as Record<string, unknown>;
}

function str(v: unknown): string | null {
  if (v == null || v === "" || v === "null" || v === "undefined") return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

// ── Status derivation ─────────────────────────────────────────────────────────

function deriveLedgerStatusFromQuote(
  raw: Record<string, unknown>,
): LedgerStatus {
  const idSag        = str(raw["id_sag_c"]);
  const invoiceStatus = str(raw["invoice_status"]);
  if (!idSag)        return "pending_sag";
  if (!invoiceStatus) return "synced_sag";
  return "invoiced";
}

function deriveLedgerStatusFromReceivable(
  status:      string,
  daysOverdue: number,
): LedgerStatus {
  if (status === "PAID")         return "paid";
  if (status === "WRITTEN_OFF")  return "written_off";
  if (daysOverdue > 0)           return "overdue";
  if (status === "PARTIAL")      return "partial";
  return "current";
}

function derivePaymentStatus(
  status:     string,
  daysOverdue: number,
): PaymentStatus {
  if (status === "PAID")    return "paid";
  if (daysOverdue > 0)      return "overdue";
  if (status === "PARTIAL") return "partial";
  return "pending";
}

// ── CRM quote pipeline stats (reusable JS reducer) ───────────────────────────
//
// Accepts an array of { amount, status, rawCrmJson } rows.
// Returns pipeline breakdown counts + amounts. Used for seller + customer views
// where we fetchMany quotes in JS rather than use $queryRaw.

interface CrmPipelineStats {
  totalQuotes:        number;
  totalQuoteAmount:   number;
  pendingToSag:       number;
  pendingToSagAmount: number;
  syncedToSag:        number;
  notInvoiced:        number;
  notInvoicedAmount:  number;
  acceptedQuotes:     number;
  acceptedAmount:     number;
}

function computeCrmPipelineStats(
  quotes: Array<{ amount: Prisma.Decimal; status: string; rawCrmJson: unknown }>,
): CrmPipelineStats {
  return quotes.reduce<CrmPipelineStats>(
    (acc, q) => {
      const raw           = extractRaw(q.rawCrmJson);
      const idSag         = str(raw["id_sag_c"]);
      const invoiceStatus = str(raw["invoice_status"]);
      const amt           = Number(q.amount);

      acc.totalQuotes++;
      acc.totalQuoteAmount += amt;

      if (!idSag) {
        acc.pendingToSag++;
        acc.pendingToSagAmount += amt;
      } else {
        acc.syncedToSag++;
        if (!invoiceStatus) {
          acc.notInvoiced++;
          acc.notInvoicedAmount += amt;
        }
      }

      if (q.status === "ACCEPTED") {
        acc.acceptedQuotes++;
        acc.acceptedAmount += amt;
      }

      return acc;
    },
    {
      totalQuotes: 0, totalQuoteAmount: 0,
      pendingToSag: 0, pendingToSagAmount: 0,
      syncedToSag: 0,
      notInvoiced: 0, notInvoicedAmount: 0,
      acceptedQuotes: 0, acceptedAmount: 0,
    },
  );
}

// ── Customer timeline ─────────────────────────────────────────────────────────

/**
 * Returns a unified, chronologically-sorted commercial timeline for a single
 * customer (looked up by customerId), merging CRMQuote + CustomerReceivable + SaleRecord.
 */
export async function getUnifiedCustomerCommercialTimeline(
  customerId: string,
  orgId:      string,
): Promise<CommercialTimelineResult> {
  return _buildTimeline(customerId, orgId);
}

/**
 * Returns the unified timeline for a customer identified by NIT or name
 * (no customerId required). Used by the /sales/customers/[slug] detail page.
 */
export async function getCustomerCommercialTimelineByKey(
  orgId:       string,
  customerKey: string,   // NIT (preferred) or customerName
): Promise<CommercialTimelineResult> {
  // Resolve to a CustomerProfile.id if possible
  const profile = await prisma.customerProfile.findFirst({
    where: {
      organizationId: orgId,
      OR: [
        { nit:  customerKey },
        { name: customerKey },
      ],
    },
    select: { id: true },
  });

  if (profile) {
    return _buildTimeline(profile.id, orgId, customerKey);
  }

  // No profile found — only SaleRecord lookup is possible
  return _buildTimeline(null, orgId, customerKey);
}

async function _buildTimeline(
  customerId:  string | null,
  orgId:       string,
  customerKey?: string,   // NIT or name — used for SaleRecord fallback
): Promise<CommercialTimelineResult> {
  const facts: CommercialFact[] = [];

  // ── 1. CRMQuote ─────────────────────────────────────────────────────────
  if (customerId) {
    const quotes = await prisma.cRMQuote.findMany({
      where: { customerId },
      orderBy: { issuedAt: "desc" },
      take: 50,
    });

    for (const q of quotes) {
      const raw      = extractRaw(q.rawCrmJson);
      const stage    = str(raw["stage"]);
      const sagResp  = str(raw["respuesta_sag_c"]);
      const idSag    = str(raw["id_sag_c"]);
      const sucursal = str(raw["sucursal_c"]);

      facts.push({
        id:               q.id,
        customerId:       q.customerId ?? null,
        sourceType:       "crm_quote",
        sourceId:         q.id,
        documentNumber:   q.quoteNumber ?? str(raw["number"]),
        sellerName:       q.sellerName ?? null,
        branch:           sucursal,
        grossAmount:      Number(q.amount),
        paidAmount:       null,
        outstandingAmount: null,
        crmStatus:        stage ?? q.status,
        sagStatus:        idSag ? (sagResp ?? "synced") : null,
        paymentStatus:    null,
        ledgerStatus:     deriveLedgerStatusFromQuote(raw),
        issuedAt:         q.issuedAt,
        paidAt:           q.respondedAt ?? null,
        dueAt:            q.expiresAt   ?? null,
        sagDocumentFamily: null,
      });
    }
  }

  // ── 2. CustomerReceivable ────────────────────────────────────────────────
  // DATA-TRUST-REMEDIATION-01B: gate receivable section on certification.
  // Default false — no missing orgId may ever imply certification.
  const { isReceivableDataCertified: _isCertTl, warmTruthStatusCache: _warmTl } =
    await import("@/lib/comercial/frontline/receivable-truth-status");
  await _warmTl();
  const arCertified = _isCertTl(orgId);

  const receivableWhere = customerId
    ? { customerId }
    : customerKey
      ? {
          organizationId: orgId,
          OR: [{ customerNit: customerKey }, { customerName: customerKey }],
        }
      : null;

  if (receivableWhere && arCertified) {
    const receivables = await prisma.customerReceivable.findMany({
      where:   receivableWhere,
      orderBy: { invoiceDate: "desc" },
      take:    50,
    });

    for (const r of receivables) {
      facts.push({
        id:               r.id,
        customerId:       r.customerId ?? null,
        sourceType:       "sag_invoice",
        sourceId:         r.id,
        documentNumber:   r.invoiceNumber ?? r.erpId ?? null,
        sellerName:       null,
        branch:           null,
        grossAmount:      Number(r.originalAmount),
        paidAmount:       Number(r.paidAmount),
        outstandingAmount: Number(r.balanceDue),
        crmStatus:        null,
        sagStatus:        r.status,
        paymentStatus:    derivePaymentStatus(r.status, r.daysOverdue),
        ledgerStatus:     deriveLedgerStatusFromReceivable(r.status, r.daysOverdue),
        issuedAt:         r.invoiceDate,
        paidAt:           r.paidAt ?? null,
        dueAt:            r.dueDate,
        sagDocumentFamily: null,
      });
    }
  }

  // ── 3. SaleRecord (via NIT lookup) ───────────────────────────────────────
  let nitForSale: string | null = null;
  if (customerId) {
    const profile = await prisma.customerProfile.findUnique({
      where:  { id: customerId },
      select: { nit: true },
    });
    nitForSale = profile?.nit ?? null;
  } else if (customerKey) {
    nitForSale = customerKey; // assume it's the NIT
  }

  if (nitForSale) {
    const sales = await prisma.saleRecord.findMany({
      where:   { customerNit: nitForSale },
      orderBy: { saleDate: "desc" },
      take:    50,
    });

    for (const s of sales) {
      facts.push({
        id:               s.id,
        customerId:       customerId ?? null,
        sourceType:       "xml_payment",
        sourceId:         s.id,
        documentNumber:   s.comprobante ?? s.comprobanteCode ?? null,
        sellerName:       s.sellerName,
        branch:           s.storeName,
        grossAmount:      Number(s.amount),
        paidAmount:       Number(s.amount),
        outstandingAmount: 0,
        crmStatus:        null,
        sagStatus:        null,
        paymentStatus:    "paid",
        ledgerStatus:     "collected_xml",
        issuedAt:         s.saleDate,
        paidAt:           s.saleDate,
        dueAt:            null,
        sagDocumentFamily: s.sagDocumentFamily,
      });
    }
  }

  // Sort descending by issuedAt (nulls last)
  facts.sort((a, b) => {
    const ta = a.issuedAt?.getTime() ?? 0;
    const tb = b.issuedAt?.getTime() ?? 0;
    return tb - ta;
  });

  return {
    items: facts,
    receivableTruthState: arCertified ? "CERTIFIED" as const : "UNVERIFIED" as const,
    receivableReason: arCertified ? null : "RECEIVABLE_DATA_NOT_CERTIFIED",
  };
}

// ── Org-level KPIs ────────────────────────────────────────────────────────────

/**
 * Aggregates unified commercial KPIs for the entire org.
 * Exposes full CRM→SAG pipeline breakdown alongside receivables metrics.
 */
export async function getUnifiedCommercialKpis(
  orgId: string,
): Promise<CommercialKpis> {
  // DATA-TRUST-REMEDIATION-01B: gate AR-dependent KPIs on receivable certification
  const { isReceivableDataCertified, warmTruthStatusCache } = await import("@/lib/comercial/frontline/receivable-truth-status");
  await warmTruthStatusCache();
  const _arCertified = isReceivableDataCertified(orgId);

  type CrmStatsRaw = {
    pending_to_sag:        string;
    pending_to_sag_amount: number;
    synced_to_sag:         string;
    synced_to_sag_amount:  number;
    not_invoiced:          string;
    not_invoiced_amount:   number;
    accepted_quotes:       string;
    accepted_amount:       number;
    total_count:           string;
  };

  // CRM pipeline breakdown — always executes (not AR-dependent)
  const crmStatsRows = await prisma.$queryRaw<CrmStatsRaw[]>(Prisma.sql`
    WITH q_attrs AS (
      SELECT
        "amount"::float                                         AS amount,
        status::text                                            AS status,
        NULLIF(TRIM(COALESCE(
          "rawCrmJson"->'raw'->>'id_sag_c',
          "rawCrmJson"->>'id_sag_c',
          ''
        )), '')                                                 AS id_sag,
        NULLIF(TRIM(COALESCE(
          "rawCrmJson"->'raw'->>'invoice_status',
          "rawCrmJson"->>'invoice_status',
          ''
        )), '')                                                 AS invoice_status
      FROM "CRMQuote"
      WHERE "organizationId" = ${orgId}
    )
    SELECT
      CAST(COUNT(*) FILTER (WHERE id_sag IS NULL)                          AS TEXT) AS pending_to_sag,
      COALESCE(SUM(amount)  FILTER (WHERE id_sag IS NULL),           0)   AS pending_to_sag_amount,
      CAST(COUNT(*) FILTER (WHERE id_sag IS NOT NULL)                      AS TEXT) AS synced_to_sag,
      COALESCE(SUM(amount)  FILTER (WHERE id_sag IS NOT NULL),       0)   AS synced_to_sag_amount,
      CAST(COUNT(*) FILTER (WHERE id_sag IS NOT NULL AND invoice_status IS NULL) AS TEXT) AS not_invoiced,
      COALESCE(SUM(amount)  FILTER (WHERE id_sag IS NOT NULL AND invoice_status IS NULL), 0) AS not_invoiced_amount,
      CAST(COUNT(*) FILTER (WHERE status = 'ACCEPTED')                     AS TEXT) AS accepted_quotes,
      COALESCE(SUM(amount)  FILTER (WHERE status = 'ACCEPTED'),      0)   AS accepted_amount,
      CAST(COUNT(*)                                                         AS TEXT) AS total_count
    FROM q_attrs
  `);

  // AR aggregates — skip entirely when uncertified (DATA-TRUST-REMEDIATION-01B: query-level gate)
  const _arStub = { _sum: { originalAmount: null, paidAmount: null, balanceDue: null }, _count: { id: 0 } };
  const _arStubNoCount = { _sum: { balanceDue: null } };

  const [receivableAgg, openAgg, overdueAgg] = _arCertified
    ? await Promise.all([
        prisma.customerReceivable.aggregate({
          where: { organizationId: orgId },
          _sum: { originalAmount: true, paidAmount: true, balanceDue: true },
          _count: { id: true },
        }),
        prisma.customerReceivable.aggregate({
          where: { organizationId: orgId, status: { in: ["OPEN", "PARTIAL", "OVERDUE"] } },
          _sum:   { balanceDue: true },
          _count: { id: true },
        }),
        prisma.customerReceivable.aggregate({
          where: { organizationId: orgId, daysOverdue: { gt: 0 }, status: { in: ["OPEN", "PARTIAL", "OVERDUE"] } },
          _sum: { balanceDue: true },
        }),
      ])
    : [_arStub, _arStub, _arStubNoCount];

  const crmStats     = crmStatsRows[0];
  // When AR data is uncertified, return null for all receivable-derived fields
  const totalInvoiced    = _arCertified ? Number(receivableAgg._sum.originalAmount ?? 0) : null;
  const totalCollected   = _arCertified ? Number(receivableAgg._sum.paidAmount     ?? 0) : null;
  const totalOutstanding = _arCertified ? Number(openAgg._sum.balanceDue            ?? 0) : null;
  const totalOverdue     = _arCertified ? Number(overdueAgg._sum.balanceDue         ?? 0) : null;

  return {
    totalOrdered:       Number(crmStats?.pending_to_sag_amount ?? 0)
                      + Number(crmStats?.synced_to_sag_amount  ?? 0),
    totalInvoiced,
    totalCollected,
    totalOutstanding,
    totalOverdue,
    collectionRate:     _arCertified && totalInvoiced != null && totalInvoiced > 0
                          ? Math.round((totalCollected! / totalInvoiced) * 10000) / 100
                          : null,

    pendingToSag:       Number(crmStats?.pending_to_sag       ?? 0),
    pendingToSagAmount: Number(crmStats?.pending_to_sag_amount ?? 0),
    syncedToSag:        Number(crmStats?.synced_to_sag        ?? 0),
    syncedToSagAmount:  Number(crmStats?.synced_to_sag_amount  ?? 0),
    notInvoiced:        Number(crmStats?.not_invoiced          ?? 0),
    notInvoicedAmount:  Number(crmStats?.not_invoiced_amount   ?? 0),
    acceptedQuotes:     Number(crmStats?.accepted_quotes       ?? 0),
    acceptedAmount:     Number(crmStats?.accepted_amount       ?? 0),

    quoteCount:         Number(crmStats?.total_count           ?? 0),
    openInvoiceCount:   openAgg._count.id,
    truthState:         _arCertified ? "CERTIFIED" as const : "UNVERIFIED" as const,
    reason:             _arCertified ? null : "RECEIVABLE_DATA_NOT_CERTIFIED",
  };
}

// ── Seller-level ledger KPIs ──────────────────────────────────────────────────

/**
 * Returns unified commercial KPIs for a specific seller.
 * CRM: from CRMQuote.sellerSlug.
 * Receivables: from CustomerReceivable joined through CustomerProfile.sellerSlug.
 */
export async function getSellerLedgerKpis(
  orgId:      string,
  sellerSlug: string,
): Promise<SellerLedgerKpis> {
  // DATA-TRUST-REMEDIATION-01B: gate on receivable certification
  const { isReceivableDataCertified: _isCert } = await import("@/lib/comercial/frontline/receivable-truth-status");
  const _arCert = _isCert(orgId);

  type ReceivableStatsRaw = {
    outstanding: number;
    overdue:     number;
    overdue_cnt: string;
    seller_name: string | null;
  };

  // CRM quotes — always executes (not AR-dependent)
  const quotes = await prisma.cRMQuote.findMany({
    where:  { organizationId: orgId, sellerSlug },
    select: { amount: true, status: true, rawCrmJson: true, sellerName: true },
  });

  // AR receivable stats — skip entirely when uncertified (DATA-TRUST-REMEDIATION-01B: query-level gate)
  const recvStatsRows: ReceivableStatsRaw[] = _arCert
    ? await prisma.$queryRaw<ReceivableStatsRaw[]>(Prisma.sql`
        SELECT
          COALESCE(SUM(cr."balanceDue")::float,                                  0) AS outstanding,
          COALESCE(SUM(cr."balanceDue") FILTER (WHERE cr."daysOverdue" > 0)::float, 0) AS overdue,
          CAST(COUNT(*) FILTER (WHERE cr."daysOverdue" > 0)              AS TEXT) AS overdue_cnt,
          MAX(cp."sellerName")                                                    AS seller_name
        FROM   "CustomerReceivable" cr
        INNER  JOIN "CustomerProfile" cp ON cp.id = cr."customerId"
        WHERE  cr."organizationId" = ${orgId}
          AND  cr.status            NOT IN ('PAID', 'WRITTEN_OFF')
          AND  cp."sellerSlug"      = ${sellerSlug}
      `)
    : [];

  const crmStats = computeCrmPipelineStats(quotes);
  const recv     = recvStatsRows[0];

  return {
    sellerSlug,
    sellerName:         quotes[0]?.sellerName ?? recv?.seller_name ?? null,
    ...crmStats,
    totalOutstanding:   _arCert ? Number(recv?.outstanding ?? 0) : null,
    totalOverdue:       _arCert ? Number(recv?.overdue      ?? 0) : null,
    overdueCount:       _arCert ? Number(recv?.overdue_cnt  ?? 0) : null,
    truthState:         _arCert ? "CERTIFIED" as const : "UNVERIFIED" as const,
    reason:             _arCert ? null : "RECEIVABLE_DATA_NOT_CERTIFIED",
  };
}

// ── Customer-level ledger KPIs ────────────────────────────────────────────────

/**
 * Returns unified commercial KPIs for a customer identified by NIT or name.
 * Resolves through CustomerProfile when possible; falls back to direct field match.
 */
export async function getCustomerLedgerKpis(
  orgId:       string,
  customerKey: string,   // NIT or customerName
): Promise<CustomerLedgerKpis> {
  // DATA-TRUST-REMEDIATION-01B: gate on receivable certification
  const { isReceivableDataCertified: _isCert2 } = await import("@/lib/comercial/frontline/receivable-truth-status");
  const _arCert2 = _isCert2(orgId);

  // Resolve CustomerProfile
  const profile = await prisma.customerProfile.findFirst({
    where: {
      organizationId: orgId,
      OR: [{ nit: customerKey }, { name: customerKey }],
    },
    select: { id: true, name: true, nit: true },
  });

  const customerId = profile?.id ?? null;

  // CRM quotes (by customerId if available, else no CRM data)
  const quotesPromise = customerId
    ? prisma.cRMQuote.findMany({
        where:  { customerId },
        select: { amount: true, status: true, rawCrmJson: true },
      })
    : Promise.resolve([]);

  // Receivables — match by customerId OR by NIT/name directly
  const recvWhere = customerId
    ? { organizationId: orgId, customerId }
    : {
        organizationId: orgId,
        OR: [{ customerNit: customerKey }, { customerName: customerKey }],
      };

  // CRM quotes — always executes (not AR-dependent)
  const quotes = await quotesPromise;

  // AR aggregates — skip entirely when uncertified (DATA-TRUST-REMEDIATION-01B: query-level gate)
  const _arStubCust = { _sum: { originalAmount: null, paidAmount: null, balanceDue: null } };

  const [recvAgg, recvOverdue] = _arCert2
    ? await Promise.all([
        prisma.customerReceivable.aggregate({
          where: recvWhere,
          _sum: { originalAmount: true, paidAmount: true, balanceDue: true },
        }),
        prisma.customerReceivable.aggregate({
          where: { ...recvWhere, daysOverdue: { gt: 0 }, status: { in: ["OPEN", "PARTIAL", "OVERDUE"] } },
          _sum: { balanceDue: true },
        }),
      ])
    : [_arStubCust, _arStubCust];

  const crmStats    = computeCrmPipelineStats(quotes);
  const totalInvoiced    = _arCert2 ? Number(recvAgg._sum.originalAmount ?? 0) : null;
  const totalCollected   = _arCert2 ? Number(recvAgg._sum.paidAmount     ?? 0) : null;
  const totalOutstanding = _arCert2 ? Number(recvAgg._sum.balanceDue     ?? 0) : null;
  const totalOverdue     = _arCert2 ? Number(recvOverdue._sum.balanceDue ?? 0) : null;

  return {
    customerId,
    customerName: profile?.name ?? customerKey,
    customerNit:  profile?.nit  ?? null,
    totalQuotes:      crmStats.totalQuotes,
    totalQuoteAmount: crmStats.totalQuoteAmount,
    pendingToSag:     crmStats.pendingToSag,
    notInvoiced:      crmStats.notInvoiced,
    totalInvoiced,
    totalCollected,
    totalOutstanding,
    totalOverdue,
    collectionRate: _arCert2 && totalInvoiced != null && totalInvoiced > 0
      ? Math.round((totalCollected! / totalInvoiced) * 10000) / 100
      : null,
    truthState:     _arCert2 ? "CERTIFIED" as const : "UNVERIFIED" as const,
    reason:         _arCert2 ? null : "RECEIVABLE_DATA_NOT_CERTIFIED",
  };
}
