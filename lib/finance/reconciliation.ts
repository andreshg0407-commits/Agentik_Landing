/**
 * reconciliation.ts
 *
 * Sprint 1 — Reconciliación bancaria y documental V1
 *
 * Matching engine: joins FinancialDocuments ↔ CustomerReceivables (cartera)
 * using the multi-signal scoring defined in reconciliation-rules.ts.
 *
 * No new migration required — operates on existing Document and
 * CustomerReceivable models.
 *
 * Architecture:
 *   1. Load financial documents (XML / PDF invoices + BANK_STATEMENT)
 *   2. Load cartera (CustomerReceivable)
 *   3. Match in-memory with a greedy best-score algorithm
 *   4. Classify each match into a ReconciliationStatus
 *   5. Return a ReconciliationSummary ready for the UI
 */

import { prisma }            from "@/lib/prisma";
import {
  scoreInvoiceNumber,
  scoreNit,
  scoreAmount,
  scoreDate,
  scoreReferenceInMemo,
  extractInvoiceNumber,
  extractReceiverNit,
  THRESHOLD_CONCILIADO,
  THRESHOLD_PARCIAL,
  AMOUNT_TOLERANCE_LOOSE,
} from "./reconciliation-rules";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReconciliationStatus =
  | "CONCILIADO"    // fully matched + paid
  | "PARCIAL"       // matched but balance outstanding or low-confidence
  | "PENDIENTE"     // no match found
  | "INCONSISTENTE"; // match found but amounts/NITs diverge beyond tolerance

export interface RecDocumentRef {
  id:                  string;
  title:               string;
  type:                string;
  amount:              number | null;
  currency:            string | null;
  documentDate:        Date | null;
  issuerName:          string | null;
  issuerId:            string | null;
  receiverId:          string | null;
  extractedInvoiceNum: string | null;
  extractedNit:        string | null;
}

export interface RecReceivableRef {
  id:             string;
  invoiceNumber:  string | null;
  customerNit:    string | null;
  customerName:   string | null;
  originalAmount: number;
  paidAmount:     number;
  balanceDue:     number;
  invoiceDate:    Date | null;
  dueDate:        Date | null;
  agingBucket:    string | null;
  daysOverdue:    number;
  erpStatus:      string;  // OPEN | PARTIAL | PAID | WRITTEN_OFF
}

export interface ReconciliationItem {
  id:          string;
  status:      ReconciliationStatus;
  document?:   RecDocumentRef;
  receivable?: RecReceivableRef;
  matchScore:  number;
  matchedBy:   string[];
  amountDiff:  number | null;
  notes:       string[];
}

export interface ReconciliationSummary {
  total:         number;
  conciliado:    number;
  parcial:       number;
  pendiente:     number;
  inconsistente: number;
  items:         ReconciliationItem[];
  hasData:       boolean;
}

// ── Database loader ───────────────────────────────────────────────────────────

type RawDocument = {
  id:            string;
  title:         string;
  type:          string;
  amount:        { toNumber(): number } | null;
  currency:      string | null;
  documentDate:  Date | null;
  issuerName:    string | null;
  issuerId:      string | null;
  receiverId:    string | null;
  extractedJson: unknown;
};

type RawReceivable = {
  id:             string;
  invoiceNumber:  string | null;
  customerNit:    string | null;
  customerName:   string | null;
  originalAmount: { toNumber(): number };
  paidAmount:     { toNumber(): number };
  balanceDue:     { toNumber(): number };
  invoiceDate:    Date | null;
  dueDate:        Date | null;
  agingBucket:    string | null;
  daysOverdue:    number;
  status:         string;
};

async function loadDocuments(organizationId: string): Promise<RawDocument[]> {
  return prisma.document.findMany({
    where: {
      organizationId,
      deletedAt: null,
      type: { in: ["XML", "PDF", "BANK_STATEMENT", "ACCOUNTING_SUPPORT"] },
      status: { in: ["PENDING", "PROCESSED", "REVIEWED"] },
    },
    orderBy: { documentDate: "desc" },
    take:    300,
    select: {
      id:            true,
      title:         true,
      type:          true,
      amount:        true,
      currency:      true,
      documentDate:  true,
      issuerName:    true,
      issuerId:      true,
      receiverId:    true,
      extractedJson: true,
    },
  }) as Promise<RawDocument[]>;
}

async function loadReceivables(organizationId: string): Promise<RawReceivable[]> {
  return prisma.customerReceivable.findMany({
    where:   { organizationId },
    orderBy: { invoiceDate: "desc" },
    take:    300,
    select: {
      id:             true,
      invoiceNumber:  true,
      customerNit:    true,
      customerName:   true,
      originalAmount: true,
      paidAmount:     true,
      balanceDue:     true,
      invoiceDate:    true,
      dueDate:        true,
      agingBucket:    true,
      daysOverdue:    true,
      status:         true,
    },
  }) as Promise<RawReceivable[]>;
}

// ── Matching engine ───────────────────────────────────────────────────────────

