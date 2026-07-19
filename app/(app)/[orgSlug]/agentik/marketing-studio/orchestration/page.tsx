/**
 * app/(app)/[orgSlug]/agentik/marketing-studio/orchestration/page.tsx
 *
 * MS-12 — Commerce Orchestration Center
 *
 * Server Component — loads all data, computes orchestration state,
 * passes serialized props to the client dashboard.
 *
 * Blueprint:
 *   1. OperationalWorkspaceHeader
 *   2. Global health strip
 *   3. Destination health matrix
 *   4. Action center
 *   5. Active queue + failed jobs
 *   6. Retry queue
 *   7. Luca + Mila intelligence
 *   8. Propagation alerts
 *   9. Queue strip footer
 */

import { redirect }                   from "next/navigation";
import { requireOrgAccess }           from "@/lib/auth/org-access";
import { canAccessMarketingStudio }   from "@/lib/auth/module-access";
import { prisma }                     from "@/lib/prisma";
import { C, T, S }                    from "@/lib/ui/tokens";
import { OperationalWorkspaceHeader } from "@/components/workspace/operational-workspace-header";
import { OrchestrationDashboard }     from "@/components/marketing-studio/orchestration/orchestration-dashboard";

import { listProductConsoleItems }    from "@/lib/marketing-studio/products/product-query-service";
import { buildPublicationQueue }      from "@/lib/marketing-studio/commerce/publication-engine";
import { COMMERCE_DESTINATION }       from "@/lib/marketing-studio/commerce/commerce-types";
import { buildCommerceOrchestration } from "@/lib/marketing-studio/orchestration/orchestration-engine";
import {
  generateOrchestrationLucaSignals,
  generateOrchestrationMilaSignals,
} from "@/lib/marketing-studio/orchestration/orchestration-signals";
import type { OrchestrationJob }      from "@/lib/marketing-studio/orchestration/orchestration-types";
import {
  ORCHESTRATION_JOB_STATUS,
  ORCHESTRATION_JOB_TYPE,
} from "@/lib/marketing-studio/orchestration/orchestration-types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function mapCommerceJobToOrchestrationJob(job: {
  id:          string;
  productId:   string | null;
  jobType:     string;
  status:      string;
  priority:    number;
  retryCount:  number;
  createdAt:   Date;
  startedAt:   Date | null;
  completedAt: Date | null;
  lastError:   string | null;
  scheduledAt: Date;
  provider:    string;
}): OrchestrationJob {
  // Map Commerce job status → OrchestrationJobStatus
  const statusMap: Record<string, string> = {
    pending:   ORCHESTRATION_JOB_STATUS.PENDING,
    queued:    ORCHESTRATION_JOB_STATUS.PENDING,
    running:   ORCHESTRATION_JOB_STATUS.RUNNING,
    succeeded: ORCHESTRATION_JOB_STATUS.SUCCEEDED,
    failed:    ORCHESTRATION_JOB_STATUS.FAILED,
    cancelled: ORCHESTRATION_JOB_STATUS.CANCELLED,
  };

  const jobTypeMap: Record<string, string> = {
    publish_product_draft: ORCHESTRATION_JOB_TYPE.PUBLISH_PRODUCT,
    update_product:        ORCHESTRATION_JOB_TYPE.SYNC_SHOPIFY,
    delete_product:        ORCHESTRATION_JOB_TYPE.SYNC_SHOPIFY,
    sync_inventory:        ORCHESTRATION_JOB_TYPE.SYNC_SHOPIFY,
    sync_collection:       ORCHESTRATION_JOB_TYPE.REBUILD_CATALOG,
    re_publish_draft:      ORCHESTRATION_JOB_TYPE.PUBLISH_PRODUCT,
    rebuild_variants:      ORCHESTRATION_JOB_TYPE.GENERATE_VARIANTS,
    refresh_images:        ORCHESTRATION_JOB_TYPE.GENERATE_SOCIAL_ASSETS,
    mark_external_missing: ORCHESTRATION_JOB_TYPE.RETRY_SYNC,
    update_shopify_product: ORCHESTRATION_JOB_TYPE.SYNC_SHOPIFY,
  };

  const now = Date.now();
  const startedMs = job.startedAt ? job.startedAt.getTime() : null;
  const isStale = (
    (statusMap[job.status] === ORCHESTRATION_JOB_STATUS.RUNNING ||
     statusMap[job.status] === ORCHESTRATION_JOB_STATUS.PENDING) &&
    startedMs && now - startedMs > 30 * 60 * 1000
  );

  return {
    id:                   job.id,
    productId:            job.productId,
    productName:          null,   // enriched below
    type:                 (jobTypeMap[job.jobType] ?? ORCHESTRATION_JOB_TYPE.SYNC_SHOPIFY) as OrchestrationJob["type"],
    priority:             job.priority,
    status:               (isStale ? ORCHESTRATION_JOB_STATUS.STALE : (statusMap[job.status] ?? ORCHESTRATION_JOB_STATUS.PENDING)) as OrchestrationJob["status"],
    retryCount:           job.retryCount,
    createdAt:            job.createdAt.toISOString(),
    startedAt:            job.startedAt?.toISOString() ?? null,
    completedAt:          job.completedAt?.toISOString() ?? null,
    failureReason:        job.lastError,
    dependencies:         [],
    affectedDestinations: [job.provider],
    scheduledAt:          job.scheduledAt.toISOString(),
  };
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function OrchestrationPage({
  params,
}: {
  params: { orgSlug: string };
}) {
  const { orgSlug }                  = params;
  const { membership, organization } = await requireOrgAccess(orgSlug);

  if (!canAccessMarketingStudio(membership.role)) {
    redirect(`/${orgSlug}/agentik`);
  }

  const orgId = organization.id;

  // ── Parallel data fetch ──────────────────────────────────────────────────────
  const [products, commerceJobs, webhookPending, syncSummaryRaw] = await Promise.all([
    listProductConsoleItems(orgId),

    prisma.commerceJob.findMany({
      where:   { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take:    200,
      select: {
        id:          true,
        productId:   true,
        jobType:     true,
        status:      true,
        priority:    true,
        retryCount:  true,
        createdAt:   true,
        startedAt:   true,
        completedAt: true,
        lastError:   true,
        scheduledAt: true,
        provider:    true,
      },
    }),

    prisma.integrationWebhookEvent.count({
      where: { organizationId: orgId, status: "pending" },
    }),

    // Load sync states for summary
    prisma.productSyncState.findMany({
      where: { organizationId: orgId, channel: "shopify" },
      select: { status: true },
    }),
  ]);

  // ── Build sync summary from raw data ──────────────────────────────────────
  const syncSummary = {
    total:              products.length,
    inSync:             syncSummaryRaw.filter(s => s.status === "synced").length,
    driftDetected:      0,
    externalNewer:      0,
    agentikNewer:       syncSummaryRaw.filter(s => s.status === "outdated").length,
    missingExternal:    0,
    conflict:           0,
    unknown:            syncSummaryRaw.filter(s => s.status === "pending").length,
    stale:              syncSummaryRaw.filter(s => s.status === "outdated").length,
    webhookPending,
    lastReconciliation: null,
    healthLevel:        "unknown" as const,
  };

  // ── Map jobs + enrich with product names ──────────────────────────────────
  const productNameMap = new Map(products.map(p => [p.productId, p.name]));
  const existingJobs: OrchestrationJob[] = commerceJobs.map(j => {
    const mapped = mapCommerceJobToOrchestrationJob(j);
    return { ...mapped, productName: j.productId ? (productNameMap.get(j.productId) ?? null) : null };
  });

  // ── Build queue ───────────────────────────────────────────────────────────
  const queue = buildPublicationQueue(products, COMMERCE_DESTINATION.SHOPIFY);

  // ── Run orchestration engine ──────────────────────────────────────────────
  const orchestrationState = buildCommerceOrchestration({
    organizationId: orgId,
    products,
    queue,
    syncSummary,
    webhookPending,
    existingJobs,
  });

  // ── Compute intelligence signals ──────────────────────────────────────────
  const lucaSignals = generateOrchestrationLucaSignals(
    products,
    existingJobs,
    orchestrationState.destinations,
    syncSummary,
  );
  const milaSignals = generateOrchestrationMilaSignals(products, syncSummary);

  // ── Header signal counts ──────────────────────────────────────────────────
  const criticalCount = orchestrationState.failedJobs.length +
    orchestrationState.destinations.filter(d => d.healthLevel === "blocked").length;

  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <OperationalWorkspaceHeader
        breadcrumbs={[
          { label: "Marketing Studio", href: `/${orgSlug}/agentik/marketing-studio` },
          { label: "Orchestration Center" },
        ]}
        title="Orchestration Center"
        subtitle={`${products.length} productos · ${existingJobs.length} jobs · ${webhookPending} webhooks pendientes`}
        status={criticalCount > 0 ? "critical" : orchestrationState.systemHealth === "operational" ? "ok" : "warning"}
        statusLabel={criticalCount > 0 ? `${criticalCount} crítico${criticalCount > 1 ? "s" : ""}` : orchestrationState.systemHealthLabel}
      />

      <OrchestrationDashboard
        state={orchestrationState}
        lucaSignals={lucaSignals}
        milaSignals={milaSignals}
        orgSlug={orgSlug}
      />
    </div>
  );
}
