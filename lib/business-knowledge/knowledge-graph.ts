/**
 * knowledge-graph.ts
 *
 * BUSINESS-KNOWLEDGE-GRAPH-01
 * The Business Knowledge Graph — central intelligence structure.
 *
 * Provides:
 * - IKnowledgeGraph: the contract all consumers use
 * - InMemoryKnowledgeGraph: initial implementation for validation
 *
 * No Prisma. No React. No external graph DB.
 */

import type { BusinessEntityType, KnowledgeRelationType } from "./knowledge-types";
import type { KnowledgeNode } from "./knowledge-node";
import type { KnowledgeEdge } from "./knowledge-edge";
import type { KnowledgeQuery, KnowledgeQueryResult } from "./knowledge-query";
import type { KnowledgePath } from "./knowledge-path";
import type { KnowledgeImpact, AffectedEntity } from "./knowledge-impact";
import type { KnowledgeContext } from "./knowledge-context";
import { buildPath, computePathConfidence } from "./knowledge-path";
import { buildImpact } from "./knowledge-impact";
import { buildContext } from "./knowledge-context";

// -- Graph Snapshot --------------------------------------------------------

/** A complete snapshot of the knowledge graph state. */
export interface KnowledgeGraphSnapshot {
  /** All nodes in the graph. */
  nodes: KnowledgeNode[];
  /** All edges in the graph. */
  edges: KnowledgeEdge[];
  /** ISO timestamp when the snapshot was taken. */
  capturedAt: string;
  /** Number of nodes. */
  nodeCount: number;
  /** Number of edges. */
  edgeCount: number;
  /** Organization ID. */
  organizationId: string;
}

// -- Knowledge Graph Contract ---------------------------------------------

/**
 * The central Knowledge Graph API.
 *
 * All consumers (David, Copilot, Impact Analysis, Reports, Rule Engine)
 * use this interface to query business knowledge.
 *
 * No module should traverse other modules directly.
 * All inter-entity reasoning goes through the Knowledge Graph.
 */
export interface IKnowledgeGraph {
  // -- Mutation --
  addNode(node: KnowledgeNode): void;
  addEdge(edge: KnowledgeEdge): void;
  removeNode(nodeId: string): void;
  removeEdge(edgeId: string): void;

  // -- Lookup --
  getNode(nodeId: string): KnowledgeNode | undefined;
  getNodeByEntity(entityId: string, entityType: BusinessEntityType): KnowledgeNode | undefined;
  getEdge(edgeId: string): KnowledgeEdge | undefined;
  getEdgesFrom(nodeId: string): KnowledgeEdge[];
  getEdgesTo(nodeId: string): KnowledgeEdge[];
  getNeighbors(nodeId: string, direction?: "outgoing" | "incoming" | "both"): KnowledgeNode[];

  // -- Query --
  query(q: KnowledgeQuery): KnowledgeQueryResult;

  // -- Paths --
  findPaths(fromNodeId: string, toNodeId: string, maxDepth?: number): KnowledgePath[];

  // -- Impact --
  analyzeImpact(nodeId: string, depth?: number): KnowledgeImpact;

  // -- Context --
  buildContext(nodeId: string): KnowledgeContext;

  // -- Snapshot --
  snapshot(organizationId: string): KnowledgeGraphSnapshot;

  // -- Stats --
  nodeCount(): number;
  edgeCount(): number;
}

// -- In-Memory Implementation ---------------------------------------------

/**
 * In-memory implementation of IKnowledgeGraph.
 *
 * Sufficient for validating types, paths, impact analysis, and context.
 * NOT designed for production scale — future sprints will add persistence.
 */
export class InMemoryKnowledgeGraph implements IKnowledgeGraph {
  private nodes = new Map<string, KnowledgeNode>();
  private edges = new Map<string, KnowledgeEdge>();
  private entityIndex = new Map<string, string>(); // "entityId:entityType" → nodeId

  // -- Mutation --

  addNode(node: KnowledgeNode): void {
    this.nodes.set(node.nodeId, node);
    this.entityIndex.set(`${node.entityId}:${node.entityType}`, node.nodeId);
  }

