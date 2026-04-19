/**
 * Data Explorer page — server component.
 *
 * Reads filter params from searchParams, runs parallel data fetches, and
 * renders the interactive ExplorerClient with filter options, dataset rows,
 * and KPI aggregates.
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  getFilterOptions,
  queryDataset,
  queryExplorerKpis,
  type ExplorerDataset,
  type ExplorerFilters,
} from "@/lib/sales/data-explorer";
import ExplorerClient from "./explorer-client";

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DataExplorerPage({
  params,
  searchParams,
}: {
  params:       Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orgSlug }  = await params;
  const sp           = await searchParams;
  const { organization } = await requireOrgAccess(orgSlug);

  // ── Parse dataset ─────────────────────────────────────────────────────────
  const VALID_DATASETS: ExplorerDataset[] = ["sales", "orders", "customers", "line_mix"];
  const rawDataset = sp["dataset"] ?? "sales";
  const dataset: ExplorerDataset =
    VALID_DATASETS.includes(rawDataset as ExplorerDataset)
      ? (rawDataset as ExplorerDataset)
      : "sales";

  // ── Parse filters ─────────────────────────────────────────────────────────
  const filters: ExplorerFilters = {
    period:      sp["period"]      || undefined,
    seller:      sp["seller"]      || undefined,
    customer:    sp["customer"]    || undefined,
    productLine: sp["productLine"] || undefined,
    channel:     sp["channel"]     || undefined,
    q:           sp["q"]           || undefined,
    amountMin:   sp["amountMin"]   ? Number(sp["amountMin"])  : undefined,
    amountMax:   sp["amountMax"]   ? Number(sp["amountMax"])  : undefined,
  };

  // ── Parallel fetch ────────────────────────────────────────────────────────
  const [filterOptions, data, kpis] = await Promise.all([
    getFilterOptions(organization.id),
    queryDataset(organization.id, dataset, filters),
    queryExplorerKpis(organization.id, dataset, filters),
  ]);

  return (
    <ExplorerClient
      orgSlug={orgSlug}
      dataset={dataset}
      filters={filters}
      data={data}
      kpis={kpis}
      filterOptions={filterOptions}
    />
  );
}
