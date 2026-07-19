/**
 * lib/finance/banking/banking-balances.ts
 *
 * AGENTIK-BANKING-FOUNDATION-01 — Cash balance computation engine.
 *
 * Replaces the "Pendiente de integración bancaria" placeholders in Tesorería
 * with real computed balances from BankMovement rows.
 *
 * Every balance is explainable — each figure traces back to its source movements.
 */

import { prisma } from "@/lib/prisma";
import type { BankBalanceReport, AccountBalance } from "./banking-types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

// ── Per-account balance ───────────────────────────────────────────────────────

async function computeAccountBalance(
  orgId:     string,
  accountId: string,
  today:     Date,
): Promise<AccountBalance | null> {
  const [account, movements, todayMovements] = await Promise.all([
    prisma.bankAccount.findFirst({
      where: { id: accountId, organizationId: orgId },
    }),
    prisma.bankMovement.findMany({
      where:   { bankAccountId: accountId, organizationId: orgId },
      orderBy: { movementDate: "desc" },
      take:    1,
      select:  { balanceAfter: true },
    }),
    prisma.bankMovement.findMany({
      where: {
        bankAccountId:  accountId,
        organizationId: orgId,
        movementDate:   { gte: startOfDay(today), lte: endOfDay(today) },
      },
      select: { amount: true, direction: true },
    }),
  ]);

  if (!account) return null;

  const creditToday = todayMovements
    .filter((m) => m.direction === "credit")
    .reduce((s, m) => s + m.amount, 0);

  const debitToday = todayMovements
    .filter((m) => m.direction === "debit")
    .reduce((s, m) => s + m.amount, 0);

  const movementCount = await prisma.bankMovement.count({
    where: { bankAccountId: accountId, organizationId: orgId },
  });

  return {
    accountId:        account.id,
    accountName:      account.accountName,
    bankName:         account.bankName,
    currency:         account.currency as "COP" | "USD" | "EUR",
    currentBalance:   account.currentBalance,
    availableBalance: account.availableBalance,
    creditToday,
    debitToday,
    lastMovementAt:   account.lastMovementAt,
    lastSyncAt:       account.lastSyncAt,
    movementCount,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute the full balance report for an organization.
 *
 * Returns real data when BankAccount rows exist.
 * Returns hasRealData=false otherwise — UI shows "Sin datos bancarios".
 */
export async function computeBankBalances(orgId: string): Promise<BankBalanceReport> {
  const today = new Date();

  const accounts = await prisma.bankAccount.findMany({
    where:  { organizationId: orgId, status: "active" },
    select: { id: true },
  });

  if (accounts.length === 0) {
    return {
      organizationId:        orgId,
      computedAt:            today,
      accounts:              [],
      totalCurrentBalance:   0,
      totalAvailable:        0,
      totalCreditToday:      0,
      totalDebitToday:       0,
      netMovementToday:      0,
      pendingConsignaciones: 0,
      reconciledBalance:     0,
      unreconciledBalance:   0,
      hasRealData:           false,
    };
  }

  const accountBalances = await Promise.all(
    accounts.map((a) => computeAccountBalance(orgId, a.id, today)),
  );

  const clean = accountBalances.filter((a): a is AccountBalance => a !== null);

  const totalCurrent    = clean.reduce((s, a) => s + a.currentBalance, 0);
  const totalAvailable  = clean.reduce((s, a) => s + a.availableBalance, 0);
  const totalCreditToday = clean.reduce((s, a) => s + a.creditToday, 0);
  const totalDebitToday  = clean.reduce((s, a) => s + a.debitToday, 0);

  // Reconciled vs unreconciled (matched vs unmatched movements)
  const [reconciledAgg, totalAgg] = await Promise.all([
    prisma.bankMovement.aggregate({
      where:  { organizationId: orgId, matched: true },
      _sum:   { amount: true },
    }),
    prisma.bankMovement.aggregate({
      where: { organizationId: orgId },
      _sum:  { amount: true },
    }),
  ]);

  const reconciledBalance   = reconciledAgg._sum.amount  ?? 0;
  const totalMovements      = totalAgg._sum.amount       ?? 0;
  const unreconciledBalance = totalMovements - reconciledBalance;

  // Pending consignaciones: credit movements not yet matched
  const pendingConsigRow = await prisma.bankMovement.aggregate({
    where: {
      organizationId:     orgId,
      direction:          "credit",
      matched:            false,
      sourceDocumentType: "CONSIGNACION",
    },
    _sum: { amount: true },
  });
  const pendingConsignaciones = pendingConsigRow._sum.amount ?? 0;

  return {
    organizationId:        orgId,
    computedAt:            today,
    accounts:              clean,
    totalCurrentBalance:   totalCurrent,
    totalAvailable,
    totalCreditToday,
    totalDebitToday,
    netMovementToday:      totalCreditToday - totalDebitToday,
    pendingConsignaciones,
    reconciledBalance,
    unreconciledBalance,
    hasRealData:           true,
  };
}

/**
 * Lightweight version — just available balance for KPI cards.
 * Returns null if no bank data exists.
 */
export async function getAvailableCashBalance(orgId: string): Promise<number | null> {
  const count = await prisma.bankAccount.count({
    where: { organizationId: orgId, status: "active" },
  });
  if (count === 0) return null;

  const result = await prisma.bankAccount.aggregate({
    where: { organizationId: orgId, status: "active" },
    _sum:  { availableBalance: true },
  });

  return result._sum.availableBalance ?? 0;
}
