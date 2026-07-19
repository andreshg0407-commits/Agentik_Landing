/**
 * lib/agent-orchestration/delegation-queue.ts
 *
 * Agentik Agent Orchestration — Delegation Queue
 *
 * V1: In-memory, process-scoped singleton.
 * V2 migration: Replace DelegationQueueAdapter with PrismaDelegationQueueAdapter.
 *               No changes needed in delegation-engine.ts or endpoints.
 *
 * Sprint: AGENTIK-AGENT-DELEGATION-ORCHESTRATION-01
 */

import type {
  AgentDelegation,
  DelegationStatus,
  DelegationFilter,
  DelegationSummary,
  DelegationReport,
} from "./delegation-types";
import { isDelegationTerminal, DELEGATION_TERMINAL_STATES } from "./delegation-types";

// ── Adapter interface ─────────────────────────────────────────────────────────

export interface DelegationQueueAdapter {
  enqueue(delegation: AgentDelegation): Promise<AgentDelegation>;
  get(delegationId: string): Promise<AgentDelegation | null>;
  update(delegation: AgentDelegation): Promise<AgentDelegation>;
  list(filter: DelegationFilter): Promise<AgentDelegation[]>;
  exists(
    sourceAgentId:  string,
    targetAgentId:  string,
    reason:         string,
    parentActionId: string | null,
  ): Promise<boolean>;
}

// ── In-memory adapter (V1) ────────────────────────────────────────────────────

class InMemoryDelegationQueue implements DelegationQueueAdapter {
  private readonly delegations = new Map<string, AgentDelegation>();

  async enqueue(delegation: AgentDelegation): Promise<AgentDelegation> {
    this.delegations.set(delegation.id, delegation);
    return delegation;
  }

  async get(delegationId: string): Promise<AgentDelegation | null> {
    return this.delegations.get(delegationId) ?? null;
  }

  async update(delegation: AgentDelegation): Promise<AgentDelegation> {
    if (!this.delegations.has(delegation.id)) {
      throw new Error(`Delegation not found: ${delegation.id}`);
    }
    this.delegations.set(delegation.id, delegation);
    return delegation;
  }

