/**
 * lib/agent-runtime/action-queue.ts
 *
 * Agentik Agent Runtime — Action Queue Contract
 *
 * Framework-agnostic contract for the agent action queue.
 * V1: In-memory dev stub. Scoped per process — resets on restart.
 * V2: Replace with Prisma-backed implementation (no interface changes).
 *
 * Actions flow:
 *   Agent proposes → enqueueAgentAction (suggested)
 *   Rail surfaces → updateAgentActionStatus (pending_approval)
 *   User approves → updateAgentActionStatus (approved)
 *   Executor runs → updateAgentActionStatus (executing → executed | failed)
 *
 * Sprint: AGENTIK-AGENT-ACTION-LIFECYCLE-01
 */

import type { AgentAction, ActionStatus, AgentRuntimeId, AgentDomain } from "./agent-types";

// ── Queue filter ──────────────────────────────────────────────────────────────

export interface AgentActionFilter {
  organizationId?: string;
  agentId?:        AgentRuntimeId;
  domain?:         AgentDomain;
  status?:         ActionStatus | ActionStatus[];
  moduleKey?:      string;
  limit?:          number;
}

// ── Queue adapter interface ───────────────────────────────────────────────────
//
// Implement this interface to swap the backing store.
// The in-memory stub below satisfies V1. The Prisma adapter will satisfy V2.

export interface AgentActionQueueAdapter {
  enqueue(action: AgentAction): Promise<AgentAction>;
  get(actionId: string, organizationId: string): Promise<AgentAction | null>;
  list(filter: AgentActionFilter): Promise<AgentAction[]>;
  update(actionId: string, organizationId: string, next: AgentAction): Promise<AgentAction>;
}

// ── In-memory stub (V1 / development) ────────────────────────────────────────

class InMemoryActionQueue implements AgentActionQueueAdapter {
  private readonly store = new Map<string, AgentAction>();

  async enqueue(action: AgentAction): Promise<AgentAction> {
    this.store.set(action.id, action);
    return action;
  }

  async get(actionId: string, _organizationId: string): Promise<AgentAction | null> {
    return this.store.get(actionId) ?? null;
  }

  async list(filter: AgentActionFilter): Promise<AgentAction[]> {
    let results = Array.from(this.store.values());

    if (filter.organizationId) {
      results = results.filter(a => (a.payload.organizationId as string | undefined) === filter.organizationId);
    }
    if (filter.agentId) {
      results = results.filter(a => a.sourceAgentId === filter.agentId);
    }
    if (filter.domain) {
      results = results.filter(a => a.domain === filter.domain);
    }
    if (filter.moduleKey) {
      results = results.filter(a => a.moduleKey === filter.moduleKey);
    }
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      results = results.filter(a => statuses.includes(a.status));
    }

    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filter.limit ? results.slice(0, filter.limit) : results;
  }

  async update(actionId: string, _organizationId: string, next: AgentAction): Promise<AgentAction> {
    if (!this.store.has(actionId)) {
      throw new Error(`AgentAction ${actionId} not found in queue`);
    }
    this.store.set(actionId, next);
    return next;
  }
}

// ── Singleton adapter — swap for Prisma adapter in production ─────────────────
//
// PERSISTENCE NOTE:
//   The in-memory store is process-scoped and non-durable.
//   V2: inject a PrismaActionQueueAdapter that persists AgentActions to DB.
//   The Prisma model should mirror AgentAction fields (see lib/agent-runtime/agent-types.ts).
//   No interface changes required — only swap the adapter below.

let _adapter: AgentActionQueueAdapter = new InMemoryActionQueue();

export function setActionQueueAdapter(adapter: AgentActionQueueAdapter): void {
  _adapter = adapter;
}

// ── Public functions ──────────────────────────────────────────────────────────

/** Enqueue a newly created AgentAction. Returns the persisted action. */
export async function enqueueAgentAction(action: AgentAction): Promise<AgentAction> {
  return _adapter.enqueue(action);
}

/** Retrieve a single action by ID (org-scoped). */
export async function getAgentAction(
  actionId:       string,
  organizationId: string,
): Promise<AgentAction | null> {
  return _adapter.get(actionId, organizationId);
}

/**
 * List actions awaiting user approval for an org.
 * Ordered by createdAt desc.
 */
export async function listPendingAgentActions(
  organizationId: string,
  filter?: Omit<AgentActionFilter, "status" | "organizationId">,
): Promise<AgentAction[]> {
  return _adapter.list({
    ...filter,
    organizationId,
    status: "pending_approval",
  });
}

/** Persist a status update to the queue. Returns the updated action. */
export async function updateAgentActionStatus(
  actionId:       string,
  organizationId: string,
  next:           AgentAction,
): Promise<AgentAction> {
  return _adapter.update(actionId, organizationId, next);
}
