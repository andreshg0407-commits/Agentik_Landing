/**
 * lib/collections/campaigns.ts
 *
 * Cohort campaign engine for collections.
 *
 * A "campaign" is a named batch of collection tasks targeting a filtered cohort
 * of customers (by DPD bucket, min overdue amount, etc.).
 *
 * ── Storage ───────────────────────────────────────────────────────────────────
 *
 * No new Prisma model needed. Campaigns are represented by ActionTask records
 * sharing a common `sourceModule = "campaign:{campaignId}"`.
 *
 * Campaign metadata (name, bucket, filter) is stored in `payloadJson.campaign`
 * on every task in the campaign — so any task can reconstruct the campaign header.
 *
 * ── Dedup ─────────────────────────────────────────────────────────────────────
 *
 * Multiple campaigns can target the same customer across different runs.
 * We do NOT deduplicate across campaigns — each campaign is a deliberate action.
 * Within a single campaign launch, each customer gets exactly one task.
 *
 * Exports:
 *   DpdBucket           — aging bucket type
 *   CampaignFilter      — cohort filter parameters
 *   CampaignSummary     — aggregated campaign view
 *   CustomerCampaignRow — per-customer row in campaign detail
 *   launchCampaign()    — create tasks for a cohort
 *   getActiveCampaigns() — list all campaigns with aggregated stats
 *   getCampaignDetail() — per-campaign breakdown
 */

import { prisma }              from "@/lib/prisma";
import { createActionTask }    from "@/lib/actions/service";
import { ActionTaskStatus, ActionTaskType, ActionTaskPriority } from "@prisma/client";
import { suggestAction }       from "@/lib/collections/queue";
import type { CollectionOutcomeData } from "@/lib/collections/outcomes";

// ── Types ──────────────────────────────────────────────────────────────────────

export type DpdBucket =
  | "0_30"
  | "31_60"
  | "61_90"
  | "91_180"
  | "181_plus";

export interface CampaignFilter {
  dpd_bucket:    DpdBucket;
  min_overdue?:  number;          // minimum overdueReceivable (COP)
  max_customers?: number;         // cap on cohort size (default: 200)
  seller_filter?: string;         // optional: filter by sellerName (partial match)
}

export interface CampaignMeta {
  campaignId:   string;
  campaignName: string;
  bucket:       DpdBucket;
  filter:       CampaignFilter;
  createdBy:    string;
  createdAt:    string;           // ISO string
}

export interface CampaignSummary {
  campaignId:        string;
  campaignName:      string;
  bucket:            DpdBucket;
  createdAt:         Date;
  createdBy:         string;
  total:             number;
  completed:         number;
  pending:           number;
  paid:              number;
  promise:           number;
  noContact:         number;
  estimatedRecovery: number;
  completionRate:    number;      // 0–100
  recoveryRate:      number;      // paid / total, 0–100
}

export interface CustomerCampaignRow {
  taskId:      string;
  customerSlug: string;
  customerName: string;
  maxDpd:      number;
  overdueAmount: number;
  status:      ActionTaskStatus;
  outcome:     string | null;     // OutcomeType or null
  completedAt: Date | null;
}

// ── DPD bucket → Prisma filter ────────────────────────────────────────────────

function bucketToDpdRange(bucket: DpdBucket): { gte?: number; lte?: number; gt?: number } {
  switch (bucket) {
    case "0_30":    return { gte: 1,   lte: 30  };
    case "31_60":   return { gte: 31,  lte: 60  };
    case "61_90":   return { gte: 61,  lte: 90  };
    case "91_180":  return { gte: 91,  lte: 180 };
    case "181_plus": return { gt: 180 };
  }
}

function bucketToPriority(bucket: DpdBucket): ActionTaskPriority {
  if (bucket === "181_plus" || bucket === "91_180") return ActionTaskPriority.URGENT;
  if (bucket === "61_90")                           return ActionTaskPriority.HIGH;
  if (bucket === "31_60")                           return ActionTaskPriority.MEDIUM;
  return ActionTaskPriority.LOW;
}

// ── Launch campaign ────────────────────────────────────────────────────────────