  async list(filter: DelegationFilter): Promise<AgentDelegation[]> {
    let results = Array.from(this.delegations.values());

    if (filter.orgId)         results = results.filter(d => d.orgId          === filter.orgId);
    if (filter.sourceAgentId) results = results.filter(d => d.sourceAgentId  === filter.sourceAgentId);
    if (filter.targetAgentId) results = results.filter(d => d.targetAgentId  === filter.targetAgentId);
    if (filter.parentActionId)results = results.filter(d => d.parentActionId === filter.parentActionId);
    if (filter.reason)        results = results.filter(d => d.reason          === filter.reason);
    if (filter.since)         results = results.filter(d => d.createdAt       >= filter.since!);

    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter(d => statuses.includes(d.status));
    }

    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filter.limit ? results.slice(0, filter.limit) : results;
  }

  async exists(
    sourceAgentId:  string,
    targetAgentId:  string,
    reason:         string,
    parentActionId: string | null,
  ): Promise<boolean> {
    for (const d of this.delegations.values()) {
      if (
        d.sourceAgentId  === sourceAgentId &&
        d.targetAgentId  === targetAgentId &&
        d.reason         === reason &&
        d.parentActionId === parentActionId &&
        !isDelegationTerminal(d.status)
      ) {
        return true;
      }
    }
    return false;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _queue: DelegationQueueAdapter = new InMemoryDelegationQueue();

export function setDelegationQueueAdapter(adapter: DelegationQueueAdapter): void {
  _queue = adapter;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function enqueueDelegation(
  delegation: AgentDelegation,
): Promise<AgentDelegation> {
  return _queue.enqueue(delegation);
}

export async function getDelegation(
  delegationId: string,
): Promise<AgentDelegation | null> {
  return _queue.get(delegationId);
}

export async function updateDelegation(
  delegation: AgentDelegation,
): Promise<AgentDelegation> {
  return _queue.update(delegation);
}

export async function listDelegations(
  filter: DelegationFilter = {},
): Promise<AgentDelegation[]> {
  return _queue.list(filter);
}

export async function listDelegationsForAgent(
  agentId: string,
  orgId:   string,
  role:    "source" | "target" | "both" = "both",
  limit = 50,
): Promise<AgentDelegation[]> {
  if (role === "both") {
    const [src, tgt] = await Promise.all([
      _queue.list({ sourceAgentId: agentId, orgId, limit }),
      _queue.list({ targetAgentId: agentId, orgId, limit }),
    ]);
    const seen = new Set<string>();
    return [...src, ...tgt].filter(d => {
      if (seen.has(d.id)) return false;
      seen.add(d.id);
      return true;
    });
  }
  if (role === "source") return _queue.list({ sourceAgentId: agentId, orgId, limit });
  return _queue.list({ targetAgentId: agentId, orgId, limit });
}

export async function listDelegationsByParentAction(
  parentActionId: string,
  orgId:          string,
): Promise<AgentDelegation[]> {
  return _queue.list({ parentActionId, orgId });
}

export async function listBlockedDelegations(
  orgId: string,
): Promise<AgentDelegation[]> {
  return _queue.list({ orgId, status: "blocked" });
}

export async function delegationExists(
  sourceAgentId:  string,
  targetAgentId:  string,
  reason:         string,
  parentActionId: string | null,
): Promise<boolean> {
  return _queue.exists(sourceAgentId, targetAgentId, reason, parentActionId);
}

// ── Report builder ────────────────────────────────────────────────────────────

export async function buildDelegationReport(orgId: string): Promise<DelegationReport> {
  const all = await _queue.list({ orgId, limit: 500 });

  const pending    = all.filter(d => d.status === "pending_approval" || d.status === "proposed");
  const blocked    = all.filter(d => d.status === "blocked");
  const completed  = all.filter(d => d.status === "completed");
  const inProgress = all.filter(d => d.status === "in_progress");
  const failed     = all.filter(d => d.status === "failed");

  // Group by status
  const byStatus: Record<string, AgentDelegation[]> = {};
  for (const d of all) {
    const bucket = byStatus[d.status] ?? [];
    bucket.push(d);
    byStatus[d.status] = bucket;
  }

  // Group by agent
  const byAgent: Record<string, { source: AgentDelegation[]; target: AgentDelegation[] }> = {};
  for (const d of all) {
    if (!byAgent[d.sourceAgentId]) byAgent[d.sourceAgentId] = { source: [], target: [] };
    if (!byAgent[d.targetAgentId]) byAgent[d.targetAgentId] = { source: [], target: [] };
    byAgent[d.sourceAgentId]!.source.push(d);
    byAgent[d.targetAgentId]!.target.push(d);
  }

  // Count by status for summary
  const statusCounts = {} as Record<DelegationStatus, number>;
  for (const d of all) {
    statusCounts[d.status] = (statusCounts[d.status] ?? 0) + 1;
  }

  // By source/target agent counts
  const bySourceAgent: Record<string, number> = {};
  const byTargetAgent: Record<string, number> = {};
  for (const d of all) {
    bySourceAgent[d.sourceAgentId] = (bySourceAgent[d.sourceAgentId] ?? 0) + 1;
    byTargetAgent[d.targetAgentId] = (byTargetAgent[d.targetAgentId] ?? 0) + 1;
  }

  // Longest chain: delegations that chain via causationId
  function chainLength(id: string, visited = new Set<string>()): number {
    if (visited.has(id)) return 0;
    visited.add(id);
    const children = all.filter(d => d.causationId === id);
    if (children.length === 0) return 1;
    return 1 + Math.max(...children.map(c => chainLength(c.id, visited)));
  }
  const roots = all.filter(d => !d.causationId);
  const longestChainLength = roots.length > 0
    ? Math.max(...roots.map(r => chainLength(r.id)))
    : 0;

  const summary: DelegationSummary = {
    total:              all.length,
    pending:            pending.length,
    blocked:            blocked.length,
    completed:          completed.length,
    failed:             failed.length,
    inProgress:         inProgress.length,
    byStatus:           statusCounts,
    bySourceAgent,
    byTargetAgent,
    longestChainLength,
  };

  return { delegations: all, pending, blocked, completed, byAgent, byStatus, summary };
}
