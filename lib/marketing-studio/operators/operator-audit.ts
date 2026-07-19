/**
 * lib/marketing-studio/operators/operator-audit.ts
 *
 * MS-19 — Channel Operator Layer: OperatorAuditEvent Prisma repository
 *
 * SERVER ONLY — never import in client components.
 */

import { prisma } from "@/lib/prisma";
import type { OperatorChannel, OperatorAction } from "./operator-types";

// ── Write ─────────────────────────────────────────────────────────────────────

export async function recordOperatorAuditEvent(opts: {
  organizationId: string;
  channel:        OperatorChannel;
  action:         OperatorAction;
  actorId?:       string | null;
  receiptId?:     string | null;
  planId?:        string | null;
  stageId?:       string | null;
  payload?:       Record<string, unknown>;
}): Promise<void> {
  await prisma.operatorAuditEvent.create({
    data: {
      organizationId: opts.organizationId,
      channel:        opts.channel,
      action:         opts.action,
      actorId:        opts.actorId   ?? null,
      receiptId:      opts.receiptId ?? null,
      planId:         opts.planId    ?? null,
      stageId:        opts.stageId   ?? null,
      payload:        (opts.payload ?? {}) as object,
    },
  });
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function listOperatorAuditEvents(opts: {
  organizationId: string;
  channel?:       OperatorChannel;
  limit?:         number;
}): Promise<Array<{
  id:         string;
  channel:    string;
  action:     string;
  actorId:    string | null;
  receiptId:  string | null;
  planId:     string | null;
  payload:    unknown;
  occurredAt: Date;
}>> {
  return prisma.operatorAuditEvent.findMany({
    where: {
      organizationId: opts.organizationId,
      ...(opts.channel ? { channel: opts.channel } : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: opts.limit ?? 100,
    select: {
      id:         true,
      channel:    true,
      action:     true,
      actorId:    true,
      receiptId:  true,
      planId:     true,
      payload:    true,
      occurredAt: true,
    },
  });
}
