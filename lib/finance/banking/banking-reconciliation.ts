/**
 * lib/finance/banking/banking-reconciliation.ts
 *
 * AGENTIK-BANKING-FOUNDATION-01 — Bank movement ↔ graph node reconciliation.
 *
 * Runs match engine against all unmatched movements and persists results
 * as BankReconciliation rows. Confirmation is manual or auto (confidence >= 0.85).
 */

import { prisma } from "@/lib/prisma";
import type { BankMovementRecord, BankMatchCandidate } from "./banking-types";
import { findBestMatch } from "./banking-matchers";
import type { FinancialNode } from "../graph/graph-types";

// ── Internal helpers ──────────────────────────────────────────────────────────

function movementToDomain(raw: {
  id: string;
  organizationId: string;
  bankAccountId: string;
  movementDate: Date;
  description: string | null;
  reference: string | null;
  amount: number;
  direction: string;
  balanceAfter: number | null;
  source: string;
  sourceDocumentType: string | null;
  sourceDocumentRef: string | null;
  matched: boolean;
  matchedAt: Date | null;
  graphNodeId: string | null;
  rawPayload: unknown;
  createdAt: Date;
  updatedAt: Date;
}): BankMovementRecord {
  return {
    ...raw,
    direction:    raw.direction    as BankMovementRecord["direction"],
    source:       raw.source       as BankMovementRecord["source"],
    rawPayload:   (raw.rawPayload  as Record<string, unknown>) ?? {},
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run reconciliation for all unmatched movements in an org.
 * Matches against all provided graph nodes.
 * Auto-confirms matches with confidence >= 0.85.
 *
 * Returns count of new matches created.
 */
export async function runBankReconciliation(
  orgId:      string,
  graphNodes: FinancialNode[],
): Promise<{ matched: number; pending: number; failed: number }> {
  const unmatchedRaw = await prisma.bankMovement.findMany({
    where: { organizationId: orgId, matched: false },
  });

  const unmatched = unmatchedRaw.map(movementToDomain);

  let matched = 0;
  let pending = 0;
  let failed  = 0;

  for (const mv of unmatched) {
    try {
      const candidate = findBestMatch(mv, graphNodes);
      if (!candidate) {
        failed++;
        continue;
      }

      const autoConfirm = candidate.confidence >= 0.85;
      const status      = autoConfirm ? "confirmed" : "pending";

      // Upsert — avoid duplicate reconciliation rows
      await prisma.bankReconciliation.upsert({
        where: {
          // Use a unique constraint on bankMovementId (one movement → one active recon)
          id: `recon:${mv.id}`,
        },
        create: {
          id:             `recon:${mv.id}`,
          organizationId: orgId,
          bankMovementId: mv.id,
          bankAccountId:  mv.bankAccountId,
          graphNodeId:    candidate.graphNodeId,
          confidence:     candidate.confidence,
          matchedBy:      candidate.matchedBy,
          status,
          explanation:    candidate.explanation,
          resolvedAt:     autoConfirm ? new Date() : null,
        },
        update: {
          graphNodeId: candidate.graphNodeId,
          confidence:  candidate.confidence,
          matchedBy:   candidate.matchedBy,
          status,
          explanation: candidate.explanation,
          updatedAt:   new Date(),
        },
      });

      if (autoConfirm) {
        // Mark movement as matched
        await prisma.bankMovement.update({
          where: { id: mv.id },
          data:  {
            matched:    true,
            matchedAt:  new Date(),
            graphNodeId: candidate.graphNodeId,
          },
        });
        matched++;
      } else {
        pending++;
      }
    } catch {
      failed++;
    }
  }

  return { matched, pending, failed };
}

/**
 * Confirm a pending reconciliation manually.
 */
export async function confirmReconciliation(
  reconId:    string,
  orgId:      string,
  resolvedBy: string,
): Promise<void> {
  const recon = await prisma.bankReconciliation.findFirst({
    where: { id: reconId, organizationId: orgId },
  });
  if (!recon) throw new Error(`Reconciliation ${reconId} not found`);

  await prisma.bankReconciliation.update({
    where: { id: reconId },
    data:  { status: "confirmed", resolvedBy, resolvedAt: new Date() },
  });

  await prisma.bankMovement.update({
    where: { id: recon.bankMovementId },
    data:  { matched: true, matchedAt: new Date(), graphNodeId: recon.graphNodeId },
  });
}

/**
 * Reject a pending reconciliation (wrong match).
 */
export async function rejectReconciliation(
  reconId:    string,
  orgId:      string,
  resolvedBy: string,
): Promise<void> {
  await prisma.bankReconciliation.updateMany({
    where: { id: reconId, organizationId: orgId },
    data:  { status: "rejected", resolvedBy, resolvedAt: new Date() },
  });
}

/**
 * Get all pending reconciliations for review UI.
 */
export async function getPendingReconciliations(orgId: string) {
  return prisma.bankReconciliation.findMany({
    where:   { organizationId: orgId, status: "pending" },
    orderBy: { createdAt: "desc" },
    include: { bankMovement: true, bankAccount: true },
  });
}
