/**
 * Pipeline Intelligence page — server component.
 *
 * Loads all pipeline data in parallel, wrapped in try/catch so the page
 * degrades gracefully if the CRMOpportunity model migration has not yet run.
 * Calls ensureDefaultPipelineStages on first load (silently, no crash).
 */

import { requireOrgAccess } from "@/lib/auth/org-access";
import {
  getPipelineKpis,
  getAtRiskDeals,
  getSellerLeaderboard,
  getLostDealAnalysis,
  ensureDefaultPipelineStages,
  hasCrmData,
  getQuotesPipelineSummary,
  hasQuotesData,
} from "@/lib/pipeline/service";
import type {
  PipelineKpis,
  DealRisk,
  SellerPipelineRow,
  QuotesPipelineSummary,
} from "@/lib/pipeline/service";
import PipelineClient from "./pipeline-client";

/** DealRisk with Date fields serialized to ISO strings for RSC → client boundary. */
export type SerializedDealRisk = Omit<DealRisk, "expectedCloseAt"> & {
  expectedCloseAt: string | null;
};

/** QuotesPipelineSummary with Date fields serialized for RSC → client boundary. */
export type SerializedQuotesSummary = Omit<QuotesPipelineSummary, "recentQuotes"> & {
  recentQuotes: Array<Omit<QuotesPipelineSummary["recentQuotes"][number], "issuedAt"> & {
    issuedAt: string;
  }>;
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug }      = await params;
  const { organization } = await requireOrgAccess(orgSlug);
  const orgId            = organization.id;

  // Seed default stages on first visit — completely silent if migration not run
  await ensureDefaultPipelineStages(orgId).catch(() => null);

  // Load all pipeline data in parallel; each query falls back gracefully
  let kpis:         PipelineKpis | null                                         = null;
  let atRisk:       DealRisk[]                                                   = [];
  let sellers:      SellerPipelineRow[]                                          = [];
  let lostAnalysis: Array<{ reason: string; count: number; totalAmount: number }> = [];
  let quotesSummary: QuotesPipelineSummary | null                                = null;
  let dataError     = false;
  let crmSynced     = false;
  let quotesSynced  = false;

  try {
    [kpis, atRisk, sellers, lostAnalysis, crmSynced, quotesSynced] = await Promise.all([
      getPipelineKpis(orgId).catch(()    => null),
      getAtRiskDeals(orgId).catch(()     => [] as DealRisk[]),
      getSellerLeaderboard(orgId).catch(()=> [] as SellerPipelineRow[]),
      getLostDealAnalysis(orgId).catch(() => [] as Array<{ reason: string; count: number; totalAmount: number }>),
      hasCrmData(orgId).catch(() => false),
      hasQuotesData(orgId).catch(() => false),
    ]);

    if (quotesSynced) {
      quotesSummary = await getQuotesPipelineSummary(orgId).catch(() => null);
    }
  } catch (err) {
    console.error("[PipelinePage] data load error:", err);
    dataError = true;
  }

  // Serialize any Date values in atRisk deals (expectedCloseAt)
  const serializedAtRisk = atRisk.map(d => ({
    ...d,
    expectedCloseAt: d.expectedCloseAt
      ? (d.expectedCloseAt instanceof Date ? d.expectedCloseAt.toISOString() : String(d.expectedCloseAt))
      : null,
  }));

  // Serialize Date values in recent quotes
  const serializedQuotesSummary = quotesSummary
    ? {
        ...quotesSummary,
        recentQuotes: quotesSummary.recentQuotes.map(q => ({
          ...q,
          issuedAt: q.issuedAt instanceof Date ? q.issuedAt.toISOString() : String(q.issuedAt),
        })),
      }
    : null;

  // syncPending = true only when BOTH opportunities AND quotes are absent.
  // If quotes have been imported (quotesSynced), the page must render the
  // quotes-based commercial panel even while opportunities still fail.
  const syncPending = !crmSynced && !quotesSynced;

  return (
    <PipelineClient
      orgSlug={orgSlug}
      kpis={kpis}
      atRisk={serializedAtRisk}
      sellers={sellers}
      lostAnalysis={lostAnalysis}
      quotesSummary={serializedQuotesSummary}
      dataError={dataError}
      syncPending={syncPending}
      opportunitiesSynced={crmSynced}
    />
  );
}
