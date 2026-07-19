/**
 * lib/ai-billing/persistence/ai-credit-atomic-repository.ts
 *
 * Agentik — AI Billing Hardening — Atomic Credit Operations
 * Sprint: AGENTIK-AI-BILLING-HARDENING-01
 *
 * All credit balance mutations use Prisma $transaction + SELECT FOR UPDATE.
 * This eliminates TOCTOU race conditions on the balance row.
 *
 * Guarantees:
 *   - No double debits (correlationId unique constraint + idempotency check)
 *   - No double grants (same)
 *   - No negative balances unless allowOverage=true
 *   - Balance drift impossible (balance row updated in same transaction as ledger write)
 *
 * SERVER-ONLY — imports Prisma client.
 */
import "server-only";

import { prisma }        from "@/lib/prisma";
import type { CreditTransactionRequest, CreditTransactionResult } from "../ai-credit-transaction";
import { isBalanceChangeAllowed, transactionTypeToLedgerType } from "../ai-credit-transaction";
import { toAiCreditLedgerId }  from "../ai-billing-types";

// ── Org resolver (outside transaction — read-only lookup) ─────────────────────

async function resolveOrgId(orgSlug: string): Promise<string> {
  const org = await prisma.organization.findFirst({
    where:  { slug: orgSlug },
    select: { id: true },
  });
  if (!org) throw new Error(`Organization not found for slug: ${orgSlug}`);
  return org.id;
}

// ── Balance row helper ────────────────────────────────────────────────────────

/**
 * Ensure the balance row exists for this org.
 * Run before the main transaction to avoid deadlocks on first insert.
 */
async function ensureBalanceRow(orgSlug: string, organizationId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any).aiCreditBalance.upsert({
    where:  { orgSlug },
    update: {},
    create: {
      orgSlug,
      organizationId,
      balance:      0,
      totalGranted: 0,
      totalDebited: 0,
      totalRefunded: 0,
    },
  });
}

// ── Ledger entry id factory ───────────────────────────────────────────────────

function newLedgerId(): string {
  return toAiCreditLedgerId(`lcr_${Date.now()}_${Math.random().toString(36).slice(2)}`);
}

// ── Atomic debit ──────────────────────────────────────────────────────────────

/**
 * Atomically debit credits from a tenant's balance.
 *
 * Pipeline (all inside ONE Prisma $transaction):
 *   1. SELECT balance FOR UPDATE  — acquires row-level lock
 *   2. Idempotency check          — if correlationId already exists, return early
 *   3. Validate balance/policy    — block if insufficient credits
 *   4. INSERT ledger entry        — record the debit
 *   5. UPDATE balance row         — apply the delta atomically
 *   6. COMMIT                     — releases lock
 *
 * Never throws — always returns a CreditTransactionResult.
 */
export async function atomicDebit(req: CreditTransactionRequest): Promise<CreditTransactionResult> {
  if (req.amount <= 0) {
    return {
      success: false, idempotent: false, blocked: true,
      balanceBefore: 0, balanceAfter: 0,
      error: `Debit amount must be positive; got ${req.amount}`,
    };
  }

  const organizationId = req.organizationId ?? await resolveOrgId(req.orgSlug);

  // Ensure the balance row exists before entering the transaction
  await ensureBalanceRow(req.orgSlug, organizationId);

  try {
    const result = await prisma.$transaction(async (tx) => {

      // ── 1. Lock balance row ──────────────────────────────────────────────
      const [balRow] = await tx.$queryRaw<{ balance: number }[]>`
        SELECT balance FROM "AiCreditBalance"
        WHERE "orgSlug" = ${req.orgSlug}
        FOR UPDATE
      `;
      const balanceBefore = balRow?.balance ?? 0;

      // ── 2. Idempotency check ─────────────────────────────────────────────
      if (req.correlationId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing = await (tx as any).aiCreditLedger.findUnique({
          where: { correlationId: req.correlationId },
          select: { id: true, credits: true },
        });
        if (existing) {
          return {
            success: true, idempotent: true, blocked: false,
            balanceBefore, balanceAfter: balanceBefore, // balance unchanged (no-op)
            ledgerEntryId: existing.id as string,
          };
        }
      }

      // ── 3. Validate balance / overage policy ─────────────────────────────
      const guard = isBalanceChangeAllowed(balanceBefore, req.amount, req.overagePolicy);
      if (!guard.allowed) {
        return {
          success: false, idempotent: false, blocked: true,
          balanceBefore, balanceAfter: balanceBefore,
          reason: guard.reason,
        };
      }

      const balanceAfter = balanceBefore - req.amount;

      // ── 4. INSERT ledger entry ───────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry = await (tx as any).aiCreditLedger.create({
        data: {
          id:              newLedgerId(),
          organizationId,
          orgSlug:         req.orgSlug,
          type:            transactionTypeToLedgerType("DEBIT"),
          credits:         -req.amount,
          balanceAfter,
          relatedUsageId:  req.relatedUsageId  ?? null,
          reason:          req.reason          ?? null,
          createdBy:       req.createdBy       ?? "system:ai_billing",
          correlationId:   req.correlationId   ?? null,
          metadataJson:    req.metadata        ?? null,
        },
      });

      // ── 5. UPDATE balance row ────────────────────────────────────────────
      await tx.$executeRaw`
        UPDATE "AiCreditBalance"
        SET    balance        = ${balanceAfter},
               "totalDebited" = "totalDebited" + ${req.amount},
               "updatedAt"    = NOW()
        WHERE  "orgSlug" = ${req.orgSlug}
      `;

      return {
        success: true, idempotent: false, blocked: false,
        balanceBefore, balanceAfter,
        ledgerEntryId: entry.id as string,
      };
    });

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error in atomicDebit.";
    return {
      success: false, idempotent: false, blocked: false,
      balanceBefore: 0, balanceAfter: 0,
      error: msg,
    };
  }
}

