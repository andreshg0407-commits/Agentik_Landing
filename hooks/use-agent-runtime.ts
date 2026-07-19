"use client";

/**
 * hooks/use-agent-runtime.ts
 *
 * Agentik Agent Runtime — Client hook for Approval Center.
 *
 * Reads from GET /api/orgs/[orgSlug]/agent/actions and derives:
 *   - envelopes (sorted, filterable)
 *   - metrics (pending, approved today, etc.)
 *   - timeline events (derived from envelope history)
 *   - agent load snapshots (per agent)
 *
 * No heavy logic here — derivation lives in lib/agent-runtime/action-envelope.ts.
 *
 * Sprint: AGENTIK-AGENT-APPROVAL-CENTER-01
 */

import { useState, useEffect, useCallback } from "react";
import type {
  ActionEnvelope,
  RuntimeTimelineEvent,
  AgentLoadSnapshot,
  RuntimeMetrics,
} from "@/lib/agent-runtime/action-envelope";
import {
  deriveTimeline,
  deriveAgentLoad,
  deriveMetrics,
} from "@/lib/agent-runtime/action-envelope";

// ── Hook state ────────────────────────────────────────────────────────────────

export interface AgentRuntimeState {
  envelopes:    ActionEnvelope[];
  timeline:     RuntimeTimelineEvent[];
  agentLoad:    AgentLoadSnapshot[];
  metrics:      RuntimeMetrics;
  loading:      boolean;
  error:        string | null;
  refresh:      () => void;
  lastFetchAt:  string | null;
}

const EMPTY_METRICS: RuntimeMetrics = {
  total:           0,
  pendingApproval: 0,
  approvedToday:   0,
  rejectedToday:   0,
  executing:       0,
  failed:          0,
  avgApprovalMs:   null,
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAgentRuntime(orgSlug: string): AgentRuntimeState {
  const [envelopes, setEnvelopes] = useState<ActionEnvelope[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [tick,      setTick]      = useState(0);

  const refresh = useCallback(() => setTick(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/orgs/${orgSlug}/agent/actions?limit=100`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: { envelopes: ActionEnvelope[] }) => {
        if (!cancelled) {
          setEnvelopes(data.envelopes ?? []);
          setFetchedAt(new Date().toISOString());
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [orgSlug, tick]);

  const timeline  = deriveTimeline(envelopes);
  const agentLoad = deriveAgentLoad(envelopes);
  const metrics   = envelopes.length > 0 ? deriveMetrics(envelopes) : EMPTY_METRICS;

  return {
    envelopes,
    timeline,
    agentLoad,
    metrics,
    loading,
    error,
    refresh,
    lastFetchAt: fetchedAt,
  };
}
