/**
 * lib/ai-billing/persistence/ai-billing-repository.ts
 *
 * Agentik — AI Billing Foundation — Repository Interface
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * Pure interface — no Prisma types here.
 * Implementations live in ai-billing-prisma-repository.ts (server-only).
 */

import type { AiUsageRecord, AiUsageFilters, AiUsageSummary } from "../ai-usage-types";
import type { AiCreditLedgerEntry, AiCreditBalance }          from "../ai-credit-types";

export interface AiBillingRepository {
  /**
   * Persist a new AI usage record.
   * Resolves organizationId from orgSlug if needed.
   */
  recordUsage(record: AiUsageRecord): Promise<AiUsageRecord>;

  /**
   * List usage records for an org, optionally filtered.
   */
  listUsageByOrg(orgSlug: string, filters?: AiUsageFilters): Promise<AiUsageRecord[]>;

  /**
   * Aggregate usage summary for an org over optional filters.
   */
  getUsageSummary(orgSlug: string, filters?: AiUsageFilters): Promise<AiUsageSummary>;

  /**
   * Persist a new credit ledger entry.
   */
  createLedgerEntry(entry: AiCreditLedgerEntry): Promise<AiCreditLedgerEntry>;

  /**
   * List ledger entries for an org (oldest first).
   */
  listLedgerByOrg(orgSlug: string, limit?: number): Promise<AiCreditLedgerEntry[]>;

  /**
   * Compute the current credit balance by replaying ledger entries.
   */
  getCreditBalance(orgSlug: string): Promise<AiCreditBalance>;
}
