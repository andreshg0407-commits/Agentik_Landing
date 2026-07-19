/**
 * lib/finance/banking/banking-sync.ts
 *
 * AGENTIK-BANKING-FOUNDATION-01 — Bank statement import and sync layer.
 *
 * Handles the import pipeline:
 *   1. Validate rows
 *   2. Dedup against existing movements (by reference + date)
 *   3. Persist new movements
 *   4. Update account balance
 *   5. Create sync session record
 *
 * No real bank API integrations — architecture layer only.
 * Future: API-based bank sync via api_future source.
 */

import { prisma } from "@/lib/prisma";
import type { ImportedMovementRow, MovementSource } from "./banking-types";

// ── Import pipeline ───────────────────────────────────────────────────────────

export interface ImportResult {
  sessionId:      string;
  importedCount:  number;
  duplicateCount: number;
  errorMessages:  string[];
  status:         "completed" | "partial" | "failed";
}

/**
 * Import a batch of normalized movements into a BankAccount.
 * Creates a BankSyncSession to track the import run.
 */
export async function importMovements(
  orgId:        string,
  accountId:    string,
  rows:         ImportedMovementRow[],
  source:       MovementSource,
  fromDate?:    Date,
  toDate?:      Date,
): Promise<ImportResult> {
  // Validate account belongs to org
  const account = await prisma.bankAccount.findFirst({
    where: { id: accountId, organizationId: orgId },
  });
  if (!account) {
    throw new Error(`BankAccount ${accountId} not found for org ${orgId}`);
  }

  // Create sync session
  const session = await prisma.bankSyncSession.create({
    data: {
      organizationId: orgId,
      bankAccountId:  accountId,
      source,
      status:         "running",
      fromDate:       fromDate ?? null,
      toDate:         toDate   ?? null,
      startedAt:      new Date(),
    },
  });

  let importedCount  = 0;
  let duplicateCount = 0;
  const errorMessages: string[] = [];

  for (const row of rows) {
    try {
      // Dedup: same reference + same date + same account = duplicate
      if (row.reference) {
        const existing = await prisma.bankMovement.findFirst({
          where: {
            bankAccountId: accountId,
            reference:     row.reference,
            movementDate:  row.movementDate,
          },
        });
        if (existing) {
          duplicateCount++;
          continue;
        }
      }

      await prisma.bankMovement.create({
        data: {
          organizationId:     orgId,
          bankAccountId:      accountId,
          movementDate:       row.movementDate,
          description:        row.description,
          reference:          row.reference,
          amount:             row.amount,
          direction:          row.direction,
          balanceAfter:       row.balanceAfter,
          source,
          sourceDocumentType: row.sourceDocumentType,
          sourceDocumentRef:  row.sourceDocumentRef,
          rawPayload:         row.rawPayload as never,
        },
      });

      importedCount++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errorMessages.push(`Row ${row.reference ?? "??"}: ${msg}`);
    }
  }

  // Recompute account balance from movements
  await recomputeAccountBalance(orgId, accountId);

  const sessionStatus: "completed" | "partial" | "failed" =
    importedCount === 0 && errorMessages.length > 0
      ? "failed"
      : errorMessages.length > 0
      ? "partial"
      : "completed";

  await prisma.bankSyncSession.update({
    where: { id: session.id },
    data:  {
      status:         sessionStatus,
      importedCount,
      duplicateCount,
      unresolvedCount: rows.length - importedCount - duplicateCount,
      errorMessages,
      completedAt:    new Date(),
    },
  });

  return {
    sessionId:      session.id,
    importedCount,
    duplicateCount,
    errorMessages,
    status:         sessionStatus,
  };
}

// ── Balance recomputation ─────────────────────────────────────────────────────

/**
 * Recompute currentBalance and availableBalance for a BankAccount
 * from the sum of all its BankMovement rows.
 */
export async function recomputeAccountBalance(
  orgId:     string,
  accountId: string,
): Promise<void> {
  const account = await prisma.bankAccount.findFirst({
    where: { id: accountId, organizationId: orgId },
    select: { openingBalance: true },
  });
  if (!account) return;

  const [credits, debits, lastMovement] = await Promise.all([
    prisma.bankMovement.aggregate({
      where: { bankAccountId: accountId, organizationId: orgId, direction: "credit" },
      _sum:  { amount: true },
    }),
    prisma.bankMovement.aggregate({
      where: { bankAccountId: accountId, organizationId: orgId, direction: "debit" },
      _sum:  { amount: true },
    }),
    prisma.bankMovement.findFirst({
      where:   { bankAccountId: accountId, organizationId: orgId },
      orderBy: { movementDate: "desc" },
      select:  { movementDate: true },
    }),
  ]);

  const totalCredits = credits._sum.amount ?? 0;
  const totalDebits  = debits._sum.amount  ?? 0;
  const current      = account.openingBalance + totalCredits - totalDebits;

  // Pending = unmatched credit movements (not yet reconciled)
  const pendingCredits = await prisma.bankMovement.aggregate({
    where: { bankAccountId: accountId, organizationId: orgId, direction: "credit", matched: false },
    _sum:  { amount: true },
  });
  const available = current - (pendingCredits._sum.amount ?? 0);

  await prisma.bankAccount.update({
    where: { id: accountId },
    data:  {
      currentBalance:  current,
      availableBalance: available,
      lastMovementAt:  lastMovement?.movementDate ?? null,
      updatedAt:       new Date(),
    },
  });
}

/**
 * Get all sync sessions for an account (for history/audit UI).
 */
export async function getSyncHistory(orgId: string, accountId: string) {
  return prisma.bankSyncSession.findMany({
    where:   { organizationId: orgId, bankAccountId: accountId },
    orderBy: { createdAt: "desc" },
    take:    20,
  });
}
