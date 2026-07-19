import { DocumentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ── Domain definitions ────────────────────────────────────────────────────────

// Document types that are considered financial by definition.
// PDF is included because bank PDFs, receipts, and non-structured documents
// are commonly uploaded before their type is narrowed to a more specific value.
export const FINANCIAL_DOC_TYPES: DocumentType[] = [
  "XML",
  "BANK_STATEMENT",
  "ACCOUNTING_SUPPORT",
  "TAX_DOCUMENT",
  "COMMERCIAL_DOCUMENT",
  "PDF",
];

// Alert.type prefixes that belong to the finance/accounting domain.
// Convention: alerts are typed as "domain.condition" (e.g. "tax.deadline.approaching").
const FINANCIAL_ALERT_PREFIXES = [
  "finance.",
  "accounting.",
  "tax.",
  "invoice.",
  "payment.",
  "bank.",
  "document.",
];

// Run/Event type prefixes that represent financial operations.
const FINANCIAL_OPERATION_PREFIXES = [
  "document.",
  "integration.pya.",
  "accounting.",
  "finance.",
  "bank.",
];

// Prisma OR clause for financial alert type prefixes
const financialAlertTypeFilter = FINANCIAL_ALERT_PREFIXES.map((prefix) => ({
  type: { startsWith: prefix },
}));

// Prisma OR clause for financial run/event type prefixes
const financialOperationTypeFilter = FINANCIAL_OPERATION_PREFIXES.map(
  (prefix) => ({ type: { startsWith: prefix } })
);

// ── getFinanceOverview ────────────────────────────────────────────────────────

export interface FinanceOverview {
  documents: {
    total: number;
    pending: number;   // PENDING or PROCESSING — awaiting processing
    processed: number; // PROCESSED or REVIEWED — completed
    errors: number;    // ERROR or REJECTED — require attention
  };
  openAlerts: number;        // non-resolved financial alerts
  recentFailedRuns: number;  // failed financial runs in the last 7 days
}

export async function getFinanceOverview(
  organizationId: string
): Promise<FinanceOverview> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const baseDocWhere = {
    organizationId,
    deletedAt: null,
    type: { in: FINANCIAL_DOC_TYPES },
  };

  const [
    totalDocuments,
    pendingDocuments,
    processedDocuments,
    errorDocuments,
    openAlerts,
    recentFailedRuns,
  ] = await Promise.all([
    prisma.document.count({ where: baseDocWhere }),

    prisma.document.count({
      where: { ...baseDocWhere, status: { in: ["PENDING", "PROCESSING"] } },
    }),

    prisma.document.count({
      where: { ...baseDocWhere, status: { in: ["PROCESSED", "REVIEWED"] } },
    }),

    prisma.document.count({
      where: { ...baseDocWhere, status: { in: ["ERROR", "REJECTED"] } },
    }),

    prisma.alert.count({
      where: {
        organizationId,
        status: { not: "RESOLVED" },
        OR: financialAlertTypeFilter,
      },
    }),

    prisma.run.count({
      where: {
        organizationId,
        status: "FAILED",
        createdAt: { gte: sevenDaysAgo },
        OR: financialOperationTypeFilter,
      },
    }),
  ]);

  return {
    documents: {
      total:     totalDocuments,
      pending:   pendingDocuments,
      processed: processedDocuments,
      errors:    errorDocuments,
    },
    openAlerts,
    recentFailedRuns,
  };
}

// ── getRecentFinancialDocuments ───────────────────────────────────────────────

export type RecentFinancialDocument = {
  id: string;
  title: string;
  type: DocumentType;
  category: string | null;
  status: string;
  amount: import("@prisma/client").Prisma.Decimal | null;
  currency: string | null;
  documentDate: Date | null;
  issuerName: string | null;
  createdAt: Date;
  extractedJson: unknown;
};

export interface FinanceDocumentFilters {
  validationStatus?: string; // "VALID" | "INCOMPLETE" | "REVIEW_REQUIRED"
  processingMode?:   string; // "xml-first" | "pdf-fallback" | "manual-review-needed" | ...
  docType?:          DocumentType;
}

