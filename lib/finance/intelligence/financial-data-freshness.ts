/**
 * lib/finance/intelligence/financial-data-freshness.ts
 *
 * Assesses staleness for every financial data source.
 * Returns a DataFreshnessReport with per-source freshness + overall verdict.
 *
 * Thresholds (minutes):
 *   CollectionRecord / SaleRecord  → 2880 (2 days)
 *   BankAccount / BankMovement     → 1440 (1 day)
 *   CustomerReceivable             → 1440 (1 day)
 *   Budget                         → 10080 (7 days)
 *   FinancialGraph (proxy)         → 1440 (1 day)
 *
 * Note: FinancialGraph is an in-memory runtime — no Prisma model.
 * We use the latest CollectionRecord as its freshness proxy.
 *
 * Sprint: AGENTIK-FINANCIAL-INTELLIGENCE-LAYER-01
 */

import { prisma }                             from "@/lib/prisma";
import { DataFreshnessReport, SourceFreshness } from "./financial-intelligence-types";

// ── Staleness thresholds in minutes ──────────────────────────────────────────

const THRESHOLDS: Record<string, number> = {
  CollectionRecord:   2880,
  SaleRecord:         2880,
  BankAccount:        1440,
  BankMovement:       1440,
  CustomerReceivable: 1440,
  Budget:             10080,
  FinancialGraph:     1440,
};

function ageMinutes(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 60_000);
}

function toFreshness(
  source:    string,
  lastSync:  Date | null,
  threshold: number,
): SourceFreshness {
  const age   = ageMinutes(lastSync);
  const stale = age === null ? true : age > threshold;
  return {
    source,
    lastSyncAt:  lastSync,
    ageMinutes:  age,
    isStale:     stale,
    staleSince:  stale && lastSync ? lastSync : null,
    threshold,
  };
}

// ── Per-source latest-sync queries ───────────────────────────────────────────

async function latestCollectionRecord(orgId: string): Promise<Date | null> {
  const row = await prisma.collectionRecord.findFirst({
    where:   { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select:  { createdAt: true },
  }).catch(() => null);
  return row?.createdAt ?? null;
}

async function latestSaleRecord(orgId: string): Promise<Date | null> {
  // SaleRecord uses saleDate (not createdAt) as the primary temporal field
  const row = await prisma.saleRecord.findFirst({
    where:   { organizationId: orgId },
    orderBy: { saleDate: "desc" },
    select:  { saleDate: true },
  }).catch(() => null);
  return row?.saleDate ?? null;
}

async function latestBankAccount(orgId: string): Promise<Date | null> {
  const row = await prisma.bankAccount.findFirst({
    where:   { organizationId: orgId },
    orderBy: { updatedAt: "desc" },
    select:  { updatedAt: true },
  }).catch(() => null);
  return row?.updatedAt ?? null;
}

async function latestBankMovement(orgId: string): Promise<Date | null> {
  const row = await prisma.bankMovement.findFirst({
    where:   { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select:  { createdAt: true },
  }).catch(() => null);
  return row?.createdAt ?? null;
}

async function latestCustomerReceivable(orgId: string): Promise<Date | null> {
  // CustomerReceivable uses syncedAt (not updatedAt)
  const row = await prisma.customerReceivable.findFirst({
    where:   { organizationId: orgId },
    orderBy: { syncedAt: "desc" },
    select:  { syncedAt: true },
  }).catch(() => null);
  return row?.syncedAt ?? null;
}

async function latestBudget(orgId: string): Promise<Date | null> {
  const row = await prisma.budget.findFirst({
    where:   { organizationId: orgId },
    orderBy: { updatedAt: "desc" },
    select:  { updatedAt: true },
  }).catch(() => null);
  return row?.updatedAt ?? null;
}

// ── Main report builder ──────────────────────────────────────────────────────

export async function buildDataFreshnessReport(orgId: string): Promise<DataFreshnessReport> {
  const evaluatedAt = new Date();

  const [
    collectionSync,
    saleSync,
    bankAccountSync,
    bankMovementSync,
    receivableSync,
    budgetSync,
  ] = await Promise.all([
    latestCollectionRecord(orgId),
    latestSaleRecord(orgId),
    latestBankAccount(orgId),
    latestBankMovement(orgId),
    latestCustomerReceivable(orgId),
    latestBudget(orgId),
  ]);

  // FinancialGraph is in-memory — proxy freshness from CollectionRecord (primary input)
  const graphProxy = collectionSync;

  const sources: SourceFreshness[] = [
    toFreshness("CollectionRecord",   collectionSync,   THRESHOLDS.CollectionRecord),
    toFreshness("SaleRecord",         saleSync,         THRESHOLDS.SaleRecord),
    toFreshness("BankAccount",        bankAccountSync,  THRESHOLDS.BankAccount),
    toFreshness("BankMovement",       bankMovementSync, THRESHOLDS.BankMovement),
    toFreshness("CustomerReceivable", receivableSync,   THRESHOLDS.CustomerReceivable),
    toFreshness("Budget",             budgetSync,       THRESHOLDS.Budget),
    toFreshness("FinancialGraph",     graphProxy,       THRESHOLDS.FinancialGraph),
  ];

  const staleSources   = sources.filter(s => s.isStale && s.lastSyncAt !== null).map(s => s.source);
  const missingSources = sources.filter(s => s.lastSyncAt === null).map(s => s.source);

  let overallFreshness: DataFreshnessReport["overallFreshness"];
  if (missingSources.length === sources.length) {
    overallFreshness = "UNKNOWN";
  } else if (staleSources.length > 0 || missingSources.length > 0) {
    const criticalStale = sources
      .filter(s => (s.isStale || !s.lastSyncAt) && ["BankAccount", "BankMovement"].includes(s.source));
    overallFreshness = criticalStale.length > 0 ? "STALE" : "PARTIAL";
  } else {
    overallFreshness = "FRESH";
  }

  return { orgId, evaluatedAt, sources, staleSources, missingSources, overallFreshness };
}
