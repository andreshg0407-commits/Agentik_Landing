/**
 * Reconciliation page — server component.
 *
 * Allows users to select a period, choose two import sources, and run
 * an Orders vs Sales reconciliation. Shows available sources for the
 * selected period and renders the full ReconResult when all params are set.
 */

import { requireOrgAccess }          from "@/lib/auth/org-access";
import { getFilterOptions }           from "@/lib/sales/data-explorer";
import {
  getAvailableSources,
  runOrdersVsSalesRecon,
} from "@/lib/reconciliation/adapters/orders-vs-sales";
import { getCobrosBreakdown }         from "@/lib/finance/cobros-breakdown";
import { BANK_ACCOUNT_SOURCES }       from "@/lib/financial/bank-account-registry";
import {
  buildFinancialStreams,
  getStreamRecommendations,
} from "@/lib/financial/stream-model";
import { getAllStreamSnapshots }       from "@/lib/financial/memory-store";
import { getMemorySummary }           from "@/lib/financial/memory-helpers";
import { generateAllObservations }    from "@/lib/financial/observation-engine";
import { routeAttention }            from "@/lib/financial/attention-router";
import { getRecentSessions }          from "@/lib/reconciliation/session-service";
import ReconClient                    from "./recon-client";
import type { ReconResult }           from "@/lib/reconciliation/types";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ReconciliationPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug }      = await params;
  const sp               = await searchParams;
  const { organization } = await requireOrgAccess(orgSlug);

  const period  = sp["period"]  || undefined;
  const sourceA = sp["sourceA"] || undefined;
  const sourceB = sp["sourceB"] || undefined;

  // Fetch period list + cobros breakdown + memory snapshots + recent sessions in parallel
  const [filterOptions, cobrosBreakdown, allSnapshots, recentSessions] = await Promise.all([
    getFilterOptions(organization.id),
    getCobrosBreakdown(organization.id).catch(() => null),
    getAllStreamSnapshots(organization.id, 90).catch(() => []),
    getRecentSessions(organization.id, 8).catch(() => []),
  ]);
  const periods = filterOptions.periods;

  // Build financial streams from registry + real pending deposit data
  const pendingDepositsTotal = cobrosBreakdown?.consignacionesPendientes ?? { amount: 0, count: 0 };
  const allSources           = Object.values(BANK_ACCOUNT_SOURCES);
  const streams              = buildFinancialStreams(allSources, pendingDepositsTotal);
  const recommendations      = getStreamRecommendations(streams);

  // Memory readiness — honest state from MetricSnapshot history
  const memorySummary = getMemorySummary(organization.id, allSnapshots);
  const memoryStatus  = {
    readinessTier:  memorySummary.readinessTier,
    readinessLabel: memorySummary.readinessLabel,
    historyDays:    memorySummary.historyDays,
    snapshotCount:  memorySummary.snapshotCount,
  };

  // Deterministic observations from real snapshot history
  const observations  = generateAllObservations(streams, allSnapshots, orgSlug);
  const attentionPlan = routeAttention(observations, streams, memorySummary.readinessTier);

  // Fetch available sources when a period is selected
  const availableSources = period
    ? await getAvailableSources(organization.id, period)
    : [];

  // Run reconciliation when all three params are present
  let result: ReconResult | null = null;
  if (period && sourceA && sourceB) {
    try {
      result = await runOrdersVsSalesRecon(organization.id, period, sourceA, sourceB);
    } catch (err) {
      console.error("[ReconciliationPage] recon error:", err);
      result = null;
    }
  }

  return (
    <ReconClient
      orgSlug={orgSlug}
      periods={periods}
      period={period}
      sourceA={sourceA}
      sourceB={sourceB}
      availableSources={availableSources}
      result={result}
      streams={streams}
      recommendations={recommendations}
      memoryStatus={memoryStatus}
      observations={observations}
      attentionPlan={attentionPlan}
      recentSessions={recentSessions}
    />
  );
}
