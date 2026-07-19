/**
 * lib/agent-runtime/execution-graph/execution-graph-store.ts
 *
 * Agentik Execution Graph — On-Demand Store
 *
 * Builds the ExecutionGraph on demand from all runtime sources.
 * NOT a persistent store — this is a materialized view.
 * No data is duplicated; all sources remain authoritative.
 *
 * Sources:
 *   ActionEnvelopes   ← Prisma ActionTask
 *   ExecutionSessions ← execution-session-store
 *   Delegations       ← delegation-queue
 *   Plans             ← planning-engine (built from sources)
 *   Events            ← event-store
 *   MemoryNodes       ← runtime-memory-store
 *
 * Sprint: AGENTIK-AGENT-RUNTIME-EXECUTION-GRAPH-01
 */

import { prisma }                        from "@/lib/prisma";
import { envelopeFromTask }              from "@/lib/agent-runtime/action-envelope";
import type { ActionEnvelope }           from "@/lib/agent-runtime/action-envelope";
import { queryExecutionSessions }        from "@/lib/agent-runtime/execution-session-store";
import { queryRuntimeEvents }            from "@/lib/agent-runtime/event-store";
import { listDelegations }               from "@/lib/agent-orchestration/delegation-queue";
import { buildOperationalPlans }         from "@/lib/agent-planning/planning-engine";
import { buildDependencyGraph }          from "@/lib/agent-planning/dependency-graph";
import { queryMemory }                   from "@/lib/agent-memory/runtime-memory-store";
import { buildExecutionGraph }           from "./execution-graph-builder";
import { validateExecutionGraph }        from "./execution-graph-consistency";
import { explainRootCause }              from "./execution-graph-explainer";
import { getConnectedSubgraph }          from "./execution-graph-query";
import type {
  ExecutionGraph,
  ExecutionGraphIssue,
  GraphBuildOptions,
} from "./execution-graph-types";
import type { GraphExplanation }         from "./execution-graph-explainer";

// ── Public API ────────────────────────────────────────────────────────────────

export interface ExecutionGraphResult {
  graph:        ExecutionGraph;
  issues:       ExecutionGraphIssue[];
  explanations: { rootCause: GraphExplanation };
  diagnostics:  ExecutionGraphDiagnostics;
  generatedAt:  string;
}

export interface ExecutionGraphDiagnostics {
  nodeCount:        number;
  edgeCount:        number;
  issueCount:       number;
  issueBySeverity:  Record<string, number>;
  issueByType:      Record<string, number>;
  sourceNodeCounts: {
    actions:     number;
    executions:  number;
    attempts:    number;
    delegations: number;
    plans:       number;
    events:      number;
    memoryNodes: number;
  };
}

/**
 * Build the execution graph for an org, with optional focused subgraph.
 */
export async function getExecutionGraphForOrg(
  opts: GraphBuildOptions,
): Promise<ExecutionGraphResult> {
  const { envelopes, sessions, delegations, plans, events, memoryNodes } =
    await fetchAllSources(opts);

  let graph = buildExecutionGraph({
    orgId:       opts.orgId,
    envelopes,
    sessions,
    delegations,
    plans,
    events:      opts.includeEvents !== false ? events    : [],
    memoryNodes: opts.includeMemory === true   ? memoryNodes : [],
  });

  // Apply subgraph filter if a specific anchor is requested
  const anchorRefId =
    opts.actionId     ??
    opts.executionId  ??
    opts.delegationId ??
    opts.planId       ??
    null;

  if (anchorRefId) {
    // Find the node for this refId
    const anchorNode = Object.values(graph.nodes).find(n => n.refId === anchorRefId);
    if (anchorNode) {
      graph = getConnectedSubgraph(graph, anchorNode.id, opts.depth ?? 8);
    }
  }

  const issues       = validateExecutionGraph(graph);
  const rootCause    = explainRootCause(graph);
  const diagnostics  = buildDiagnostics(graph, issues, { envelopes, sessions, delegations, plans, events, memoryNodes });

  return {
    graph,
    issues,
    explanations: { rootCause },
    diagnostics,
    generatedAt: graph.generatedAt,
  };
}

/**
 * Build a focused graph for a single action.
 */
