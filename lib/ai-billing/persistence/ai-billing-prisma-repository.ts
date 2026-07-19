/**
 * lib/ai-billing/persistence/ai-billing-prisma-repository.ts
 *
 * Agentik — AI Billing Foundation — Prisma Repository
 * Sprint: AGENTIK-AI-BILLING-FOUNDATION-01
 *
 * SERVER-ONLY — imports Prisma client.
 * Never import from client components.
 */
import "server-only";

import { prisma }               from "@/lib/prisma";
import type { AiBillingRepository } from "./ai-billing-repository";
import type { AiUsageRecord, AiUsageFilters, AiUsageSummary } from "../ai-usage-types";
import type { AiCreditLedgerEntry, AiCreditBalance }          from "../ai-credit-types";
import {
  mapDbUsageToRecord,
  mapRecordToDbCreate,
  mapDbLedgerToEntry,
  mapEntryToDbCreate,
} from "./ai-billing-mapper";
import { calculateCreditBalance, isCreditBalanceLow } from "../ai-credit-ledger";
import { summarizeUsage }  from "../ai-usage-aggregator";

// ── Org resolver ──────────────────────────────────────────────────────────────

async function resolveOrgId(orgSlug: string): Promise<string> {
  const org = await prisma.organization.findFirst({
    where:  { slug: orgSlug },
    select: { id: true },
  });
  if (!org) throw new Error(`Organization not found: ${orgSlug}`);
  return org.id;
}

// ── Repository implementation ─────────────────────────────────────────────────

export const aiBillingPrismaRepository: AiBillingRepository = {

  async recordUsage(record: AiUsageRecord): Promise<AiUsageRecord> {
    const organizationId = record.organizationId ?? await resolveOrgId(record.orgSlug);
    const data           = mapRecordToDbCreate({ ...record, organizationId });

    // Use $queryRaw-less approach — Prisma typed create
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).aiUsage.create({ data });
    return mapDbUsageToRecord(row);
  },

  async listUsageByOrg(orgSlug: string, filters?: AiUsageFilters): Promise<AiUsageRecord[]> {
    const where: Record<string, unknown> = { orgSlug };
    if (filters?.moduleSlug)  where["moduleSlug"]  = filters.moduleSlug;
    if (filters?.agentId)     where["agentId"]      = filters.agentId;
    if (filters?.featureKey)  where["featureKey"]   = filters.featureKey;
    if (filters?.usageKind)   where["usageKind"]    = filters.usageKind;
    if (filters?.status)      where["status"]       = filters.status;
    if (filters?.fromDate || filters?.toDate) {
      const createdAt: Record<string, unknown> = {};
      if (filters.fromDate) createdAt["gte"] = new Date(filters.fromDate);
      if (filters.toDate)   createdAt["lte"] = new Date(filters.toDate);
      where["createdAt"] = createdAt;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).aiUsage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows.map(mapDbUsageToRecord);
  },

  async getUsageSummary(orgSlug: string, filters?: AiUsageFilters): Promise<AiUsageSummary> {
    const records = await this.listUsageByOrg(orgSlug, filters);
    return summarizeUsage(records, {
      orgSlug,
      fromDate: filters?.fromDate,
      toDate:   filters?.toDate,
    });
  },

  async createLedgerEntry(entry: AiCreditLedgerEntry): Promise<AiCreditLedgerEntry> {
    const organizationId = entry.organizationId ?? await resolveOrgId(entry.orgSlug);
    const data           = mapEntryToDbCreate(entry, organizationId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma as any).aiCreditLedger.create({ data });
    return mapDbLedgerToEntry(row);
  },

  async listLedgerByOrg(orgSlug: string, limit = 1000): Promise<AiCreditLedgerEntry[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (prisma as any).aiCreditLedger.findMany({
      where:   { orgSlug },
      orderBy: { createdAt: "asc" },
      take:    limit,
    });
    return rows.map(mapDbLedgerToEntry);
  },

  async getCreditBalance(orgSlug: string): Promise<AiCreditBalance> {
    const entries = await this.listLedgerByOrg(orgSlug);
    const balance = calculateCreditBalance(orgSlug, entries);
    return {
      ...balance,
      isLow: isCreditBalanceLow(balance.availableCredits, balance.totalGranted),
    };
  },
};
