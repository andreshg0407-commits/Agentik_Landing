/**
 * Reconciliation page — server component.
 *
 * Allows users to select a period, choose two import sources, and run
 * an Orders vs Sales reconciliation. Shows available sources for the
 * selected period and renders the full ReconResult when all params are set.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import { getFilterOptions }  from "@/lib/sales/data-explorer";
import {
  getAvailableSources,
  runOrdersVsSalesRecon,
} from "@/lib/reconciliation/adapters/orders-vs-sales";
import ReconClient from "./recon-client";
import type { ReconResult } from "@/lib/reconciliation/types";

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

  // Always fetch period list for the dropdown
  const filterOptions = await getFilterOptions(organization.id);
  const periods = filterOptions.periods;

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
    />
  );
}
