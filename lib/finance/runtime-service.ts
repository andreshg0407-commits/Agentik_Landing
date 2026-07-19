/**
 * lib/finance/runtime-service.ts
 *
 * FASE 5 — Runtime Service
 *
 * generateFinancialRuntime(orgId):
 *   1. Build current snapshot
 *   2. Read previous snapshot from DB
 *   3. Detect events (delta or initial)
 *   4. Persist snapshot
 *   5. Persist new events
 *   6. Return { snapshot, events }
 *
 * Also exposes:
 *   buildDispatchableFinancialEvents() — FASE 9 n8n readiness
 *   getRecentFinancialEvents()         — for Diego awareness
 *
 * Sprint: AGENTIK-FINANCIAL-LIVE-ORCHESTRATION-01
 */

import { prisma }                             from "@/lib/prisma";
import { buildFinancialRuntimeSnapshot }      from "./runtime-snapshots";
import type { FinancialRuntimeSnapshot }      from "./runtime-snapshots";
import { detectFinancialRuntimeEvents, detectInitialStateEvents } from "./runtime-detectors";
import type {
  FinancialRuntimeEvent,
  FinancialRuntimeEventType,
  FinancialRuntimeSeverity,
  DispatchableFinancialEvent,
} from "./runtime-events";

// ── Helpers to map DB row → in-memory shape ───────────────────────────────────

function dbSnapshotToMemory(
  row: {
    id:                   string;
    organizationId:       string;
    generatedAt:          Date;
    graphIntegrityPct:    number;
    unresolvedCount:      number;
    reconciliationHealth: number;
    liquidityConfidence:  number;
    staleSources:         number;
    closeBlockers:        number;
    bankingConnected:     boolean;
    overallState:         string;
    createdAt:            Date;
  },
): FinancialRuntimeSnapshot {
  return {
    organizationId:       row.organizationId,
    generatedAt:          row.generatedAt,
    graphIntegrityPct:    row.graphIntegrityPct,
    unresolvedCount:      row.unresolvedCount,
    reconciliationHealth: row.reconciliationHealth,
    liquidityConfidence:  row.liquidityConfidence,
    staleSources:         row.staleSources,
    closeBlockers:        row.closeBlockers,
    bankingConnected:     row.bankingConnected,
    overallState:         row.overallState as FinancialRuntimeSnapshot["overallState"],
  };
}

// ── Persist snapshot ──────────────────────────────────────────────────────────

async function persistSnapshot(snap: FinancialRuntimeSnapshot): Promise<void> {
  await prisma.financialRuntimeSnapshot.create({
    data: {
      organizationId:       snap.organizationId,
      generatedAt:          snap.generatedAt,
      graphIntegrityPct:    snap.graphIntegrityPct,
      unresolvedCount:      snap.unresolvedCount,
      reconciliationHealth: snap.reconciliationHealth,
      liquidityConfidence:  snap.liquidityConfidence,
      staleSources:         snap.staleSources,
      closeBlockers:        snap.closeBlockers,
      bankingConnected:     snap.bankingConnected,
      overallState:         snap.overallState,
    },
  }).catch(err => {
    console.error(`[RuntimeService] Failed to persist snapshot for org ${snap.organizationId}:`, err);
  });
}

// ── Persist events (skip duplicates by ID) ────────────────────────────────────

async function persistEvents(events: FinancialRuntimeEvent[]): Promise<void> {
  if (events.length === 0) return;

  // Check which IDs already exist
  const existingIds = await prisma.financialRuntimeEvent
    .findMany({
      where: { id: { in: events.map(e => e.id) } },
      select: { id: true },
    })
    .catch(() => []);

  const existingSet = new Set(existingIds.map(r => r.id));
  const newEvents   = events.filter(e => !existingSet.has(e.id));

  if (newEvents.length === 0) return;

  await prisma.financialRuntimeEvent.createMany({
    data: newEvents.map(e => ({
      id:                 e.id,
      organizationId:     e.organizationId,
      type:               e.type,
      severity:           e.severity,
      title:              e.title,
      summary:            e.summary,
      source:             e.source ?? null,
      confidence:         e.confidence ?? null,
      previousConfidence: e.previousConfidence ?? null,
      eventDispatchable:  e.eventDispatchable,
    })),
  }).catch(err => {
    console.error(`[RuntimeService] Failed to persist events for org ${events[0]?.organizationId}:`, err);
  });
}

