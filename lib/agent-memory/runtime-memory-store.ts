/**
 * lib/agent-memory/runtime-memory-store.ts
 *
 * Agentik Agent Runtime — Operational Memory Store
 *
 * V1: In-memory process-scoped singleton.
 *     Suitable for development and same-process server runtime.
 *     Resets on process restart (expected V1 behavior).
 *
 * V2 migration path:
 *   Replace MemoryStoreAdapter with PrismaMemoryStoreAdapter.
 *   No changes needed in action-context.ts or memory-query.ts.
 *
 * V3 migration path:
 *   Inject GraphDBMemoryStoreAdapter (Neo4j / Dgraph / Memgraph).
 *   Same interface.
 *
 * Sprint: AGENTIK-AGENT-CONTEXT-MEMORY-GRAPH-01
 */

import type {
  RuntimeMemoryNode,
  RuntimeMemoryEdge,
  AgentObservation,
  MemoryDiagnostics,
} from "./runtime-memory-types";

// ── ID generators ─────────────────────────────────────────────────────────────

let _nodeSeq = 0;
let _edgeSeq = 0;
let _obsSeq  = 0;

export function memNodeId():  string { return `mn_${Date.now()}_${++_nodeSeq}`; }
export function memEdgeId():  string { return `me_${Date.now()}_${++_edgeSeq}`; }
export function memObsId():   string { return `mo_${Date.now()}_${++_obsSeq}`; }

// ── Store adapter interface ────────────────────────────────────────────────────

export interface MemoryStoreAdapter {
  appendNode(node: RuntimeMemoryNode): Promise<RuntimeMemoryNode>;
  appendEdge(edge: RuntimeMemoryEdge): Promise<RuntimeMemoryEdge>;
  appendObservation(obs: AgentObservation): Promise<AgentObservation>;

  getNode(nodeId: string): Promise<RuntimeMemoryNode | null>;
  getEdge(edgeId: string): Promise<RuntimeMemoryEdge | null>;

  queryNodes(filter: MemoryNodeFilter): Promise<RuntimeMemoryNode[]>;
  queryEdges(filter: MemoryEdgeFilter): Promise<RuntimeMemoryEdge[]>;
  queryObservations(filter: ObservationFilter): Promise<AgentObservation[]>;

  diagnostics(orgId: string): Promise<MemoryDiagnostics>;
}

// ── Filter types ──────────────────────────────────────────────────────────────

export interface MemoryNodeFilter {
  orgId?:       string;
  agentId?:     string;
  moduleId?:    string;
  actionId?:    string;
  nodeType?:    string | string[];
  domain?:      string;
  severity?:    string | string[];
  since?:       string; // ISO — only nodes after this timestamp
  limit?:       number;
}

export interface MemoryEdgeFilter {
  sourceId?:     string;
  targetId?:     string;
  relationType?: string | string[];
  since?:        string;
  limit?:        number;
}

export interface ObservationFilter {
  orgId?:    string;
  agentId?:  string;
  moduleId?: string;
  since?:    string;
  limit?:    number;
}

// ── In-memory adapter (V1) ────────────────────────────────────────────────────

class InMemoryMemoryStore implements MemoryStoreAdapter {
  private readonly nodes        = new Map<string, RuntimeMemoryNode>();
  private readonly edges        = new Map<string, RuntimeMemoryEdge>();
  private readonly observations = new Map<string, AgentObservation>();

  async appendNode(node: RuntimeMemoryNode): Promise<RuntimeMemoryNode> {
    this.nodes.set(node.id, node);
    return node;
  }

  async appendEdge(edge: RuntimeMemoryEdge): Promise<RuntimeMemoryEdge> {
    this.edges.set(edge.id, edge);
    // Attach edge ID to connected nodes
    const src = this.nodes.get(edge.sourceId);
    if (src && !src.relatedEdges.includes(edge.id)) {
      src.relatedEdges = [...src.relatedEdges, edge.id];
    }
    const tgt = this.nodes.get(edge.targetId);
    if (tgt && !tgt.relatedEdges.includes(edge.id)) {
      tgt.relatedEdges = [...tgt.relatedEdges, edge.id];
    }
    return edge;
  }

