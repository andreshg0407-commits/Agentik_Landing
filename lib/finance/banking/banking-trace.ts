/**
 * lib/finance/banking/banking-trace.ts
 *
 * AGENTIK-BANKING-FOUNDATION-01 — Traceability per balance.
 *
 * Every balance figure can explain itself:
 *   "This $12.3M available balance = $15M movements - $2.7M pending reconciliation"
 *
 * Answers: "Where did this balance come from?"
 */

import { prisma } from "@/lib/prisma";
import type { BankBalanceReport } from "./banking-types";

// ── Trace types ───────────────────────────────────────────────────────────────

export interface BalanceTraceStep {
  layer:    string;
  label:    string;
  amount:   number;
  count:    number;
  runtime:  string;
  hasData:  boolean;
}

export interface BalanceTrace {
  accountId:    string;
  accountName:  string;
  orgId:        string;
  computedAt:   Date;
  finalBalance: number;
  chain:        BalanceTraceStep[];
  blockers:     string[];
}

export interface OrgBalanceTrace {
  orgId:         string;
  computedAt:    Date;
  totalBalance:  number;
  accounts:      BalanceTrace[];
  hasRealData:   boolean;
}

// ── Per-account trace ─────────────────────────────────────────────────────────

async function traceAccountBalance(
  orgId:     string,
  accountId: string,
): Promise<BalanceTrace | null> {
  const account = await prisma.bankAccount.findFirst({
    where: { id: accountId, organizationId: orgId },
  });
  if (!account) return null;

  const [credits, debits, matched, unmatched] = await Promise.all([
    prisma.bankMovement.aggregate({
      where: { bankAccountId: accountId, direction: "credit" },
      _sum:  { amount: true },
      _count: true,
    }),
    prisma.bankMovement.aggregate({
      where: { bankAccountId: accountId, direction: "debit" },
      _sum:  { amount: true },
      _count: true,
    }),
    prisma.bankMovement.aggregate({
      where: { bankAccountId: accountId, matched: true },
      _sum:  { amount: true },
      _count: true,
    }),
    prisma.bankMovement.aggregate({
      where: { bankAccountId: accountId, matched: false },
      _sum:  { amount: true },
      _count: true,
    }),
  ]);

  const totalCredits   = credits._sum.amount  ?? 0;
  const totalDebits    = debits._sum.amount    ?? 0;
  const matchedAmt     = matched._sum.amount   ?? 0;
  const unmatchedAmt   = unmatched._sum.amount ?? 0;
  const currentBalance = account.openingBalance + totalCredits - totalDebits;

  const chain: BalanceTraceStep[] = [
    {
      layer:   "Saldo inicial",
      label:   `Balance de apertura de cuenta ${account.accountName}`,
      amount:  account.openingBalance,
      count:   1,
      runtime: "prisma.bankAccount.openingBalance",
      hasData: true,
    },
    {
      layer:   "Créditos (ingresos bancarios)",
      label:   `${credits._count} movimientos de crédito`,
      amount:  totalCredits,
      count:   credits._count,
      runtime: "prisma.bankMovement.aggregate({ direction: 'credit' })",
      hasData: credits._count > 0,
    },
    {
      layer:   "Débitos (egresos bancarios)",
      label:   `${debits._count} movimientos de débito`,
      amount:  -totalDebits,
      count:   debits._count,
      runtime: "prisma.bankMovement.aggregate({ direction: 'debit' })",
      hasData: debits._count > 0,
    },
    {
      layer:   "Movimientos conciliados",
      label:   `${matched._count} movimientos con contrapartida en sistema`,
      amount:  matchedAmt,
      count:   matched._count,
      runtime: "prisma.bankMovement.findMany({ matched: true })",
      hasData: matched._count > 0,
    },
    {
      layer:   "Movimientos sin conciliar",
      label:   `${unmatched._count} movimientos pendientes de conciliación`,
      amount:  unmatchedAmt,
      count:   unmatched._count,
      runtime: "prisma.bankMovement.findMany({ matched: false })",
      hasData: unmatched._count > 0,
    },
  ];

  const blockers: string[] = [];
  if (unmatched._count > 5) {
    blockers.push(`${unmatched._count} movimientos pendientes de conciliación manual`);
  }
  if (!account.lastSyncAt) {
    blockers.push("Cuenta sin sincronización registrada");
  }

  return {
    accountId:    account.id,
    accountName:  account.accountName,
    orgId,
    computedAt:   new Date(),
    finalBalance: currentBalance,
    chain,
    blockers,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a full balance traceability report for all accounts in an org.
 */
export async function buildBankingTrace(orgId: string): Promise<OrgBalanceTrace> {
  const accounts = await prisma.bankAccount.findMany({
    where:  { organizationId: orgId, status: "active" },
    select: { id: true },
  });

  if (accounts.length === 0) {
    return {
      orgId,
      computedAt:   new Date(),
      totalBalance: 0,
      accounts:     [],
      hasRealData:  false,
    };
  }

  const traces = await Promise.all(
    accounts.map((a) => traceAccountBalance(orgId, a.id)),
  );

  const clean = traces.filter((t): t is BalanceTrace => t !== null);
  const total = clean.reduce((s, t) => s + t.finalBalance, 0);

  return {
    orgId,
    computedAt:   new Date(),
    totalBalance: total,
    accounts:     clean,
    hasRealData:  clean.length > 0,
  };
}