interface MatchResult {
  receivable: RawReceivable;
  score:      number;
  matchedBy:  string[];
  amountDiff: number | null;
  isInconsistent: boolean;
}

function matchDocumentToReceivables(
  doc:         RawDocument,
  receivables: RawReceivable[],
  usedIds:     Set<string>,
): MatchResult | null {
  const docAmount   = doc.amount?.toNumber() ?? null;
  const docInvNum   = extractInvoiceNumber(doc.extractedJson) ?? doc.title ?? null;
  const docNit      = doc.receiverId ?? extractReceiverNit(doc.extractedJson) ?? null;

  let best: (MatchResult & { receivable: RawReceivable }) | null = null;

  for (const rec of receivables) {
    if (usedIds.has(rec.id)) continue;

    const matchedBy:     string[] = [];
    let   totalScore             = 0;
    let   isInconsistent         = false;

    // ── Invoice number ─────────────────────────────────────────────────────
    const invScore = scoreInvoiceNumber(docInvNum, rec.invoiceNumber);
    if (invScore > 0) { totalScore += invScore; matchedBy.push("numero_factura"); }

    // ── NIT ────────────────────────────────────────────────────────────────
    const nitScore = scoreNit(docNit, rec.customerNit)
                  || scoreNit(doc.issuerId, rec.customerNit);
    if (nitScore > 0) { totalScore += nitScore; matchedBy.push("nit_cliente"); }

    // ── Amount ─────────────────────────────────────────────────────────────
    const {
      score:         amtScore,
      amountDiff:    diff,
      isInconsistent: amtInconsistent,
    } = scoreAmount(docAmount, rec.originalAmount.toNumber());
    if (amtScore > 0) { totalScore += amtScore; matchedBy.push("monto"); }
    if (amtInconsistent) isInconsistent = true;

    // ── Date ───────────────────────────────────────────────────────────────
    const dtScore = scoreDate(doc.documentDate, rec.invoiceDate);
    if (dtScore > 0) { totalScore += dtScore; matchedBy.push("fecha"); }

    // ── Reference in document title ────────────────────────────────────────
    if (rec.invoiceNumber) {
      const refScore = scoreReferenceInMemo(rec.invoiceNumber, doc.title);
      if (refScore > 0) { totalScore += refScore; matchedBy.push("referencia_titulo"); }
    }

    // ── NIT in title (bank statement fallback) ─────────────────────────────
    if (rec.customerNit && doc.title.includes(rec.customerNit)) {
      totalScore += 5;
      matchedBy.push("nit_en_titulo");
    }

    if (totalScore > 0 && (!best || totalScore > best.score)) {
      best = {
        receivable:     rec,
        score:          totalScore,
        matchedBy,
        amountDiff:     diff,
        isInconsistent,
      };
    }
  }

  return best;
}

// ── Status resolution ─────────────────────────────────────────────────────────