  async appendObservation(obs: AgentObservation): Promise<AgentObservation> {
    this.observations.set(obs.id, obs);
    return obs;
  }

  async getNode(nodeId: string): Promise<RuntimeMemoryNode | null> {
    return this.nodes.get(nodeId) ?? null;
  }

  async getEdge(edgeId: string): Promise<RuntimeMemoryEdge | null> {
    return this.edges.get(edgeId) ?? null;
  }

  async queryNodes(filter: MemoryNodeFilter): Promise<RuntimeMemoryNode[]> {
    let results = Array.from(this.nodes.values());

    if (filter.orgId)    results = results.filter(n => n.orgId    === filter.orgId);
    if (filter.agentId)  results = results.filter(n => n.agentId  === filter.agentId);
    if (filter.moduleId) results = results.filter(n => n.moduleId === filter.moduleId);
    if (filter.actionId) results = results.filter(n => n.actionId === filter.actionId);
    if (filter.domain)   results = results.filter(n => n.domain   === filter.domain);

    if (filter.nodeType) {
      const types = Array.isArray(filter.nodeType) ? filter.nodeType : [filter.nodeType];
      results = results.filter(n => types.includes(n.nodeType));
    }
    if (filter.severity) {
      const sevs = Array.isArray(filter.severity) ? filter.severity : [filter.severity];
      results = results.filter(n => sevs.includes(n.severity));
    }
    if (filter.since) {
      results = results.filter(n => n.timestamp >= filter.since!);
    }

    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return filter.limit ? results.slice(0, filter.limit) : results;
  }

  async queryEdges(filter: MemoryEdgeFilter): Promise<RuntimeMemoryEdge[]> {
    let results = Array.from(this.edges.values());

    if (filter.sourceId) results = results.filter(e => e.sourceId === filter.sourceId);
    if (filter.targetId) results = results.filter(e => e.targetId === filter.targetId);
    if (filter.since)    results = results.filter(e => e.createdAt >= filter.since!);

    if (filter.relationType) {
      const types = Array.isArray(filter.relationType) ? filter.relationType : [filter.relationType];
      results = results.filter(e => types.includes(e.relationType));
    }

    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filter.limit ? results.slice(0, filter.limit) : results;
  }

  async queryObservations(filter: ObservationFilter): Promise<AgentObservation[]> {
    let results = Array.from(this.observations.values());

    if (filter.orgId)    results = results.filter(o => o.orgId    === filter.orgId);
    if (filter.agentId)  results = results.filter(o => o.agentId  === filter.agentId);
    if (filter.moduleId) results = results.filter(o => o.moduleId === filter.moduleId);
    if (filter.since)    results = results.filter(o => o.timestamp >= filter.since!);

    results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return filter.limit ? results.slice(0, filter.limit) : results;
  }