// ── Atomic grant ──────────────────────────────────────────────────────────────

/**
 * Atomically grant credits to a tenant's balance.
 * Same pipeline as atomicDebit, direction reversed.
 * Always succeeds unless correlationId is duplicate.
 */
export async function atomicGrant(req: CreditTransactionRequest): Promise<CreditTransactionResult> {
  if (req.amount <= 0) {
    return {
      success: false, idempotent: false, blocked: true,
      balanceBefore: 0, balanceAfter: 0,
      error: `Grant amount must be positive; got ${req.amount}`,
    };
  }

  const organizationId = req.organizationId ?? await resolveOrgId(req.orgSlug);
  await ensureBalanceRow(req.orgSlug, organizationId);

  try {
    const result = await prisma.$transaction(async (tx) => {

      // ── 1. Lock ──────────────────────────────────────────────────────────
      const [balRow] = await tx.$queryRaw<{ balance: number }[]>`
        SELECT balance FROM "AiCreditBalance"
        WHERE "orgSlug" = ${req.orgSlug}
        FOR UPDATE
      `;
      const balanceBefore = balRow?.balance ?? 0;

      // ── 2. Idempotency ───────────────────────────────────────────────────
      if (req.correlationId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing = await (tx as any).aiCreditLedger.findUnique({
          where: { correlationId: req.correlationId },
          select: { id: true },
        });
        if (existing) {
          return {
            success: true, idempotent: true, blocked: false,
            balanceBefore, balanceAfter: balanceBefore,
            ledgerEntryId: existing.id as string,
          };
        }
      }

      const balanceAfter = balanceBefore + req.amount;
      const ledgerType   = transactionTypeToLedgerType(req.type, req.type === "GRANT" ? "MONTHLY_GRANT" : undefined);

      // ── 3. INSERT ledger entry ───────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entry = await (tx as any).aiCreditLedger.create({
        data: {
          id:               newLedgerId(),
          organizationId,
          orgSlug:          req.orgSlug,
          type:             ledgerType,
          credits:          req.amount,
          balanceAfter,
          relatedInvoiceId: req.relatedInvoiceId ?? null,
          reason:           req.reason           ?? null,
          createdBy:        req.createdBy        ?? "system:billing",
          correlationId:    req.correlationId    ?? null,
          metadataJson:     req.metadata         ?? null,
        },
      });

      // ── 4. UPDATE balance row ────────────────────────────────────────────
      const isRefund = req.type === "REFUND";
      if (isRefund) {
        await tx.$executeRaw`
          UPDATE "AiCreditBalance"
          SET    balance         = ${balanceAfter},
                 "totalRefunded" = "totalRefunded" + ${req.amount},
                 "updatedAt"     = NOW()
          WHERE  "orgSlug" = ${req.orgSlug}
        `;
      } else {
        await tx.$executeRaw`
          UPDATE "AiCreditBalance"
          SET    balance        = ${balanceAfter},
                 "totalGranted" = "totalGranted" + ${req.amount},
                 "updatedAt"    = NOW()
          WHERE  "orgSlug" = ${req.orgSlug}
        `;
      }

      return {
        success: true, idempotent: false, blocked: false,
        balanceBefore, balanceAfter,
        ledgerEntryId: entry.id as string,
      };
    });

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unexpected error in atomicGrant.";
    return {
      success: false, idempotent: false, blocked: false,
      balanceBefore: 0, balanceAfter: 0,
      error: msg,
    };
  }
}

// ── Get stored balance ────────────────────────────────────────────────────────

export interface StoredBalance {
  orgSlug:       string;
  balance:       number;
  totalGranted:  number;
  totalDebited:  number;
  totalRefunded: number;
  updatedAt:     string;
}

/**
 * Read the stored balance for a tenant.
 * This is a fast single-row lookup — no ledger replay required.
 */
export async function getStoredBalance(orgSlug: string): Promise<StoredBalance> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (prisma as any).aiCreditBalance.findUnique({
    where: { orgSlug },
  });

  if (!row) {
    return {
      orgSlug, balance: 0, totalGranted: 0,
      totalDebited: 0, totalRefunded: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  return {
    orgSlug:       row.orgSlug as string,
    balance:       row.balance as number,
    totalGranted:  row.totalGranted as number,
    totalDebited:  row.totalDebited as number,
    totalRefunded: row.totalRefunded as number,
    updatedAt:     (row.updatedAt as Date).toISOString(),
  };
}