function resolveStatus(
  match:      MatchResult | null,
  doc:        RawDocument | null,
  receivable: RawReceivable | null,
): ReconciliationStatus {
  // Orphan receivable (paid) — no document needed
  if (!doc && receivable) {
    if (receivable.status === "PAID") return "CONCILIADO";
    return "PENDIENTE";
  }

  // Orphan document — no receivable found
  if (doc && !match) return "PENDIENTE";

  if (!match) return "PENDIENTE";

  const { score, isInconsistent } = match;
  const rec = match.receivable;

  // High-confidence match
  if (score >= THRESHOLD_CONCILIADO) {
    if (isInconsistent) return "INCONSISTENTE";
    if (rec.status === "PAID")    return "CONCILIADO";
    const outstandingPct = rec.balanceDue.toNumber() / Math.max(rec.originalAmount.toNumber(), 1);
    if (outstandingPct < 0.02)    return "CONCILIADO"; // effectively paid (rounding)
    return "PARCIAL";
  }

  // Low-confidence match
  if (score >= THRESHOLD_PARCIAL) {
    if (isInconsistent) return "INCONSISTENTE";
    return "PARCIAL";
  }

  return "PENDIENTE";
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function getReconciliationSummary(
  organizationId: string,
): Promise<ReconciliationSummary> {
  const [rawDocs, rawRecs] = await Promise.all([
    loadDocuments(organizationId),
    loadReceivables(organizationId),
  ]);

  const items:    ReconciliationItem[] = [];
  const usedRecIds = new Set<string>(); // receivables already consumed by a match

  // ── Pass 1: match each document to the best available receivable ──────────
  for (const doc of rawDocs) {
    const match = matchDocumentToReceivables(doc, rawRecs, usedRecIds);

    const docRef: RecDocumentRef = {
      id:                  doc.id,
      title:               doc.title,
      type:                doc.type,
      amount:              doc.amount?.toNumber() ?? null,
      currency:            doc.currency,
      documentDate:        doc.documentDate,
      issuerName:          doc.issuerName,
      issuerId:            doc.issuerId,
      receiverId:          doc.receiverId,
      extractedInvoiceNum: extractInvoiceNumber(doc.extractedJson),
      extractedNit:        extractReceiverNit(doc.extractedJson),
    };

    if (match && match.score >= THRESHOLD_PARCIAL) {
      usedRecIds.add(match.receivable.id);
      const rec = match.receivable;

      const recRef: RecReceivableRef = {
        id:             rec.id,
        invoiceNumber:  rec.invoiceNumber,
        customerNit:    rec.customerNit,
        customerName:   rec.customerName,
        originalAmount: rec.originalAmount.toNumber(),
        paidAmount:     rec.paidAmount.toNumber(),
        balanceDue:     rec.balanceDue.toNumber(),
        invoiceDate:    rec.invoiceDate,
        dueDate:        rec.dueDate,
        agingBucket:    rec.agingBucket,
        daysOverdue:    rec.daysOverdue,
        erpStatus:      rec.status,
      };

      const status = resolveStatus(match, doc, rec);
      const notes: string[] = [];

      if (match.isInconsistent && match.amountDiff !== null) {
        const pct = (match.amountDiff / Math.max(rec.originalAmount.toNumber(), 1)) * 100;
        notes.push(`Diferencia de monto: ${pct.toFixed(1)}%`);
      }
      if (rec.daysOverdue > 0) {
        notes.push(`Vencida hace ${rec.daysOverdue} días`);
      }

      items.push({
        id:          `doc-${doc.id}`,
        status,
        document:    docRef,
        receivable:  recRef,
        matchScore:  match.score,
        matchedBy:   match.matchedBy,
        amountDiff:  match.amountDiff,
        notes,
      });
    } else {
      // Document with no matching receivable
      items.push({
        id:         `doc-${doc.id}`,
        status:     "PENDIENTE",
        document:   docRef,
        matchScore: 0,
        matchedBy:  [],
        amountDiff: null,
        notes:      ["Sin cartera correspondiente en el sistema"],
      });
    }
  }

  // ── Pass 2: orphan receivables (not matched to any document) ─────────────
  for (const rec of rawRecs) {
    if (usedRecIds.has(rec.id)) continue;

    const recRef: RecReceivableRef = {
      id:             rec.id,
      invoiceNumber:  rec.invoiceNumber,
      customerNit:    rec.customerNit,
      customerName:   rec.customerName,
      originalAmount: rec.originalAmount.toNumber(),
      paidAmount:     rec.paidAmount.toNumber(),
      balanceDue:     rec.balanceDue.toNumber(),
      invoiceDate:    rec.invoiceDate,
      dueDate:        rec.dueDate,
      agingBucket:    rec.agingBucket,
      daysOverdue:    rec.daysOverdue,
      erpStatus:      rec.status,
    };

    const status = resolveStatus(null, null, rec);
    const notes: string[] = ["Sin documento financiero asociado"];
    if (rec.daysOverdue > 0) notes.push(`Vencida hace ${rec.daysOverdue} días`);
    if (rec.status === "WRITTEN_OFF") notes.push("Castigada en el sistema");

    items.push({
      id:         `rec-${rec.id}`,
      status,
      receivable: recRef,
      matchScore: 0,
      matchedBy:  [],
      amountDiff: null,
      notes,
    });
  }

  // ── Sort: INCONSISTENTE → PENDIENTE (overdue first) → PARCIAL → CONCILIADO
  const ORDER: Record<ReconciliationStatus, number> = {
    INCONSISTENTE: 0,
    PENDIENTE:     1,
    PARCIAL:       2,
    CONCILIADO:    3,
  };

  items.sort((a, b) => {
    const statusDiff = ORDER[a.status] - ORDER[b.status];
    if (statusDiff !== 0) return statusDiff;
    // Within PENDIENTE: overdue receivables first
    const aOverdue = a.receivable?.daysOverdue ?? 0;
    const bOverdue = b.receivable?.daysOverdue ?? 0;
    return bOverdue - aOverdue;
  });

  return {
    total:         items.length,
    conciliado:    items.filter((i) => i.status === "CONCILIADO").length,
    parcial:       items.filter((i) => i.status === "PARCIAL").length,
    pendiente:     items.filter((i) => i.status === "PENDIENTE").length,
    inconsistente: items.filter((i) => i.status === "INCONSISTENTE").length,
    items,
    hasData: rawDocs.length > 0 || rawRecs.length > 0,
  };
}

// ── Convenience: filter helpers used by the UI ─────────────────────────────────

export function filterReconciliationItems(
  items:  ReconciliationItem[],
  status: ReconciliationStatus | "ALL",
): ReconciliationItem[] {
  if (status === "ALL") return items;
  return items.filter((i) => i.status === status);
}

/**
 * Returns the subset of items that are actionable (not yet fully conciliado)
 * and have a pending amount > threshold.
 */
export function getActionableItems(
  items:     ReconciliationItem[],
  threshold = 0,
): ReconciliationItem[] {
  return items.filter((i) => {
    if (i.status === "CONCILIADO") return false;
    const balance = i.receivable?.balanceDue ?? (i.document?.amount ?? 0);
    return (balance ?? 0) > threshold;
  });
}