  addEdge(edge: KnowledgeEdge): void {
    this.edges.set(edge.edgeId, edge);
  }

  removeNode(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.entityIndex.delete(`${node.entityId}:${node.entityType}`);
      this.nodes.delete(nodeId);
      // Remove all connected edges
      for (const [id, edge] of this.edges) {
        if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) {
          this.edges.delete(id);
        }
      }
    }
  }

  removeEdge(edgeId: string): void {
    this.edges.delete(edgeId);
  }

  // -- Lookup --

  getNode(nodeId: string): KnowledgeNode | undefined {
    return this.nodes.get(nodeId);
  }

  getNodeByEntity(entityId: string, entityType: BusinessEntityType): KnowledgeNode | undefined {
    const nodeId = this.entityIndex.get(`${entityId}:${entityType}`);
    return nodeId ? this.nodes.get(nodeId) : undefined;
  }

  getEdge(edgeId: string): KnowledgeEdge | undefined {
    return this.edges.get(edgeId);
  }

  getEdgesFrom(nodeId: string): KnowledgeEdge[] {
    const result: KnowledgeEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.sourceNodeId === nodeId) result.push(edge);
    }
    return result;
  }

  getEdgesTo(nodeId: string): KnowledgeEdge[] {
    const result: KnowledgeEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.targetNodeId === nodeId) result.push(edge);
    }
    return result;
  }

  getNeighbors(nodeId: string, direction: "outgoing" | "incoming" | "both" = "both"): KnowledgeNode[] {
    const neighborIds = new Set<string>();

    if (direction === "outgoing" || direction === "both") {
      for (const edge of this.getEdgesFrom(nodeId)) {
        neighborIds.add(edge.targetNodeId);
      }
    }
    if (direction === "incoming" || direction === "both") {
      for (const edge of this.getEdgesTo(nodeId)) {
        neighborIds.add(edge.sourceNodeId);
      }
    }

    const result: KnowledgeNode[] = [];
    for (const nid of neighborIds) {
      const node = this.nodes.get(nid);
      if (node) result.push(node);
    }
    return result;
  }

  // -- Query --

  query(q: KnowledgeQuery): KnowledgeQueryResult {
    const start = Date.now();
    let matchedNodes: KnowledgeNode[] = [];
    const matchedEdges: KnowledgeEdge[] = [];

    if (q.entityId) {
      // Start from a specific entity
      const startNode = this.findNodeByEntityId(q.entityId, q.organizationId);
      if (startNode) {
        const visited = new Set<string>();
        this.traverse(startNode.nodeId, q.depth ?? 1, q, visited, matchedNodes, matchedEdges);
      }
    } else {
      // Scan all nodes
      for (const node of this.nodes.values()) {
        if (this.matchesNodeFilter(node, q)) {
          matchedNodes.push(node);
        }
      }
    }

    // Apply filters
    if (!q.includeInactive) {
      matchedNodes = matchedNodes.filter(n => n.active);
    }

    const totalMatches = matchedNodes.length;
    const maxResults = q.maxResults ?? 100;
    const truncated = matchedNodes.length > maxResults;
    matchedNodes = matchedNodes.slice(0, maxResults);

    return {
      nodes: matchedNodes,
      edges: matchedEdges,
      totalMatches,
      truncated,
      executionMs: Date.now() - start,
    };
  }

  // -- Paths --

  findPaths(fromNodeId: string, toNodeId: string, maxDepth: number = 4): KnowledgePath[] {
    const paths: KnowledgePath[] = [];
    const visited = new Set<string>();

    const dfs = (current: string, target: string, pathNodes: KnowledgeNode[], pathEdges: KnowledgeEdge[], depth: number) => {
      if (depth > maxDepth) return;
      if (current === target && pathNodes.length > 1) {
        paths.push(buildPath([...pathNodes], [...pathEdges]));
        return;
      }

      visited.add(current);
      for (const edge of this.getEdgesFrom(current)) {
        if (!visited.has(edge.targetNodeId)) {
          const targetNode = this.nodes.get(edge.targetNodeId);
          if (targetNode) {
            pathNodes.push(targetNode);
            pathEdges.push(edge);
            dfs(edge.targetNodeId, target, pathNodes, pathEdges, depth + 1);
            pathNodes.pop();
            pathEdges.pop();
          }
        }
      }
      visited.delete(current);
    };

    const startNode = this.nodes.get(fromNodeId);
    if (startNode) {
      dfs(fromNodeId, toNodeId, [startNode], [], 0);
    }

    // Sort by confidence descending
    return paths.sort((a, b) => b.confidence - a.confidence);
  }

  // -- Impact --

  analyzeImpact(nodeId: string, depth: number = 3): KnowledgeImpact {
    const sourceNode = this.nodes.get(nodeId);
    if (!sourceNode) {
      return buildImpact({
        sourceEntityId: "",
        sourceEntityType: "product",
        sourceLabel: "Desconocido",
        impactType: "operational_degradation",
        severity: "info",
        affectedEntities: [],
        explanation: "Nodo no encontrado en el grafo",
      });
    }

    const affected: AffectedEntity[] = [];
    const visited = new Set<string>();
    visited.add(nodeId);

    const collect = (currentId: string, currentDepth: number) => {
      if (currentDepth > depth) return;
      for (const edge of this.getEdgesFrom(currentId)) {
        if (!visited.has(edge.targetNodeId)) {
          visited.add(edge.targetNodeId);
          const target = this.nodes.get(edge.targetNodeId);
          if (target) {
            affected.push({
              entityId: target.entityId,
              entityType: target.entityType,
              label: target.label,
              impactDescription: `Afectado via ${edge.relationType}`,
              severity: currentDepth === 1 ? "high" : currentDepth === 2 ? "medium" : "low",
              depth: currentDepth,
            });
            collect(edge.targetNodeId, currentDepth + 1);
          }
        }
      }
      // Also follow incoming "depends_on" edges (reverse dependency)
      for (const edge of this.getEdgesTo(currentId)) {
        if (!visited.has(edge.sourceNodeId) && edge.relationType === "depends_on") {
          visited.add(edge.sourceNodeId);
          const source = this.nodes.get(edge.sourceNodeId);
          if (source) {
            affected.push({
              entityId: source.entityId,
              entityType: source.entityType,
              label: source.label,
              impactDescription: `Depende de ${sourceNode.label}`,
              severity: currentDepth === 1 ? "high" : "medium",
              depth: currentDepth,
            });
            collect(edge.sourceNodeId, currentDepth + 1);
          }
        }
      }
    };

    collect(nodeId, 1);

    const severity = affected.some(a => a.severity === "high") ? "high"
      : affected.some(a => a.severity === "medium") ? "medium"
      : affected.length > 0 ? "low"
      : "info";

    return buildImpact({
      sourceEntityId: sourceNode.entityId,
      sourceEntityType: sourceNode.entityType,
      sourceLabel: sourceNode.label,
      impactType: "operational_degradation",
      severity,
      affectedEntities: affected,
      confidence: 70,
      explanation: affected.length > 0
        ? `${sourceNode.label} impacta ${affected.length} entidad(es) en ${depth} niveles de profundidad`
        : `${sourceNode.label} no tiene entidades afectadas detectadas`,
    });
  }

  // -- Context --

  buildContext(nodeId: string): KnowledgeContext {
    const entity = this.nodes.get(nodeId);
    if (!entity) {
      // Return minimal context for unknown node
      const placeholder: KnowledgeNode = {
        nodeId,
        organizationId: "",
        entityId: "",
        entityType: "product",
        label: "Desconocido",
        description: null,
        health: "unknown",
        severity: "info",
        active: false,
        tags: [],
        freshness: "unknown",
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return buildContext({ entity: placeholder });
    }

    const neighbors = this.getNeighbors(nodeId, "both");
    const outEdges = this.getEdgesFrom(nodeId);
    const inEdges = this.getEdgesTo(nodeId);
    const allEdges = [...outEdges, ...inEdges];
    const importantRelations = allEdges.filter(e => e.weight >= 50 && e.confidence >= 50);
    const impact = this.analyzeImpact(nodeId, 2);

    const facts = [
      { key: "neighbors", statement: `${neighbors.length} entidades relacionadas`, source: "knowledge-graph", confidence: 100 },
      { key: "edges", statement: `${allEdges.length} relaciones`, source: "knowledge-graph", confidence: 100 },
    ];

    const risks = impact.affectedEntities
      .filter(a => a.severity === "high")
      .map(a => `${a.label}: ${a.impactDescription}`);

    return buildContext({
      entity,
      relatedEntities: neighbors,
      importantRelations,
      impacts: impact.affectedEntities.length > 0 ? [impact] : [],
      facts,
      risks,
      freshness: entity.freshness,
      suggestedQuestions: [
        `Que entidades dependen de ${entity.label}?`,
        `Que impacto tiene un cambio en ${entity.label}?`,
        `Que acciones se recomiendan para ${entity.label}?`,
      ],
    });
  }

  // -- Snapshot --

  snapshot(organizationId: string): KnowledgeGraphSnapshot {
    const orgNodes = [...this.nodes.values()].filter(n => n.organizationId === organizationId);
    const orgNodeIds = new Set(orgNodes.map(n => n.nodeId));
    const orgEdges = [...this.edges.values()].filter(
      e => orgNodeIds.has(e.sourceNodeId) || orgNodeIds.has(e.targetNodeId),
    );

    return {
      nodes: orgNodes,
      edges: orgEdges,
      capturedAt: new Date().toISOString(),
      nodeCount: orgNodes.length,
      edgeCount: orgEdges.length,
      organizationId,
    };
  }

  // -- Stats --

  nodeCount(): number {
    return this.nodes.size;
  }

  edgeCount(): number {
    return this.edges.size;
  }

  // -- Private helpers --

  private findNodeByEntityId(entityId: string, organizationId?: string): KnowledgeNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.entityId === entityId) {
        if (!organizationId || node.organizationId === organizationId) {
          return node;
        }
      }
    }
    return undefined;
  }

  private matchesNodeFilter(node: KnowledgeNode, q: KnowledgeQuery): boolean {
    if (q.organizationId && node.organizationId !== q.organizationId) return false;
    if (q.entityType && node.entityType !== q.entityType) return false;
    if (q.tags && q.tags.length > 0 && !q.tags.some(t => node.tags.includes(t))) return false;
    if (!q.includeInactive && !node.active) return false;
    return true;
  }

  private traverse(
    nodeId: string,
    remainingDepth: number,
    q: KnowledgeQuery,
    visited: Set<string>,
    resultNodes: KnowledgeNode[],
    resultEdges: KnowledgeEdge[],
  ): void {
    visited.add(nodeId);
    const node = this.nodes.get(nodeId);
    if (node && !resultNodes.some(n => n.nodeId === nodeId)) {
      resultNodes.push(node);
    }

    if (remainingDepth <= 0) return;

    const direction = q.direction ?? "both";
    const edges: KnowledgeEdge[] = [];

    if (direction === "outgoing" || direction === "both") {
      edges.push(...this.getEdgesFrom(nodeId));
    }
    if (direction === "incoming" || direction === "both") {
      edges.push(...this.getEdgesTo(nodeId));
    }

    for (const edge of edges) {
      // Apply edge filters
      if (q.relationType && edge.relationType !== q.relationType) continue;
      if (!q.includeWeakRelations && edge.weight < 30) continue;
      if (q.minConfidence && edge.confidence < q.minConfidence) continue;

      resultEdges.push(edge);

      const nextId = edge.sourceNodeId === nodeId ? edge.targetNodeId : edge.sourceNodeId;
      if (!visited.has(nextId)) {
        this.traverse(nextId, remainingDepth - 1, q, visited, resultNodes, resultEdges);
      }
    }
  }
}