// ── Main service function ─────────────────────────────────────────────────────

export async function generateFinancialRuntime(orgId: string): Promise<{
  snapshot: FinancialRuntimeSnapshot;
  events:   FinancialRuntimeEvent[];
}> {
  // Step 1: Build current snapshot (uses getFinancialIntelligenceContext internally)
  const currentSnapshot = await buildFinancialRuntimeSnapshot(orgId);

  // Step 2: Read previous snapshot
  const previousRow = await prisma.financialRuntimeSnapshot.findFirst({
    where:   { organizationId: orgId },
    orderBy: { generatedAt: "desc" },
  }).catch(() => null);

  // Step 3: Detect events
  let events: FinancialRuntimeEvent[];
  if (!previousRow) {
    // First run — detect initial state events
    events = detectInitialStateEvents(currentSnapshot);
  } else {
    const previousSnapshot = dbSnapshotToMemory(previousRow);
    events = detectFinancialRuntimeEvents(previousSnapshot, currentSnapshot);
  }

  // Steps 4 & 5: Persist in parallel
  await Promise.all([
    persistSnapshot(currentSnapshot),
    persistEvents(events),
  ]);

  return { snapshot: currentSnapshot, events };
}

// ── Recent events reader (for Diego awareness) ────────────────────────────────

export interface RecentFinancialEvent {
  id:       string;
  type:     FinancialRuntimeEventType;
  severity: FinancialRuntimeSeverity;
  title:    string;
  summary:  string;
  source?:  string;
  confidence?: number;
  previousConfidence?: number;
  createdAt: Date;
  ageMinutes: number;
}

export async function getRecentFinancialEvents(
  orgId:        string,
  maxAgeHours:  number = 24,
  limit:        number = 20,
): Promise<RecentFinancialEvent[]> {
  const since = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  const rows = await prisma.financialRuntimeEvent.findMany({
    where:   { organizationId: orgId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take:    limit,
  }).catch(() => []);

  const now = Date.now();
  return rows.map(r => ({
    id:                 r.id,
    type:               r.type                as FinancialRuntimeEventType,
    severity:           r.severity            as FinancialRuntimeSeverity,
    title:              r.title,
    summary:            r.summary,
    source:             r.source              ?? undefined,
    confidence:         r.confidence          ?? undefined,
    previousConfidence: r.previousConfidence  ?? undefined,
    createdAt:          r.createdAt,
    ageMinutes:         Math.floor((now - r.createdAt.getTime()) / 60_000),
  }));
}

// ── FASE 9 — Dispatchable event builder ──────────────────────────────────────

/**
 * Transforms FinancialRuntimeEvent[] into ready-to-dispatch payloads.
 * Consumers: n8n HTTP node, webhook dispatcher, WhatsApp notifications.
 * Does NOT send anything — only builds the payload shape.
 */
export function buildDispatchableFinancialEvents(
  events: FinancialRuntimeEvent[],
): DispatchableFinancialEvent[] {
  return events
    .filter(e => e.eventDispatchable)
    .map(e => ({
      eventId:        e.id,
      organizationId: e.organizationId,
      type:           e.type,
      severity:       e.severity,
      title:          e.title,
      summary:        e.summary,
      source:         e.source,
      confidence:     e.confidence,
      occurredAt:     e.createdAt.toISOString(),
      webhookPayload: {
        event:      e.type,
        org:        e.organizationId,
        severity:   e.severity,
        message:    e.title,
        timestamp:  e.createdAt.toISOString(),
        metadata: {
          summary:           e.summary,
          source:            e.source,
          confidence:        e.confidence,
          previousConfidence: e.previousConfidence,
        },
      },
    }));
}
