/**
 * lib/finance/intelligence/financial-knowledge-map.ts
 *
 * Loads raw financial facts from every relevant Prisma model.
 * All queries are org-scoped. No aggregation logic here — just raw data shapes
 * consumed by financial-context-builder.ts.
 *
 * Sprint: AGENTIK-FINANCIAL-INTELLIGENCE-LAYER-01
 */

import { prisma } from "@/lib/prisma";

// ── Collection facts ──────────────────────────────────────────────────────────

export interface CollectionFacts {
  totalCount:       number;
  totalAmount:      number;
  todayCount:       number;
  todayAmount:      number;
  /** Payments not yet applied to invoices (appliedStatus = AVAILABLE) */
  uncrossedCount:   number;
  uncrossedAmount:  number;
  /** Breakdown by comprobanteCode */
  bySource:         Record<string, { count: number; amount: number }>;
}

export async function loadCollectionFacts(orgId: string): Promise<CollectionFacts | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [all, todayRows, uncrossed] = await Promise.all([
    prisma.collectionRecord.findMany({
      where:  { organizationId: orgId },
      select: { amount: true, comprobanteCode: true, collectionDate: true },
    }).catch(() => null),
    prisma.collectionRecord.findMany({
      where:  { organizationId: orgId, collectionDate: { gte: today } },
      select: { amount: true },
    }).catch(() => null),
    prisma.collectionRecord.findMany({
      where:  { organizationId: orgId, appliedStatus: "AVAILABLE" },
      select: { amount: true },
    }).catch(() => null),
  ]);

  if (!all) return null;

  const bySource: Record<string, { count: number; amount: number }> = {};
  for (const r of all) {
    const key = r.comprobanteCode ?? "DESCONOCIDO";
    if (!bySource[key]) bySource[key] = { count: 0, amount: 0 };
    bySource[key].count  += 1;
    bySource[key].amount += Number(r.amount ?? 0);
  }

  return {
    totalCount:      all.length,
    totalAmount:     all.reduce((s, r) => s + Number(r.amount ?? 0), 0),
    todayCount:      (todayRows ?? []).length,
    todayAmount:     (todayRows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0),
    uncrossedCount:  (uncrossed ?? []).length,
    uncrossedAmount: (uncrossed ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0),
    bySource,
  };
}

// ── Receivables facts ─────────────────────────────────────────────────────────

export interface ReceivableFacts {
  totalCount:    number;
  totalAmount:   number;
  overdueCount:  number;
  overdueAmount: number;
  maxDpd:        number;
  top5: Array<{ clientName: string; amount: number; daysOverdue: number }>;
}

export async function loadReceivableFacts(orgId: string): Promise<ReceivableFacts | null> {
  const rows = await prisma.customerReceivable.findMany({
    where:   { organizationId: orgId },
    select:  { customerName: true, balanceDue: true, daysOverdue: true, status: true },
    orderBy: { balanceDue: "desc" },
  }).catch(() => null);

  if (!rows) return null;

  const overdue = rows.filter(r => (r.daysOverdue ?? 0) > 0);

  return {
    totalCount:    rows.length,
    totalAmount:   rows.reduce((s, r) => s + Number(r.balanceDue ?? 0), 0),
    overdueCount:  overdue.length,
    overdueAmount: overdue.reduce((s, r) => s + Number(r.balanceDue ?? 0), 0),
    maxDpd:        overdue.reduce((m, r) => Math.max(m, r.daysOverdue ?? 0), 0),
    top5:          rows.slice(0, 5).map(r => ({
      clientName:   r.customerName ?? "Desconocido",
      amount:       Number(r.balanceDue ?? 0),
      daysOverdue:  r.daysOverdue ?? 0,
    })),
  };
}

// ── Banking facts ─────────────────────────────────────────────────────────────

export interface BankFacts {
  accountCount:        number;
  totalAvailable:      number;
  totalCreditToday:    number;
  unreconciledCount:   number;
  staleAccountCount:   number;
  unmatchedMovements:  number;
}

export async function loadBankFacts(orgId: string): Promise<BankFacts | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [accounts, todayCredits, unmatched] = await Promise.all([
    prisma.bankAccount.findMany({
      where:  { organizationId: orgId },
      select: { availableBalance: true, currentBalance: true, updatedAt: true, status: true },
    }).catch(() => null),
    prisma.bankMovement.findMany({
      where:  {
        organizationId: orgId,
        direction:      "credit",
        movementDate:   { gte: today },
      },
      select: { amount: true },
    }).catch(() => null),
    prisma.bankMovement.count({
      where: { organizationId: orgId, matched: false },
    }).catch(() => 0),
  ]);

  if (!accounts) return null;

  const staleCount = accounts.filter(a => a.updatedAt < oneDayAgo).length;

  return {
    accountCount:       accounts.length,
    totalAvailable:     accounts.reduce((s, a) => s + Number(a.availableBalance ?? a.currentBalance ?? 0), 0),
    totalCreditToday:   (todayCredits ?? []).reduce((s, m) => s + Number(m.amount ?? 0), 0),
    unreconciledCount:  0, // resolved by reconciliation state
    staleAccountCount:  staleCount,
    unmatchedMovements: unmatched,
  };
}

// ── Reconciliation facts ──────────────────────────────────────────────────────

export interface ReconciliationFacts {
  total:         number;
  conciliado:    number;
  pendiente:     number;
  inconsistente: number;
  parcial:       number;
}

export async function loadReconciliationFacts(orgId: string): Promise<ReconciliationFacts | null> {
  const [total, conciliado, pendiente] = await Promise.all([
    prisma.bankMovement.count({ where: { organizationId: orgId } }).catch(() => null),
    prisma.bankMovement.count({ where: { organizationId: orgId, matched: true  } }).catch(() => 0),
    prisma.bankMovement.count({ where: { organizationId: orgId, matched: false } }).catch(() => 0),
  ]);

  if (total === null) return null;

  return {
    total,
    conciliado,
    pendiente,
    inconsistente: 0, // BankMovement has no conflict status field
    parcial:       0,
  };
}

// ── Budget / planning facts ───────────────────────────────────────────────────

export interface PlanningFacts {
  budgetCount:   number;
  totalBudget:   number;
  totalExecuted: number;
  atRiskCount:   number;
}

export async function loadPlanningFacts(orgId: string, year?: number): Promise<PlanningFacts | null> {
  const y = year ?? new Date().getFullYear();
  // Budget.amount = planned amount. No executedAmount field — FPA variance tracks actuals separately.
  const rows = await prisma.budget.findMany({
    where:  { organizationId: orgId, year: y },
    select: { amount: true, category: true },
  }).catch(() => null);

  if (!rows) return null;

  const totalBudget = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  return {
    budgetCount:   rows.length,
    totalBudget,
    totalExecuted: 0, // execution tracked separately in FpaVariance — not queried here
    atRiskCount:   0,
  };
}
