/**
 * lib/finance/runtime-timeline.ts
 *
 * FASE 6 — Runtime Timeline Data Access
 *
 * Reads FinancialRuntimeEvent from Prisma, org-scoped, serializable
 * for client components (no Date objects — age in minutes).
 *
 * Feeds: components/finance/financial-runtime-timeline.tsx
 *
 * Sprint: AGENTIK-FINANCIAL-RUNTIME-ACTIVATION-01
 */

import { prisma } from "@/lib/prisma";
import type { FinancialRuntimeEventType, FinancialRuntimeSeverity } from "./runtime-events";

// ── Serializable event for client components ───────────────────────────────────

export interface TimelineEventSerial {
  id:                  string;
  type:                FinancialRuntimeEventType;
  severity:            FinancialRuntimeSeverity;
  title:               string;
  summary:             string;
  source?:             string;
  confidence?:         number;
  previousConfidence?: number;
  ageMinutes:          number;
  /** ISO string — safe to serialize */
  createdAtIso:        string;
}

// ── Main function ──────────────────────────────────────────────────────────────

export async function getFinancialRuntimeTimeline(
  orgId:   string,
  limit:   number = 20,
): Promise<TimelineEventSerial[]> {
  const rows = await prisma.financialRuntimeEvent.findMany({
    where:   { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    take:    Math.min(limit, 100), // hard cap at 100
    select: {
      id:                true,
      type:              true,
      severity:          true,
      title:             true,
      summary:           true,
      source:            true,
      confidence:        true,
      previousConfidence: true,
      createdAt:         true,
    },
  }).catch(() => []);

  const now = Date.now();
  return rows.map(r => ({
    id:                  r.id,
    type:                r.type                as FinancialRuntimeEventType,
    severity:            r.severity            as FinancialRuntimeSeverity,
    title:               r.title,
    summary:             r.summary,
    source:              r.source              ?? undefined,
    confidence:          r.confidence          ?? undefined,
    previousConfidence:  r.previousConfidence  ?? undefined,
    ageMinutes:          Math.floor((now - r.createdAt.getTime()) / 60_000),
    createdAtIso:        r.createdAt.toISOString(),
  }));
}