export async function launchCampaign(opts: {
  orgId:        string;
  createdBy:    string;
  campaignName: string;
  filter:       CampaignFilter;
}): Promise<{ campaignId: string; tasksCreated: number }> {
  const { orgId, createdBy, campaignName, filter } = opts;
  const dpdRange = bucketToDpdRange(filter.dpd_bucket);
  const limit    = filter.max_customers ?? 200;

  // ── Query customer cohort ─────────────────────────────────────────────────
  const customers = await (prisma as any).customerProfile.findMany({
    where: {
      organizationId:     orgId,
      maxDpd:             dpdRange,
      overdueReceivable:  { gt: filter.min_overdue ?? 0 },
      ...(filter.seller_filter
        ? { sellerName: { contains: filter.seller_filter, mode: "insensitive" } }
        : {}),
    },
    select: {
      slug:              true,
      name:              true,
      maxDpd:            true,
      overdueReceivable: true,
      totalReceivable:   true,
    },
    orderBy: [
      { overdueReceivable: "desc" },
      { maxDpd:            "desc" },
    ],
    take: limit,
  }) as Array<{
    slug:              string;
    name:              string;
    maxDpd:            number;
    overdueReceivable: number;
    totalReceivable:   number;
  }>;

  if (customers.length === 0) {
    return { campaignId: "", tasksCreated: 0 };
  }

  // ── Generate campaignId and shared metadata ───────────────────────────────
  const campaignId  = `cmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const sourceModule = `campaign:${campaignId}`;
  const priority     = bucketToPriority(filter.dpd_bucket);
  const meta: CampaignMeta = {
    campaignId,
    campaignName,
    bucket:    filter.dpd_bucket,
    filter,
    createdBy,
    createdAt: new Date().toISOString(),
  };

  // ── Create one ActionTask per customer ────────────────────────────────────
  let tasksCreated = 0;
  for (const c of customers) {
    const overdueRatio = c.totalReceivable > 0
      ? (c.overdueReceivable / c.totalReceivable) * 100
      : 100;
    const action = suggestAction(c.maxDpd, overdueRatio);

    await createActionTask(orgId, createdBy, {
      title:        `[${campaignName}] Cobranza — ${c.name}`,
      actionType:   ActionTaskType.CREAR_ACCION_COBRANZA,
      targetType:   "customer",
      targetId:     c.slug,
      targetLabel:  c.name,
      sourceModule,
      priority,
      dueAt:        new Date(Date.now() + 24 * 60 * 60 * 1000),
      payloadJson:  {
        campaign:      meta,
        overdueAmount: c.overdueReceivable,
        totalAmount:   c.totalReceivable,
        currentDpd:    c.maxDpd,
        channel:       action.channel,
        scriptHint:    action.scriptHint,
      },
    });
    tasksCreated++;
  }

  return { campaignId, tasksCreated };
}

// ── Get active campaigns ───────────────────────────────────────────────────────

export async function getActiveCampaigns(
  orgId: string,
): Promise<CampaignSummary[]> {
  // Fetch all tasks from any campaign (sourceModule starts with "campaign:")
  const tasks = await prisma.actionTask.findMany({
    where: {
      organizationId: orgId,
      sourceModule:   { startsWith: "campaign:" },
    },
    select: {
      sourceModule: true,
      status:       true,
      resultJson:   true,
      payloadJson:  true,
      createdBy:    true,
      createdAt:    true,
    },
    orderBy: { createdAt: "desc" },
    take:    10_000,
  });

  // Group by sourceModule (= "campaign:{campaignId}")
  const grouped = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const sm = t.sourceModule ?? "";
    if (!grouped.has(sm)) grouped.set(sm, []);
    grouped.get(sm)!.push(t);
  }

  const summaries: CampaignSummary[] = [];

  for (const [sourceModule, rows] of grouped) {
    const campaignId = sourceModule.replace("campaign:", "");

    // Extract meta from first task's payloadJson
    const firstPayload = rows[0]?.payloadJson as Record<string, unknown> | null;
    const meta = firstPayload?.campaign as CampaignMeta | undefined;

    const campaignName = meta?.campaignName ?? campaignId;
    const bucket       = (meta?.bucket ?? "0_30") as DpdBucket;
    const createdBy    = meta?.createdBy ?? rows[0]?.createdBy ?? "system";
    const createdAt    = meta?.createdAt
      ? new Date(meta.createdAt)
      : new Date(rows[0]?.createdAt ?? Date.now());

    let completed = 0;
    let pending   = 0;
    let paid      = 0;
    let promise   = 0;
    let noContact = 0;
    let estimatedRecovery = 0;

    for (const t of rows) {
      if (t.status === ActionTaskStatus.COMPLETED) {
        completed++;
        if (t.resultJson && typeof t.resultJson === "object" && !Array.isArray(t.resultJson)) {
          const outcome = t.resultJson as unknown as CollectionOutcomeData;
          const ot = outcome.outcomeType;
          if (ot === "PAID" || ot === "PARTIAL_PAYMENT") paid++;
          if (ot === "PROMISE_TO_PAY") promise++;
          if (ot === "NO_CONTACT") noContact++;
          if (ot === "PROMISE_TO_PAY" && outcome.promiseAmount) estimatedRecovery += outcome.promiseAmount;
          if (ot === "PARTIAL_PAYMENT" && outcome.partialAmount) estimatedRecovery += outcome.partialAmount;
        }
      } else {
        pending++;
      }
    }

    const total = rows.length;
    summaries.push({
      campaignId,
      campaignName,
      bucket,
      createdAt,
      createdBy,
      total,
      completed,
      pending,
      paid,
      promise,
      noContact,
      estimatedRecovery,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      recoveryRate:   total > 0 ? Math.round((paid / total) * 100) : 0,
    });
  }

  // Sort newest first
  summaries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return summaries;
}

// ── Campaign detail ────────────────────────────────────────────────────────────

export async function getCampaignDetail(
  orgId:      string,
  campaignId: string,
): Promise<(CampaignSummary & { customers: CustomerCampaignRow[] }) | null> {
  const sourceModule = `campaign:${campaignId}`;

  const tasks = await prisma.actionTask.findMany({
    where: {
      organizationId: orgId,
      sourceModule,
    },
    select: {
      id:          true,
      targetId:    true,
      targetLabel: true,
      status:      true,
      resultJson:  true,
      payloadJson:  true,
      createdBy:   true,
      createdAt:   true,
      completedAt: true,
    },
    orderBy: { createdAt: "desc" },
    take:    1000,
  });

  if (tasks.length === 0) return null;

  // Rebuild summary
  const firstPayload = tasks[0]?.payloadJson as Record<string, unknown> | null;
  const meta = firstPayload?.campaign as CampaignMeta | undefined;
  const campaignName = meta?.campaignName ?? campaignId;
  const bucket       = (meta?.bucket ?? "0_30") as DpdBucket;
  const createdBy    = meta?.createdBy ?? tasks[0]?.createdBy ?? "system";
  const createdAt    = meta?.createdAt ? new Date(meta.createdAt) : new Date(tasks[0]?.createdAt ?? Date.now());

  let completed = 0;
  let pending   = 0;
  let paid      = 0;
  let promise   = 0;
  let noContact = 0;
  let estimatedRecovery = 0;

  const customers: CustomerCampaignRow[] = [];

  for (const t of tasks) {
    let outcome: string | null = null;

    if (t.status === ActionTaskStatus.COMPLETED) {
      completed++;
      if (t.resultJson && typeof t.resultJson === "object" && !Array.isArray(t.resultJson)) {
        const od = t.resultJson as unknown as CollectionOutcomeData;
        outcome = od.outcomeType ?? null;
        if (od.outcomeType === "PAID" || od.outcomeType === "PARTIAL_PAYMENT") paid++;
        if (od.outcomeType === "PROMISE_TO_PAY") promise++;
        if (od.outcomeType === "NO_CONTACT") noContact++;
        if (od.outcomeType === "PROMISE_TO_PAY" && od.promiseAmount) estimatedRecovery += od.promiseAmount;
        if (od.outcomeType === "PARTIAL_PAYMENT" && od.partialAmount) estimatedRecovery += od.partialAmount;
      }
    } else {
      pending++;
    }

    const payload = t.payloadJson as Record<string, unknown> | null;
    customers.push({
      taskId:       t.id,
      customerSlug: t.targetId ?? "",
      customerName: t.targetLabel ?? t.targetId ?? "",
      maxDpd:       typeof payload?.currentDpd === "number" ? payload.currentDpd : 0,
      overdueAmount: typeof payload?.overdueAmount === "number" ? payload.overdueAmount : 0,
      status:       t.status,
      outcome,
      completedAt:  t.completedAt ?? null,
    });
  }

  const total = tasks.length;
  return {
    campaignId,
    campaignName,
    bucket,
    createdAt,
    createdBy,
    total,
    completed,
    pending,
    paid,
    promise,
    noContact,
    estimatedRecovery,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
    recoveryRate:   total > 0 ? Math.round((paid / total) * 100) : 0,
    customers,
  };
}
