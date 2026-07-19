/**
 * lib/finance/runtime-batch.ts
 *
 * FASE 4 — Tenant Batch Runner
 *
 * Runs activateFinancialRuntimeForOrg() for all active organizations
 * with controlled concurrency (max 3 parallel).
 *
 * Sprint: AGENTIK-FINANCIAL-RUNTIME-ACTIVATION-01
 */

import { prisma }                           from "@/lib/prisma";
import { activateFinancialRuntimeForOrg }  from "./runtime-activation";
import type { ActivationResult }           from "./runtime-activation";

// ── Batch result ───────────────────────────────────────────────────────────────

export interface BatchActivationResult {
  totalOrgs:  number;
  generated:  number;
  skipped:    number;
  failed:     number;
  durationMs: number;
  results:    Array<{ orgId: string; outcome: string; reason: string }>;
}

// ── Concurrency limiter ────────────────────────────────────────────────────────

async function runConcurrent<T>(
  items:       string[],
  concurrency: number,
  fn:          (item: string) => Promise<T>,
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i    = index++;
      const item = items[i];
      results[i] = await fn(item);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ── Main batch function ────────────────────────────────────────────────────────

export async function activateFinancialRuntimeForActiveOrgs(): Promise<BatchActivationResult> {
  const startMs = Date.now();

  // Load active org IDs (non-deleted)
  const orgs = await prisma.organization.findMany({
    where:  { deletedAt: null },
    select: { id: true },
  }).catch(() => []);

  const orgIds = orgs.map(o => o.id);

  if (orgIds.length === 0) {
    console.info("[FINANCIAL_RUNTIME_BATCH_SUMMARY] no active orgs found");
    return {
      totalOrgs:  0,
      generated:  0,
      skipped:    0,
      failed:     0,
      durationMs: Date.now() - startMs,
      results:    [],
    };
  }

  // Run with concurrency = 3
  const activationResults = await runConcurrent<ActivationResult>(
    orgIds,
    3,
    (orgId) => activateFinancialRuntimeForOrg(orgId),
  );

  let generated = 0;
  let skipped   = 0;
  let failed    = 0;

  for (const r of activationResults) {
    if (r.outcome === "generated") generated++;
    else if (r.outcome === "skipped") skipped++;
    else failed++;
  }

  const durationMs = Date.now() - startMs;

  console.info(
    `[FINANCIAL_RUNTIME_BATCH_SUMMARY]` +
    ` orgs=${orgIds.length}` +
    ` generated=${generated}` +
    ` skipped=${skipped}` +
    ` failed=${failed}` +
    ` duration=${durationMs}ms`,
  );

  return {
    totalOrgs:  orgIds.length,
    generated,
    skipped,
    failed,
    durationMs,
    results: activationResults.map(r => ({
      orgId:   r.orgId,
      outcome: r.outcome,
      reason:  r.reason,
    })),
  };
}
