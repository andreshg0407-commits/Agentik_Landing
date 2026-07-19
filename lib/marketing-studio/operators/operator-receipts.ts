/**
 * lib/marketing-studio/operators/operator-receipts.ts
 *
 * MS-19 — Channel Operator Layer: OperatorReceipt Prisma repository
 *
 * SERVER ONLY — never import in client components.
 */

import { prisma } from "@/lib/prisma";
import type { OperatorChannel, OperatorStatus } from "./operator-types";

// ── Write ─────────────────────────────────────────────────────────────────────

export async function createOperatorReceipt(opts: {
  organizationId: string;
  channel:        OperatorChannel;
  action:         string;
  status:         OperatorStatus;
  executionJobId?: string | null;
  externalRef?:   string | null;
  planId?:        string | null;
  stageId?:       string | null;
  resultPayload?: Record<string, unknown>;
  errorCode?:     string | null;
  errorMessage?:  string | null;
  retryCount?:    number;
  durationMs?:    number | null;
}): Promise<{ id: string }> {
  const receipt = await prisma.operatorReceipt.create({
    data: {
      organizationId: opts.organizationId,
      channel:        opts.channel,
      action:         opts.action,
      status:         opts.status,
      executionJobId: opts.executionJobId ?? null,
      externalRef:    opts.externalRef    ?? null,
      planId:         opts.planId         ?? null,
      stageId:        opts.stageId        ?? null,
      resultPayload:  (opts.resultPayload ?? {}) as object,
      errorCode:      opts.errorCode      ?? null,
      errorMessage:   opts.errorMessage   ?? null,
      retryCount:     opts.retryCount     ?? 0,
      durationMs:     opts.durationMs     ?? null,
    },
    select: { id: true },
  });
  return { id: receipt.id };
}

export async function updateOperatorReceiptStatus(opts: {
  id:          string;
  status:      OperatorStatus;
  confirmedAt?: Date | null;
  externalRef?: string | null;
  errorCode?:  string | null;
  errorMessage?: string | null;
}): Promise<void> {
  await prisma.operatorReceipt.update({
    where: { id: opts.id },
    data: {
      status:      opts.status,
      confirmedAt: opts.confirmedAt ?? undefined,
      externalRef: opts.externalRef ?? undefined,
      errorCode:   opts.errorCode   ?? undefined,
      errorMessage: opts.errorMessage ?? undefined,
    },
  });
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function listOperatorReceipts(opts: {
  organizationId: string;
  channel?:       OperatorChannel;
  planId?:        string;
  limit?:         number;
}): Promise<Array<{
  id:            string;
  channel:       string;
  action:        string;
  status:        string;
  executionJobId: string | null;
  externalRef:   string | null;
  planId:        string | null;
  stageId:       string | null;
  errorCode:     string | null;
  errorMessage:  string | null;
  retryCount:    number;
  durationMs:    number | null;
  dispatchedAt:  Date;
  confirmedAt:   Date | null;
}>> {
  return prisma.operatorReceipt.findMany({
    where: {
      organizationId: opts.organizationId,
      ...(opts.channel ? { channel: opts.channel } : {}),
      ...(opts.planId  ? { planId:  opts.planId  } : {}),
    },
    orderBy: { dispatchedAt: "desc" },
    take: opts.limit ?? 50,
    select: {
      id:             true,
      channel:        true,
      action:         true,
      status:         true,
      executionJobId: true,
      externalRef:    true,
      planId:         true,
      stageId:        true,
      errorCode:      true,
      errorMessage:   true,
      retryCount:     true,
      durationMs:     true,
      dispatchedAt:   true,
      confirmedAt:    true,
    },
  });
}

export async function getOperatorReceiptStats(opts: {
  organizationId: string;
  channel?:       OperatorChannel;
  sinceMs?:       number;
}): Promise<{ total: number; confirmed: number; failed: number; partial: number }> {
  const since = opts.sinceMs
    ? new Date(Date.now() - opts.sinceMs)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const rows = await prisma.operatorReceipt.findMany({
    where: {
      organizationId: opts.organizationId,
      ...(opts.channel ? { channel: opts.channel } : {}),
      dispatchedAt: { gte: since },
    },
    select: { status: true },
  });

  return {
    total:     rows.length,
    confirmed: rows.filter(r => r.status === "confirmed").length,
    failed:    rows.filter(r => r.status === "failed").length,
    partial:   rows.filter(r => r.status === "partial").length,
  };
}