  async diagnostics(orgId: string): Promise<MemoryDiagnostics> {
    const orgNodes = Array.from(this.nodes.values()).filter(n => n.orgId === orgId);
    const orgEdges = Array.from(this.edges.values());
    const orgObs   = Array.from(this.observations.values()).filter(o => o.orgId === orgId);

    // nodes by type
    const nodesByType: Record<string, number> = {};
    for (const n of orgNodes) {
      nodesByType[n.nodeType] = (nodesByType[n.nodeType] ?? 0) + 1;
    }

    // nodes by agent
    const nodesByAgent: Record<string, number> = {};
    for (const n of orgNodes) {
      nodesByAgent[n.agentId] = (nodesByAgent[n.agentId] ?? 0) + 1;
    }

    // top modules
    const moduleCounts: Record<string, number> = {};
    for (const n of orgNodes) {
      moduleCounts[n.moduleId] = (moduleCounts[n.moduleId] ?? 0) + 1;
    }
    const topModules = Object.entries(moduleCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([moduleId, count]) => ({ moduleId, count }));

    // orphan actions (action nodes with no edges)
    const orphans = orgNodes.filter(n =>
      n.actionId !== null && n.relatedEdges.length === 0,
    );

    // chain length estimation (BFS from each node)
    const nodeMap = this.nodes;
    const edgeMap = this.edges;
    function chainLength(startId: string, visited = new Set<string>()): number {
      if (visited.has(startId)) return 0;
      visited.add(startId);
      const node = nodeMap.get(startId);
      if (!node) return 1;
      let max = 0;
      for (const edgeId of node.relatedEdges) {
        const edge = edgeMap.get(edgeId);
        if (!edge) continue;
        const nextId = edge.sourceId === startId ? edge.targetId : edge.sourceId;
        max = Math.max(max, chainLength(nextId, visited));
      }
      return 1 + max;
    }
    let longest = 0;
    for (const n of orgNodes) {
      if (n.relatedEdges.length > 0) {
        longest = Math.max(longest, chainLength(n.id));
      }
    }

    return {
      totalNodes:         orgNodes.length,
      totalEdges:         orgEdges.length,
      totalObservations:  orgObs.length,
      nodesByType,
      nodesByAgent,
      topModulesAffected: topModules,
      recentObservations: orgObs.slice(0, 5),
      orphanActionCount:  orphans.length,
      longestChainLength: longest,
      storeType:          "InMemoryMemoryStore (V1)",
    };
  }
}

// ── Singleton + adapter swap ──────────────────────────────────────────────────

let _store: MemoryStoreAdapter = new InMemoryMemoryStore();

export function setMemoryStoreAdapter(adapter: MemoryStoreAdapter): void {
  _store = adapter;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function appendMemory(node: RuntimeMemoryNode): Promise<RuntimeMemoryNode> {
  return _store.appendNode(node);
}

export async function appendMemoryEdge(edge: RuntimeMemoryEdge): Promise<RuntimeMemoryEdge> {
  return _store.appendEdge(edge);
}

export async function appendObservation(obs: AgentObservation): Promise<AgentObservation> {
  return _store.appendObservation(obs);
}

export async function getMemoryNode(nodeId: string): Promise<RuntimeMemoryNode | null> {
  return _store.getNode(nodeId);
}

export async function queryMemory(filter: MemoryNodeFilter): Promise<RuntimeMemoryNode[]> {
  return _store.queryNodes(filter);
}

export async function queryByAction(actionId: string, orgId?: string): Promise<RuntimeMemoryNode[]> {
  return _store.queryNodes({ actionId, orgId, limit: 50 });
}

export async function queryByAgent(agentId: string, orgId?: string, limit = 20): Promise<RuntimeMemoryNode[]> {
  return _store.queryNodes({ agentId, orgId, limit });
}

export async function queryByModule(moduleId: string, orgId?: string, limit = 20): Promise<RuntimeMemoryNode[]> {
  return _store.queryNodes({ moduleId, orgId, limit });
}

export async function queryRelatedActions(actionId: string): Promise<RuntimeMemoryNode[]> {
  const nodes = await _store.queryNodes({ actionId });
  if (nodes.length === 0) return [];
  const edgeIds = nodes.flatMap(n => n.relatedEdges);
  const edges = await Promise.all(edgeIds.map(id => _store.getEdge(id)));
  const relatedNodeIds = new Set<string>();
  for (const edge of edges) {
    if (!edge) continue;
    relatedNodeIds.add(edge.sourceId);
    relatedNodeIds.add(edge.targetId);
  }
  const related = await Promise.all(
    Array.from(relatedNodeIds).map(id => _store.getNode(id)),
  );
  return related.filter((n): n is RuntimeMemoryNode => n !== null);
}

export async function queryEdges(filter: MemoryEdgeFilter): Promise<RuntimeMemoryEdge[]> {
  return _store.queryEdges(filter);
}

export async function queryObservations(filter: ObservationFilter): Promise<AgentObservation[]> {
  return _store.queryObservations(filter);
}

export async function getMemoryDiagnostics(orgId: string): Promise<MemoryDiagnostics> {
  return _store.diagnostics(orgId);
}
