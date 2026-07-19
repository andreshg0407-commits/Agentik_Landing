/**
 * lib/finance/banking/banking-runtime.ts
 *
 * AGENTIK-BANKING-FOUNDATION-01 — Banking runtime orchestrator.
 *
 * Single entry point for all banking domain read operations.
 * All writes go through banking-sync.ts or banking-reconciliation.ts.
 *
 * Multi-tenant: every operation requires orgId — no cross-tenant reads.
 */

import { prisma } from "@/lib/prisma";
import { computeBankBalances, getAvailableCashBalance } from "./banking-balances";
import { computeBankingHealth } from "./banking-status";
import { runBankIntegrityChecks } from "./banking-integrity";
import type { BankMovementRecord, BankAccountSummary, BankQueryOptions } from "./banking-types";

// ── Account queries ───────────────────────────────────────────────────────────

/**
 * List all active bank accounts for an org.
 */
export async function getBankAccounts(orgId: string): Promise<BankAccountSummary[]> {
  const rows = await prisma.bankAccount.findMany({
    where:   { organizationId: orgId },
    orderBy: { accountName: "asc" },
  });

  return rows.map((r) => ({
    id:                  r.id,
    organizationId:      r.organizationId,
    accountName:         r.accountName,
    bankName:            r.bankName,
    accountNumberMasked: r.accountNumberMasked,
    accountType:         r.accountType as BankAccountSummary["accountType"],
    currency:            r.currency    as BankAccountSummary["currency"],
    status:              r.status      as BankAccountSummary["status"],
    openingBalance:      r.openingBalance,
    currentBalance:      r.currentBalance,
    availableBalance:    r.availableBalance,
    lastMovementAt:      r.lastMovementAt,
    lastSyncAt:          r.lastSyncAt,
    metadata:            (r.metadata as Record<string, unknown>) ?? {},
    createdAt:           r.createdAt,
    updatedAt:           r.updatedAt,
  }));
}

// ── Movement queries ──────────────────────────────────────────────────────────

/**
 * Query bank movements with flexible filters.
 */
export async function getBankMovements(
  opts: BankQueryOptions,
): Promise<BankMovementRecord[]> {
  const { orgId, accountId, fromDate, toDate, matched, direction, limit = 200 } = opts;

  const rows = await prisma.bankMovement.findMany({
    where: {
      organizationId: orgId,
      ...(accountId && { bankAccountId: accountId }),
      ...(fromDate   && { movementDate: { gte: fromDate } }),
      ...(toDate     && { movementDate: { lte: toDate   } }),
      ...(matched    !== undefined && { matched }),
      ...(direction  && { direction }),
    },
    orderBy: { movementDate: "desc" },
    take:    limit,
  });

  return rows.map((r) => ({
    id:                 r.id,
    organizationId:     r.organizationId,
    bankAccountId:      r.bankAccountId,
    movementDate:       r.movementDate,
    description:        r.description,
    reference:          r.reference,
    amount:             r.amount,
    direction:          r.direction          as BankMovementRecord["direction"],
    balanceAfter:       r.balanceAfter,
    source:             r.source             as BankMovementRecord["source"],
    sourceDocumentType: r.sourceDocumentType,
    sourceDocumentRef:  r.sourceDocumentRef,
    matched:            r.matched,
    matchedAt:          r.matchedAt,
    graphNodeId:        r.graphNodeId,
    rawPayload:         (r.rawPayload as Record<string, unknown>) ?? {},
    createdAt:          r.createdAt,
    updatedAt:          r.updatedAt,
  }));
}

// ── Full banking snapshot ─────────────────────────────────────────────────────

export interface BankingSnapshot {
  orgId:        string;
  computedAt:   Date;
  balances:     Awaited<ReturnType<typeof computeBankBalances>>;
  health:       ReturnType<typeof computeBankingHealth>;
  integrityIssues: ReturnType<typeof runBankIntegrityChecks>;
  hasRealData:  boolean;
}

/**
 * Full banking snapshot — balances + health + integrity.
 * Used by Tesorería Operativa page (replaces "Pendiente de integración").
 */
export async function getBankingSnapshot(orgId: string): Promise<BankingSnapshot> {
  const balances = await computeBankBalances(orgId);
  const health   = computeBankingHealth(balances.hasRealData ? balances : null);

  let integrityIssues: ReturnType<typeof runBankIntegrityChecks> = [];

  if (balances.hasRealData) {
    const movements = await getBankMovements({ orgId, limit: 500 });
    // For integrity: use opening balance from first account (simplification)
    const accounts = await getBankAccounts(orgId);
    const openingBalance = accounts[0]?.openingBalance ?? 0;
    integrityIssues = runBankIntegrityChecks(movements, openingBalance);
  }

  return {
    orgId,
    computedAt:     new Date(),
    balances,
    health,
    integrityIssues,
    hasRealData:    balances.hasRealData,
  };
}

// ── KPI surface helpers ───────────────────────────────────────────────────────

/**
 * Available cash balance for Tesorería KPI card.
 * Returns null if no bank accounts configured (UI shows "Pendiente integración").
 */
export { getAvailableCashBalance };

/**
 * Pending consignaciones amount (credit movements not yet matched).
 */
export async function getPendingConsignacionesAmount(orgId: string): Promise<number | null> {
  const count = await prisma.bankAccount.count({
    where: { organizationId: orgId, status: "active" },
  });
  if (count === 0) return null;

  const result = await prisma.bankMovement.aggregate({
    where: {
      organizationId:     orgId,
      direction:          "credit",
      matched:            false,
      sourceDocumentType: "CONSIGNACION",
    },
    _sum: { amount: true },
  });

  return result._sum.amount ?? 0;
}