export async function getExecutionGraphForAction(
  orgId:    string,
  actionId: string,
  depth:    number = 8,
): Promise<ExecutionGraphResult> {
  return getExecutionGraphForOrg({ orgId, actionId, depth });
}

/**
 * Build a focused graph for all sessions sharing a correlationId.
 */
export async function getExecutionGraphForCorrelation(
  orgId:         string,
  correlationId: string,
  depth:         number = 8,
): Promise<ExecutionGraphResult> {
  return getExecutionGraphForOrg({ orgId, correlationId, depth });
}

/**
 * Diagnostics-only endpoint — no full graph returned.
 */
export async function getExecutionGraphDiagnostics(
  orgId: string,
): Promise<ExecutionGraphDiagnostics> {
  const result = await getExecutionGraphForOrg({ orgId });
  return result.diagnostics;
}

// ── Source fetcher ────────────────────────────────────────────────────────────

async function fetchAllSources(opts: GraphBuildOptions): Promise<{
  envelopes:   ActionEnvelope[];
  sessions:    Awaited<ReturnType<typeof queryExecutionSessions>>;
  delegations: Awaited<ReturnType<typeof listDelegations>>;
  plans:       ReturnType<typeof buildOperationalPlans>;
  events:      Awaited<ReturnType<typeof queryRuntimeEvents>>;
  memoryNodes: Awaited<ReturnType<typeof queryMemory>>;
}> {
  const [tasks, sessions, delegations, events, memoryNodes] = await Promise.all([
    prisma.actionTask.findMany({
      where:   { organizationId: opts.orgId },
      orderBy: { createdAt: "desc" },
      take:    200,
      select:  {
        id: true, title: true, description: true, actionType: true,
        status: true, priority: true, sourceModule: true,
        createdAt: true, updatedAt: true, payloadJson: true,
      },
    }),
    queryExecutionSessions({ orgId: opts.orgId, limit: 200 }),
    listDelegations({ orgId: opts.orgId }),
    opts.includeEvents !== false
      ? queryRuntimeEvents({ orgId: opts.orgId, limit: 300 })
      : Promise.resolve([]),
    opts.includeMemory === true
      ? queryMemory({ orgId: opts.orgId })
      : Promise.resolve([]),
  ]);

  const envelopes = tasks.map(t =>
    envelopeFromTask({
      ...t,
      createdAt:   t.createdAt.toISOString(),
      updatedAt:   t.updatedAt.toISOString(),
      payloadJson: t.payloadJson as Record<string, unknown> | null,
    }),
  );

  const depGraph = buildDependencyGraph(envelopes, delegations, memoryNodes, []);
  const plans    = buildOperationalPlans(opts.orgId, envelopes, delegations, memoryNodes, depGraph);

  return { envelopes, sessions, delegations, plans, events, memoryNodes };
}

// ── Diagnostics builder ───────────────────────────────────────────────────────

function buildDiagnostics(
  graph:   ExecutionGraph,
  issues:  ExecutionGraphIssue[],
  sources: {
    envelopes:   ActionEnvelope[];
    sessions:    unknown[];
    delegations: unknown[];
    plans:       unknown[];
    events:      unknown[];
    memoryNodes: unknown[];
  },
): ExecutionGraphDiagnostics {
  const nodes = Object.values(graph.nodes);

  const issueBySeverity: Record<string, number> = {};
  const issueByType:     Record<string, number> = {};
  for (const issue of issues) {
    issueBySeverity[issue.severity]  = (issueBySeverity[issue.severity]  ?? 0) + 1;
    issueByType    [issue.issueType] = (issueByType    [issue.issueType] ?? 0) + 1;
  }

  return {
    nodeCount:       nodes.length,
    edgeCount:       graph.edges.length,
    issueCount:      issues.length,
    issueBySeverity,
    issueByType,
    sourceNodeCounts: {
      actions:     sources.envelopes.length,
      executions:  nodes.filter(n => n.nodeType === "execution_session").length,
      attempts:    nodes.filter(n => n.nodeType === "execution_attempt").length,
      delegations: sources.delegations.length,
      plans:       sources.plans.length,
      events:      sources.events.length,
      memoryNodes: sources.memoryNodes.length,
    },
  };
}
