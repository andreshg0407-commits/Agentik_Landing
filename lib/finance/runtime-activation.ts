/**
 * lib/finance/runtime-activation.ts
 *
 * FASE 1 + FASE 2 — Runtime Activation Service + Anti-Spam Lock
 *
 * Coordinates when generateFinancialRuntime(orgId) should run.
 * Includes module-level in-memory lock to prevent simultaneous
 * generation for the same org.
 *
 * Rules:
 *   - No previous snapshot → generate
 *   - Last snapshot > 30 minutes old → generate
 *   - Already generating for this org → skip (lock)
 *   - Lock timeout = 5 minutes (safety release)
 *
 * Sprint: AGENTIK-FINANCIAL-RUNTIME-ACTIVATION-01
 */

import { prisma }                    from "@/lib/prisma";
import { generateFinancialRuntime }  from "@/lib/finance/runtime-service";
import type { FinancialRuntimeSnapshot } from "@/lib/finance/runtime-snapshots";
import type { FinancialRuntimeEvent }    from "@/lib/finance/runtime-events";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Minimum age of last snapshot before a new one is generated (ms). */
const SNAPSHOT_STALE_MS = 30 * 60 * 1000; // 30 minutes

/** Maximum time a lock can be held before auto-release (ms). */
const LOCK_TIMEOUT_MS   = 5 * 60 * 1000;  // 5 minutes

// ── In-memory lock (FASE 2) ────────────────────────────────────────────────────

interface LockEntry {
  acquiredAt: number;
}

const runtimeLock = new Map<string, LockEntry>();

function acquireLock(orgId: string): boolean {
  const existing = runtimeLock.get(orgId);
  if (existing) {
    // Check if lock has expired (safety release)
    if (Date.now() - existing.acquiredAt < LOCK_TIMEOUT_MS) {
      console.warn(`[FINANCIAL_RUNTIME_LOCK_WARNING] org=${orgId} already generating — skip`);
      return false;
    }
    // Lock expired — release and re-acquire
    console.warn(`[FINANCIAL_RUNTIME_LOCK_WARNING] org=${orgId} stale lock released after ${LOCK_TIMEOUT_MS / 60_000}m`);
  }
  runtimeLock.set(orgId, { acquiredAt: Date.now() });
  return true;
}

function releaseLock(orgId: string): void {
  runtimeLock.delete(orgId);
}

// ── Activation result ──────────────────────────────────────────────────────────

export type ActivationOutcome = "generated" | "skipped" | "failed";

export interface ActivationResult {
  outcome:    ActivationOutcome;
  reason:     string;
  orgId:      string;
  snapshot?:  FinancialRuntimeSnapshot;
  events?:    FinancialRuntimeEvent[];
  generatedAt?: Date;
}

// ── shouldGenerateFinancialRuntime ─────────────────────────────────────────────

export async function shouldGenerateFinancialRuntime(orgId: string): Promise<{
  should: boolean;
  reason: string;
}> {
  // Check if locked
  const existing = runtimeLock.get(orgId);
  if (existing && Date.now() - existing.acquiredAt < LOCK_TIMEOUT_MS) {
    return { should: false, reason: "lock_active" };
  }

  // Check last snapshot
  const lastSnapshot = await prisma.financialRuntimeSnapshot.findFirst({
    where:   { organizationId: orgId },
    orderBy: { generatedAt: "desc" },
    select:  { generatedAt: true },
  }).catch(() => null);

  if (!lastSnapshot) {
    return { should: true, reason: "no_previous_snapshot" };
  }

  const ageMs = Date.now() - lastSnapshot.generatedAt.getTime();
  if (ageMs >= SNAPSHOT_STALE_MS) {
    return { should: true, reason: `snapshot_stale_${Math.round(ageMs / 60_000)}m` };
  }

  return {
    should: false,
    reason: `recent_snapshot_${Math.round(ageMs / 60_000)}m_old`,
  };
}

// ── activateFinancialRuntimeForOrg ─────────────────────────────────────────────

export async function activateFinancialRuntimeForOrg(
  orgId: string,
): Promise<ActivationResult> {
  // Validate orgId
  if (!orgId || typeof orgId !== "string" || orgId.trim().length === 0) {
    return { outcome: "failed", reason: "invalid_org_id", orgId };
  }

  // Check if we should generate
  const { should, reason } = await shouldGenerateFinancialRuntime(orgId);
  if (!should) {
    console.info(`[FINANCIAL_RUNTIME_SKIPPED] org=${orgId} reason=${reason}`);
    return { outcome: "skipped", reason, orgId };
  }

  // Acquire lock (FASE 2 anti-spam)
  if (!acquireLock(orgId)) {
    return { outcome: "skipped", reason: "lock_active", orgId };
  }

  try {
    const { snapshot, events } = await generateFinancialRuntime(orgId);

    console.info(
      `[FINANCIAL_RUNTIME_GENERATED] org=${orgId}` +
      ` events=${events.length}` +
      ` state=${snapshot.overallState}`,
    );

    return {
      outcome:     "generated",
      reason:      "snapshot_generated",
      orgId,
      snapshot,
      events,
      generatedAt: snapshot.generatedAt,
    };
  } catch (err) {
    const msg = (err instanceof Error) ? err.message : String(err);
    console.error(`[FINANCIAL_RUNTIME_FAILED] org=${orgId} error=${msg}`);
    return { outcome: "failed", reason: msg, orgId };
  } finally {
    releaseLock(orgId);
  }
}