export async function getRecentFinancialDocuments(
  organizationId: string,
  filters?: FinanceDocumentFilters
): Promise<RecentFinancialDocument[]> {
  // Build JSON path conditions (extractedJson is a Postgres jsonb column).
  // Multiple json conditions are expressed as AND so Prisma generates separate
  // jsonb path predicates per condition.
  const andConditions: Prisma.DocumentWhereInput[] = [];
  if (filters?.validationStatus) {
    andConditions.push({
      extractedJson: { path: ["validationStatus"], equals: filters.validationStatus },
    });
  }
  if (filters?.processingMode) {
    andConditions.push({
      extractedJson: { path: ["processingMode"], equals: filters.processingMode },
    });
  }

  return prisma.document.findMany({
    where: {
      organizationId,
      deletedAt: null,
      type: filters?.docType ? { equals: filters.docType } : { in: FINANCIAL_DOC_TYPES },
      ...(andConditions.length > 0 ? { AND: andConditions } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id:            true,
      title:         true,
      type:          true,
      category:      true,
      status:        true,
      amount:        true,
      currency:      true,
      documentDate:  true,
      issuerName:    true,
      createdAt:     true,
      extractedJson: true,
    },
  });
}

// ── getFinancialAlerts ────────────────────────────────────────────────────────

export type FinancialAlert = {
  id: string;
  type: string;
  title: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  status: string;
  createdAt: Date;
};

export async function getFinancialAlerts(
  organizationId: string
): Promise<FinancialAlert[]> {
  return prisma.alert.findMany({
    where: {
      organizationId,
      status: { not: "RESOLVED" },
      OR: financialAlertTypeFilter,
    },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: 20,
    select: {
      id:        true,
      type:      true,
      title:     true,
      severity:  true,
      status:    true,
      createdAt: true,
    },
  }) as Promise<FinancialAlert[]>;
}

// ── getRecentFinancialActivity ────────────────────────────────────────────────

export type FinanceActivityItem = {
  kind: "run" | "event";
  id: string;
  type: string;
  status: string;
  sourceType: string | null;
  createdAt: Date;
};

export async function getRecentFinancialActivity(
  organizationId: string
): Promise<FinanceActivityItem[]> {
  const [runs, events] = await Promise.all([
    prisma.run.findMany({
      where: {
        organizationId,
        OR: financialOperationTypeFilter,
      },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id:        true,
        type:      true,
        status:    true,
        createdAt: true,
      },
    }),

    prisma.event.findMany({
      where: {
        organizationId,
        OR: financialOperationTypeFilter,
      },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id:         true,
        type:       true,
        status:     true,
        sourceType: true,
        createdAt:  true,
      },
    }),
  ]);

  return [
    ...runs.map((r) => ({
      kind:       "run" as const,
      id:         r.id,
      type:       r.type,
      status:     r.status,
      sourceType: null,
      createdAt:  r.createdAt,
    })),
    ...events.map((e) => ({
      kind:       "event" as const,
      id:         e.id,
      type:       e.type,
      status:     e.status,
      sourceType: e.sourceType,
      createdAt:  e.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20);
}

// ── getValidationStatusCounts ─────────────────────────────────────────────────

export interface ValidationStatusCounts {
  VALID:            number;
  INCOMPLETE:       number;
  REVIEW_REQUIRED:  number;
  reviewed:         number;  // documents already in REVIEWED status
  unprocessed:      number;  // financial docs with no extractedJson validationStatus yet
}

export async function getValidationStatusCounts(
  organizationId: string
): Promise<ValidationStatusCounts> {
  // Two queries in parallel: validation status breakdown + REVIEWED doc count.
  type Row = { status: string | null; count: number };
  type ReviewedRow = { count: number };

  const [rows, reviewedRows] = await Promise.all([
    prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT
        ("extractedJson"->>'validationStatus') AS status,
        COUNT(*)::int                          AS count
      FROM "Document"
      WHERE "organizationId" = ${organizationId}
        AND "deletedAt" IS NULL
        AND "status" != 'REVIEWED'
        AND "type" = ANY(ARRAY[
          'XML','BANK_STATEMENT','ACCOUNTING_SUPPORT',
          'TAX_DOCUMENT','COMMERCIAL_DOCUMENT','PDF'
        ]::"DocumentType"[])
      GROUP BY "extractedJson"->>'validationStatus'
    `),
    prisma.$queryRaw<ReviewedRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS count
      FROM "Document"
      WHERE "organizationId" = ${organizationId}
        AND "deletedAt" IS NULL
        AND "status" = 'REVIEWED'
        AND "type" = ANY(ARRAY[
          'XML','BANK_STATEMENT','ACCOUNTING_SUPPORT',
          'TAX_DOCUMENT','COMMERCIAL_DOCUMENT','PDF'
        ]::"DocumentType"[])
    `),
  ]);

  const counts: ValidationStatusCounts = {
    VALID:           0,
    INCOMPLETE:      0,
    REVIEW_REQUIRED: 0,
    reviewed:        reviewedRows[0]?.count ?? 0,
    unprocessed:     0,
  };

  for (const row of rows) {
    if (row.status === "VALID")                counts.VALID           += row.count;
    else if (row.status === "INCOMPLETE")      counts.INCOMPLETE      += row.count;
    else if (row.status === "REVIEW_REQUIRED") counts.REVIEW_REQUIRED += row.count;
    else                                       counts.unprocessed     += row.count;
  }

  return counts;
}
